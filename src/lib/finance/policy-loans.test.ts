import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile, PolicyLoanRule, Rules } from "./types";

const productionRules = parseRules(rawRules);

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

/** 테스트 전용 정책대출 상품. eligibility 외 필드는 로직에 영향을 주지 않는 값으로 채운다 */
function loan(
  id: string,
  eligibility: PolicyLoanRule["eligibility"],
): PolicyLoanRule {
  return {
    id,
    eligibility,
    maxAmount: 300_000_000,
    rate: 0.03,
  };
}

/** 실제 룰셋에서 policyLoans만 테스트가 지정한 상품 목록으로 바꿔치기한다 */
function withPolicyLoans(policyLoans: PolicyLoanRule[]): Rules {
  return { ...productionRules, policyLoans };
}

describe("matchPolicyLoans", () => {
  it("모든 조건을 만족하면 해당 상품이 매칭된다", () => {
    const rules = withPolicyLoans([
      loan("테스트상품", {
        requiresNoHome: true,
        maxAnnualIncome: 60_000_000,
        maxHousePrice: 500_000_000,
        maxAreaSqm: 85,
      }),
    ]);

    const matched = matchPolicyLoans(profile(), rules, 400_000_000);

    expect(matched.map((m) => m.id)).toContain("테스트상품");
  });

  it("소득 상한을 넘으면 제외된다", () => {
    const rules = withPolicyLoans([
      loan("소득제한상품", { maxAnnualIncome: 60_000_000 }),
    ]);

    const matched = matchPolicyLoans(
      profile({ annualIncome: 60_000_001 }),
      rules,
      400_000_000,
    );

    expect(matched).toHaveLength(0);
  });

  it("소득 상한과 정확히 같으면 매칭된다 (경계값)", () => {
    const rules = withPolicyLoans([
      loan("소득제한상품", { maxAnnualIncome: 60_000_000 }),
    ]);

    const matched = matchPolicyLoans(
      profile({ annualIncome: 60_000_000 }),
      rules,
      400_000_000,
    );

    expect(matched.map((m) => m.id)).toContain("소득제한상품");
  });

  it("주택가격 상한을 넘으면 제외된다", () => {
    const rules = withPolicyLoans([
      loan("가격제한상품", { maxHousePrice: 500_000_000 }),
    ]);

    const matched = matchPolicyLoans(profile(), rules, 500_000_001);

    expect(matched).toHaveLength(0);
  });

  it("주택가격 상한과 정확히 같으면 매칭된다 (경계값)", () => {
    const rules = withPolicyLoans([
      loan("가격제한상품", { maxHousePrice: 500_000_000 }),
    ]);

    const matched = matchPolicyLoans(profile(), rules, 500_000_000);

    expect(matched.map((m) => m.id)).toContain("가격제한상품");
  });

  it("면적 상한을 넘으면 제외된다", () => {
    const rules = withPolicyLoans([
      loan("면적제한상품", { maxAreaSqm: 85 }),
    ]);

    const matched = matchPolicyLoans(
      profile({ exclusiveAreaSqm: 85.01 }),
      rules,
      400_000_000,
    );

    expect(matched).toHaveLength(0);
  });

  it("면적 상한과 정확히 같으면 매칭된다 (경계값)", () => {
    const rules = withPolicyLoans([
      loan("면적제한상품", { maxAreaSqm: 85 }),
    ]);

    const matched = matchPolicyLoans(
      profile({ exclusiveAreaSqm: 85 }),
      rules,
      400_000_000,
    );

    expect(matched.map((m) => m.id)).toContain("면적제한상품");
  });

  it("무주택 요건 상품은 갈아타기 구매자를 제외한다", () => {
    const rules = withPolicyLoans([
      loan("무주택전용상품", { requiresNoHome: true }),
    ]);

    const matched = matchPolicyLoans(
      profile({ status: "갈아타기" }),
      rules,
      400_000_000,
    );

    expect(matched).toHaveLength(0);
  });

  it("생애최초 요건 상품은 생애최초 구매자에게 매칭된다", () => {
    const rules = withPolicyLoans([
      loan("생애최초전용상품", { requiresFirstTimeBuyer: true }),
    ]);

    const matched = matchPolicyLoans(
      profile({ isFirstTimeBuyer: true }),
      rules,
      400_000_000,
    );

    expect(matched.map((m) => m.id)).toContain("생애최초전용상품");
  });

  it("생애최초 요건 상품은 생애최초가 아닌 구매자를 제외한다", () => {
    const rules = withPolicyLoans([
      loan("생애최초전용상품", { requiresFirstTimeBuyer: true }),
    ]);

    const matched = matchPolicyLoans(
      profile({ isFirstTimeBuyer: false }),
      rules,
      400_000_000,
    );

    expect(matched).toHaveLength(0);
  });

  it("eligibility에 없는 조건은 제한이 없다는 뜻이다 (다른 모든 조건에서 탈락하는 구매자도 매칭)", () => {
    const rules = withPolicyLoans([
      loan("무제한상품", {}),
      loan("모든조건제한상품", {
        requiresNoHome: true,
        requiresFirstTimeBuyer: true,
        maxAnnualIncome: 10_000_000,
        maxHousePrice: 100_000_000,
        maxAreaSqm: 40,
      }),
    ]);

    const worstCaseBuyer = profile({
      status: "갈아타기",
      annualIncome: 200_000_000,
      isFirstTimeBuyer: false,
      exclusiveAreaSqm: 200,
    });

    const matched = matchPolicyLoans(worstCaseBuyer, rules, 2_000_000_000);

    expect(matched.map((m) => m.id)).toEqual(["무제한상품"]);
  });

  it("조건이 겹치면 여러 상품이 함께 매칭된다", () => {
    const rules = withPolicyLoans([
      loan("상품A", { requiresNoHome: true, maxAnnualIncome: 60_000_000 }),
      loan("상품B", { requiresNoHome: true, maxHousePrice: 500_000_000 }),
    ]);

    const matched = matchPolicyLoans(profile(), rules, 400_000_000);

    expect(matched.map((m) => m.id).sort()).toEqual(["상품A", "상품B"]);
  });

  it("[스모크] 실제 룰셋에서도 무주택 생애최초 저소득 구매자는 최소 한 상품에 매칭된다", () => {
    const matched = matchPolicyLoans(
      profile({
        status: "무주택",
        isFirstTimeBuyer: true,
        annualIncome: 30_000_000,
        exclusiveAreaSqm: 60,
      }),
      productionRules,
      300_000_000,
    );

    expect(matched.length).toBeGreaterThan(0);
  });
});
