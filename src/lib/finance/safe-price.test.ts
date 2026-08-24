import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-08.json";
import { calcAffordablePrice, PRICE_STEP } from "./affordable-price";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { parseRules } from "./rules";
import { calcSafePrice } from "./safe-price";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    isRegulatedArea: true,
    ...overrides,
  };
}

/** 그 가격에서 안전 등급이 safe인가 */
function isSafeAt(p: BuyerProfile, price: number): boolean {
  // 오라클도 calcSafePrice와 같은 모델을 써야 한다 — 필요 대출이다.
  // 받을 수 있는 최대가 아니라 그 집을 사는 데 모자란 만큼을 빌린다.
  const costs = calcAcquisitionCosts(price, p, rules).total;
  const neededLoan = Math.max(0, price + costs - p.cash);
  return calcSafetyScore(p, rules, neededLoan).level === "safe";
}

/** 브루트포스로 안전 최대치를 구한다. 안전한 가격이 하나도 없으면 null */
function bruteForceSafePrice(p: BuyerProfile): number | null {
  const affordable = calcAffordablePrice(p, rules).affordablePrice;
  let brute: number | null = null;
  for (let price = 0; price <= affordable; price += PRICE_STEP) {
    if (isSafeAt(p, price)) brute = price;
  }
  return brute;
}

describe("calcSafePrice", () => {
  it("안전선 가격은 실제로 안전하다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    // 이 프로필(소득 60M·현금 200M·무부채)은 상환 부담이 안전 범위에
    // 드는 가격이 존재해야 한다 — null이면 이 단언 자체가 전제를 잃는다.
    expect(safe).not.toBeNull();
    if (safe !== null) {
      expect(isSafeAt(p, safe)).toBe(true);
    }
  });

  it("안전선 한 스텝 위는 안전하지 않다 — 진짜 최대다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    // 전제: 이 프로필에서는 안전한 가격이 존재한다. null이면 아래 비교
    // 자체가 (null을 0으로 강제 형변환해) 조용히 엉뚱한 값을 검증하게
    // 되므로, 비교 전에 전제를 직접 단언해 막는다.
    expect(safe).not.toBeNull();
    if (safe !== null && safe < affordable) {
      expect(isSafeAt(p, safe + PRICE_STEP)).toBe(false);
    }
  });

  it("안전선은 실구매력을 넘지 않는다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    if (safe !== null) {
      expect(safe).toBeLessThanOrEqual(
        calcAffordablePrice(p, rules).affordablePrice,
      );
    }
  });

  it("PRICE_STEP 단위로 떨어진다", () => {
    const safe = calcSafePrice(profile(), rules);
    expect(safe).not.toBeNull();
    if (safe !== null) {
      expect(safe % PRICE_STEP).toBe(0);
    }
  });

  it("소득이 오르면 안전선이 내려가지 않는다", () => {
    const low = calcSafePrice(profile({ annualIncome: 50_000_000 }), rules);
    const high = calcSafePrice(profile({ annualIncome: 150_000_000 }), rules);
    // null은 "안전한 가격 없음"이라 순서를 매길 수 없다 — 이 두 프로필은
    // 소득이 준수해 안전한 가격이 존재해야 한다.
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    if (low !== null && high !== null) {
      expect(high).toBeGreaterThanOrEqual(low);
    }
  });

  it("기존 부채가 늘면 안전선이 올라가지 않는다", () => {
    const none = calcSafePrice(profile({ existingDebtAnnualPayment: 0 }), rules);
    const some = calcSafePrice(
      profile({ existingDebtAnnualPayment: 20_000_000 }),
      rules,
    );
    expect(none).not.toBeNull();
    if (none !== null && some !== null) {
      expect(some).toBeLessThanOrEqual(none);
    }
    // some이 null이면(부채가 안전 여력을 다 먹어버렸다면) 그 자체가
    // "부채가 늘어 안전선이 내려갔다"는 방향과 일치하므로 통과로 본다.
  });

  it("실구매력이 0이면 안전한 가격이 없다(null) — 결정: 매수 자체가 성립하지 않으므로 0원을 안전선이라 부르지 않는다", () => {
    const p = profile({ cash: 0 });
    expect(calcAffordablePrice(p, rules).affordablePrice).toBe(0);
    expect(calcSafePrice(p, rules)).toBeNull();
  });

  it("브루트포스와 일치한다", () => {
    const p = profile();
    expect(calcSafePrice(p, rules)).toBe(bruteForceSafePrice(p));
  });

  it("브루트포스와 일치한다 — 비규제지역·생애최초 아님, 디딤돌/보금자리론 절벽(5억·6억) 부근", () => {
    const p = profile({
      isRegulatedArea: false,
      isFirstTimeBuyer: false,
      cash: 400_000_000,
      annualIncome: 90_000_000,
    });
    expect(calcSafePrice(p, rules)).toBe(bruteForceSafePrice(p));
  });

  it("브루트포스와 일치한다 — 절대캡 절벽(15억) 부근까지 넘는 고소득·고현금", () => {
    const p = profile({
      isRegulatedArea: false,
      isFirstTimeBuyer: false,
      cash: 1_400_000_000,
      annualIncome: 300_000_000,
    });
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    // 이 대조가 실제로 15억 절벽을 걸치는지 확인 — 그렇지 않으면 이
    // 테스트는 기존 프로필과 다를 바 없는 절벽을 검증하는 셈이다.
    expect(affordable).toBeGreaterThan(1_500_000_000);
    expect(calcSafePrice(p, rules)).toBe(bruteForceSafePrice(p));
  }, 20_000);

  it("브루트포스와 일치한다 — 절대캡 절벽(25억)까지 넘는 초고소득·초고현금", () => {
    const p = profile({
      isRegulatedArea: false,
      isFirstTimeBuyer: false,
      cash: 2_500_000_000,
      annualIncome: 500_000_000,
    });
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    expect(affordable).toBeGreaterThan(2_500_000_000);
    expect(calcSafePrice(p, rules)).toBe(bruteForceSafePrice(p));
  }, 30_000);

  it("실구매력은 0보다 크지만 안전한 가격이 하나도 없으면 null이다 — 소득 0", () => {
    // 소득이 0이면 monthlyIncome<=0이라 safety.ts의 ratio()가 모든
    // 가격에서(0원 대출이라도) 부담률을 +Infinity로 만들어 등급이
    // 항상 danger다. 현금은 2억으로 넉넉해 실구매력 자체는 0이 아니다.
    const p = profile({ annualIncome: 0, cash: 200_000_000 });
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    expect(affordable).toBeGreaterThan(0);
    expect(calcSafePrice(p, rules)).toBeNull();
  });

  it("실구매력은 0보다 크지만 기존 부채가 상환 여력을 다 채우면 null이다", () => {
    // 기존 부채만으로 이미 스트레스 DSR 위험 구간을 넘으면, 추가 대출이
    // 0이어도(가격 0이어도) 등급이 safe가 될 수 없다.
    const p = profile({
      annualIncome: 60_000_000,
      existingDebtAnnualPayment: 40_000_000,
      cash: 200_000_000,
    });
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    expect(affordable).toBeGreaterThan(0);
    expect(isSafeAt(p, 0)).toBe(false);
    expect(calcSafePrice(p, rules)).toBeNull();
  });

  it("숫자를 돌려주는 모든 경우 그 가격의 등급은 실제로 safe다", () => {
    const profiles = [
      profile(),
      profile({ annualIncome: 150_000_000 }),
      profile({ existingDebtAnnualPayment: 5_000_000 }),
      profile({ isRegulatedArea: false, isFirstTimeBuyer: false }),
      profile({ cash: 0 }),
      profile({ annualIncome: 0 }),
      profile({ annualIncome: 60_000_000, existingDebtAnnualPayment: 40_000_000 }),
    ];
    for (const p of profiles) {
      const safe = calcSafePrice(p, rules);
      if (safe !== null) {
        expect(isSafeAt(p, safe)).toBe(true);
      }
    }
  });

  it("현금이 많으면 안전선이 실구매력에 가깝다", () => {
    // 최대 대출 기준이던 시절 이 프로필의 안전선은 2.05억이었다.
    // 현금 50억을 들고 있는 사람에게 무리 없는 선이 2억이라는 답은
    // 안전한 방향이지만 쓸모가 없다.
    const p = profile({
      cash: 5_000_000_000,
      annualIncome: 20_000_000,
      isFirstTimeBuyer: false,
    });
    const safe = calcSafePrice(p, rules);
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    expect(safe).not.toBeNull();
    expect(safe as number).toBeGreaterThan(affordable * 0.9);
  });
});
