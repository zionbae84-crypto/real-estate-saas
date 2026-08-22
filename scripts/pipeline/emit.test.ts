import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ComplexUnit } from "./aggregate";
import { buildManifest, buildRegions, buildSchemaDoc, emit } from "./emit";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|1979|은마",
    complexName: "은마",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 1979,
    areaBucket: 84,
    medianPrice: 2_000_000_000,
    tradeCount: 5,
    minPrice: 1_900_000_000,
    maxPrice: 2_100_000_000,
    changeRate3m: 0.02,
    changeRate3mRecentCount: 3,
    changeRate3mPriorCount: 3,
    changeRate3mLowConfidence: false,
    changeRate12m: 0.1,
    changeRate12mRecentCount: 5,
    changeRate12mPriorCount: 5,
    changeRate12mLowConfidence: false,
    lowConfidence: false,
    ...overrides,
  };
}

describe("buildRegions", () => {
  it("등장한 시군구를 중복 없이 모은다", () => {
    const regions = buildRegions([
      unit({ regionCode: "11680" }),
      unit({ regionCode: "11680" }),
      unit({ regionCode: "11650" }),
    ]);
    expect(regions.map((r) => r.regionCode).sort()).toEqual(["11650", "11680"]);
  });

  it("시군구별 단지 수를 센다", () => {
    const regions = buildRegions([
      unit({ regionCode: "11680", complexKey: "a" }),
      unit({ regionCode: "11680", complexKey: "b" }),
    ]);
    expect(regions[0]?.complexCount).toBe(2);
  });

  it("시군구별 평형 수를 센다 — 단지 1개, 평형 2개", () => {
    const regions = buildRegions([
      unit({ regionCode: "11680", complexKey: "a", areaBucket: 84 }),
      unit({ regionCode: "11680", complexKey: "a", areaBucket: 101 }),
    ]);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.complexCount).toBe(1);
    expect(regions[0]?.unitCount).toBe(2);
  });

  it("시군구 산출물은 regionCode로 정렬된다", () => {
    const regions = buildRegions([
      unit({ regionCode: "11680", complexKey: "a" }),
      unit({ regionCode: "11650", complexKey: "b" }),
      unit({ regionCode: "11740", complexKey: "c" }),
    ]);
    expect(regions).toHaveLength(3);
    // regionCode 오름차순 정렬: 11650 < 11680 < 11740
    expect(regions[0]?.regionCode).toBe("11650");
    expect(regions[1]?.regionCode).toBe("11680");
    expect(regions[2]?.regionCode).toBe("11740");
  });
});

describe("buildManifest", () => {
  const asOf = new Date("2026-08-22T03:00:00Z");

  it("생성 일시와 데이터 기준일을 담는다", () => {
    const m = buildManifest([unit()], asOf, "2026-07", "2026-03");
    expect(m.generatedAt).toBe("2026-08-22T03:00:00.000Z");
    expect(m.dataAsOf).toBe("2026-07");
    expect(m.rulesVersion).toBe("2026-03");
  });

  it("단지 수와 평형 수를 센다", () => {
    const m = buildManifest(
      [unit({ complexKey: "a", areaBucket: 84 }), unit({ complexKey: "a", areaBucket: 101 })],
      asOf,
      "2026-07",
      "2026-03",
    );
    expect(m.complexCount).toBe(1);
    expect(m.unitCount).toBe(2);
  });

  it("저신뢰 평형 수를 따로 센다", () => {
    const m = buildManifest(
      [unit({ lowConfidence: true }), unit({ lowConfidence: false })],
      asOf,
      "2026-07",
      "2026-03",
    );
    expect(m.lowConfidenceUnitCount).toBe(1);
  });
});

describe("buildSchemaDoc (I7)", () => {
  it("changeRate12m이 12개월 전 시점도 12개월 창도 아니라는 것을 명시한다", () => {
    const doc = buildSchemaDoc();
    expect(doc).toContain("changeRate12m");
    expect(doc).toMatch(/12개월 전 시점.*아니다|아니다.*12개월/);
  });

  it("실제 필드 이름들을 담는다", () => {
    const doc = buildSchemaDoc();
    for (const field of [
      "complexKey",
      "areaBucket",
      "medianPrice",
      "lowConfidence",
      "changeRate3m",
      "changeRate3mRecentCount",
      "changeRate3mPriorCount",
      "changeRate3mLowConfidence",
      "changeRate12mRecentCount",
      "changeRate12mPriorCount",
      "changeRate12mLowConfidence",
      "dataAsOf",
      "generatedAt",
      "regionCodes",
    ]) {
      expect(doc).toContain(field);
    }
  });

  it("dataAsOf가 계약월 기준이며 신고 지연으로 과소 보고될 수 있음을 설명한다", () => {
    const doc = buildSchemaDoc();
    expect(doc).toMatch(/지연/);
    expect(doc).toMatch(/과소/);
  });

  it("호출할 때마다 바이트 단위로 같은 문서를 낸다 — 결정론", () => {
    expect(buildSchemaDoc()).toBe(buildSchemaDoc());
  });

  it("complexKey 행의 pipe가 이스케이프되어 표 헤더와 같은 열 수를 유지한다", () => {
    // JS 템플릿 리터럴에서 단일 백슬래시(`\|`)는 인식되지 않는 이스케이프라
    // 조용히 사라져 그냥 `|`가 된다 — 표를 깨는 이스케이프 안 된 파이프로
    // 되돌아간다(이 파일이 실제로 겪은 버그). 이스케이프는 반드시
    // `\\|`(소스 상 이중 백슬래시)여야 살아남는다.
    const splitMarkdownRow = (row: string): string[] => row.split(/(?<!\\)\|/);
    const doc = buildSchemaDoc();
    const lines = doc.split("\n");
    const headerLine = lines.find((l) => l.startsWith("| 필드 | 타입 | 단위/창"));
    const complexKeyLine = lines.find((l) => l.startsWith("| complexKey"));
    expect(headerLine).toBeDefined();
    expect(complexKeyLine).toBeDefined();
    expect(complexKeyLine).toContain("\\|");
    expect(splitMarkdownRow(complexKeyLine ?? "").length).toBe(
      splitMarkdownRow(headerLine ?? "").length,
    );
  });
});

describe("emit — 산출물과 함께 스키마 문서를 쓴다 (I7)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "emit-schema-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("data/README.md를 실제 파일로 쓴다", () => {
    emit([unit()], new Date("2026-08-22T00:00:00Z"), "2026-08", "2026-03", root);
    const readmePath = join(root, "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf8");
    expect(content).toContain("changeRate12m");
    expect(content).toContain("lowConfidence");
  });

  it("complexes.json·manifest.json·regions.json도 함께 쓴다", () => {
    emit([unit()], new Date("2026-08-22T00:00:00Z"), "2026-08", "2026-03", root);
    expect(existsSync(join(root, "complexes.json"))).toBe(true);
    expect(existsSync(join(root, "manifest.json"))).toBe(true);
    expect(existsSync(join(root, "regions.json"))).toBe(true);
  });
});
