import { describe, expect, it } from "vitest";
import { aggregate, areaBucket, median } from "./aggregate";
import { normalizeAll } from "./normalize";
import type { RawTrade, ReportConfig } from "./types";

const config: ReportConfig = {
  underMergeMaxEditDistance: 2,
  overMergeMinPriceRatio: 2.0,
  overMergeMinTradeCount: 4,
  lowConfidenceMinTrades: 3,
  emptyRatioWarnThreshold: 0.2,
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

  it("aggregate 산출물은 complexKey로 정렬된다", () => {
    const units = aggregate(
      normalizeAll([
        // 의도적으로 역순으로 입력: C, A, B
        trade({
          builtYear: 2000,
          complexName: "C아파트",
          price: 1_000_000_000,
        }),
        trade({
          builtYear: 2000,
          complexName: "A아파트",
          price: 2_000_000_000,
        }),
        trade({
          builtYear: 2000,
          complexName: "B아파트",
          price: 3_000_000_000,
        }),
      ]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(3);
    // complexKey로 정렬되었으므로 A < B < C 순서여야 함
    expect(units[0]?.complexName).toContain("A");
    expect(units[1]?.complexName).toContain("B");
    expect(units[2]?.complexName).toContain("C");
  });

  it("changeRate3m: 두 창 모두 거래가 충분하면 lowConfidence 플래그가 서지 않는다", () => {
    const units = aggregate(
      normalizeAll([
        // 최근 3개월: 3건
        trade({ price: 2_000_000_000, contractDate: "2026-06-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 4_000_000_000, contractDate: "2026-08-01" }),
        // 그 이전 3개월: 3건
        trade({ price: 1_000_000_000, contractDate: "2026-03-01" }),
        trade({ price: 2_000_000_000, contractDate: "2026-04-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-05-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3mRecentCount).toBe(3);
    expect(units[0]?.changeRate3mPriorCount).toBe(3);
    expect(units[0]?.changeRate3mLowConfidence).toBe(false);
  });

  it("changeRate3m: 이전 3개월 창이 1건뿐이면 lowConfidence 플래그가 선다 — I4", () => {
    // I4: 리뷰에서 지적된 핵심 사례. 두 창 중 하나가 1건뿐이면 changeRate3m
    // 자체는 계산되지만(null이 아님) 신뢰할 수 없다 — lowConfidenceMinTrades(3)
    // 미만이라는 사실이 값과 함께 나가야 한다.
    const units = aggregate(
      normalizeAll([
        // 최근 3개월: 2건(하한 미만)
        trade({ price: 4_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 4_000_000_000, contractDate: "2026-08-01" }),
        // 그 이전 3개월: 1건(하한 미만)
        trade({ price: 2_000_000_000, contractDate: "2026-04-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3m).not.toBeNull();
    expect(units[0]?.changeRate3mRecentCount).toBe(2);
    expect(units[0]?.changeRate3mPriorCount).toBe(1);
    expect(units[0]?.changeRate3mLowConfidence).toBe(true);
  });

  it("changeRate3m: 비교 대상이 없어 null이면 lowConfidence 플래그는 서지 않는다", () => {
    // 값 자체가 없으니(null) "신뢰할 수 없는 값"이라는 플래그도 의미가 없다.
    const units = aggregate(
      normalizeAll([trade({ price: 1_000_000_000, contractDate: "2026-07-01" })]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate3m).toBeNull();
    expect(units[0]?.changeRate3mLowConfidence).toBe(false);
  });

  it("changeRate12m: 이전 6개월 창이 1건뿐이면 lowConfidence 플래그가 선다 — I4", () => {
    // 힐스테이트e편한세상문정 49㎡ 실제 사례(거래 2건으로 +96%)와 같은 형태.
    const units = aggregate(
      normalizeAll([
        // 최근 6개월: 2건
        trade({ price: 9_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 9_500_000_000, contractDate: "2026-08-01" }),
        // 그 이전 6개월: 1건(하한 미만)
        trade({ price: 4_500_000_000, contractDate: "2025-09-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate12m).not.toBeNull();
    expect(units[0]?.changeRate12mRecentCount).toBe(2);
    expect(units[0]?.changeRate12mPriorCount).toBe(1);
    expect(units[0]?.changeRate12mLowConfidence).toBe(true);
  });

  it("changeRate12m: 두 창 모두 충분하면 lowConfidence 플래그가 서지 않는다", () => {
    const units = aggregate(
      normalizeAll([
        // 최근 6개월(2026-02-22~2026-08-22): 3건
        trade({ price: 5_000_000_000, contractDate: "2026-06-01" }),
        trade({ price: 6_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 7_000_000_000, contractDate: "2026-08-01" }),
        // 그 이전 6개월(2025-08-22~2026-02-22): 3건
        trade({ price: 2_000_000_000, contractDate: "2025-09-01" }),
        trade({ price: 3_000_000_000, contractDate: "2025-10-01" }),
        trade({ price: 4_000_000_000, contractDate: "2025-11-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.changeRate12mRecentCount).toBe(3);
    expect(units[0]?.changeRate12mPriorCount).toBe(3);
    expect(units[0]?.changeRate12mLowConfidence).toBe(false);
  });

  it("maxExclusiveAreaSqm: 버킷에 실제로 들어간 거래들의 최대 전용면적을 낸다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ exclusiveAreaSqm: 84.6 }), // Math.round(84.6) = 85
        trade({ exclusiveAreaSqm: 85.4 }), // Math.round(85.4) = 85, 실제로는 85㎡ 초과
      ]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(1);
    expect(units[0]?.areaBucket).toBe(85);
    expect(units[0]?.maxExclusiveAreaSqm).toBe(85.4);
  });

  it("maxExclusiveAreaSqm: 85㎡ 이하로만 구성된 버킷은 최대값도 85 이하다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ exclusiveAreaSqm: 83.6 }), // Math.round(83.6) = 84
        trade({ exclusiveAreaSqm: 84.2 }), // Math.round(84.2) = 84
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.maxExclusiveAreaSqm).toBe(84.2);
  });

  it("maxExclusiveAreaSqm: 최근 6개월 창 밖의(하지만 asOf 이전) 거래도 반영한다 — 물리적 면적은 시간과 무관하다", () => {
    const units = aggregate(
      normalizeAll([
        // 최근 6개월 안: 84.6㎡ (버킷 85)
        trade({ exclusiveAreaSqm: 84.6, contractDate: "2026-07-01" }),
        // 8개월 전(중위값에서는 제외되지만 같은 버킷 85): 85.4㎡
        trade({ exclusiveAreaSqm: 85.4, contractDate: "2025-12-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(1);
    expect(units[0]?.tradeCount).toBe(1); // 대표가는 최근 거래 1건만
    expect(units[0]?.maxExclusiveAreaSqm).toBe(85.4); // 하지만 면적은 그룹 전체에서 본다
  });

  it("aggregate 산출물은 동일 단지 내에서 areaBucket으로 정렬된다", () => {
    // 동일 단지, 다른 평형으로 역순 입력: 101, 84
    const units = aggregate(
      normalizeAll([
        trade({
          builtYear: 2000,
          complexName: "test-complex",
          exclusiveAreaSqm: 101.2,
          price: 1_000_000_000,
        }),
        trade({
          builtYear: 2000,
          complexName: "test-complex",
          exclusiveAreaSqm: 84.4,
          price: 2_000_000_000,
        }),
      ]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(2);
    // 같은 complexKey이므로 areaBucket으로 정렬되어야 함: 84 < 101
    expect(units[0]?.areaBucket).toBe(84);
    expect(units[1]?.areaBucket).toBe(101);
  });
});

describe("층 범위", () => {
  /**
   * 이 범위(minPrice~maxPrice)를 만든 거래들이 몇 층부터 몇 층까지였는지.
   *
   * 화면이 층을 반영해 값을 보정하기 위한 것이 **아니다** — 사용자가 자기가
   * 보는 매물의 층과 스스로 견주도록 사실을 하나 더 주는 것뿐이다.
   */
  it("범위를 만든 거래들의 최저층과 최고층을 낸다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ floor: 3, contractDate: "2026-07-01" }),
        trade({ floor: 15, contractDate: "2026-06-01" }),
        trade({ floor: 7, contractDate: "2026-05-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.minFloor).toBe(3);
    expect(units[0]?.maxFloor).toBe(15);
    expect(units[0]?.unknownFloorCount).toBe(0);
  });

  it("가격 범위를 만든 창(최근 6개월) 밖의 거래는 층 범위에 넣지 않는다", () => {
    // 층 범위는 minPrice~maxPrice를 만든 바로 그 거래들에 대한 사실이어야
    // 한다. 창 밖 거래를 섞으면 화면이 "이 범위를 만든 거래"라고 말하면서
    // 그 범위에 들어 있지도 않은 거래의 층을 보여주게 된다.
    const units = aggregate(
      normalizeAll([
        trade({ floor: 10, contractDate: "2026-07-01" }),
        trade({ floor: 1, contractDate: "2025-01-01" }),
        trade({ floor: 40, contractDate: "2025-01-02" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.tradeCount).toBe(1);
    expect(units[0]?.minFloor).toBe(10);
    expect(units[0]?.maxFloor).toBe(10);
  });

  it.each([
    ["0층", 0],
    ["음수(지하)", -1],
    ["정수가 아닌 값", 3.5],
  ])("%s은 못 믿을 값으로 보고 층 범위에서 뺀다", (_label, badFloor) => {
    const units = aggregate(
      normalizeAll([
        trade({ floor: badFloor, contractDate: "2026-07-01" }),
        trade({ floor: 12, contractDate: "2026-06-01" }),
      ]),
      AS_OF,
      config,
    );
    // 못 믿을 값을 0층이나 1층으로 채우지 않는다 — 범위는 믿을 수 있는
    // 거래만으로 만들고, 못 믿은 건수를 따로 드러낸다.
    expect(units[0]?.minFloor).toBe(12);
    expect(units[0]?.maxFloor).toBe(12);
    expect(units[0]?.unknownFloorCount).toBe(1);
    expect(units[0]?.tradeCount).toBe(2);
  });

  it("믿을 수 있는 층이 하나도 없으면 범위를 비우고 건수로 드러낸다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ floor: 0, contractDate: "2026-07-01" }),
        trade({ floor: -2, contractDate: "2026-06-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.minFloor).toBeNull();
    expect(units[0]?.maxFloor).toBeNull();
    expect(units[0]?.unknownFloorCount).toBe(2);
  });

  it("층이 달라져도 가격 집계는 한 글자도 달라지지 않는다", () => {
    // 층으로 가격을 보정하지 않는다는 약속. 층은 사용자가 스스로 견주도록
    // 돕는 사실일 뿐이고, 우리가 그것으로 값을 깎거나 올리는 순간 감정평가가
    // 된다 — 이 앱이 medianPrice를 화면에서 뺀 것과 같은 이유다.
    const trades = [
      trade({ floor: 1, price: 1_000_000_000, contractDate: "2026-07-01" }),
      trade({ floor: 2, price: 1_500_000_000, contractDate: "2026-06-01" }),
    ];
    const low = aggregate(normalizeAll(trades), AS_OF, config);
    const high = aggregate(
      normalizeAll(trades.map((t) => ({ ...t, floor: t.floor + 30 }))),
      AS_OF,
      config,
    );
    const prices = (units: ReturnType<typeof aggregate>) =>
      units.map((u) => ({
        minPrice: u.minPrice,
        maxPrice: u.maxPrice,
        medianPrice: u.medianPrice,
        tradeCount: u.tradeCount,
      }));
    expect(prices(high)).toEqual(prices(low));
    expect(high[0]?.minFloor).toBe(31);
    expect(low[0]?.minFloor).toBe(1);
  });
});
