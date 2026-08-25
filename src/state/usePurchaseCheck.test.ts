import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InvestmentType } from "../lib/purchase";
import { usePurchaseCheck } from "./usePurchaseCheck";

/**
 * 갭투자·월세수익형 사이의 입력 격리(리뷰 수정 Minor 6)를 훅 수준에서
 * 직접 잠근다.
 *
 * 예전에는 이 회귀를 `purchase-type.test.tsx`가 App을 통째로 렌더링해
 * 라디오로 갭투자를 골라 확인했다. 지금은 갭투자를 그 라디오에서 뺐다
 * (전세자금대출 규제로 지금은 고를 수 없는 유형이다 —
 * `SELECTABLE_PURCHASE_TYPES` 참고) — 그래서 App 화면으로는 더 이상
 * 갭투자에 도달할 방법이 없다. 하지만 `usePurchaseCheck`는 `type`
 * prop만 받으면 그대로 갭투자를 계산하는 훅이라, 이 회귀를 지키는 데
 * App이나 라디오가 꼭 필요하지는 않다 — 훅을 직접 렌더링해 규제가
 * 풀려 라디오가 되돌아오는 날에도 이 격리가 그대로인지 계속 확인한다.
 */
describe("usePurchaseCheck — 유형 간 입력 격리", () => {
  it("갭투자 입력은 월세수익형으로 바꿔도 그 쪽 필드로 되살아나지 않는다", () => {
    const { result, rerender } = renderHook(
      ({ type }) => usePurchaseCheck(type),
      { initialProps: { type: "갭투자" as InvestmentType } },
    );

    act(() => result.current.setGapField("deposit", 400_000_000));
    expect(result.current.gapInput.deposit).toBe(400_000_000);

    rerender({ type: "월세수익형" });
    expect(result.current.rentalInput.deposit).toBeNull();
  });

  it("갭↔월세를 오가도 각 유형의 값은 자기 자리에 남는다", () => {
    const { result, rerender } = renderHook(
      ({ type }) => usePurchaseCheck(type),
      { initialProps: { type: "갭투자" as InvestmentType } },
    );

    act(() => result.current.setGapField("deposit", 400_000_000));
    rerender({ type: "월세수익형" });
    act(() => result.current.setRentalField("monthlyRent", 2_000_000));

    rerender({ type: "갭투자" });
    expect(result.current.gapInput.deposit).toBe(400_000_000);

    rerender({ type: "월세수익형" });
    expect(result.current.rentalInput.monthlyRent).toBe(2_000_000);
  });
});
