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

  it("모든 평형의 층 범위가 말이 된다", () => {
    for (const u of COMPLEX_UNITS) {
      // 최저층과 최고층은 함께 있거나 함께 없다 — 한쪽만 있으면 화면이
      // "N층부터 (빈칸)까지"를 그린다.
      expect((u.minFloor === null) === (u.maxFloor === null), u.complexKey).toBe(
        true,
      );
      if (u.minFloor === null || u.maxFloor === null) continue;

      expect(Number.isInteger(u.minFloor), u.complexKey).toBe(true);
      expect(Number.isInteger(u.maxFloor), u.complexKey).toBe(true);
      // 1층 미만(0층·지하)은 못 믿을 값으로 걸러졌어야 한다. 채워 넣지
      // 않기로 한 값이 0으로 새어 나오면 여기서 걸린다.
      expect(u.minFloor, u.complexKey).toBeGreaterThanOrEqual(1);
      expect(u.maxFloor, u.complexKey).toBeGreaterThanOrEqual(u.minFloor);
      // 상한은 판정 규칙이 아니라 이 데이터에 대한 온전성 검사다. 국내
      // 아파트에 200층은 없으므로, 이보다 크면 파싱이 어긋난 것이다.
      expect(u.maxFloor, u.complexKey).toBeLessThanOrEqual(200);
    }
  });

  it("층을 모르는 거래 건수가 거래 건수를 넘지 않는다", () => {
    for (const u of COMPLEX_UNITS) {
      expect(Number.isInteger(u.unknownFloorCount), u.complexKey).toBe(true);
      expect(u.unknownFloorCount, u.complexKey).toBeGreaterThanOrEqual(0);
      expect(u.unknownFloorCount, u.complexKey).toBeLessThanOrEqual(
        u.tradeCount,
      );
      // 층을 하나도 못 믿었다면 그 창의 거래가 전부 그랬다는 뜻이어야
      // 한다 — 아니면 어딘가에서 층이 조용히 사라진 것이다.
      if (u.minFloor === null) {
        expect(u.unknownFloorCount, u.complexKey).toBe(u.tradeCount);
      }
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
