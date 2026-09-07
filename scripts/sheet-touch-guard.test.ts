import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **손가락으로 밀 수 있는 것만 스크롤 상자로 둔다.**
 *
 * 좁은 화면의 목록 시트가 한동안 터치로 전혀 안 움직였다. 원인은 한
 * 줄이었다 — 스크롤 사슬에서 **실제로 스크롤 가능한 요소가 하나뿐인데
 * 그 요소에 `pointer-events: none`이 걸려 있었다.** 브라우저는 손가락
 * 아래를 히트 테스트해서 밀 대상을 찾는데, `pointer-events: none`인
 * 요소는 그 대상에서 빠진다. 그래서 시트 크기 조절도, 카드 목록
 * 스크롤도 둘 다 죽었다.
 *
 * **왜 아무도 몰랐나.** JS로 `scrollTop`을 대입하면 멀쩡히 끝까지
 * 스크롤된다(그쪽은 히트 테스트를 거치지 않는다). jsdom에는 레이아웃도
 * 터치도 없다. 넓은 화면에서는 이 블록 자체가 꺼져 있다. 즉 우리가
 * 가진 어떤 검사로도 볼 수 없었고, 실제 기기에서만 드러났다.
 *
 * 그래서 이 검사는 코드를 실행하지 않고 **CSS를 글자 그대로 읽는다.**
 * 결함의 성질과 맞는 유일한 방법이다(`scripts/printCss.test.ts`·
 * `scripts/serverless-import-guard.test.ts`와 같은 이유).
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸다 — 예시로 적힌 선언이 진짜 선언으로 읽히면 안 된다. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 좁은 화면 블록(`@media screen and (max-width: 640px)`)의 본문. */
function narrowScreenBlock(): string {
  const start = CSS.indexOf("@media screen and (max-width: 640px)");
  expect(start).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") {
      depth--;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error("좁은 화면 블록의 닫는 괄호를 찾지 못했다");
}

interface Rule {
  selector: string;
  body: string;
}

/** `선택자 { 선언 }` 쌍을 뽑는다(이 블록에는 중첩 @규칙이 없다). */
function rulesIn(block: string): Rule[] {
  const out: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block)) !== null) {
    out.push({ selector: match[1]!.trim(), body: match[2]! });
  }
  return out;
}

const SCROLLS = /overflow(-y)?\s*:\s*(auto|scroll)/;
const UNTOUCHABLE = /pointer-events\s*:\s*none/;

describe("좁은 화면 시트의 터치", () => {
  const rules = rulesIn(stripComments(narrowScreenBlock()));

  it("검사할 규칙을 실제로 찾았다(파싱이 깨지면 이 검사가 공허해진다)", () => {
    expect(rules.length).toBeGreaterThan(20);
    expect(rules.some((r) => r.selector.includes(".region-results-sidebar"))).toBe(true);
  });

  it("스크롤 상자에 pointer-events: none을 걸지 않는다", () => {
    const broken = rules
      .filter((r) => SCROLLS.test(r.body) && UNTOUCHABLE.test(r.body))
      .map((r) => r.selector);
    expect(broken).toEqual([]);
  });

  /**
   * 위 검사만으로는 "스크롤 상자가 아예 없는" 상태도 통과한다 — 그러면
   * 목록이 잘린 채 끝까지 못 본다. 목록을 담는 시트가 스스로 스크롤해야 한다.
   */
  it("목록 시트가 스스로 스크롤한다", () => {
    const sheet = rules.find((r) => r.selector === ".region-results-sidebar");
    expect(sheet).toBeDefined();
    expect(SCROLLS.test(sheet!.body)).toBe(true);
    expect(UNTOUCHABLE.test(sheet!.body)).toBe(false);
  });

  /**
   * 손잡이는 브라우저의 기본 스크롤에 이벤트를 빼앗기면 안 된다 —
   * `touch-action: none`이 없으면 손가락을 대는 순간 스크롤이 시작돼
   * 포인터 이벤트가 끊긴다.
   */
  it("손잡이가 브라우저 기본 스크롤에 손짓을 빼앗기지 않는다", () => {
    const grabber = rules.find((r) => r.selector === ".result-sheet-grabber");
    expect(grabber).toBeDefined();
    expect(/touch-action\s*:\s*none/.test(grabber!.body)).toBe(true);
    expect(/pointer-events\s*:\s*auto/.test(grabber!.body)).toBe(true);
  });

  /**
   * 시트 위쪽 빈 자리에서는 지도가 그대로 조작돼야 한다 — 덮개 층이
   * 손짓을 받으면 지도를 못 민다(`.budget-panel`이 지키는 것과 같은 원칙).
   */
  it("시트 위쪽 덮개 층은 손짓을 통과시킨다", () => {
    const overlay = rules.find((r) => r.selector === ".result-sheet-scroller");
    expect(overlay).toBeDefined();
    expect(UNTOUCHABLE.test(overlay!.body)).toBe(true);
    // 그러면서 스크롤 상자여서는 안 된다 — 그 조합이 바로 이 파일이 막는 결함이다.
    expect(SCROLLS.test(overlay!.body)).toBe(false);
  });
});
