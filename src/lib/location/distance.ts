import type { Coordinate } from "./types";

/**
 * 지구 평균 반지름(m). IUGG 산술평균 반지름 6,371.0088km.
 *
 * ## 왜 룰셋이 아니라 코드에 두는가
 *
 * 이 저장소의 규칙은 "판정 수치·문구는 `rules/*.json`에"다. 그 규칙이
 * 겨냥하는 것은 **사람이 고를 수 있는 값**이다 — LTV 상한, DSR 한도,
 * 거래 건수 하한, 초등학교 반경. 그런 값은 정책이 바뀌거나 우리가 판단을
 * 바꾸면 손으로 고쳐야 하고, 고칠 때 근거를 `_note`에 남겨야 한다.
 *
 * 지구 반지름은 그런 값이 아니다. 우리가 고를 수 있는 것이 아니고,
 * 바꾸면 "판정 기준이 달라지는" 것이 아니라 **계산이 그냥 틀린다.**
 * 룰셋에 두면 손으로 고칠 수 있는 자리가 되는데, 거기에 6,000,000이
 * 들어가도 화면은 멀쩡한 얼굴로 6% 짧은 거리를 내보낸다. 그 실패는 눈에
 * 띄지 않는다 — 이 앱이 가장 피해야 하는 종류다.
 *
 * 그래서 룰셋이 정하는 것은 "반경 몇 m 안을 셀까"(제품의 판단)이고, 이
 * 상수가 정하는 것은 "그 m가 얼마나 긴가"(물리)다. 값 자체는
 * `distance.test.ts`가 위도 1도·대척점 같은 독립 검산으로 잠근다.
 *
 * 참고로 지구는 완전한 구가 아니라 극반지름(6,357km)과 적도반지름
 * (6,378km)이 0.3%쯤 다르다. 평균 반지름을 쓰는 구면 근사는 우리 쓰임새
 * (같은 도시 안 수백 m~수 km)에서 오차가 그 0.3% 안쪽이고, 아래 고지가
 * 말하는 직선거리와 도보거리의 차이(흔히 1.5~2배)에 비하면 없는 것이나
 * 마찬가지다. 정밀도를 더 올려도 화면이 말할 수 있는 것은 달라지지 않는다.
 */
export const EARTH_MEAN_RADIUS_M = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 두 좌표 사이의 **직선거리**(m). 하버사인 공식.
 *
 * **도보거리가 아니다.** 이 함수는 지구 표면을 따라 두 점을 잇는 최단
 * 호의 길이를 낸다 — 사이에 강이 있든 철길이 있든 절벽이 있든 상관하지
 * 않는다. 실제로 걷는 길은 이보다 멀고, 얼마나 먼지는 우리가 모른다.
 * 그 사실은 계산이 아니라 고지가 말한다
 * (`rules/location-2026-08.json`의 `disclosure.straightLineNote`).
 *
 * 코사인 법칙 대신 하버사인을 쓰는 이유: 아주 가까운 두 점에서 코사인
 * 법칙은 `acos`의 인자가 부동소수점 반올림으로 1을 살짝 넘어 `NaN`을
 * 낸다. 우리가 다루는 거리는 대부분 수백 m라 정확히 그 구간이다.
 *
 * 반올림하지 않은 실수를 낸다 — 반올림은 화면에 낼 때 한 번만 한다.
 */
export function straightLineMeters(a: Coordinate, b: Coordinate): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  // Math.min(1, h)는 h가 반올림으로 1을 살짝 넘는 경우(대척점 근처)를
  // 막는다. asin의 정의역 밖으로 나가면 NaN이 되는데, 거리가 NaN이면
  // 화면은 아무것도 못 그리면서 왜 못 그리는지도 말하지 못한다.
  return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}
