import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

/** 화면에 그려진 부담률(%)을 숫자로 읽는다. */
function readRatio(): number {
  const text =
    document.querySelector('[data-field="ratio"]')?.textContent ?? "";
  return Number(text.replace("%", ""));
}

/**
 * formatWon이 그리는 "6억 4,000만원"·"65만 434원" 같은 한국식 표기를
 * 원 단위 숫자로 되돌린다.
 *
 * 단순히 숫자만 남기고 이어 붙이면("만"·"억" 단위 앞뒤 숫자를 그냥
 * 문자열로 합치면) 두 가지 방식으로 자릿수가 틀어진다.
 *
 * 1. "6억 4,000만원"에서 "6"과 "4000"을 이어 붙이면 "64000"이 되어
 *    6억4000만이 아니라 6만4000처럼 읽힌다.
 * 2. "65만 434원"에서 "65"와 "434"를 그냥 이어 붙이면 "65434"가 되는데,
 *    실제 값은 65×10,000+434=650,434다 — "만" 아래 나머지가 1,000원
 *    미만이라 자리수가 짧게 찍힐 때(예: 434원, 4자리를 못 채움) 앞자리가
 *    씹힌다. 이 버그는 실제로 한 번 재현됐다: 월 상환액이 마침 이 모양이
 *    되는 조건(전용면적 기본값을 84→86으로 고치며 affordablePrice가
 *    바뀐 결과)에서 "슬라이더를 내리면 월 상환액이 줄어든다" 테스트가
 *    650,434를 65,434로 잘못 읽어 실패했다 — 계산이 아니라 이 파서가
 *    틀렸었다.
 *
 * 그래서 억·만·원 단위별로 정규식을 따로 매치해 자릿값을 곱해 더한다.
 */
function parseFormattedWon(text: string): number {
  if (text.trim() === "" || text.trim() === "0원") return 0;

  let total = 0;
  const eok = text.match(/([\d,]+)억/)?.[1];
  if (eok !== undefined) total += Number(eok.replace(/,/g, "")) * 100_000_000;
  const man = text.match(/([\d,]+)만/)?.[1];
  if (man !== undefined) total += Number(man.replace(/,/g, "")) * 10_000;
  // "원" 바로 앞에 숫자가 있고, 그 앞이 "만"이 아닌 경우만 나머지(1만원
  // 미만) 단위다. "…만원"처럼 "만"에 "원"이 곧바로 붙은 경우는 제외한다.
  const rest = text.match(/(?:^|\s)([\d,]+)원$/)?.[1];
  if (rest !== undefined) total += Number(rest.replace(/,/g, ""));

  return total;
}

/** 화면에 그려진 월 상환액을 원 단위 숫자로 읽는다. */
function readPayment(): number {
  const text =
    document.querySelector('[data-field="payment"]')?.textContent ?? "";
  return parseFormattedWon(text);
}

/** 화면에 그려진 실구매 가능 가격(.affordable-price)을 원 단위 숫자로 읽는다. */
function readAffordablePrice(): number {
  const text = document.querySelector(".affordable-price")?.textContent ?? "";
  return parseFormattedWon(text);
}

describe("예산 계산기 통합", () => {
  beforeEach(() => window.localStorage.clear());

  it("필수값을 채우기 전에는 결과를 그리지 않는다", () => {
    render(<App />);
    expect(screen.queryByText("실구매 가능 가격")).not.toBeInTheDocument();
    expect(screen.getByText(/현금과 연소득을 입력하면/)).toBeInTheDocument();
  });

  it("현금과 소득을 넣으면 결과와 슬라이더가 나타난다", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    expect(screen.getByText("실구매 가능 가격")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
    // BudgetResult의 2단("무엇이 막았는지 한 줄")은 이제 <h2>가 아니라
    // 평범한 문단이다 — 제목 계층은 "실구매 가능 가격"(1단) 하나로
    // 좁혔다. BindingExplainer 자신의 <h3>는 접힌 4단 안에서
    // showTitle={false}로 꺼져 있으므로, 이 문구는 화면에 정확히 한
    // 번만 나타난다.
    expect(screen.getByText(/걸렸습니다|최대치입니다/)).toBeInTheDocument();
  });

  it("슬라이더를 내리면 월 상환액과 부담률이 줄어든다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    const slider = screen.getByRole("slider");
    // SEED 썸은 <div role="slider">라 네이티브 max 속성이 없다 —
    // aria-valuemax로 범위를 읽는다.
    const max = Number(slider.getAttribute("aria-valuemax"));
    expect(max).toBeGreaterThan(0);

    const ratioAtMax = readRatio();
    const paymentAtMax = readPayment();

    // SEED Slider는 값이 배열인 커스텀 위젯이라 네이티브 <input type=range>처럼
    // fireEvent.change로 값을 바꿀 수 없다 — 키보드 상호작용(Home = 최솟값으로)이
    // 실제 사용자가 슬라이더를 내리는 것과 같은 경로(useSlider의 onKeyDown)를 태운다.
    fireEvent.keyDown(slider, { key: "Home" });

    expect(readRatio()).toBeLessThan(ratioAtMax);
    expect(readPayment()).toBeLessThan(paymentAtMax);
  });

  it("최대치에서는 그것이 한계라는 경고가 뜬다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    expect(
      screen.getByText(/빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다/),
    ).toBeInTheDocument();
  });

  it("입력이 localStorage에 남아 새로고침 후 복원된다", async () => {
    const { unmount } = render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
  });

  /**
   * 폼에서 엔진을 거쳐 화면 숫자까지 이어지는 유일한 종단 검증.
   *
   * Task 3에서 규제지역 체크박스가 ProfileForm 첫 화면에서 빠지고
   * AssumptionLine 뒤의 openField로만 도달하게 되면서 지워졌던 테스트다
   * (그때는 AssumptionLine이 App에 배선되지 않아 열 방법이 없었다). 이제
   * AssumptionLine이 배선됐으니 그 버튼을 눌러 규제지역 필드를 열고,
   * 체크를 끄면(비규제지역 = 수도권) LTV 한도가 40% → 70%로 올라 실구매력이
   * 오른다는 사실을 화면 숫자로 직접 확인한다.
   */
  it("규제지역 체크를 끄면 실구매력이 올라간다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    const priceBefore = readAffordablePrice();
    expect(priceBefore).toBeGreaterThan(0);

    // 기본값(가정)은 규제지역(true)이므로 AssumptionLine 문구는
    // "규제지역으로 계산했어요"다(AssumptionLine.tsx의 buildAssumptionItems 참고).
    await userEvent.click(screen.getByText(/규제지역으로 계산했어요/));

    const checkbox = screen.getByRole("checkbox", { name: /규제지역/ });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    expect(readAffordablePrice()).toBeGreaterThan(priceBefore);
  });
});
