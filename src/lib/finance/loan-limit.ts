import { maxPrincipal } from "./amortization";
import { assertValidProfile } from "./profile";
import type { BindingConstraint, BuyerProfile, LoanLimit, Rules } from "./types";

/**
 * 주어진 매매가에 대해 받을 수 있는 최대 대출액을 구한다.
 * LTV · DSR · 지역 절대캡 · 정책대출 한도 중 가장 작은 값이 실제 한도가 되며,
 * 어느 제약에 걸렸는지를 함께 반환한다.
 *
 * @param policyLimit 정책대출 한도(원). 해당 없으면 생략한다.
 */
export function calcMaxLoan(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
  policyLimit = Number.POSITIVE_INFINITY,
): LoanLimit {
  assertValidProfile(profile);

  const breakdown: Record<BindingConstraint, number> = {
    LTV: Math.floor(calcLtvLimit(profile, rules, price)),
    DSR: Math.floor(calcDsrLimit(profile, rules)),
    CAP: Math.floor(rules.absoluteCap),
    POLICY: Math.floor(policyLimit),
  };

  // NaN은 어떤 비교에도 false를 돌려주므로 아래 최소값 스캔에서 조용히
  // 건너뛰어진다 = 제약이 사라진다. 답을 내지 말고 여기서 끊는다.
  assertNoNaN(breakdown);

  let binding: BindingConstraint = "LTV";
  for (const key of ["LTV", "DSR", "CAP", "POLICY"] as const) {
    if (breakdown[key] < breakdown[binding]) binding = key;
  }

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
