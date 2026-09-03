/**
 * 학교알리미 공시에서 초등학교의 **전화번호·학생 수·교원 수**를 받아
 * `data/sources/school-info.csv`로 보관한다.
 *
 * ## 왜 별도 단계인가
 *
 * `pipeline:location`(산출물 굽기)은 네트워크를 타지 않는다 — 입력이
 * `data/sources/`의 표준데이터뿐이다. 이 스크립트는 그 **입력을 만드는**
 * 쪽이라 `pipeline:fetch`(실거래 수집)와 같은 자리에 있다: 한 번 받아
 * 저장소에 넣어 두고, 굽는 단계는 그 파일만 읽는다.
 *
 * ## 조인 — 학교코드가 서로 다르다
 *
 * 우리 학교 목록의 id는 한국교육시설안전원 계열(`B000001839`)인데 학교알리미는
 * 자기 코드(`S010000737`)를 쓴다. 둘을 잇는 공식 대응표가 없어서
 * **이름 + 좌표**로 잇는다: 같은 시군구 안에서 학교명이 정확히 같고, 두
 * 원본의 좌표가 {@link MAX_JOIN_DISTANCE_M} 안이어야 한 학교로 본다.
 * 이름만으로 잇지 않는 이유는 동명 학교가 실제로 있기 때문이고(예: 여러
 * 시도의 "중앙초등학교"), 좌표만으로 잇지 않는 이유는 한 부지에 학교가 둘인
 * 경우가 있기 때문이다. 강남구 34곳으로 실측했을 때 34곳 전부 이름이 정확히
 * 같고 좌표도 300m 안이었다.
 *
 * ## 돌리는 법
 *
 *     npm run pipeline:school-info
 *
 * `.env`에 `SCHOOLINFO_API_KEY`가 있어야 한다(학교알리미 OpenAPI 인증키,
 * https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_m0.do 에서 발급). 이 키는
 * **여기서만 쓰인다** — 브라우저 번들에는 들어가지 않는다(`VITE_` 접두사가
 * 없다).
 */

import { readFileSync, writeFileSync } from "node:fs";

const LOCATION_JSON = "data/location.json";
const LEGAL_DONG_CSV = "data/sources/legal-dong-codes.csv";
const OUT_CSV = "data/sources/school-info.csv";

const API_URL = "https://www.schoolinfo.go.kr/openApi.do";
/** 초등학교 */
const SCHOOL_KIND = "02";

/**
 * 공시 연도. 학교알리미는 **해마다 한 번 공시**하고, 그 해 항목이 아직
 * 안 올라왔으면 "해당 연도에 공시되지 않은 항목"으로 실패한다. 값을
 * 코드에 박아 두는 이유는 산출물이 어느 해 공시인지가 화면에 나가는
 * 사실이기 때문이다 — 조용히 최신으로 따라가면 화면의 "2025년 공시"가
 * 어느 날 말없이 딴 해를 가리킨다.
 */
const PUBLISH_YEAR = "2025";

/** 이름이 같아도 이만큼 떨어져 있으면 다른 학교로 본다 */
const MAX_JOIN_DISTANCE_M = 300;

/** 학교알리미 API 구분(공식 출력값 명세 `OpenAPI_Output.xlsx`의 시트 번호) */
const API_TYPE = {
  /** 학교기본정보 — 전화번호·단설/병설 */
  basic: "0",
  /** 성별 학생수 */
  students: "63",
  /** 직위별 교원 현황 */
  teachers: "22",
} as const;

interface OurSchool {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
}

interface ApiRow {
  SCHUL_NM?: string;
  LTTUD?: number;
  LGTUD?: number;
  [key: string]: unknown;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 대략적인 미터 거리. 조인 후보를 거르는 용도라 이 정도 근사면 충분하다. */
function roughMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (a.lat - b.lat) * 111_000;
  const dLon = (a.lon - b.lon) * 88_000;
  return Math.hypot(dLat, dLon);
}

/**
 * 주소 앞머리에서 시도·시군구를 뽑는다.
 *
 * **일반시 아래의 구까지 본다** — 성남시·수원시처럼 시 아래에 구가 있는
 * 곳은 코드가 시가 아니라 구 단위로 매겨져 있고(법정동 코드에서 "성남시"는
 * `4113000000`, "성남시수정구"는 `4113100000`), 학교알리미도 구 단위로만
 * 답한다("성남시"로 부르면 "해당 시군구에 데이터가 존재하지 않습니다").
 * 법정동 코드 파일이 그 이름을 **붙여서** 적으므로(`성남시수정구`) 여기서도
 * 같은 모양으로 맞춘다.
 */
function regionOf(address: string): { sido: string; sgg: string } | null {
  const m = /^(\S+?[시도])\s+(\S+?시)\s+(\S+?구)\s/.exec(address);
  if (m !== null) return { sido: m[1]!, sgg: `${m[2]!}${m[3]!}` };
  const plain = /^(\S+?[시도])\s+(\S+?[구군시])\s/.exec(address);
  return plain === null ? null : { sido: plain[1]!, sgg: plain[2]! };
}

function loadSggCodes(): Map<string, string> {
  const text = readFileSync(LEGAL_DONG_CSV, "utf8");
  const [header, ...lines] = text.trim().split("\n");
  const cols = header!.split(",");
  const at = (name: string) => cols.indexOf(name);
  const codes = new Map<string, string>();
  for (const line of lines) {
    const cells = line.split(",");
    const sido = cells[at("시도명")]?.trim() ?? "";
    const sgg = cells[at("시군구명")]?.trim() ?? "";
    const code = cells[at("법정동코드")]?.trim() ?? "";
    if (sgg === "" || code === "") continue;
    const key = `${sido} ${sgg}`;
    if (!codes.has(key)) codes.set(key, code.slice(0, 5));
  }
  return codes;
}

async function fetchApi(
  apiType: string,
  sidoCode: string,
  sggCode: string,
  apiKey: string,
): Promise<ApiRow[]> {
  const params = new URLSearchParams({
    apiKey,
    apiType,
    pbanYr: PUBLISH_YEAR,
    schulKndCode: SCHOOL_KIND,
    sidoCode,
    sggCode,
  });
  const res = await fetch(`${API_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`${apiType}/${sggCode}: HTTP ${res.status}`);
  const body = (await res.json()) as { resultCode?: string; resultMsg?: string; list?: ApiRow[] };
  if (body.resultCode !== "success") {
    // 그 구에 그 항목이 없을 수 있다 — 통째로 죽이지 않고 비워 둔다.
    console.warn(`  ! ${apiType}/${sggCode}: ${body.resultMsg ?? "실패"}`);
    return [];
  }
  return body.list ?? [];
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

async function main(): Promise<void> {
  const apiKey = process.env.SCHOOLINFO_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    console.error(
      ".env에 SCHOOLINFO_API_KEY가 없습니다 — 학교알리미 OpenAPI 인증키가 필요합니다.",
    );
    process.exitCode = 1;
    return;
  }

  const location = JSON.parse(readFileSync(LOCATION_JSON, "utf8")) as {
    elementarySchools: OurSchool[];
  };
  const schools = location.elementarySchools;
  const sggCodes = loadSggCodes();

  // 우리 학교들이 걸친 시군구만 부른다 — 전국을 받을 이유가 없다.
  const byRegion = new Map<string, OurSchool[]>();
  for (const school of schools) {
    const region = regionOf(school.address);
    if (region === null) {
      console.warn(`  ! 주소에서 시군구를 못 읽음: ${school.name} (${school.address})`);
      continue;
    }
    const key = `${region.sido} ${region.sgg}`;
    byRegion.set(key, [...(byRegion.get(key) ?? []), school]);
  }
  console.log(`학교 ${schools.length}곳이 시군구 ${byRegion.size}곳에 걸쳐 있습니다.`);

  const rows: string[][] = [];
  const unmatched: string[] = [];

  for (const [regionKey, regionSchools] of [...byRegion].sort()) {
    const sggCode = sggCodes.get(regionKey);
    if (sggCode === undefined) {
      console.warn(`  ! 시군구 코드를 못 찾음: ${regionKey}`);
      unmatched.push(...regionSchools.map((s) => s.name));
      continue;
    }
    const sidoCode = sggCode.slice(0, 2);
    const [basic, students, teachers] = await Promise.all([
      fetchApi(API_TYPE.basic, sidoCode, sggCode, apiKey),
      fetchApi(API_TYPE.students, sidoCode, sggCode, apiKey),
      fetchApi(API_TYPE.teachers, sidoCode, sggCode, apiKey),
    ]);
    console.log(
      `${regionKey}(${sggCode}): 우리 ${regionSchools.length}곳 / ` +
        `기본 ${basic.length} 학생 ${students.length} 교원 ${teachers.length}`,
    );

    /** 이름이 같고 좌표가 가까운 한 곳을 고른다(없으면 null) */
    const pick = (list: ApiRow[], school: OurSchool): ApiRow | null => {
      const sameName = list.filter((r) => r.SCHUL_NM === school.name);
      if (sameName.length === 0) return null;
      // 좌표가 있는 목록(기본정보)이면 거리로 한 번 더 거른다.
      const withCoord = sameName.filter(
        (r) => num(r.LTTUD) !== null && num(r.LGTUD) !== null,
      );
      if (withCoord.length === 0) return sameName.length === 1 ? sameName[0]! : null;
      const nearest = withCoord
        .map((r) => ({
          row: r,
          d: roughMeters(school, { lat: num(r.LTTUD)!, lon: num(r.LGTUD)! }),
        }))
        .sort((a, b) => a.d - b.d)[0]!;
      return nearest.d <= MAX_JOIN_DISTANCE_M ? nearest.row : null;
    };

    for (const school of regionSchools) {
      const b = pick(basic, school);
      const s = pick(students, school);
      const t = pick(teachers, school);
      if (b === null && s === null && t === null) {
        unmatched.push(school.name);
        continue;
      }
      const studentsM = s === null ? null : num(s["COL_MSUM"]);
      const studentsW = s === null ? null : num(s["COL_WSUM"]);
      const teachersM = t === null ? null : num(t["COL_SM"]);
      const teachersW = t === null ? null : num(t["COL_SW"]);
      rows.push([
        school.id,
        school.name,
        String(b === null ? "" : ((b["USER_TELNO_GA"] as string | undefined) ?? "").trim()),
        String(b === null ? "" : ((b["SCHUL_FOND_TYP_CODE"] as string | undefined) ?? "").trim()),
        csvCell(studentsM === null || studentsW === null ? null : studentsM + studentsW),
        csvCell(studentsM),
        csvCell(studentsW),
        csvCell(teachersM === null || teachersW === null ? null : teachersM + teachersW),
        csvCell(teachersM),
        csvCell(teachersW),
        PUBLISH_YEAR,
      ]);
    }
  }

  rows.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
  const header = [
    "학교ID",
    "학교명",
    "전화번호",
    "설립유형",
    "학생수",
    "학생수남",
    "학생수여",
    "교원수",
    "교원수남",
    "교원수여",
    // 행마다 같은 값이지만 남긴다 — 이 숫자가 언제 공시된 것인지는
    // 화면에 나가는 사실이라, 파일만 봐도 알 수 있어야 한다.
    "공시연도",
  ];
  writeFileSync(
    OUT_CSV,
    [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n",
    "utf8",
  );
  console.log(
    `\n완료. ${OUT_CSV} (${rows.length}행, 공시 ${PUBLISH_YEAR}년)` +
      (unmatched.length > 0 ? `\n못 이은 학교 ${unmatched.length}곳: ${unmatched.join(", ")}` : ""),
  );
}

await main();
