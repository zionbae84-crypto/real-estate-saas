import { straightLineMeters } from "./distance";
import type {
  Coordinate,
  ElementarySchool,
  LocationAssessment,
  LocationInput,
  LocationRules,
  MeasuredPlace,
  MeasuredStation,
  SchoolFinding,
  SubwayFinding,
  SubwayStation,
} from "./types";

/**
 * 우리 데이터가 다루는 위경도 범위(대한민국).
 *
 * 남쪽 끝 마라도(33.06°N)와 북쪽 끝 접경(38.6°N), 서쪽 끝 격렬비열도
 * (125.1°E)와 동쪽 끝 독도(131.87°E)를 넉넉히 감싸는 상자다.
 *
 * **이건 판정 기준이 아니라 지오코딩 실패를 걸러내는 그물이다.** 이 앱의
 * 단지는 전부 국내이므로 이 상자 밖 좌표는 "부산 어딘가"가 아니라 **잘못
 * 붙은 좌표**다(0,0으로 채워진 값, 위경도가 뒤바뀐 값, 파싱이 어긋난
 * 값). 그런 좌표로도 거리 계산은 조용히 성공하고 숫자만 통째로 틀린다 —
 * 화면은 "역까지 9,300km"라고 적는 대신, 아무 의심 없이 "가장 가까운 역"
 * 이라고 말한다. 그래서 상자 밖은 **모른다**로 접는다. 틀린 거리를 내는
 * 것보다 모른다고 말하는 쪽이 언제나 낫다.
 *
 * 룰셋이 아니라 코드에 두는 이유는 지구 반지름과 같다 — 사람이 고를 수
 * 있는 값이 아니라 데이터가 성립하는 범위이고, 손으로 고칠 수 있는
 * 자리에 두면 넓혀서 "일단 계산되게" 만들고 싶어지는 값이다.
 */
const KOREA_BOUNDS = {
  minLat: 32.5,
  maxLat: 39.5,
  minLon: 124.0,
  maxLon: 132.5,
} as const;

/**
 * 이 좌표를 실제로 쓸 수 있는가. 못 쓰면 `null`.
 *
 * **모르는 값을 통과로 처리하지 않는다.** `0,0`(기니만 한복판, 지오코딩
 * 실패의 전형적인 뒷맛), `NaN`, 뒤바뀐 위경도는 전부 여기서 걸러 "모른다"
 * 쪽으로 간다.
 */
function usableCoordinate(coordinate: Coordinate | null): Coordinate | null {
  if (coordinate === null) return null;
  const { lat, lon } = coordinate;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < KOREA_BOUNDS.minLat || lat > KOREA_BOUNDS.maxLat) return null;
  if (lon < KOREA_BOUNDS.minLon || lon > KOREA_BOUNDS.maxLon) return null;
  return coordinate;
}

/**
 * 룰셋 문구의 자리표시자에 값을 끼워 넣는다. 문장 자체는 한 글자도 여기서
 * 만들지 않는다 — 이 파일에 사용자에게 보일 문자열이 없다는 규칙은
 * `price/assess.ts`와 같다.
 */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

/**
 * 좌표가 쓸 만한 항목만 남긴다.
 *
 * 원본 한 줄의 좌표가 깨져 있다고 목록 전체를 버리지 않는다. 대신 그
 * 항목만 빼는데, 그러다 남는 것이 하나도 없으면 그 줄은 "못 쟀다"가 된다
 * (빈 목록을 "주변에 없다"로 쓰지 않는다).
 */
function usableOnly<T extends { coordinate: Coordinate }>(
  places: readonly T[],
): T[] {
  return places.filter((place) => usableCoordinate(place.coordinate) !== null);
}

/**
 * 이 단지에서 가장 가까운 지하철역.
 *
 * **반경을 두지 않는다.** 역이 아무리 멀어도 "가장 가까운 역이 8km"는 그
 * 자체로 사실이고, 오히려 그 숫자가 사용자에게 필요한 말이다. 반경을 두면
 * 먼 단지에서 이 줄이 통째로 사라지는데, 빈 자리는 "역이 없다"가 아니라
 * "문제없다"로 읽힌다.
 *
 * 목록이 `null`이거나 (좌표가 쓸 만한 항목이 하나도 없어서) 비면 **못
 * 쟀다**로 간다 — 전국 역 목록이 정말로 0개일 수는 없으므로, 빈 목록은
 * 이 단지 주변에 대한 사실이 아니라 데이터가 아직 없다는 사실이다.
 */
function subwayFinding(
  rules: LocationRules,
  from: Coordinate,
  stations: readonly SubwayStation[] | null,
): SubwayFinding {
  const label = rules.subway.label;
  const usable = stations === null ? [] : usableOnly(stations);

  if (usable.length === 0) {
    return { measured: false, label, message: rules.subway.messages.unknown };
  }

  const measured: MeasuredStation[] = usable.map((station) => ({
    name: station.name,
    lineName: station.lineName,
    straightLineMeters: Math.round(
      straightLineMeters(from, station.coordinate),
    ),
  }));

  // 거리가 같으면 이름, 그래도 같으면 노선으로 가른다. 같은 입력이면 늘
  // 같은 역이 나와야 한다 — 화면이 새로고침마다 다른 역을 말하면 어느
  // 쪽도 믿을 수 없어진다.
  measured.sort(
    (a, b) =>
      a.straightLineMeters - b.straightLineMeters ||
      a.name.localeCompare(b.name) ||
      a.lineName.localeCompare(b.lineName),
  );

  const nearest = measured[0];
  if (nearest === undefined) {
    return { measured: false, label, message: rules.subway.messages.unknown };
  }

  return {
    measured: true,
    label,
    message: rules.subway.messages.measured,
    nearest,
  };
}

/**
 * 반경 안의 초등학교들.
 *
 * **이 함수가 이 모듈에서 가장 조심해야 하는 자리다.** 세 결과가 서로
 * 다른 값이어야 한다:
 *
 * 1. 목록을 못 실었다 → `measured: false`. `schools` 필드가 **없다.**
 * 2. 목록은 있는데 반경 안에 없다 → `measured: true`, `schools: []`.
 *    이때의 빈 배열은 "0곳"이라는 **사실**이다.
 * 3. 반경 안에서 찾았다 → `measured: true`, `schools: [...]`.
 *
 * 1과 2를 같은 모양으로 내면 화면이 두 경우에 같은 빈 목록을 그리고, 빈
 * 목록은 언제나 가장 낙관적으로 읽힌다.
 *
 * 반경 안인지는 **화면에 적히는 값**(반올림한 미터)으로 가른다. 재어 낸
 * 실수 그대로 비교하면 반경에 정확히 걸친 학교가 부동소수점 마지막 자리
 * 때문에 들어갔다 나갔다 하고, 무엇보다 화면에 "1000m"라고 적힌 학교가
 * "반경 1000m 안" 목록에서 빠지는 일이 생긴다 — 사용자가 읽는 숫자와
 * 목록에 든 이유가 어긋나면 어느 쪽도 믿을 수 없다. 0.4m를 어느 쪽으로
 * 넣느냐는 애초에 뜻이 없는 차이다(직선거리와 실제 걷는 거리의 차이가
 * 수백 m다).
 */
function schoolFinding(
  rules: LocationRules,
  from: Coordinate,
  schools: readonly ElementarySchool[] | null,
): SchoolFinding {
  const { label, radiusMeters, messages } = rules.elementarySchool;
  const radius = String(radiusMeters);
  const usable = schools === null ? [] : usableOnly(schools);

  if (usable.length === 0) {
    return {
      measured: false,
      label,
      message: fill(messages.unknown, { radius }),
      radiusMeters,
    };
  }

  const within: MeasuredPlace[] = usable
    .map((school) => ({
      name: school.name,
      straightLineMeters: Math.round(
        straightLineMeters(from, school.coordinate),
      ),
    }))
    .filter((entry) => entry.straightLineMeters <= radiusMeters)
    .sort(
      (a, b) =>
        a.straightLineMeters - b.straightLineMeters ||
        a.name.localeCompare(b.name),
    );

  return {
    measured: true,
    label,
    message: fill(within.length === 0 ? messages.none : messages.some, {
      radius,
    }),
    radiusMeters,
    schools: within,
  };
}

/**
 * 이 단지 주변에 무엇이 있는지 **사실만** 말한다.
 *
 * 내는 것은 둘뿐이다: 가장 가까운 지하철역과 그 직선거리, 반경 안의
 * 초등학교와 각각의 직선거리.
 *
 * ## 이 함수가 하지 않는 것 — 점수·등급·순위
 *
 * "학군 90점"·"교통 우수"는 가치판단을 사실처럼 포장한 것이고 검증할 수
 * 없다. 학교까지 400m라는 것은 재면 나오는 사실이지만, 그게 좋은 것인지는
 * 재서 나오지 않는다 — 그 집에 아이가 없을 수도 있고, 400m 사이에 왕복
 * 8차선이 있을 수도 있다. 이 앱이 `medianPrice`를 화면에서 뺀 것과 같은
 * 이유로 이 함수는 어떤 입력에서도 등급을 내지 않는다. 산출 타입에 그런
 * 필드가 아예 없고(`types.ts`), `assess.test.ts`가 입력 공간을 훑어
 * 산출물 어디에도 등급 표현이 없는지 확인한다.
 *
 * ## 좌표를 모를 때
 *
 * 좌표가 없거나 쓸 수 없으면 `state: "unlocated"`를 내고, 그 값에는
 * `subway`·`elementarySchool` **필드 자체가 없다.** 화면이 빈 목록을 그릴
 * 재료를 갖지 못하게 하려는 것이다 — "모른다"가 "주변에 없다"로 접히는
 * 것이 이 화면에서 가장 무거운 결함이다.
 *
 * 근처 단지의 좌표나 법정동 중심점으로 대신 채우지 않는다. 법정동은 한
 * 변이 몇 km라 그걸로 재면 거리가 통째로 틀리는데, 화면은 그 사실을
 * 알아챌 방법이 없다.
 *
 * ## 고지는 어느 갈래에서도 함께 나간다
 *
 * `disclosure`와 `disclaimer`는 상태와 무관하게 **언제나 같은 값**이
 * 실린다. 아무것도 재지 못한 상태에서도 마찬가지다 — 좌표가 생기는 날
 * 고지만 빠뜨리는 경로를 애초에 만들지 않으려는 것이다.
 */
export function assessLocation(
  rules: LocationRules,
  input: LocationInput,
): LocationAssessment {
  const shared = {
    label: rules.label,
    disclosure: rules.disclosure,
    disclaimer: rules.disclaimer,
  };

  const from = usableCoordinate(input.coordinate);

  if (from === null) {
    return {
      state: "unlocated",
      stateLabel: rules.states.unlocated.label,
      stateNote: rules.states.unlocated.note,
      ...shared,
    };
  }

  return {
    state: "located",
    stateLabel: rules.states.located.label,
    stateNote: rules.states.located.note,
    subway: subwayFinding(rules, from, input.subwayStations),
    elementarySchool: schoolFinding(rules, from, input.elementarySchools),
    ...shared,
  };
}
