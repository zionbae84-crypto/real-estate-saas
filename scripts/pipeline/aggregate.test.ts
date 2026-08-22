import { describe, expect, it } from "vitest";
import { aggregate, areaBucket, median } from "./aggregate";
import { normalizeAll } from "./normalize";
import type { RawTrade, ReportConfig } from "./types";

const config: ReportConfig = {
  underMergeMaxEditDistance: 2,
  overMergeMinPriceRatio: 2.0,
  overMergeMinTradeCount: 4,
  lowConfidenceMinTrades: 3,
};

const AS_OF = new Date("2026-08-22T00:00:00Z");

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    complexName: "은마",
    builtYear: 1979,
    exclusiveAreaSqm: 84.43,
    floor: 5,
    price: 2_000_000_000,
    contractDate: "2026-07-10",
    ...overrides,
  };
}

describe("median", () => {
  it("홀수 개면 가운데 값이다", () => {
    expect(median([100, 300, 200])).toBe(200);
  });

  it("짝수 개면 가운데 둘의 평균을 내림한다", () => {
    expect(median([100, 200, 300, 401])).toBe(250);
  });

  it("1건이면 그 값이다", () => {
    expect(median([777])).toBe(777);
  });

  it("0건이면 0이다", () => {
    expect(median([])).toBe(0);
  });

  it("정수를 반환한다", () => {
    expect(Number.isInteger(median([100, 101]))).toBe(true);
  });
});

describe("areaBucket", () => {
  it("1㎡ 단위로 반올림한다", () => {
    expect(areaBucket(84.97)).toBe(85);
    expect(areaBucket(84.43)).toBe(84);
  });

  it("정확히 .5는 올림한다", () => {
    expect(areaBucket(84.5)).toBe(85);
  });
});

describe("aggregate", () => {
  it("단지 × 평형으로 묶는다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ exclusiveAreaSqm: 84.4 }),
        trade({ exclusiveAreaSqm: 84.4 }),
        trade({ exclusiveAreaSqm: 101.2 }),
      ]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(2);
  });

  it("최근 6개월 거래로 중위값을 낸다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 2_000_000_000, contractDate: "2026-06-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-05-01" }),
        // 8개월 전 — 중위값에서 제외돼야 한다
        trade({ price: 9_000_000_000, contractDate: "2025-12-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.medianPrice).toBe(2_000_000_000);
  });

  it("거래가 3건 미만이면 lowConfidence를 켠다", () => {
    const units = aggregate(normalizeAll([trade(), trade()]), AS_OF, config);
    expect(units[0]?.lowConfidence).toBe(true);
  });

  it("거래가 3건 이상이면 lowConfidence가 꺼진다", () => {
    const units = aggregate(
      normalizeAll([trade(), trade(), trade()]),
      AS_OF,
      config,
    );
    expect(units[0]?.lowConfidence).toBe(false);
  });

  it("최고·최저가를 담는다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000 }),
        trade({ price: 3_000_000_000 }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.minPrice).toBe(1_000_000_000);
    expect(units[0]?.maxPrice).toBe(3_000_000_000);
  });

  it("최근 6개월 거래가 없으면 그 평형을 내지 않는다", () => {
    const units = aggregate(
      normalizeAll([trade({ contractDate: "2025-10-01" })]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(0);
  });

  it("모든 금액이 정수다", () => {
    const units = aggregate(
      normalizeAll([trade({ price: 1_000_000_001 }), trade({ price: 2_000_000_000 })]),
      AS_OF,
      config,
    );
    for (const u of units) {
      expect(Number.isInteger(u.medianPrice)).toBe(true);
      expect(Number.isInteger(u.minPrice)).toBe(true);
      expect(Number.isInteger(u.maxPrice)).toBe(true);
    }
  });

  it("대표 단지명은 원본 표기 중 하나다", () => {
    const units = aggregate(
      normalizeAll([trade({ complexName: "은마 아파트" }), trade({ complexName: "은마아파트" })]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(1);
    expect(["은마 아파트", "은마아파트"]).toContain(units[0]?.complexName);
  });
});
