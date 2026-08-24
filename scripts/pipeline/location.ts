import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DATA_DIR } from "./config";
import { EARTH_MEAN_RADIUS_M } from "../../src/lib/location/distance";

/**
 * `data/location.json`을 굽는 단계.
 *
 * 입력은 저장소 안에 슬림하게 보관한 표준데이터 두 벌
 * (`data/sources/schools.csv`·`data/sources/subway-stations.csv`)이고,
 * 무엇을 실을지는 `scripts/pipeline/location-config.json`이 정한다.
 * 출력 스키마는 `data/README.md`의 "location.json" 절에 있다.
 *
 * **거래 파이프라인(`run.ts`)과 별개로 돈다.** 저 파이프라인의 입력은
 * `data/raw/`(gitignore된 실거래 캐시)인데 이 단계는 그 캐시가 전혀
 * 필요 없다 — 새로 클론한 저장소에서도 `npm run pipeline:location` 하나로
 * 다시 구울 수 있어야 하므로 묶지 않았다.
 *
 * ## 단지 좌표는 비워 둔다
 *
 * `complexes[]`는 **빈 배열로 나간다.** 지번 주소 지오코딩에 별도 API 키가
 * 필요한데 아직 없다. 그럴듯한 좌표(근처 단지, 법정동 중심점)로 채우면
 * 화면은 재는 데 성공하고 숫자만 통째로 틀리는데, 그 실패는 눈에 띄지
 * 않는다 — 이 제품이 가장 피해야 하는 종류다. 비어 있으면 화면은 지금처럼
 * "아직 위치를 몰라요"를 내고, 그것이 정직한 상태다.
 */

/* ─────────────────────────── 설정 ─────────────────────────── */

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface LocationConfig {
  /** 우리 단지가 있을 수 있는 범위 */
  targetBounds: Bounds;
  /** targetBounds 밖으로 이만큼까지의 역도 싣는다 */
  subwayBufferMeters: number;
  /** targetBounds 밖으로 이만큼까지의 초등학교도 싣는다 */
  elementarySchoolBufferMeters: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export const LOCATION_CONFIG_PATH = join(HERE, "location-config.json");
export const SOURCES_DIR = join(DATA_DIR, "sources");
export const SCHOOLS_SOURCE_PATH = join(SOURCES_DIR, "schools.csv");
export const SUBWAY_SOURCE_PATH = join(SOURCES_DIR, "subway-stations.csv");
export const LOCATION_OUTPUT_PATH = join(DATA_DIR, "location.json");

/**
 * 무엇을 실을지 정하는 설정을 읽는다.
 *
 * **범위를 코드가 아니라 설정에서 읽는 이유:** 지역을 넓히는 날 코드를
 * 고쳐야 하면 그때마다 이 파일의 판단(왜 이 상자인지, 왜 이 버퍼인지)이
 * 함께 흔들린다. `loadRegions()`가 수집 대상 시군구를 설정에서 읽는 것과
 * 같은 태도다.
 */
export function loadLocationConfig(path: string = LOCATION_CONFIG_PATH): LocationConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

  const bounds = raw["targetBounds"];
  if (typeof bounds !== "object" || bounds === null) {
    throw new Error("location-config.json: targetBounds가 없습니다");
  }
  const b = bounds as Record<string, unknown>;
  const corners = ["minLat", "maxLat", "minLon", "maxLon"] as const;
  const values: Record<(typeof corners)[number], number> = {
    minLat: 0,
    maxLat: 0,
    minLon: 0,
    maxLon: 0,
  };
  for (const corner of corners) {
    const value = b[corner];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`location-config.json: targetBounds.${corner}가 숫자가 아닙니다`);
    }
    values[corner] = value;
  }
  if (values.minLat >= values.maxLat || values.minLon >= values.maxLon) {
    throw new Error("location-config.json: targetBounds의 min이 max보다 작아야 합니다");
  }

  const buffers = ["subwayBufferMeters", "elementarySchoolBufferMeters"] as const;
  const meters: Record<(typeof buffers)[number], number> = {
    subwayBufferMeters: 0,
    elementarySchoolBufferMeters: 0,
  };
  for (const key of buffers) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`location-config.json: ${key}는 0보다 큰 숫자여야 합니다`);
    }
    meters[key] = value;
  }

  return { targetBounds: values, ...meters };
}

/* ─────────────────────────── 상자 계산 ─────────────────────────── */

const METERS_PER_DEGREE_LAT = (EARTH_MEAN_RADIUS_M * Math.PI) / 180;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 상자를 사방으로 `meters`만큼 넓힌다.
 *
 * 경도 1도의 실제 길이는 위도가 높을수록 짧다. 상자 안에서 **가장 짧은
 * 쪽**(극에 더 가까운 위도)을 기준으로 경도 여유를 계산해야, 상자 어느
 * 모서리에서도 버퍼가 모자라지 않는다. 넉넉한 쪽으로 틀리면 데이터가 조금
 * 더 실릴 뿐이지만, 모자란 쪽으로 틀리면 경계 밖 역이 빠져 거리가 조용히
 * 틀린다.
 */
export function expandBounds(bounds: Bounds, meters: number): Bounds {
  const latDelta = meters / METERS_PER_DEGREE_LAT;
  const worstLat =
    Math.max(Math.abs(bounds.minLat), Math.abs(bounds.maxLat)) + latDelta;
  const lonDelta =
    meters / (METERS_PER_DEGREE_LAT * Math.cos(toRadians(worstLat)));
  return {
    minLat: bounds.minLat - latDelta,
    maxLat: bounds.maxLat + latDelta,
    minLon: bounds.minLon - lonDelta,
    maxLon: bounds.maxLon + lonDelta,
  };
}

export function withinBounds(bounds: Bounds, lat: number, lon: number): boolean {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lon >= bounds.minLon &&
    lon <= bounds.maxLon
  );
}

/* ─────────────────────────── CSV 읽기 ─────────────────────────── */

/**
 * 아주 작은 CSV 파서. 따옴표로 감싼 필드와 그 안의 `""`만 다룬다.
 *
 * 외부 파서를 의존성에 넣지 않는다 — 파이프라인은 지금 외부 파서 없이
 * 돌고, 우리가 보관하는 원본은 우리가 직접 슬림하게 만든 6~7개 컬럼짜리
 * 파일이라 이 정도면 충분하다.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    // 마지막 줄바꿈 뒤의 빈 줄은 행이 아니다.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

/** 헤더 이름으로 값을 꺼낼 수 있는 행 목록으로 바꾼다 */
export function readTable(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const header = rows[0];
  if (header === undefined) throw new Error("CSV에 헤더가 없습니다");
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = row[index] ?? "";
    });
    return record;
  });
}

/**
 * 좌표 문자열을 숫자로. **못 읽으면 `null`이고, 0으로 채우지 않는다.**
 *
 * 빈 문자열을 `Number()`에 넣으면 `0`이 나오는데, 0,0은 기니만 한복판이라
 * 그대로 실리면 거리 계산은 조용히 성공하고 숫자만 통째로 틀린다.
 */
export function parseCoordinate(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/* ─────────────────────────── 산출물 ─────────────────────────── */

export interface EmittedComplexCoordinate {
  complexKey: string;
  lat: number;
  lon: number;
}

export interface EmittedSubwayStation {
  id: string;
  name: string;
  lineName: string;
  lat: number;
  lon: number;
}

export interface EmittedElementarySchool {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface LocationFile {
  schemaVersion: 1;
  complexes: EmittedComplexCoordinate[];
  subwayStations: EmittedSubwayStation[];
  elementarySchools: EmittedElementarySchool[];
}

export const LOCATION_SCHEMA_VERSION = 1;

/** 이 화면이 세는 학교급. **초등학교 하나뿐이다** */
export const SCHOOL_LEVEL = "초등학교";
/** 원본의 운영상태 중 이 값만 싣는다 — 폐교는 다닐 수 없다 */
export const SCHOOL_OPERATING = "운영";

/**
 * 초등학교만, 상자 안의 것만 남긴다.
 *
 * **중·고등학교를 넣지 않는다.** 이 화면이 말하는 것은 초등학교 하나뿐이고,
 * 학교급을 늘리면 화면이 "학군"처럼 읽히기 시작한다 — 그건 이 앱이 하지
 * 않기로 한 가치판단이다.
 */
export function buildElementarySchools(
  rows: Array<Record<string, string>>,
  bounds: Bounds,
): EmittedElementarySchool[] {
  const out: EmittedElementarySchool[] = [];
  for (const row of rows) {
    if (row["학교급구분"] !== SCHOOL_LEVEL) continue;
    if (row["운영상태"] !== SCHOOL_OPERATING) continue;
    const lat = parseCoordinate(row["위도"] ?? "");
    const lon = parseCoordinate(row["경도"] ?? "");
    if (lat === null || lon === null) continue;
    if (!withinBounds(bounds, lat, lon)) continue;
    const id = (row["학교ID"] ?? "").trim();
    const name = (row["학교명"] ?? "").trim();
    if (id === "" || name === "") continue;
    out.push({ id, name, lat, lon });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * 상자 안의 역을 **노선별 행 그대로** 남긴다.
 *
 * ## 환승역을 역 단위로 합치지 않는 이유
 *
 * 원본은 환승역을 노선마다 다른 행으로 준다. 그 행들은 좌표가 서로 다르다 —
 * 같은 이름의 역이라도 노선별 승강장·출입구가 실제로 떨어져 있기 때문이다
 * (원본에서 상봉역의 두 행은 약 165m 떨어져 있다). 역 단위로 합치려면 그중
 * 한 좌표를 골라야 하는데, 그건 우리가 모르는 것을 정하는 일이고 나머지
 * 노선의 거리를 통째로 틀리게 만든다. 노선 이름도 마찬가지로 하나를 골라야
 * 한다.
 *
 * 엔진은 이 중복을 이미 전제하고 있다 — 가장 가까운 하나만 고르고, 룰셋
 * 문구가 "여러 노선이 지나는 역이면 그중 한 노선만 적혀 있을 수 있어요"라고
 * 말한다. 합치면 아끼는 것은 수십 KB가 아니라 수 KB뿐이고, 잃는 것은 좌표의
 * 사실성이다.
 *
 * 다만 **모든 필드가 똑같은 완전 중복 행**은 뺀다(원본에 실제로 있다).
 * 같은 사실을 두 번 싣는 것이므로 빼도 잃는 사실이 없다.
 */
export function buildSubwayStations(
  rows: Array<Record<string, string>>,
  bounds: Bounds,
): EmittedSubwayStation[] {
  const seen = new Set<string>();
  const kept: EmittedSubwayStation[] = [];

  for (const row of rows) {
    const lat = parseCoordinate(row["역위도"] ?? "");
    const lon = parseCoordinate(row["역경도"] ?? "");
    if (lat === null || lon === null) continue;
    if (!withinBounds(bounds, lat, lon)) continue;
    const name = (row["역사명"] ?? "").trim();
    const lineName = (row["노선명"] ?? "").trim();
    const lineCode = (row["노선번호"] ?? "").trim();
    const stationCode = (row["역번호"] ?? "").trim();
    if (name === "" || lineName === "" || lineCode === "" || stationCode === "") continue;

    // 원본의 역번호는 운영기관마다 따로 매겨져 있어 전국에서 유일하지 않다
    // (광주 101번과 대전 101번이 각각 있다). 노선번호를 앞에 붙여 가른다.
    const id = `${lineCode}-${stationCode}`;
    const fingerprint = [id, name, lineName, lat, lon].join(" ");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    kept.push({ id, name, lineName, lat, lon });
  }

  // 노선번호+역번호가 같은데 내용이 다른 행이 원본에 몇 개 있다(같은 역의
  // 옛 이름과 새 이름, 좌표가 미세하게 다른 두 행 등). id는 화면에 나가지
  // 않는 키일 뿐이므로, 사실을 고르는 대신 순서를 정해 꼬리표를 붙인다.
  kept.sort(
    (a, b) =>
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
      a.name.localeCompare(b.name) ||
      a.lineName.localeCompare(b.lineName) ||
      a.lat - b.lat ||
      a.lon - b.lon,
  );
  const counts = new Map<string, number>();
  const out = kept.map((station) => {
    const n = (counts.get(station.id) ?? 0) + 1;
    counts.set(station.id, n);
    return n === 1 ? station : { ...station, id: `${station.id}#${n}` };
  });

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * 산출물을 만든다.
 *
 * `complexes`는 **언제나 빈 배열**이다 — 지오코딩이 붙기 전까지 채울 수
 * 있는 정직한 값이 없다.
 */
export function buildLocationFile(
  schoolRows: Array<Record<string, string>>,
  stationRows: Array<Record<string, string>>,
  config: LocationConfig,
): LocationFile {
  return {
    schemaVersion: LOCATION_SCHEMA_VERSION,
    complexes: [],
    subwayStations: buildSubwayStations(
      stationRows,
      expandBounds(config.targetBounds, config.subwayBufferMeters),
    ),
    elementarySchools: buildElementarySchools(
      schoolRows,
      expandBounds(config.targetBounds, config.elementarySchoolBufferMeters),
    ),
  };
}

/**
 * 거른 결과가 비면 **쓰지 않고 던진다.**
 *
 * 빈 목록은 `src/data/location.ts`에서 `null`("아직 못 실었다")로 접히므로
 * 화면이 거짓말을 하지는 않지만, 파이프라인이 "성공"한 얼굴로 아무것도
 * 싣지 않고 끝나는 것은 감춰진 실패다(설정의 상자가 엉뚱한 곳을 가리키는
 * 경우가 그렇다). 사람이 놓칠 수 없어야 한다.
 */
export function assertNonEmpty(file: LocationFile): void {
  if (file.subwayStations.length === 0 || file.elementarySchools.length === 0) {
    throw new Error(
      `거른 결과가 비었습니다(역 ${file.subwayStations.length}곳 / 초등학교 ` +
        `${file.elementarySchools.length}곳). location-config.json의 targetBounds가 ` +
        "우리 단지가 있는 지역을 가리키는지, data/sources/의 원본이 비어 있지 않은지 " +
        "확인하세요.",
    );
  }
}

export function emitLocation(
  file: LocationFile,
  outputPath: string = LOCATION_OUTPUT_PATH,
): void {
  writeFileSync(outputPath, JSON.stringify(file));
}

export function runLocationPipeline(): void {
  const config = loadLocationConfig();
  const schoolRows = readTable(readFileSync(SCHOOLS_SOURCE_PATH, "utf8"));
  const stationRows = readTable(readFileSync(SUBWAY_SOURCE_PATH, "utf8"));
  console.log(
    `원본: 학교 ${schoolRows.length}행 / 역 ${stationRows.length}행`,
  );

  const file = buildLocationFile(schoolRows, stationRows, config);
  assertNonEmpty(file);
  emitLocation(file);

  console.log(
    `실은 것: 지하철역 ${file.subwayStations.length}곳(노선별 행) / ` +
      `초등학교 ${file.elementarySchools.length}곳 / 단지 좌표 ${file.complexes.length}개`,
  );
  console.log("완료. data/location.json");
}

// run.ts와 같은 이유로 pathToFileURL을 쓴다 — 저장소 경로에 비-ASCII 문자가
// 있어서 문자열로 비교하면 항상 false가 되고, 스크립트가 조용히 아무 일도
// 안 하고 정상 종료한 것처럼 끝난다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runLocationPipeline();
}
