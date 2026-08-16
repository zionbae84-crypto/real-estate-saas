import { monthlyPayment } from "./amortization";
import type { BuyerProfile, Rules, SafetyLevel, SafetyScore } from "./types";

/**
 * 해당 매매가와 대출액에서의 상환 부담을 평가한다.
 * 기본 금리와 스트레스 금리(+2%p) 두 시나리오를 모두 계산하며,
 * 기본 시나리오가 양호해도 스트레스에서 무너지면 danger로 내린다.
 */
export function calcSafetyScore(
  price: number,
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
