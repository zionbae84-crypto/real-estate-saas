import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultShell } from "./ResultShell";

/**
 * 좁은 화면에서 목록 시트의 **크기를 손잡이로 바꾼다.**
 *
 * 예전에는 시트 높이도 목록 스크롤도 바깥 스크롤 상자 하나가 맡았는데,
 * 그 상자가 `pointer-events: none`이라 **터치로는 아무것도 안 움직였다**
 * (`scripts/sheet-touch-guard.test.ts`가 그 CSS 조합을 막는다). 여기서는
 * 그 대체물인 끌기 자체가 도는지를 본다.
 *
 * jsdom에는 레이아웃이 없어 높이가 전부 0이다 — 그러면 상한이
 * `max(112, 0 - 88)`이 되어 무엇을 끌든 112로 뭉개져 검사가 공허해진다.
 * 그래서 무대와 시트의 크기만 실제 값처럼 심어 준다.
 */
const STAGE_H = 741;
const SHEET_H = 370;

function renderSheet() {
  const view = render(
    <ResultShell
      summary={<p>요약</p>}
      actions={<button type="button">동작</button>}
      sidebar={<p>목록</p>}
      map={<p>지도</p>}
      panel={<p>패널</p>}
    />,
  );
  const scroller = view.container.querySelector(".result-sheet-scroller") as HTMLElement;
  const sheet = view.container.querySelector(".region-results-sidebar") as HTMLElement;
  Object.defineProperty(scroller, "clientHeight", { value: STAGE_H, configurable: true });
  sheet.getBoundingClientRect = () => ({ height: SHEET_H, top: STAGE_H - SHEET_H }) as DOMRect;
  return { ...view, scroller, grabber: screen.getByRole("separator", { name: "목록 크기 조절" }) };
}

/** 인라인으로 적힌 시트 높이(px). 아직 안 끌었으면 `null`(= CSS 기본값). */
function sheetHeight(scroller: HTMLElement): number | null {
  const raw = scroller.style.getPropertyValue("--sheet-height");
  return raw === "" ? null : Number.parseInt(raw, 10);
}

function drag(grabber: HTMLElement, fromY: number, toY: number) {
  fireEvent.pointerDown(grabber, { pointerId: 1, clientY: fromY });
  fireEvent.pointerMove(grabber, { pointerId: 1, clientY: toY });
  fireEvent.pointerUp(grabber, { pointerId: 1, clientY: toY });
}

describe("목록 시트 크기 조절", () => {
  it("끌기 전에는 높이를 지정하지 않는다 — CSS 기본값이 그대로 산다", () => {
    const { scroller } = renderSheet();
    expect(sheetHeight(scroller)).toBeNull();
  });

  it("위로 끌면 그만큼 커진다", () => {
    const { scroller, grabber } = renderSheet();
    drag(grabber, 500, 300); // 200px 위로
    expect(sheetHeight(scroller)).toBe(SHEET_H + 200);
  });

  it("아래로 끌면 그만큼 작아진다", () => {
    const { scroller, grabber } = renderSheet();
    drag(grabber, 500, 600); // 100px 아래로
    expect(sheetHeight(scroller)).toBe(SHEET_H - 100);
  });

  /**
   * 끝까지 올려도 지도 띠(88px)는 남긴다. 없으면 지도 로고·범례·버튼이
   * 통째로 가려 지도가 무엇을 보여 주는지 알 수 없게 된다.
   */
  it("끝까지 올려도 지도 띠를 남긴다", () => {
    const { scroller, grabber } = renderSheet();
    drag(grabber, 500, -5000);
    expect(sheetHeight(scroller)).toBe(STAGE_H - 88);
  });

  /** 끝까지 내려도 손잡이와 제목 한 줄은 남는다 — 아주 사라지면 다시 못 연다. */
  it("끝까지 내려도 시트가 사라지지는 않는다", () => {
    const { scroller, grabber } = renderSheet();
    drag(grabber, 500, 5000);
    expect(sheetHeight(scroller)).toBe(112);
  });

  it("끌기를 끝낸 뒤의 움직임은 크기를 바꾸지 않는다", () => {
    const { scroller, grabber } = renderSheet();
    drag(grabber, 500, 400);
    const after = sheetHeight(scroller);
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 100 });
    expect(sheetHeight(scroller)).toBe(after);
  });

  /** 손가락이 없는 사람도 조절할 수 있어야 한다. */
  it("화살표 키로도 조절한다", () => {
    const { scroller, grabber } = renderSheet();
    fireEvent.keyDown(grabber, { key: "ArrowUp" });
    expect(sheetHeight(scroller)).toBe(SHEET_H + 48);
    fireEvent.keyDown(grabber, { key: "ArrowDown" });
    expect(sheetHeight(scroller)).toBe(SHEET_H);
    fireEvent.keyDown(grabber, { key: "Home" });
    expect(sheetHeight(scroller)).toBe(112);
    fireEvent.keyDown(grabber, { key: "End" });
    expect(sheetHeight(scroller)).toBe(STAGE_H - 88);
  });

  it("손잡이는 시트 안이 아니라 형제로 둔다 — 경고가 시트 맨 위를 지킨다", () => {
    // `App.test.tsx`가 엔진 경고의 자리를 `sidebar.firstElementChild`로
    // 잠근다. 손잡이를 시트 자식으로 넣으면 그 자리가 밀린다.
    const { container } = renderSheet();
    const sheet = container.querySelector(".region-results-sidebar")!;
    expect(sheet.querySelector(".result-sheet-grabber")).toBeNull();
    expect(container.querySelector(".result-sheet-grabber")).not.toBeNull();
  });
});
