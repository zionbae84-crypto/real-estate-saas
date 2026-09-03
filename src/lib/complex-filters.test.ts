import { describe, expect, it } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import {
  areaBounds,
  builtYearAgeBounds,
  complexFilterBounds,
  filterByComplexFilters,
  priceBounds,
  wouldHelpToResetAxis,
  type ComplexFilterState,
} from "./complex-filters";

function unit(over: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680-1",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "역삼동",
    builtYear: 2010,
    areaBucket: 84,
    maxExclusiveAreaSqm: 84.9,
    landLeasehold: "N",
    tradeCount: 3,
    minPrice: 1_000_000_000,
    maxPrice: 1_200_000_000,
    minFloor: 3,
    maxFloor: 15,
    unknownFloorCount: 0,
    address: null,
    trades: [],
    lowConfidence: false,
    ...over,
  };
}

const NOW = new Date("2026-08-01");

describe("priceBounds", () => {
  it("매매가 최소·최대를 그대로 낸다 — 반올림하지 않는다", () => {
    const units = [
      unit({ maxPrice: 1_234_567_890 }),
      unit({ maxPrice: 500_000_001 }),
    ];
    expect(priceBounds(units)).toEqual({ min: 500_000_001, max: 1_234_567_890 });
  });

  it("빈 목록이면 0,0이다", () => {
    expect(priceBounds([])).toEqual({ min: 0, max: 0 });
  });
});

describe("areaBounds", () => {
  it("최소는 내림, 최대는 올림 — 바깥쪽으로만 반올림한다", () => {
    const units = [
      unit({ maxExclusiveAreaSqm: 59.9 }),
      unit({ maxExclusiveAreaSqm: 84.1 }),
    ];
    expect(areaBounds(units)).toEqual({ min: 59, max: 85 });
  });

  it("빈 목록이면 0,0이다", () => {
    expect(areaBounds([])).toEqual({ min: 0, max: 0 });
  });
});

describe("builtYearAgeBounds", () => {
  it("now.getFullYear() - builtYear로 잰다", () => {
    const units = [unit({ builtYear: 2016 }), unit({ builtYear: 2000 })];
    expect(builtYearAgeBounds(units, NOW)).toEqual({ min: 10, max: 26 });
  });

  it("준공년도가 미래라도 최소는 0 아래로 내려가지 않는다", () => {
    const units = [unit({ builtYear: 2027 }), unit({ builtYear: 2020 })];
    expect(builtYearAgeBounds(units, NOW).min).toBe(0);
  });

  it("빈 목록이면 0,0이다", () => {
    expect(builtYearAgeBounds([], NOW)).toEqual({ min: 0, max: 0 });
  });
});

describe("complexFilterBounds", () => {
  it("세 축을 한 번에 계산한다", () => {
    const units = [unit()];
    const bounds = complexFilterBounds(units, NOW);
    expect(bounds.price).toEqual(priceBounds(units));
    expect(bounds.area).toEqual(areaBounds(units));
    expect(bounds.builtYearAge).toEqual(builtYearAgeBounds(units, NOW));
  });
});

describe("filterByComplexFilters", () => {
  const units = [
    unit({ complexKey: "a", maxPrice: 500_000_000, maxExclusiveAreaSqm: 59, builtYear: 2020 }),
    unit({ complexKey: "b", maxPrice: 900_000_000, maxExclusiveAreaSqm: 84, builtYear: 2005 }),
    unit({ complexKey: "c", maxPrice: 1_500_000_000, maxExclusiveAreaSqm: 120, builtYear: 1990 }),
  ];
  const bounds = complexFilterBounds(units, NOW);

  it("범위 안이 전부면 아무것도 걸러지지 않는다", () => {
    expect(filterByComplexFilters(units, bounds, NOW).map((u) => u.complexKey)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("가격 범위를 좁히면 그 범위 밖 단지가 빠진다", () => {
    const filters: ComplexFilterState = {
      ...bounds,
      price: { min: 0, max: 1_000_000_000 },
    };
    expect(filterByComplexFilters(units, filters, NOW).map((u) => u.complexKey)).toEqual([
      "a",
      "b",
    ]);
  });

  it("면적 범위를 좁히면 그 범위 밖 단지가 빠진다", () => {
    const filters: ComplexFilterState = {
      ...bounds,
      area: { min: 0, max: 90 },
    };
    expect(filterByComplexFilters(units, filters, NOW).map((u) => u.complexKey)).toEqual([
      "a",
      "b",
    ]);
  });

  it("입주년차 범위를 좁히면 그 범위 밖 단지가 빠진다", () => {
    // 2026 - 2020 = 6, 2026 - 2005 = 21, 2026 - 1990 = 36
    const filters: ComplexFilterState = {
      ...bounds,
      builtYearAge: { min: 0, max: 25 },
    };
    expect(filterByComplexFilters(units, filters, NOW).map((u) => u.complexKey)).toEqual([
      "a",
      "b",
    ]);
  });

  it("세 축을 동시에 좁히면 교집합만 남는다", () => {
    const filters: ComplexFilterState = {
      price: { min: 0, max: 1_000_000_000 },
      area: { min: 0, max: 70 },
      builtYearAge: bounds.builtYearAge,
    };
    expect(filterByComplexFilters(units, filters, NOW).map((u) => u.complexKey)).toEqual(["a"]);
  });

  it("경계값(양 끝) 포함이다", () => {
    const filters: ComplexFilterState = {
      ...bounds,
      price: { min: 500_000_000, max: 500_000_000 },
    };
    expect(filterByComplexFilters(units, filters, NOW).map((u) => u.complexKey)).toEqual(["a"]);
  });
});

describe("wouldHelpToResetAxis", () => {
  const units = [
    unit({ complexKey: "a", maxPrice: 500_000_000, maxExclusiveAreaSqm: 59, builtYear: 2020 }),
    unit({ complexKey: "b", maxPrice: 1_500_000_000, maxExclusiveAreaSqm: 120, builtYear: 1990 }),
  ];
  const bounds = complexFilterBounds(units, NOW);

  it("가격만 너무 좁아서 0건이면, 가격 축을 풀면 도움이 된다고 답한다", () => {
    const filters: ComplexFilterState = {
      ...bounds,
      price: { min: 0, max: 100 }, // 아무도 못 낀다
    };
    expect(filterByComplexFilters(units, filters, NOW)).toEqual([]);
    expect(wouldHelpToResetAxis(units, filters, bounds, "price", NOW)).toBe(true);
  });

  it("가격이 문제가 아니면(면적이 문제면), 가격 축을 풀어도 도움이 안 된다", () => {
    const filters: ComplexFilterState = {
      ...bounds,
      price: { min: 0, max: 100 },
      area: { min: 0, max: 1 }, // 면적도 아무도 못 낀다
    };
    expect(wouldHelpToResetAxis(units, filters, bounds, "price", NOW)).toBe(false);
  });

  it("다른 두 축은 지금 값 그대로 두고 이 축만 전체로 되돌린다 — 둘 다 좁으면 하나만 풀어도 소용없다", () => {
    const filters: ComplexFilterState = {
      price: { min: 0, max: 100 },
      area: { min: 0, max: 1 },
      builtYearAge: bounds.builtYearAge,
    };
    // 가격·면적 둘 다 아무도 못 낄 만큼 좁다 — 어느 한쪽만 풀어도
    // 나머지 하나가 여전히 막는다.
    expect(wouldHelpToResetAxis(units, filters, bounds, "price", NOW)).toBe(false);
    expect(wouldHelpToResetAxis(units, filters, bounds, "area", NOW)).toBe(false);
    // 둘 다 풀면(=bounds 그대로) 당연히 결과가 생긴다 — 위 두 결과가
    // "필터 로직이 항상 false를 내는 버그"가 아님을 보증한다.
    expect(filterByComplexFilters(units, bounds, NOW).length).toBeGreaterThan(0);
  });
});
