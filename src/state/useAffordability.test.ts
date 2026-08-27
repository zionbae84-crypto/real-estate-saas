import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BuyerProfile } from "../lib/finance";
import { calcSafePrice, ownFundsRequired, PRICE_STEP } from "../lib/finance";
import { rules, useAffordability } from "./useAffordability";

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    // 이 파일의 테스트는 정확한 LTV 퍼센트가 아니라 훅의 동작(가격 조임,
    // override 유지 등)을 검증하므로 규제 여부는 결과에 영향을 주지
    // 않는다. 앱의 기본값(true, 과대평가를 피하는 쪽)과 맞춰 둔다.
    isRegulatedArea: true,
    ...overrides,
  };
}

describe("rules", () => {
  it("번들된 룰셋이 파싱되어 있다", () => {
    expect(rules.version).toBe("2026-08");
  });
});

describe("useAffordability", () => {
  it("프로필이 없으면 null이다", () => {
    const { result } = renderHook(() => useAffordability(null));
    expect(result.current).toBeNull();
  });

  it("초기 가격은 실구매력과 같다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    expect(result.current?.price).toBe(result.current?.result.affordablePrice);
  });

  it("가격을 내리면 월 상환액과 부담률이 줄어든다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    const atMax = result.current!.safety;

    act(() => result.current!.setPrice(100_000_000));

    expect(result.current!.price).toBe(100_000_000);
    expect(result.current!.safety.monthlyPayment).toBeLessThan(
      atMax.monthlyPayment,
    );
    expect(result.current!.safety.burdenRatio).toBeLessThan(atMax.burdenRatio);
  });

  /**
   * ⚠ **조이는 상한이 실구매력이 아니라 `sliderMax`다**(사용자 지시로
   * 눈금이 그 위까지 열렸다). 실구매력을 조금 넘긴 값은 이제 그대로
   * 유지된다 — 못 사는 가격을 짚어 볼 수 있어야 "현금이 얼마 모자란지"를
   * 말할 수 있기 때문이다.
   */
  it("실구매력을 넘겨도 눈금 상한까지는 그대로 둔다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    const affordable = result.current!.result.affordablePrice;
    const over = affordable + 10 * PRICE_STEP;
    // 전제: 그 값이 아직 눈금 상한 안이다(안 그러면 이 테스트가
    // 검증하려는 구간을 지나쳐 버린다).
    expect(over).toBeLessThanOrEqual(result.current!.sliderMax);

    act(() => result.current!.setPrice(over));

    expect(result.current!.price).toBe(over);
  });

  it("눈금 상한을 넘는 가격은 그 상한으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    const sliderMax = result.current!.sliderMax;

    act(() => result.current!.setPrice(sliderMax + 10 * PRICE_STEP));

    expect(result.current!.price).toBe(sliderMax);
  });

  it("음수 가격은 0으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    act(() => result.current!.setPrice(-1));
    expect(result.current!.price).toBe(0);
  });

  it("loanAtPrice는 그 가격에서의 대출 한도다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    act(() => result.current!.setPrice(300_000_000));
    expect(result.current!.loanAtPrice.amount).toBeLessThanOrEqual(
      300_000_000,
    );
    expect(["LTV", "DSR", "CAP", "POLICY"]).toContain(
      result.current!.loanAtPrice.binding,
    );
  });

  it("소득이 0이면 실구매력이 0이다", () => {
    const { result } = renderHook(() =>
      useAffordability(profile({ cash: 0, annualIncome: 0 })),
    );
    expect(result.current?.result.affordablePrice).toBe(0);
  });

  it("override가 null이면 프로필 변경 시 가격이 새로운 실구매력을 따라간다", () => {
    const profileA = profile({ cash: 200_000_000, annualIncome: 100_000_000 });
    const profileB = profile({ cash: 100_000_000, annualIncome: 150_000_000 });

    const { result, rerender } = renderHook(
      (p) => useAffordability(p),
      { initialProps: profileA },
    );

    const priceA = result.current!.price;
    const affordableA = result.current!.result.affordablePrice;

    expect(priceA).toBe(affordableA);

    rerender(profileB);

    const priceB = result.current!.price;
    const affordableB = result.current!.result.affordablePrice;

    expect(priceB).toBe(affordableB);
    expect(affordableA).not.toBe(affordableB);
  });

  it("override가 설정되면 프로필 변경 후에도 유지된다", () => {
    const profileA = profile({ cash: 200_000_000 });
    const profileB = profile({ cash: 100_000_000, annualIncome: 150_000_000 });

    const { result, rerender } = renderHook(
      (p) => useAffordability(p),
      { initialProps: profileA },
    );

    const overridePrice = 150_000_000;
    act(() => result.current!.setPrice(overridePrice));

    expect(result.current!.price).toBe(overridePrice);

    rerender(profileB);

    expect(result.current!.price).toBe(overridePrice);
  });

  it("NaN을 setPrice하면 0으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    act(() => result.current!.setPrice(NaN));
    expect(result.current!.price).toBe(0);
  });

  it("Infinity를 setPrice하면 0으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    act(() => result.current!.setPrice(Infinity));
    expect(result.current!.price).toBe(0);
  });

  /**
   * 사용자 지시로 슬라이더가 실구매 가능 가격 **위**까지 올라간다.
   * 그 구간이 존재하는 이유는 하나다 — 거기서 **현금이 얼마 모자란지**를
   * 말하기 위해서다. 아래 테스트들이 그 두 값(상한과 부족액)을 잠근다.
   */
  describe("sliderMax·cashShortfall — 못 사는 가격을 짚어 본다", () => {
    it("눈금 상한은 실구매 가능 가격보다 위다", () => {
      const { result } = renderHook(() => useAffordability(profile()));
      expect(result.current!.sliderMax).toBeGreaterThan(
        result.current!.result.affordablePrice,
      );
    });

    it("눈금 상한은 PRICE_STEP의 배수다 — End 키가 어중간한 값에 안 떨어진다", () => {
      const { result } = renderHook(() => useAffordability(profile()));
      expect(result.current!.sliderMax % PRICE_STEP).toBe(0);
    });

    it("실구매 가능 가격 이하에서는 모자란 현금이 0이다", () => {
      const { result } = renderHook(() => useAffordability(profile()));
      // 기본 위치(=실구매 가능 가격)에서 이미 0이어야 한다.
      expect(result.current!.cashShortfall).toBe(0);

      act(() => result.current!.setPrice(100_000_000));
      expect(result.current!.cashShortfall).toBe(0);
    });

    it("그 위로 올리면 모자란 현금이 생기고, 올릴수록 늘어난다", () => {
      const { result } = renderHook(() => useAffordability(profile()));
      const affordable = result.current!.result.affordablePrice;
      const sliderMax = result.current!.sliderMax;
      const mid = Math.floor((affordable + sliderMax) / 2 / PRICE_STEP) * PRICE_STEP;

      act(() => result.current!.setPrice(mid));
      const atMid = result.current!.cashShortfall;
      expect(atMid).toBeGreaterThan(0);

      act(() => result.current!.setPrice(sliderMax));
      expect(result.current!.cashShortfall).toBeGreaterThan(atMid);
    });

    /**
     * 화면이 자기 식으로 다시 유도하지 않는다 — 부족액은 엔진의
     * `ownFundsRequired`(그 가격에서 현금으로 내야 하는 총액)에서
     * 가용현금을 뺀 값이다. 두 계산이 갈리면 "얼마가 모자라다"와
     * "얼마까지 살 수 있다"가 서로 다른 근거 위에 서게 된다.
     */
    it("부족액은 엔진의 ownFundsRequired에서 그대로 나온다", () => {
      const p = profile();
      const { result } = renderHook(() => useAffordability(p));
      const sliderMax = result.current!.sliderMax;

      act(() => result.current!.setPrice(sliderMax));

      expect(result.current!.cashShortfall).toBe(
        ownFundsRequired(sliderMax, p, rules) -
          result.current!.result.availableCash,
      );
    });
  });

  describe("safePrice", () => {
    it("calcSafePrice가 같은 프로필·룰셋에서 내는 값과 같다", () => {
      const p = profile();
      const { result } = renderHook(() => useAffordability(p));
      expect(result.current!.safePrice).toBe(calcSafePrice(p, rules));
    });

    it("소득이 0이면(안전한 가격이 없으면) null이다", () => {
      const { result } = renderHook(() =>
        useAffordability(profile({ cash: 0, annualIncome: 0 })),
      );
      expect(result.current?.safePrice).toBeNull();
    });

    it("슬라이더로 가격을 움직여도 바뀌지 않는다 — 프로필에서만 정해진다", () => {
      const { result } = renderHook(() => useAffordability(profile()));
      const before = result.current!.safePrice;

      act(() => result.current!.setPrice(100_000_000));

      expect(result.current!.safePrice).toBe(before);
    });
  });
});
