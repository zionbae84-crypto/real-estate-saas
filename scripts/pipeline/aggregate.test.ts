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

  it("짝수 개 평균을 반올림이 아니라 내림한다", () => {
    // (100+201)/2 = 150.5 — Math.round면 151, Math.floor면 150
    expect(median([100, 201])).toBe(150);
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

  it("asOf 이후 거래는 제외한다 — 미래 거래가 중위값을 오염시키지 않는다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        // asOf(2026-08-22) 이후 거래 — 상한 없이는 최근 6개월에 섞여 들어간다
        trade({ price: 100_000_000_000, contractDate: "2026-09-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.medianPrice).toBe(1_000_000_000);
    expect(units[0]?.tradeCount).toBe(1);
  });

  it("asOf 당일 거래는 포함한다 — 상한은 포함(inclusive) 경계다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 2_000_000_000, contractDate: "2026-08-22" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.tradeCount).toBe(2);
  });

  it("월말 asOf에서 6개월 경계가 밀리지 않는다 — 2026-08-31의 6개월 전은 2026-02-28이다", () => {
    const monthEndAsOf = new Date("2026-08-31T00:00:00Z");
    const units = aggregate(
      normalizeAll([
        // 경계(2026-02-28) 하루 전 — 제외돼야 한다
        trade({ price: 1_000_000_000, contractDate: "2026-02-27" }),
        // 경계 이후 — 포함돼야 한다
        trade({ price: 2_000_000_000, contractDate: "2026-03-01" }),
      ]),
      monthEndAsOf,
      config,
    );
    expect(units[0]?.tradeCount).toBe(1);
    expect(units[0]?.medianPrice).toBe(2_000_000_000);
  });

  it("changeRate3m: 최근 3개월이 그 이전 3개월보다 오르면 양수다", () => {
    const units = aggregate(
      normalizeAll([
        // 최근 3개월(2026-05-22 ~ 2026-08-22): 중위값 3,000,000,000
        trade({ price: 2_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 4_000_000_000, contractDate: "2026-08-01" }),
        // 그 이전 3개월(2026-02-22 ~ 2026-05-22): 중위값 2,000,000,000
        trade({ price: 1_000_000_000, contractDate: "2026-04-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-03-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3m).toBe(0.5);
  });

  it("changeRate3m: 최근 3개월이 그 이전 3개월보다 내리면 음수다", () => {
    const units = aggregate(
      normalizeAll([
        // 최근 3개월: 중위값 2,000,000,000
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-08-01" }),
        // 그 이전 3개월: 중위값 4,000,000,000
        trade({ price: 3_000_000_000, contractDate: "2026-04-01" }),
        trade({ price: 5_000_000_000, contractDate: "2026-03-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3m).toBe(-0.5);
  });

  it("changeRate3m: 이전 3개월 거래가 없으면 null이다", () => {
    const units = aggregate(
      normalizeAll([trade({ price: 1_000_000_000, contractDate: "2026-07-01" })]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3m).toBeNull();
  });

  it("changeRate3m: 이전 3개월 중위값이 0이면 null이다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        // 그 이전 3개월 — 중위값 0
        trade({ price: 0, contractDate: "2026-04-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3m).toBeNull();
  });

  it("changeRate12m: 최근 6개월 대비 그 이전 6개월 변동률을 계산한다", () => {
    const units = aggregate(
      normalizeAll([
        // 최근 6개월(2026-02-22 ~ 2026-08-22): 중위값 6,000,000,000
        trade({ price: 5_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 7_000_000_000, contractDate: "2026-08-01" }),
        // 그 이전 6개월(2025-08-22 ~ 2026-02-22): 중위값 3,000,000,000
        trade({ price: 2_000_000_000, contractDate: "2025-10-01" }),
        trade({ price: 4_000_000_000, contractDate: "2025-12-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate12m).toBe(1);
  });
});
