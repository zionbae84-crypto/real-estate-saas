import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("calcAcquisitionCosts", () => {
  it("6억 이하 · 85㎡ 이하면 취득세가 1.1%다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      500_000_000,
      profile(),
      rules,
    );
    expect(acquisitionTax).toBe(5_500_000);
  });

  it("85㎡ 초과면 농특세 0.2%가 더 붙는다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      500_000_000,
      profile({ exclusiveAreaSqm: 101 }),
      rules,
    );
    expect(acquisitionTax).toBe(6_500_000);
  });

  it("9억 초과면 취득세가 3.3%다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      1_000_000_000,
      profile(),
      rules,
    );
    expect(acquisitionTax).toBe(33_000_000);
  });

  it("6억~9억 구간은 누진 세율이라 6억일 때 1%, 9억일 때 3%로 이어진다", () => {
    const at6 = calcAcquisitionCosts(600_000_000, profile(), rules);
    const at9 = calcAcquisitionCosts(900_000_000, profile(), rules);
    expect(at6.acquisitionTax).toBe(6_600_000);
    expect(at9.acquisitionTax).toBe(29_700_000);
  });

  it("6억~9억 구간의 세율은 가격에 따라 단조 증가한다", () => {
    const prices = [600_000_000, 700_000_000, 800_000_000, 900_000_000];
    const taxes = prices.map(
      (p) => calcAcquisitionCosts(p, profile(), rules).acquisitionTax,
    );
    for (let i = 1; i < taxes.length; i++) {
      expect(taxes[i]!).toBeGreaterThan(taxes[i - 1]!);
    }
  });

  it("생애최초는 취득세를 감면 한도만큼 깎아준다", () => {
    const normal = calcAcquisitionCosts(500_000_000, profile(), rules);
    const first = calcAcquisitionCosts(
      500_000_000,
      profile({ isFirstTimeBuyer: true }),
      rules,
    );
    expect(normal.acquisitionTax - first.acquisitionTax).toBe(2_000_000);
  });

  it("생애최초 감면이 세액보다 크면 0으로 막는다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      100_000_000,
      profile({ isFirstTimeBuyer: true }),
      rules,
    );
    expect(acquisitionTax).toBe(0);
  });

  it("중개보수는 구간 요율을 적용한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      500_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(2_000_000);
  });

  it("중개보수 상한이 있는 구간은 상한을 넘지 않는다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      150_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(750_000);
  });

  it("total은 모든 항목의 합이다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.total).toBe(
      costs.acquisitionTax +
        costs.brokerageFee +
        costs.legalFee +
        costs.movingCost,
    );
  });

  it("모든 금액은 정수다", () => {
    const costs = calcAcquisitionCosts(777_777_777, profile(), rules);
    for (const value of Object.values(costs)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
