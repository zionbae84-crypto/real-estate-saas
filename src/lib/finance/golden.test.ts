import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

/**
 * 공식 발표 수치와 엔진 계산을 대조하는 골든 테스트.
 * 실패하면 코드보다 rules/2026-03.json을 먼저 의심한다.
 */
describe("골든 테스트 — 공식 수치 대조", () => {
  const highEarner: BuyerProfile = {
    status: "무주택",
    cash: 1_000_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
  };

  // 출처: 금융위원회 보도자료 "3단계 스트레스 DSR 시행방안 확정·발표"
  // (fsc.go.kr no010101/84617, 2025-05-20) — 수도권 주담대 가산금리 1.50%p.
  // 동 시행에 따른 금융당국 시뮬레이션(연소득 1억, 30년, 변동금리 4.2%,
  // 원리금균등)에서 대출한도가 5억9천만원 → 5억7천만원으로 축소된다고
  // 보도됨(뉴스토마토·kpinews 등 다수가 금융당국 시뮬레이션을 인용).
  // rules.baseRate(0.042) + stressDSR.surcharge(0.015)로 동일 조건을
  // 계산하면 약 5억7,431만원이 나와 해당 시뮬레이션과 일치한다.
  it("연소득 1억 · 30년 · 변동금리 · 스트레스 3단계 DSR 한도가 5.5억~6.0억 범위다", () => {
    const result = calcMaxLoan(highEarner, rules, 2_000_000_000);
    expect(result.breakdown.DSR).toBeGreaterThan(550_000_000);
    expect(result.breakdown.DSR).toBeLessThan(600_000_000);
  });

  // 출처: 금융위원회 보도자료 "수도권 주택담보대출 6억까지···'갭투자' 제동"
  // (fsc.go.kr no010107/84834, 2025-06-28) — "금융회사가 수도권·규제지역
  // 내에서 취급하는 주택구입목적 주담대의 최대한도를 6억원으로 제한".
  it("수도권 주택구입 목적 대출은 6억을 넘지 못한다", () => {
    const result = calcMaxLoan(
      { ...highEarner, annualIncome: 1_000_000_000 },
      rules,
      3_000_000_000,
    );
    expect(result.amount).toBe(600_000_000);
    expect(result.binding).toBe("CAP");
  });

  // 출처: rules.ltv.default(0.7)와 위 6억 절대상한(absoluteCap) 두 수치의
  // 조합 검증. LTV만 적용하면 12억 × 70% = 8.4억이 나오지만, 절대상한
  // 6억이 더 작으므로 최종 한도는 6억으로 잘려야 한다.
  // 신뢰도 주의: 이 테스트는 rules.ltv.default(0.7)를 사용한다. 이 값은
  // task-9-report.md 5절에 기록된 대로 "미확인"(규제지역/비규제지역 구분을
  // 앱이 모델링하지 않아 단일 금융위 원문으로 확정하지 못함) 상태이며,
  // 이 파일의 다른 테스트들보다 확신도가 낮다.
  it("12억 아파트 · LTV 70%는 8.4억이 아니라 6억으로 잘린다", () => {
    const result = calcMaxLoan(
      { ...highEarner, annualIncome: 1_000_000_000 },
      rules,
      1_200_000_000,
    );
    expect(result.breakdown.LTV).toBe(840_000_000);
    expect(result.amount).toBe(600_000_000);
  });

  // 출처: 금융위원회 보도자료 「수도권 중심의 가계부채 관리 강화방안」
  // (fsc.go.kr no010101/84824) 및 「수도권 주택담보대출 6억까지···
  // '갭투자' 제동」(fsc.go.kr no010107/84834), 2025-06-27 발표: "수도권·
  // 규제지역 내 생애최초 주택구입 목적 주담대의 LTV를 80%에서 70%로
  // 강화". 이 앱의 MVP 범위는 수도권 한정이므로 생애최초 우대 없이
  // rules.ltv.default와 동일한 70%가 적용되어야 한다.
  it("생애최초 주담대 LTV는 (구)80%가 아니라 70%다 — 2025-06-27 가계부채 대책", () => {
    const result = calcMaxLoan(
      { ...highEarner, isFirstTimeBuyer: true },
      rules,
      300_000_000,
    );
    expect(result.breakdown.LTV).toBe(210_000_000);
  });
});
