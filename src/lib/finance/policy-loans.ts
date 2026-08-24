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

  // 주택 수 축. 상품마다 받아 주는 최대 보유 주택 수가 다르다 —
  // 디딤돌은 0채(세대원 전원 무주택), 보금자리론은 본건 담보주택을 뺀
  // 0~1채다. 예전에는 `requiresNoHome` 불리언 하나뿐이라 그 차이를
  // 표현할 수 없었고, 1주택자를 두 상품 모두 자격 없음으로 봤다.
  //
  // `profile.status`(갈아타기 여부)는 여기서 보지 않는다. 파는지 마는지는
  // 가용 현금의 문제이지 자격의 문제가 아니다 — 자격을 가르는 것은
  // 지금 몇 채를 갖고 있는가뿐이다.
  if (
    e.maxOwnedHomes !== undefined &&
    profile.ownedHomeCount > e.maxOwnedHomes
  ) {
    return false;
  }
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
