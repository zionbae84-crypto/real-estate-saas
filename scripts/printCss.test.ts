import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MUST_SURVIVE_PRINT_CLASSES,
  PRINT_HIDDEN_SELECTORS,
} from "../src/print/hiddenInPrint";

/**
 * 인쇄 CSS의 구조적 약속을 검사한다.
 *
 * jsdom은 인쇄 미디어를 흉내내지 못한다(`@media print`가 실제로 적용된
 * 결과를 렌더링해 확인할 방법이 없다) — 그래서 `styles.css` 텍스트를 직접
 * 파싱해 "인쇄 규칙이 실제로 무엇을 하는지"를 구조로 잠근다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * 파일을 직접 읽는 빌드 타임 검사이기 때문이다(`scripts/motion-guard.test.ts`,
 * `scripts/seed-brand-tokens.test.ts`와 같은 이유). `src/no-network.test.ts`는
 * `src/` 안에서 `node:` 임포트 자체를 금지하므로, 이 파일을 `src/print/`에
 * 두면 그 가드에 걸린다. 검사 대상 데이터(`PRINT_HIDDEN_SELECTORS`)는
 * 여전히 `src/print/hiddenInPrint.ts`에 둔다 — 그 파일은 fs를 쓰지 않는
 * 순수 데이터라 `src/`에 있어도 약속을 어기지 않는다.
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 CSS. motion-guard.test.ts와 같은 전제 — 주석 안의 예시
 * 선택자·속성이 실제 규칙으로 오인되는 것을 막는다. */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

const PRINT_MEDIA_START = /@media\s+print\s*/;

/**
 * `@media print { ... }` 블록의 몸통을 중괄호 깊이를 세어 정확히
 * 잘라낸다(motion-guard.test.ts의 extractBlockBody와 같은 접근 —
 * 정규식만으로는 중첩된 규칙의 중괄호 짝을 맞출 수 없다).
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
  return null;
}

interface CssRule {
  /** 쉼표로 나뉜 각 선택자 (트림됨) */
  selectors: string[];
  /** 선언부 원문 */
  body: string;
}

/**
 * 미디어 블록 안의 평범한(중첩 @-규칙이 없는) 규칙들을 선택자·선언부로
 * 나눈다. 지금 이 프로젝트의 `@media print` 블록은 다른 @-규칙을 중첩하지
 * 않으므로 이 단순한 파서로 충분하다(만약 나중에 중첩이 생기면 이 파서가
 * 잘못 잘라 아래 테스트들이 실패하며 그 사실을 알려준다).
 */
function parseRules(block: string): CssRule[] {
  const rules: CssRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const rawSelector = m[1];
    const body = m[2];
    if (rawSelector === undefined || body === undefined) continue;
    const selectors = rawSelector
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    rules.push({ selectors, body });
  }
  return rules;
}

/** 이 블록 안에서 `display: none`(대소문자 무관, !important 허용)으로
 * 숨겨지는 선택자를 전부 모은다. */
function hiddenSelectorsIn(block: string): string[] {
  const hidden: string[] = [];
  for (const rule of parseRules(block)) {
    if (/display\s*:\s*none\b/i.test(rule.body)) {
      hidden.push(...rule.selectors);
    }
  }
  return hidden;
}

describe("인쇄 CSS", () => {
  it("@media print 블록이 존재한다", () => {
    expect(DECLARATIONS).toMatch(PRINT_MEDIA_START);
  });

  const printBlock = extractBlockBody(DECLARATIONS, PRINT_MEDIA_START);

  it("블록을 실제로 추출했다(전제)", () => {
    // 아래 검사들이 공허하게 통과하지 않도록 전제를 고정한다.
    expect(printBlock).not.toBeNull();
    expect((printBlock ?? "").length).toBeGreaterThan(0);
  });

  describe("숨김 목록 동기화 — PRINT_HIDDEN_SELECTORS와 실제 CSS가 정확히 일치한다", () => {
    const hiddenInCss = new Set(hiddenSelectorsIn(printBlock ?? ""));
    const canonical = new Set(PRINT_HIDDEN_SELECTORS);

    it("CSS가 숨기는 선택자 중 canonical 목록에 없는 것이 없다", () => {
      const extra = [...hiddenInCss].filter((s) => !canonical.has(s));
      expect(
        extra,
        "styles.css가 PRINT_HIDDEN_SELECTORS(src/print/hiddenInPrint.ts)에 " +
          "없는 선택자를 숨기고 있습니다. 의도한 것이면 그 배열에도 추가하세요.",
      ).toEqual([]);
    });

    it("canonical 목록의 모든 선택자가 실제 CSS에서 숨겨진다", () => {
      const missing = [...canonical].filter((s) => !hiddenInCss.has(s));
      expect(
        missing,
        "PRINT_HIDDEN_SELECTORS에는 있는데 styles.css의 @media print에는 " +
          "숨김 규칙이 없는 선택자입니다.",
      ).toEqual([]);
    });
  });

  describe("보호 대상 클래스는 어떤 숨김 선택자에도 등장하지 않는다", () => {
    /** 위반이 있으면 [선택자, 걸린 보호 클래스] 쌍을 돌려준다. 목록
     * 자체(PRINT_HIDDEN_SELECTORS)를 직접 검사하므로 CSS 파싱 정확도에
     * 기대지 않는다 — 나중에 누가 CSS를 거치지 않고 이 배열만 늘려도 잡는다. */
    function violations(
      hidden: readonly string[],
      protectedClasses: readonly string[],
    ): Array<[string, string]> {
      const out: Array<[string, string]> = [];
      for (const selector of hidden) {
        for (const cls of protectedClasses) {
          if (selector.includes(cls)) out.push([selector, cls]);
        }
      }
      return out;
    }

    it("실제 목록은 위반이 없다", () => {
      expect(
        violations(PRINT_HIDDEN_SELECTORS, MUST_SURVIVE_PRINT_CLASSES),
      ).toEqual([]);
    });

    // 변이 검사: 이 가드가 실제로 뭔가를 잡아내는지, 일부러 위반을 심어
    // 확인한다. 이게 없으면 위 "위반이 없다"가 그물이 찢어져도 공허하게
    // 통과할 수 있다.
    it("숨김 목록에 보호 클래스가 섞이면 잡아낸다(변이 검사)", () => {
      const poisoned = [...PRINT_HIDDEN_SELECTORS, ".warning-list"];
      const found = violations(poisoned, MUST_SURVIVE_PRINT_CLASSES);
      expect(found).toEqual([[".warning-list", "warning-list"]]);
    });
  });

  describe("<details>는 인쇄 시 내용이 강제로 펼쳐진다", () => {
    /**
     * "펼쳐진다"의 실제 뜻: `<details>`의 요약(summary)이 아닌 자식에 대해
     * `display`를 `none`이 아닌 값으로 강제하는 규칙이 존재한다. 규칙
     * 문자열을 그대로 베끼면(예: 정확히 이 텍스트가 있는지) 다른 표현으로
     * 같은 효과를 내는 CSS를 쓰자마자 헛되이 실패한다 — 그래서 선택자가
     * "details의, summary가 아닌 자식"을 겨냥하는지와 선언부가 실제로
     * display를 강제하는지, 두 가지를 별도로 확인한다.
     */
    function forcesDetailsChildrenVisible(block: string): boolean {
      return parseRules(block).some((rule) => {
        const targetsDetailsNonSummaryChild = rule.selectors.some(
          (s) => /details/.test(s) && /(:not\(\s*summary\s*\))|(>\s*\*)/.test(s),
        );
        if (!targetsDetailsNonSummaryChild) return false;
        return (
          /display\s*:\s*(block|revert|contents|initial)\b/i.test(rule.body) &&
          !/display\s*:\s*none\b/i.test(rule.body)
        );
      });
    }

    it("styles.css의 인쇄 블록이 details 자식을 강제로 펼친다", () => {
      expect(forcesDetailsChildrenVisible(printBlock ?? "")).toBe(true);
    });

    // 변이 검사: 파서 자체가 "펼치는 규칙이 없는" 블록에서는 false를
    // 내는지 확인한다 — 실제 파일이 우연히 항상 규칙을 갖고 있어 이
    // 검사가 공허하게 통과하는 일을 막는다.
    it("펼치는 규칙이 없는 블록에서는 실제로 거부한다(회귀 테스트)", () => {
      const noRule = `
        .profile-form { display: none; }
        details { display: block; }
      `;
      expect(forcesDetailsChildrenVisible(noRule)).toBe(false);
    });

    it("details 아닌 요소를 펼치는 규칙은 잡지 않는다(오탐 방지 확인)", () => {
      const unrelated = `
        section:not(summary) { display: block; }
      `;
      expect(forcesDetailsChildrenVisible(unrelated)).toBe(false);
    });
  });

  describe("쪽 넘김 방지", () => {
    /**
     * 목록 행·배지 하나가 페이지 경계에서 잘리지 않게 하는 규칙이 있는지
     * 확인한다. `break-inside`(신 문법) 또는 `page-break-inside`(구
     * 문법) 둘 다 인정한다 — 어느 쪽을 쓰든 같은 효과다.
     */
    function hasBreakInsideAvoid(block: string): boolean {
      return /(break-inside|page-break-inside)\s*:\s*avoid/i.test(block);
    }

    it("행·배지가 페이지 경계에서 끊기지 않게 하는 규칙이 있다", () => {
      expect(hasBreakInsideAvoid(printBlock ?? "")).toBe(true);
    });

    it("그런 규칙이 없으면 거부한다(회귀 테스트)", () => {
      expect(hasBreakInsideAvoid(".foo { color: red; }")).toBe(false);
    });
  });
});
