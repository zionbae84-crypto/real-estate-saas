import { calcAffordablePrice, searchMaxPrice } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { assertValidProfile } from "./profile";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile, Rules } from "./types";

/**
 * 상환 부담이 "안전" 범위에 머무는 최대 매매가(원).
 *
 * 이 제품이 다른 계산기와 갈리는 지점이다. 다른 앱은 "최대 얼마까지 살 수
 * 있는가"에서 멈추지만, 그 최대치는 대개 상환 부담이 이미 위험한 가격이다.
 * 이 값은 그 옆에 나란히 놓여 "여기까지가 무리 없는 선"을 말한다.
 *
 * 상한은 실구매력이다 — **살 수 없는 가격을 안전하다고 말할 수 없다.**
 *
 * 탐색은 `calcAffordablePrice`와 같은 `searchMaxPrice`를 쓴다. 두 숫자가
 * 화면에 나란히 놓이므로 서로 다른 절벽 위에서 계산되면 안 된다.
 */
export function calcSafePrice(profile: BuyerProfile, rules: Rules): number {
  assertValidProfile(profile);

  const affordable = calcAffordablePrice(profile, rules).affordablePrice;
  if (affordable === 0) return 0;

  return searchMaxPrice(rules, (price) => {
    if (price > affordable) return false;
    const loan = calcMaxLoan(profile, rules, price);
    return calcSafetyScore(profile, rules, loan.amount).level === "safe";
  });
}
