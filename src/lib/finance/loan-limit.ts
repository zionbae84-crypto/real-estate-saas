import { maxPrincipal } from "./amortization";
import { matchPolicyLoans } from "./policy-loans";
import { assertValidProfile } from "./profile";
import type { BindingConstraint, BuyerProfile, LoanLimit, Rules } from "./types";

/** 은행 주담대에 동시에 걸리는 제약. 이 셋의 최소값이 은행 경로의 한도다 */
const BANK_CONSTRAINTS = ["LTV", "DSR", "CAP"] as const;

/** 자격이 되는 정책대출이 없을 때의 POLICY 값. "선택지 없음"을 뜻한다 */
export const NO_POLICY_LIMIT = 0;

/**
 * 이 매매가에서 택할 수 있는 정책대출 중 가장 유리한 한도.
 * 자격 상품이 없으면 NO_POLICY_LIMIT(0) — 정책대출이라는 선택지가 없다.
 *
 * **정책대출도 상환능력(DSR)과 담보가치(LTV)의 제약을 받는다.** 정책대출은
 * 은행 심사를 면제받는 제도가 아니라 더 낮은 금리를 주는 제도다. 상품
 * 고시 한도(maxAmount)를 그대로 쓰면 연소득 0원인 구매자에게 3.6억을
 * 빌려줄 수 있다고 답하게 된다 — 이 제품이 막으려는 바로 그 방향의 오답이다.
 *
 * 그래서 상품별로 min(maxAmount, LTV한도, DSR한도@상품금리)를 구하고 그중
 * 최대를 택한다. DSR을 **상품 금리로** 계산하는 것이 핵심이다: 정책대출의
 * 실질 혜택은 낮은 금리이고(디딤돌 3.2% vs 시중 4.2%), 같은 원금에 대해
 * 월 상환액이 작아지므로 상환능력 기준 한도가 정당하게 더 크게 나온다.
 * 상품별로 먼저 제약을 건 뒤 최대를 취한다 — 한도가 큰 상품과 금리가 낮은
 * 상품이 다를 수 있으므로, maxAmount만으로 먼저 고르면 틀린다.
 *
 * 정책대출 경로에는 absoluteCap을 걸지 않는다. 그 상한은 수도권 주담대에
 * 대한 규제이고, 상품 고시 한도는 이미 그보다 한참 아래에 있다.
 *
 * 정책대출 자격은 매매가에 의존하므로(주택가격 상한) 가격 없이는 구할 수
 * 없다. calcMaxLoan이 직접 호출하므로 호출자가 따로 신경 쓸 필요는 없다.
 */
export function calcPolicyLimit(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): number {
  const matched = matchPolicyLoans(profile, rules, price);
  if (matched.length === 0) return NO_POLICY_LIMIT;

  const ltvLimit = calcLtvLimit(profile, rules, price);
  let best = NO_POLICY_LIMIT;
  for (const loan of matched) {
    // 스트레스 가산금리는 은행 경로가 baseRate에 얹는 것과 동일하게
    // 상품 금리에도 얹는다. 두 경로가 같은 보수성 기준을 쓰도록 맞춘
    // 의도적 결정이다(정책대출을 스트레스 DSR에서 빼려면 룰셋에 그
    // 예외를 데이터로 명시해야 한다 — 코드가 임의로 봐주지 않는다).
    const dsrLimit = calcDsrLimit(
      profile,
      rules,
      loan.rate + rules.stressDSR.surcharge,
    );
    const limit = Math.min(loan.maxAmount, ltvLimit, dsrLimit);
    if (limit > best) best = limit;
  }
  // 공개 API가 돌려주는 금액은 원 단위 정수다. DSR 한도가 실수이므로
  // 여기서 내림하지 않으면 calcMaxLoan의 breakdown과 값이 어긋난다.
  return Math.floor(best);
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
export function calcMaxLoan(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): LoanLimit {
  assertValidProfile(profile);
  const policyLimit = calcPolicyLimit(profile, rules, price);

  const breakdown: Record<BindingConstraint, number> = {
    LTV: Math.floor(calcLtvLimit(profile, rules, price)),
    DSR: Math.floor(
      calcDsrLimit(profile, rules, rules.baseRate + rules.stressDSR.surcharge),
    ),
    CAP: Math.floor(rules.absoluteCap),
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
  const rate = profile.isFirstTimeBuyer
    ? rules.ltv.firstTimeBuyer
    : rules.ltv.default;
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
