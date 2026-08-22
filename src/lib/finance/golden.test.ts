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
    // 이 파일의 기존 테스트는 전부 비규제 수도권 70% 기준으로 쓰였다.
    // 기본값을 false로 둬 기존 기대값이 그대로 유지되게 한다.
    isRegulatedArea: false,
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

  // 출처: rules.ltv.unregulated.default(0.7)와 위 6억 절대상한(absoluteCap)
  // 두 수치의 조합 검증. LTV만 적용하면 12억 × 70% = 8.4억이 나오지만,
  // 절대상한 6억이 더 작으므로 최종 한도는 6억으로 잘려야 한다.
  // 갱신(규제지역 LTV 분기 도입): highEarner는 isRegulatedArea: false라
  // rules.ltv.unregulated.default(0.7)가 적용된다. 이 profile로
  // isRegulatedArea: true를 넣으면 LTV가 40%(4.8억)로 바뀌어 절대상한이
  // 아닌 LTV가 binding이 되므로, 이 테스트는 비규제 경로를 고정한다.
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
  // 강화". highEarner는 isRegulatedArea: false이므로
  // rules.ltv.unregulated.firstTimeBuyer(0.7)가 적용되어, 생애최초 우대
  // 없이 default와 동일한 70%가 나와야 한다(비규제에서는 우대가 없다는
  // 사실 자체는 아래 "규제지역 LTV" describe에서 별도로 고정한다).
  it("생애최초 주담대 LTV는 (구)80%가 아니라 70%다 — 2025-06-27 가계부채 대책", () => {
    const result = calcMaxLoan(
      { ...highEarner, isFirstTimeBuyer: true },
      rules,
      300_000_000,
    );
    expect(result.breakdown.LTV).toBe(210_000_000);
  });

  // 출처: 금융위 「주택시장 안정화 대책」 — 규제지역 무주택자·처분조건부
  // 1주택자의 LTV는 70%에서 40%로 강화됐고, 생애최초만 규제지역에서도
  // 70% 예외를 받는다. 이 두 수치가 어긋나면 룰셋을 먼저 의심한다.
  it("규제지역 무주택자 LTV는 40%, 생애최초는 70%다", () => {
    expect(rules.ltv.regulated.default).toBe(0.4);
    expect(rules.ltv.regulated.firstTimeBuyer).toBe(0.7);
    expect(rules.ltv.unregulated.default).toBe(0.7);
  });
});
