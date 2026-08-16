import { describe, expect, it } from "vitest";
import { calcAvailableCash } from "./available-cash";
import type { BuyerProfile } from "./types";

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

describe("calcAvailableCash", () => {
  it("무주택이면 보유 현금이 그대로 가용현금이다", () => {
    const result = calcAvailableCash(profile());
    expect(result.amount).toBe(200_000_000);
    expect(result.warnings).toHaveLength(0);
  });

  it("갈아타기면 기존 주택 순자산이 더해진다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      }),
    );
    expect(result.amount).toBe(430_000_000);
    expect(result.warnings).toEqual([]);
  });

  it("양도세 미입력이면 경고를 남긴다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
        },
      }),
    );
    expect(result.amount).toBe(450_000_000);
    expect(result.warnings).toContain(
      "양도세가 반영되지 않았습니다. 실제 가용 자금은 이보다 적을 수 있습니다.",
    );
  });

  it("기존 대출이 매도가보다 크면 순자산이 음수가 되어 가용현금을 깎는다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 200_000_000,
        existingHome: {
          expectedSalePrice: 300_000_000,
          remainingLoan: 400_000_000,
          capitalGainsTax: 0,
        },
      }),
    );
    expect(result.amount).toBe(100_000_000);
    expect(result.warnings).toEqual([]);
  });

  it("가용현금은 음수가 되지 않는다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 10_000_000,
        existingHome: {
          expectedSalePrice: 300_000_000,
          remainingLoan: 500_000_000,
          capitalGainsTax: 0,
        },
      }),
    );
    expect(result.amount).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("갈아타기인데 기존 주택 정보가 없으면 경고를 남긴다", () => {
    const result = calcAvailableCash(profile({ status: "갈아타기" }));
    expect(result.amount).toBe(200_000_000);
    expect(result.warnings).toContain(
      "기존 주택 정보가 없어 매도 대금이 반영되지 않았습니다.",
    );
  });
});
