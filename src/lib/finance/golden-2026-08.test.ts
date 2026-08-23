import { describe, expect, it } from "vitest";
import rawRules2026_03 from "../../../rules/2026-03.json";
import rawRules from "../../../rules/2026-08.json";
import { calcAffordablePrice } from "./affordable-price";
import { calcAbsoluteCap, calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import type { BuyerProfile, Rules } from "./types";

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

  // 출처: 주금공 공시(기준연월 2026년 08월, 공시일 2026-08-01).
  // u-보금자리론 30년 만기 5.20% + 같은 공시의 규제지역 가산금리 0.2%p.
  // 가산은 규제 여부와 무관하게 무조건 얹는다(룰셋 _scope·_note 참고) —
  // 스키마에 정책대출의 지역 축이 없고, 이 파일은 스트레스 금리 하한과
  // absoluteCap도 같은 방식으로 무조건 적용하기 때문이다.
  it("보금자리론 금리가 규제지역 가산을 포함한 5.40%다", () => {
    const bogeum = rules.policyLoans.find((l) => l.id === "보금자리론");
    expect(bogeum?.rate).toBe(0.054);
  });

  // 회귀 잠금: 가산을 빠뜨린 옛 값(기본금리 5.20%)으로 되돌리면 실패한다.
  // 가산이 빠지면 월 상환액이 작아지고 한도가 커진다 — 낙관 방향이다.
  it("보금자리론 금리가 가산 없는 기본금리(5.20%)가 아니다", () => {
    const bogeum = rules.policyLoans.find((l) => l.id === "보금자리론");
    expect(bogeum?.rate).not.toBe(0.052);
    expect(bogeum?.rate).toBeGreaterThan(0.052);
  });

  // 출처: 주금공 디딤돌대출 금리 공시(공시일 2026-06-01)의 소득구간별·
  // 만기별 고정금리 표 — 30년 만기 열, 소득(부부합산) 4,000~7,000만원
  // 구간의 3.80%. 그 칸인 이유는 (1) 엔진이 loanTermMonths(360 = 30년)로
  // 상환액을 계산하므로 만기를 30년 열에서 골라야 하고, (2) 이 상품의
  // eligibility.maxAnnualIncome이 6,000만원이라 자격이 되는 소득이
  // 4,000~7,000만원 구간 안에서 끝나며, 그 구간의 30년 금리가 자격 범위
  // 안에서 가장 높기 때문이다("고시 범위의 상단을 쓴다"는 룰셋 원칙).
  it("디딤돌 금리가 30년 만기 기준 3.80%다", () => {
    const didim = rules.policyLoans.find((l) => l.id === "디딤돌");
    expect(didim?.rate).toBe(0.038);
  });

  // 회귀 잠금: 옛 값 3.55%는 같은 표의 **10년 만기** 칸이라
  // loanTermMonths(360)와 만기가 어긋났다. 되돌리면 이 테스트가 죽는다.
  it("디딤돌 금리가 10년 만기 값(3.55%)이 아니다", () => {
    const didim = rules.policyLoans.find((l) => l.id === "디딤돌");
    expect(didim?.rate).not.toBe(0.0355);
    expect(didim?.rate).toBeGreaterThan(0.0355);
  });

  // 디딤돌 금리는 자격 소득 상한이 속한 구간에서 골라야 한다. 소득 상한을
  // 올리면(예: 8,500만원) 더 높은 구간(7,000~8,500만원, 30년 4.15%)이
  // 자격 안에 들어오므로 금리도 함께 올려야 한다 — 이 짝이 어긋나면
  // 고소득 신청자에게 실제보다 낮은 금리로 한도를 계산해 준다.
  it("디딤돌 소득 상한이 금리를 고른 구간(4,000~7,000만원) 안에 있다", () => {
    const didim = rules.policyLoans.find((l) => l.id === "디딤돌");
    expect(didim?.eligibility.maxAnnualIncome).toBeGreaterThan(40_000_000);
    expect(didim?.eligibility.maxAnnualIncome).toBeLessThanOrEqual(70_000_000);
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

  // 기준 프로필의 실구매력 골든 단언.
  //
  // 위 테스트들은 금리·캡 같은 룰셋의 개별 조회값만 고정한다 — 사용자가
  // 화면에서 실제로 보는 숫자(실구매력, 어느 제약이 걸렸는지)는 어디에도
  // 고정돼 있지 않았다. 누가 rules/2026-08.json의 값을 바꿔도 이 숫자는
  // 조용히 움직일 수 있었다.
  //
  // 현금 2억 / 연소득 6천만원 / 기존부채 0 / 생애최초 / 규제지역 /
  // 전용 84㎡ / 무주택. 확인된 값: 4억 7,700만원, 제약은 DSR.
  it("기준 프로필(현금 2억·연소득 6천만·생애최초·규제지역)의 실구매력이 4억 7,700만원이고 DSR이 제약이다", () => {
    const buyer: BuyerProfile = {
      status: "무주택",
      cash: 200_000_000,
      annualIncome: 60_000_000,
      existingDebtAnnualPayment: 0,
      isFirstTimeBuyer: true,
      exclusiveAreaSqm: 84,
      isRegulatedArea: true,
    };
    const result = calcAffordablePrice(buyer, rules);

    expect(result.loanLimit.binding).toBe("DSR");
    expect(result.affordablePrice).toBe(477_000_000);
  });

  /**
   * 디딤돌 금리를 30년 만기에 맞춰 올린 변경(3.55% → 3.80%)이 실제로
   * 사용자가 보는 숫자를 **줄이는** 방향인지 확인한다.
   *
   * 위 금리 단언들은 룰셋의 값 하나만 본다 — 값이 맞아도 그 값이 화면의
   * 숫자를 어느 방향으로 움직이는지는 말해주지 않는다. 이 제품이 막으려는
   * 결함은 "실제보다 더 빌릴 수 있다고 믿게 만드는 것"이므로, 금리가
   * 오르면 한도와 실구매력이 내려간다는 사실 자체를 잠근다.
   *
   * 이 프로필(연소득 3,000만·현금 1억·무주택·생애최초)은 POLICY가 실제로
   * 제약이 되는 자리다 — 디딤돌 금리가 화면 숫자에 그대로 흘러나온다.
   * 소득이 높으면 디딤돌 고시 한도 2.5억이 먼저 걸려 금리 변화가 묻힌다.
   */
  const 디딤돌구매자: BuyerProfile = {
    status: "무주택",
    cash: 100_000_000,
    annualIncome: 30_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    isRegulatedArea: false,
  };

  /** 룰셋의 정책대출 금리만 바꾼 사본. 나머지 값은 건드리지 않는다 */
  function withPolicyRate(id: string, rate: number): Rules {
    return parseRules({
      ...rawRules,
      policyLoans: rawRules.policyLoans.map((loan) =>
        loan.id === id ? { ...loan, rate } : loan,
      ),
    });
  }

  it("디딤돌 금리가 오르면 정책대출 한도와 실구매력이 내려간다", () => {
    const 옛금리 = withPolicyRate("디딤돌", 0.0355);
    const price = 250_000_000;

    expect(calcMaxLoan(디딤돌구매자, rules, price).breakdown.POLICY).toBeLessThan(
      calcMaxLoan(디딤돌구매자, 옛금리, price).breakdown.POLICY,
    );
    expect(calcAffordablePrice(디딤돌구매자, rules).affordablePrice).toBeLessThan(
      calcAffordablePrice(디딤돌구매자, 옛금리).affordablePrice,
    );
  });

  /**
   * 금리가 코드에 박혀 있지 않고 룰셋에서 온다.
   *
   * 룰셋의 금리만 바꾼 사본으로 계산하면 결과가 따라 움직여야 한다.
   * 누군가 엔진에 금리를 상수로 박아 넣으면(그러면 룰셋을 고쳐도 답이
   * 안 변한다) 이 테스트가 죽는다.
   */
  it("정책대출 금리는 룰셋에서 오고 코드에 박혀 있지 않다", () => {
    const price = 250_000_000;
    const 낮은금리 = calcMaxLoan(디딤돌구매자, withPolicyRate("디딤돌", 0.02), price)
      .breakdown.POLICY;
    const 높은금리 = calcMaxLoan(디딤돌구매자, withPolicyRate("디딤돌", 0.06), price)
      .breakdown.POLICY;

    expect(높은금리).toBeLessThan(낮은금리);
    // 현행 룰셋 값(3.80%)의 결과가 그 두 값 사이에 놓인다
    const 현행 = calcMaxLoan(디딤돌구매자, rules, price).breakdown.POLICY;
    expect(현행).toBeLessThan(낮은금리);
    expect(현행).toBeGreaterThan(높은금리);
  });

  /**
   * 디딤돌 금리 변경이 실구매력을 얼마나 줄이는지 크기까지 고정한다.
   *
   * 방향만 잠그면 "1원 줄었다"도 통과한다. 사용자가 보는 숫자가 실제로
   * 얼마나 움직이는지가 이 변경의 핵심이므로 값 자체를 박는다.
   * 확인된 값: 2억 5,300만원 → 2억 4,910만원 (390만원 감소).
   */
  it("디딤돌 구매자(연소득 3천만·현금 1억)의 실구매력이 2억 4,910만원이고 POLICY가 제약이다", () => {
    const result = calcAffordablePrice(디딤돌구매자, rules);

    expect(result.loanLimit.binding).toBe("POLICY");
    expect(result.affordablePrice).toBe(249_100_000);
    expect(
      calcAffordablePrice(디딤돌구매자, withPolicyRate("디딤돌", 0.0355))
        .affordablePrice,
    ).toBe(253_000_000);
  });
});
