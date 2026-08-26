import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AREA_BANDS, type AreaBand } from "../lib/area-band";
import { rules } from "../state/useAffordability";
import { AreaBandSelect } from "./AreaBandSelect";

const THRESHOLD = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

function renderStatic(value: AreaBand[], onChange = vi.fn()) {
  render(
    <AreaBandSelect
      value={value}
      onChange={onChange}
      ruralTaxAreaThresholdSqm={THRESHOLD}
    />,
  );
  return onChange;
}

function Harness({ initial }: { initial: AreaBand[] }) {
  const [value, setValue] = useState<AreaBand[]>(initial);
  return (
    <>
      <AreaBandSelect
        value={value}
        onChange={setValue}
        ruralTaxAreaThresholdSqm={THRESHOLD}
      />
      <p data-testid="value">{value.join(",")}</p>
    </>
  );
}

const chip = (name: AreaBand) =>
  screen.getByRole("checkbox", { name: new RegExp(`^${name} `) });

describe("평형대 입력", () => {
  it("하나의 질문으로 묶어 낸다 — 칩만으로는 무엇의 소형인지 알 수 없다", () => {
    renderStatic([...AREA_BANDS]);
    expect(
      screen.getByRole("group", { name: "어느 평형대요?" }),
    ).toBeInTheDocument();
  });

  it("네 구간을 좁은 쪽부터 낸다", () => {
    renderStatic([...AREA_BANDS]);
    const names = screen
      .getAllByRole("checkbox")
      .map((el) => el.getAttribute("value"));
    expect(names).toEqual(["소형", "중소형", "중형", "대형"]);
  });

  /**
   * 손으로 숫자를 치지 않게 하는 것이 이 컨트롤의 존재 이유다(스펙 §4).
   * 숫자 입력란이 하나라도 생기면 그 목적이 무너진다.
   */
  it("숫자를 치는 입력란이 하나도 없다", () => {
    const { container } = render(
      <AreaBandSelect
        value={[...AREA_BANDS]}
        onChange={vi.fn()}
        ruralTaxAreaThresholdSqm={THRESHOLD}
      />,
    );
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0);
  });

  it("범위 라벨은 ㎡가 주(主)이고 룰셋의 임계값을 그대로 쓴다", () => {
    renderStatic([...AREA_BANDS]);
    expect(screen.getByText("~60㎡")).toBeInTheDocument();
    expect(screen.getByText(`60~${THRESHOLD}㎡`)).toBeInTheDocument();
    expect(screen.getByText(`${THRESHOLD}~102㎡`)).toBeInTheDocument();
    expect(screen.getByText("102㎡~")).toBeInTheDocument();
  });

  it("고른 구간만 체크돼 있다", () => {
    renderStatic(["소형", "중형"]);
    expect(chip("소형")).toBeChecked();
    expect(chip("중소형")).not.toBeChecked();
    expect(chip("중형")).toBeChecked();
    expect(chip("대형")).not.toBeChecked();
  });

  it("복수 선택이다 — 하나를 켜도 나머지가 꺼지지 않는다", async () => {
    render(<Harness initial={["소형"]} />);
    await userEvent.click(chip("대형"));
    expect(screen.getByTestId("value")).toHaveTextContent("소형,대형");
  });

  it("이미 켜진 칩을 누르면 꺼진다", async () => {
    render(<Harness initial={["소형", "대형"]} />);
    await userEvent.click(chip("소형"));
    expect(screen.getByTestId("value")).toHaveTextContent("대형");
  });

  /**
   * 마지막 하나를 눌러 끄는 것을 막지 않는다 — 막으면 눌러도 아무 일도
   * 일어나지 않는 죽은 컨트롤이 된다(이 저장소가 두 번 낸 실패). 대신
   * 화면 1이 "평형대를 하나 이상 골라 주세요"라고 말한다(App.tsx).
   */
  it("마지막 하나도 끌 수 있다 — 누르면 실제로 꺼진다", async () => {
    render(<Harness initial={["중형"]} />);
    await userEvent.click(chip("중형"));
    expect(screen.getByTestId("value")).toHaveTextContent("");
    expect(chip("중형")).not.toBeChecked();
  });

  /**
   * 저장·표시 순서가 클릭 순서에 좌우되면 종이에 적히는 순서가 사람마다
   * 달라진다.
   */
  it("고른 순서와 무관하게 좁은 쪽부터 정렬해 돌려준다", async () => {
    render(<Harness initial={[]} />);
    await userEvent.click(chip("대형"));
    await userEvent.click(chip("소형"));
    await userEvent.click(chip("중형"));
    expect(screen.getByTestId("value")).toHaveTextContent("소형,중형,대형");
  });

  it("키보드로 조작할 수 있다 — 탭으로 닿고 스페이스로 켠다", async () => {
    render(<Harness initial={[]} />);
    await userEvent.tab();
    expect(chip("소형")).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByTestId("value")).toHaveTextContent("소형");
    await userEvent.tab();
    expect(chip("중소형")).toHaveFocus();
  });

  it("임계값이 바뀌면 구간 라벨도 함께 움직인다", () => {
    render(
      <AreaBandSelect
        value={[...AREA_BANDS]}
        onChange={vi.fn()}
        ruralTaxAreaThresholdSqm={100}
      />,
    );
    expect(screen.getByText("60~100㎡")).toBeInTheDocument();
    expect(screen.getByText("100~102㎡")).toBeInTheDocument();
  });
});
