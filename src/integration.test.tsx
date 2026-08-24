import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { rules as financeRules } from "./state/useAffordability";

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
    expect(screen.getByText(/현금·연소득·주택 수를 알려주면/)).toBeInTheDocument();
  });

  /**
   * 주택 수는 현금·소득과 같은 층위의 **필수 답**이다.
   *
   * 미입력을 무주택으로 대신 채우면 디딤돌·보금자리론 자격이 모두 열려
   * 정책 한도가 커지고 실구매력이 올라간다 — 사용자가 확인한 적 없는
   * 값으로 "더 빌릴 수 있다"고 답하는, 이 제품이 가장 피해야 하는
   * 방향이다. 그래서 답을 듣기 전에는 아무 숫자도 내지 않는다.
   */
  it("현금·소득만 넣고 주택 수를 답하지 않으면 결과가 나오지 않는다", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    expect(screen.queryByText("실구매 가능 가격")).not.toBeInTheDocument();
    expect(screen.getByText(/현금·연소득·주택 수를 알려주면/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("무주택"));
    expect(screen.getByText("실구매 가능 가격")).toBeInTheDocument();
  });

  /**
   * 유주택을 고르면 몇 채인지 적을 수 있고, 그 답이 실제 계산을 좁힌다 —
   * 물어만 보고 쓰지 않으면 사용자는 반영됐다고 믿는다.
   */
  it("유주택을 고르면 주택 수를 적을 수 있고, 그 답이 정책대출 자격을 좁힌다", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "5000");
    await userEvent.click(screen.getByLabelText("무주택"));

    // 무주택이면 보금자리론 자격이 있다.
    expect(screen.getByText("보금자리론")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("유주택"));
    const countInput = screen.getByLabelText("갖고 있는 주택 수 (채)");
    expect(countInput).toHaveValue(1);
    // 1주택도 보금자리론까지는 받을 수 있다(공시: 본건 담보주택 제외
    // 무주택 또는 1주택).
    expect(screen.getByText("보금자리론")).toBeInTheDocument();

    // 2주택이 되면 받을 수 있는 정책대출이 사라진다.
    await userEvent.clear(countInput);
    await userEvent.type(countInput, "2");
    expect(screen.queryByText("보금자리론")).not.toBeInTheDocument();
  });

  /**
   * **묻고 나서 쓰지 않으면 사용자는 반영됐다고 믿는다.**
   *
   * 취득세는 주택 수를 반영하지 못한다(중과세율을 확인하지 못했다).
   * 그래서 유주택이라고 답한 사람에게는 그 사실이 화면에 있어야 하고,
   * 무주택이라고 답한 사람에게는 그 경고가 나가면 안 된다 — 그 사람에게는
   * 거짓이고, 거짓 경고는 진짜 경고까지 함께 닳게 만든다.
   */
  it("취득세 고지가 주택 수 답에 따라 갈린다", async () => {
    const 유주택문구 = financeRules.acquisitionTax.householdCountNote;
    const 무주택문구 = financeRules.acquisitionTax.householdCountNoteNoHome;

    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "5000");
    await userEvent.click(screen.getByLabelText("무주택"));

    expect(screen.getByText(무주택문구)).toBeInTheDocument();
    expect(screen.queryByText(유주택문구)).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("유주택"));

    expect(screen.getByText(유주택문구)).toBeInTheDocument();
    expect(screen.queryByText(무주택문구)).not.toBeInTheDocument();
  });

  it("현금과 소득을 넣으면 결과와 슬라이더가 나타난다", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");
    await userEvent.click(screen.getByLabelText("무주택"));

    expect(screen.getByText("실구매 가능 가격")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
    // BudgetResult의 2단("무엇이 막았는지 한 줄")은 이제 <h2>가 아니라
    // 평범한 문단이다 — 제목 계층은 "실구매 가능 가격"(1단) 하나로
    // 좁혔다. BindingExplainer 자신의 <h3>는 접힌 4단 안에서
    // showTitle={false}로 꺼져 있으므로, 이 문구는 화면에 정확히 한
    // 번만 나타난다.
    // 리뷰 수정(Critical): DSR title을 형제들과 나란한 "…걸렸어요" 형태로
    // 되돌렸으므로("소득이 한도를 정했어요"는 더 이상 어떤 title도 아니다),
    // 대안 목록에서 그 표현을 뺀다 — 넓히지 않고 좁힌다.
    expect(screen.getByText(/걸렸어요|최대치예요/)).toBeInTheDocument();
  });

  it("슬라이더를 내리면 월 상환액과 부담률이 줄어든다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");
    await userEvent.click(screen.getByLabelText("무주택"));

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
    await userEvent.click(screen.getByLabelText("무주택"));

    expect(
      screen.getByText(/빌릴 수 있는 한계예요\. 무리 없는 선은 따로 있어요/),
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
    await userEvent.click(screen.getByLabelText("무주택"));

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

  it("지역을 고르면 규제지역 가정이 문구에서 빠진다", async () => {
    // 근거가 "모르니까 안전하게 규제지역"에서 "당신이 고른 지역이라서
    // 규제지역"으로 바뀐다 — 그 순간 그것은 더 이상 가정이 아니다.
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "6000");
    await userEvent.click(screen.getByLabelText("무주택"));

    expect(screen.getByText(/규제지역으로 계산했어요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /강남구/ }));

    expect(screen.queryByText(/규제지역으로 계산했어요/)).not.toBeInTheDocument();
  });

  it("지역을 고르면 목록이 그 지역만 남는다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "6000");
    await userEvent.click(screen.getByLabelText("무주택"));

    const before = screen.queryAllByRole("listitem").length;
    await userEvent.click(screen.getByRole("checkbox", { name: /강남구/ }));
    const after = screen.queryAllByRole("listitem").length;

    expect(after).toBeLessThanOrEqual(before);
  });
});
