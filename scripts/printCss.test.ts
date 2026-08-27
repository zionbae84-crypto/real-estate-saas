import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODY_SCROLL_LOCK_CLASS } from "../src/print/bodyScrollLock";
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

const SCREEN_MEDIA_START = /@media\s+screen\s*/;

/** `@media …{ … }` 블록이 원문에서 차지하는 [시작, 끝) 구간 */
function blockRange(css: string, startRegex: RegExp): [number, number] | null {
  const match = startRegex.exec(css);
  if (!match) return null;
  const braceStart = css.indexOf("{", match.index);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return [match.index, i + 1];
    }
  }
  return null;
}

/**
 * 이 문자열을 겨누면서 요소를 **숨기거나 상자 안에 가두는** 선언을
 * 가진 규칙들의 원문 위치. `display: none`뿐 아니라 인쇄에서 같은
 * 결과(내용이 종이에서 사라짐)를 내는 형태를 함께 본다 —
 * design.md §6이 "인쇄에서 반드시 푼다"고 정한 그 목록이다.
 *
 * **두 자리가 이 함수를 쓴다**: 접히는 예산 상세 패널(`.budget-panel`,
 * Task 5)과 단지 상세의 접히는 블록(`.detail-fold`, design.md §6).
 * 둘 다 "닫힌 채로 Cmd+P를 누르는 것이 정상 경로"인 자리라 같은 사고를
 * 같은 방식으로 막는다.
 */
function confiningRuleIndexes(css: string, needle: string): number[] {
  const out: number[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1] ?? "";
    const body = m[2] ?? "";
    if (!selector.includes(needle)) continue;
    if (
      /display\s*:\s*none\b/i.test(body) ||
      /visibility\s*:\s*hidden\b/i.test(body) ||
      /content-visibility\s*:\s*hidden\b/i.test(body) ||
      /max-height\s*:\s*0\b/i.test(body) ||
      /position\s*:\s*(fixed|absolute)\b/i.test(body) ||
      /overflow(-[xy])?\s*:\s*(auto|hidden|scroll)\b/i.test(body)
    ) {
      out.push(m.index);
    }
  }
  return out;
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

  describe("숨기기로 한 것이 실제로 숨겨진다(특정도까지 계산한다)", () => {
    /**
     * 리뷰 밖에서 찾은 결함(P2, 브라우저로 실측): `.rights-check-form`은
     * `display: none` 규칙이 분명히 있는데도 인쇄에서 **실제로는 숨겨지지
     * 않았다.** 같은 블록 안 뒤쪽의
     * `details:not([open]) > *:not(summary) { display: block !important }`가
     * 특정도 (0,1,1) + !important로 (0,1,0)짜리 숨김 규칙을 이겼기
     * 때문이다. 문진 폼은 <details>의 직계 자식이라 그 선택자에 그대로
     * 걸린다 — 종이에 라디오 선택지("모르겠어요", "'대지권의 표시'가
     * 있고…")가 전부 나왔다.
     *
     * **문자열 존재 확인으로는 이걸 못 잡는다.** 숨김 규칙은 파일에
     * 멀쩡히 있었고 위의 동기화 검사도 통과했다. 그래서 여기서는 실제
     * 캐스케이드(중요도 → 특정도 → 순서)를 계산해, 각 숨김 규칙이 같은
     * 블록의 어떤 "펼치는" 규칙에도 지지 않는지 확인한다.
     */

    /** `:where(...)`처럼 괄호가 균형 잡힌 함수 표기를 잘라낸다 */
    function cutFunctional(
      selector: string,
      name: string,
      keepInner: boolean,
    ): string {
      let out = "";
      let i = 0;
      while (i < selector.length) {
        const start = selector.indexOf(name, i);
        if (start === -1) {
          out += selector.slice(i);
          break;
        }
        out += selector.slice(i, start);
        let depth = 0;
        let j = start + name.length - 1;
        for (; j < selector.length; j++) {
          if (selector[j] === "(") depth++;
          else if (selector[j] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        if (keepInner) {
          out += ` ${selector.slice(start + name.length, j)} `;
        }
        i = j + 1;
      }
      return out;
    }

    /**
     * 선택자의 특정도 [id, class, type]를 낸다.
     *
     * 완전한 CSS 파서는 아니다 — 이 파일의 `@media print` 블록이 실제로
     * 쓰는 문법(클래스, 타입, `*`, `>`, `:not()`, `:where()`, 의사
     * 요소)만 다룬다. 여기서 다루지 못하는 문법이 들어오면 아래 자기
     * 검사(specificityOf 단위 테스트)가 먼저 어긋난다.
     */
    function specificityOf(selector: string): [number, number, number] {
      // :where()는 특정도에 0을 기여한다 — 통째로 지운다.
      let flat = cutFunctional(selector, ":where(", false);
      // :not()/:is()/:has()는 안쪽에서 가장 큰 것을 그대로 기여한다.
      for (const name of [":not(", ":is(", ":has(", ":matches("]) {
        flat = cutFunctional(flat, name, true);
      }

      const count = (re: RegExp) => (flat.match(re) ?? []).length;
      const ids = count(/#[\w-]+/g);
      const pseudoElements = count(/::[\w-]+/g);
      const withoutPseudoElements = flat.replace(/::[\w-]+/g, " ");
      const classes =
        (withoutPseudoElements.match(/\.[\w-]+/g) ?? []).length +
        (withoutPseudoElements.match(/\[[^\]]*\]/g) ?? []).length +
        (withoutPseudoElements.match(/:[\w-]+/g) ?? []).length;
      const types =
        (withoutPseudoElements
          .replace(/\.[\w-]+/g, " ")
          .replace(/#[\w-]+/g, " ")
          .replace(/\[[^\]]*\]/g, " ")
          .replace(/:[\w-]+/g, " ")
          .match(/[a-zA-Z][\w-]*/g) ?? []).length + pseudoElements;

      return [ids, classes, types];
    }

    function compareSpecificity(
      a: [number, number, number],
      b: [number, number, number],
    ): number {
      for (let i = 0; i < 3; i++) {
        const left = a[i] ?? 0;
        const right = b[i] ?? 0;
        if (left !== right) return left - right;
      }
      return 0;
    }

    interface DisplayDeclaration {
      selector: string;
      value: string;
      important: boolean;
      specificity: [number, number, number];
      order: number;
    }

    /** 블록 안의 모든 `display:` 선언을 선택자 단위로 펼친다 */
    function displayDeclarations(block: string): DisplayDeclaration[] {
      const out: DisplayDeclaration[] = [];
      parseRules(block).forEach((rule, order) => {
        const match = /display\s*:\s*([\w-]+)\s*(!important)?/i.exec(rule.body);
        if (match === null) return;
        for (const selector of rule.selectors) {
          out.push({
            selector,
            value: (match[1] ?? "").toLowerCase(),
            important: match[2] !== undefined,
            specificity: specificityOf(selector),
            order,
          });
        }
      });
      return out;
    }

    /** a가 캐스케이드에서 b를 이기는가(중요도 → 특정도 → 순서) */
    function wins(a: DisplayDeclaration, b: DisplayDeclaration): boolean {
      if (a.important !== b.important) return a.important;
      const bySpecificity = compareSpecificity(a.specificity, b.specificity);
      if (bySpecificity !== 0) return bySpecificity > 0;
      return a.order >= b.order;
    }

    /**
     * 이 숨김 규칙과 같은 요소에 함께 걸릴 수 있는 "펼치는" 규칙인가.
     *
     * 클래스를 하나라도 가진 선택자는 서로 다른 클래스면 같은 요소를
     * 겨눈다고 보지 않는다(그렇게 보면 `.print-summary { display: block }`
     * 같은 무관한 규칙이 전부 위협으로 잡혀 오탐이 된다). 반대로 타입·
     * 전체 선택자처럼 클래스가 없는 규칙은 **아무 요소에나 걸릴 수
     * 있으므로** 언제나 위협으로 본다 — 이번 결함이 정확히 그 모양이었다.
     */
    function couldCollide(hiddenSelector: string, unhide: DisplayDeclaration): boolean {
      const classes = unhide.selector.match(/\.[\w-]+/g);
      if (classes === null) return true;
      return classes.some((cls) => hiddenSelector.includes(cls));
    }

    /** 숨기기로 한 선택자 중, 실제로는 숨겨지지 않는 것들 */
    function notActuallyHidden(
      block: string,
      canonical: readonly string[],
    ): Array<[string, string]> {
      const declarations = displayDeclarations(block);
      const unhides = declarations.filter((d) => d.value !== "none");
      const out: Array<[string, string]> = [];

      for (const selector of canonical) {
        const hide = declarations.find(
          (d) => d.selector === selector && d.value === "none",
        );
        // 숨김 규칙 자체가 없는 경우는 위쪽 동기화 검사가 잡는다.
        if (hide === undefined) continue;
        for (const unhide of unhides) {
          if (!couldCollide(selector, unhide)) continue;
          if (!wins(hide, unhide)) out.push([selector, unhide.selector]);
        }
      }
      return out;
    }

    it("특정도 계산기가 실제로 맞다(전제)", () => {
      expect(specificityOf(".rights-check-form")).toEqual([0, 1, 0]);
      // details(0,0,1) + :not([open])(0,1,0) + *(0,0,0) + :not(summary)(0,0,1)
      expect(specificityOf("details:not([open]) > *:not(summary)")).toEqual([
        0, 1, 2,
      ]);
      expect(
        specificityOf(":where(details:not([open])) > :where(:not(summary))"),
      ).toEqual([0, 0, 0]);
      expect(specificityOf("details")).toEqual([0, 0, 1]);
      expect(specificityOf("details:not([open])::details-content")).toEqual([
        0, 1, 2,
      ]);
    });

    it("숨기기로 한 선택자가 전부 실제로 이긴다", () => {
      expect(
        notActuallyHidden(printBlock ?? "", PRINT_HIDDEN_SELECTORS),
        "display:none 규칙이 있는데도 같은 블록의 다른 규칙에 져서 " +
          "인쇄에서 실제로는 숨겨지지 않는 선택자입니다.",
      ).toEqual([]);
    });

    it("옛 레거시 규칙(특정도 0,1,1 + !important)을 되살리면 잡아낸다(변이 검사)", () => {
      // 이 커밋 직전 styles.css에 실제로 있던 규칙이다. 브라우저에서
      // .rights-check-form의 computed display가 block이었다.
      const poisoned = `
        .profile-form,
        .rights-check-form {
          display: none;
        }
        details:not([open]) > *:not(summary) {
          display: block !important;
        }
      `;
      expect(notActuallyHidden(poisoned, [".rights-check-form", ".profile-form"])).toEqual([
        [".rights-check-form", "details:not([open]) > *:not(summary)"],
        [".profile-form", "details:not([open]) > *:not(summary)"],
      ]);
    });

    it("!important 없이 특정도만 높아도 잡아낸다(변이 검사)", () => {
      const poisoned = `
        .rights-check-form { display: none; }
        details:not([open]) > *:not(summary) { display: block; }
      `;
      expect(notActuallyHidden(poisoned, [".rights-check-form"])).toHaveLength(1);
    });

    it("무관한 클래스 규칙은 위협으로 세지 않는다(오탐 방지 확인)", () => {
      const fine = `
        .rights-check-form { display: none; }
        .print-summary { display: block; }
      `;
      expect(notActuallyHidden(fine, [".rights-check-form"])).toEqual([]);
    });
  });

  describe("<details>는 인쇄 시 내용이 강제로 펼쳐진다(레거시 자식-display 규칙)", () => {
    /**
     * **이 describe 블록의 한계(리뷰 지적, 실측으로 확인):** 아래 검사는
     * "details의, summary가 아닌 자식에 display:none이 아닌 값을 거는
     * 규칙이 CSS 텍스트에 있는가"만 본다. 이 규칙 자체는 Chrome/Chromium
     * 에서 **아무 효과가 없다** — Chromium은 <details>의 열림·닫힘을
     * light DOM 자식의 display가 아니라 내부 `::details-content` 의사
     * 요소 하나의 content-visibility·block-size로 구현한다. MCP
     * 브라우저로 이 미디어 쿼리를 강제 적용해 직접 확인했다: 이 규칙만
     * 있고 아래 "::details-content" 규칙이 없으면 `document.body.innerText`에
     * 부대비용·정책대출 내역이 여전히 나타나지 않는다. 즉 이 테스트는
     * "문자열이 파일에 있는가"는 잠그지만 "브라우저에서 실제로 펼쳐지는가"는
     * 전혀 증명하지 못한다 — 아래 새 describe 블록이 실제로 동작을
     * 바꾸는 선택자(`::details-content`)를 검사한다. 이 블록은 비-Chromium
     * 엔진을 위한 폴백 규칙이 계속 존재하는지만 확인하는 용도로 남긴다.
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

  describe("<details>는 인쇄 시 실제로 펼쳐진다(::details-content 오버라이드)", () => {
    /**
     * 위 블록과 다른 선택자(`::details-content`)를 정확히 겨눈다 — 이게
     * MCP 브라우저로 실측한, Chromium에서 실제로 내용을 펼치는 그
     * 규칙이다(styles.css 해당 규칙의 주석 참고). content-visibility를
     * visible로 뒤집는 선언이 있는지, hidden으로 되돌리는 선언과 함께
     * 있지는 않은지 확인한다.
     *
     * 이 테스트도 여전히 CSS 텍스트 파싱이다 — "그 선택자가 파일에
     * 있는가"는 잠그지만 "브라우저가 그 선택자를 실제로 어떻게 렌더링
     * 하는가"는 증명하지 못한다(jsdom은 ::details-content를 구현하지
     * 않는다). 실제 렌더링 확인은 이 커밋에서 MCP 브라우저로
     * `document.body.innerText`를 읽어 수동으로 실증했다 — 이후 이
     * 규칙을 건드리면 같은 방법으로 다시 확인해야 한다.
     */
    function forcesDetailsContentVisible(block: string): boolean {
      return parseRules(block).some((rule) => {
        const targetsDetailsContentPseudo = rule.selectors.some((s) =>
          /details[^{]*::details-content/.test(s),
        );
        if (!targetsDetailsContentPseudo) return false;
        return (
          /content-visibility\s*:\s*visible\b/i.test(rule.body) &&
          !/content-visibility\s*:\s*hidden\b/i.test(rule.body)
        );
      });
    }

    it("styles.css의 인쇄 블록이 ::details-content를 강제로 편다", () => {
      expect(forcesDetailsContentVisible(printBlock ?? "")).toBe(true);
    });

    it("이 규칙이 없으면 거부한다(회귀 테스트) — 예: 레거시 자식-display 규칙뿐인 블록", () => {
      const legacyOnly = `
        details:not([open]) > *:not(summary) { display: block !important; }
      `;
      expect(forcesDetailsContentVisible(legacyOnly)).toBe(false);
    });

    it("details 아닌 요소의 ::details-content 흉내는 잡지 않는다(오탐 방지 확인)", () => {
      const unrelated = `
        section::details-content { content-visibility: visible; }
      `;
      expect(forcesDetailsContentVisible(unrelated)).toBe(false);
    });

    it("content-visibility를 다시 hidden으로 되돌리는 규칙은 잡지 않는다(오탐 방지 확인)", () => {
      const contradicting = `
        details:not([open])::details-content {
          content-visibility: visible;
          content-visibility: hidden;
        }
      `;
      expect(forcesDetailsContentVisible(contradicting)).toBe(false);
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

  describe("사이드바 스크롤 상자가 인쇄에서 목록을 잘라내지 않는다(오버플로우 클리핑 가드)", () => {
    /**
     * `.region-results-sidebar`는 화면에서 `max-height: 600px` +
     * `overflow-y: auto`인 스크롤 상자다(단지 목록을 지도 옆에서 독립
     * 스크롤시키려고 Task 6에서 추가됨). **CSS 페이지네이션은
     * `overflow: auto`로 갇힌 상자 안의 내용을 여러 쪽으로 나누지
     * 못한다** — 위쪽 "숨기기로 한 것이 실제로 숨겨진다" describe가
     * 잡는 것과 다른 실패 모양이다: `display: none`은 아예 안 걸려
     * 있으니 그 캐스케이드 검사는 통과하지만, 600px를 넘는 목록 행은
     * 스크롤해야 보이던 자리에서 그냥 종이에 나오지 않고 조용히
     * 잘린다. 그 안에는 토지임대부 경고(`land-lease-note`,
     * MUST_SURVIVE_PRINT_CLASSES)처럼 없으면 월 상환액 일부를 전체로
     * 오해하게 만드는 문구도 있다.
     *
     * jsdom은 실제 오버플로우 클리핑을 렌더링해 보여주지 못하므로(다른
     * describe들과 같은 전제), 여기서도 CSS 텍스트에서 선언값을 직접
     * 읽어 구조로 확인한다.
     */

    /** 블록 안에서 정확히 이 선택자만 겨눈 규칙들 중, 그 속성의 마지막
     * 선언값(대소문자 무관, 소스 순서상 나중 규칙이 이긴다는 전제 —
     * 이 파일에서 `.region-results-sidebar`·`.region-results-grid`는
     * 특정도가 같은 단순 클래스 선택자만 쓰므로 이 전제로 충분하다). */
    function lastDeclaredValue(
      block: string,
      selector: string,
      property: string,
    ): string | undefined {
      let found: string | undefined;
      const propRe = new RegExp(`${property}\\s*:\\s*([^;\\n]+)`, "gi");
      for (const rule of parseRules(block)) {
        if (!rule.selectors.includes(selector)) continue;
        propRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = propRe.exec(rule.body)) !== null) {
          found = (m[1] ?? "").trim().toLowerCase();
        }
      }
      return found;
    }

    it("인쇄 블록이 사이드바의 높이 제한과 스크롤을 모두 푼다", () => {
      expect(
        lastDeclaredValue(printBlock ?? "", ".region-results-sidebar", "overflow"),
        ".region-results-sidebar가 @media print 안에서 overflow: visible로 " +
          "풀리지 않았습니다 — 600px를 넘는 목록 행이 종이에서 잘립니다.",
      ).toBe("visible");
      expect(
        lastDeclaredValue(printBlock ?? "", ".region-results-sidebar", "max-height"),
        ".region-results-sidebar가 @media print 안에서 max-height: none으로 " +
          "풀리지 않았습니다 — 600px 제한이 인쇄에도 그대로 남습니다.",
      ).toBe("none");
    });

    it("인쇄 블록이 결과 그리드를 1열로 강제한다(빈 지도 컬럼이 폭 조건 없이 사라지도록)", () => {
      // `display: block`은 `@media (max-width: 768px)` 같은 폭 조건 없이
      // 무조건 1열로 흘린다 — 인쇄 여백을 "없음"으로 두면 인쇄 가능
      // 영역이 768px보다 넓어질 수 있어(Letter/A4), 폭 조건에 기대는
      // 방식으로는 이 경우를 놓친다.
      expect(
        lastDeclaredValue(printBlock ?? "", ".region-results-grid", "display"),
        ".region-results-grid가 @media print 안에서 display: block으로 " +
          "1열 강제되지 않았습니다 — 지워진 지도 컬럼 자리가 빈 채로 " +
          "종이에 남을 수 있습니다.",
      ).toBe("block");
    });

    /**
     * 리뷰 수정(Important 3) — **Task 4가 새로 건 두 제약도 여기서 잠근다.**
     *
     * 전체화면 셸은 화면에서 `position: fixed; inset: 0`이고 상단바는
     * `overflow-x: auto`다. 둘 다 design.md §6이 "인쇄에서 반드시 푼다"고
     * 정한 종류의 제약인데(고정 요소는 첫 장에 한 번만 찍히고 그 안의
     * 내용은 뷰포트 한 화면 분량에서 잘린다 / `overflow`로 갇힌 상자는
     * CSS 페이지네이션이 나누지 못한다), 그 해제를 붙들어 두는 것이
     * 아무것도 없었다 — 유일한 근거가 한 번 돌린 브라우저 실측이었고
     * 그건 CI에서 다시 돌지 않는다. 이 저장소는 Task 3에서 인쇄를 두 번
     * 깼고, 두 번 다 "화면 쪽만 고치고 인쇄 해제를 안 옮긴" 형태였다.
     *
     * `.region-results-sidebar`와 **같은 방식**으로 검사한다(위 두 it과
     * 같은 `lastDeclaredValue`) — 이 셋은 성질이 같은 하나의 계약이다.
     */
    it("인쇄 블록이 전체화면 셸의 고정 배치를 푼다", () => {
      expect(
        lastDeclaredValue(printBlock ?? "", ".result-shell", "position"),
        ".result-shell이 @media print 안에서 position: static으로 풀리지 " +
          "않았습니다 — 고정 레이어는 첫 장에 한 번만 찍히고, 그 안에 든 " +
          "목록·토지임대부 경고·면책이 통째로 종이에서 사라집니다(design.md §6).",
      ).toBe("static");
    });

    it("인쇄 블록이 상단바의 가로 스크롤을 푼다", () => {
      expect(
        lastDeclaredValue(printBlock ?? "", ".result-topbar", "overflow"),
        ".result-topbar가 @media print 안에서 overflow: visible로 풀리지 " +
          "않았습니다 — 종이 폭을 넘는 요약 항목(실구매 가능 가격·지역)이 " +
          "가로 스크롤 상자 안에서 잘립니다(design.md §6).",
      ).toBe("visible");
    });

    // 변이 검사: 이 가드가 실제로 뭔가를 잡아내는지, Task 6이 남긴 실제
    // 결함 형태(화면용 규칙만 있고 인쇄 override가 없는 상태)로 확인한다.
    it("override가 없는 블록은 잡아낸다(변이 검사) — 이 수정 직전 실제 결함 형태", () => {
      const preFix = `
        .region-results-sidebar {
          max-height: 600px;
          overflow-y: auto;
        }
      `;
      expect(lastDeclaredValue(preFix, ".region-results-sidebar", "overflow")).toBeUndefined();
      expect(lastDeclaredValue(preFix, ".region-results-sidebar", "max-height")).toBe(
        "600px",
      );
    });

    // 셸·상단바 쪽도 같은 변이 검사를 건다 — 화면용 규칙만 있는 블록에서는
    // 해제 값이 잡히지 않아야 이 두 단언이 실제로 뭔가를 확인한 것이 된다.
    it("셸·상단바의 인쇄 해제가 없으면 잡아낸다(변이 검사)", () => {
      const screenOnly = `
        .result-shell { position: fixed; inset: 0; display: grid; }
        .result-topbar { display: flex; overflow-x: auto; }
      `;
      expect(lastDeclaredValue(screenOnly, ".result-shell", "position")).toBe("fixed");
      // `overflow-x`는 `overflow`가 아니다 — 해제로 세지 않는다.
      expect(
        lastDeclaredValue(screenOnly, ".result-topbar", "overflow"),
      ).toBeUndefined();
    });
  });

  /**
   * 재검토 수정(Critical 2): **화면 1의 문서 스크롤 잠금이 인쇄에서
   * 풀리지 않았다.**
   *
   * `EntryScreen`은 `phase === "입력"`인 내내 문서 스크롤을 잠근다 —
   * 그런데 그 상태가 바로 앞선 리뷰(Critical 1)가 "인쇄할 수 있어야
   * 한다"고 고친 상태다(그 화면의 인쇄 버튼은 지금 `inert`라 Cmd+P가
   * 유일한 경로다). `<html>`의 `overflow` 기본값이 `visible`이라
   * `<body>`의 `hidden`은 뷰포트로 전파되고, 크롬·파이어폭스에서
   * 인쇄물이 첫 장에서 잘린다.
   *
   * 잠금이 **인라인 스타일**이면 `!important` 없이는 풀 수 없어
   * `@media print`가 손댈 수 없었다. 그래서 클래스로 바꾸고 여기서
   * 그 해제를 구조로 잠근다 — design.md §6의 규칙(`overflow`/
   * `max-height` 제약을 건 요소는 반드시 `@media print`에서 푼다)이
   * 그대로 걸리는 자리다.
   *
   * 앞선 라운드의 실사용 인쇄 확인이 이걸 못 잡은 이유도 남겨 둔다:
   * 그 확인은 `document.body.innerText`를 읽었고(overflow는 거기
   * 영향을 주지 않는다), 잠금이 들어오기 두 커밋 **전에** 돌았다.
   */
  describe("화면 1의 문서 스크롤 잠금이 인쇄에서 풀린다", () => {
    const LOCK = `body.${BODY_SCROLL_LOCK_CLASS}`;
    /**
     * `printBlock`이 `null`일 때 "아무것도 지우지 않는다"는 뜻을 나르는
     * 센티널. CSS에 절대 나타나지 않는 문자다.
     *
     * ⚠ **예전에는 아래 `replace` 인자에 리터럴 NUL 바이트를 적었다.**
     * 그 한 바이트 때문에 `file`이 이 파일을 `data`로 판정하고, 평범한
     * `grep`이 이 파일을 **조용히 건너뛴다**(`grep -a`라야 보인다).
     * 그래서 이번 리뷰에서 리뷰어가 "인쇄 펼침 규칙에 가드가 없다"는
     * 거짓 Critical을 낼 뻔했다 — 가드는 멀쩡히 여기 있었다. 뜻은 그대로
     * 두고 표현만 바꾼다(소스에 NUL 바이트가 들어가지 않는다).
     */
    const NEVER_IN_CSS = String.fromCharCode(0);
    /** `@media print` 블록을 걷어낸 나머지(= 화면용) CSS */
    const outsidePrint = DECLARATIONS.replace(printBlock ?? NEVER_IN_CSS, "");

    /** 그 블록에서 이 선택자에 마지막으로 선언된 `overflow` 값 */
    function overflowFor(block: string, selector: string): string | undefined {
      let found: string | undefined;
      for (const rule of parseRules(block)) {
        if (!rule.selectors.includes(selector)) continue;
        const re = /overflow\s*:\s*([^;\n}]+)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(rule.body)) !== null) {
          found = (m[1] ?? "").trim().toLowerCase();
        }
      }
      return found;
    }

    it("잠금이 클래스로 걸려 있다 — 인라인 스타일이면 이 규칙 자체가 없다", () => {
      expect(
        overflowFor(outsidePrint, LOCK),
        `${LOCK}에 overflow: hidden 규칙이 없습니다. 잠금이 다시 ` +
          "인라인 스타일로 돌아갔다면 @media print가 !important 없이는 " +
          "풀 수 없습니다.",
      ).toBe("hidden");
    });

    it("인쇄 블록이 그 잠금을 푼다", () => {
      // `!important`가 붙어 있으면 값이 "visible !important"로 잡혀
      // 이 단언이 깨진다 — 공용 스타일시트에 !important를 심지 않았다는
      // 것까지 여기서 함께 잠근다.
      expect(
        overflowFor(printBlock ?? "", LOCK),
        `@media print가 ${LOCK}의 스크롤 잠금을 풀지 않습니다 — ` +
          "body의 overflow: hidden이 뷰포트로 전파돼 인쇄물이 첫 장에서 " +
          "잘립니다(design.md §6).",
      ).toBe("visible");
    });

    it("푸는 규칙이 캐스케이드에서 이긴다(특정도가 같으니 순서가 가른다)", () => {
      // 두 규칙의 특정도는 (0,1,1)로 같다. `!important`를 쓰지 않기로
      // 했으므로 인쇄 블록이 화면용 규칙보다 **뒤에** 있어야 이긴다.
      const screenRuleIndex = DECLARATIONS.indexOf(LOCK);
      const printBlockIndex = DECLARATIONS.search(PRINT_MEDIA_START);
      expect(screenRuleIndex).toBeGreaterThan(-1);
      expect(printBlockIndex).toBeGreaterThan(-1);
      expect(
        screenRuleIndex,
        "화면용 잠금 규칙이 @media print 블록보다 뒤에 있습니다 — " +
          "특정도가 같아 나중 규칙이 이기므로 인쇄 해제가 무효가 됩니다.",
      ).toBeLessThan(printBlockIndex);
    });

    it("해제 규칙이 없으면 잡아낸다(변이 검사)", () => {
      const preFix = `body.${BODY_SCROLL_LOCK_CLASS} { overflow: hidden; }`;
      expect(overflowFor(preFix, LOCK)).toBe("hidden");
      expect(overflowFor("", LOCK)).toBeUndefined();
    });
  });

  /**
   * Task 5 — **접히는 예산 상세 패널 × 인쇄.**
   *
   * 패널 안에는 `MUST_SURVIVE_PRINT_CLASSES` 열 개가 들어 있다
   * (`no-budget`, `binding-explainer`, `cost-breakdown`, `policy-loan-list`,
   * `slider-price`, `slider-warning`, `safe-line`, `assumption-line`,
   * `assumption-item`, `assumption-notice`). 패널이 **닫힌 채로** Cmd+P를
   * 누르는 것은 정상 경로다(패널은 기본이 닫힘이고, Cmd+P는 어느 단계에서든
   * 눌린다) — 그때 이 열 개가 종이에서 통째로 사라지면 안 된다.
   *
   * **기존 가드가 잡아 주지 못하는 형태다.** 위 "숨김 목록 동기화"는
   * `@media print` 블록 안만 파싱하므로, 블록 **밖**에 있는
   * `.budget-panel--closed { display: none }`은 조용히 통과한다 —
   * 그런데 미디어 조건이 없는 규칙은 인쇄에도 그대로 적용된다.
   *
   * **고른 해법:** 패널의 화면 전용 규칙(닫힘 숨김 + 오버레이 배치 +
   * 스크롤)을 전부 `@media screen` 블록 안에 둔다. `screen`은 인쇄 미디어와
   * 절대 매치되지 않으므로 그 규칙들이 종이에 닿을 방법 자체가 없다 —
   * "선언하고 인쇄에서 다시 푼다"보다 한 단계 강한 보장이다. 그 위에
   * `@media print`의 해제 규칙을 안전망으로 함께 둔다(둘 중 하나가
   * 무너져도 종이는 살아 있다).
   *
   * 아래 두 describe가 그 둘을 각각 잠근다.
   */
  describe("예산 상세 패널의 화면 전용 제약이 인쇄에 닿지 않는다", () => {
    const screenRange = blockRange(DECLARATIONS, SCREEN_MEDIA_START);

    it("@media screen 블록이 실제로 존재한다(전제)", () => {
      expect(
        screenRange,
        "@media screen 블록이 없습니다 — 아래 검사들이 공허하게 통과합니다.",
      ).not.toBeNull();
    });

    it("닫힌 패널을 숨기는 규칙이 그 블록 안에 있다", () => {
      const [start, end] = screenRange ?? [0, 0];
      const screenBody = DECLARATIONS.slice(start, end);
      expect(hiddenSelectorsIn(screenBody)).toContain(".budget-panel--closed");
    });

    it("패널을 숨기거나 가두는 규칙이 @media screen 밖에는 하나도 없다", () => {
      const [start, end] = screenRange ?? [0, 0];
      const offenders = confiningRuleIndexes(DECLARATIONS, ".budget-panel")
        .filter((index) => index < start || index >= end)
        // `@media print` 안의 **해제** 규칙은 위 필터에 걸리지 않는다
        // (position: static / overflow: visible은 가두는 값이 아니다).
        .map((index) => DECLARATIONS.slice(index, index + 120));
      expect(
        offenders,
        "`.budget-panel`을 숨기거나(display:none 등) 상자에 가두는" +
          "(position:fixed/absolute, overflow:auto 등) 규칙이 @media screen " +
          "밖에 있습니다 — 그 제약은 인쇄에도 그대로 적용돼, 패널을 닫은 채 " +
          "인쇄한 종이에서 보호 대상 열 개가 통째로 사라집니다.",
      ).toEqual([]);
    });

    // 변이 검사: 이 가드가 실제로 뭔가를 잡아내는지, 정확히 dispatch가
    // 경고한 형태(미디어 조건 없이 닫힌 패널을 숨기는 규칙)로 확인한다.
    it("미디어 조건 없는 숨김 규칙을 심으면 잡아낸다(변이 검사)", () => {
      const poisoned = `
        .budget-panel--closed { display: none; }
        @media screen { .budget-panel { position: absolute; } }
      `;
      const range = blockRange(poisoned, SCREEN_MEDIA_START)!;
      const outside = confiningRuleIndexes(poisoned, ".budget-panel").filter(
        (index) => index < range[0] || index >= range[1],
      );
      expect(outside).toHaveLength(1);
    });

    it("@media screen 안에만 있으면 통과한다(오탐 방지 확인)", () => {
      const fine = `
        @media screen {
          .budget-panel { position: absolute; overflow-y: auto; }
          .budget-panel--closed { display: none; }
        }
      `;
      const range = blockRange(fine, SCREEN_MEDIA_START)!;
      const outside = confiningRuleIndexes(fine, ".budget-panel").filter(
        (index) => index < range[0] || index >= range[1],
      );
      expect(outside).toEqual([]);
    });
  });

  describe("예산 상세 패널의 인쇄 해제(안전망)", () => {
    /** 위 describe의 lastDeclaredValue와 같은 접근 — 선택자 단위 마지막 값 */
    function lastValue(
      block: string,
      selector: string,
      property: string,
    ): string | undefined {
      let found: string | undefined;
      const propRe = new RegExp(`${property}\\s*:\\s*([^;\\n]+)`, "gi");
      for (const rule of parseRules(block)) {
        if (!rule.selectors.includes(selector)) continue;
        propRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = propRe.exec(rule.body)) !== null) {
          found = (m[1] ?? "").trim().toLowerCase();
        }
      }
      return found;
    }

    it("인쇄 블록이 패널의 배치·스크롤·높이를 모두 푼다", () => {
      const block = printBlock ?? "";
      expect(lastValue(block, ".budget-panel", "position")).toBe("static");
      expect(lastValue(block, ".budget-panel", "overflow")).toBe("visible");
      expect(lastValue(block, ".budget-panel", "max-height")).toBe("none");
      expect(
        lastValue(block, ".budget-panel", "display"),
        ".budget-panel이 인쇄에서 display: block으로 되살아나지 않습니다 — " +
          "닫힘 숨김 규칙이 언젠가 @media screen 밖으로 나가면 이 한 줄이 " +
          "마지막 안전망입니다.",
      ).toBe("block");
    });

    it("해제가 없는 블록은 잡아낸다(변이 검사)", () => {
      const screenOnly = `.budget-panel { position: absolute; overflow-y: auto; }`;
      expect(lastValue(screenOnly, ".budget-panel", "position")).toBe("absolute");
      expect(lastValue(screenOnly, ".budget-panel", "overflow")).toBeUndefined();
    });
  });

  /**
   * **접히는 단지 상세 블록 × 인쇄**(design.md §6).
   *
   * 단지 상세는 `PriceCheck`·`LocationFacts`·금리 상승 시나리오를
   * `<details class="detail-fold">`(기본 **닫힘**)로 접는다. 그 안에는
   * `MUST_SURVIVE_PRINT_CLASSES`가 열 개 넘게 들어 있다
   * (`price-no-estimate`·`price-disclosure`·`price-disclaimer`·
   * `price-verdict`·`location-state`·`location-state-note`·
   * `location-disclosure`·`location-disclaimer` 등). 닫힌 채로 Cmd+P를
   * 누르는 것은 **정상 경로**다 — 기본이 닫힘이고 Cmd+P는 어느
   * 단계에서든 눌린다.
   *
   * `.budget-panel`이 이미 한 번 막은 사고와 정확히 같은 모양이라
   * **같은 해법·같은 검사**를 쓴다.
   *
   * 1. 내용을 실제로 펼치는 것은 이 파일 위쪽의 두 describe가 이미
   *    잠근 `@media print`의 `details:not([open])::details-content`
   *    규칙이다. 그 규칙은 `details` 요소 전부에 걸리므로, 상세가 진짜
   *    `<details>`를 쓰는 한(그 형태는 `ComplexDetail.test.tsx`가
   *    잠근다) 새 접기에도 그대로 걸린다.
   * 2. 남는 위험은 **누군가 이 접기에 상자를 씌우는 것**이다
   *    (`overflow: auto`로 스크롤을 주거나 `max-height: 0`으로 접거나
   *    `display: none`으로 숨기거나). 미디어 조건 없이 걸면 그 제약이
   *    인쇄에도 그대로 적용돼, 위 1이 펼쳐 놓은 내용이 상자 밖에서
   *    잘린다. 그래서 지금은 그런 규칙을 **하나도 두지 않았고**,
   *    앞으로 두게 되면 반드시 `@media screen` 안이어야 한다.
   */
  describe("접히는 단지 상세 블록의 제약이 인쇄에 닿지 않는다", () => {
    const screenRange = blockRange(DECLARATIONS, SCREEN_MEDIA_START);

    it("`.detail-fold` 규칙이 실제로 존재한다(전제)", () => {
      // 없으면 아래 검사가 공허하게 통과한다.
      expect(
        DECLARATIONS,
        ".detail-fold 규칙이 styles.css에 없습니다 — 아래 검사의 전제가 " +
          "깨졌습니다(클래스 이름을 바꿨다면 이 검사도 함께 옮기세요).",
      ).toContain(".detail-fold");
    });

    it("접기를 숨기거나 가두는 규칙이 @media screen 밖에는 하나도 없다", () => {
      const [start, end] = screenRange ?? [0, 0];
      const offenders = confiningRuleIndexes(DECLARATIONS, ".detail-fold")
        .filter((index) => index < start || index >= end)
        .map((index) => DECLARATIONS.slice(index, index + 120));
      expect(
        offenders,
        "`.detail-fold`를 숨기거나(display:none 등) 상자에 가두는" +
          "(position:fixed/absolute, overflow:auto, max-height:0 등) 규칙이 " +
          "@media screen 밖에 있습니다 — 그 제약은 인쇄에도 그대로 적용돼, " +
          "접힌 채 인쇄한 종이에서 호가·입지 고지가 잘립니다.",
      ).toEqual([]);
    });

    // 변이 검사: 이 가드가 실제로 뭔가를 잡아내는지, 가장 흔한 형태
    // (스크롤 상자를 씌우는 것)로 확인한다.
    it("미디어 조건 없이 상자를 씌우면 잡아낸다(변이 검사)", () => {
      const poisoned = `
        .detail-fold { max-height: 12rem; overflow-y: auto; }
        @media screen { .detail-fold { border-top: 1px solid; } }
      `;
      const range = blockRange(poisoned, SCREEN_MEDIA_START)!;
      const outside = confiningRuleIndexes(poisoned, ".detail-fold").filter(
        (index) => index < range[0] || index >= range[1],
      );
      expect(outside).toHaveLength(1);
    });

    it("가두지 않는 규칙은 밖에 있어도 통과한다(오탐 방지 확인)", () => {
      const fine = `.detail-fold { margin: 1.25rem 0 0; border-top: 1px solid; }`;
      expect(confiningRuleIndexes(fine, ".detail-fold")).toEqual([]);
    });
  });

  /**
   * **부대비용 내역의 아이콘 트리거 × 인쇄**(사용자 지시 ③).
   *
   * 그 트리거는 `<summary class="fold-more-hint cost-breakdown-toggle">`
   * 하나다 — 인쇄에서 `<details>`가 강제로 펼쳐지면 트리거는 죽은
   * 장치가 되므로(종이에서는 누를 수 없다) `.fold-more-hint`가 지운다.
   *
   * ⚠ **두 클래스가 같은 요소에 함께 붙어 있고 특정도가 (0,1,0)으로
   * 같다.** 화면 쪽 `.cost-breakdown-toggle { display: flex }`와 인쇄
   * 쪽 `.fold-more-hint { display: none }`이 그대로 부딪히므로, 순서가
   * 승패를 가른다 — 인쇄 규칙이 **뒤에** 와야 `!important` 없이 이긴다.
   * `body.body-scroll-locked`가 같은 이유로 이미 순서를 잠그고 있고,
   * 여기도 같은 함정이다: 누가 이 규칙을 파일 아래쪽으로 옮기면
   * 종이에 뜻 없는 화살표 버튼이 찍힌다.
   */
  describe("내역 아이콘 트리거가 인쇄에서 실제로 지워진다", () => {
    const TOGGLE = ".cost-breakdown-toggle";

    it("트리거가 화면에서 display를 다시 선언한다(전제)", () => {
      // 이 선언이 없으면 아래 순서 검사는 아무 의미가 없다.
      const screenRule = new RegExp(
        `\\${TOGGLE}\\s*{[^}]*display\\s*:`,
      );
      expect(DECLARATIONS).toMatch(screenRule);
    });

    it("그 선언이 @media print 블록보다 앞에 있다 — 특정도가 같아 순서가 가른다", () => {
      const screenRuleIndex = DECLARATIONS.indexOf(`${TOGGLE} {`);
      const printBlockIndex = DECLARATIONS.search(PRINT_MEDIA_START);
      expect(screenRuleIndex).toBeGreaterThan(-1);
      expect(printBlockIndex).toBeGreaterThan(-1);
      expect(
        screenRuleIndex,
        `${TOGGLE}의 display 규칙이 @media print 블록보다 뒤에 있습니다 — ` +
          ".fold-more-hint(display:none)와 특정도가 같아 나중 규칙이 " +
          "이기므로, 종이에 누를 수 없는 아이콘 버튼이 그대로 찍힙니다.",
      ).toBeLessThan(printBlockIndex);
    });

    it(".fold-more-hint가 여전히 인쇄 숨김 목록에 있다", () => {
      // 트리거가 기대는 유일한 장치다. 목록에서 빠지면 위 순서를
      // 지켜도 아무것도 지워지지 않는다.
      expect(PRINT_HIDDEN_SELECTORS).toContain(".fold-more-hint");
    });
  });
});
