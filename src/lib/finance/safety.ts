import { monthlyPayment } from "./amortization";
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
 */
export function calcSafetyScore(
  profile: BuyerProfile,
  rules: Rules,
  loanAmount: number,
): SafetyScore {
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
