import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-08.json";
import { calcAffordablePrice, PRICE_STEP } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import { calcSafePrice } from "./safe-price";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    isRegulatedArea: true,
    ...overrides,
  };
}

/** 그 가격에서 안전 등급이 safe인가 */
function isSafeAt(p: BuyerProfile, price: number): boolean {
  const loan = calcMaxLoan(p, rules, price);
  return calcSafetyScore(p, rules, loan.amount).level === "safe";
}

describe("calcSafePrice", () => {
  it("안전선 가격은 실제로 안전하다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    expect(isSafeAt(p, safe)).toBe(true);
  });

  it("안전선 한 스텝 위는 안전하지 않다 — 진짜 최대다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    // 안전선이 실구매력과 같으면 위쪽이 없으므로 이 단언은 적용되지 않는다
    if (safe < affordable) {
      expect(isSafeAt(p, safe + PRICE_STEP)).toBe(false);
    }
  });

  it("안전선은 실구매력을 넘지 않는다", () => {
    const p = profile();
    expect(calcSafePrice(p, rules)).toBeLessThanOrEqual(
      calcAffordablePrice(p, rules).affordablePrice,
    );
  });

  it("PRICE_STEP 단위로 떨어진다", () => {
    expect(calcSafePrice(profile(), rules) % PRICE_STEP).toBe(0);
  });

  it("소득이 오르면 안전선이 내려가지 않는다", () => {
    const low = calcSafePrice(profile({ annualIncome: 50_000_000 }), rules);
    const high = calcSafePrice(profile({ annualIncome: 150_000_000 }), rules);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("기존 부채가 늘면 안전선이 올라가지 않는다", () => {
    const none = calcSafePrice(profile({ existingDebtAnnualPayment: 0 }), rules);
    const some = calcSafePrice(
      profile({ existingDebtAnnualPayment: 20_000_000 }),
      rules,
    );
    expect(some).toBeLessThanOrEqual(none);
  });

  it("현금이 0이면 안전선도 0이다", () => {
    // 살 수 없는 가격을 안전하다고 말할 수 없다
    expect(calcSafePrice(profile({ cash: 0 }), rules)).toBe(0);
  });

  it("브루트포스와 일치한다", () => {
    const p = profile();
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    let brute = 0;
    for (let price = 0; price <= affordable; price += PRICE_STEP) {
      if (isSafeAt(p, price)) brute = price;
    }
    expect(calcSafePrice(p, rules)).toBe(brute);
  });
});
