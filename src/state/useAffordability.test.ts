import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BuyerProfile } from "../lib/finance";
import { PRICE_STEP } from "../lib/finance";
import { rules, useAffordability } from "./useAffordability";

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

describe("rules", () => {
  it("번들된 룰셋이 파싱되어 있다", () => {
    expect(rules.version).toBe("2026-03");
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
    expect(result.current!.loanAtPrice.binding).toBeDefined();
  });

  it("소득이 0이면 실구매력이 0이다", () => {
    const { result } = renderHook(() =>
      useAffordability(profile({ cash: 0, annualIncome: 0 })),
    );
    expect(result.current?.result.affordablePrice).toBe(0);
  });
});
