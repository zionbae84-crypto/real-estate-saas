import { describe, expect, it } from "vitest";
import { COMPLEX_UNITS, DATA_AS_OF, REGION_NAMES, REGIONS } from "./complexes";

describe("번들된 단지 데이터", () => {
  it("평형이 실제로 들어 있다", () => {
    // 0개면 아래 검사가 전부 공허하게 통과한다.
    expect(COMPLEX_UNITS.length).toBeGreaterThan(100);
  });

  it("모든 평형에 범위 표시에 필요한 값이 있다", () => {
    for (const u of COMPLEX_UNITS) {
      expect(Number.isInteger(u.minPrice)).toBe(true);
      expect(Number.isInteger(u.maxPrice)).toBe(true);
      expect(u.maxPrice).toBeGreaterThanOrEqual(u.minPrice);
      expect(u.tradeCount).toBeGreaterThan(0);
    }
  });

  it("지역 요약이 실제 평형의 지역과 일치한다", () => {
    const inUnits = new Set(COMPLEX_UNITS.map((u) => u.regionCode));
    const inRegions = new Set(REGIONS.map((r) => r.regionCode));
    expect([...inUnits].sort()).toEqual([...inRegions].sort());
  });

  it("모든 지역에 이름이 있다", () => {
    // 이름이 없으면 화면에 시군구 코드가 그대로 나간다.
    for (const r of REGIONS) {
      expect(REGION_NAMES[r.regionCode], r.regionCode).toBeDefined();
    }
  });

  it("데이터 기준일이 YYYY-MM 형식이다", () => {
    expect(DATA_AS_OF).toMatch(/^\d{4}-\d{2}$/);
  });
});
