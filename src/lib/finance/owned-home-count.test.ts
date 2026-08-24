import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-08.json";
import { calcAcquisitionCosts, householdCountNoteFor } from "./acquisition-cost";
import { calcAffordablePrice } from "./affordable-price";
import { calcSafePrice } from "./safe-price";
import { calcSafetyScore } from "./safety";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 300_000_000,
    annualIncome: 70_000_000,
    existingDebtAnnualPayment: 6_000_000,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    isRegulatedArea: false,
    ...overrides,
  };
}

/**
 * **무주택 사용자의 답은 이 브랜치 전과 정확히 같아야 한다.**
 *
 * 아래 숫자는 이 브랜치를 만들기 전의 `main`에서 같은 프로필로 직접
 * 뽑은 값이다(주택 수 축이 없던 코드). 주택 수를 물어보게 됐다고 해서
 * 지금까지 0채였던 사람의 답이 한 원이라도 움직이면 안 된다 — 움직였다면
 * 이 브랜치가 자기가 고치겠다고 하지 않은 것을 고친 것이다.
 *
 * 값을 한곳에 모아 pin하는 이유: 실구매력만 고정하면 부담률·부대비용이
 * 조용히 달라져도 통과한다. 세 층(가격 · 대출 · 부담 · 비용)을 함께 묶는다.
 */
describe("무주택(0채) 구매자의 결과는 주택 수 축 도입 전과 같다", () => {
  const 무주택 = profile();
  const result = calcAffordablePrice(무주택, rules);

  it("실구매력·가용현금·안전선이 그대로다", () => {
    expect(result.affordablePrice).toBe(550_000_000);
    expect(result.availableCash).toBe(300_000_000);
    expect(calcSafePrice(무주택, rules)).toBe(478_300_000);
  });

  it("대출 한도와 제약 내역이 그대로다", () => {
    expect(result.loanLimit.amount).toBe(261_430_485);
    expect(result.loanLimit.binding).toBe("DSR");
    expect(result.loanLimit.breakdown).toEqual({
      LTV: 385_000_000,
      DSR: 261_430_485,
      CAP: 600_000_000,
      POLICY: 240_646_194,
    });
  });

  it("상환부담률이 그대로다", () => {
    const safety = calcSafetyScore(무주택, rules, result.loanLimit.amount);
    expect(safety.monthlyPayment).toBe(1_829_294);
    expect(safety.burdenRatio).toBeCloseTo(0.31359326060992254, 12);
    expect(safety.stressedBurdenRatio).toBeCloseTo(0.3698708173365612, 12);
    expect(safety.level).toBe("caution");
  });

  it("부대비용이 그대로다", () => {
    expect(calcAcquisitionCosts(result.affordablePrice, 무주택, rules)).toEqual({
      acquisitionTax: 6_050_000,
      brokerageFee: 2_200_000,
      brokerageVat: 220_000,
      legalFee: 600_000,
      movingCost: 1_500_000,
      housingBondCost: 800_800,
      total: 11_370_800,
    });
  });

  /**
   * 위 프로필은 은행 DSR이 한도를 만든다 — 정책대출 값이 바뀌어도
   * 답이 안 움직인다. 그래서 **정책대출이 한도를 만드는** 프로필을
   * 하나 더 붙인다(binding === "POLICY"). 두 개가 함께 있어야
   * "무주택 답이 그대로다"가 정책 경로까지 덮는다.
   *
   * 이 숫자도 `main`에서 같은 프로필로 직접 뽑은 값이다.
   */
  describe("정책대출이 한도를 만드는 무주택 구매자", () => {
    const 저소득무주택 = profile({
      cash: 50_000_000,
      annualIncome: 20_000_000,
      existingDebtAnnualPayment: 0,
    });
    const 저소득결과 = calcAffordablePrice(저소득무주택, rules);

    it("실구매력·안전선이 그대로다", () => {
      expect(저소득결과.affordablePrice).toBe(147_500_000);
      expect(저소득결과.availableCash).toBe(50_000_000);
      expect(calcSafePrice(저소득무주택, rules)).toBe(127_600_000);
    });

    it("정책대출이 한도를 만들고 그 금액이 그대로다", () => {
      expect(저소득결과.loanLimit.binding).toBe("POLICY");
      expect(저소득결과.loanLimit.amount).toBe(102_261_222);
      expect(저소득결과.loanLimit.breakdown).toEqual({
        LTV: 103_250_000,
        DSR: 95_065_630,
        CAP: 600_000_000,
        POLICY: 102_261_222,
      });
    });

    it("상환부담률과 부대비용이 그대로다", () => {
      const safety = calcSafetyScore(
        저소득무주택,
        rules,
        저소득결과.loanLimit.amount,
      );
      expect(safety.monthlyPayment).toBe(519_967);
      expect(safety.burdenRatio).toBeCloseTo(0.31198021356718597, 12);
      expect(safety.stressedBurdenRatio).toBeCloseTo(0.3890276207474976, 12);
      expect(safety.level).toBe("caution");

      expect(
        calcAcquisitionCosts(저소득결과.affordablePrice, 저소득무주택, rules),
      ).toEqual({
        acquisitionTax: 1_622_500,
        brokerageFee: 737_500,
        brokerageVat: 73_750,
        legalFee: 600_000,
        movingCost: 1_500_000,
        housingBondCost: 173_460,
        total: 4_707_210,
      });
    });
  });
});

/**
 * 정책대출 자격은 **주택 수**로 갈린다. 실제 룰셋으로 확인한다 —
 * 테스트 전용 픽스처로만 확인하면 룰셋의 값이 뒤집혀도 통과한다.
 *
 * 공사 공시 기준:
 * - 디딤돌 — 세대원 전원 무주택(0채만)
 * - 보금자리론 — 본건 담보주택 제외 무주택 또는 1주택(0~1채)
 */
describe("실제 룰셋에서의 주택 수별 정책대출 자격", () => {
  // 두 상품의 소득·가격·면적 요건을 모두 만족하는 구매자. 이 조건에서
  // 걸러지는 축이 주택 수 하나뿐이어야 아래 판정에 뜻이 있다.
  const 자격되는조건 = {
    annualIncome: 50_000_000,
    exclusiveAreaSqm: 84,
    existingDebtAnnualPayment: 0,
  };
  const price = 400_000_000;

  function matchedIds(ownedHomeCount: number): string[] {
    return matchPolicyLoans(
      profile({ ...자격되는조건, ownedHomeCount }),
      rules,
      price,
    )
      .map((loan) => loan.id)
      .sort();
  }

  it("0채는 디딤돌과 보금자리론 둘 다 자격이 된다", () => {
    expect(matchedIds(0)).toEqual(["디딤돌", "보금자리론"]);
  });

  it("1주택은 디딤돌 자격이 없고 보금자리론 자격은 있다", () => {
    expect(matchedIds(1)).toEqual(["보금자리론"]);
  });

  it("2주택 이상은 정책대출 자격이 둘 다 없다", () => {
    expect(matchedIds(2)).toEqual([]);
    expect(matchedIds(5)).toEqual([]);
  });

  it("정책 한도도 함께 사라진다 — 2주택의 POLICY는 0이다", () => {
    const p = profile({ ...자격되는조건, ownedHomeCount: 2 });
    expect(calcAffordablePrice(p, rules).loanLimit.breakdown.POLICY).toBe(0);
  });
});

/**
 * **주택 수가 늘면 실구매력은 내려가거나 같아야 한다. 절대 올라가면
 * 안 된다.**
 *
 * 이 제품이 낼 수 있는 최악의 오답이 "실제보다 더 빌릴 수 있다"이고,
 * 주택 수는 자격을 좁히기만 하는 축이다. 방향이 뒤집히는 순간
 * 다주택자에게 없는 정책대출을 있다고 말하게 된다.
 */
describe("주택 수가 늘어도 실구매력이 올라가지 않는다", () => {
  const incomes = [0, 30_000_000, 50_000_000, 70_000_000, 120_000_000];
  const cashes = [0, 50_000_000, 150_000_000, 400_000_000];
  const counts = [0, 1, 2, 3];

  /**
   * 세 층을 함께 본다.
   *
   * 실구매력만 보면 그물이 성기다 — 정책 한도가 올라가도 은행 경로나
   * 현금이 먼저 걸려 있으면 최종 가격은 안 움직일 수 있고, 그러면
   * "주택 수가 늘수록 정책대출을 더 준다"는 결함이 조용히 통과한다.
   * 자격 상품 수 · 정책 한도 · 최종 가격을 한 격자에서 함께 잠근다.
   */
  it("자격 상품 수·정책 한도·실구매력이 격자 전체에서 단조 비증가다", () => {
    let checked = 0;
    for (const annualIncome of incomes) {
      for (const cash of cashes) {
        for (const isFirstTimeBuyer of [false, true]) {
          const rows = counts.map((ownedHomeCount) => {
            const p = profile({
              annualIncome,
              cash,
              isFirstTimeBuyer,
              ownedHomeCount,
              existingDebtAnnualPayment: 0,
            });
            const result = calcAffordablePrice(p, rules);
            return {
              ownedHomeCount,
              eligible: matchPolicyLoans(p, rules, result.affordablePrice)
                .length,
              policy: result.loanLimit.breakdown.POLICY,
              price: result.affordablePrice,
            };
          });

          for (let i = 1; i < rows.length; i += 1) {
            const previous = rows[i - 1]!;
            const current = rows[i]!;
            const label =
              `소득 ${annualIncome} · 현금 ${cash} · 생애최초 ${isFirstTimeBuyer} — ` +
              `${previous.ownedHomeCount}채 → ${current.ownedHomeCount}채`;
            expect(
              current.eligible,
              `${label} 자격 상품 수 ${previous.eligible} → ${current.eligible}`,
            ).toBeLessThanOrEqual(previous.eligible);
            expect(
              current.policy,
              `${label} 정책 한도 ${previous.policy} → ${current.policy}`,
            ).toBeLessThanOrEqual(previous.policy);
            expect(
              current.price,
              `${label} 실구매력 ${previous.price} → ${current.price}`,
            ).toBeLessThanOrEqual(previous.price);
          }
          checked += 1;
        }
      }
    }
    // 격자가 비어 있으면 위 루프가 아무것도 확인하지 않고 통과한다.
    expect(checked).toBe(incomes.length * cashes.length * 2);
  });

  it("디딤돌이 한도를 만들던 구매자는 1주택이 되는 순간 실제로 내려간다", () => {
    // 등호만으로 통과하는 공허한 단조성이 아님을 보인다 — 적어도 한
    // 프로필에서는 값이 실제로 떨어져야 한다. 디딤돌(0채 전용)이 한도를
    // 만들던 저소득 구매자가 정확히 그 자리다.
    const 저소득 = {
      annualIncome: 20_000_000,
      cash: 50_000_000,
      existingDebtAnnualPayment: 0,
    };
    const 무주택 = calcAffordablePrice(
      profile({ ...저소득, ownedHomeCount: 0 }),
      rules,
    );
    const 일주택 = calcAffordablePrice(
      profile({ ...저소득, ownedHomeCount: 1 }),
      rules,
    );
    const 이주택 = calcAffordablePrice(
      profile({ ...저소득, ownedHomeCount: 2 }),
      rules,
    );

    // 0채에서는 디딤돌이 은행 경로를 이겨 한도를 만든다.
    expect(무주택.loanLimit.binding).toBe("POLICY");
    expect(일주택.affordablePrice).toBeLessThan(무주택.affordablePrice);

    // 1채에서는 보금자리론만 남고(0이 아니다), 2채에서는 선택지가 사라진다.
    expect(일주택.loanLimit.breakdown.POLICY).toBeGreaterThan(0);
    expect(이주택.loanLimit.breakdown.POLICY).toBe(0);
    expect(이주택.affordablePrice).toBeLessThanOrEqual(일주택.affordablePrice);
  });
});

/**
 * **취득세는 주택 수와 무관하게 같다 — 지금의 한계다.**
 *
 * 주택 수별 중과세율을 확인하지 못해 룰셋에 넣지 않았기 때문이다
 * (`acquisition-cost.ts`의 `calcAcquisitionTax` 주석 참고). 이 테스트는
 * 그 한계를 "고쳐졌다고 착각하지 않도록" 못박는 자리이자, 누군가
 * 확인되지 않은 중과율을 넣으면 바로 빨갛게 만드는 자리다.
 */
describe("취득세는 주택 수를 반영하지 않는다(지금의 한계)", () => {
  const price = 700_000_000;

  it("0채·1채·3채의 부대비용이 완전히 같다", () => {
    const costs = [0, 1, 3].map((ownedHomeCount) =>
      calcAcquisitionCosts(price, profile({ ownedHomeCount }), rules),
    );
    expect(costs[1]).toEqual(costs[0]);
    expect(costs[2]).toEqual(costs[0]);
  });

  it("룰셋에도 주택 수별 세율 분기가 없다", () => {
    // 확인되지 않은 규제 수치를 넣지 않았다는 사실 자체를 고정한다.
    expect(Object.keys(rules.acquisitionTax).sort()).toEqual(
      [
        "firstTimeBuyerReliefCap",
        "firstTimeBuyerReliefPriceCap",
        "highRate",
        "householdCountNote",
        "householdCountNoteNoHome",
        "localEducationTaxRatio",
        "lowRate",
        "lowerBound",
        "ruralTaxAreaThresholdSqm",
        "ruralTaxRate",
        "upperBound",
      ].sort(),
    );
  });
});

/**
 * 고지 문구는 **룰셋에서** 오고, 무주택과 유주택이 **갈린다**.
 *
 * 무주택자에게 "취득세가 더 나올 수 있어요"는 거짓이고, 거짓 경고는
 * 같은 자리의 진짜 경고까지 함께 닳게 만든다.
 */
describe("householdCountNoteFor", () => {
  it("0채면 무주택 문구를, 1채 이상이면 유주택 문구를 고른다", () => {
    expect(householdCountNoteFor(profile({ ownedHomeCount: 0 }), rules)).toBe(
      rules.acquisitionTax.householdCountNoteNoHome,
    );
    for (const ownedHomeCount of [1, 2, 7]) {
      expect(householdCountNoteFor(profile({ ownedHomeCount }), rules)).toBe(
        rules.acquisitionTax.householdCountNote,
      );
    }
  });

  it("두 문구는 서로 다르고, 코드가 아니라 룰셋에서 온다", () => {
    const owned = rules.acquisitionTax.householdCountNote;
    const noHome = rules.acquisitionTax.householdCountNoteNoHome;
    expect(owned).not.toBe(noHome);

    // 룰셋을 바꾸면 함수가 낸 값도 따라간다 — 문구가 코드에 박혀 있으면
    // 이 검사가 실패한다.
    const swapped = {
      ...rules,
      acquisitionTax: {
        ...rules.acquisitionTax,
        householdCountNote: "바뀐 유주택 문구예요.",
        householdCountNoteNoHome: "바뀐 무주택 문구예요.",
      },
    };
    expect(householdCountNoteFor(profile({ ownedHomeCount: 1 }), swapped)).toBe(
      "바뀐 유주택 문구예요.",
    );
    expect(householdCountNoteFor(profile({ ownedHomeCount: 0 }), swapped)).toBe(
      "바뀐 무주택 문구예요.",
    );
  });

  it("유주택 문구는 물어봤지만 반영하지 못했다는 사실과 커지는 방향을 함께 말한다", () => {
    const owned = rules.acquisitionTax.householdCountNote;
    expect(owned).toContain("주택 수");
    expect(owned).toMatch(/반영/);
    expect(owned).toMatch(/커질 수 있어요/);
  });

  it("무주택 문구는 비용이 커진다고 말하지 않는다", () => {
    const noHome = rules.acquisitionTax.householdCountNoteNoHome;
    expect(noHome).toContain("무주택");
    expect(noHome).not.toMatch(/커질|커지|더 나올|많아질|늘어날/);
    expect(noHome).not.toMatch(/작아질|줄어들|덜 나올/);
  });
});
