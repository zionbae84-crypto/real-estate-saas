import { describe, expect, it } from "vitest";
import type { ComplexUnit } from "./aggregate";
import { buildManifest, buildRegions } from "./emit";

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
