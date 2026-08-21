import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAffordablePrice } from "./affordable-price";
import { calcMaxLoan, calcPolicyLimit } from "./loan-limit";
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

  // 단언 변경(코드 리뷰 대응, matchedPolicyLoans가 availableAmount를 실어 나름):
  // 이전에는 `max(matchedPolicyLoans.maxAmount) === breakdown.POLICY`를
  // 기대할 수 없었다 — matchedPolicyLoans가 상품 고시 한도(maxAmount)만
  // 담고 있어서, breakdown.POLICY(상환능력·담보가치 반영값)와는 상한
  // 관계만 성립했다(예: 연소득 5천만·현금 2.2억은 고시 360,000,000 →
  // 실제 287,158,070). 이제 각 항목이 실제 수령 가능액(availableAmount)을
  // 함께 실어 나르므로, 그 최대값이 breakdown.POLICY와 정확히 같아야
  // 한다 — 두 계산이 loan-limit.ts의 calcPolicyLoanAvailability 하나를
  // 공유하기 때문이다.
  it.each(buyers)(
    "결과에 실린 정책대출 목록이 그 가격에서 실제로 자격이 되는 상품이다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      const policyMax = result.matchedPolicyLoans.reduce(
        (max, entry) => Math.max(max, entry.availableAmount),
        0,
      );
      expect(result.loanLimit.breakdown.POLICY).toBe(policyMax);
      if (result.matchedPolicyLoans.length === 0) {
        expect(result.loanLimit.breakdown.POLICY).toBe(0);
      }

      // (코드 리뷰 지적) 위 두 단언은 matchedPolicyLoans와 breakdown.POLICY가
      // 둘 다 같은 calcPolicyLoanAvailability 호출 경로를 공유하므로,
      // 그 경로 자체가 죽어 항상 0을 반환해도 자기 자신과는 일치해
      // 조용히 통과한다 — "정책 경로가 죽었다"는 실패 양상을 잡지 못한다.
      // calcPolicyLimit을 독립적으로 다시 호출해 오라클로 삼고, 자격
      // 상품이 있고 소득이 있으면 실제로 양수가 나옴을 단언해 그 사각을
      // 메운다.
      expect(result.loanLimit.breakdown.POLICY).toBe(
        calcPolicyLimit(p, rules, result.affordablePrice),
      );
      if (result.matchedPolicyLoans.length > 0 && p.annualIncome > 0) {
        expect(result.loanLimit.breakdown.POLICY).toBeGreaterThan(0);
      }
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

  // 프로필 변경(2026-08-17, 정책 경로에 DSR·LTV 제약 도입): 이전 구매자
  // (현금 2억 · 연소득 9천만)는 은행 경로가 LTV에 걸려 있었다. 정책 경로도
  // 같은 LTV를 쓰게 된 지금, LTV에 걸린 구매자에게는 어떤 정책 상품도
  // 도움이 될 수 없다(before·after 모두 624,600,000 · binding LTV).
  // 상품 추가가 관측 가능한 효과를 내려면 은행 경로가 DSR에 걸려야 한다.
  // 현금 3억 · 연소득 6천만: before 631,500,000(DSR 344,589,684) →
  // after 701,100,000(POLICY 418,922,480 = 신생아특례 2.5%의 DSR 한도).
  it("자격이 되는 구매자는 상품이 늘면 실구매력이 커진다", () => {
    const buyer = profile({ cash: 300_000_000, annualIncome: 60_000_000 });

    const before = calcAffordablePrice(buyer, rules);
    const after = calcAffordablePrice(buyer, withExtraProduct);

    expect(after.affordablePrice).toBeGreaterThan(before.affordablePrice);
    expect(after.loanLimit.binding).toBe("POLICY");
    expect(after.matchedPolicyLoans.map((entry) => entry.loan.id)).toContain(
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
