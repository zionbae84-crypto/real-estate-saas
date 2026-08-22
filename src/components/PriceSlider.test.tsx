import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PriceSlider, type PriceSliderProps } from "./PriceSlider";

function renderSlider(overrides: Partial<PriceSliderProps> = {}) {
  const props: PriceSliderProps = {
    price: overrides.price ?? 300_000_000,
    max: overrides.max ?? 640_000_000,
    safePrice: overrides.safePrice,
    onChange: overrides.onChange ?? vi.fn(),
  };
  return render(<PriceSlider {...props} />);
}

describe("PriceSlider", () => {
  it("현재 가격을 사람이 읽는 형태로 보여준다", () => {
    // SEED Slider의 드래그 중 값 표시(value indicator)에도 같은 포맷을
    // 입혔으므로(getValueIndicatorLabel), 같은 문자열이 DOM에 두 벌
    // 있을 수 있다(하나는 이 컴포넌트의 .slider-price, 하나는 SEED
    // 내부 라벨 — 후자는 실제 브라우저에서는 CSS로 숨겨지지만 jsdom은
    // CSS를 계산하지 않는다). 그래서 .slider-price로 범위를 좁혀 조회한다.
    renderSlider({ price: 640_000_000, max: 640_000_000 });
    expect(
      screen.getByText("6억 4,000만원", { selector: ".slider-price" }),
    ).toBeInTheDocument();
  });

  it("SEED Slider의 범위가 엔진의 값과 맞는다", () => {
    renderSlider({ price: 100_000_000, max: 640_000_000 });
    const slider = screen.getByRole("slider");
    // SEED 썸은 <div role="slider">라 네이티브 min/max/step 속성이 아니라
    // aria-valuemin/aria-valuemax로 범위를 드러낸다. step은 DOM에 노출되지
    // 않으므로(아래 "한 스텝만큼 움직인다" 테스트가 실제 스텝 크기를 검증한다).
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "640000000");
    expect(slider).toHaveAttribute("aria-valuenow", "100000000");
  });

  it("최대 가격을 넘는 값을 만들지 않는다", () => {
    // SEED Slider는 값이 배열이다. 어댑터가 배열을 숫자로 옮기면서
    // 상한을 넘기지 않아야 한다.
    const onChange = vi.fn();
    renderSlider({ max: 500_000_000, onChange });
    expect(
      onChange.mock.calls.every(([price]) => price <= 500_000_000),
    ).toBe(true);
  });

  it("빈 배열이 와도 터지지 않는다", () => {
    // onValuesChange가 빈 배열을 줄 수 있다. 어댑터가 그것을 어떻게
    // 다루는지 정해 두지 않으면 undefined가 가격으로 흘러든다.
    expect(() => renderSlider({ max: 500_000_000 })).not.toThrow();
  });

  it("키보드로 끝까지 밀어도(End) 최대 가격을 넘지 않는다", () => {
    // 위 두 테스트는 실제 상호작용 없이 렌더링만 확인한다(브리프 원문).
    // 이 테스트는 실제로 SEED 내부 로직(useSlider의 updateValues 클램프 +
    // 이 컴포넌트의 어댑터 clamp)을 태워, 진짜로 max를 넘는 값이 onChange로
    // 새어나가지 않는지 확인한다.
    const onChange = vi.fn();
    renderSlider({ price: 300_000_000, max: 640_000_000, onChange });
    const slider = screen.getByRole("slider");

    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "PageUp" });

    expect(onChange).toHaveBeenCalled();
    expect(
      onChange.mock.calls.every(([price]) => price <= 640_000_000),
    ).toBe(true);
  });

  it("End 키로 밀면 최대 가격을 알린다", () => {
    const onChange = vi.fn();
    renderSlider({ price: 300_000_000, max: 640_000_000, onChange });
    fireEvent.keyDown(screen.getByRole("slider"), { key: "End" });
    expect(onChange).toHaveBeenCalledWith(640_000_000);
  });

  it("Home 키로 밀면 0원을 알린다", () => {
    const onChange = vi.fn();
    renderSlider({ price: 300_000_000, max: 640_000_000, onChange });
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("최대치일 때 그것이 한계임을 알린다", () => {
    renderSlider({ price: 640_000_000, max: 640_000_000 });
    expect(
      screen.getByText(/빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다/),
    ).toBeInTheDocument();
  });

  it("최대치가 아니면 한계 안내를 띄우지 않는다", () => {
    renderSlider({ price: 300_000_000, max: 640_000_000 });
    expect(
      screen.queryByText(/빌릴 수 있는 한계이지/),
    ).not.toBeInTheDocument();
  });

  it("aria-valuetext로 사람이 읽는 금액을 노출한다 — 스크린 리더가 원 단위 정수를 그대로 읽지 않도록", () => {
    renderSlider({ price: 624_600_000, max: 640_000_000 });
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "6억 2,460만원",
    );
  });

  it("무엇을 조절하는 슬라이더인지 접근성 라벨을 준다", () => {
    renderSlider({ price: 300_000_000, max: 640_000_000 });
    expect(
      screen.getByRole("slider", { name: "이 가격에 산다면" }),
    ).toBeInTheDocument();
  });

  it("안전선이 있으면 눈금에 마커로 표시한다", () => {
    renderSlider({ price: 300_000_000, max: 640_000_000, safePrice: 480_000_000 });
    expect(screen.getByText("무리 없는 선")).toBeInTheDocument();
  });

  it("안전선이 없으면(null) 마커를 표시하지 않는다", () => {
    renderSlider({ price: 300_000_000, max: 640_000_000, safePrice: null });
    expect(screen.queryByText("무리 없는 선")).not.toBeInTheDocument();
  });
});
