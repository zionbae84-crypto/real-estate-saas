import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { parseRules } from "./rules";
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

describe("calcAcquisitionCosts", () => {
  it("6억 이하 · 85㎡ 이하면 취득세가 1.1%다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      500_000_000,
      profile(),
      rules,
    );
    expect(acquisitionTax).toBe(5_500_000);
  });

  it("85㎡ 초과면 농특세 0.2%가 더 붙는다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      500_000_000,
      profile({ exclusiveAreaSqm: 101 }),
      rules,
    );
    expect(acquisitionTax).toBe(6_500_000);
  });

  it("9억 초과면 취득세가 3.3%다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      1_000_000_000,
      profile(),
      rules,
    );
    expect(acquisitionTax).toBe(33_000_000);
  });

  it("6억~9억 구간은 누진 세율이라 6억일 때 1%, 9억일 때 3%로 이어진다", () => {
    const at6 = calcAcquisitionCosts(600_000_000, profile(), rules);
    const at9 = calcAcquisitionCosts(900_000_000, profile(), rules);
    expect(at6.acquisitionTax).toBe(6_600_000);
    expect(at9.acquisitionTax).toBe(29_700_000);
  });

  it("6억~9억 구간의 세율은 가격에 따라 단조 증가한다", () => {
    const prices = [600_000_000, 700_000_000, 800_000_000, 900_000_000];
    const taxes = prices.map(
      (p) => calcAcquisitionCosts(p, profile(), rules).acquisitionTax,
    );
    for (let i = 1; i < taxes.length; i++) {
      expect(taxes[i]!).toBeGreaterThan(taxes[i - 1]!);
    }
  });

  it("생애최초는 취득세를 감면 한도만큼 깎아준다", () => {
    const normal = calcAcquisitionCosts(500_000_000, profile(), rules);
    const first = calcAcquisitionCosts(
      500_000_000,
      profile({ isFirstTimeBuyer: true }),
      rules,
    );
    expect(normal.acquisitionTax - first.acquisitionTax).toBe(2_000_000);
  });

  it("생애최초 감면이 세액보다 크면 0으로 막는다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      100_000_000,
      profile({ isFirstTimeBuyer: true }),
      rules,
    );
    expect(acquisitionTax).toBe(0);
  });

  it("중개보수는 구간 요율을 적용한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      500_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(2_000_000);
  });

  it("중개보수가 상한보다 낮으면 계산된 금액을 그대로 청구한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      150_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(750_000);
  });

  it("중개보수가 상한을 초과하면 상한으로 제한된다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      180_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(800_000);
  });

  it("상한이 없는 구간은 계산된 요금을 그대로 청구한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      250_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(1_000_000);
  });

  // Task 3에서 brokerageVat·housingBondCost 두 항목이 CostBreakdown에
  // 추가되어 total이 여섯 항목의 합이 됐다. 이 테스트는 항목 나열이지
  // 리터럴 값이 아니므로, 새 항목을 더하지 않으면 total이 더 커진 만큼
  // 실패한다.
  it("total은 모든 항목의 합이다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.total).toBe(
      costs.acquisitionTax +
        costs.brokerageFee +
        costs.brokerageVat +
        costs.legalFee +
        costs.movingCost +
        costs.housingBondCost,
    );
  });

  it("모든 금액은 정수다", () => {
    const costs = calcAcquisitionCosts(777_777_777, profile(), rules);
    for (const value of Object.values(costs)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  // legalFee·movingCost·total은 예전에 내림 없이 그대로 흘러나갔다.
  // 지금 룰셋의 값이 마침 정수라 드러나지 않았을 뿐, 소수 값이 들어오면
  // "반환 금액은 정수 원"이라는 계약이 깨진다.
  it("룰셋의 정액 항목이 소수여도 반환 금액은 정수다", () => {
    const fractionalRules = {
      ...rules,
      legalFee: 600_000.7,
      movingCost: 1_500_000.3,
    };
    const costs = calcAcquisitionCosts(500_000_000, profile(), fractionalRules);

    expect(costs.legalFee).toBe(600_000);
    expect(costs.movingCost).toBe(1_500_000);
    for (const value of Object.values(costs)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    // Task 3에서 추가된 brokerageVat·housingBondCost도 합계에 포함해야 한다.
    expect(costs.total).toBe(
      costs.acquisitionTax +
        costs.brokerageFee +
        costs.brokerageVat +
        costs.legalFee +
        costs.movingCost +
        costs.housingBondCost,
    );
  });
});

/**
 * 결함(코드 리뷰 발견): price가 검증 없이 흘러들어가, price: -1이
 * calcAcquisitionCosts에서 음수 중개보수를 만들어냈다. price는 profile과
 * 동일한 기준(유한·비음수)으로 공개 경계에서 검증되어야 한다.
 */
describe("calcAcquisitionCosts — price 경계 검증", () => {
  it.each([Infinity, -Infinity, -1, NaN])(
    "price가 %s이면 예외를 던진다",
    (price) => {
      expect(() => calcAcquisitionCosts(price, profile(), rules)).toThrow(
        RangeError,
      );
      expect(() => calcAcquisitionCosts(price, profile(), rules)).toThrow(
        /price/,
      );
    },
  );

  it("정상적인 price는 그대로 통과한다", () => {
    expect(() =>
      calcAcquisitionCosts(500_000_000, profile(), rules),
    ).not.toThrow();
    expect(() => calcAcquisitionCosts(0, profile(), rules)).not.toThrow();
  });
});

describe("중개보수 부가가치세", () => {
  it("중개보수의 10%가 부가세로 붙는다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.brokerageFee).toBe(2_000_000);
    expect(costs.brokerageVat).toBe(200_000);
  });

  it("부가세는 상한이 적용된 뒤의 중개보수에 붙는다", () => {
    // 1.8억은 상한 80만원이 걸리는 구간이다. 부가세는 90만원(상한 전)이
    // 아니라 80만원(상한 후)의 10%여야 한다.
    const costs = calcAcquisitionCosts(180_000_000, profile(), rules);
    expect(costs.brokerageFee).toBe(800_000);
    expect(costs.brokerageVat).toBe(80_000);
  });

  it("부가세율이 0이면 부가세도 0이다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), {
      ...rules,
      brokerageVatRate: 0,
    });
    expect(costs.brokerageVat).toBe(0);
  });
});

describe("국민주택채권", () => {
  it("시가표준액 추정 후 구간 매입률과 할인율을 곱한다", () => {
    // 매매가 5억 × 공시비율 0.7 = 시가표준액 3.5억
    // → 2.6억~6억 구간, 1,000원당 26원 = 3.5억 × 0.026 = 910만원 채권
    // → 할인율 8% = 728,000원
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.housingBondCost).toBe(728_000);
  });

  it("가격이 오르면 구간이 올라가 부담도 커진다", () => {
    const low = calcAcquisitionCosts(300_000_000, profile(), rules);
    const high = calcAcquisitionCosts(900_000_000, profile(), rules);
    expect(high.housingBondCost).toBeGreaterThan(low.housingBondCost);
  });

  it("시가표준액이 최저 구간 미만이면 채권 부담이 없다", () => {
    // 매매가 2,000만 × 0.7 = 1,400만 → 2,000만 미만 구간, 매입률 0
    const costs = calcAcquisitionCosts(20_000_000, profile(), rules);
    expect(costs.housingBondCost).toBe(0);
  });

  // 예전에는 여기서 assumedDiscountRate: 0을 "채권을 팔지 않는 경우"로
  // 만들어 housingBondCost가 0이 됨을 확인했다. 하지만 parseRules는
  // assumedDiscountRate를 (0, 1] 범위(assertRatio)로 검사해 0을
  // 거부한다 — 즉 실제 룰셋 JSON은 이 상태에 도달할 수 없다. 이 테스트를
  // 남겨 두면 지원되지 않는 설정을 지원되는 것처럼 문서화하게 된다.
  // 같은 의도(경계값 검사)는 rules.test.ts의
  // "housingBond.assumedDiscountRate가 0이면 실패한다" 테스트가 대신한다.
});

describe("확장된 total", () => {
  it("total은 여섯 항목의 합이다", () => {
    const c = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(c.total).toBe(
      c.acquisitionTax +
        c.brokerageFee +
        c.brokerageVat +
        c.legalFee +
        c.movingCost +
        c.housingBondCost,
    );
  });

  it("모든 금액은 정수다", () => {
    const c = calcAcquisitionCosts(777_777_777, profile(), rules);
    for (const value of Object.values(c)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("두 항목이 더해져 total이 이전보다 커진다", () => {
    const c = calcAcquisitionCosts(500_000_000, profile(), rules);
    const withoutNew = c.total - c.brokerageVat - c.housingBondCost;
    expect(c.total).toBeGreaterThan(withoutNew);
  });
});
