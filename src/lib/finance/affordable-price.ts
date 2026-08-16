import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import { assertValidProfile } from "./profile";
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
/** price = 0에서도 부과되는 법무비 + 이사비만으로 예산을 초과할 때의 경고 */
const INSUFFICIENT_CASH_WARNING =
  "고정 부대비용(법무비·이사비)만으로도 보유 현금을 초과합니다.";

/**
 * 가용현금으로 감당 가능한 최대 매매가를 구한다.
 *
 * 대출한도는 매매가에 의존하고(LTV) 매매가는 대출한도에 의존하는 순환 참조라
 * 닫힌 식으로 풀 수 없다. 자기부담금 f(price) = price − 대출한도 + 취득부대비용은
 * 매매가에 대해 대체로 증가하므로 이분 탐색으로 수렴시킨다.
 *
 * 다만 정책대출은 eligibility.maxHousePrice를 "상한"으로 취급하므로,
 * 매매가가 그 상한을 넘는 순간 정책대출 자격을 잃어 대출한도가 오히려
 * "상승"하고 자기부담금은 "하락"한다 — f는 그 지점에서 불연속적으로
 * 꺾이며 전체 구간에서 단조 증가하지 않는다. 정책대출 상품 집합이 바뀌지
 * 않는 구간(=절벽 사이) 안에서는 단조성이 성립하므로, 절벽을 기준으로
 * 탐색 구간을 나누어 각각 이분 탐색하고 가장 유리한 결과를 취한다.
 */
export function calcAffordablePrice(
  profile: BuyerProfile,
  rules: Rules,
): AffordableResult {
  assertValidProfile(profile);

  const cash = calcAvailableCash(profile);

  if (ownFundsRequired(0, profile, rules) > cash.amount) {
    return {
      affordablePrice: 0,
      loanLimit: loanAt(0, profile, rules),
      costs: calcAcquisitionCosts(0, profile, rules),
      availableCash: cash.amount,
      warnings: [...cash.warnings, INSUFFICIENT_CASH_WARNING],
    };
  }

  let affordablePrice = 0;
  for (const segment of buildSearchSegments(rules)) {
    const candidate = searchSegment(segment, profile, rules, cash.amount);
    if (candidate !== null && candidate > affordablePrice) {
      affordablePrice = candidate;
    }
  }

  return {
    affordablePrice,
    loanLimit: loanAt(affordablePrice, profile, rules),
    costs: calcAcquisitionCosts(affordablePrice, profile, rules),
    availableCash: cash.amount,
    warnings: cash.warnings,
  };
}

interface SearchSegment {
  low: number;
  high: number;
}

/**
 * 정책대출 절벽(maxHousePrice)을 기준으로 [0, SEARCH_UPPER_BOUND]를 나눈다.
 * price > maxHousePrice일 때 자격을 잃으므로 경계값 자체는 하위 구간에 속한다.
 * 룰셋에서 도출하며, 값을 직접 하드코딩하지 않는다.
 */
function buildSearchSegments(rules: Rules): SearchSegment[] {
  const boundaries = Array.from(
    new Set(
      rules.policyLoans
        .map((loan) => loan.eligibility.maxHousePrice)
        .filter((v): v is number => v !== undefined && v > 0),
    ),
  ).sort((a, b) => a - b);

  const segments: SearchSegment[] = [];
  let low = 0;
  for (const boundary of boundaries) {
    if (low > SEARCH_UPPER_BOUND) break;
    segments.push({ low, high: Math.min(boundary, SEARCH_UPPER_BOUND) });
    low = boundary + 1;
  }
  if (low <= SEARCH_UPPER_BOUND) {
    segments.push({ low, high: SEARCH_UPPER_BOUND });
  }
  return segments;
}

/**
 * 한 구간(f가 단조 증가한다고 가정할 수 있는 범위) 안에서 감당 가능한
 * 최대가를 이분 탐색으로 찾는다. 구간 하한부터 이미 예산을 넘으면 이
 * 구간에는 후보가 없다. 찾은 값은 PRICE_STEP으로 내림한 뒤, 가정에
 * 기대지 않고 실제 가격에서 다시 정직하게 재계산해 감당 가능함을
 * 검증한 경우에만 후보로 인정한다.
 */
function searchSegment(
  segment: SearchSegment,
  profile: BuyerProfile,
  rules: Rules,
  cashAmount: number,
): number | null {
  const { low: segLow, high: segHigh } = segment;
  if (segLow > segHigh) return null;
  if (ownFundsRequired(segLow, profile, rules) > cashAmount) return null;

  let low = segLow;
  let high = segHigh;

  // 50회면 100억 범위를 0.01원 미만까지 좁힌다
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (ownFundsRequired(mid, profile, rules) <= cashAmount) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const candidate = Math.floor(low / PRICE_STEP) * PRICE_STEP;
  if (candidate < 0) return null;

  // 구간 가정에 기대지 않고, 실제 가격에서 정직하게 재계산해 검증한다.
  if (ownFundsRequired(candidate, profile, rules) > cashAmount) return null;

  return candidate;
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
