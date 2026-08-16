import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";
import { calcSafetyScore } from "./safety";
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

describe("calcSafetyScore", () => {
  it("상환부담률은 월 상환액을 월 소득으로 나눈 값이다", () => {
    const score = calcSafetyScore(
      500_000_000,
      profile(),
      rules,
      300_000_000,
    );
    const monthlyIncome = 100_000_000 / 12;
    expect(score.burdenRatio).toBeCloseTo(
      score.monthlyPayment / monthlyIncome,
      6,
    );
  });

  it("스트레스 시나리오의 상환액이 기본보다 크다", () => {
    const score = calcSafetyScore(
      500_000_000,
      profile(),
      rules,
      300_000_000,
    );
    expect(score.stressedMonthlyPayment).toBeGreaterThan(score.monthlyPayment);
  });

  it("부담률이 낮으면 safe다", () => {
    const score = calcSafetyScore(
      300_000_000,
      profile({ annualIncome: 200_000_000 }),
      rules,
      100_000_000,
    );
    expect(score.level).toBe("safe");
  });

  it("부담률이 중간이면 caution이다", () => {
    // 연소득 6천만(월 500만) · 대출 3억 · 4.2% 30년 → 월 약 147만원, 부담률 약 29%
    const score = calcSafetyScore(
      500_000_000,
      profile({ annualIncome: 60_000_000 }),
      rules,
      300_000_000,
    );
    expect(score.level).toBe("caution");
  });

  it("부담률이 높으면 danger다", () => {
    const score = calcSafetyScore(
      800_000_000,
      profile({ annualIncome: 50_000_000 }),
      rules,
      500_000_000,
    );
    expect(score.level).toBe("danger");
  });

  it("기본 부담률이 낮아도 스트레스 시 임계를 넘으면 danger로 내린다", () => {
    const strictRules = {
      ...rules,
      safetyThreshold: { safe: 0.9, caution: 0.95, stressedDanger: 0.01 },
    };
    const score = calcSafetyScore(
      500_000_000,
      profile(),
      strictRules,
      300_000_000,
    );
    expect(score.level).toBe("danger");
  });

  it("기존 부채의 상환액도 부담률에 포함된다", () => {
    const clean = calcSafetyScore(
      500_000_000,
      profile(),
      rules,
      300_000_000,
    );
    const indebted = calcSafetyScore(
      500_000_000,
      profile({ existingDebtAnnualPayment: 12_000_000 }),
      rules,
      300_000_000,
    );
    expect(indebted.burdenRatio).toBeGreaterThan(clean.burdenRatio);
  });

  it("소득이 0이면 부담률이 무한대이고 danger다", () => {
    const score = calcSafetyScore(
      500_000_000,
      profile({ annualIncome: 0 }),
      rules,
      300_000_000,
    );
    expect(score.burdenRatio).toBe(Number.POSITIVE_INFINITY);
    expect(score.level).toBe("danger");
  });
});
