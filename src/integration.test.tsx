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

/**
 * 화면에 그려진 실구매 가능 가격(.affordable-price)을 원 단위 숫자로 읽는다.
 *
 * 지금은 이 파일의 어떤 테스트도 부르지 않는다 — 규제지역 체크박스가
 * ProfileForm에서 openField로 열어야만 나타나도록 바뀌었는데, 그걸 여는
 * AssumptionLine을 App에 배치하는 일은 이 태스크가 아니라 이후 태스크의
 * 몫이다. 그 배치가 끝나면 "규제지역을 열어 끄면 실구매력이 올라간다"
 * 통합 테스트를 이 헬퍼로 되살릴 수 있다.
 */
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

  it("입력이 localStorage에 남아 새로고침 후 복원된다", async () => {
    const { unmount } = render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
  });
});
