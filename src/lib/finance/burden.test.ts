import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-08.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcBurdenAt } from "./burden";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

describe("calcBurdenAt", () => {
  it("필요 대출은 가격 + 부대비용 − 보유 현금이다", () => {
    const p = profile();
    const price = 400_000_000;
    const costs = calcAcquisitionCosts(price, p, rules).total;
    expect(calcBurdenAt(p, rules, price).neededLoan).toBe(price + costs - p.cash);
  });

  it("현금이 가격과 부대비용을 덮으면 필요 대출이 0이다", () => {
    // 최대 대출 기준이었다면 여기서도 큰 대출을 가정해 부담률이 나왔다.
    const p = profile({ cash: 10_000_000_000 });
    const b = calcBurdenAt(p, rules, 400_000_000);
    expect(b.neededLoan).toBe(0);
    expect(b.safety.monthlyPayment).toBe(0);
    expect(b.safety.level).toBe("safe");
  });

  it("필요 대출이 음수가 되지 않는다", () => {
    expect(calcBurdenAt(profile({ cash: 10_000_000_000 }), rules, 0).neededLoan).toBe(0);
  });

  it("가격이 오르면 필요 대출이 줄지 않는다", () => {
    const p = profile();
    let previous = -1;
    for (const price of [0, 100_000_000, 300_000_000, 500_000_000]) {
      const loan = calcBurdenAt(p, rules, price).neededLoan;
      expect(loan).toBeGreaterThanOrEqual(previous);
      previous = loan;
    }
  });

  it("음수·비유한 가격은 던진다", () => {
    const p = profile();
    expect(() => calcBurdenAt(p, rules, -1)).toThrow();
    expect(() => calcBurdenAt(p, rules, Number.NaN)).toThrow();
  });
});
