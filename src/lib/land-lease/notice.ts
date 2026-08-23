import type { LandLeaseNotice, LandLeaseRules } from "./types";

/**
 * 이 평형에 붙일 토지임대부 표시. 붙일 것이 없으면 `null`.
 *
 * **`null`(모름)을 "아님"으로 접지 않는다.** 이 함수가 `null`을
 * 돌려주는 경우는 `"N"` 하나뿐이다:
 *
 * - `"Y"` → `yes`(토지임대부)
 * - `null` → `unknown`(확인이 필요해요)
 * - `"N"` → `null`(그릴 것이 없다)
 *
 * `value !== "Y"`로 갈랐다면 `null`이 조용히 "아님" 쪽으로 갔을
 * 것이다. 그러면 화면은 "토지 소유권이 있는 집"이라는, 우리가 확인한
 * 적 없는 사실을 말하게 되고 사용자는 없는 근거로 안심한다. 그래서
 * **`"N"`만 명시적으로 걸러내고 나머지는 전부 표시로 보낸다** — 이
 * 방향이 이 함수의 요점이다.
 *
 * 지금 번들 데이터에 `null`은 0건이지만 지역을 넓히면 반드시 생긴다.
 * 그때 경로가 없어서 조용히 "아님"이 되는 일이 없도록 지금 만들어 둔다.
 */
export function landLeaseNotice(
  value: "Y" | "N" | null,
  rules: LandLeaseRules,
): LandLeaseNotice | null {
  if (value === "N") return null;
  const state = value === "Y" ? "yes" : "unknown";
  return { state, ...rules.states[state] };
}
