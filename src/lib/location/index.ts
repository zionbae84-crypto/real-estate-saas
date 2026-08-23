/**
 * 입지분석 엔진의 공개 표면.
 *
 * `src/lib/finance`·`src/lib/rights`·`src/lib/purchase`·`src/lib/price`와
 * 나란한 자리다. 진단 제품의 마지막 축이되, 앞의 셋과 달리 **판정을 내지
 * 않는다** — 여기서 나오는 것은 거리라는 사실뿐이고, 그 거리가 좋은지
 * 나쁜지는 이 모듈이 말할 수 없는 것이다.
 *
 * **점수·등급·순위를 내지 않는다.** 이 모듈의 어떤 타입에도 그런 필드가
 * 없다. "학군 90점"·"교통 우수"는 가치판단을 사실처럼 포장한 것이고
 * 검증할 수 없다 — 이 앱이 `medianPrice`를 화면에서 뺀 것과 같은 이유다.
 *
 * **좌표를 찾아오지 않는다.** 이 모듈은 좌표를 **받기만** 한다. 지오코딩은
 * 빌드 타임 도구(`scripts/`)의 일이고, `src/no-network.test.ts`가 `src/`
 * 안에서 네트워크 경로 자체를 금지한다.
 */
export { assessLocation } from "./assess";
export { EARTH_MEAN_RADIUS_M, straightLineMeters } from "./distance";
export { parseLocationRules } from "./rules";
export { LOCATION_STATES } from "./types";
export type {
  Coordinate,
  ElementarySchool,
  ElementarySchoolRule,
  LocationAssessment,
  LocationDisclosure,
  LocationInput,
  LocationLocated,
  LocationRules,
  LocationStateCopy,
  LocationUnlocated,
  MeasuredPlace,
  MeasuredStation,
  SchoolFinding,
  SchoolFindingMeasured,
  SchoolFindingUnknown,
  SubwayFinding,
  SubwayFindingMeasured,
  SubwayFindingUnknown,
  SubwayRule,
  SubwayStation,
} from "./types";
