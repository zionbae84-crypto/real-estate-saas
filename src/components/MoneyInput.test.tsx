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
    expect(screen.getByText("숫자로 읽을 수 없습니다")).toBeInTheDocument();
  });

  it("비우면 null을 내보내고 되비추기를 지운다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "1");
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("숫자로 읽을 수 없습니다")).not.toBeInTheDocument();
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
});
