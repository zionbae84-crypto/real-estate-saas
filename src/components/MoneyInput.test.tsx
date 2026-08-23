import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoneyInput } from "./MoneyInput";

function setup(value: number | null = null) {
  const onChange = vi.fn();
  render(
    <MoneyInput id="cash" label="보유 현금" value={value} onChange={onChange} />,
  );
  return { onChange, input: screen.getByLabelText("보유 현금") };
}

describe("MoneyInput", () => {
  it("입력한 만원 단위 숫자를 원 단위로 내보낸다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "35000");
    expect(onChange).toHaveBeenLastCalledWith(350_000_000);
  });

  it("해석 결과를 사람이 읽는 형태로 되비춘다", async () => {
    const { input } = setup();
    await userEvent.type(input, "35000");
    expect(screen.getByText("3억 5,000만원")).toBeInTheDocument();
  });

  it("자릿수를 틀리면 되비추기로 드러난다", async () => {
    const { input } = setup();
    await userEvent.type(input, "50000000");
    expect(screen.getByText("5,000억원")).toBeInTheDocument();
  });

  it("읽을 수 없는 입력이면 null을 내보내고 안내를 띄운다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "abc");
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("숫자로 읽을 수 없어요")).toBeInTheDocument();
  });

  it("비우면 null을 내보내고 되비추기를 지운다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "1");
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("숫자로 읽을 수 없어요")).not.toBeInTheDocument();
  });

  it("초기 value가 있으면 만원 단위로 채워 보여준다", () => {
    setup(350_000_000);
    expect(screen.getByLabelText("보유 현금")).toHaveValue("35000");
  });

  it("만원 기본 해석을 되비춰 자릿수 오해를 드러낸다", () => {
    const onChange = vi.fn();
    render(
      <MoneyInput id="cash" label="보유 현금" value={null} onChange={onChange} />,
    );

    // "5천만원"을 의도하고 50000000을 넣으면 실제로는 5,000억이 된다.
    // 되비추기가 그 오해를 즉시 눈에 보이게 만든다.
    fireEvent.change(screen.getByLabelText("보유 현금"), {
      target: { value: "50000000" },
    });

    expect(onChange).toHaveBeenLastCalledWith(500_000_000_000);
    expect(screen.getByText(/5,000억/)).toBeInTheDocument();
  });

  it("억·만 단위를 섞어 쓴 입력을 읽는다", () => {
    const onChange = vi.fn();
    render(
      <MoneyInput id="cash" label="보유 현금" value={null} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("보유 현금"), {
      target: { value: "3억5000" },
    });

    expect(onChange).toHaveBeenLastCalledWith(350_000_000);
  });

  it("힌트를 표시한다", () => {
    render(
      <MoneyInput
        id="x"
        label="라벨"
        value={null}
        onChange={vi.fn()}
        hint="단위 없이 쓰면 만원입니다"
      />,
    );
    expect(screen.getByText("단위 없이 쓰면 만원입니다")).toBeInTheDocument();
  });

  it("오류 상태에서도 힌트가 화면에 실제로 보인다", async () => {
    render(
      <MoneyInput
        id="hint-and-error"
        label="힌트오류"
        value={null}
        onChange={vi.fn()}
        hint="단위 없이 쓰면 만원입니다"
      />,
    );

    await userEvent.type(screen.getByLabelText("힌트오류"), "abc");

    // 오류가 함께 떠 있는지부터 확인한다 — 이 케이스가 성립하지 않으면
    // 아래 힌트 검사가 의미가 없다.
    expect(screen.getByText("숫자로 읽을 수 없어요")).toBeInTheDocument();

    // DOM에 존재하는지만 보면 SEED의 VisuallyHidden(clip-rect 트릭)을
    // 통과해 버린다 — jest-dom의 toBeVisible()조차 display/visibility/
    // opacity만 보고 clip-rect 트릭은 못 잡는다. 그래서 계산된 스타일을
    // 직접 읽어 "화면에 실제로 그려지는" 사본이 하나라도 있는지 확인한다.
    const hintCopies = screen.getAllByText("단위 없이 쓰면 만원입니다");
    const isActuallyVisible = hintCopies.some((node) => {
      const style = window.getComputedStyle(node);
      return (
        style.position !== "absolute" &&
        style.width !== "1px" &&
        style.height !== "1px" &&
        style.clip !== "rect(0px, 0px, 0px, 0px)"
      );
    });
    expect(isActuallyVisible).toBe(true);
  });
});
