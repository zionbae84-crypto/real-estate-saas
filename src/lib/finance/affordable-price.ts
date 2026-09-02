import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan, calcPolicyLoanAvailability } from "./loan-limit";
import { assertValidProfile } from "./profile";
import type { BuyerProfile, CostBreakdown, LoanLimit, Rules } from "./types";
import type { MatchedPolicyLoan } from "./loan-limit";

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
   * 그 가격에서 자격이 되는 정책대출 상품과, 상품별 실제 수령 가능액.
   * UI가 같은 판정을 다시 유도하지 않도록 계산 결과에 함께 실어 보낸다.
   * 비어 있으면 정책대출 선택지가 없다는 뜻이다.
   *
   * **`loan.maxAmount`는 상품의 고시 한도이지, 이 구매자가 받을 수 있는
   * 금액이 아니다.** 실제로 받을 수 있는 금액은 `availableAmount`이며,
   * 이 값들의 최대가 `loanLimit.breakdown.POLICY`와 같다. `maxAmount`를
   * 기준으로 "받을 수 있는 정책대출"을 렌더링하면 상환능력을 무시한
   * 숫자가 나온다 — 연소득 0원 구매자에게 보금자리론 한도 3.6억을
   * 받을 수 있다고 표시하는 식이다. UI가 금액을 보여줄 때는 반드시
   * `availableAmount`를 써야 한다.
   */
  matchedPolicyLoans: MatchedPolicyLoan[];
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
  "고정 부대비용(법무비·이사비)만으로도 사용가능 현금 예산을 넘어요.";

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
 * 가깝다 — 단순 이분 탐색으로도 대체로 맞는다. 정책 경로에 LTV·DSR
 * 제약을 붙인 뒤에도 절벽의 방향은 그대로다(두 경로 모두 한도가 가격에
 * 대해 비감소이고 증가율이 LTV 비율 이하이므로 f는 여전히 증가한다).
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

  const affordablePrice = searchMaxPrice(rules, (price) =>
    ownFundsRequired(price, profile, rules) <= cash.amount,
  );

  if (affordablePrice === null) {
    // 도달 불가능한 분기다: 위에서 이미 `ownFundsRequired(0, …) <=
    // cash.amount`를 확인했으므로 첫 구간(`low: 0`)은 반드시 이
    // 조건에서 `accepts(0)`이 참이고, `searchMaxPrice`는 그 경우
    // 절대 `null`을 돌려주지 않는다(위 주석 참고). 그럼에도 타입을
    // 정직하게 좁히기 위해 방어적으로 남겨 둔다 — 여기 도달하면
    // 탐색 로직 자체가 깨진 것이므로 조용히 0으로 얼버무리지 않는다.
    throw new Error("calcAffordablePrice: searchMaxPrice가 예상과 달리 null을 반환했다 (불변식 위반)");
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
    matchedPolicyLoans: calcPolicyLoanAvailability(profile, rules, price),
    warnings,
  };
}

interface SearchSegment {
  low: number;
  high: number;
}

/**
 * 탐색 범위를 절벽에서 나눈다.
 *
 * 절벽은 두 종류다.
 * 1. 정책대출 자격 상실(`eligibility.maxHousePrice`) — 그 가격을 넘으면
 *    상품 집합이 바뀌어 대출 한도가 불연속으로 움직인다.
 * 2. 절대캡 구간 경계(`absoluteCap.brackets[].upTo`) — 그 가격을 넘으면
 *    캡이 떨어진다.
 *
 * 두 경계 모두 **포함**이다. 즉 경계값 자체는 하위 구간에 속하므로
 * 다음 구간은 경계 + 1에서 시작한다.
 *
 * 이 함수는 `rules`만 보고 `profile`을 받지 않는다 — 그래서 절대캡
 * 경계는 구매자가 비규제지역이라 캡이 아예 안 걸리는 경우(`calcMaxLoan`
 * 참고)에도 항상 절벽으로 잡힌다. 실제로는 절벽이 아닌 지점에서 구간을
 * 한 번 더 나누는 셈이지만, 각 구간은 독립적으로 이분 탐색하고 정답
 * 후보는 다시 검증하므로 정답을 놓치지 않는다 — 그저 안 쓰는 구간
 * 분할이 하나 늘 뿐이다. 안전한 과잉이라 profile을 끌어들여 걸러내지
 * 않는다.
 *
 * 룰셋에서 도출하며 값을 직접 하드코딩하지 않는다.
 */
function buildSearchSegments(rules: Rules): SearchSegment[] {
  const policyCliffs = rules.policyLoans
    .map((loan) => loan.eligibility.maxHousePrice)
    .filter((v): v is number => v !== undefined && v > 0);

  const capCliffs = rules.absoluteCap.brackets
    .map((bracket) => bracket.upTo)
    .filter((v): v is number => v !== null && v > 0);

  const boundaries = Array.from(new Set([...policyCliffs, ...capCliffs])).sort(
    (a, b) => a - b,
  );

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
 * 한 구간(f가 단조라고 가정할 수 있는 범위) 안에서 `accepts`가 참인 최대
 * 가격을 이분 탐색으로 찾는다.
 *
 * `accepts`는 "이 가격이 조건을 만족하는가"를 답한다. 감당 가능 여부든
 * 안전 등급이든, 가격이 오를수록 거짓으로 바뀌는 성질이면 된다.
 */
function searchSegment(
  segment: SearchSegment,
  accepts: (price: number) => boolean,
): number | null {
  const { low: segLow, high: segHigh } = segment;
  if (segLow > segHigh) return null;
  if (!accepts(segLow)) return null;

  let low = segLow;
  let high = segHigh;

  // 50회면 100억 범위를 0.01원 미만까지 좁힌다
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (accepts(mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // 이분 탐색은 high를 좁히기만 하고 low에 대입하지 않으므로, 구간 전체를
  // 받아들일 수 있어도 low는 segHigh에 무한히 가까워질 뿐 도달하지 못한다.
  // 그대로 내림하면 답이 한 스텝(PRICE_STEP) 낮게 나온다 — 구간 상단
  // 자체도 후보로 함께 검증한다.
  //
  // 같은 이유로, 참 임계값이 구간 "내부"에서 정확히 PRICE_STEP의 배수와
  // 일치할 때도 low는 부동소수점 오차로 그 값 바로 아래에서 수렴한다.
  // floored는 그 순간 한 단계 아래로 내려가므로, floored + PRICE_STEP도
  // 후보에 넣어 같은 사각을 구제한다.
  const floored = Math.floor(low / PRICE_STEP) * PRICE_STEP;
  const candidates = [
    floored,
    floored + PRICE_STEP,
    Math.floor(segHigh / PRICE_STEP) * PRICE_STEP,
  ];

  let best: number | null = null;
  for (const candidate of candidates) {
    if (candidate < segLow) continue;
    // 구간 가정에 기대지 않고, 실제 가격에서 정직하게 재검증한다.
    if (!accepts(candidate)) continue;
    if (best === null || candidate > best) best = candidate;
  }

  return best;
}

/**
 * 룰셋이 만드는 모든 절벽에서 구간을 나눠, `accepts`가 참인 최대 가격을 찾는다.
 * 참인 가격이 하나도 없으면(가격 0부터 이미 거짓이면) `null`.
 *
 * **`calcAffordablePrice`와 `calcSafePrice`가 이 함수를 공유한다.** 두 숫자는
 * 화면에 나란히 놓이므로 서로 다른 절벽 위에서 계산되면 안 된다. 절벽 목록만
 * 공유하고 탐색을 각자 쓰면, 구간 상단·PRICE_STEP 경계 처리 같은 세부가
 * 한쪽에만 반영되는 결함이 난다.
 *
 * `accepts`는 부작용이 없어야 하고, 같은 가격에 대해 같은 답을 줘야 한다.
 *
 * 반환값이 `null`이 아니면 그 값은 반드시 `accepts`를 통과했다 —
 * `searchSegment`의 모든 후보가 채택 전 재검증을 거치기 때문이다.
 * `best`의 초깃값을 `0`이 아니라 `null`로 둔 것이 이 보장의 핵심이다.
 * 예전에는 초깃값이 `0`이라, 모든 구간이 자기 구간의 시작가에서부터
 * 이미 거짓이면(즉 `searchSegment`가 전부 `null`을 돌려주면) 그 `0`이
 * `accepts`를 한 번도 통과하지 못한 채 그대로 새어나갔다 — "0원이
 * 안전 최대치"와 "안전한 가격이 없음"이 똑같이 `0`으로 뭉개졌다.
 *
 * `calcAffordablePrice`는 이 함수를 호출하기 전에 이미
 * `ownFundsRequired(0, …) <= cash.amount`(= `accepts(0)`이 참)를 직접
 * 확인해 두므로, 첫 구간(항상 `low: 0`에서 시작)이 `null`을 돌려주는
 * 일이 없다 — 즉 이 함수는 그 호출 경로에서는 절대 `null`을 반환하지
 * 않는다. `calcSafePrice`는 그런 사전 보장이 없어 `null`을 실제로
 * 받아 처리해야 하는 유일한 호출자다.
 */
export function searchMaxPrice(
  rules: Rules,
  accepts: (price: number) => boolean,
): number | null {
  let best: number | null = null;
  for (const segment of buildSearchSegments(rules)) {
    const candidate = searchSegment(segment, accepts);
    if (candidate !== null && (best === null || candidate > best)) {
      best = candidate;
    }
  }
  return best;
}

/**
 * 해당 매매가에서 사용자가 현금으로 내야 하는 총액.
 * 정책대출 한도는 calcMaxLoan이 가격에서 직접 도출하므로, 탐색 중에
 * 별도로 넘겨줄 값이 없다 — 엔진 안팎이 같은 숫자를 쓰게 된다.
 */
export function ownFundsRequired(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const loan = calcMaxLoan(profile, rules, price);
  const costs = calcAcquisitionCosts(price, profile, rules);
  return price - loan.amount + costs.total;
}
