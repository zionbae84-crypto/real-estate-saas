import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import rawLocation from "../data/location.json";
import rawLocationRules from "../rules/location-2026-08.json";
import { parseLocationRules, straightLineMeters } from "../src/lib/location";
import {
  expandBounds,
  loadLocationConfig,
  readTable,
  SCHOOLS_SOURCE_PATH,
  SUBWAY_SOURCE_PATH,
  withinBounds,
  type Bounds,
} from "./pipeline/location";

/**
 * **실제로 실린 입지 데이터**를 원본과 맞대어 확인한다.
 *
 * `scripts/pipeline/location.test.ts`가 거르는 규칙이 의도대로인지를 보는
 * 반면, 이 파일은 지금 저장소에 있는 `data/location.json`이 그 규칙대로
 * 만들어졌는지를 본다 — 규칙이 맞아도 산출물이 낡았거나 손으로 고쳐졌으면
 * 화면이 틀린 거리를 낸다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** 원본 CSV를 직접
 * 읽는 빌드 타임 검사이기 때문이다(`src/no-network.test.ts`가 `src/` 안에서
 * Node 내장 모듈 임포트를 금지한다).
 */

const CONFIG = loadLocationConfig();
const RULES = parseLocationRules(rawLocationRules);
/** 역만 쓰는 상자(서울 25개 구) — 학교는 아래 SCHOOL_TARGET을 따로 쓴다. */
const TARGET = CONFIG.targetBounds;
/** 학교(초·중·고)가 쓰는 상자 — 사용자 지시로 전국이다. */
const SCHOOL_TARGET = CONFIG.schoolTargetBounds;

const SCHOOL_SOURCE = readTable(readFileSync(SCHOOLS_SOURCE_PATH, "utf8"));
const STATION_SOURCE = readTable(readFileSync(SUBWAY_SOURCE_PATH, "utf8"));

/** 우리 데이터가 다루는 위경도 범위(대한민국). assess.ts의 KOREA_BOUNDS와 같은 상자다 */
const KOREA: Bounds = { minLat: 32.5, maxLat: 39.5, minLon: 124.0, maxLon: 132.5 };

interface Placed {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const STATIONS = rawLocation.subwayStations;
const SCHOOLS = rawLocation.elementarySchools;
// 지도 위 참고 표시 전용(위 elementarySchools와 달리 입지 화면 엔진이
// 들여오지 않는다 — scripts/pipeline/location.ts의 LocationFile.middleSchools
// 문서 참고).
const MIDDLE_SCHOOLS = rawLocation.middleSchools;
const HIGH_SCHOOLS = rawLocation.highSchools;
const PLACES: ReadonlyArray<readonly [string, readonly Placed[]]> = [
  ["지하철역", STATIONS],
  ["초등학교", SCHOOLS],
  ["중학교", MIDDLE_SCHOOLS],
  ["고등학교", HIGH_SCHOOLS],
];

/** 상자에서 이 점까지의 최단 거리(m). 상자 안이면 0 */
function metersToBounds(bounds: Bounds, lat: number, lon: number): number {
  const nearestLat = Math.min(Math.max(lat, bounds.minLat), bounds.maxLat);
  const nearestLon = Math.min(Math.max(lon, bounds.minLon), bounds.maxLon);
  return straightLineMeters(
    { lat, lon },
    { lat: nearestLat, lon: nearestLon },
  );
}

describe("전제 — 실제 데이터와 원본을 읽었다", () => {
  it("산출물에 역과 학교가 실려 있다", () => {
    // 비어 있으면 아래 검사들이 전부 공허하게 통과한다.
    expect(STATIONS.length).toBeGreaterThan(100);
    expect(SCHOOLS.length).toBeGreaterThan(100);
    expect(MIDDLE_SCHOOLS.length).toBeGreaterThan(50);
    expect(HIGH_SCHOOLS.length).toBeGreaterThan(50);
  });

  it("원본 두 벌이 저장소에 있다", () => {
    expect(SCHOOL_SOURCE.length).toBeGreaterThan(10_000);
    expect(STATION_SOURCE.length).toBeGreaterThan(1_000);
  });

  it("스키마 버전이 data/README.md가 말하는 값이다", () => {
    expect(rawLocation.schemaVersion).toBe(3);
  });
});

describe("좌표가 성립한다 — 결측·0·NaN이 없다", () => {
  it.each(PLACES)("%s 좌표가 전부 유한한 숫자다", (_label, places) => {
    const bad = places.filter(
      (p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon),
    );
    expect(bad).toEqual([]);
  });

  it.each(PLACES)("%s 좌표에 0이 없다", (_label, places) => {
    // 0,0은 기니만 한복판이고 지오코딩 실패의 전형적인 뒷맛이다. 그 값이
    // 좌표인 척 들어오면 거리 계산은 조용히 성공하고 숫자만 통째로 틀린다.
    expect(places.filter((p) => p.lat === 0 || p.lon === 0)).toEqual([]);
  });

  it.each(PLACES)("%s 좌표가 국내 범위 안이다", (_label, places) => {
    const outside = places
      .filter((p) => !withinBounds(KOREA, p.lat, p.lon))
      .map((p) => `${p.name} ${p.lat},${p.lon}`);
    expect(outside).toEqual([]);
  });

  it.each(PLACES)("%s의 이름과 id가 비어 있지 않다", (_label, places) => {
    expect(
      places.filter((p) => p.id.trim() === "" || p.name.trim() === ""),
    ).toEqual([]);
  });

  it.each(PLACES)("%s의 id가 유일하고 오름차순이다", (_label, places) => {
    const ids = places.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("검사기가 심어 둔 0 좌표와 범위 밖 좌표를 잡아낸다(변이 검사)", () => {
    const poisoned = [
      { id: "x", name: "심은 것", lat: 0, lon: 0 },
      { id: "y", name: "심은 것", lat: 48.85, lon: 2.35 },
      { id: "z", name: "심은 것", lat: Number.NaN, lon: 127 },
    ];
    expect(poisoned.filter((p) => p.lat === 0 || p.lon === 0)).toHaveLength(1);
    // 0,0(기니만)·파리·NaN 셋 다 국내 상자 밖으로 걸린다.
    expect(
      poisoned.filter((p) => !withinBounds(KOREA, p.lat, p.lon)),
    ).toHaveLength(3);
  });
});

describe("초등학교만 실렸다", () => {
  const byId = new Map(SCHOOL_SOURCE.map((row) => [row["학교ID"] ?? "", row]));

  it("전제 — 원본에 중·고등학교가 실제로 들어 있다", () => {
    const levels = new Set(SCHOOL_SOURCE.map((row) => row["학교급구분"]));
    expect(levels).toContain("중학교");
    expect(levels).toContain("고등학교");
  });

  it("실린 학교는 원본에서 전부 초등학교다 — 중·고등학교 0건", () => {
    const levels = SCHOOLS.map((s) => byId.get(s.id)?.["학교급구분"] ?? "원본에 없음");
    const notElementary = levels.filter((level) => level !== "초등학교");
    expect(notElementary).toEqual([]);
  });

  it("원본의 중·고등학교 id는 하나도 실리지 않았다", () => {
    const emitted = new Set(SCHOOLS.map((s) => s.id));
    const leaked = SCHOOL_SOURCE.filter(
      (row) =>
        row["학교급구분"] !== "초등학교" && emitted.has(row["학교ID"] ?? ""),
    ).map((row) => row["학교명"]);
    expect(leaked).toEqual([]);
  });

  it("운영 중이 아닌 학교는 실리지 않았다", () => {
    // 다닐 수 없는 학교를 세면 반경 안 개수가 실제보다 많아진다.
    const notOperating = SCHOOLS.filter(
      (s) => byId.get(s.id)?.["운영상태"] !== "운영",
    ).map((s) => s.name);
    expect(notOperating).toEqual([]);
  });

  it("검사기가 섞여 든 중학교를 잡아낸다(변이 검사)", () => {
    const middle = SCHOOL_SOURCE.find((row) => row["학교급구분"] === "중학교");
    expect(middle).toBeDefined();
    const poisoned = [...SCHOOLS.map((s) => s.id), middle?.["학교ID"] ?? ""];
    const levels = poisoned.map((id) => byId.get(id)?.["학교급구분"]);
    expect(levels.filter((level) => level !== "초등학교")).toHaveLength(1);
  });
});

/**
 * `middleSchools`·`highSchools`는 지도 참고 표시 전용이다(위 PLACES 선언
 * 참고) — 반경 집계·배정학교 판정에 쓰이지 않으므로 위 "초등학교만
 * 실렸다"만큼 무겁게 검사하지 않는다. 핵심은 하나: **학교급이 서로 새지
 * 않는다**(중학교 배열에 초·고등학교가, 고등학교 배열에 초·중학교가 섞이지
 * 않는다).
 */
describe("중·고등학교도 실렸다 — 지도 참고 표시 전용, 학교급이 서로 새지 않는다", () => {
  const byId = new Map(SCHOOL_SOURCE.map((row) => [row["학교ID"] ?? "", row]));

  it.each([
    ["중학교", MIDDLE_SCHOOLS] as const,
    ["고등학교", HIGH_SCHOOLS] as const,
  ])("실린 %s는 원본에서 전부 그 학교급이다 — 다른 급 0건", (level, places) => {
    const levels = places.map((s) => byId.get(s.id)?.["학교급구분"] ?? "원본에 없음");
    expect(levels.filter((l) => l !== level)).toEqual([]);
  });

  it("초등학교·중학교·고등학교 세 배열이 id를 공유하지 않는다", () => {
    const elementaryIds = new Set(SCHOOLS.map((s) => s.id));
    const middleIds = new Set(MIDDLE_SCHOOLS.map((s) => s.id));
    const highIds = new Set(HIGH_SCHOOLS.map((s) => s.id));
    const overlap = [...elementaryIds].filter(
      (id) => middleIds.has(id) || highIds.has(id),
    );
    expect(overlap).toEqual([]);
    expect([...middleIds].filter((id) => highIds.has(id))).toEqual([]);
  });

  it.each([
    ["중학교", MIDDLE_SCHOOLS] as const,
    ["고등학교", HIGH_SCHOOLS] as const,
  ])("%s 중 운영 중이 아닌 곳은 실리지 않았다", (_level, places) => {
    const notOperating = places
      .filter((s) => byId.get(s.id)?.["운영상태"] !== "운영")
      .map((s) => s.name);
    expect(notOperating).toEqual([]);
  });

  /**
   * `middleSchools`·`highSchools`는 지도 참고 표시 전용이다 — 반경 안
   * 개수를 세고 "학구도가 아니다"를 판정하는 입지 화면 엔진
   * (`src/lib/location/`)에 넘기면 그 판정이 "학군처럼 읽히기 시작한다"는
   * 원칙이 깨진다(`data/README.md`의 "location.json" 절 참고).
   *
   * TypeScript 구조적 타입만으로는 이 경계를 막지 못한다 — `MapSchool`과
   * `ElementarySchool`은 모양이 같아 서로 대입된다(`src/data/location.ts`의
   * `MapSchool` 문서 참고). 그래서 소스 텍스트를 직접 훑어, 그 엔진 모듈이
   * 이 두 이름을 아예 언급하지 않는지를 확인한다 —
   * `src/no-network.test.ts`와 같은 태도의 구조적 가드다.
   *
   * **`src/`가 아니라 `scripts/`에 있는 이유**: fs로 소스를 읽어야 하는데
   * `src/no-network.test.ts`가 `src/` 안에서 `node:` 임포트를 전수로
   * 막는다.
   */
  it("입지 화면 엔진(src/lib/location/)은 지도 참고 표시용 학교를 들여오지 않는다", () => {
    const dir = "src/lib/location";
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0); // 스캔 대상이 실제로 있다는 전제

    const leaked = files.filter((name) => {
      const text = readFileSync(join(dir, name), "utf8");
      return (
        /middleSchools|highSchools|MIDDLE_SCHOOLS|HIGH_SCHOOLS|MapSchool/.test(
          text,
        )
      );
    });
    expect(leaked).toEqual([]);
  });
});

describe("단지 좌표는 비어 있다", () => {
  it("complexes가 빈 배열이다", () => {
    // 지오코딩은 다음 작업이다. 근처 단지 좌표도, 법정동 중심점도 채우지
    // 않는다 — 화면이 재는 데 성공하고 숫자만 통째로 틀리는 실패는 눈에
    // 띄지 않아 이 제품이 가장 피해야 하는 종류다.
    expect(rawLocation.complexes).toEqual([]);
  });

  it("산출물 어디에도 단지 키가 없다", () => {
    const text = readFileSync("data/location.json", "utf8");
    expect(text).not.toContain("complexKey");
  });
});

describe("거르는 범위는 코드가 아니라 설정에서 온다", () => {
  /**
   * 상자와 버퍼가 코드에 박히면 `location-config.json`에 적힌 근거와 실제
   * 동작이 따로 놀 수 있고, 그 어긋남은 화면 어디에도 드러나지 않는다.
   * 무엇을 실을지 **고르는 함수들**에 좌표·거리로 읽힐 숫자 리터럴이 하나도
   * 없는지를 본다(0·1은 개수·인덱스라 놓아준다).
   *
   * `expandBounds`·`toRadians`는 검사 대상이 아니다 — 거기 있는 180은
   * 제품의 판단이 아니라 도(度)를 라디안으로 바꾸는 단위 환산이고,
   * `distance.ts`의 지구 반지름과 같은 성질의 값이다.
   */
  const SOURCE = readFileSync("scripts/pipeline/location.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');

  /** 좌표나 거리로 읽힐 숫자 리터럴. 0·1은 개수·인덱스라 놓아준다 */
  function boundsLikeLiterals(code: string): string[] {
    return (code.match(/(?<![\w.$])\d[\d_]*(\.\d+)?/g) ?? []).filter(
      (literal) => Number(literal.split("_").join("")) >= 2,
    );
  }

  function bodyOf(from: string, to: string): string {
    const start = SOURCE.indexOf(from);
    const end = SOURCE.indexOf(to);
    expect(start, from).toBeGreaterThan(-1);
    expect(end, to).toBeGreaterThan(start);
    return SOURCE.slice(start, end);
  }

  it.each([
    ["buildElementarySchools", "export function buildSubwayStations("],
    ["buildSubwayStations", "export function buildLocationFile("],
    ["buildLocationFile", "export function assertNonEmpty("],
  ])("%s에 상자·버퍼로 읽힐 숫자가 없다", (name, next) => {
    expect(boundsLikeLiterals(bodyOf(`export function ${name}(`, next))).toEqual(
      [],
    );
  });

  it("설정 파일이 그 값을 실제로 갖고 있다", () => {
    expect(TARGET.minLat).toBeGreaterThan(0);
    expect(SCHOOL_TARGET.minLat).toBeGreaterThan(0);
    expect(CONFIG.subwayBufferMeters).toBeGreaterThan(0);
    expect(CONFIG.elementarySchoolBufferMeters).toBeGreaterThan(0);
  });

  it("검사기가 박아 넣은 상자를 잡아낸다(변이 검사)", () => {
    expect(
      boundsLikeLiterals("  const TARGET = { minLat: 37.43, maxLat: 37.56 };"),
    ).toEqual(["37.43", "37.56"]);
    expect(boundsLikeLiterals("  const BUFFER_M = 4_000;")).toEqual(["4_000"]);
  });
});

describe("구 경계 밖의 역·학교도 실려 있다", () => {
  /**
   * **이 화면이 조용히 틀릴 수 있는 가장 큰 자리다.** 단지가 있는 구만
   * 담으면 경계 바로 밖의 역·학교가 사라지고, 화면은 더 먼 역을 "가장
   * 가까운 역"이라고 아무 의심 없이 말한다.
   */
  const stationRing = STATIONS.filter(
    (s) => !withinBounds(TARGET, s.lat, s.lon),
  );

  it("우리 단지가 있을 상자 **밖**의 역이 실제로 실려 있다", () => {
    expect(stationRing.length).toBeGreaterThan(0);
  });

  /**
   * 학교 상자(SCHOOL_TARGET)는 **전국 학교 좌표의 실측 범위 그대로**
   * 만들었다(scripts/pipeline/location-config.json의 주석 참고) — 그래서
   * 원본의 어떤 학교도 이 상자 밖에 있을 수 없고, 버퍼가 "상자 밖에서
   * 더 끌어온" 학교는 0곳이 정상이다(옛 서울 3구 상자 때는 이 값이
   * >0이었다 — 그때는 상자가 실제 데이터보다 좁았다). 버퍼가 여전히
   * 지키는 진짜 약속은 이 테스트가 아니라 바로 아래 "반경 안에 들 수
   * 있는 원본 초등학교가 하나도 빠지지 않았다"다.
   */
  it("학교 상자 밖의 원본 학교는 없다 — 상자가 전국 실측 범위 그대로라서다", () => {
    const schoolRing = SCHOOL_SOURCE.filter((row) => {
      if (row["운영상태"] !== "운영") return false;
      const lat = Number(row["위도"]);
      const lon = Number(row["경도"]);
      return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        !withinBounds(SCHOOL_TARGET, lat, lon)
      );
    });
    expect(schoolRing).toEqual([]);
  });

  it("학교 버퍼가 룰셋의 반경보다 크다", () => {
    // 반경보다 작으면 상자 가장자리 단지에서 반경 안의 학교가 빠진다.
    expect(CONFIG.elementarySchoolBufferMeters).toBeGreaterThan(
      RULES.elementarySchool.radiusMeters,
    );
  });

  it("반경 안에 들 수 있는 원본 초등학교가 하나도 빠지지 않았다", () => {
    // 상자 안 어느 점에서 재도 반경 안에 들 수 있는 학교 = 상자에서
    // radiusMeters 이내에 있는 학교. 그 전부가 실려 있어야 한다.
    const emitted = new Set(SCHOOLS.map((s) => s.id));
    const missing = SCHOOL_SOURCE.filter((row) => {
      if (row["학교급구분"] !== "초등학교" || row["운영상태"] !== "운영") return false;
      const lat = Number(row["위도"]);
      const lon = Number(row["경도"]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      if (metersToBounds(SCHOOL_TARGET, lat, lon) > RULES.elementarySchool.radiusMeters) {
        return false;
      }
      return !emitted.has(row["학교ID"] ?? "");
    }).map((row) => row["학교명"]);
    expect(missing).toEqual([]);
  });

  it("상자 안 어디서든 전국에서 가장 가까운 역이 실려 있다", () => {
    // 엔진은 반경 없이 "가장 가까운 역" 하나를 고른다. 그러므로 상자 안
    // 어느 점에서든, 전국 원본 기준 가장 가까운 역이 우리 목록 안에
    // 있어야 한다 — 없으면 화면은 더 먼 역을 가장 가깝다고 말한다.
    const wide = expandBounds(TARGET, 10_000);
    const candidates = STATION_SOURCE.map((row) => ({
      name: row["역사명"] ?? "",
      lineName: row["노선명"] ?? "",
      lat: Number(row["역위도"]),
      lon: Number(row["역경도"]),
    })).filter(
      (s) =>
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lon) &&
        withinBounds(wide, s.lat, s.lon),
    );
    const emitted = new Set(
      STATIONS.map((s) => `${s.name}|${s.lineName}|${s.lat}|${s.lon}`),
    );

    const latStep = (TARGET.maxLat - TARGET.minLat) / 60;
    const lonStep = (TARGET.maxLon - TARGET.minLon) / 80;
    let worst = 0;
    const missing: string[] = [];

    for (let lat = TARGET.minLat; lat <= TARGET.maxLat; lat += latStep) {
      for (let lon = TARGET.minLon; lon <= TARGET.maxLon; lon += lonStep) {
        let best = Number.POSITIVE_INFINITY;
        let bestKey = "";
        for (const s of candidates) {
          const d = straightLineMeters({ lat, lon }, { lat: s.lat, lon: s.lon });
          if (d < best) {
            best = d;
            bestKey = `${s.name}|${s.lineName}|${s.lat}|${s.lon}`;
          }
        }
        if (best > worst) worst = best;
        if (!emitted.has(bestKey)) missing.push(`${lat},${lon} → ${bestKey}`);
      }
    }

    expect(missing.slice(0, 5)).toEqual([]);
    // 격자를 실제로 돌았다는 전제 — 0이면 위 검사가 공허하게 통과한다.
    expect(worst).toBeGreaterThan(0);
    // 가장 가까운 역까지의 거리가 어디서도 10km를 넘지 않으므로, 위에서
    // 후보를 상자+10km로 좁힌 것이 답을 바꾸지 않았다.
    expect(worst).toBeLessThan(10_000);
    // 버퍼는 그 최대값보다 커야 한다. 상자를 넓히면 이 부등식이 먼저 깨진다.
    expect(CONFIG.subwayBufferMeters).toBeGreaterThan(worst);
  });

  it("검사기가 구 경계로 자른 목록을 잡아낸다(변이 검사)", () => {
    // 버퍼 없이 상자만으로 자르면 경계 밖 역·학교가 통째로 사라진다.
    const cut = STATIONS.filter((s) => withinBounds(TARGET, s.lat, s.lon));
    expect(cut.length).toBeLessThan(STATIONS.length);
    expect(
      cut.filter((s) => !withinBounds(TARGET, s.lat, s.lon)),
    ).toHaveLength(0);
  });
});

describe("산출물이 지금 설정·원본과 어긋나지 않았다", () => {
  it("실린 역이 전부 원본에 있는 행이다", () => {
    const source = new Set(
      STATION_SOURCE.map(
        (row) =>
          `${row["역사명"]}|${row["노선명"]}|${Number(row["역위도"])}|${Number(row["역경도"])}`,
      ),
    );
    const unknown = STATIONS.filter(
      (s) => !source.has(`${s.name}|${s.lineName}|${s.lat}|${s.lon}`),
    ).map((s) => s.name);
    expect(unknown).toEqual([]);
  });

  it.each([
    ["초등학교", SCHOOLS] as const,
    ["중학교", MIDDLE_SCHOOLS] as const,
    ["고등학교", HIGH_SCHOOLS] as const,
  ])("실린 %s가 전부 원본에 있는 행이다", (_level, places) => {
    const source = new Map(
      SCHOOL_SOURCE.map((row) => [row["학교ID"] ?? "", row["학교명"] ?? ""]),
    );
    const unknown = places
      .filter((s) => source.get(s.id) !== s.name)
      .map((s) => s.name);
    expect(unknown).toEqual([]);
  });

  it("설정 상자+버퍼 밖의 것이 하나도 실리지 않았다", () => {
    const stationBox = expandBounds(TARGET, CONFIG.subwayBufferMeters);
    // 중·고등학교도 초등학교와 같은 버퍼를 쓴다(scripts/pipeline/location.ts의
    // buildLocationFile 문서 참고).
    const schoolBox = expandBounds(SCHOOL_TARGET, CONFIG.elementarySchoolBufferMeters);
    expect(
      STATIONS.filter((s) => !withinBounds(stationBox, s.lat, s.lon)),
    ).toEqual([]);
    expect(
      SCHOOLS.filter((s) => !withinBounds(schoolBox, s.lat, s.lon)),
    ).toEqual([]);
    expect(
      MIDDLE_SCHOOLS.filter((s) => !withinBounds(schoolBox, s.lat, s.lon)),
    ).toEqual([]);
    expect(
      HIGH_SCHOOLS.filter((s) => !withinBounds(schoolBox, s.lat, s.lon)),
    ).toEqual([]);
  });
});
