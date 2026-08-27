import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 지도 위에 겹쳐 그리는 상자가 **그 아래 마커의 클릭을 먹지 않는지**
 * 검사한다(리뷰 findings m2).
 *
 * 실제로 겪은 자리는 마커 색 범례(`.complex-map-legend`)였다:
 * `position: absolute; z-index: 2`에 불투명한 배경을 깐 상자인데
 * `pointer-events`가 기본값(`auto`)이었다. 지도 좌측 하단이라 그 자리에
 * 마커가 놓이는 일이 드물지 않고, 겹치는 순간 그 마커는 **지도를
 * 움직이기 전까지 누를 수 없다** — 사용자에게는 마커가 고장 난 것으로
 * 보인다(이 저장소가 이미 두 번 낸 "눌러도 아무 반응이 없는 컨트롤"
 * 실패와 같은 결과다). 범례에는 누를 것이 하나도 없었다.
 *
 * 그 범례는 지금 없다(마커가 한 색이 되며 함께 사라졌다). 규칙은 남는다 —
 * 아래 첫 검사가 "지금 대상이 없다"를 못박아, 다음 오버레이가 생기는
 * 날 이 파일을 읽게 만든다.
 *
 * **선택자 하나가 아니라 규칙으로 잠근다.** 지도 액자 위에 새 오버레이를
 * 얹는 다음 사람이 같은 실수를 하지 않으려면, "겹쳐 놓는 상자는
 * 클릭을 통과시킨다"가 검사 가능한 형태로 남아 있어야 한다.
 *
 * **한계**: jsdom은 히트 테스트를 하지 않으므로 "실제로 마커가 눌리는가"는
 * 렌더링 테스트로 확인할 수 없다. 여기서는 소스에 그 선언이 있는지만
 * 본다(같은 이유로 `scripts/printCss.test.ts`도 CSS 소스를 읽는다).
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 선언부. 주석 안의 예시가 규칙으로 잡히지 않게 한다. */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selector: string;
  body: string;
}

const RULES: Rule[] = (() => {
  // `@media …{`만 걷어내면 남는 것은 평평한 규칙 목록이다.
  const flat = DECLARATIONS.replace(/@media[^{]*\{/g, "");
  const rules: Rule[] = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({
      selector: m[1]!
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
      body: m[2]!,
    });
  }
  return rules;
})();

/**
 * 지도 액자(`.complex-map-frame`) 위에 절대 배치로 얹히는 상자들.
 *
 * 마커(`.complex-map-marker`)와 팝업 내용(`.complex-map-popup`)은 여기
 * 걸리지 않는다 — 그 둘의 위치는 네이버 SDK가 인라인으로 정하고, 우리
 * CSS는 모양만 준다. 그리고 그 둘은 **눌려야 하는** 것들이라 이 규칙에
 * 걸리면 안 된다.
 */
const MAP_OVERLAYS = RULES.filter(
  (r) =>
    r.selector.split(",").some((part) => part.trim().startsWith(".complex-map")) &&
    /(?:^|[;\s])position:\s*absolute/.test(r.body),
);

describe("지도 위 오버레이", () => {
  /**
   * **지금은 목록이 비어 있다.** 이 규칙의 유일한 대상이던 마커 색
   * 범례(`.complex-map-legend`)가 사라졌다 — 사용자 지시로 마커에서
   * 부담 수준 색 구분을 걷어내며, 설명할 갈림이 없어진 범례를 통째로
   * 없앴다.
   *
   * 그래서 "대상이 하나라도 있다"가 아니라 **"하나도 없다"**를 못박는다.
   * 아래 두 검사는 대상이 없는 동안 공허하게 통과하므로, 그 사실을
   * 여기서 눈에 보이게 두지 않으면 다음 사람이 새 오버레이를 얹으면서
   * 이 파일이 살아 있다고 믿게 된다. 새 오버레이가 생기는 날 이 검사가
   * 먼저 깨지고 — 그때 이 목록을 갱신하기 전에 아래 규칙(클릭을
   * 통과시킨다)을 읽게 된다. 그게 이 자물쇠가 노리는 것이다.
   */
  it("지금 지도 위에 절대 배치 오버레이가 하나도 없다", () => {
    expect(
      MAP_OVERLAYS.map((r) => r.selector),
      "지도 액자 위에 절대 배치 상자가 새로 생겼습니다 — 이 파일 머리 " +
        "주석을 읽고, 그 상자에 `pointer-events: none`을 걸었는지 확인한 " +
        "뒤 이 목록을 갱신하세요.",
    ).toEqual([]);
  });

  it("전부 클릭을 통과시킨다(pointer-events: none)", () => {
    const blocking = MAP_OVERLAYS.filter(
      (r) => !/(?:^|[;\s])pointer-events:\s*none/.test(r.body),
    ).map((r) => r.selector);

    expect(blocking).toEqual([]);
  });

  it("마커와 팝업은 이 규칙에 걸리지 않는다 — 눌려야 하는 것들이다", () => {
    const selectors = MAP_OVERLAYS.map((r) => r.selector).join(" | ");

    expect(selectors).not.toContain(".complex-map-marker");
    expect(selectors).not.toContain(".complex-map-popup");
  });
});
