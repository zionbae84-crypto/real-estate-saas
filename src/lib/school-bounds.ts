import type { Coordinate } from "./location/types";

/**
 * 사용자 지시: "해당지역의 학교만 표시되게 해줘." 학교 데이터
 * (`data/location.json`의 `elementarySchools`/`middleSchools`/
 * `highSchools`)는 여러 구를 걸치는 하나의 정적 배열이라(위경도 실측:
 * 위도 37.42~37.57, 경도 126.94~127.19 — 서울 남부·중부 여러 구를
 * 덮는다), 지금 고른 구만 조회해도 이웃 구의 학교까지 함께 뜬다.
 *
 * "구 경계" 자체을 가진 데이터가 없으므로(행정동 경계 shapefile을
 * 새로 들이지 않는다) **지금 지도에 실제로 그려진 단지 좌표들의
 * 바운딩박스**를 그 지역의 근사 범위로 쓴다 — `ComplexMap`이 이미
 * 들고 있는 `coordinates`를 그대로 재사용하므로 새 데이터 소스가
 * 필요 없다. 여백(`REGION_PADDING_DEG`)을 두는 이유는 단지들이 그
 * 구의 한쪽에 몰려 있어도(예산에 맞는 단지만 남으므로 실제로 자주
 * 일어난다) 그 구 전체의 학교가 여전히 보이게 하기 위해서다.
 */
export interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * 여백 폭(도). 0.02도 ≈ 위도 방향 2.2km — 서울 한 구의 한 변(3~8km
 * 안팎)보다는 좁지만, "단지가 몰린 한쪽 구석"에서 "구 반대편 학교"까지
 * 이어 주기엔 충분하다. 너무 넓게 잡으면(예: 0.1도 ≈ 11km) 다시 이웃
 * 구가 섞여 들어와 이 기능의 목적을 잃는다.
 */
const REGION_PADDING_DEG = 0.02;

/**
 * `coordinates`(단지 complexKey → 좌표)의 바운딩박스에 여백을 둔
 * 범위. 좌표가 하나도 없으면(지도가 아직 아무것도 못 그렸다) `null` —
 * 이때는 "그 지역"이 무엇인지 알 방법이 없으므로 학교도 그리지
 * 않는다(빈 목록으로 처리한다, `schoolsWithinBounds` 참고).
 */
export function regionSchoolBounds(
  coordinates: ReadonlyMap<string, Coordinate>,
): LatLonBounds | null {
  if (coordinates.size === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const { lat, lon } of coordinates.values()) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  // 부동소수 오차를 정리한다(예: 37.52 + 0.02 = 37.540000000000006 —
  // RangeSlider.tsx의 niceAxisTicks와 같은 이유).
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    minLat: round(minLat - REGION_PADDING_DEG),
    maxLat: round(maxLat + REGION_PADDING_DEG),
    minLon: round(minLon - REGION_PADDING_DEG),
    maxLon: round(maxLon + REGION_PADDING_DEG),
  };
}

/** `bounds` 범위(경계 포함) 안에 드는 학교만 남긴다. `bounds`가 `null`이면 빈 배열이다. */
export function schoolsWithinBounds<T extends { coordinate: Coordinate }>(
  schools: readonly T[],
  bounds: LatLonBounds | null,
): T[] {
  if (bounds === null) return [];
  return schools.filter(
    (school) =>
      school.coordinate.lat >= bounds.minLat &&
      school.coordinate.lat <= bounds.maxLat &&
      school.coordinate.lon >= bounds.minLon &&
      school.coordinate.lon <= bounds.maxLon,
  );
}
