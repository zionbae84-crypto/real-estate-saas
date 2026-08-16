import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { monthlyPayment } from "./amortization";
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
    const score = calcSafetyScore(profile(), rules, 300_000_000);
    const monthlyIncome = 100_000_000 / 12;
    expect(score.burdenRatio).toBeCloseTo(
      score.monthlyPayment / monthlyIncome,
      6,
    );
  });

  // 확정된 설계 결정을 고정한다(2026-08-17).
  // 상환부담률의 분모는 **세전** 월 소득이다. 가처분소득이 아니다.
  // 한국의 DSR류 기준선이 관례적으로 세전 소득 대비로 고시되므로,
  // rules.safetyThreshold의 25% / 35% 임계값은 세전과 짝을 이룰 때만
  // 의미가 맞는다. 분모를 "고쳐서" 가처분소득으로 바꾸면 같은 임계값이
  // 훨씬 엄격해져 등급 체계 전체가 어긋난다. 이 테스트가 그 변경을 막는다.
  it("[설계 고정] 부담률의 분모는 세전 연소득 ÷ 12이며 어떤 공제도 적용하지 않는다", () => {
    const annualIncome = 84_000_000;
    const loanAmount = 300_000_000;
    const score = calcSafetyScore(profile({ annualIncome }), rules, loanAmount);

    const grossMonthlyIncome = annualIncome / 12; // 7,000,000
    const payment = monthlyPayment(
      loanAmount,
      rules.baseRate,
      rules.loanTermMonths,
    );

    expect(score.burdenRatio).toBeCloseTo(payment / grossMonthlyIncome, 10);
    // 세후·가처분 근사(예: 세전의 80%)를 분모로 쓰면 부담률이 커진다.
    // 그 값과 같아지면 분모가 바뀐 것이다.
    expect(score.burdenRatio).not.toBeCloseTo(
      payment / (grossMonthlyIncome * 0.8),
      6,
    );
  });

  it("스트레스 시나리오의 상환액이 기본보다 크다", () => {
    const score = calcSafetyScore(profile(), rules, 300_000_000);
    expect(score.stressedMonthlyPayment).toBeGreaterThan(score.monthlyPayment);
  });

  it("부담률이 낮으면 safe다", () => {
    const score = calcSafetyScore(
      profile({ annualIncome: 200_000_000 }),
      rules,
      100_000_000,
    );
    expect(score.level).toBe("safe");
  });

  it("부담률이 중간이면 caution이다", () => {
    // 연소득 6천만(월 500만) · 대출 3억 · 4.2% 30년 → 월 약 147만원, 부담률 약 29%
    const score = calcSafetyScore(
      profile({ annualIncome: 60_000_000 }),
      rules,
      300_000_000,
    );
    expect(score.level).toBe("caution");
  });

  it("부담률이 높으면 danger다", () => {
    const score = calcSafetyScore(
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
    const score = calcSafetyScore(profile(), strictRules, 300_000_000);
    expect(score.level).toBe("danger");
  });

  it("기존 부채의 상환액도 부담률에 포함된다", () => {
    const clean = calcSafetyScore(profile(), rules, 300_000_000);
    const indebted = calcSafetyScore(
      profile({ existingDebtAnnualPayment: 12_000_000 }),
      rules,
      300_000_000,
    );
    expect(indebted.burdenRatio).toBeGreaterThan(clean.burdenRatio);
  });

  it("소득이 0이면 부담률이 무한대이고 danger다", () => {
    const score = calcSafetyScore(
      profile({ annualIncome: 0 }),
      rules,
      300_000_000,
    );
    expect(score.burdenRatio).toBe(Number.POSITIVE_INFINITY);
    expect(score.level).toBe("danger");
  });
});
