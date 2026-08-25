import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DATA_DIR } from "./config";

export const REGION_CODES_SOURCE_PATH = join(DATA_DIR, "sources", "legal-dong-codes.csv");
export const REGION_CODES_OUTPUT_PATH = join(DATA_DIR, "legal-dong-codes.json");

export interface RawLegalDongRow {
  code: string;
  sidoName: string;
  sigunguName: string;
  dongName: string;
}

export interface RegionCode {
  regionCode: string;
  sidoName: string;
  sigunguName: string;
}

/** CSV 한 줄을 RawLegalDongRow로 바꾼다. 헤더 행은 호출자가 건너뛴다. */
function parseLine(line: string): RawLegalDongRow {
  const [code = "", sidoName = "", sigunguName = "", dongName = ""] = line.split(",");
  return { code, sidoName, sigunguName, dongName };
}

export function parseCsv(content: string): RawLegalDongRow[] {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  return lines.slice(1).map(parseLine);
}

/**
 * 자치구로 나뉜 시의 **시 단위(모구) 코드**인가.
 *
 * 국토부 실거래가 API의 `LAWD_CD`는 구가 있는 시에서 구 단위 코드를 받는다
 * — 수원시(`41110`)로 물으면 거래가 0건으로 돌아온다. 그런데 법정동코드
 * 원본에는 그 모구 행과 자식 구 행(`41111` 수원시장안구 …)이 나란히 들어
 * 있어, 그대로 두면 선택기에 **고를 수 있는데 항상 0건인 항목**이 남는다.
 * 그리고 화면은 그 0건을 "이 지역엔 최근 6개월 실거래가 자체가 없어요"라는
 * 사실 서술로 그린다 — 확인한 적 없는 것을 확인한 것처럼 말하는, 이 앱이
 * 가장 경계하는 방향의 오류다. 고를 수 없게 만드는 것이 유일하게 정직한
 * 처리다.
 *
 * **앞 4자리가 같다는 것만으로 자르지 않는다.** 실제 데이터에서 충청북도
 * 영동군(`43740`)과 증평군(`43745`)은 앞 4자리가 같지만 증평군은 영동군의
 * 자치구가 아니라 별개의 군이다. 앞 4자리만 보는 규칙은 멀쩡히 조회되는
 * 영동군을 선택기에서 지워 버린다 — 고칠 결함보다 나쁜 결함이다. 그래서
 * 자식 후보의 시군구명이 실제로 이 이름으로 **시작하는지**("수원시장안구"
 * ⊃ "수원시")까지 확인한다.
 */
function hasGuChildren(entry: RegionCode, all: RegionCode[]): boolean {
  if (entry.regionCode[4] !== "0") return false;
  const prefix = entry.regionCode.slice(0, 4);
  return all.some(
    (other) =>
      other.regionCode !== entry.regionCode &&
      other.regionCode.slice(0, 4) === prefix &&
      other.sigunguName.startsWith(entry.sigunguName),
  );
}

/**
 * 법정동코드 앞 5자리(시군구 단위)로 묶어 중복 제거한다.
 *
 * 시군구명이 빈 문자열인 행은 뺀다 — 시/도 전체를 가리키는 행(예:
 * "1100000000,서울특별시,,")이라 시군구 선택기에는 필요 없다.
 *
 * 자치구로 나뉜 시의 시 단위 코드도 뺀다({@link hasGuChildren}).
 */
export function buildRegionCodes(rows: RawLegalDongRow[]): RegionCode[] {
  const byRegionCode = new Map<string, RegionCode>();
  for (const row of rows) {
    if (row.sigunguName === "") continue;
    const regionCode = row.code.slice(0, 5);
    if (!byRegionCode.has(regionCode)) {
      byRegionCode.set(regionCode, {
        regionCode,
        sidoName: row.sidoName,
        sigunguName: row.sigunguName,
      });
    }
  }
  const deduped = [...byRegionCode.values()];
  return deduped
    .filter((entry) => !hasGuChildren(entry, deduped))
    .sort((a, b) => a.regionCode.localeCompare(b.regionCode));
}

export function run(
  sourcePath: string = REGION_CODES_SOURCE_PATH,
  outputPath: string = REGION_CODES_OUTPUT_PATH,
): void {
  const content = readFileSync(sourcePath, "utf8");
  const rows = parseCsv(content);
  const regionCodes = buildRegionCodes(rows);
  writeFileSync(outputPath, JSON.stringify(regionCodes, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run();
}
