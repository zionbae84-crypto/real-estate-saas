import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PriceSlider, type PriceSliderProps } from "./PriceSlider";

function renderSlider(overrides: Partial<PriceSliderProps> = {}) {
  const props: PriceSliderProps = {
    price: overrides.price ?? 300_000_000,
    max: overrides.max ?? 640_000_000,
    // 넘기지 않으면 컴포넌트가 `max`로 기본값을 잡는다 — 눈금 상한이 곧
    // 한계였던 예전 그대로 움직인다. 아래 "초과 구간" describe만 둘을
    // 갈라 넘긴다.
    affordablePrice: overrides.affordablePrice,
    cashShortfall: overrides.cashShortfall,
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
      screen.getByText(/빌릴 수 있는 한계예요\. 무리 없는 선은 따로 있어요/),
    ).toBeInTheDocument();
  });

  it("최대치가 아니면 한계 안내를 띄우지 않는다", () => {
    renderSlider({ price: 300_000_000, max: 640_000_000 });
    expect(
      screen.queryByText(/빌릴 수 있는 한계예요/),
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

  describe("리뷰 수정: 최대 가격일 때 BudgetResult의 .affordable-price와 같은 색을 쓴다 (Important)", () => {
    // App.tsx가 BudgetResult 바로 아래 이 슬라이더를 렌더링하고, 슬라이더의
    // max가 BudgetResult가 방금 보여준 그 최대 가격(affordablePrice)이다.
    // 같은 숫자가 같은 화면에서 두 색으로 보이면 안 되므로, 값이 최대치와
    // 같을 때만 같은 브랜드 색 클래스를 준다. 최대치가 아니게 되면(사용자가
    // 임의로 탐색 중인 값) 그 데이터가 아니므로 기본색으로 돌아간다.
    it("가격이 최대치와 같으면 브랜드 색 클래스가 붙는다", () => {
      renderSlider({ price: 640_000_000, max: 640_000_000 });
      const priceEl = screen.getByText("6억 4,000만원", {
        selector: ".slider-price",
      });
      expect(priceEl).toHaveClass("slider-price--max");
    });

    it("가격이 최대치보다 낮으면 브랜드 색 클래스가 붙지 않는다", () => {
      renderSlider({ price: 300_000_000, max: 640_000_000 });
      const priceEl = screen.getByText("3억원", { selector: ".slider-price" });
      expect(priceEl).not.toHaveClass("slider-price--max");
    });
  });

  /**
   * 사용자 지시로 눈금 상한이 실구매 가능 가격 **위**까지 열렸다
   * (`useAffordability`의 `sliderMax`). 그 위 구간에서 화면이 해야 하는
   * 말은 하나다 — **지금 현금으로는 못 산다, 얼마가 모자라다.**
   *
   * 이 구간이 열리기 전에는 "한계예요"가 눈금 끝의 유일한 문장이었다.
   * 그 문장이 초과 구간까지 따라 올라가면, 살 수 없는 가격을 살 수 있는
   * 것처럼 말하게 된다 — 이 앱이 가장 경계하는 방향(낙관 쪽으로 틀리는
   * 것)이라 아래 두 테스트가 그 경계를 함께 잠근다.
   */
  describe("초과 구간 — 실구매 가능 가격 위로 올렸을 때", () => {
    it("모자란 현금을 금액으로 말한다", () => {
      renderSlider({
        price: 700_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
        cashShortfall: 45_000_000,
      });
      const warning = screen.getByText(/지금 현금으로는 이 가격을 살 수 없어요/);
      expect(warning).toBeInTheDocument();
      expect(warning.textContent).toContain("4,500만원");
      // 살 수 있는 최대가 얼마인지도 같은 문장이 함께 말한다.
      expect(warning.textContent).toContain("6억 4,000만원");
    });

    it("초과 구간에서는 '한계예요' 문장을 내지 않는다 — 살 수 없는 가격이다", () => {
      renderSlider({
        price: 700_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
        cashShortfall: 45_000_000,
      });
      expect(
        screen.queryByText(/빌릴 수 있는 한계예요/),
      ).not.toBeInTheDocument();
    });

    it("실구매 가능 가격에 정확히 있으면 한계 안내만 나온다", () => {
      renderSlider({
        price: 640_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
        cashShortfall: 0,
      });
      expect(
        screen.getByText(/빌릴 수 있는 한계예요/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/지금 현금으로는 이 가격을 살 수 없어요/),
      ).not.toBeInTheDocument();
    });

    /**
     * 금액을 말하는 경고라 금액이 0이면 낼 말이 없다. 두 조건은 정상
     * 상태에서 함께 참이지만, 하나만 보고 문장을 내면 "현금이 0원 더
     * 필요해요"라는 답의 모양을 한 거짓말이 나간다.
     */
    it("초과 구간이어도 모자란 금액이 0이면 경고를 내지 않는다", () => {
      renderSlider({
        price: 700_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
        cashShortfall: 0,
      });
      expect(
        screen.queryByText(/지금 현금으로는 이 가격을 살 수 없어요/),
      ).not.toBeInTheDocument();
    });

    /**
     * 눈금이 한계 위로 이어지면서 "어디까지가 살 수 있는 구간인지"가
     * 눈금만 봐서는 사라졌다 — 마커로 되돌린다.
     */
    it("살 수 있는 최대를 눈금에 마커로 표시한다", () => {
      renderSlider({
        price: 300_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
      });
      expect(screen.getByText("살 수 있는 최대")).toBeInTheDocument();
    });

    it("안전선과 값이 같으면 마커를 겹쳐 붙이지 않는다", () => {
      renderSlider({
        price: 300_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
        safePrice: 640_000_000,
      });
      expect(screen.getByText("무리 없는 선")).toBeInTheDocument();
      expect(screen.queryByText("살 수 있는 최대")).not.toBeInTheDocument();
    });

    /**
     * 색이 말하는 것은 "이 숫자가 실구매 가능 가격이다"이지 "슬라이더가
     * 끝까지 갔다"가 아니다 — 눈금 상한이 그 위로 열리면서 둘이 갈렸다.
     */
    it("눈금 끝(상한)에서는 브랜드 색을 쓰지 않는다 — 그 값은 못 사는 가격이다", () => {
      renderSlider({
        price: 832_000_000,
        max: 832_000_000,
        affordablePrice: 640_000_000,
        cashShortfall: 210_000_000,
      });
      expect(
        screen.getByText("8억 3,200만원", { selector: ".slider-price" }),
      ).not.toHaveClass("slider-price--max");
    });
  });

  describe("리뷰 수정(인쇄 결함 2): 한계 경고에서 조작 지시만 감싼다", () => {
    // "슬라이더를 내려 ~ 확인해 보세요"는 종이 위에서는 누를 수 없는
    // 조작 지시다. 이 span만 인쇄에서 지운다(styles.css의 .slider-action)
    // — "이건 빌릴 수 있는 한계예요. 무리 없는 선은 따로 있어요"는 이
    // 인쇄물에서 가장 중요한 문장 중 하나라 반드시 남아야 한다.
    it("한계 경고 안의 조작 지시만 .slider-action으로 감싼다", () => {
      renderSlider({ price: 640_000_000, max: 640_000_000 });
      const warning = screen.getByText(/이건 빌릴 수 있는 한계예요/);
      const action = warning.querySelector(".slider-action");

      expect(action).not.toBeNull();
      expect(action?.textContent).toBe(
        "슬라이더를 내려 부담이 어떻게 달라지는지 확인해 보세요.",
      );

      // 화면 문구는 인쇄 결함 수정 전과 똑같아야 한다.
      expect(warning.textContent).toBe(
        "이건 빌릴 수 있는 한계예요. 무리 없는 선은 따로 있어요. " +
          "슬라이더를 내려 부담이 어떻게 달라지는지 확인해 보세요.",
      );

      // action을 뺀 나머지(=인쇄에 남는 것)에는 핵심 경고 문장이 있어야
      // 한다.
      const printedText = Array.from(warning.childNodes)
        .filter((node) => node !== action)
        .map((node) => node.textContent ?? "")
        .join("");
      expect(printedText).toContain("이건 빌릴 수 있는 한계예요.");
      expect(printedText).toContain("무리 없는 선은 따로 있어요.");
      expect(printedText).not.toContain("슬라이더를 내려");
    });
  });
});
