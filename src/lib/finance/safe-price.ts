import { calcAffordablePrice, searchMaxPrice } from "./affordable-price";
import { calcBurdenAt } from "./burden";
import { assertValidProfile } from "./profile";
import type { BuyerProfile, Rules } from "./types";

/**
 * 상환 부담이 "안전" 범위에 머무는 최대 매매가(원), 또는 그런 가격이
 * 하나도 없으면 `null`.
 *
 * 이 제품이 다른 계산기와 갈리는 지점이다. 다른 앱은 "최대 얼마까지 살 수
 * 있는가"에서 멈추지만, 그 최대치는 대개 상환 부담이 이미 위험한 가격이다.
 * 이 값은 그 옆에 나란히 놓여 "여기까지가 무리 없는 선"을 말한다.
 *
 * 부담은 **필요 대출**로 잰다(`calcBurdenAt`) — 받을 수 있는 최대가 아니라
 * 그 집을 사는 데 모자란 만큼이다. 최대 대출로 재던 시절 현금 50억·소득
 * 2천만원인 프로필의 안전선이 2억으로 나왔다. 안전한 방향이지만 쓸모가 없다.
 *
 * 단지 목록의 부담률도 같은 `calcBurdenAt`을 쓴다. 따로 계산하면 목록이
 * "안전 구역에 있는데 부담률은 위험"인 행을 보여주게 된다.
 *
 * 상한은 실구매력이다 — **살 수 없는 가격을 안전하다고 말할 수 없다.**
 *
 * 탐색은 `calcAffordablePrice`와 같은 `searchMaxPrice`를 쓴다. 두 숫자가
 * 화면에 나란히 놓이므로 서로 다른 절벽 위에서 계산되면 안 된다.
 *
 * ## `null`과 `0`은 서로 다른 뜻이다
 *
 * - `null` = 안전한 가격이 하나도 없다. 실구매력이 0이라 애초에 살 수
 *   있는 게 없거나, 실구매력은 0보다 크지만 그 안의 어떤 가격에서도
 *   상환 부담 등급이 `safe`에 오르지 못하는 경우(예: 소득이 0이라 부담률
 *   분모가 0이 되거나, 기존 부채만으로 이미 스트레스 DSR을 넘는 경우)다.
 * - 숫자 = 그 가격이 안전 최대치이고, **그 가격에서 실제로 `safe` 등급이
 *   검증됐다.** 0을 돌려줄 때도 예외가 아니다 — 0원 자체가 `safe`로
 *   확인됐다는 뜻이다.
 *
 * 실구매력이 0이면 항상 `null`이다(0을 돌려주지 않는다). "0원이 안전
 * 최대치"라는 말은 매수가 성립한다는 전제 위에서만 의미가 있는데,
 * 실구매력 0은 애초에 살 수 있는 게 없다는 뜻이라 그 전제 자체가
 * 없다 — "0원까지는 안전합니다"보다 "안전한 가격이 없습니다"가
 * 이 프로필에 정직한 문구다.
 *
 * ### 왜 `searchMaxPrice`가 아니라 여기서 실구매력 0을 특별 취급하는가
 *
 * `searchMaxPrice`는 `calcAffordablePrice`와 공유하는 범용 탐색기라
 * "실구매력 0이면 null"이라는 이 함수 고유의 제품 판단을 몰라야 한다.
 * `searchMaxPrice` 쪽에서 고쳐야 했던 것은 딱 하나, **`accepts`를 한
 * 번도 통과하지 못한 값이 새어나가지 않게 하는 것**뿐이다(그 함수의
 * `best` 초깃값 주석 참고) — 그건 이 함수·`calcAffordablePrice` 양쪽에
 * 안전한 일반 수정이었다. 반면 "실구매력이 0이면 무조건 null"은
 * `calcAffordablePrice`에는 해당하지 않는 이 함수만의 규칙이므로
 * 여기서 처리한다.
 */
export function calcSafePrice(
  profile: BuyerProfile,
  rules: Rules,
): number | null {
  assertValidProfile(profile);

  const affordable = calcAffordablePrice(profile, rules).affordablePrice;
  if (affordable === 0) return null;

  return searchMaxPrice(rules, (price) => {
    if (price > affordable) return false;
    return calcBurdenAt(profile, rules, price).safety.level === "safe";
  });
}
