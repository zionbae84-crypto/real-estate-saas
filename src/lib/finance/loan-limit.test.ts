import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcMaxLoan, calcPolicyLimit } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile, PolicyLoanRule, Rules } from "./types";

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

/**
 * 정책대출 한도는 이제 calcMaxLoan이 가격에서 직접 도출하므로(인자가 아님),
 * 특정 정책 한도를 만들려면 룰셋 쪽을 바꿔야 한다. 조건 없는 상품 하나만
 * 남긴 픽스처 룰셋을 만든다.
 */
function withPolicyLimit(maxAmount: number | null): Rules {
  const policyLoans: PolicyLoanRule[] =
    maxAmount === null
      ? []
      : [{ id: "픽스처상품", eligibility: {}, maxAmount, rate: 0.03 }];
  return { ...rules, policyLoans };
}

describe("calcMaxLoan", () => {
  it("고소득·저가주택이면 LTV에 걸린다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000);
    expect(result.binding).toBe("LTV");
    expect(result.amount).toBe(210_000_000);
  });

  // 2025-06-27 가계부채 관리 강화방안(금융위원회 보도자료 no010107/84834)으로
  // 수도권·규제지역 생애최초 주담대 LTV가 80%에서 70%로 조정되어, 이 앱이
  // 모델링하는 수도권 범위에서는 더 이상 생애최초 우대가 적용되지 않는다.
  // 향후 "80%로 복원" 시도를 막기 위해, 생애최초와 일반 매수자가 동일한
  // LTV 상한을 받는다는 사실 자체를 고정해 둔다(단순 금액 재현이 아님).
  it("수도권에서는 생애최초도 일반과 동일한 LTV 70%가 적용된다", () => {
    const firstTime = calcMaxLoan(
      profile({ isFirstTimeBuyer: true }),
      rules,
      300_000_000,
    );
    const notFirstTime = calcMaxLoan(
      profile({ isFirstTimeBuyer: false }),
      rules,
      300_000_000,
    );
    expect(firstTime.amount).toBe(210_000_000);
    expect(firstTime.amount).toBe(notFirstTime.amount);
  });

  it("소득이 낮으면 DSR에 걸린다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      1_000_000_000,
    );
    expect(result.binding).toBe("DSR");
  });

  it("고가주택·고소득이면 6억 절대캡에 걸린다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 300_000_000 }),
      rules,
      1_500_000_000,
    );
    expect(result.binding).toBe("CAP");
    expect(result.amount).toBe(600_000_000);
  });

  // 의미론 변경(2026-08-17): 정책대출은 반드시 따라야 하는 상한이 아니라
  // 구매자가 택할 수 있는 선택지다. 따라서 은행 한도보다 "작은" 정책대출은
  // 결과에 아무 영향이 없고, "큰" 정책대출만 최대치를 끌어올린다.
  //
  // 프로필·값 변경(2026-08-17, 정책 경로에 DSR·LTV 제약 도입): 이전에는
  // 연소득 1억 · 매매가 300,000,000 · 상품한도 300,000,000으로 POLICY
  // 300,000,000을 기대했다. 이제 정책 경로도 LTV(210,000,000)에 걸리므로
  // 그 조합으로는 정책대출이 은행 경로를 이길 수 없다 — 두 경로가 같은
  // LTV를 공유하기 때문이다. 정책대출이 이기려면 은행 경로가 DSR(또는
  // CAP)에 걸려야 한다. 아래 조합의 손계산:
  //   은행 = min(LTV 350,000,000, DSR@5.7% 229,726,456, CAP 600,000,000)
  //        = 229,726,456
  //   정책 = min(상품한도 250,000,000, LTV 350,000,000, DSR@4.5% 263,148,212)
  //        = 250,000,000
  it("정책대출 한도가 은행 한도보다 크면 POLICY가 최대치가 된다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      withPolicyLimit(250_000_000),
      500_000_000,
    );
    expect(result.binding).toBe("POLICY");
    expect(result.amount).toBe(250_000_000);
    expect(result.breakdown.DSR).toBe(229_726_456);
  });

  // 승인된 비대칭: absoluteCap은 수도권 주담대에 대한 규제이지 정책대출
  // 상품 고시 한도에 걸리는 상한이 아니다. 실제 룰셋의 상품 한도는 모두
  // 6억보다 한참 아래이므로 이 비대칭이 관측되지 않지만, 코드가 의도적으로
  // CAP을 정책 경로에서 뺀다는 사실 자체를 고정해 둔다.
  it("정책대출 경로에는 지역 절대캡이 걸리지 않는다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 300_000_000 }),
      withPolicyLimit(700_000_000),
      1_500_000_000,
    );
    expect(result.breakdown.CAP).toBe(600_000_000);
    expect(result.binding).toBe("POLICY");
    expect(result.amount).toBe(700_000_000);
  });

  // 변경 전에는 min()이라 amount가 100,000,000(POLICY)이었다. 정책대출을
  // 택하지 않으면 그만인데도 한도가 깎이던 것이 결함이었다.
  it("정책대출 한도가 은행 한도보다 작으면 한도를 깎지 않는다", () => {
    const result = calcMaxLoan(
      profile(),
      withPolicyLimit(100_000_000),
      300_000_000,
    );
    expect(result.binding).toBe("LTV");
    expect(result.amount).toBe(210_000_000);
    expect(result.breakdown.POLICY).toBe(100_000_000);
  });

  // 이 결함의 실제 관측 사례: 자격이 있다는 이유만으로 무주택 구매자가
  // 동일 조건의 갈아타기 구매자보다 덜 빌릴 수 있다고 답하던 문제.
  it("정책대출 자격이 있다고 해서 한도가 줄어들지 않는다", () => {
    const withoutPolicy = calcMaxLoan(
      profile(),
      withPolicyLimit(null),
      600_000_000,
    );
    const withPolicy = calcMaxLoan(
      profile(),
      withPolicyLimit(360_000_000),
      600_000_000,
    );
    expect(withPolicy.amount).toBeGreaterThanOrEqual(withoutPolicy.amount);
  });

  // 공개 API 오용 방지: 정책대출 한도를 호출자가 넘기는 선택적 인자로
  // 두었을 때, 그 값을 구하는 함수가 공개되지 않아 UI가 엔진과 다른
  // 답을 냈다. 이제 calcMaxLoan이 가격에서 직접 도출한다.
  it("정책대출 한도를 호출자가 넘기지 않아도 엔진이 직접 도출한다", () => {
    const p = profile({ annualIncome: 50_000_000 });
    const result = calcMaxLoan(p, rules, 500_000_000);
    expect(result.breakdown.POLICY).toBe(
      calcPolicyLimit(p, rules, 500_000_000),
    );
    expect(result.breakdown.POLICY).toBeGreaterThan(0);
  });

  it("DSR 계산에 스트레스 가산금리를 적용한다", () => {
    const stressed = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      1_000_000_000,
    );
    const noStress = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      { ...rules, stressDSR: { stage: 0, surcharge: 0 } },
      1_000_000_000,
    );
    expect(stressed.amount).toBeLessThan(noStress.amount);
  });

  it("기존 부채가 DSR 여력을 잠식한다", () => {
    const clean = calcMaxLoan(
      profile({ annualIncome: 50_000_000 }),
      rules,
      1_000_000_000,
    );
    const indebted = calcMaxLoan(
      profile({ annualIncome: 50_000_000, existingDebtAnnualPayment: 10_000_000 }),
      rules,
      1_000_000_000,
    );
    expect(indebted.amount).toBeLessThan(clean.amount);
  });

  // 주석 갱신(2026-08-17, 정책 경로에 DSR·LTV 제약 도입): 최대값 의미론을
  // 도입했을 때는 정책 경로가 DSR을 우회해 실제 룰셋으로 amount가
  // 360,000,000이 되었고, 그래서 픽스처로 격리해야 했다. 이제는 정책 경로도
  // DSR 여력을 소진한 구매자에게 0을 주므로 실제 룰셋으로도 0이 나온다.
  // 그래도 이 테스트의 표적은 "은행 경로" 하나이므로 격리를 유지한다
  // (정책 경로의 동일 성질은 아래 DSR·LTV 제약 그룹이 따로 고정한다).
  it("기존 부채가 소득 한도를 이미 넘으면 은행 경로 대출이 0이다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 50_000_000, existingDebtAnnualPayment: 30_000_000 }),
      withPolicyLimit(null),
      500_000_000,
    );
    expect(result.amount).toBe(0);
    expect(result.binding).toBe("DSR");
  });

  it("모든 제약의 한도를 breakdown에 담는다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000);
    expect(Object.keys(result.breakdown).sort()).toEqual([
      "CAP",
      "DSR",
      "LTV",
      "POLICY",
    ]);
  });

  it("반환 금액은 정수다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 63_000_000 }),
      rules,
      777_000_000,
    );
    expect(Number.isInteger(result.amount)).toBe(true);
  });

  // 변경 전에는 POLICY가 Infinity일 수 있어 예외 처리가 필요했다.
  // 이제 "선택지 없음"을 0으로 표현하므로 네 값 모두 유한한 정수다.
  it("breakdown의 모든 값은 유한한 정수다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      1_000_000_000,
    );
    for (const value of Object.values(result.breakdown)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("amount는 breakdown[binding]과 정확히 같다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      1_000_000_000,
    );
    expect(result.amount).toBe(result.breakdown[result.binding]);
  });

  // 변경 전에는 "제약 없음"을 Infinity로 표현했다. 최대값 의미론에서
  // Infinity는 "무조건 정책대출이 이긴다"가 되어버리므로, 부재는 0이다.
  it("정책대출 선택지가 없을 때 breakdown.POLICY는 0이다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000);
    expect(result.breakdown.POLICY).toBe(0);
    expect(result.binding).not.toBe("POLICY");
  });
});

/**
 * 정책대출도 상환능력·담보가치의 제약을 받는다. 이 그룹이 지키는 것은
 * "정책대출의 혜택은 낮은 금리이지 심사 면제가 아니다"라는 모델이다.
 */
describe("calcMaxLoan — 정책대출 경로의 DSR·LTV 제약", () => {
  // 결함 수정(2026-08-17): 이전 모델은 정책 경로에 상품 고시 한도만 적용해,
  // 연소득 0원인 구매자에게 360,000,000을 빌려줄 수 있다고 답했다
  // (binding POLICY, breakdown.DSR 0이 무시됨). 이 제품이 막으려는 바로 그
  // 방향의 오답이다. 이제 정책 DSR 0이 정책 한도를 0으로 누른다.
  it("연소득이 0이면 정책대출 자격이 있어도 한도가 0이다", () => {
    const 무소득 = profile({
      cash: 0,
      annualIncome: 0,
      isFirstTimeBuyer: true,
    });
    // 자격 자체는 성립한다 — 소득 "상한"만 있고 하한이 없기 때문이다.
    expect(matchPolicyLoans(무소득, rules, 354_500_000).length).toBeGreaterThan(
      0,
    );

    const result = calcMaxLoan(무소득, rules, 354_500_000);
    expect(result.breakdown.POLICY).toBe(0);
    expect(result.breakdown.DSR).toBe(0);
    expect(result.amount).toBe(0);
  });

  // 연소득 1만원처럼 사실상 무소득인 경우에도 같은 방향이어야 한다.
  it("연소득이 거의 없으면 정책 한도도 거의 0이다", () => {
    const result = calcMaxLoan(
      profile({ cash: 0, annualIncome: 10_000 }),
      rules,
      354_500_000,
    );
    expect(result.breakdown.POLICY).toBeLessThan(1_000_000);
    expect(result.amount).toBeLessThan(1_000_000);
  });

  // 정책대출의 금리가 실제로 한도를 만들어 내는 사례.
  // 연소득 4천만 · 매매가 500,000,000 · 실제 룰셋(디딤돌 3.2%):
  //   은행 = min(LTV 350,000,000, DSR@5.7% 229,726,456, CAP 600,000,000)
  //        = 229,726,456
  //   디딤돌 = min(상품한도 250,000,000, LTV 350,000,000, DSR@4.7% 257,083,712)
  //          = 250,000,000
  //   보금자리론(4.2% = baseRate) = min(360,000,000, 350,000,000, 229,726,456)
  //          = 229,726,456
  // 상품별로 제약을 건 뒤 최대를 취하므로 250,000,000이 답이다.
  it("낮은 정책 금리가 은행 경로보다 큰 한도를 만든다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      500_000_000,
    );
    expect(result.binding).toBe("POLICY");
    expect(result.amount).toBe(250_000_000);
    expect(result.breakdown.POLICY).toBe(250_000_000);
    expect(result.breakdown.DSR).toBe(229_726_456);
    expect(result.breakdown.POLICY).toBeGreaterThan(result.breakdown.DSR);
  });

  // 회귀 방지: 누군가 정책 경로의 DSR을 baseRate로 되돌리면 이 테스트가
  // 깨진다. 디딤돌의 금리만 baseRate 이상으로 올린 픽스처에서는 금리
  // 우위가 사라져 정책 한도가 은행 DSR 한도까지 내려앉아야 한다.
  it("상품 금리를 baseRate까지 올리면 정책대출의 우위가 사라진다", () => {
    const buyer = profile({ annualIncome: 40_000_000 });
    const price = 500_000_000;

    const raiseDidimdol = (rate: number): Rules => ({
      ...rules,
      policyLoans: rules.policyLoans.map((loan) =>
        loan.id === "디딤돌" ? { ...loan, rate } : loan,
      ),
    });

    const 우대금리 = calcMaxLoan(buyer, rules, price);
    const 동일금리 = calcMaxLoan(buyer, raiseDidimdol(rules.baseRate), price);
    const 역전금리 = calcMaxLoan(
      buyer,
      raiseDidimdol(rules.baseRate + 0.01),
      price,
    );

    expect(우대금리.breakdown.POLICY).toBe(250_000_000);
    // 금리가 시중과 같아지면 정책 DSR = 은행 DSR이므로 우위가 정확히 0이 된다
    expect(동일금리.breakdown.POLICY).toBe(동일금리.breakdown.DSR);
    expect(동일금리.amount).toBe(229_726_456);
    expect(동일금리.binding).not.toBe("POLICY");
    // 시중보다 높은 금리라면 은행 경로를 이길 수 없다
    expect(역전금리.breakdown.POLICY).toBeLessThanOrEqual(
      역전금리.breakdown.DSR,
    );
    expect(역전금리.amount).toBeLessThanOrEqual(우대금리.amount);
  });

  // 정책 경로에도 담보가치 제약이 걸린다. 은행 경로가 LTV에 걸려 있으면
  // 정책대출은 원리상 그것을 이길 수 없다(두 경로가 같은 LTV를 쓴다).
  it("정책 한도는 LTV 한도를 넘지 못한다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 300_000_000 }),
      withPolicyLimit(500_000_000),
      300_000_000,
    );
    expect(result.breakdown.LTV).toBe(210_000_000);
    expect(result.breakdown.POLICY).toBe(210_000_000);
    expect(result.amount).toBe(210_000_000);
  });

  // breakdown.POLICY의 의미가 "상품 고시 한도"가 아니라 "실제로 받을 수 있는
  // 정책대출 한도"임을 고정한다.
  it("breakdown.POLICY는 상품 고시 한도를 넘지 않는다", () => {
    const buyer = profile({ annualIncome: 40_000_000 });
    const matched = matchPolicyLoans(buyer, rules, 500_000_000);
    const 고시한도최대 = Math.max(...matched.map((loan) => loan.maxAmount));

    const result = calcMaxLoan(buyer, rules, 500_000_000);
    expect(고시한도최대).toBe(360_000_000);
    expect(result.breakdown.POLICY).toBeLessThanOrEqual(고시한도최대);
    expect(result.breakdown.POLICY).toBe(
      calcPolicyLimit(buyer, rules, 500_000_000),
    );
  });
});
