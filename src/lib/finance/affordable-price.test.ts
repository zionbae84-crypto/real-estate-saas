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

/** 자격이 되는 정책대출 중 가장 큰 한도. 없으면 0(정책대출이라는 선택지 없음). */
function policyLimitAt(price: number, p: BuyerProfile, r: Rules): number {
  const matched = matchPolicyLoans(p, r, price);
  if (matched.length === 0) return 0;
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

  // 값 변경(2026-08-17, 정책대출 최대값 의미론 도입): 이전에는 0이었다.
  // 정책대출이 min()의 일부였을 때는 DSR 0이 전체 한도를 0으로 눌렀지만,
  // 이제 정책대출은 은행 경로와 별개의 "선택지"이므로 DSR 0이 정책대출
  // 한도를 누르지 못한다. 무주택·연소득 0은 디딤돌·보금자리론 eligibility
  // (소득 "상한"만 있고 하한이 없음)를 모두 만족하므로 POLICY 360,000,000이
  // 그대로 최대치가 되고, 실구매력이 352,600,000으로 산출된다.
  //
  // ⚠ 이 동작은 승인된 모델의 직접적 결과이지만, "사지 말라고 말해주는"
  //    제품 방향과는 상충한다(무소득·무현금 구매자에게 3.5억을 제시).
  //    최종 보고서의 Group 3 우려 항목에 올려 두었다.
  it("무소득·무현금이라도 정책대출 자격이 있으면 실구매력이 0이 아니다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 0, annualIncome: 0 }),
      rules,
    );
    expect(result.affordablePrice).toBe(352_600_000);
    expect(result.loanLimit.binding).toBe("POLICY");
    // DSR은 은행 경로만 제약한다 — 정책대출 경로는 누르지 못한다
    expect(result.loanLimit.breakdown.DSR).toBe(0);
  });

  it("정책대출 선택지가 없는 무소득·무현금이면 실구매력이 0이다", () => {
    // 갈아타기는 requiresNoHome을 만족하지 못해 정책대출 자격이 없다.
    // 이 경로에서는 실구매력이 0으로 무너지는 성질이 그대로 유지된다.
    const result = calcAffordablePrice(
      profile({ status: "갈아타기", cash: 0, annualIncome: 0 }),
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
    // 최대값 의미론에서 POLICY가 0이면 "정책대출 선택지 없음"이다.
    // 자격이 있으면 0보다 큰 실제 한도가 들어와야 한다.
    expect(result.loanLimit.breakdown.POLICY).toBeGreaterThan(0);
  });

  it("실구매력은 10만원 단위로 내림한 정수다", () => {
    const result = calcAffordablePrice(profile(), rules);
    expect(result.affordablePrice % 100_000).toBe(0);
  });
});

describe("calcAffordablePrice — 정책대출 절벽 구간", () => {
  it("정책대출 절벽 너머에 있는 최대가를 찾아낸다", () => {
    // 연소득 70,000,000, 무주택, 생애최초 아님. 이 구매자의 답(610,300,000)은
    // 보금자리론 절벽(600,000,000) 너머에 있다.
    //
    // 최대값 의미론 도입 전에는 절벽을 넘는 순간 정책 한도라는 "상한"이
    // 사라져 대출한도가 뛰고 자기부담금이 떨어졌다 — f가 아래로 꺾여
    // 단순 이분 탐색이 절벽을 넘지 못하는 것이 이 테스트의 원래 표적이었다.
    // 이제 절벽은 반대 방향(선택지 상실 → f 상승)으로 작용해 그 실패 양상은
    // 사라졌지만, 구간 분할 탐색이 절벽 너머 답을 놓치지 않는다는 성질은
    // 그대로 지켜야 하므로 회귀 고정용으로 남긴다.
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

  // 프로필 변경(2026-08-17, 정책대출 최대값 의미론 도입): 이전에는
  // cash 200,000,000 · 연소득 70,000,000이 POLICY에 걸렸다. 그 구매자는
  // DSR 한도 402,021,298이 정책대출 360,000,000보다 크므로, 이제는
  // 정책대출을 택하지 않는 편이 유리하다(binding DSR, 실구매력
  // 591,000,000). "정책대출이 최대치를 만드는" 사례는 은행 경로가 정책
  // 한도보다 작은 저소득 구매자에서 나온다.
  it("정책대출이 실제로 최종 대출 한도를 결정짓는 케이스가 있다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 220_000_000, annualIncome: 50_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("POLICY");
    expect(result.loanLimit.amount).toBe(360_000_000);
    // 은행 경로(DSR 287,158,070)보다 정책대출이 더 크다
    expect(result.loanLimit.breakdown.DSR).toBeLessThan(
      result.loanLimit.breakdown.POLICY,
    );
  });

  it("고정 부대비용조차 감당하지 못하면 0원과 경고를 반환한다", () => {
    const result = calcAffordablePrice(profile({ cash: 1_000_000 }), rules);
    expect(result.affordablePrice).toBe(0);
    expect(result.warnings).toContain(
      "고정 부대비용(법무비·이사비)만으로도 보유 현금을 초과합니다.",
    );
  });
});
