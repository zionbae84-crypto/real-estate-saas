import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WarningList } from "./WarningList";

describe("WarningList", () => {
  it("경고가 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<WarningList warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("경고를 목록 항목으로 각각 보여준다", () => {
    render(
      <WarningList
        warnings={["양도세가 반영되지 않았습니다.", "정책대출 자격을 확인하세요."]}
      />,
    );
    expect(
      screen.getByText("양도세가 반영되지 않았습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("정책대출 자격을 확인하세요."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("role=\"alert\"는 <ul>이 아니라 감싸는 wrapper에 있어 list 역할이 살아 있다", () => {
    // 회귀 방지: role="alert"가 <ul>에 직접 있으면 그 암묵적 list 역할이
    // 덮어써져 getByRole("list")가 더는 찾아지지 않는다.
    render(<WarningList warnings={["경고"]} />);
    const alertRegion = screen.getByRole("alert");
    const list = screen.getByRole("list");
    expect(alertRegion).not.toBe(list);
    expect(alertRegion).toContainElement(list);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
