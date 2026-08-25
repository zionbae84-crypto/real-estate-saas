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
 * 법정동코드 앞 5자리(시군구 단위)로 묶어 중복 제거한다.
 *
 * 시군구명이 빈 문자열인 행은 뺀다 — 시/도 전체를 가리키는 행(예:
 * "1100000000,서울특별시,,")이라 시군구 선택기에는 필요 없다.
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
  return [...byRegionCode.values()].sort((a, b) => a.regionCode.localeCompare(b.regionCode));
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
