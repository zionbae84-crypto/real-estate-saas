import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 100_000_000,
    annualIncome: 50_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("matchPolicyLoans", () => {
  it("모든 조건을 만족하면 해당 상품이 매칭된다", () => {
    const matched = matchPolicyLoans(profile(), rules, 400_000_000);
    expect(matched.map((m) => m.id)).toContain("디딤돌");
  });

  it("소득 상한을 넘으면 제외된다", () => {
    const matched = matchPolicyLoans(
      profile({ annualIncome: 65_000_000 }),
      rules,
      400_000_000,
    );
    expect(matched.map((m) => m.id)).not.toContain("디딤돌");
  });

  it("주택가격 상한을 넘으면 제외된다", () => {
    const matched = matchPolicyLoans(profile(), rules, 550_000_000);
    expect(matched.map((m) => m.id)).not.toContain("디딤돌");
  });

  it("면적 상한을 넘으면 제외된다", () => {
    const matched = matchPolicyLoans(
      profile({ exclusiveAreaSqm: 101 }),
      rules,
      400_000_000,
    );
    expect(matched.map((m) => m.id)).not.toContain("디딤돌");
  });

  it("갈아타기는 무주택 요건 상품에서 제외된다", () => {
    const matched = matchPolicyLoans(
      profile({ status: "갈아타기" }),
      rules,
      400_000_000,
    );
    expect(matched).toHaveLength(0);
  });

  it("조건이 겹치면 여러 상품이 함께 매칭된다", () => {
    const matched = matchPolicyLoans(profile(), rules, 450_000_000);
    expect(matched.length).toBeGreaterThanOrEqual(2);
  });
});
