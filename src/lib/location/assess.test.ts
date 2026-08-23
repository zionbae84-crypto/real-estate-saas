import { describe, expect, it } from "vitest";
import {
  bargainClaimsIn,
  ratingClaimsIn,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawLocationRules from "../../../rules/location-2026-08.json";
import { assessLocation } from "./assess";
import { EARTH_MEAN_RADIUS_M } from "./distance";
import { parseLocationRules } from "./rules";
import type {
  Coordinate,
  ElementarySchool,
  LocationAssessment,
  LocationInput,
  SubwayStation,
} from "./types";

const rules = parseLocationRules(rawLocationRules);
const RADIUS = rules.elementarySchool.radiusMeters;

/**
 * 픽스처는 **전부 지어낸 것이고 그렇게 보이도록** 이름을 지었다.
 *
 * 실제 학교 이름·역 이름·좌표를 쓰지 않는다. 진짜처럼 보이는 픽스처는
 * 언젠가 "이미 데이터가 있다"는 착각을 만들고, 그 착각은 좌표가 없는
 * 지금 이 화면이 무엇을 말해야 하는지를 흐린다.
 *
 * 기준점은 서울 언저리의 **둥근 값**이다 — 어떤 실제 단지의 좌표도 아니다.
 */
const BASE: Coordinate = { lat: 37.5, lon: 127.0 };

/** 자오선을 따라 1도 = 이만큼(m). 북쪽으로 정확히 N미터 옮길 때 쓴다 */
const METERS_PER_DEGREE_LAT = (EARTH_MEAN_RADIUS_M * Math.PI) / 180;

/** 기준점에서 정북으로 `meters`만큼 떨어진 좌표 */
function north(meters: number): Coordinate {
  return { lat: BASE.lat + meters / METERS_PER_DEGREE_LAT, lon: BASE.lon };
}

function school(name: string, meters: number): ElementarySchool {
  return { id: `fixture-school-${name}`, name, coordinate: north(meters) };
}

function station(name: string, meters: number): SubwayStation {
  return {
    id: `fixture-station-${name}`,
    name,
    lineName: "픽스처선",
    coordinate: north(meters),
  };
}

function input(overrides: Partial<LocationInput> = {}): LocationInput {
  return {
    coordinate: BASE,
    subwayStations: [station("픽스처역 가", 400)],
    elementarySchools: [school("픽스처초등학교 가", 300)],
    ...overrides,
  };
}

/** 산출물 안의 모든 문자열을 모은다(탐지기에 통째로 넣으려고) */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

/** 산출물 안의 모든 `키: 숫자` 쌍을 모은다 */
function allNumberKeys(value: unknown, path = ""): string[] {
  if (typeof value === "number") return [path];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => allNumberKeys(entry, `${path}[]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      allNumberKeys(entry, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe("입지 사실 — 좌표를 모를 때", () => {
  /**
   * 이 블록이 이 모듈의 심장이다. 반경 안에 초등학교가 0곳인 것과 좌표를
   * 몰라 못 세는 것은 완전히 다른 사실인데, 화면에서 둘 다 "빈 목록"이
   * 되면 사용자는 언제나 낙관적인 쪽으로 읽는다.
   *
   * **문구 비교로 확인하지 않는다.** 문구는 나중에 누가 합칠 수 있다.
   * 값의 **모양**으로 확인한다 — 좌표를 모를 때는 화면이 목록을 그릴
   * 재료 자체를 받지 못한다.
   */
  it("좌표가 null이면 subway·elementarySchool 필드가 아예 없다", () => {
    const result = assessLocation(rules, input({ coordinate: null }));

    expect(result.state).toBe("unlocated");
    expect(Object.keys(result)).not.toContain("subway");
    expect(Object.keys(result)).not.toContain("elementarySchool");
    expect("subway" in result).toBe(false);
    expect("elementarySchool" in result).toBe(false);
  });

  it("좌표가 null이면 산출물 어디에도 개수를 셀 수 있는 목록이 없다", () => {
    const result = assessLocation(rules, input({ coordinate: null }));
    // 배열이 하나라도 있으면 화면이 length를 읽어 "0곳"을 그릴 수 있다.
    // 면책 문구(disclaimer)만은 상태와 무관한 고정 문장이라 예외다.
    const arrayPaths = allNumberKeys(result).filter((p) => p.includes("[]"));
    expect(arrayPaths).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('"schools"');
    expect(JSON.stringify(result)).not.toContain('"nearest"');
  });

  it("학교·역 목록이 아무리 많아도 좌표를 모르면 여전히 모른다", () => {
    // 재료가 있다고 모르는 위치가 알려지지 않는다. 근처 단지 좌표나
    // 법정동 중심점으로 대신 채우는 경로가 없다는 뜻이기도 하다.
    const result = assessLocation(
      rules,
      input({
        coordinate: null,
        elementarySchools: [
          school("픽스처초등학교 가", 100),
          school("픽스처초등학교 나", 200),
          school("픽스처초등학교 다", 300),
        ],
        subwayStations: [station("픽스처역 가", 50)],
      }),
    );
    expect(result.state).toBe("unlocated");
  });

  it.each<[string, Coordinate]>([
    ["0,0 (지오코딩 실패의 전형)", { lat: 0, lon: 0 }],
    ["NaN", { lat: Number.NaN, lon: 127 }],
    ["무한대", { lat: 37.5, lon: Number.POSITIVE_INFINITY }],
    ["위경도가 뒤바뀐 값", { lat: 127.0, lon: 37.5 }],
    ["국내 범위 밖(도쿄 언저리)", { lat: 35.68, lon: 139.76 }],
  ])("쓸 수 없는 좌표(%s)도 '모른다'로 간다", (_label, coordinate) => {
    const result = assessLocation(rules, input({ coordinate }));
    expect(result.state).toBe("unlocated");
  });

  it("'모른다' 문구가 '주변에 없다' 문구와 다르다", () => {
    // 구조로 갈라 놓은 것을 문구까지 확인한다 — 구조가 달라도 두 문장이
    // 같으면 화면에서는 결국 같은 말이 된다.
    const unlocated = assessLocation(rules, input({ coordinate: null }));
    const empty = assessLocation(
      rules,
      input({ elementarySchools: [school("픽스처초등학교 멀리", RADIUS * 3)] }),
    );
    expect(empty.state).toBe("located");
    if (empty.state !== "located") return;

    expect(unlocated.stateNote).not.toBe(empty.elementarySchool.message);
    // "재지 못했다"는 말이 실제로 들어 있다.
    expect(unlocated.stateNote).toContain("못");
  });
});

describe("입지 사실 — 초등학교", () => {
  it("목록을 못 실으면 schools 필드가 없다(모름)", () => {
    const result = assessLocation(rules, input({ elementarySchools: null }));
    expect(result.state).toBe("located");
    if (result.state !== "located") return;

    expect(result.elementarySchool.measured).toBe(false);
    expect(Object.keys(result.elementarySchool)).not.toContain("schools");
    expect(result.elementarySchool.message).toBe(
      rules.elementarySchool.messages.unknown.split("{radius}").join(String(RADIUS)),
    );
  });

  it("빈 목록도 '모름'이다 — 전국 학교가 0곳일 수는 없다", () => {
    const result = assessLocation(rules, input({ elementarySchools: [] }));
    expect(result.state).toBe("located");
    if (result.state !== "located") return;
    expect(result.elementarySchool.measured).toBe(false);
  });

  it("좌표가 깨진 학교만 있으면 '모름'이다 — 빈 목록으로 접지 않는다", () => {
    const broken: ElementarySchool = {
      id: "fixture-broken",
      name: "픽스처초등학교 좌표없음",
      coordinate: { lat: 0, lon: 0 },
    };
    const result = assessLocation(rules, input({ elementarySchools: [broken] }));
    expect(result.state).toBe("located");
    if (result.state !== "located") return;
    expect(result.elementarySchool.measured).toBe(false);
  });

  it("반경 안에 한 곳도 없으면 그것은 '0곳'이라는 사실이다", () => {
    const result = assessLocation(
      rules,
      input({ elementarySchools: [school("픽스처초등학교 멀리", RADIUS + 50)] }),
    );
    expect(result.state).toBe("located");
    if (result.state !== "located") return;

    const finding = result.elementarySchool;
    expect(finding.measured).toBe(true);
    if (!finding.measured) return;
    expect(finding.schools).toEqual([]);
    expect(finding.message).toBe(
      rules.elementarySchool.messages.none.split("{radius}").join(String(RADIUS)),
    );
  });

  it("'0곳'과 '모름'은 서로 다른 문구를 쓴다", () => {
    const unknown = assessLocation(rules, input({ elementarySchools: null }));
    const none = assessLocation(
      rules,
      input({ elementarySchools: [school("픽스처초등학교 멀리", RADIUS * 2)] }),
    );
    if (unknown.state !== "located" || none.state !== "located") {
      throw new Error("전제가 깨졌어요");
    }
    expect(unknown.elementarySchool.message).not.toBe(
      none.elementarySchool.message,
    );
  });

  it("반경 안의 학교를 가까운 차례로 낸다", () => {
    const result = assessLocation(
      rules,
      input({
        elementarySchools: [
          school("픽스처초등학교 다", 800),
          school("픽스처초등학교 가", 150),
          school("픽스처초등학교 나", 420),
          school("픽스처초등학교 라", RADIUS + 1),
        ],
      }),
    );
    if (result.state !== "located") throw new Error("전제가 깨졌어요");
    const finding = result.elementarySchool;
    if (!finding.measured) throw new Error("전제가 깨졌어요");

    expect(finding.schools.map((s) => s.name)).toEqual([
      "픽스처초등학교 가",
      "픽스처초등학교 나",
      "픽스처초등학교 다",
    ]);
    expect(finding.schools.map((s) => s.straightLineMeters)).toEqual([
      150, 420, 800,
    ]);
  });

  it("반경에 정확히 걸친 학교는 반경 안이다", () => {
    const result = assessLocation(
      rules,
      input({ elementarySchools: [school("픽스처초등학교 경계", RADIUS)] }),
    );
    if (result.state !== "located") throw new Error("전제가 깨졌어요");
    const finding = result.elementarySchool;
    if (!finding.measured) throw new Error("전제가 깨졌어요");
    expect(finding.schools).toHaveLength(1);
  });

  it("반경은 룰셋에서 온다 — 값을 바꾸면 결과가 따라 바뀐다", () => {
    // 코드에 미터가 박혀 있으면 이 검사가 실패한다.
    const narrow = parseLocationRules({
      ...rawLocationRules,
      elementarySchool: { ...rawLocationRules.elementarySchool, radiusMeters: 500 },
    });
    const wide = parseLocationRules({
      ...rawLocationRules,
      elementarySchool: { ...rawLocationRules.elementarySchool, radiusMeters: 2000 },
    });
    const schools = [school("픽스처초등학교 가", 700)];

    const narrowResult = assessLocation(narrow, input({ elementarySchools: schools }));
    const wideResult = assessLocation(wide, input({ elementarySchools: schools }));
    if (narrowResult.state !== "located" || wideResult.state !== "located") {
      throw new Error("전제가 깨졌어요");
    }
    const a = narrowResult.elementarySchool;
    const b = wideResult.elementarySchool;
    if (!a.measured || !b.measured) throw new Error("전제가 깨졌어요");

    expect(a.schools).toHaveLength(0);
    expect(b.schools).toHaveLength(1);
    expect(a.radiusMeters).toBe(500);
    expect(b.radiusMeters).toBe(2000);
    // 문구 안의 숫자도 룰셋 값에서 온다.
    expect(a.message).toContain("500");
    expect(b.message).toContain("2000");
  });
});

describe("입지 사실 — 지하철역", () => {
  it("목록을 못 실으면 nearest 필드가 없다(모름)", () => {
    const result = assessLocation(rules, input({ subwayStations: null }));
    if (result.state !== "located") throw new Error("전제가 깨졌어요");
    expect(result.subway.measured).toBe(false);
    expect(Object.keys(result.subway)).not.toContain("nearest");
    expect(result.subway.message).toBe(rules.subway.messages.unknown);
  });

  it("빈 목록도 '모름'이다", () => {
    const result = assessLocation(rules, input({ subwayStations: [] }));
    if (result.state !== "located") throw new Error("전제가 깨졌어요");
    expect(result.subway.measured).toBe(false);
  });

  it("가장 가까운 역 하나만 낸다", () => {
    const result = assessLocation(
      rules,
      input({
        subwayStations: [
          station("픽스처역 나", 1200),
          station("픽스처역 가", 350),
          station("픽스처역 다", 4000),
        ],
      }),
    );
    if (result.state !== "located") throw new Error("전제가 깨졌어요");
    const finding = result.subway;
    if (!finding.measured) throw new Error("전제가 깨졌어요");

    expect(finding.nearest.name).toBe("픽스처역 가");
    expect(finding.nearest.straightLineMeters).toBe(350);
    expect(finding.nearest.lineName).toBe("픽스처선");
  });

  it("역이 아주 멀어도 그 사실을 그대로 말한다(반경으로 지우지 않는다)", () => {
    // 반경을 두면 먼 단지에서 이 줄이 통째로 사라지는데, 빈 자리는
    // "역이 없다"가 아니라 "문제없다"로 읽힌다.
    const result = assessLocation(
      rules,
      input({ subwayStations: [station("픽스처역 아주멀리", 8_000)] }),
    );
    if (result.state !== "located") throw new Error("전제가 깨졌어요");
    const finding = result.subway;
    if (!finding.measured) throw new Error("전제가 깨졌어요");
    expect(finding.nearest.straightLineMeters).toBe(8_000);
  });

  it("거리가 같으면 늘 같은 역을 고른다(결정론)", () => {
    const stations = [station("픽스처역 나", 500), station("픽스처역 가", 500)];
    const first = assessLocation(rules, input({ subwayStations: stations }));
    const second = assessLocation(
      rules,
      input({ subwayStations: [...stations].reverse() }),
    );
    if (first.state !== "located" || second.state !== "located") {
      throw new Error("전제가 깨졌어요");
    }
    const a = first.subway;
    const b = second.subway;
    if (!a.measured || !b.measured) throw new Error("전제가 깨졌어요");
    expect(a.nearest.name).toBe(b.nearest.name);
    expect(a.nearest.name).toBe("픽스처역 가");
  });
});

/* ──────────────── 입력 공간 훑기 ──────────────── */

const COORDINATES: Array<[string, Coordinate | null]> = [
  ["모름", null],
  ["0,0", { lat: 0, lon: 0 }],
  ["범위 밖", { lat: 35.68, lon: 139.76 }],
  ["기준점", BASE],
  ["남쪽 끝 언저리", { lat: 33.2, lon: 126.5 }],
  ["북쪽 끝 언저리", { lat: 38.4, lon: 128.2 }],
];

const STATION_SETS: Array<[string, readonly SubwayStation[] | null]> = [
  ["모름", null],
  ["빈 목록", []],
  ["아주 가까움", [station("픽스처역 가", 30)]],
  ["아주 멂", [station("픽스처역 나", 20_000)]],
  [
    "여러 곳",
    [station("픽스처역 다", 900), station("픽스처역 라", 250)],
  ],
];

const SCHOOL_SETS: Array<[string, readonly ElementarySchool[] | null]> = [
  ["모름", null],
  ["빈 목록", []],
  ["반경 밖만", [school("픽스처초등학교 멀리", 3000)]],
  ["반경 안 한 곳", [school("픽스처초등학교 가", 200)]],
  [
    "반경 안 여러 곳",
    [
      school("픽스처초등학교 가", 120),
      school("픽스처초등학교 나", 610),
      school("픽스처초등학교 다", 980),
    ],
  ],
];

const EVERY_INPUT: Array<[string, LocationInput]> = COORDINATES.flatMap(
  ([coordLabel, coordinate]) =>
    STATION_SETS.flatMap(([stationLabel, subwayStations]) =>
      SCHOOL_SETS.map(
        ([schoolLabel, elementarySchools]) =>
          [
            `좌표 ${coordLabel} · 역 ${stationLabel} · 학교 ${schoolLabel}`,
            { coordinate, subwayStations, elementarySchools },
          ] as [string, LocationInput],
      ),
    ),
);

/**
 * 산출물에서 숫자가 실릴 수 있는 **모든** 자리.
 *
 * 점수·등급은 결국 숫자로 나타난다. 자리를 통째로 못박아 두면, 누가
 * `locationScore`나 `transitGrade` 같은 필드를 새로 만드는 순간 아래
 * 검사가 죽는다 — 그때 이 배열을 늘리려면 "이 숫자가 사실인가 판단인가"를
 * 한 번은 생각하게 된다.
 */
const ALLOWED_NUMBER_KEYS: readonly string[] = [
  // 어느 범위를 센 것인가(룰셋에서 그대로 온 값)
  "elementarySchool.radiusMeters",
  // 잰 직선거리 — 이 모듈이 내는 유일한 관측치
  "elementarySchool.schools[].straightLineMeters",
  "subway.nearest.straightLineMeters",
];

describe("어떤 입력으로도 점수·등급·'좋다'류 결론이 나오지 않는다", () => {
  it("입력 조합을 충분히 훑는다(전제)", () => {
    expect(EVERY_INPUT.length).toBe(
      COORDINATES.length * STATION_SETS.length * SCHOOL_SETS.length,
    );
    expect(EVERY_INPUT.length).toBeGreaterThan(100);
  });

  it.each(EVERY_INPUT)("%s — 산출물이 등급을 말하지 않는다", (_label, given) => {
    const result = assessLocation(rules, given);
    const strings = allStrings(result);
    expect(strings.length).toBeGreaterThan(0);
    expect(strings.flatMap(ratingClaimsIn)).toEqual([]);
  });

  it.each(EVERY_INPUT)("%s — 산출물이 '안전'을 주장하지 않는다", (_label, given) => {
    expect(allStrings(assessLocation(rules, given)).flatMap(safetyClaimsIn)).toEqual(
      [],
    );
  });

  it.each(EVERY_INPUT)("%s — 산출물이 값을 매기지 않는다", (_label, given) => {
    expect(
      allStrings(assessLocation(rules, given)).flatMap(bargainClaimsIn),
    ).toEqual([]);
  });

  it.each(EVERY_INPUT)(
    "%s — 산출물의 숫자는 거리와 반경뿐이다",
    (_label, given) => {
      // 점수·등급은 결국 숫자로 나타난다. 숫자가 실릴 수 있는 자리를
      // 통째로 못박아 두면, 새 점수 필드를 만드는 순간 이 검사가 죽는다.
      const numberKeys = new Set(allNumberKeys(assessLocation(rules, given)));
      for (const key of numberKeys) {
        expect(
          ALLOWED_NUMBER_KEYS,
          `산출물에 새 숫자 필드가 생겼어요: ${key}`,
        ).toContain(key);
      }
    },
  );

  it.each(EVERY_INPUT)("%s — 고지 넷이 언제나 함께 나간다", (_label, given) => {
    const result = assessLocation(rules, given);
    expect(result.disclosure.straightLineNote).toBe(
      rules.disclosure.straightLineNote,
    );
    expect(result.disclosure.schoolZoneNote).toBe(rules.disclosure.schoolZoneNote);
    expect(result.disclosure.missingFactorsNote).toBe(
      rules.disclosure.missingFactorsNote,
    );
    expect(result.disclosure.notARatingNote).toBe(rules.disclosure.notARatingNote);
    expect(result.disclaimer).toEqual(rules.disclaimer);
  });

  it.each(EVERY_INPUT)(
    "%s — 좌표를 모르면 목록을 그릴 재료가 없다",
    (_label, given) => {
      const result: LocationAssessment = assessLocation(rules, given);
      if (result.state !== "unlocated") return;
      expect("subway" in result).toBe(false);
      expect("elementarySchool" in result).toBe(false);
    },
  );
});

describe("숫자 필드 못박기 검사 자체가 살아 있는가(변이 검사)", () => {
  it("산출물에 점수 필드를 심으면 잡아낸다", () => {
    const result = assessLocation(rules, input());
    const poisoned = { ...result, locationScore: 90 };
    const keys = allNumberKeys(poisoned);
    expect(keys).toContain("locationScore");
    expect(keys.every((k) => ALLOWED_NUMBER_KEYS.includes(k))).toBe(false);
  });

  it("산출물에 등급 문구를 심으면 잡아낸다", () => {
    const result = assessLocation(rules, input());
    const poisoned = { ...result, stateNote: "교통이 우수해요." };
    expect(allStrings(poisoned).flatMap(ratingClaimsIn)).not.toEqual([]);
  });
});
