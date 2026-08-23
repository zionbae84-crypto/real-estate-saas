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
 * 안전선(`calcSafePrice`)과 단지 목록의 부담률이 **둘 다 이 함수를 쓴다.**
 * 따로 계산하면 목록이 "안전 구역에 있는데 부담률은 위험"인 행을 보여주게
 * 된다.
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
