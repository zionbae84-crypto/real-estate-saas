import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import type { BuyerProfile, CostBreakdown, LoanLimit, Rules } from "./types";

export interface AffordableResult {
  /** 실구매 가능 최대 매매가(원). 10만원 단위로 내림 */
  affordablePrice: number;
  /** 그 가격에서의 대출 한도와 걸린 제약 */
  loanLimit: LoanLimit;
  /** 그 가격에서의 취득 부대비용 */
  costs: CostBreakdown;
  /** 계산에 사용된 가용현금(원) */
  availableCash: number;
  warnings: string[];
}

/** 탐색 상한. 수도권 주거용 상한으로 충분한 값 */
const SEARCH_UPPER_BOUND = 10_000_000_000;
/** 결과를 내림할 단위 */
const PRICE_STEP = 100_000;

/**
 * 가용현금으로 감당 가능한 최대 매매가를 구한다.
 *
 * 대출한도는 매매가에 의존하고(LTV) 매매가는 대출한도에 의존하는 순환 참조라
 * 닫힌 식으로 풀 수 없다. 자기부담금이 매매가에 대해 단조 증가한다는 성질을
 * 이용해 이분 탐색으로 수렴시킨다.
 */
export function calcAffordablePrice(
  profile: BuyerProfile,
  rules: Rules,
): AffordableResult {
  const cash = calcAvailableCash(profile);

  let low = 0;
  let high = SEARCH_UPPER_BOUND;

  // 50회면 100억 범위를 0.01원 미만까지 좁힌다
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (ownFundsRequired(mid, profile, rules) <= cash.amount) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const affordablePrice = Math.floor(low / PRICE_STEP) * PRICE_STEP;

  return {
    affordablePrice,
    loanLimit: loanAt(affordablePrice, profile, rules),
    costs: calcAcquisitionCosts(affordablePrice, profile, rules),
    availableCash: cash.amount,
    warnings: cash.warnings,
  };
}

/** 해당 매매가에서 사용자가 현금으로 내야 하는 총액 */
function ownFundsRequired(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const loan = loanAt(price, profile, rules);
  const costs = calcAcquisitionCosts(price, profile, rules);
  return price - loan.amount + costs.total;
}

function loanAt(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): LoanLimit {
  const policyLimit = policyLimitAt(price, profile, rules);
  return calcMaxLoan(profile, rules, price, policyLimit);
}

/**
 * 자격이 되는 정책대출 중 가장 큰 한도.
 * 자격 상품이 없으면 제약이 없는 것이므로 무한대를 반환한다.
 */
function policyLimitAt(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const matched = matchPolicyLoans(profile, rules, price);
  if (matched.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...matched.map((loan) => loan.maxAmount));
}
