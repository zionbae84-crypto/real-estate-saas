import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HoverTooltipCard, useHoverTooltip } from "./HoverTooltip";

/** 실제 사용부(App.tsx·RegulationBadge.tsx)와 같은 모양의 최소 트리거. */
function Trigger({ text }: { text: string }) {
  const tooltip = useHoverTooltip<HTMLDivElement>();
  return (
    <div
      ref={tooltip.ref}
      data-testid="trigger"
      onMouseEnter={tooltip.show}
      onMouseLeave={tooltip.hide}
      onFocus={tooltip.show}
      onBlur={tooltip.hide}
    >
      버튼
      <HoverTooltipCard pos={tooltip.pos} text={text} />
    </div>
  );
}

describe("useHoverTooltip / HoverTooltipCard", () => {
  it("마우스를 올리기 전에는 카드가 DOM에 없다", () => {
    const { container } = render(<Trigger text="설명" />);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("마우스를 올리면 카드가 뜨고, 벗어나면 사라진다", () => {
    const { container } = render(<Trigger text="설명" />);
    const trigger = container.querySelector('[data-testid="trigger"]')!;

    fireEvent.mouseEnter(trigger);
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe("설명");

    fireEvent.mouseLeave(trigger);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("포커스로도 뜨고, 포커스를 잃으면 사라진다 — 키보드 사용자도 볼 수 있다", () => {
    const { container } = render(<Trigger text="설명" />);
    const trigger = container.querySelector('[data-testid="trigger"]')!;

    fireEvent.focus(trigger);
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe("설명");

    fireEvent.blur(trigger);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  /**
   * `position: fixed`로 뷰포트 기준에 띄운다(`styles.css`의
   * `.result-topbar-tooltip` 문서 참고 — `.result-topbar`의
   * `overflow-x: auto`에 `position: absolute` 카드가 잘렸던 실측
   * 문제를 이렇게 피한다). 인라인 스타일의 `top`/`left`가 실제로
   * 들어가는지 잠근다 — 이게 없으면 카드가 항상 (0, 0)에 뜬다.
   */
  it("트리거를 잰 위치를 인라인 top/left로 낸다", () => {
    const { container } = render(<Trigger text="설명" />);
    const trigger = container.querySelector('[data-testid="trigger"]')!;
    fireEvent.mouseEnter(trigger);

    const card = container.querySelector('[role="tooltip"]') as HTMLElement;
    // jsdom은 실제 레이아웃을 계산하지 않아 getBoundingClientRect가
    // 전부 0을 주지만, "값이 인라인 스타일로 실제로 붙는지"는 그와
    // 무관하게 확인할 수 있다.
    expect(card.style.top).not.toBe("");
    expect(card.style.left).not.toBe("");
  });
});
