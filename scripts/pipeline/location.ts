import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
/**
 * 학교알리미 공시(전화·학생 수·교원 수). **없어도 파이프라인은 돈다** —
 * 이 파일은 별도 수집 단계(`npm run pipeline:school-info`)가 만들고 인증키가
 * 필요하므로, 없으면 그 값들만 빠진 채로 굽는다(화면은 그 줄을 내지 않는다).
 */
export const SCHOOL_INFO_SOURCE_PATH = join(SOURCES_DIR, "school-info.csv");
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

/**
 * 학교 하나(급 무관). 중·고 두 배열이 이 모양을 쓰고, 초등학교는 여기에
 * 기본정보를 더한 {@link EmittedElementarySchool}을 쓴다.
 */
export interface EmittedSchool {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * 초등학교 하나 — 좌표에 **화면에 내는 기본정보**를 더한 모양이다.
 *
 * 사용자 지시로 지도에서 초등학교 마커를 누르면 기본정보를 띄우게 되며
 * 실었다. **초등학교에만 싣는다** — 중·고등학교는 지금도 좌표뿐이다
 * (`middleSchools`·`highSchools`). 학교급을 늘려 기본정보까지 붙이면
 * 화면이 "학군"처럼 읽히기 시작하고, 그건 이 앱이 하지 않기로 한
 * 가치판단이다(`buildElementarySchools`의 주석 참고).
 *
 * 값은 전부 원본 「전국초중등학교위치표준데이터」가 준 그대로다 — 우리가
 * 만들거나 추정한 값이 하나도 없다.
 */
export interface EmittedElementarySchool extends EmittedSchool {
  /** 설립형태 — 공립·국립·사립 중 하나 */
  foundationType: string;
  /** 설립일자(YYYY-MM-DD) */
  foundedOn: string;
  /**
   * 소재지 주소. **도로명주소를 쓰고, 없으면 지번주소로 물러난다**
   * (원본에서 초등학교 6,303곳 중 10곳이 도로명주소가 비어 있다) —
   * 둘 다 없으면 빈 문자열이고, 화면은 그 줄을 통째로 내지 않는다.
   */
  address: string;
  /** 시도교육청명(예: 서울특별시교육청) */
  officeOfEducation: string;
  /**
   * 아래 넷은 **학교알리미 공시**에서 온다(`data/sources/school-info.csv`,
   * 위 다섯 필드의 출처인 위치표준데이터와 다른 원본이다). 공시는 해마다
   * 한 번이라 값이 오늘 기준이 아니고, 그래서 화면이 공시 연도를 함께
   * 낸다(`LocationFile.elementarySchoolInfoYear`).
   *
   * **모르는 값은 키를 아예 넣지 않는다** — `null`도 `0`도 아니다. 전화번호는
   * 실제로 285곳 중 50곳이 공시에 없다. 없는 키는 화면에서 자연히 "그 줄을
   * 내지 않는다"가 되지만, `0`을 넣으면 "교원이 0명"이라는 **틀린 사실**이
   * 된다(`data/README.md`의 단지 좌표 관련 같은 이유).
   */
  phone?: string;
  /** 설립유형 — 단설·병설·부설·부속 중 하나 */
  foundationForm?: string;
  /** 학생 수(계·남·여). 계는 남+여이고, 원본의 합계와 맞는지 확인한 값이다 */
  students?: { total: number; male: number; female: number };
  /**
   * 교원 수(계·남·여). 공식 명세(`OpenAPI_Output.xlsx`의 "직위별 교원
   * 현황")의 총계 열이고, 기간제교사·강사를 포함하고 원어민강사는 뺀
   * 수다 — 휴직 교원은 남·여 안에 들어 있다.
   */
  teachers?: { total: number; male: number; female: number };
  /**
   * 교육지원청명(예: 서울특별시동부교육지원청).
   *
   * 이 값을 싣는 이유는 고지 문구와 짝이 맞기 때문이다 — 배정은 학구도로
   * 정해지니 "관할 교육지원청에 확인하라"고 말해 왔는데, 그 교육지원청이
   * 어디인지는 정작 말해 주지 못했다.
   */
  districtOfficeOfEducation: string;
}

export interface LocationFile {
  schemaVersion: 3;
  complexes: EmittedComplexCoordinate[];
  subwayStations: EmittedSubwayStation[];
  /**
   * 초등학교 좌표 **+ 기본정보**(설립·주소·교육청 — 사용자 지시로 지도에서
   * 마커를 누르면 띄운다, {@link EmittedElementarySchool} 참고). 기본정보를
   * 더한 것은 세 학교급 중 이 배열뿐이다.
   *
   * **입지 화면(`LocationFacts.tsx`, `src/lib/location/`)이 쓰는 유일한
   * 학교급이다** — 반경 안 개수를 세고 "학구도가 아니다"라는 고지와 함께
   * 낸다. 그 엔진은 더한 필드를 읽지 않는다(`src/data/location.ts`의
   * `ELEMENTARY_SCHOOLS`는 지금도 좌표·이름만 넘긴다).
   *
   * 아래 `middleSchools`·`highSchools`와 **절대 같은 자리에서 섞지 않는다.**
   * 그 둘은 지도 위 참고 표시(`ComplexMap.tsx`)만을 위한 것이라 반경 집계도,
   * 배정학교 판정도 하지 않는다 — 이 배열 하나만 그 판정 로직에 닿는다.
   */
  elementarySchools: EmittedElementarySchool[];
  /**
   * 위 학교들의 공시 값(전화·학생 수·교원 수)이 **몇 년 공시인가.**
   * 공시는 해마다 한 번이라 값이 오늘 기준이 아니고, 화면은 이 연도를
   * 함께 낸다. 공시 원본을 아직 안 받았으면 이 키가 없다.
   */
  elementarySchoolInfoYear?: string;
  /**
   * 중학교 좌표. **지도 위 참고 표시 전용이다.** 사용자 지시(지도 필터에
   * "학교: 초등/중등/고등학교 표시" 추가)로 새로 실었다 — 지하철역 마커와
   * 같은 성격의 "여기 있다"는 사실 표시일 뿐, 반경 집계·배정학교 판정에는
   * 쓰지 않는다. 그 경계를 넘으면 위 `elementarySchools`가 지키던 "학군처럼
   * 읽히지 않는다"는 원칙이 깨진다 — `src/lib/location/`(입지 화면 엔진)은
   * 이 배열을 절대 들여오지 않는다.
   */
  middleSchools: EmittedSchool[];
  /** 고등학교 좌표. 위 `middleSchools`와 같은 이유·같은 제약. */
  highSchools: EmittedSchool[];
}

/**
 * 3: 초등학교 항목에 기본정보(설립·주소·교육청)를 더했다. 2까지는 초등·중·고가
 * 전부 `{id, name, lat, lon}` 하나로 같았다 — 더한 필드는 초등학교에만 있다.
 */
export const LOCATION_SCHEMA_VERSION = 3;

/** 입지 화면이 세는 학교급. **초등학교 하나뿐이다**(위 `elementarySchools` 문서 참고) */
export const SCHOOL_LEVEL = "초등학교";
/** 원본의 운영상태 중 이 값만 싣는다 — 폐교는 다닐 수 없다 */
export const SCHOOL_OPERATING = "운영";

/**
 * 학교급 하나, 상자 안의 것만 남긴다. 초등·중·고 세 배열이 공유하는
 * 필터링이다 — 담는 학교급만 다르고 나머지 규칙(운영 중인 것만, 상자 안만,
 * 좌표·이름·id가 있는 것만, id 오름차순 정렬)은 같다.
 */
function schoolsAtLevel(
  rows: Array<Record<string, string>>,
  bounds: Bounds,
  level: string,
): Array<{ base: EmittedSchool; row: Record<string, string> }> {
  const out: Array<{ base: EmittedSchool; row: Record<string, string> }> = [];
  for (const row of rows) {
    if (row["학교급구분"] !== level) continue;
    if (row["운영상태"] !== SCHOOL_OPERATING) continue;
    const lat = parseCoordinate(row["위도"] ?? "");
    const lon = parseCoordinate(row["경도"] ?? "");
    if (lat === null || lon === null) continue;
    if (!withinBounds(bounds, lat, lon)) continue;
    const id = (row["학교ID"] ?? "").trim();
    const name = (row["학교명"] ?? "").trim();
    if (id === "" || name === "") continue;
    out.push({ base: { id, name, lat, lon }, row });
  }
  out.sort((a, b) => (a.base.id < b.base.id ? -1 : a.base.id > b.base.id ? 1 : 0));
  return out;
}

/**
 * 소재지 주소 한 줄. **도로명주소를 쓰고, 비어 있으면 지번주소로 물러난다**
 * — 원본에서 초등학교 6,303곳 중 10곳이 도로명주소가 비어 있다. 둘 다
 * 비어 있으면 빈 문자열이고, 그 경우 화면이 주소 줄을 통째로 내지 않는다
 * (없는 것을 아는 척하지 않는다).
 */
function schoolAddress(row: Record<string, string>): string {
  const road = (row["소재지도로명주소"] ?? "").trim();
  if (road !== "") return road;
  return (row["소재지지번주소"] ?? "").trim();
}

/**
 * 초등학교만, 상자 안의 것만 남긴다.
 *
 * **중·고등학교를 넣지 않는다.** 입지 화면이 말하는 것은 초등학교 하나뿐이고,
 * 학교급을 늘리면 화면이 "학군"처럼 읽히기 시작한다 — 그건 이 앱이 하지
 * 않기로 한 가치판단이다. 지도 위 참고 표시용 중·고등학교는 별도
 * 배열(`buildMiddleSchools`·`buildHighSchools`)로 나가고, 이 함수·이 배열은
 * 절대 건드리지 않는다.
 */
export function buildElementarySchools(
  rows: Array<Record<string, string>>,
  bounds: Bounds,
  infoRows: Array<Record<string, string>> = [],
): EmittedElementarySchool[] {
  const info = new Map(infoRows.map((r) => [(r["학교ID"] ?? "").trim(), r]));
  return schoolsAtLevel(rows, bounds, SCHOOL_LEVEL).map(({ base, row }) => ({
    ...base,
    foundationType: (row["설립형태"] ?? "").trim(),
    foundedOn: (row["설립일자"] ?? "").trim(),
    address: schoolAddress(row),
    officeOfEducation: (row["시도교육청명"] ?? "").trim(),
    districtOfficeOfEducation: (row["교육지원청명"] ?? "").trim(),
    ...schoolDisclosure(info.get(base.id)),
  }));
}

/** 정수로 읽히면 그 수, 아니면 `null`(=모른다) */
function wholeNumber(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * 공시에서 온 값들(`data/sources/school-info.csv`)을 학교 항목에 얹을
 * 모양으로 바꾼다. **모르는 값은 키를 만들지 않는다**(위
 * {@link EmittedElementarySchool}의 `phone` 주석 참고).
 *
 * 계·남·여는 **셋이 다 있고 계 = 남 + 여일 때만** 싣는다. 원본이 어긋나면
 * 그건 우리가 컬럼을 잘못 짚었다는 뜻이라, 어긋난 수를 화면에 내보내느니
 * 그 학교만 조용히 비우는 편이 낫다(어긋나는 학교가 있으면
 * `scripts/location-data.test.ts`가 잡는다).
 */
function schoolDisclosure(
  row: Record<string, string> | undefined,
): Partial<EmittedElementarySchool> {
  if (row === undefined) return {};
  const out: Partial<EmittedElementarySchool> = {};

  const phone = (row["전화번호"] ?? "").trim();
  if (phone !== "") out.phone = phone;

  const form = (row["설립유형"] ?? "").trim();
  if (form !== "") out.foundationForm = form;

  const counts = (totalKey: string, maleKey: string, femaleKey: string) => {
    const total = wholeNumber(row[totalKey]);
    const male = wholeNumber(row[maleKey]);
    const female = wholeNumber(row[femaleKey]);
    if (total === null || male === null || female === null) return undefined;
    return total === male + female ? { total, male, female } : undefined;
  };

  const students = counts("학생수", "학생수남", "학생수여");
  if (students !== undefined) out.students = students;
  const teachers = counts("교원수", "교원수남", "교원수여");
  if (teachers !== undefined) out.teachers = teachers;

  return out;
}

/**
 * 중학교만, 상자 안의 것만 남긴다. **지도 위 참고 표시 전용**(위
 * `LocationFile.middleSchools` 문서 참고) — 반경 집계·배정학교 판정에는
 * 쓰지 않는다.
 */
export function buildMiddleSchools(
  rows: Array<Record<string, string>>,
  bounds: Bounds,
): EmittedSchool[] {
  return schoolsAtLevel(rows, bounds, "중학교").map(({ base }) => base);
}

/** 고등학교만, 상자 안의 것만 남긴다. 위 `buildMiddleSchools`와 같은 이유·같은 제약. */
export function buildHighSchools(
  rows: Array<Record<string, string>>,
  bounds: Bounds,
): EmittedSchool[] {
  return schoolsAtLevel(rows, bounds, "고등학교").map(({ base }) => base);
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
 *
 * 중·고등학교는 초등학교와 **같은 버퍼**(`elementarySchoolBufferMeters`)를
 * 쓴다 — 둘 다 반경 규칙이 없는 순수 지도 표시용이라 버퍼의 역할이 "상자
 * 경계 근처에서도 패닝하면 학교가 보이게"뿐이고, 초등학교 버퍼가 이미 그
 * 여유(1,500m)를 넉넉히 두고 있어 새 설정값을 늘릴 이유가 없다.
 */
/**
 * 공시 연도. 행마다 같은 값이지만 **여러 값이 섞여 있으면 싣지 않는다** —
 * 그건 두 해의 공시가 한 파일에 섞였다는 뜻이고, 그때 한 해를 골라 적으면
 * 화면이 틀린 연도를 말하게 된다.
 */
function disclosureYearOf(
  infoRows: Array<Record<string, string>>,
): { elementarySchoolInfoYear?: string } {
  const years = new Set(
    infoRows.map((r) => (r["공시연도"] ?? "").trim()).filter((y) => y !== ""),
  );
  const only = [...years];
  return only.length === 1 ? { elementarySchoolInfoYear: only[0]! } : {};
}

export function buildLocationFile(
  schoolRows: Array<Record<string, string>>,
  stationRows: Array<Record<string, string>>,
  config: LocationConfig,
  infoRows: Array<Record<string, string>> = [],
): LocationFile {
  const schoolBounds = expandBounds(
    config.targetBounds,
    config.elementarySchoolBufferMeters,
  );
  return {
    schemaVersion: LOCATION_SCHEMA_VERSION,
    complexes: [],
    subwayStations: buildSubwayStations(
      stationRows,
      expandBounds(config.targetBounds, config.subwayBufferMeters),
    ),
    elementarySchools: buildElementarySchools(schoolRows, schoolBounds, infoRows),
    ...disclosureYearOf(infoRows),
    middleSchools: buildMiddleSchools(schoolRows, schoolBounds),
    highSchools: buildHighSchools(schoolRows, schoolBounds),
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
  if (
    file.subwayStations.length === 0 ||
    file.elementarySchools.length === 0 ||
    file.middleSchools.length === 0 ||
    file.highSchools.length === 0
  ) {
    throw new Error(
      `거른 결과가 비었습니다(역 ${file.subwayStations.length}곳 / 초등학교 ` +
        `${file.elementarySchools.length}곳 / 중학교 ${file.middleSchools.length}곳 / ` +
        `고등학교 ${file.highSchools.length}곳). location-config.json의 targetBounds가 ` +
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
  const infoRows = existsSync(SCHOOL_INFO_SOURCE_PATH)
    ? readTable(readFileSync(SCHOOL_INFO_SOURCE_PATH, "utf8"))
    : [];
  console.log(
    `원본: 학교 ${schoolRows.length}행 / 역 ${stationRows.length}행`,
  );

  const file = buildLocationFile(schoolRows, stationRows, config, infoRows);
  assertNonEmpty(file);
  emitLocation(file);

  console.log(
    `실은 것: 지하철역 ${file.subwayStations.length}곳(노선별 행) / ` +
      `초등학교 ${file.elementarySchools.length}곳 / 중학교 ${file.middleSchools.length}곳 / ` +
      `고등학교 ${file.highSchools.length}곳 / 단지 좌표 ${file.complexes.length}개`,
  );
  console.log("완료. data/location.json");
}

// run.ts와 같은 이유로 pathToFileURL을 쓴다 — 저장소 경로에 비-ASCII 문자가
// 있어서 문자열로 비교하면 항상 false가 되고, 스크립트가 조용히 아무 일도
// 안 하고 정상 종료한 것처럼 끝난다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runLocationPipeline();
}
