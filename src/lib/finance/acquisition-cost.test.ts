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

  it("중개보수가 상한보다 낮으면 계산된 금액을 그대로 청구한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      150_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(750_000);
  });

  it("중개보수가 상한을 초과하면 상한으로 제한된다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      180_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(800_000);
  });

  it("상한이 없는 구간은 계산된 요금을 그대로 청구한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      250_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(1_000_000);
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

  // legalFee·movingCost·total은 예전에 내림 없이 그대로 흘러나갔다.
  // 지금 룰셋의 값이 마침 정수라 드러나지 않았을 뿐, 소수 값이 들어오면
  // "반환 금액은 정수 원"이라는 계약이 깨진다.
  it("룰셋의 정액 항목이 소수여도 반환 금액은 정수다", () => {
    const fractionalRules = {
      ...rules,
      legalFee: 600_000.7,
      movingCost: 1_500_000.3,
    };
    const costs = calcAcquisitionCosts(500_000_000, profile(), fractionalRules);

    expect(costs.legalFee).toBe(600_000);
    expect(costs.movingCost).toBe(1_500_000);
    for (const value of Object.values(costs)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(costs.total).toBe(
      costs.acquisitionTax +
        costs.brokerageFee +
        costs.legalFee +
        costs.movingCost,
    );
  });
});

/**
 * 결함(코드 리뷰 발견): price가 검증 없이 흘러들어가, price: -1이
 * calcAcquisitionCosts에서 음수 중개보수를 만들어냈다. price는 profile과
 * 동일한 기준(유한·비음수)으로 공개 경계에서 검증되어야 한다.
 */
describe("calcAcquisitionCosts — price 경계 검증", () => {
  it.each([Infinity, -Infinity, -1, NaN])(
    "price가 %s이면 예외를 던진다",
    (price) => {
      expect(() => calcAcquisitionCosts(price, profile(), rules)).toThrow(
        RangeError,
      );
      expect(() => calcAcquisitionCosts(price, profile(), rules)).toThrow(
        /price/,
      );
    },
  );

  it("정상적인 price는 그대로 통과한다", () => {
    expect(() =>
      calcAcquisitionCosts(500_000_000, profile(), rules),
    ).not.toThrow();
    expect(() => calcAcquisitionCosts(0, profile(), rules)).not.toThrow();
  });
});
