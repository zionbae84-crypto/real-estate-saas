import { calcAcquisitionCosts } from "./acquisition-cost";
import { assertNonNegativeFinite, assertValidProfile } from "./profile";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile, Rules, SafetyScore } from "./types";

/** 어떤 가격에서 이 구매자가 실제로 지게 되는 부담 */
export interface BurdenAtPrice {
  /** 그 가격을 사려면 실제로 빌려야 하는 금액(원) */
  neededLoan: number;
  /** 그 대출에서의 상환 부담 */
  safety: SafetyScore;
}

/**
 * 특정 가격에서의 상환 부담.
 *
 * **최대 대출이 아니라 필요 대출로 잰다.** 특정 단지를 보는 사람은 받을 수
 * 있는 만큼 다 빌리지 않고 모자란 만큼만 빌린다. 최대 대출로 재면 현금이
 * 많은 사람에게 터무니없이 보수적인 답이 나온다 — 현금 50억·소득 2천만원인
 * 프로필의 "무리 없는 선"이 2억으로 계산되던 것이 그 예다.
 *
 * 안전선(`calcSafePrice`)과 단지 목록이 **둘 다 이 함수를 쓴다.** 목록은
 * 한 걸음 더 나아가, 행을 두 덩어리로 가르는 기준까지 이 함수가 그 행에
 * 대해 낸 `safety.level`을 그대로 쓴다(`lib/complex-list.ts`) — 덩어리와
 * 행 배지가 같은 결과 하나에서 나오므로 "무리 없이 살 수 있어요" 덩어리에
 * "주의" 배지가 달린 행이 들어가는 일이 구조적으로 생길 수 없다. 덩어리를
 * 다른 기준으로 가르면(예전처럼 프로필의 가정 면적으로 잰 안전선과 행
 * 가격을 비교하면) 정확히 그 어긋남이 생긴다 — 행은 자기 실제 면적으로
 * 부담을 재기 때문이다.
 *
 * 대출 한도를 넘는지는 여기서 보지 않는다. 감당 가능 여부는
 * `calcAffordablePrice`가 판단하고, 이 함수는 그 범위 안에서만 쓰인다.
 */
export function calcBurdenAt(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): BurdenAtPrice {
  assertValidProfile(profile);
  assertNonNegativeFinite(price, "price");

  const costs = calcAcquisitionCosts(price, profile, rules);
  const neededLoan = Math.max(0, price + costs.total - profile.cash);

  return {
    neededLoan,
    safety: calcSafetyScore(profile, rules, neededLoan),
  };
}
