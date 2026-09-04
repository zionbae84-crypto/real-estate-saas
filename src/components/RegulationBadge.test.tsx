import { fireEvent, render, screen } from "@testing-library/react";
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

  /**
   * 사용자 지시: "규제지역에 마우스를 올리면 간략하게 어떤 차이를
   * 반영하는지 설명하는 내용을 볼 수 있도록" → "딜레이를 최대한
   * 빠르게", "흰색바탕(검정글씨)의 카드형식으로" → "규제지역일때 ltv가
   * 어떻게 달라지고, 대출한도 달라질수 있는점 언급해줘"(내용이 달라져
   * 두 줄). 세 상태 모두 같은 카드를 얻는지 확인한다 — "이 배지가 무슨
   * 뜻인가"는 값이 바뀌어도 같다. `title`이 아니라
   * `.result-topbar-tooltip` 카드로 낸다(그 속성은 뜨기까지 1~1.5초
   * 걸리고 배경·글자색을 못 바꾼다).
   */
  it("세 상태 모두 마우스를 올리면 카드로 LTV·대출 한도 설명 두 줄을 낸다 — title 속성이 아니다", () => {
    const cases = [
      { determined: true, isRegulatedArea: true },
      { determined: true, isRegulatedArea: false },
      { determined: false, isRegulatedArea: true },
    ];
    for (const props of cases) {
      const { container, unmount } = render(<RegulationBadge {...props} />);
      const badge = container.querySelector(".regulation-badge");
      expect(badge).not.toHaveAttribute("title");
      // 마우스를 올리기 전에는 카드 자체가 DOM에 없다 — CSS로만 숨긴
      // 상태가 아니라 조건부 렌더링이다.
      expect(badge?.querySelector('[role="tooltip"]')).toBeNull();

      fireEvent.mouseEnter(badge!);

      expect(
        [...badge!.querySelectorAll(".result-topbar-tooltip-line")].map((el) => el.textContent),
      ).toEqual([
        "규제지역이면 LTV(담보인정비율)가 40%로 낮아져요(생애최초는 70%).",
        "LTV가 낮아지면 대출 한도도 함께 줄어들 수 있어요.",
      ]);
      unmount();
    }
  });

  it("배지는 원래 포커스를 안 받는 요소라, 키보드로도 카드를 열 수 있게 tabIndex를 준다", () => {
    render(<RegulationBadge determined isRegulatedArea />);
    expect(document.querySelector(".regulation-badge")).toHaveAttribute("tabIndex", "0");
  });
});
