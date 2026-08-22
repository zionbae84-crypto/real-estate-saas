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

/** 화면에 그려진 월 상환액을 원 단위 숫자로 읽는다. */
function readPayment(): number {
  const text =
    document.querySelector('[data-field="payment"]')?.textContent ?? "";
  return Number(text.replace(/[^0-9]/g, ""));
}

/**
 * 화면에 그려진 실구매 가능 가격(.affordable-price)을 원 단위 숫자로 읽는다.
 *
 * formatWon("6억 4,000만원")처럼 "억"·"만" 단위가 섞여 나오므로, 단순히
 * 숫자만 남기고 이어 붙이면(readPayment처럼) "6"과 "4000"이 "64000"으로
 * 뭉개져 자릿수가 완전히 틀어진다. 억/만/원 단위별로 나눠 다시 조립한다.
 */
function readAffordablePrice(): number {
  const text = document.querySelector(".affordable-price")?.textContent ?? "";
  if (text.trim() === "0원") return 0;

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
    expect(
      screen.getByRole("heading", { name: /걸렸습니다|최대치입니다/ }),
    ).toBeInTheDocument();
  });

  it("슬라이더를 내리면 월 상환액과 부담률이 줄어든다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    const slider = screen.getByRole("slider");
    const max = Number(slider.getAttribute("max"));
    expect(max).toBeGreaterThan(0);

    const ratioAtMax = readRatio();
    const paymentAtMax = readPayment();

    fireEvent.change(slider, { target: { value: String(Math.floor(max / 2 / 100_000) * 100_000) } });

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

  it("갈아타기를 고르면 기존주택 필드가 펼쳐진다", async () => {
    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("주택 보유 상황"),
      "갈아타기",
    );
    expect(screen.getByLabelText("기존 주택 예상 매도가")).toBeInTheDocument();
    expect(screen.getByLabelText("상환할 기존 대출")).toBeInTheDocument();
  });

  it("규제지역 체크를 끄면 실구매력이 올라간다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    // 폼 기본값은 규제지역=true(LTV 40%)다. 체크를 끄면 비규제(LTV 70%)로
    // 바뀌어 대출 한도가 늘어나므로, 이 조건이 실제로 바인딩된다면
    // 실구매력도 함께 올라가야 한다.
    const before = readAffordablePrice();
    await userEvent.click(screen.getByLabelText(/규제지역/));
    expect(readAffordablePrice()).toBeGreaterThan(before);
  });

  it("입력이 localStorage에 남아 새로고침 후 복원된다", async () => {
    const { unmount } = render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
  });
});
