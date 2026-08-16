import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAffordablePrice } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
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

describe("calcAffordablePrice", () => {
  it("결과 가격에서 자기부담금이 가용현금을 넘지 않는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    const loan = calcMaxLoan(
      profile(),
      rules,
      result.affordablePrice,
      Number.POSITIVE_INFINITY,
    );
    const costs = calcAcquisitionCosts(
      result.affordablePrice,
      profile(),
      rules,
    );
    const ownFunds = result.affordablePrice - loan.amount + costs.total;
    expect(ownFunds).toBeLessThanOrEqual(result.availableCash);
  });

  it("백만원만 더 비싸도 예산을 넘는 경계값을 찾는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    const overPrice = result.affordablePrice + 1_000_000;
    const loan = calcMaxLoan(profile(), rules, overPrice);
    const costs = calcAcquisitionCosts(overPrice, profile(), rules);
    expect(overPrice - loan.amount + costs.total).toBeGreaterThan(
      result.availableCash,
    );
  });

  it("현금이 많을수록 실구매력이 커진다", () => {
    const poor = calcAffordablePrice(profile({ cash: 100_000_000 }), rules);
    const rich = calcAffordablePrice(profile({ cash: 400_000_000 }), rules);
    expect(rich.affordablePrice).toBeGreaterThan(poor.affordablePrice);
  });

  it("소득이 낮으면 DSR에 걸린다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 500_000_000, annualIncome: 30_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("DSR");
  });

  it("현금과 소득이 모두 많으면 6억 캡에 걸린다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 2_000_000_000, annualIncome: 500_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("CAP");
  });

  it("현금이 0이고 소득도 없으면 실구매력이 0이다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 0, annualIncome: 0 }),
      rules,
    );
    expect(result.affordablePrice).toBe(0);
  });

  it("갈아타기 경고가 결과로 전달된다", () => {
    const result = calcAffordablePrice(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
        },
      }),
      rules,
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("정책대출 자격이 있으면 한도 후보에 포함된다", () => {
    const result = calcAffordablePrice(
      profile({
        cash: 300_000_000,
        annualIncome: 50_000_000,
        isFirstTimeBuyer: true,
      }),
      rules,
    );
    expect(result.loanLimit.breakdown.POLICY).toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
  });

  it("실구매력은 10만원 단위로 내림한 정수다", () => {
    const result = calcAffordablePrice(profile(), rules);
    expect(result.affordablePrice % 100_000).toBe(0);
  });
});
