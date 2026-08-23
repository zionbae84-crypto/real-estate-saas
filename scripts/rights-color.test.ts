import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 권리분석 결론이 앱의 "안전" 색을 빌려 쓰지 않는지 검사한다.
 *
 * 이 문진이 낼 수 있는 가장 좋은 결론은 `clear`이고, 그것은 "이 문진이
 * 확인한 범위에서는 걸리는 게 없었어요"이지 **"안전해요"가 아니다.**
 * 룰셋의 문구는 그 말을 정확히 하고 있는데(`overall.clear.note`가
 * "'안전하다'는 뜻이 아니에요"로 시작한다), 색이 그것을 되돌려 주면
 * 안 된다 — 화면에서 먼저 읽히는 것은 문장이 아니라 색이다.
 *
 * `--safe`는 예산 화면의 문자 그대로 "안전" 배지(`.safety-badge`
 * `[data-level="safe"]`)가 쓰는 바로 그 토큰이다. 같은 색을 권리분석
 * 결론에 쓰면 사용자는 두 화면을 같은 뜻으로 읽는다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * `styles.css`를 직접 읽는 빌드 타임 검사이기 때문이다
 * (`scripts/printCss.test.ts`·`scripts/motion-guard.test.ts`와 같은 이유).
 * `src/no-network.test.ts`가 `src/` 안에서 Node 내장 모듈 임포트를
 * 금지한다.
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 CSS. 주석 안의 예시가 실제 규칙으로 오인되는 것을 막는다 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * 한 선택자에 걸린 규칙의 선언부를 모은다.
 *
 * 같은 선택자가 여러 번 나올 수 있으므로 전부 모은다 — 하나라도
 * `--safe`를 걸면 그게 최종 색이 될 수 있다.
 */
function declarationsFor(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^{}]*)\\}`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (m[2] !== undefined) out.push(m[2]);
  }
  return out;
}

const CLEAR_SELECTOR = '.rights-overall[data-verdict="clear"]';

describe("권리분석 결론의 색", () => {
  it("clear 결론에 색 규칙이 실제로 있다(전제)", () => {
    // 규칙 자체가 사라지면 아래 검사가 공허하게 통과한다.
    expect(declarationsFor(DECLARATIONS, CLEAR_SELECTOR).length).toBeGreaterThan(
      0,
    );
  });

  it("clear 결론이 '안전' 색(--safe)을 쓰지 않는다", () => {
    for (const body of declarationsFor(DECLARATIONS, CLEAR_SELECTOR)) {
      expect(body, body).not.toMatch(/var\(\s*--safe\s*\)/);
      expect(body, body).not.toMatch(/--seed-color-fg-positive/);
    }
  });

  it("파서가 실제로 --safe를 잡아낸다(변이 검사)", () => {
    // 위 검사가 그물이 찢어진 채로 통과하지 않는지 확인한다.
    const poisoned = `${CLEAR_SELECTOR} { color: var(--safe); }`;
    const bodies = declarationsFor(poisoned, CLEAR_SELECTOR);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatch(/var\(\s*--safe\s*\)/);
  });

  it("예산 화면의 '안전' 배지는 여전히 --safe를 쓴다(대조군)", () => {
    // `--safe`가 저장소에서 통째로 사라져서 위 검사가 통과하는 것이
    // 아님을 고정한다. 그 토큰은 문자 그대로 "안전" 등급이 쓰는 자리에
    // 그대로 살아 있어야 한다.
    expect(DECLARATIONS).toMatch(
      /\.safety-badge\[data-level="safe"\][^{]*\{[^{}]*var\(--safe\)/,
    );
  });
});
