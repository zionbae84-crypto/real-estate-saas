import { describe, expect, it } from "vitest";
import rawRules from "../../rules/2026-08.json";
import { COMPLEX_UNITS, type ComplexUnit } from "../data/complexes";
import { buildComplexList } from "./complex-list";
import { calcAffordablePrice, ownFundsRequired } from "./finance/affordable-price";
import { calcAvailableCash } from "./finance/available-cash";
import { parseRules } from "./finance/rules";
import type { BuyerProfile } from "./finance/types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket: 84,
    medianPrice: 300_000_000,
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    lowConfidence: false,
    ...overrides,
  };
}

function build(units: ComplexUnit[], p = profile(), regionCodes: string[] = []) {
  return buildComplexList({ units, profile: p, rules, regionCodes });
}

const allKeys = (r: ReturnType<typeof build>) =>
  [...r.withinSafe, ...r.beyondSafe].map((e) => e.unit.complexKey);

describe("buildComplexList", () => {
  it("maxPrice가 실구매력을 넘는 단지를 뺀다", () => {
    const r = build([
      unit({ complexKey: "a", maxPrice: 100_000_000 }),
      unit({ complexKey: "b", maxPrice: 90_000_000_000 }),
    ]);
    expect(allKeys(r)).toContain("a");
    expect(allKeys(r)).not.toContain("b");
  });

  it("같은 단지가 양쪽 덩어리에 동시에 들어가지 않는다", () => {
    const r = build([
      unit({ complexKey: "a", maxPrice: 100_000_000 }),
      unit({ complexKey: "b", maxPrice: 450_000_000 }),
    ]);
    const safeKeys = r.withinSafe.map((e) => e.unit.complexKey);
    const beyondKeys = r.beyondSafe.map((e) => e.unit.complexKey);
    expect(safeKeys.filter((k) => beyondKeys.includes(k))).toEqual([]);
  });

  it("안전선 이하는 첫 덩어리, 초과는 둘째 덩어리다", () => {
    const p = profile();
    const r0 = build([], p);
    expect(r0.safePrice).not.toBeNull();
    const safeLine = r0.safePrice as number;
    const r = build(
      [
        unit({ complexKey: "under", maxPrice: safeLine - 100_000 }),
        unit({ complexKey: "over", maxPrice: safeLine + 100_000 }),
      ],
      p,
    );
    expect(r.withinSafe.map((e) => e.unit.complexKey)).toEqual(["under"]);
    expect(r.beyondSafe.map((e) => e.unit.complexKey)).toEqual(["over"]);
  });

  it("각 덩어리 안에서 부담률 오름차순이다", () => {
    const r = build([
      unit({ complexKey: "a", maxPrice: 300_000_000 }),
      unit({ complexKey: "b", maxPrice: 150_000_000 }),
      unit({ complexKey: "c", maxPrice: 220_000_000 }),
    ]);
    for (const group of [r.withinSafe, r.beyondSafe]) {
      const ratios = group.map((e) => e.burden.safety.burdenRatio);
      expect([...ratios].sort((x, y) => x - y)).toEqual(ratios);
    }
  });

  it("부담률을 maxPrice로 계산한다 — medianPrice가 아니다", () => {
    // 범위가 넓은 단지에서 둘이 갈린다. 위쪽으로 계산해야 틀리더라도
    // 부담이 표시보다 작아지는 쪽으로 틀린다.
    const wide = build([
      unit({ minPrice: 100_000_000, medianPrice: 150_000_000, maxPrice: 300_000_000 }),
    ]);
    const atMedian = build([
      unit({ minPrice: 150_000_000, medianPrice: 150_000_000, maxPrice: 150_000_000 }),
    ]);
    const wideLoan = [...wide.withinSafe, ...wide.beyondSafe][0]?.burden.neededLoan;
    const medianLoan = [...atMedian.withinSafe, ...atMedian.beyondSafe][0]?.burden.neededLoan;
    expect(wideLoan).toBeGreaterThan(medianLoan ?? 0);
  });

  it("안전 덩어리의 모든 행이 안전 등급이다 — 두 계산이 같은 함수를 쓴다", () => {
    // 안전선과 목록 부담률이 다른 모델을 쓰면 여기서 어긋난다:
    // 안전 구역에 들어갔는데 그 행의 등급이 safe가 아닌 상태가 된다.
    const prices = [50_000_000, 150_000_000, 250_000_000, 350_000_000, 450_000_000];
    const r = build(
      prices.map((maxPrice, i) =>
        unit({ complexKey: `u${i}`, maxPrice, minPrice: maxPrice, medianPrice: maxPrice }),
      ),
    );
    expect(r.withinSafe.length).toBeGreaterThan(0);
    for (const e of r.withinSafe) {
      expect(e.burden.safety.level, e.unit.complexKey).toBe("safe");
    }
  });

  it("지역 필터가 비어 있으면 전체를 본다", () => {
    const r = build([
      unit({ complexKey: "a", regionCode: "11680", maxPrice: 100_000_000 }),
      unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 }),
    ]);
    expect(allKeys(r)).toHaveLength(2);
  });

  it("지역을 고르면 그 지역만 남는다", () => {
    const r = build(
      [
        unit({ complexKey: "a", regionCode: "11680", maxPrice: 100_000_000 }),
        unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 }),
      ],
      profile(),
      ["11680"],
    );
    expect(allKeys(r)).toEqual(["a"]);
  });

  it("필터 때문에 0개인지 아닌지를 구분해 알려준다", () => {
    // "지역을 넓혀 보라"를 필터가 원인일 때만 말하기 위해 필요하다.
    const filtered = build(
      [unit({ regionCode: "11650", maxPrice: 100_000_000 })],
      profile(),
      ["11680"],
    );
    expect(filtered.emptyBecauseOfFilter).toBe(true);

    const tooExpensive = build([unit({ maxPrice: 90_000_000_000 })]);
    expect(tooExpensive.emptyBecauseOfFilter).toBe(false);
  });

  it("안전선이 null이면 첫 덩어리가 비어 있다", () => {
    const p = profile({ annualIncome: 0, cash: 500_000_000 });
    const r = build([unit({ maxPrice: 100_000_000 })], p);
    expect(r.safePrice).toBeNull();
    expect(r.withinSafe).toEqual([]);
  });

  it("같은 이름·같은 동에 건축년도가 다른 단지가 있을 때만 건축년도가 필요하다", () => {
    const r = build([
      unit({ complexKey: "a", complexName: "우성", builtYear: 1999, maxPrice: 100_000_000 }),
      unit({ complexKey: "b", complexName: "우성", builtYear: 2015, maxPrice: 100_000_000 }),
      unit({ complexKey: "c", complexName: "래미안", builtYear: 2015, maxPrice: 100_000_000 }),
    ]);
    const byKey = new Map(
      [...r.withinSafe, ...r.beyondSafe].map((e) => [e.unit.complexKey, e.needsBuiltYear]),
    );
    expect(byKey.get("a")).toBe(true);
    expect(byKey.get("b")).toBe(true);
    expect(byKey.get("c")).toBe(false);
  });

  it("실제 번들 데이터로 돌아간다", () => {
    const r = build([...COMPLEX_UNITS]);
    expect(r.withinSafe.length + r.beyondSafe.length).toBeGreaterThan(0);
    for (const e of [...r.withinSafe, ...r.beyondSafe]) {
      expect(e.unit.maxPrice).toBeLessThanOrEqual(r.affordablePrice);
    }
  });

  describe("리뷰 수정: 목록이 행마다 그 행의 실제 면적을 쓴다", () => {
    it("실제 번들 데이터: 어떤 행도 그 행 자신의 면적 기준 필요 자기자금이 가용 현금을 넘는데 구매 가능으로 보이지 않는다", () => {
      const p = profile();
      const cash = calcAvailableCash(p).amount;
      const r = build([...COMPLEX_UNITS], p);
      for (const e of [...r.withinSafe, ...r.beyondSafe]) {
        const rowProfile = { ...p, exclusiveAreaSqm: e.unit.areaBucket };
        expect(
          ownFundsRequired(e.unit.maxPrice, rowProfile, rules),
        ).toBeLessThanOrEqual(cash);
      }
    });

    it("같은 가격이라도 85㎡ 초과 행과 이하 행의 부담이 다르다(농특세)", () => {
      const price = 300_000_000;
      const r = build([
        unit({ complexKey: "small", areaBucket: 84, maxPrice: price, minPrice: price }),
        unit({ complexKey: "large", areaBucket: 130, maxPrice: price, minPrice: price }),
      ]);
      const entries = [...r.withinSafe, ...r.beyondSafe];
      const small = entries.find((e) => e.unit.complexKey === "small");
      const large = entries.find((e) => e.unit.complexKey === "large");
      expect(small).toBeDefined();
      expect(large).toBeDefined();
      // 농특세가 붙는 만큼 부대비용이 늘어 같은 가격에서도 더 많이
      // 빌려야 한다 — neededLoan = price + costs.total - cash.
      expect(large?.burden.neededLoan).toBeGreaterThan(small?.burden.neededLoan ?? 0);
    });

    it("결함 회귀 잠금: 프로필 하나의 면적으로 모든 행을 봐주면 넓은 평형이 부당하게 통과했다", () => {
      // 프로필은 농특세가 붙지 않는 면적(84㎡)으로 가정했지만, 실제
      // 행(130㎡)은 초과라 농특세가 붙는다. 프로필 면적만으로 감당
      // 가능 여부를 판정하면(옛 결함), 이 단지는 실제로는 가용현금을
      // 넘는데도 목록에 나타난다.
      const p = profile({ exclusiveAreaSqm: 84 });
      const baseAffordable = calcAffordablePrice(p, rules).affordablePrice;
      const cash = calcAvailableCash(p).amount;

      const wideUnit = unit({
        areaBucket: 130,
        maxPrice: baseAffordable,
        minPrice: baseAffordable,
      });

      // 전제 확인: 130㎡ 기준으로 다시 재면 이 가격은 실제로 가용현금을 넘는다.
      const rowProfile = { ...p, exclusiveAreaSqm: wideUnit.areaBucket };
      expect(ownFundsRequired(wideUnit.maxPrice, rowProfile, rules)).toBeGreaterThan(cash);
      // 그리고 프로필 하나(84㎡)만으로 판정하면 옛 결함처럼 통과했을
      // 가격이라는 것도 함께 확인한다.
      expect(wideUnit.maxPrice).toBeLessThanOrEqual(baseAffordable);

      const r = build([wideUnit], p);
      expect(allKeys(r)).not.toContain(wideUnit.complexKey);
    });
  });
});
