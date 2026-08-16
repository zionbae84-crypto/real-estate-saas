import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAffordablePrice } from "./affordable-price";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile, Rules } from "./types";

const rules = parseRules(rawRules);

// affordable-price.ts의 내부 상수와 동일한 값. export되지 않으므로 여기서 동일 값을 복제한다.
const PRICE_STEP = 100_000;
const SEARCH_UPPER_BOUND = 10_000_000_000;

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

/** 자격이 되는 정책대출 중 가장 큰 한도. 없으면 무한대(제약 없음). */
function policyLimitAt(price: number, p: BuyerProfile, r: Rules): number {
  const matched = matchPolicyLoans(p, r, price);
  if (matched.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...matched.map((loan) => loan.maxAmount));
}

/** 해당 매매가에서 사용자가 현금으로 내야 하는 총액. 매 가격마다 정직하게 재계산한다. */
function ownFundsAt(price: number, p: BuyerProfile, r: Rules): number {
  const loan = calcMaxLoan(p, r, price, policyLimitAt(price, p, r));
  const costs = calcAcquisitionCosts(price, p, r);
  return price - loan.amount + costs.total;
}

/** [from, to] 구간을 PRICE_STEP 그리드로 훑어 실제 감당 가능한 최대가를 브루트포스로 찾는다. */
function bruteForceMax(
  p: BuyerProfile,
  r: Rules,
  cashAmount: number,
  from: number,
  to: number,
): number {
  let best = 0;
  for (let price = from; price <= to; price += PRICE_STEP) {
    if (ownFundsAt(price, p, r) <= cashAmount) best = price;
  }
  return best;
}

const cliffSpanningProfiles: Array<[string, BuyerProfile]> = [
  [
    "연소득 65,000,000 (보금자리론만 해당, 절벽 1개)",
    profile({ cash: 220_000_000, annualIncome: 65_000_000 }),
  ],
  [
    "연소득 68,000,000 (보금자리론만 해당, 절벽 1개)",
    profile({ cash: 220_000_000, annualIncome: 68_000_000 }),
  ],
  [
    "연소득 70,000,000 (보금자리론 상한, 절벽 1개)",
    profile({ cash: 220_000_000, annualIncome: 70_000_000 }),
  ],
  [
    "연소득 50,000,000 (디딤돌+보금자리론, 절벽 2개)",
    profile({ cash: 220_000_000, annualIncome: 50_000_000 }),
  ],
  [
    "연소득 80,000,000 (정책대출 대상 밖, 절벽 없음)",
    profile({ cash: 220_000_000, annualIncome: 80_000_000 }),
  ],
];

describe("calcAffordablePrice", () => {
  it("결과 가격에서 자기부담금이 가용현금을 넘지 않는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    const ownFunds =
      result.affordablePrice - result.loanLimit.amount + result.costs.total;
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

describe("calcAffordablePrice — 정책대출 절벽 구간 (f 비단조성)", () => {
  it("절벽 너머 가격이 더 저렴한 자기부담금을 만들면 절벽 너머 가격을 찾는다", () => {
    // 연소득 70,000,000, 무주택, 생애최초 아님: 매매가 600,000,000을 넘으면
    // 보금자리론 자격을 잃어 정책 한도가 사라지고, 오히려 DSR 한도가 더 커져
    // 자기부담금이 줄어든다. 단순 이분 탐색은 이 지점을 넘어가지 못한다.
    const result = calcAffordablePrice(
      profile({
        cash: 220_000_000,
        annualIncome: 70_000_000,
        status: "무주택",
        isFirstTimeBuyer: false,
        existingDebtAnnualPayment: 0,
        exclusiveAreaSqm: 84,
      }),
      rules,
    );
    expect(result.affordablePrice).toBeGreaterThanOrEqual(610_000_000);
  });

  it.each(cliffSpanningProfiles)(
    "브루트포스로 찾은 실제 최대가와 일치한다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      const cashAmount = calcAvailableCash(p).amount;
      const trueMax = bruteForceMax(p, rules, cashAmount, 0, 900_000_000);
      expect(result.affordablePrice).toBe(trueMax);
    },
  );

  it.each(cliffSpanningProfiles)(
    "결과 가격에서 자기부담금이 가용현금을 넘지 않는다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      const ownFunds =
        result.affordablePrice - result.loanLimit.amount + result.costs.total;
      expect(ownFunds).toBeLessThanOrEqual(result.availableCash);
    },
  );

  it.each(cliffSpanningProfiles)(
    "한 스텝(PRICE_STEP) 위 가격은 예산을 넘는다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      if (
        result.affordablePrice === 0 ||
        result.affordablePrice >= SEARCH_UPPER_BOUND
      ) {
        return;
      }
      const overPrice = result.affordablePrice + PRICE_STEP;
      const overOwnFunds = ownFundsAt(overPrice, p, rules);
      expect(overOwnFunds).toBeGreaterThan(result.availableCash);
    },
  );

  it("정책대출이 실제로 최종 대출 한도를 결정짓는 케이스가 있다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 200_000_000, annualIncome: 70_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("POLICY");
  });

  it("고정 부대비용조차 감당하지 못하면 0원과 경고를 반환한다", () => {
    const result = calcAffordablePrice(profile({ cash: 1_000_000 }), rules);
    expect(result.affordablePrice).toBe(0);
    expect(result.warnings).toContain(
      "고정 부대비용(법무비·이사비)만으로도 보유 현금을 초과합니다.",
    );
  });
});
