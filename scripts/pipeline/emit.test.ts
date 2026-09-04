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
    maxExclusiveAreaSqm: 84.3,
    landLeasehold: "N",
    medianPrice: 2_000_000_000,
    tradeCount: 5,
    minPrice: 1_900_000_000,
    maxPrice: 2_100_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    address: null,
    pnu: null,
    householdCount: null,
    trades: [],
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
  it("실제 필드 이름들을 담는다", () => {
    const doc = buildSchemaDoc();
    for (const field of [
      "complexKey",
      "areaBucket",
      "maxExclusiveAreaSqm",
      "minFloor",
      "maxFloor",
      "unknownFloorCount",
      "lowConfidence",
      "dataAsOf",
      "generatedAt",
      "regionCodes",
    ]) {
      expect(doc).toContain(field);
    }
  });

  it("medianPrice·changeRate류는 내보내지 않는다고 명시한다", () => {
    // 이 필드들은 파이프라인 내부에서는 계산되지만(aggregate.ts) 화면
    // 표시 금지 규칙(부모 스펙 §12: 감정평가법 저촉·수익률 예측 금지)
    // 때문에 complexes.json에는 담기지 않는다. 필드 자체가 없다는 사실을
    // 문서에도 명시해, 화면 개발자가 "빠뜨렸나?" 헷갈리지 않게 한다.
    const doc = buildSchemaDoc();
    expect(doc).toMatch(/medianPrice/);
    expect(doc).toMatch(/changeRate/);
    expect(doc).toMatch(/내보내지 않는다|담지 않는다|제외/);
  });

  it("maxExclusiveAreaSqm 행이 areaBucket과의 관계(반올림 vs 실제값)를 설명한다", () => {
    const doc = buildSchemaDoc();
    const lines = doc.split("\n");
    const row = lines.find((l) => l.startsWith("| maxExclusiveAreaSqm "));
    expect(row).toBeDefined();
    expect(row).toMatch(/최대/);
  });

  it("monthly.json이 별도 파일이고 medianPrice·변동률이 없다는 것을 문서화한다", () => {
    const doc = buildSchemaDoc();
    expect(doc).toContain("monthly.json");
    expect(doc).toMatch(/별도 파일/);
    expect(doc).toMatch(/complexKey\|areaBucket/);
    expect(doc).toContain("tradeCount");
    // "내보내지 않는 필드" 절과 별개로 monthly.json 절도 그 규칙을 되짚는다.
    const monthlySection = doc.slice(doc.indexOf("## monthly.json"));
    expect(monthlySection).toMatch(/medianPrice/);
  });

  it("층 범위 행이 '가격 보정용이 아니다'와 null 의미를 함께 적는다", () => {
    // 이 문서를 읽고 화면을 만드는 사람이 minFloor로 값을 보정하는 것이
    // 이 데이터의 용도라고 오해하면, 산출물은 맞는데 화면이 감정평가를
    // 하게 된다 — changeRate12m 이름 오해를 막으려고 이 문서를 만든 것과
    // 같은 이음매다.
    const doc = buildSchemaDoc();
    const lines = doc.split("\n");
    const row = lines.find((l) => l.startsWith("| minFloor / maxFloor "));
    expect(row).toBeDefined();
    expect(row).toMatch(/보정/);
    expect(row).toMatch(/null/);
    const unknownRow = lines.find((l) => l.startsWith("| unknownFloorCount "));
    expect(unknownRow).toBeDefined();
    expect(unknownRow).toMatch(/채우지 않는다|채워 넣지 않는다/);
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
    expect(content).toContain("maxExclusiveAreaSqm");
    expect(content).toContain("lowConfidence");
  });

  it("complexes.json·manifest.json·regions.json도 함께 쓴다", () => {
    emit([unit()], new Date("2026-08-22T00:00:00Z"), "2026-08", "2026-03", root);
    expect(existsSync(join(root, "complexes.json"))).toBe(true);
    expect(existsSync(join(root, "manifest.json"))).toBe(true);
    expect(existsSync(join(root, "regions.json"))).toBe(true);
  });
});

describe("emit — complexes.json에는 화면에 낼 수 없는 필드를 담지 않는다", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "emit-banned-fields-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const BANNED_FIELDS = [
    "medianPrice",
    "changeRate3m",
    "changeRate3mRecentCount",
    "changeRate3mPriorCount",
    "changeRate3mLowConfidence",
    "changeRate12m",
    "changeRate12mRecentCount",
    "changeRate12mPriorCount",
    "changeRate12mLowConfidence",
    // pnu는 위 필드들과 이유가 다르다(화면 금지가 아니라 내부 조인 키) —
    // 그래도 산출물에 안 나가는 건 같으니 이 목록으로 함께 지킨다.
    "pnu",
  ];

  it("complexes.json에 medianPrice·changeRate류·pnu 필드가 하나도 없다", () => {
    emit([unit()], new Date("2026-08-22T00:00:00Z"), "2026-08", "2026-03", root);
    const written = JSON.parse(
      readFileSync(join(root, "complexes.json"), "utf8"),
    ) as Record<string, unknown>[];
    expect(written).toHaveLength(1);
    const keys = Object.keys(written[0] ?? {});
    for (const banned of BANNED_FIELDS) {
      expect(keys).not.toContain(banned);
    }
  });

  it("complexes.json에는 householdCount(세대수 조회 결과)가 여전히 담긴다", () => {
    emit([unit({ householdCount: 499 })], new Date("2026-08-22T00:00:00Z"), "2026-08", "2026-03", root);
    const written = JSON.parse(
      readFileSync(join(root, "complexes.json"), "utf8"),
    ) as Record<string, unknown>[];
    expect(written[0]?.householdCount).toBe(499);
  });

  it("complexes.json에는 여전히 maxExclusiveAreaSqm과 areaBucket이 함께 담긴다", () => {
    emit(
      [unit({ areaBucket: 85, maxExclusiveAreaSqm: 85.4 })],
      new Date("2026-08-22T00:00:00Z"),
      "2026-08",
      "2026-03",
      root,
    );
    const written = JSON.parse(
      readFileSync(join(root, "complexes.json"), "utf8"),
    ) as Array<{ areaBucket: number; maxExclusiveAreaSqm: number }>;
    expect(written[0]?.areaBucket).toBe(85);
    expect(written[0]?.maxExclusiveAreaSqm).toBe(85.4);
  });

  it("층 범위는 화면이 쓰는 값이므로 그대로 담긴다", () => {
    emit(
      [unit({ minFloor: 2, maxFloor: 21, unknownFloorCount: 3 })],
      new Date("2026-08-22T00:00:00Z"),
      "2026-08",
      "2026-03",
      root,
    );
    const written = JSON.parse(
      readFileSync(join(root, "complexes.json"), "utf8"),
    ) as Array<{
      minFloor: number | null;
      maxFloor: number | null;
      unknownFloorCount: number;
    }>;
    expect(written[0]?.minFloor).toBe(2);
    expect(written[0]?.maxFloor).toBe(21);
    expect(written[0]?.unknownFloorCount).toBe(3);
  });

  it("층을 하나도 못 믿은 평형은 null이 그대로 담긴다 — 0으로 채우지 않는다", () => {
    emit(
      [unit({ minFloor: null, maxFloor: null, unknownFloorCount: 5 })],
      new Date("2026-08-22T00:00:00Z"),
      "2026-08",
      "2026-03",
      root,
    );
    const raw = readFileSync(join(root, "complexes.json"), "utf8");
    expect(raw).toContain('"minFloor":null');
    expect(raw).toContain('"maxFloor":null');
    expect(raw).not.toContain('"minFloor":0');
  });
});
