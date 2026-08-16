import { maxPrincipal } from "./amortization";
import { assertValidProfile } from "./profile";
import type { BindingConstraint, BuyerProfile, LoanLimit, Rules } from "./types";

/** 은행 주담대에 동시에 걸리는 제약. 이 셋의 최소값이 은행 경로의 한도다 */
const BANK_CONSTRAINTS = ["LTV", "DSR", "CAP"] as const;

/** 자격이 되는 정책대출이 없을 때의 POLICY 값. "선택지 없음"을 뜻한다 */
export const NO_POLICY_LIMIT = 0;

/**
 * 주어진 매매가에 대해 받을 수 있는 최대 대출액을 구한다.
 *
 * 은행 경로의 한도는 LTV · DSR · 지역 절대캡을 동시에 만족해야 하므로
 * 셋 중 최소값이다. 반면 정책대출은 구매자가 "택할 수 있는" 선택지이지
 * 반드시 따라야 하는 상한이 아니다. 따라서
 *
 *     한도 = max( min(LTV, DSR, CAP), 정책대출 한도 )
 *
 * 가 된다. 정책대출을 최소값에 함께 넣으면 자격이 있다는 이유만으로
 * 한도가 오히려 줄어든다 — 무주택·연소득 7천만 구매자가 동일 조건의
 * 갈아타기 구매자보다 4,200만원 덜 빌릴 수 있다고 답하던 결함이다.
 *
 * @param policyLimit 정책대출 한도(원). 자격 상품이 없으면 NO_POLICY_LIMIT(0).
 */
export function calcMaxLoan(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
  policyLimit: number = NO_POLICY_LIMIT,
): LoanLimit {
  assertValidProfile(profile);

  const breakdown: Record<BindingConstraint, number> = {
    LTV: Math.floor(calcLtvLimit(profile, rules, price)),
    DSR: Math.floor(calcDsrLimit(profile, rules)),
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

function calcDsrLimit(profile: BuyerProfile, rules: Rules): number {
  const allowedAnnualPayment = profile.annualIncome * rules.dsrLimit;
  const availableAnnualPayment =
    allowedAnnualPayment - profile.existingDebtAnnualPayment;
  if (availableAnnualPayment <= 0) return 0;

  const stressedRate = rules.baseRate + rules.stressDSR.surcharge;
  return maxPrincipal(
    availableAnnualPayment / 12,
    stressedRate,
    rules.loanTermMonths,
  );
}
