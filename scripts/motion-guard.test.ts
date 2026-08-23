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

describe("모션", () => {
  it("전환을 실제로 쓰고 있다", () => {
    // 아래 검사들이 공허하게 통과하지 않도록 전제를 고정한다.
    expect(DECLARATIONS).toMatch(/transition/);
  });

  it("prefers-reduced-motion 블록이 있다", () => {
    expect(DECLARATIONS).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
  });

  it("전환 시간을 직접 쓰지 않고 SEED 토큰을 쓴다", () => {
    // "0.3s" 같은 리터럴이 있으면 SEED의 모션 체계 밖으로 나간 것이다.
    const literals = DECLARATIONS.match(/transition[^;}]*?\b\d+(\.\d+)?m?s\b/g) ?? [];
    expect(literals).toEqual([]);
  });
});
