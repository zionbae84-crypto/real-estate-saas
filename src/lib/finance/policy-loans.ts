import type { BuyerProfile, PolicyLoanRule, Rules } from "./types";

/**
 * 프로필과 매매가를 기준으로 자격이 되는 정책대출 상품을 모두 반환한다.
 * 자격 조건은 룰셋의 eligibility 키를 일반적으로 평가하므로,
 * 새 상품 추가는 룰셋 파일 수정만으로 끝난다.
 */
export function matchPolicyLoans(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): PolicyLoanRule[] {
  return rules.policyLoans.filter((loan) =>
    isEligible(loan, profile, price),
  );
}

function isEligible(
  loan: PolicyLoanRule,
  profile: BuyerProfile,
  price: number,
): boolean {
  const e = loan.eligibility;

  if (e.requiresNoHome === true && profile.status !== "무주택") return false;
  if (e.requiresFirstTimeBuyer === true && !profile.isFirstTimeBuyer) {
    return false;
  }
  if (e.maxAnnualIncome !== undefined && profile.annualIncome > e.maxAnnualIncome) {
    return false;
  }
  if (e.maxHousePrice !== undefined && price > e.maxHousePrice) return false;
  if (e.maxAreaSqm !== undefined && profile.exclusiveAreaSqm > e.maxAreaSqm) {
    return false;
  }

  return true;
}
