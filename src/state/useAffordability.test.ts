import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BuyerProfile } from "../lib/finance";
import { calcSafePrice, PRICE_STEP } from "../lib/finance";
import { rules, useAffordability } from "./useAffordability";

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
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

  it("실구매력을 넘는 가격은 상한으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    const max = result.current!.result.affordablePrice;

    act(() => result.current!.setPrice(max + 10 * PRICE_STEP));

    expect(result.current!.price).toBe(max);
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
