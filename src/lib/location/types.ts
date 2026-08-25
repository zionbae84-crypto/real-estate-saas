/**
 * 입지분석이 다루는 타입.
 *
 * 진단 제품의 마지막 축이되, **입지를 평가하지 않는다.** 이 모듈이 내는
 * 것은 점수도 등급도 순위도 아니고 **거리라는 사실 하나**다 — 가장 가까운
 * 지하철역과 그 직선거리, 반경 안의 초등학교와 각각의 직선거리.
 *
 * "학군 90점"·"교통 우수"는 가치판단을 사실처럼 포장한 것이고 검증할 수
 * 없다. 이 앱이 `medianPrice`를 `ComplexUnit` 타입에서부터 뺀 것과 같은
 * 이유로, 이 파일의 어떤 타입에도 점수·등급·순위 필드가 없다. 새로 내려면
 * 새 필드를 만들어야 하고 그 순간 눈에 띈다.
 *
 * 판정에 쓰이는 **값**(반경·문구)은 여기 없다 — 전부
 * `rules/location-2026-08.json`에 있다. 이 파일은 그 데이터의 모양만
 * 정한다. `src/lib/purchase/types.ts`·`src/lib/price/types.ts`와 같은
 * 태도다.
 *
 * ## 이 파일의 요점 — "모른다"와 "없다"를 구조로 가른다
 *
 * 반경 안에 초등학교가 0곳인 것과, 좌표를 몰라 세지 못한 것은 완전히
 * 다른 사실이다. 앞은 이 단지에 대해 우리가 아는 것이고, 뒤는 우리가
 * 아무것도 모른다는 것이다. 문구만 다르게 두면 언젠가 한쪽이 다른 쪽으로
 * 접힌다 — 화면이 두 경우에 같은 빈 목록을 그리는 순간, 빈 목록은 언제나
 * 가장 낙관적으로("주변에 아무것도 없다"보다는 "문제없다"로) 읽힌다.
 *
 * 그래서 값의 **모양**을 다르게 뒀다:
 *
 * - 좌표를 모르면 {@link LocationUnlocated}다. 이 타입에는 `subway`도
 *   `elementarySchool`도 **필드 자체가 없다.** 빈 목록을 그릴 재료가
 *   없으므로 화면이 실수로도 "0곳"을 그릴 수 없다.
 * - 좌표는 알지만 목록을 못 실었으면 {@link SchoolFindingUnknown}이다.
 *   여기에도 `schools` 필드가 **없다.**
 * - 좌표도 알고 목록도 있는데 반경 안에 하나도 없을 때만
 *   {@link SchoolFindingMeasured}의 `schools`가 빈 배열이 된다. 그때
 *   비로소 "0곳"은 사실이다.
 *
 * `location/assess.test.ts`가 이 갈라짐을 구조로 확인한다 —
 * 문구 비교가 아니라 키의 존재로 확인하므로, 나중에 누가 문구를 합쳐도
 * 잡힌다.
 */

/* ─────────────────────────── 좌표와 원본 ─────────────────────────── */

/**
 * 위경도 한 쌍(WGS84, 도 단위).
 *
 * **없으면 `null`이지 `{ lat: 0, lon: 0 }`이 아니다.** 0,0은 기니만
 * 한복판이고 지오코딩 실패의 전형적인 뒷맛이라, 그 값이 좌표인 척
 * 들어오면 거리 계산은 조용히 성공하고 숫자만 통째로 틀린다
 * (`assess.ts`의 `usableCoordinate` 참고).
 */
export interface Coordinate {
  lat: number;
  lon: number;
}

/**
 * 지하철역 한 곳.
 *
 * 파이프라인이 「전국도시철도역사정보표준데이터」에서 구워 넣을 자리다
 * (`data/README.md` 참고). `src/`는 이 값을 받기만 하고 어디서도 찾아오지
 * 않는다 — 좌표 조회는 빌드 타임 도구(`scripts/`)의 일이다.
 */
export interface SubwayStation {
  /** 같은 역이 여러 노선으로 중복해 들어올 때 구분하는 키 */
  id: string;
  name: string;
  /** 노선 이름. 여러 노선이 지나는 역은 원본에 행이 여럿이라 그중 하나가 온다 */
  lineName: string;
  coordinate: Coordinate;
}

/** 초등학교 한 곳. 「전국초중등학교위치표준데이터」에서 온다 */
export interface ElementarySchool {
  id: string;
  name: string;
  coordinate: Coordinate;
}

/**
 * 판정에 들어가는 입력 전부.
 *
 * 세 자리가 각각 독립적으로 `null`일 수 있고, **`null`은 전부 "아직
 * 모른다"는 뜻이다.** 빈 배열(`[]`)도 여기서는 모른다는 쪽으로 접는다 —
 * 전국 지하철역 목록이 정말로 0개일 수는 없으므로, 빈 목록은 이 단지
 * 주변에 대한 사실이 아니라 데이터가 아직 없다는 사실이기 때문이다.
 * (반경 안 개수가 0인 것은 전혀 다른 이야기이고, 그건 목록이 비어 있지
 * 않을 때에만 나온다.)
 */
export interface LocationInput {
  /**
   * 이 단지의 좌표. **`null`은 "모른다"**이고, 근처 단지 좌표나 법정동
   * 중심점으로 대신 채우지 않는다 — 법정동은 한 변이 몇 km라 그걸로
   * 재면 거리가 통째로 틀린다.
   */
  coordinate: Coordinate | null;
  /** 지하철역 목록. `null`이거나 빈 배열이면 "아직 못 실었다" */
  subwayStations: readonly SubwayStation[] | null;
  /** 초등학교 목록. `null`이거나 빈 배열이면 "아직 못 실었다" */
  elementarySchools: readonly ElementarySchool[] | null;
}

/* ─────────────────────────── 룰셋의 모양 ─────────────────────────── */

export interface LocationStateCopy {
  label: string;
  note: string;
}

export interface SubwayRule {
  label: string;
  messages: {
    /** 역 목록을 아직 못 실었을 때 */
    unknown: string;
    /** 실제로 가장 가까운 역을 냈을 때 */
    measured: string;
  };
}

/**
 * 반경과 그 반경에 대해 하는 말.
 *
 * **반경은 코드에 없다.** 여기 있는 값 하나가 유일한 출처이고,
 * `scripts/location-guard.test.ts`가 소스에 미터 상수가 박히지 않았는지
 * 확인한다. 왜 이 값인지는 룰셋의 `_radiusMetersNote`에 있다.
 */
export interface ElementarySchoolRule {
  label: string;
  /** 이 거리(직선, m) 안의 학교만 센다 */
  radiusMeters: number;
  messages: {
    /** 학교 목록을 아직 못 실었을 때. `{radius}`를 품는다 */
    unknown: string;
    /** 목록은 있는데 반경 안에 한 곳도 없을 때. `{radius}`를 품는다 */
    none: string;
    /** 반경 안에서 실제로 찾았을 때. `{radius}`를 품는다 */
    some: string;
  };
}

/**
 * 사실과 **언제나 함께** 나가야 하는 문구들.
 *
 * 좌표를 몰라 아무것도 재지 못한 상태에서도 예외가 없다. 이 넷이 이
 * 화면의 존재 이유다 — 우리가 재지 못하는 것을 말하지 않으면, 재어 낸
 * 숫자가 실제보다 훨씬 많은 것을 아는 척한다.
 */
export interface LocationDisclosure {
  /** 직선거리는 도보거리가 아니라는 사실 */
  straightLineNote: string;
  /** 초등학교 배정이 거리순이 아니라는 사실 */
  schoolZoneNote: string;
  /** 소음·경사·일조·조망이 우리 데이터에 없다는 사실 */
  missingFactorsNote: string;
  /** 이 화면이 점수·등급·순위를 매기지 않는다는 사실 */
  notARatingNote: string;
}

export interface LocationRules {
  version: string;
  effectiveFrom: string;
  /** 화면 제목 */
  label: string;
  states: {
    unlocated: LocationStateCopy;
    located: LocationStateCopy;
  };
  subway: SubwayRule;
  elementarySchool: ElementarySchoolRule;
  /** 거리 값 옆에 붙는 라벨. "직선"이라는 말이 값 바로 옆에 있어야 한다 */
  distanceLabel: string;
  disclosure: LocationDisclosure;
  disclaimer: string[];
}

/* ─────────────────────────── 결과 ─────────────────────────── */

/**
 * 재어 낸 한 곳.
 *
 * **거리 말고는 아무것도 없다.** 점수도, 등급도, "도보 N분"도 없다 —
 * 도보 시간은 우리가 재지 못하는 값이고(경로를 모른다), 숫자로 적는
 * 순간 사용자는 그것을 우리가 아는 사실로 읽는다.
 */
export interface MeasuredPlace {
  name: string;
  /**
   * 지도 위의 **직선거리**(m, 반올림한 정수).
   *
   * 걸어가는 거리가 아니다. 이름에 `straightLine`을 박아 둔 것은 화면
   * 코드가 이 값을 "도보 거리"로 쓰는 순간 이름이 먼저 어긋나 보이게
   * 하려는 것이다.
   */
  straightLineMeters: number;
}

/** 지하철역은 노선 이름이 하나 더 붙는다 */
export interface MeasuredStation extends MeasuredPlace {
  lineName: string;
}

export interface SubwayFindingUnknown {
  /** **재지 못했다.** `nearest` 필드 자체가 없다 */
  measured: false;
  label: string;
  message: string;
}

export interface SubwayFindingMeasured {
  measured: true;
  label: string;
  message: string;
  /** 목록이 비어 있지 않을 때에만 이 갈래로 오므로 언제나 한 곳이 있다 */
  nearest: MeasuredStation;
}

export type SubwayFinding = SubwayFindingUnknown | SubwayFindingMeasured;

export interface SchoolFindingUnknown {
  /**
   * **세지 못했다.** `schools` 필드 자체가 없다 — 빈 배열을 두면 화면이
   * "0곳"을 그릴 재료를 갖게 되고, 그 순간 "모른다"가 "없다"로 접힌다.
   */
  measured: false;
  label: string;
  message: string;
  /** 어느 범위를 세지 못한 것인지. 문구에 이미 들어 있지만 화면도 쓴다 */
  radiusMeters: number;
}

export interface SchoolFindingMeasured {
  measured: true;
  label: string;
  message: string;
  radiusMeters: number;
  /**
   * 반경 안의 학교들, 가까운 차례.
   *
   * **빈 배열은 "0곳"이라는 사실이다** — 모른다는 뜻이 아니다. 모를
   * 때는 이 필드가 있는 값 자체가 만들어지지 않는다
   * ({@link SchoolFindingUnknown}).
   *
   * 차례는 거리순이지만 **배정 차례가 아니다.** 학구도는 따로 정해져
   * 있어서 첫 줄의 학교에 배정되지 않을 수 있고, 그 사실을
   * {@link LocationDisclosure.schoolZoneNote}가 언제나 함께 말한다.
   */
  schools: readonly MeasuredPlace[];
}

export type SchoolFinding = SchoolFindingUnknown | SchoolFindingMeasured;

interface LocationAssessmentBase {
  /** 화면 제목 */
  label: string;
  /** 지금 어떤 상태인지의 제목 */
  stateLabel: string;
  stateNote: string;
  /** 상태와 무관하게 언제나 같은 값이 실린다 */
  disclosure: LocationDisclosure;
  disclaimer: readonly string[];
}

/**
 * 단지 좌표를 모를 때.
 *
 * **`subway`·`elementarySchool` 필드가 없다.** 화면이 그릴 수 있는 것은
 * "아직 위치를 몰라요"와 고지뿐이고, 빈 목록을 그릴 방법이 없다.
 */
export interface LocationUnlocated extends LocationAssessmentBase {
  state: "unlocated";
}

/** 단지 좌표를 알 때. 그래도 각 줄은 따로 "못 쟀다"일 수 있다 */
export interface LocationLocated extends LocationAssessmentBase {
  state: "located";
  subway: SubwayFinding;
  elementarySchool: SchoolFinding;
}

export type LocationAssessment = LocationUnlocated | LocationLocated;

export const LOCATION_STATES: readonly LocationAssessment["state"][] = [
  "unlocated",
  "located",
];
