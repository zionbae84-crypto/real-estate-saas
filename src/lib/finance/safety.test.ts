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
    ownedHomeCount: 0,
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    // 이 파일의 기존 테스트는 전부 비규제 수도권 70% 기준으로 쓰였다.
    // 기본값을 false로 둬 기존 기대값이 그대로 유지되게 한다.
    isRegulatedArea: false,
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

  // 코드 리뷰 결함: calcSafetyScore는 index.ts가 직접 export하는 진입점인데
  // assertValidProfile을 호출하지 않아, calcAffordablePrice를 거치지 않고
  // 단독 호출하면 유효하지 않은 프로필이 burdenRatio를 NaN으로 만든
  // 채 조용히 반환했다. level은 danger로 떨어져 안전하지 않은 방향은
  // 아니지만, burdenRatio는 추천 목록의 정렬 키(design §8: 상환부담률
  // 오름차순)라 NaN이 섞이면 정렬이 조용히 뒤섞인다.
  it("유효하지 않은 프로필이면 계산 전에 실패한다", () => {
    expect(() =>
      calcSafetyScore(profile({ annualIncome: NaN }), rules, 300_000_000),
    ).toThrow(RangeError);
    expect(() =>
      calcSafetyScore(profile({ cash: -1 }), rules, 300_000_000),
    ).toThrow(RangeError);
  });

  // amortization.ts의 monthlyPayment/maxPrincipal과 동일한 기준(0 이상의
  // 유한수)을 loanAmount에도 적용한다.
  it("loanAmount가 유한하지 않거나 음수면 실패한다", () => {
    expect(() => calcSafetyScore(profile(), rules, NaN)).toThrow(RangeError);
    expect(() =>
      calcSafetyScore(profile(), rules, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
    expect(() => calcSafetyScore(profile(), rules, -1)).toThrow(RangeError);
  });
});
