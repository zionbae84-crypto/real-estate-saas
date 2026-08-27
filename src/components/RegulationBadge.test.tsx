import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegulationBadge } from "./RegulationBadge";

describe("RegulationBadge", () => {
  it("확정 + 규제지역이면 '규제지역'만 말한다(가정 표시가 없다)", () => {
    render(<RegulationBadge determined isRegulatedArea />);
    expect(screen.getByText("규제지역")).toBeInTheDocument();
    expect(screen.queryByText(/가정/)).not.toBeInTheDocument();
  });

  it("확정 + 비규제지역이면 '비규제지역'을 말한다", () => {
    render(<RegulationBadge determined isRegulatedArea={false} />);
    expect(screen.getByText("비규제지역")).toBeInTheDocument();
    expect(screen.queryByText(/가정/)).not.toBeInTheDocument();
  });

  it("미확정이면 '가정'이 함께 붙는다 — 확정과 같은 문구를 쓰지 않는다", () => {
    render(<RegulationBadge determined={false} isRegulatedArea />);
    expect(screen.getByText("규제지역")).toBeInTheDocument();
    expect(screen.getByText("(가정)")).toBeInTheDocument();
  });

  it("미확정 + isRegulatedArea=false여도 방향을 그대로 따른다(하드코딩하지 않는다)", () => {
    render(<RegulationBadge determined={false} isRegulatedArea={false} />);
    expect(screen.getByText("비규제지역")).toBeInTheDocument();
    expect(screen.getByText("(가정)")).toBeInTheDocument();
  });

  it("아이콘은 aria-hidden이라 접근 가능한 이름은 글자 라벨에서만 온다", () => {
    render(<RegulationBadge determined isRegulatedArea />);
    const svg = document.querySelector(".regulation-badge svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("세 상태가 서로 다른 클래스를 얻는다(색으로만 구분하지 않되, CSS 훅은 있어야 한다)", () => {
    const { container: regulated } = render(
      <RegulationBadge determined isRegulatedArea />,
    );
    const { container: unregulated } = render(
      <RegulationBadge determined isRegulatedArea={false} />,
    );
    const { container: assumed } = render(
      <RegulationBadge determined={false} isRegulatedArea />,
    );
    expect(
      regulated.querySelector(".regulation-badge--regulated"),
    ).not.toBeNull();
    expect(
      unregulated.querySelector(".regulation-badge--unregulated"),
    ).not.toBeNull();
    expect(assumed.querySelector(".regulation-badge--assumed")).not.toBeNull();
  });
});
