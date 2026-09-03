import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pyeongToSqm } from "../format/area";
import type { ComplexFilterState } from "../lib/complex-filters";
import { ComplexFilters } from "./ComplexFilters";

const BOUNDS: ComplexFilterState = {
  price: { min: 500_000_000, max: 2_000_000_000 },
  area: { min: 20, max: 120 },
  builtYearAge: { min: 0, max: 30 },
};

/** BOUNDS보다 좁은 값 — "전체"가 아니라 실제 범위 문구가 보이게 한다 */
const NARROWED: ComplexFilterState = {
  price: { min: 600_000_000, max: 1_500_000_000 },
  area: { min: 40, max: 100 },
  builtYearAge: { min: 5, max: 20 },
};

describe("ComplexFilters", () => {
  it("매매가·면적·입주년차 세 슬라이더를 낸다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
    expect(screen.getByText("매매가")).toBeInTheDocument();
    expect(screen.getByText("면적")).toBeInTheDocument();
    expect(screen.getByText("입주년차")).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(6); // 축 3개 × 손잡이 2개
  });

  it("건드리지 않았으면(값이 경계 그대로) 세 축 모두 '전체'다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
    expect(screen.getAllByText("전체")).toHaveLength(3);
  });

  it("가격은 원 표기로 낸다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={NARROWED} onChange={vi.fn()} />);
    expect(screen.getByText("6억원 ~ 15억원")).toBeInTheDocument();
  });

  /**
   * 사용자 지시(참고 사진): 면적은 ㎡가 아니라 **평**으로 보여준다.
   * 거르는 값은 여전히 ㎡다(`ComplexFilters.tsx`의 `toPyeongBounds`
   * 문서 참고) — 여기서는 화면에 찍히는 표기만 확인한다.
   */
  it("면적은 평 표기로 낸다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={NARROWED} onChange={vi.fn()} />);
    // 40㎡ ≈ 12.1평 → 12평, 100㎡ ≈ 30.25평 → 30평(반올림).
    expect(screen.getByText("12평 ~ 30평")).toBeInTheDocument();
  });

  it("입주년차는 년차 표기로 낸다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={NARROWED} onChange={vi.fn()} />);
    expect(screen.getByText("5년차 ~ 20년차")).toBeInTheDocument();
  });

  it("한 축(면적)을 움직이면 나머지 두 축(가격·입주년차)은 그대로 넘긴다", () => {
    const onChange = vi.fn();
    render(<ComplexFilters bounds={BOUNDS} value={NARROWED} onChange={onChange} />);
    const areaMin = screen.getByRole("slider", { name: "면적 최소" });
    fireEvent.keyDown(areaMin, { key: "Home" });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ComplexFilterState;
    // 손대지 않은 두 축은 값 그대로 넘어간다.
    expect(next.price).toEqual(NARROWED.price);
    expect(next.builtYearAge).toEqual(NARROWED.builtYearAge);
    // 면적만 바뀐다 — Home은 슬라이더 자신의 최소(평 경계, floor(20평환산)=6평)로
    // 민다. ㎡로 되돌린 값이라 정확한 정수는 아니다(넓히는 쪽으로만
    // 반올림했으므로 원래 경계 20㎡보다 작거나 같다).
    expect(next.area.min).toBeCloseTo(pyeongToSqm(6), 5);
    expect(next.area.min).toBeLessThanOrEqual(BOUNDS.area.min);
    expect(next.area.max).toBeCloseTo(NARROWED.area.max, 5);
  });

  it("가격 눈금은 '억' 단위 축약 표기다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
    // 5억~20억 범위, niceAxisStep은 5억 간격을 고른다 — 10억·15억이
    // 눈금으로 찍힌다.
    expect(screen.getByText("10억")).toBeInTheDocument();
    expect(screen.getByText("15억")).toBeInTheDocument();
  });
});
