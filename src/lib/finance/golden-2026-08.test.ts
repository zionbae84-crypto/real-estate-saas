import { describe, expect, it } from "vitest";
import rawRules2026_03 from "../../../rules/2026-03.json";
import rawRules from "../../../rules/2026-08.json";
import { calcAbsoluteCap, calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);
const rules2026_03 = parseRules(rawRules2026_03);

/**
 * 2026-08 룰셋의 공식 수치 대조.
 *
 * 실패하면 코드보다 rules/2026-08.json을 먼저 의심한다.
 *
 * 2026-03용 골든 테스트(golden.test.ts)는 그 시점의 발표를 재현하는 것이
 * 일이므로 그대로 둔다. 이 파일은 현행 고시를 재현한다.
 */
describe("골든 테스트 2026-08 — 현행 고시 대조", () => {
  const base: BuyerProfile = {
    status: "무주택",
    cash: 1_000_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    isRegulatedArea: false,
  };

  // 출처: 10·15 주택시장 안정화 대책(2025-10-15 발표, 10-16 시행).
  // "스트레스 금리 하한을 수도권·규제지역 내 주담대에 한해 3%로 상향 조정".
  it("스트레스 가산금리가 3%다", () => {
    expect(rules.stressDSR.surcharge).toBe(0.03);
  });

  // 스트레스 1.5%p에서 3.0%p로 오르면 DSR 심사금리가 오르고, 같은 소득으로
  // 감당할 수 있는 원금이 줄어든다. 방향만 고정한다 — 정확한 금액은
  // baseRate와 함께 움직이므로 범위로 잡는다.
  it("같은 소득에서 DSR 한도가 2026-03보다 작다", () => {
    const oldLimit = calcMaxLoan(base, rules2026_03, 2_000_000_000).breakdown.DSR;
    const newLimit = calcMaxLoan(base, rules, 2_000_000_000).breakdown.DSR;
    expect(newLimit).toBeLessThan(oldLimit);
  });

  // 출처: 10·15 대책 — "주택가격(시가) 15억 원 이하 → 6억 원 /
  // 15억 초과 25억 이하 → 4억 원 / 25억 초과 → 2억 원".
  it.each([
    [1_000_000_000, 600_000_000],
    [1_500_000_000, 600_000_000],
    [1_500_000_001, 400_000_000],
    [2_500_000_000, 400_000_000],
    [2_500_000_001, 200_000_000],
    [5_000_000_000, 200_000_000],
  ])("가격 %d원에서 절대캡이 %d원이다", (price, expected) => {
    expect(calcAbsoluteCap(rules, price)).toBe(expected);
  });

  // 소득을 극단적으로 높여 DSR을 무력화하고, 캡이 실제로 한도를 결정하는지
  // 본다. 30억 주택이므로 캡은 2억이다.
  it("30억 주택에서는 한도가 2억이고 CAP이 제약이다", () => {
    const result = calcMaxLoan(
      { ...base, annualIncome: 5_000_000_000, cash: 10_000_000_000 },
      rules,
      3_000_000_000,
    );
    expect(result.amount).toBe(200_000_000);
    expect(result.binding).toBe("CAP");
  });

  // 20억 주택 → 캡 4억. LTV 70% = 14억이므로 캡이 이긴다.
  it("20억 주택에서는 한도가 4억이고 CAP이 제약이다", () => {
    const result = calcMaxLoan(
      { ...base, annualIncome: 5_000_000_000, cash: 10_000_000_000 },
      rules,
      2_000_000_000,
    );
    expect(result.amount).toBe(400_000_000);
    expect(result.binding).toBe("CAP");
  });

  // 출처: 주금공 2026-08-01 공시, u-보금자리론 30년 만기 5.20%.
  it("보금자리론 금리가 5.20%다", () => {
    const bogeum = rules.policyLoans.find((l) => l.id === "보금자리론");
    expect(bogeum?.rate).toBe(0.052);
  });

  // 출처: 디딤돌대출 고시 범위 2.45~3.55%의 상단.
  it("디딤돌 금리가 3.55%다", () => {
    const didim = rules.policyLoans.find((l) => l.id === "디딤돌");
    expect(didim?.rate).toBe(0.0355);
  });

  // 출처: 한국은행 가중평균금리 2026-06, 예금은행 신규취급액 기준
  // 고정형 주담대 4.53%.
  it("시중금리 가정이 4.53%다", () => {
    expect(rules.baseRate).toBe(0.0453);
  });

  // 규제지역 LTV는 10·15 대책 이후에도 무주택자 40%, 생애최초 70%다.
  it("규제지역 LTV가 무주택 40% · 생애최초 70%다", () => {
    expect(rules.ltv.regulated.default).toBe(0.4);
    expect(rules.ltv.regulated.firstTimeBuyer).toBe(0.7);
  });
});
