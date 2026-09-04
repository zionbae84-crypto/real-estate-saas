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

/**
 * BOUNDS보다 좁은 값 — "전체"가 아니라 실제 범위 문구가 보이게 한다.
 * area.max(70㎡ ≈ 21평)는 일부러 30평 상한(`AREA_CAP_PYEONG`) 아래로
 * 잡는다 — 그래야 이 값이 "정확한 특정 값"을 보여주는 테스트에서
 * "30평 초과"(상한 이상)로 뭉개지지 않는다(그 동작은 별도
 * `describe("상한(초과 구간)")`에서 따로 확인한다).
 */
const NARROWED: ComplexFilterState = {
  price: { min: 600_000_000, max: 1_500_000_000 },
  area: { min: 40, max: 70 },
  builtYearAge: { min: 5, max: 20 },
};

describe("ComplexFilters", () => {
  it("매매가·면적·입주년차 세 슬라이더를 낸다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
    expect(screen.getByText("매매가")).toBeInTheDocument();
    // "(전용)": 사용자 지시 — 이 앱의 면적은 전용면적이라 평 표기만으로는
    // 공급면적과 헷갈릴 수 있어 기준을 라벨에 바로 적는다.
    expect(screen.getByText("면적 (전용)")).toBeInTheDocument();
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
    // 40㎡ ≈ 12.1평 → 12평, 70㎡ ≈ 21.17평 → 21평(반올림).
    expect(screen.getByText("12평 ~ 21평")).toBeInTheDocument();
  });

  it("입주년차는 년차 표기로 낸다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={NARROWED} onChange={vi.fn()} />);
    expect(screen.getByText("5년차 ~ 20년차")).toBeInTheDocument();
  });

  it("한 축(면적)을 움직이면 나머지 두 축(가격·입주년차)은 그대로 넘긴다", () => {
    const onChange = vi.fn();
    render(<ComplexFilters bounds={BOUNDS} value={NARROWED} onChange={onChange} />);
    const areaMin = screen.getByRole("slider", { name: "면적 (전용) 최소" });
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

  it("가격 눈금은 10억 단위로만 찍힌다 — 사용자 지시대로 5억처럼 잘게 끊기지 않는다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
    // BOUNDS 가격은 5억~20억. tickUnit=10억이라 5억·15억 같은 중간값은
    // 나오지 않는다 — 20억은 max 자체라 "최대"가 그 자리를 대신한다.
    expect(screen.getByText("10억")).toBeInTheDocument();
    expect(screen.queryByText("5억")).not.toBeInTheDocument();
    expect(screen.queryByText("15억")).not.toBeInTheDocument();
  });

  it("면적 눈금은 10평 단위로만 찍힌다", () => {
    render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
    // BOUNDS 면적은 20~120㎡ ≈ 6~37평(바깥쪽 반올림)인데, 30평 상한이
    // 걸려 슬라이더 자체는 6~30평까지만 간다(아래 상한 테스트 참고).
    // tickUnit=10평이라 10의 배수만 눈금으로 찍힌다.
    expect(screen.getByText("10평")).toBeInTheDocument();
    expect(screen.getByText("20평")).toBeInTheDocument();
    expect(screen.queryByText("5평")).not.toBeInTheDocument();
    expect(screen.queryByText("15평")).not.toBeInTheDocument();
  });

  /**
   * 매매가는 40억, 면적(전용)은 30평을 넘으면 슬라이더 오른쪽 끝을
   * 그 상한에 고정한다(그 지역 실제 최댓값이 상한을 넘을 때만 —
   * BOUNDS는 가격 20억·면적 ≈37평이라 면적만 넘는다). 오른쪽 끝의
   * 글자는 두 축이 다르다 — 매매가는 다른 축과 같은 기본값 "최대"
   * (사용자 지시로 "40억 초과" 문구는 걷어냈다), 면적은 상한값을 함께
   * 담은 "30평 최대"(사용자 지시: "10평/20평/30평 최대"). 값은 같은
   * 방식으로 잘리지만 화면에 남기는 말이 다르다.
   */
  describe("상한", () => {
    it("면적 실제 최댓값이 상한(30평)을 넘으면 슬라이더 오른쪽 끝이 30평에서 멎고, 글자는 '30평 최대'다", () => {
      render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
      const areaMax = screen.getByRole("slider", { name: "면적 (전용) 최대" });
      expect(areaMax).toHaveAttribute("aria-valuemax", "30");
      // 손대지 않은 상태(=전체)라 손잡이가 이미 상한에 붙어 있고, 축
      // 눈금과 드래그 말풍선(SEED valueIndicator) 둘 다 같은 문구를
      // 낸다 — 그래서 getAllBy로 "적어도 하나"만 확인한다.
      expect(screen.getAllByText("30평 최대").length).toBeGreaterThan(0);
    });

    it("가격 실제 최댓값이 상한(40억)을 넘으면 슬라이더 오른쪽 끝이 40억에서 멎는다", () => {
      const highBounds: ComplexFilterState = {
        ...BOUNDS,
        price: { min: 500_000_000, max: 21_800_000_000 }, // 5억~218억(강남구 실측 최고가)
      };
      render(<ComplexFilters bounds={highBounds} value={highBounds} onChange={vi.fn()} />);
      const priceMax = screen.getByRole("slider", { name: "매매가 최대" });
      expect(priceMax).toHaveAttribute("aria-valuemax", "4000000000");
      // 40억을 넘는 중간값(50억·100억 등)은 더 이상 찍히지 않는다 —
      // 상한 안쪽은 10억 단위(10·20·30억)로만 찍힌다.
      expect(screen.getByText("10억")).toBeInTheDocument();
      expect(screen.getByText("20억")).toBeInTheDocument();
      expect(screen.getByText("30억")).toBeInTheDocument();
      expect(screen.queryByText("50억")).not.toBeInTheDocument();
    });

    it("상한을 안 넘으면(BOUNDS 가격) 슬라이더 오른쪽 끝이 실제 최댓값 그대로다", () => {
      render(<ComplexFilters bounds={BOUNDS} value={BOUNDS} onChange={vi.fn()} />);
      const priceMax = screen.getByRole("slider", { name: "매매가 최대" });
      expect(priceMax).toHaveAttribute("aria-valuemax", String(BOUNDS.price.max));
    });

    it("손잡이를 상한 끝까지 밀면 나가는 값은 상한이 아니라 실제 최댓값이다 — '그 이상은 전부 포함'이라는 뜻이 실제로 지켜진다", () => {
      const onChange = vi.fn();
      const highBounds: ComplexFilterState = {
        ...BOUNDS,
        price: { min: 500_000_000, max: 21_800_000_000 },
      };
      // 아직 상한(40억)에 안 붙어 있는 값(20억)에서 시작해야 End가 실제로
      // 손잡이를 움직여 onChange를 낸다.
      const startValue: ComplexFilterState = { ...highBounds, price: { min: 500_000_000, max: 2_000_000_000 } };
      render(<ComplexFilters bounds={highBounds} value={startValue} onChange={onChange} />);
      const priceMax = screen.getByRole("slider", { name: "매매가 최대" });
      // End는 손잡이를 슬라이더 자신의 max(=상한, 40억)로 민다.
      fireEvent.keyDown(priceMax, { key: "End" });
      expect(onChange).toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0]![0] as ComplexFilterState;
      // 상한(40억)이 아니라 그 지역 실제 최댓값(218억)이 나가야 그
      // 이상 매물이 조용히 걸러지지 않는다.
      expect(next.price.max).toBe(21_800_000_000);
    });

    it("면적도 손잡이를 상한 끝까지 밀면 실제 최댓값이 나간다", () => {
      const onChange = vi.fn();
      // 아직 상한(30평)에 안 붙어 있는 값(20평)에서 시작한다.
      const startValue: ComplexFilterState = { ...BOUNDS, area: { min: BOUNDS.area.min, max: pyeongToSqm(20) } };
      render(<ComplexFilters bounds={BOUNDS} value={startValue} onChange={onChange} />);
      const areaMax = screen.getByRole("slider", { name: "면적 (전용) 최대" });
      fireEvent.keyDown(areaMax, { key: "End" });
      expect(onChange).toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0]![0] as ComplexFilterState;
      expect(next.area.max).toBe(BOUNDS.area.max);
    });
  });
});
