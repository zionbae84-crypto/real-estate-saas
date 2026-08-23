import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 모션이 접근성 요구사항을 지키는지 검사한다.
 *
 * prefers-reduced-motion은 취향이 아니다. 전정기관 장애가 있는 사용자에게
 * 모션은 불편이 아니라 증상을 유발한다. 전환을 추가하면서 이 블록을 빠뜨리기
 * 쉬우므로 파일 단위로 잠근다.
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 선언부 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

const REDUCED_MOTION_START = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;

/**
 * 리뷰 수정(Minor 3): `toMatch(/@media.../)`는 블록의 **존재**만 보고
 * 안이 비어 있어도(`{}`) 통과한다. 중괄호는 정규식만으로 짝을 맞출 수
 * 없으므로(중첩된 `*, *::before, *::after { ... }` 규칙이 안에 있다)
 * 여는 중괄호부터 직접 깊이를 세어 블록의 몸통 전체를 잘라낸다.
 */
function extractBlockBody(css: string, startRegex: RegExp): string | null {
  const match = startRegex.exec(css);
  if (!match) return null;
  const braceStart = css.indexOf("{", match.index);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
  }
  return null; // 중괄호 짝이 안 맞음 — 잘못된 CSS
}

/**
 * 블록 안에 모션을 실제로 끄는 선언(`transition`/`animation` 계열
 * 속성)이 하나라도 있는지 검사한다. 셀렉터만 있고 선언이 비어 있으면
 * (`{}`) 이 함수는 `false`를 돌려준다 — 빈 블록은 무엇도 끄지 않으므로
 * prefers-reduced-motion이 요구하는 접근성 효과가 전혀 없다.
 */
function hasDisablingDeclaration(blockBody: string): boolean {
  const declarations =
    blockBody.match(/(transition|animation)[\w-]*\s*:\s*[^;{}]+;/g) ?? [];
  return declarations.length > 0;
}

describe("모션", () => {
  it("전환을 실제로 쓰고 있다", () => {
    // 아래 검사들이 공허하게 통과하지 않도록 전제를 고정한다.
    expect(DECLARATIONS).toMatch(/transition/);
  });

  it("prefers-reduced-motion 블록이 있다", () => {
    expect(DECLARATIONS).toMatch(REDUCED_MOTION_START);
  });

  it("전환 시간을 직접 쓰지 않고 SEED 토큰을 쓴다", () => {
    // "0.3s" 같은 리터럴이 있으면 SEED의 모션 체계 밖으로 나간 것이다.
    const literals = DECLARATIONS.match(/transition[^;}]*?\b\d+(\.\d+)?m?s\b/g) ?? [];
    expect(literals).toEqual([]);
  });

  it("prefers-reduced-motion 블록 안에 실제로 전환을 끄는 선언이 있다", () => {
    // 리뷰 수정(Minor 3): 블록이 있다는 것과 그 안에서 실제로 모션을 끈다는
    // 것은 다른 주장이다. 셀렉터만 있고 몸통이 비어 있는 블록도 위 "블록이
    // 있다" 테스트는 통과시키지만, 그런 블록은 전정기관 장애가 있는
    // 사용자에게 아무 효과가 없다.
    const body = extractBlockBody(DECLARATIONS, REDUCED_MOTION_START);
    expect(body).not.toBeNull();
    expect(hasDisablingDeclaration(body ?? "")).toBe(true);
  });

  it("빈 블록이면 위 검사가 실제로 거부한다(회귀 테스트)", () => {
    // 새 검사 함수 자체가 "빈 블록"을 정말로 거부하는지 확인하는
    // 자체 테스트다 — 실제 파일이 우연히 항상 채워져 있어 이 검사가
    // 공허하게 통과하는 일을 막는다.
    const emptyBlockCss = `
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
        }
      }
    `;
    const body = extractBlockBody(emptyBlockCss, REDUCED_MOTION_START);
    expect(body).not.toBeNull();
    expect(hasDisablingDeclaration(body ?? "")).toBe(false);
  });
});
