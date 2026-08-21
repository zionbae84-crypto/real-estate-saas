import { monthlyPayment } from "./amortization";
import { assertValidProfile } from "./profile";
import type { BuyerProfile, Rules, SafetyLevel, SafetyScore } from "./types";

/**
 * 해당 대출액에서의 상환 부담을 평가한다.
 * 기본 금리와 스트레스 금리(+2%p) 두 시나리오를 모두 계산하며,
 * 기본 시나리오가 양호해도 스트레스에서 무너지면 danger로 내린다.
 *
 * 매매가는 인자가 아니다. 부담률은 상환액과 소득만으로 결정되고 매매가는
 * 대출액을 통해서만 영향을 주므로, 매매가를 받아도 결과가 달라지지 않는다
 * (예전 시그니처는 price를 첫 인자로 받고 읽지 않았는데, 마지막 인자인
 * loanAmount만 결과를 좌우해 자리 바꿔치기 사고를 부르는 모양이었다).
 *
 * 분모는 세전 월 소득이다 — SafetyScore.burdenRatio 문서 참고.
 *
 * 이 함수는 index.ts가 직접 export하는 공개 진입점이라 calcAffordablePrice를
 * 거치지 않고도 호출될 수 있다(예: "이 매물을 이 구매자 기준으로 채점"하는
 * UI 경로). assertValidProfile을 스스로 호출하지 않으면 유효하지 않은
 * 프로필(NaN 등)이 burdenRatio를 NaN으로 만들고, level은 danger로
 * 떨어져 안전하지 않은 방향은 아니지만 NaN이 정렬 키(design §8:
 * 상환부담률 오름차순)로 쓰이면 추천 목록이 조용히 뒤섞인다.
 */
export function calcSafetyScore(
  profile: BuyerProfile,
  rules: Rules,
  loanAmount: number,
): SafetyScore {
  assertValidProfile(profile);
  if (!Number.isFinite(loanAmount) || loanAmount < 0) {
    // amortization.ts의 monthlyPayment/maxPrincipal과 동일한 기준(0 이상의
    // 유한수)이다. 조용히 0으로 만들면 호출자의 계산 오류가 그대로 묻힌다.
    throw new RangeError(`loanAmount는 0 이상의 유한수여야 합니다: ${loanAmount}`);
  }

  const monthlyIncome = profile.annualIncome / 12;
  const existingMonthly = profile.existingDebtAnnualPayment / 12;

  const payment =
    monthlyPayment(loanAmount, rules.baseRate, rules.loanTermMonths) +
    existingMonthly;

  const stressedPayment =
    monthlyPayment(
      loanAmount,
      rules.baseRate + rules.safetyStressSurcharge,
      rules.loanTermMonths,
    ) + existingMonthly;

  const burdenRatio = ratio(payment, monthlyIncome);
  const stressedBurdenRatio = ratio(stressedPayment, monthlyIncome);

  return {
    monthlyPayment: Math.round(payment),
    burdenRatio,
    stressedMonthlyPayment: Math.round(stressedPayment),
    stressedBurdenRatio,
    level: gradeLevel(burdenRatio, stressedBurdenRatio, rules),
  };
}

function ratio(payment: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return Number.POSITIVE_INFINITY;
  return payment / monthlyIncome;
}

function gradeLevel(
  burdenRatio: number,
  stressedBurdenRatio: number,
  rules: Rules,
): SafetyLevel {
  const t = rules.safetyThreshold;
  if (stressedBurdenRatio > t.stressedDanger) return "danger";
  if (burdenRatio < t.safe) return "safe";
  if (burdenRatio <= t.caution) return "caution";
  return "danger";
}
