import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
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
  it("정책대출 한도가 은행 한도보다 크면 POLICY가 최대치가 된다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000, 300_000_000);
    expect(result.binding).toBe("POLICY");
    expect(result.amount).toBe(300_000_000);
  });

  // 변경 전에는 min()이라 amount가 100,000,000(POLICY)이었다. 정책대출을
  // 택하지 않으면 그만인데도 한도가 깎이던 것이 결함이었다.
  it("정책대출 한도가 은행 한도보다 작으면 한도를 깎지 않는다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000, 100_000_000);
    expect(result.binding).toBe("LTV");
    expect(result.amount).toBe(210_000_000);
    expect(result.breakdown.POLICY).toBe(100_000_000);
  });

  // 이 결함의 실제 관측 사례: 자격이 있다는 이유만으로 무주택 구매자가
  // 동일 조건의 갈아타기 구매자보다 덜 빌릴 수 있다고 답하던 문제.
  it("정책대출 자격이 있다고 해서 한도가 줄어들지 않는다", () => {
    const withoutPolicy = calcMaxLoan(profile(), rules, 600_000_000);
    const withPolicy = calcMaxLoan(profile(), rules, 600_000_000, 360_000_000);
    expect(withPolicy.amount).toBeGreaterThanOrEqual(withoutPolicy.amount);
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

  it("기존 부채가 소득 한도를 이미 넘으면 대출이 0이다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 50_000_000, existingDebtAnnualPayment: 30_000_000 }),
      rules,
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
