import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import { assertValidProfile } from "./profile";
import type {
  BuyerProfile,
  CostBreakdown,
  LoanLimit,
  PolicyLoanRule,
  Rules,
} from "./types";

export interface AffordableResult {
  /** 실구매 가능 최대 매매가(원). PRICE_STEP 단위로 내림 */
  affordablePrice: number;
  /** 그 가격에서의 대출 한도와 걸린 제약 */
  loanLimit: LoanLimit;
  /** 그 가격에서의 취득 부대비용 */
  costs: CostBreakdown;
  /** 계산에 사용된 가용현금(원) */
  availableCash: number;
  /**
   * 그 가격에서 자격이 되는 정책대출 상품 전부.
   * UI가 같은 판정을 다시 유도하지 않도록 계산 결과에 함께 실어 보낸다.
   * 비어 있으면 정책대출 선택지가 없다는 뜻이다.
   */
  matchedPolicyLoans: PolicyLoanRule[];
  warnings: string[];
}

/** 탐색 상한. 수도권 주거용 상한으로 충분한 값 */
const SEARCH_UPPER_BOUND = 10_000_000_000;
/**
 * 결과를 내림할 단위(원). "10만원 단위로 내림"은 문서화된 계약이므로
 * UI도 같은 값을 써야 한다. 복제하지 말고 이 상수를 import할 것.
 */
export const PRICE_STEP = 100_000;
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
 * 정책대출을 "선택지"로 보는 최대값 의미론(loan-limit.ts 참고)에서는
 * eligibility.maxHousePrice를 넘는 순간 그 선택지가 사라져 대출한도가
 * "하락"하고 자기부담금 f는 그 지점에서 위로 튄다. 즉 절벽은 f를 낮추는
 * 것이 아니라 높이는 방향으로 작용하며, f는 전 구간에서 다시 단조 증가에
 * 가깝다 — 단순 이분 탐색으로도 대체로 맞는다.
 *
 * 그럼에도 구간 분할을 유지한다. 단조성은 현재 룰셋의 형태에 기대는
 * 성질이고(예: 정책대출 금리·한도 축이 늘거나 취득세 구간이 계단이 되면
 * 다시 깨진다), 분할은 절벽의 방향과 무관하게 안전하기 때문이다.
 * 정책대출 상품 집합이 바뀌지 않는 구간 안에서는 단조성이 성립하므로,
 * 절벽을 기준으로 탐색 구간을 나누어 각각 이분 탐색하고 가장 유리한
 * 결과를 취한다.
 */
export function calcAffordablePrice(
  profile: BuyerProfile,
  rules: Rules,
): AffordableResult {
  assertValidProfile(profile);

  const cash = calcAvailableCash(profile);

  if (ownFundsRequired(0, profile, rules) > cash.amount) {
    return resultAt(0, profile, rules, cash.amount, [
      ...cash.warnings,
      INSUFFICIENT_CASH_WARNING,
    ]);
  }

  let affordablePrice = 0;
  for (const segment of buildSearchSegments(rules)) {
    const candidate = searchSegment(segment, profile, rules, cash.amount);
    if (candidate !== null && candidate > affordablePrice) {
      affordablePrice = candidate;
    }
  }

  return resultAt(
    affordablePrice,
    profile,
    rules,
    cash.amount,
    cash.warnings,
  );
}

/** 확정된 매매가를 기준으로 결과 객체를 한 번에 조립한다 */
function resultAt(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
  availableCash: number,
  warnings: string[],
): AffordableResult {
  return {
    affordablePrice: price,
    loanLimit: calcMaxLoan(profile, rules, price),
    costs: calcAcquisitionCosts(price, profile, rules),
    availableCash,
    matchedPolicyLoans: matchPolicyLoans(profile, rules, price),
    warnings,
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

/**
 * 해당 매매가에서 사용자가 현금으로 내야 하는 총액.
 * 정책대출 한도는 calcMaxLoan이 가격에서 직접 도출하므로, 탐색 중에
 * 별도로 넘겨줄 값이 없다 — 엔진 안팎이 같은 숫자를 쓰게 된다.
 */
function ownFundsRequired(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const loan = calcMaxLoan(profile, rules, price);
  const costs = calcAcquisitionCosts(price, profile, rules);
  return price - loan.amount + costs.total;
}
