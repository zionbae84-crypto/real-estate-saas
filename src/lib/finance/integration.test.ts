import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAffordablePrice } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile, PolicyLoanRule, Rules, SafetyLevel } from "./types";

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

const BADGE: Record<SafetyLevel, string> = {
  safe: "🟢",
  caution: "🟡",
  danger: "🔴",
};

const buyers: Array<[string, BuyerProfile]> = [
  ["고소득·현금 2억", profile()],
  ["연소득 5천만·현금 2.2억", profile({ cash: 220_000_000, annualIncome: 50_000_000 })],
  ["연소득 7천만·현금 2.2억", profile({ cash: 220_000_000, annualIncome: 70_000_000 })],
  ["연소득 3천만·현금 1.5억", profile({ cash: 150_000_000, annualIncome: 30_000_000 })],
  [
    "갈아타기·기존주택 7억",
    profile({
      status: "갈아타기",
      cash: 50_000_000,
      annualIncome: 90_000_000,
      existingHome: {
        expectedSalePrice: 700_000_000,
        remainingLoan: 300_000_000,
        capitalGainsTax: 20_000_000,
      },
    }),
  ],
];

/**
 * UI가 실제로 밟는 경로를 그대로 조립한다:
 * 예산 계산(calcAffordablePrice) → 그 결과로 등급 판정(calcSafetyScore).
 *
 * 이 조합 테스트가 없어서, 엔진 내부 계산과 "이 가격을 이 구매자 기준으로
 * 다시 채점"하는 경로가 서로 다른 대출액을 쓰는 결함이 9번의 리뷰를
 * 통과했다(같은 구매자·같은 가격에 🟡과 🔴이 동시에 나올 수 있었다).
 */
describe("통합: 실구매력 → 안전성 등급", () => {
  it.each(buyers)(
    "엔진이 준 실구매력으로 다시 계산해도 같은 대출액이 나온다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);

      // UI가 "이 매물(=실구매력 가격)을 이 구매자 기준으로 채점"할 때 하는 호출
      const rescored = calcMaxLoan(p, rules, result.affordablePrice);

      expect(rescored.amount).toBe(result.loanLimit.amount);
      expect(rescored.binding).toBe(result.loanLimit.binding);
      expect(rescored.breakdown).toEqual(result.loanLimit.breakdown);
    },
  );

  it.each(buyers)("등급 배지가 두 경로에서 일치한다: %s", (_label, p) => {
    const result = calcAffordablePrice(p, rules);

    const fromEngine = calcSafetyScore(p, rules, result.loanLimit.amount);
    const fromUiPath = calcSafetyScore(
      p,
      rules,
      calcMaxLoan(p, rules, result.affordablePrice).amount,
    );

    expect(BADGE[fromUiPath.level]).toBe(BADGE[fromEngine.level]);
    expect(fromUiPath.monthlyPayment).toBe(fromEngine.monthlyPayment);
  });

  it.each(buyers)("등급은 룰셋 임계값과 자기모순이 없다: %s", (_label, p) => {
    const result = calcAffordablePrice(p, rules);
    const score = calcSafetyScore(p, rules, result.loanLimit.amount);
    const t = rules.safetyThreshold;

    expect(Object.keys(BADGE)).toContain(score.level);
    if (score.level === "safe") {
      expect(score.burdenRatio).toBeLessThan(t.safe);
      expect(score.stressedBurdenRatio).toBeLessThanOrEqual(t.stressedDanger);
    }
    if (score.level === "caution") {
      expect(score.burdenRatio).toBeLessThanOrEqual(t.caution);
      expect(score.stressedBurdenRatio).toBeLessThanOrEqual(t.stressedDanger);
    }
    // 스트레스 상환액은 항상 기본보다 크다 — 두 시나리오가 뒤바뀌지 않았다
    expect(score.stressedMonthlyPayment).toBeGreaterThanOrEqual(
      score.monthlyPayment,
    );
  });

  it.each(buyers)(
    "결과에 실린 정책대출 목록이 그 가격에서 실제로 자격이 되는 상품이다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      const policyMax = result.matchedPolicyLoans.reduce(
        (max, loan) => Math.max(max, loan.maxAmount),
        0,
      );
      // UI가 다시 도출할 필요 없이, breakdown.POLICY와 같은 숫자여야 한다
      expect(policyMax).toBe(result.loanLimit.breakdown.POLICY);
    },
  );
});

/**
 * 룰셋은 데이터다 — 규제 변경은 JSON 수정만으로 끝나야 한다.
 * 프로덕션 룰셋에 상품 하나를 더한 픽스처가 파이프라인 전체를 통과해
 * 결과를 기대한 방향으로 움직이는지 확인한다. 조건 평가가 조용히 무시되면
 * (예: 엔진이 모르는 eligibility 키) 이 테스트가 깨진다.
 */
describe("통합: 룰셋 데이터 변경이 결과에 반영된다", () => {
  const 신생아특례: PolicyLoanRule = {
    id: "신생아특례(픽스처)",
    eligibility: {
      requiresNoHome: true,
      maxAnnualIncome: 130_000_000,
      maxHousePrice: 900_000_000,
    },
    maxAmount: 500_000_000,
    rate: 0.025,
  };

  const withExtraProduct: Rules = {
    ...rules,
    policyLoans: [...rules.policyLoans, 신생아특례],
  };

  it("자격이 되는 구매자는 상품이 늘면 실구매력이 커진다", () => {
    const buyer = profile({ cash: 200_000_000, annualIncome: 90_000_000 });

    const before = calcAffordablePrice(buyer, rules);
    const after = calcAffordablePrice(buyer, withExtraProduct);

    expect(after.affordablePrice).toBeGreaterThan(before.affordablePrice);
    expect(after.loanLimit.binding).toBe("POLICY");
    expect(after.matchedPolicyLoans.map((l) => l.id)).toContain(
      "신생아특례(픽스처)",
    );
  });

  it("자격이 안 되는 구매자에게는 아무 영향이 없다", () => {
    // 갈아타기라 requiresNoHome을 만족하지 못한다.
    // 조건이 조용히 무시되면 이 구매자에게도 상품이 붙어 값이 달라진다.
    const buyer = profile({
      status: "갈아타기",
      cash: 300_000_000,
      annualIncome: 90_000_000,
    });

    const before = calcAffordablePrice(buyer, rules);
    const after = calcAffordablePrice(buyer, withExtraProduct);

    expect(after.affordablePrice).toBe(before.affordablePrice);
    expect(after.matchedPolicyLoans).toHaveLength(0);
  });

  it("주택가격 상한을 넘는 구간에서는 상품이 붙지 않는다", () => {
    const buyer = profile({ cash: 600_000_000, annualIncome: 300_000_000 });
    const result = calcAffordablePrice(buyer, withExtraProduct);

    // 조건부 단언은 조건이 거짓이면 아무것도 검증하지 않는다.
    // 이 구매자가 실제로 9억 상한 너머에 있음을 먼저 못 박는다.
    expect(result.affordablePrice).toBeGreaterThan(900_000_000);
    expect(result.matchedPolicyLoans).toHaveLength(0);
    expect(result.loanLimit.breakdown.POLICY).toBe(0);
    expect(result.loanLimit.binding).not.toBe("POLICY");
  });
});
