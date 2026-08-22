import { maxPrincipal } from "./amortization";
import { matchPolicyLoans } from "./policy-loans";
import { assertNonNegativeFinite, assertValidProfile } from "./profile";
import type {
  BindingConstraint,
  BuyerProfile,
  LoanLimit,
  PolicyLoanRule,
  Rules,
} from "./types";

/** 은행 주담대에 동시에 걸리는 제약. 이 셋의 최소값이 은행 경로의 한도다 */
const BANK_CONSTRAINTS = ["LTV", "DSR", "CAP"] as const;

/** 자격이 되는 정책대출이 없을 때의 POLICY 값. "선택지 없음"을 뜻한다 */
export const NO_POLICY_LIMIT = 0;

/**
 * 자격이 되는 정책대출 상품 하나와, 그 상품을 택했을 때 **실제로 받을 수
 * 있는** 한도(원, 정수).
 *
 * `loan.maxAmount`는 상품의 고시 한도일 뿐 이 구매자가 받는 금액이 아니다.
 * `availableAmount`가 실제로 받을 수 있는 금액이며, 상환능력(DSR)과
 * 담보가치(LTV)까지 반영한 뒤의 값이다. 연소득 0원인 구매자에게도
 * `loan.maxAmount`는 상품 고시액 그대로 찍히지만 `availableAmount`는 0이다.
 */
export interface MatchedPolicyLoan {
  loan: PolicyLoanRule;
  availableAmount: number;
}

/**
 * 자격이 되는 정책대출 상품별로 실제로 받을 수 있는 한도를 구한다.
 * calcPolicyLimit과 UI 노출용 목록(affordable-price.ts의 matchedPolicyLoans)이
 * 같은 계산을 공유하도록 이 함수 하나로 모은다 — 공식을 두 곳에 복제하면
 * 한쪽만 고치는 사고가 난다.
 *
 * **정책대출도 상환능력(DSR)과 담보가치(LTV)의 제약을 받는다.** 정책대출은
 * 은행 심사를 면제받는 제도가 아니라 더 낮은 금리를 주는 제도다. 상품
 * 고시 한도(maxAmount)를 그대로 쓰면 연소득 0원인 구매자에게 3.6억을
 * 빌려줄 수 있다고 답하게 된다 — 이 제품이 막으려는 바로 그 방향의 오답이다.
 *
 * 그래서 상품별로 min(maxAmount, LTV한도, DSR한도@상품금리)를 구한다.
 * DSR을 **상품 금리로** 계산하는 것이 핵심이다: 정책대출의 실질 혜택은
 * 낮은 금리이고(디딤돌 3.2% vs 시중 4.2%), 같은 원금에 대해 월 상환액이
 * 작아지므로 상환능력 기준 한도가 정당하게 더 크게 나온다.
 */
export function calcPolicyLoanAvailability(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): MatchedPolicyLoan[] {
  const matched = matchPolicyLoans(profile, rules, price);
  const ltvLimit = calcLtvLimit(profile, rules, price);

  return matched.map((loan) => {
    // 스트레스 가산금리는 은행 경로가 baseRate에 얹는 것과 동일하게
    // 상품 금리에도 얹는다. 두 경로가 같은 보수성 기준을 쓰도록 맞춘
    // 의도적 결정이다(정책대출을 스트레스 DSR에서 빼려면 룰셋에 그
    // 예외를 데이터로 명시해야 한다 — 코드가 임의로 봐주지 않는다).
    const dsrLimit = calcDsrLimit(
      profile,
      rules,
      loan.rate + rules.stressDSR.surcharge,
    );
    // 공개 API가 돌려주는 금액은 원 단위 정수다.
    const availableAmount = Math.floor(
      Math.min(loan.maxAmount, ltvLimit, dsrLimit),
    );
    return { loan, availableAmount };
  });
}

/**
 * 이 매매가에서 택할 수 있는 정책대출 중 가장 유리한 한도.
 * 자격 상품이 없으면 NO_POLICY_LIMIT(0) — 정책대출이라는 선택지가 없다.
 *
 * 상품별로 먼저 제약을 건 뒤 최대를 취한다(calcPolicyLoanAvailability) —
 * 한도가 큰 상품과 금리가 낮은 상품이 다를 수 있으므로, maxAmount만으로
 * 먼저 고르면 틀린다.
 *
 * 정책대출 경로에는 absoluteCap을 걸지 않는다. 그 상한은 수도권 주담대에
 * 대한 규제이고, 상품 고시 한도는 이미 그보다 한참 아래에 있다(rules.ts의
 * `policyLoans[i].maxAmount <= absoluteCap` 불변식이 이를 데이터 단에서
 * 보장한다).
 *
 * 정책대출 자격은 매매가에 의존하므로(주택가격 상한) 가격 없이는 구할 수
 * 없다. calcMaxLoan이 직접 호출하므로 호출자가 따로 신경 쓸 필요는 없다.
 */
export function calcPolicyLimit(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): number {
  assertNonNegativeFinite(price, "price");
  const entries = calcPolicyLoanAvailability(profile, rules, price);

  let best = NO_POLICY_LIMIT;
  for (const { availableAmount } of entries) {
    if (availableAmount > best) best = availableAmount;
  }
  return best;
}

/**
 * 주어진 매매가에 대해 받을 수 있는 최대 대출액을 구한다.
 *
 * 은행 경로의 한도는 LTV · DSR · 지역 절대캡을 동시에 만족해야 하므로
 * 셋 중 최소값이다. 반면 정책대출은 구매자가 "택할 수 있는" 선택지이지
 * 반드시 따라야 하는 상한이 아니다. 따라서
 *
 *     은행 한도 = min(LTV한도, DSR한도@시중금리, 절대캡)
 *     정책 한도 = max over 자격상품 of
 *                   min(상품한도, LTV한도, DSR한도@상품금리)
 *     한도      = max(은행 한도, 정책 한도)
 *
 * 가 된다. 정책대출을 최소값에 함께 넣으면 자격이 있다는 이유만으로
 * 한도가 오히려 줄어든다 — 무주택·연소득 7천만 구매자가 동일 조건의
 * 갈아타기 구매자보다 4,200만원 덜 빌릴 수 있다고 답하던 결함이다.
 * 반대로 정책 경로에서 LTV·DSR을 빼면 연소득 0원 구매자에게 3.6억을
 * 제시하게 된다 — 정책대출은 심사 면제가 아니라 금리 우대다.
 *
 * 정책대출 한도는 이 함수가 직접 도출한다. 예전에는 호출자가 넘기는
 * 선택적 인자였는데, 그 값을 구하는 함수가 공개되어 있지도 않아서
 * "이 매물을 이 구매자 기준으로 채점" 같은 자연스러운 호출이 엔진 내부
 * 계산과 다른 답(🟡 vs 🔴)을 내놓았다. 빠뜨릴 수 있는 인자를 없애는
 * 편이 옳은 호출을 쉬운 호출로 만든다.
 */
/**
 * 주택가격에 해당하는 주담대 절대 상한(원).
 *
 * ⚠ **`upTo`는 포함(이하)이다.** 규제 원문이 "15억 원 이하 → 6억"으로
 * 쓰기 때문이다. 이 저장소의 다른 구간 조회(`acquisition-cost.ts`의
 * 취득세·채권 구간)는 전부 배타(`price < upTo`)이므로 여기만 다르다.
 * 배타로 통일하고 싶어지더라도 그러지 말 것 — 가격이 정확히 15억일 때
 * 한도를 6억이 아닌 4억으로 계산하게 되고, 15억은 실제로 나오는 호가다.
 *
 * 이 규칙은 여기 한 곳에만 있다. 룰셋 검증(`rules.ts`)도 이 함수를
 * import해서 쓴다 — 복제하면 검증과 계산이 조용히 어긋난다.
 */
export function calcAbsoluteCap(rules: Rules, price: number): number {
  for (const bracket of rules.absoluteCap.brackets) {
    if (bracket.upTo === null || price <= bracket.upTo) return bracket.amount;
  }
  // parseRules가 마지막 구간의 upTo === null을 강제하므로 여기 도달하지
  // 않는다. 그래도 조용히 undefined를 흘리지 않도록 끊는다.
  throw new Error("룰셋 값 오류: absoluteCap.brackets의 마지막 upTo가 null이 아닙니다");
}

export function calcMaxLoan(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): LoanLimit {
  assertValidProfile(profile);
  assertNonNegativeFinite(price, "price");
  const policyLimit = calcPolicyLimit(profile, rules, price);

  const breakdown: Record<BindingConstraint, number> = {
    LTV: Math.floor(calcLtvLimit(profile, rules, price)),
    DSR: Math.floor(
      calcDsrLimit(profile, rules, rules.baseRate + rules.stressDSR.surcharge),
    ),
    CAP: Math.floor(calcAbsoluteCap(rules, price)),
    POLICY: Math.floor(policyLimit),
  };

  // NaN은 어떤 비교에도 false를 돌려주므로 아래 스캔에서 조용히
  // 건너뛰어진다 = 제약이 사라진다. 답을 내지 말고 여기서 끊는다.
  assertNoNaN(breakdown);

  let binding: BindingConstraint = "LTV";
  for (const key of BANK_CONSTRAINTS) {
    if (breakdown[key] < breakdown[binding]) binding = key;
  }
  // 정책대출을 택하는 편이 더 많이 빌릴 수 있다면 그쪽이 이 구매자의 최대치다
  if (breakdown.POLICY > breakdown[binding]) binding = "POLICY";

  return {
    amount: breakdown[binding],
    binding,
    breakdown,
  };
}

/** breakdown 어느 하나라도 NaN이면 그 제약이 무력화된 것이므로 계산을 중단한다 */
function assertNoNaN(breakdown: Record<BindingConstraint, number>): void {
  for (const [key, value] of Object.entries(breakdown)) {
    if (Number.isNaN(value)) {
      throw new RangeError(
        `대출 한도 계산에서 NaN이 발생했습니다: ${key}. 프로필 또는 룰셋 값을 확인하세요.`,
      );
    }
  }
}

function calcLtvLimit(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): number {
  // 규제지역 무주택자는 40%, 비규제 수도권은 70%. 생애최초는 양쪽 모두
  // 70%라, 규제지역에서만 생애최초 우대가 실제 의미를 갖는다.
  const table = profile.isRegulatedArea
    ? rules.ltv.regulated
    : rules.ltv.unregulated;
  const rate = profile.isFirstTimeBuyer ? table.firstTimeBuyer : table.default;
  return price * rate;
}

/**
 * 상환능력 기준 한도. 금리를 인자로 받는 이유는 은행 경로와 정책대출
 * 경로가 서로 다른 금리로 심사되기 때문이다. `stressedRate`는 이미 스트레스
 * 가산금리가 더해진 값이어야 한다(호출자가 더해서 넘긴다).
 */
function calcDsrLimit(
  profile: BuyerProfile,
  rules: Rules,
  stressedRate: number,
): number {
  const allowedAnnualPayment = profile.annualIncome * rules.dsrLimit;
  const availableAnnualPayment =
    allowedAnnualPayment - profile.existingDebtAnnualPayment;
  if (availableAnnualPayment <= 0) return 0;

  return maxPrincipal(
    availableAnnualPayment / 12,
    stressedRate,
    rules.loanTermMonths,
  );
}
