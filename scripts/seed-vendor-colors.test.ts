import { readFileSync } from "node:fs";
import { fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import {
  BODY_TEXT_MIN_RATIO,
  SCRIM_FLOOR,
  STYLES_CSS,
  contrastRatio,
  resolveColor,
  stripComments,
} from "./colorSurfaces";

/**
 * ══════════════════════════════════════════════════════════════════
 * SEED 벤더 CSS가 어두운 입력 화면에서 밝은 면 글자색을 다시 못박는 것을
 * 막는다
 * ══════════════════════════════════════════════════════════════════
 *
 * **왜 이 파일이 생겼는가.** 영상 배경 입력 화면(`.entry-screen`)의
 * 체크박스 라벨 두 개가 실측 대비 **1.13:1**(필요 4.5:1)로 사실상 보이지
 * 않은 채 나갔다. 리뷰 사슬 전체가 놓쳤고, 같은 웨이브에서 새로 만든
 * `scripts/seed-semantic-tokens.test.ts`의 "텍스트 색 사용처 전수 검사"도
 * 놓쳤다.
 *
 * 이유는 그 검사가 **우리 `src/styles.css`만 훑기** 때문이다. 문제의
 * 색은 우리 CSS 어디에도 없다:
 *
 * ```css
 * /* node_modules/@seed-design/css/all.css *\/
 * .seed-checkbox__label { color: var(--seed-color-fg-neutral); }
 * ```
 *
 * `--seed-color-fg-neutral`은 이 저장소가 `--on-sheet`(#15202b, **밝은
 * 표면용**)로 다시 가리킨 토큰이다. `.entry-screen`이 `color: var(--paper)`
 * 로 어두운 면 글자색을 깔아도, SEED 자기 CSS가 자식 요소에 그 토큰을
 * **다시 못박아** 이긴다 — `src/seed-brand.css` 머리주석이 이미 이름 붙인
 * 명시도 함정과 같은 계열이되, 이번에는 우리 CSS끼리가 아니라 벤더 CSS가
 * 우리 어두운 면 위에서 이기는 형태다.
 *
 * 같은 웨이브에서 `.seed-field__description` **한 컴포넌트만** 고치고
 * 같은 형태의 나머지를 훑지 않은 것이 이 사고의 직접 원인이다. 그래서
 * 이 파일은 값 하나가 아니라 **형태 전체**를 잠근다.
 *
 * **어떻게 잠그는가**(`scripts/printCss.test.ts`가 `PRINT_HIDDEN_SELECTORS`
 * ↔ `@media print`를 양방향으로 잠그는 것과 같은 계열):
 *
 * 1. 화면 1에 **실제로 렌더되는** SEED 클래스 집합을 jsdom 렌더에서
 *    유도한다({@link RENDERED_SEED_CLASSES}).
 * 2. `node_modules/@seed-design/css/all.css`에서 `color: var(--seed-color-fg-…)`
 *    를 거는 규칙을 전부 모으고, 그중 위 집합 안에서만 성립하는 규칙을
 *    남긴다({@link VENDOR_COLOR_RULES}).
 * 3. 각 규칙에 대해 `src/styles.css`에 `.entry-screen`으로 스코프되고
 *    **그 SEED 클래스 이름을 직접 적은** override가 있는지, 그 override가
 *    벤더 규칙보다 **명시도가 높은지**, 그리고 그 색이 화면 1의 면
 *    (`SCRIM_FLOOR`) 대비 4.5:1을 넘는지 검사한다.
 * 4. 반대 방향도 잠근다 — `.entry-screen` override가 이름을 적은 SEED
 *    클래스는 실제로 화면 1에 렌더돼야 하고, 실제로 벤더가 색을 거는
 *    자리여야 한다. 아무것도 지키지 않는 override가 남지 않게 한다
 *    (`task-1-report.md`의 `land-lease.test.ts` 사고와 같은 계열).
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * 벤더 CSS를 직접 읽는 빌드 타임 검사이기 때문이다
 * (`scripts/printCss.test.ts`의 같은 주석 참고).
 */

const VENDOR_CSS = readFileSync(
  "node_modules/@seed-design/css/all.css",
  "utf8",
);

/*
 * ══════════════════════════════════════════════════════════════════
 * 1. 화면 1에 실제로 렌더되는 SEED 클래스 — 손 목록이 아니라 유도한다
 * ══════════════════════════════════════════════════════════════════
 */

/**
 * `.entry-screen` 안에 실제로 나타나는 SEED 클래스 전부.
 *
 * **손으로 적지 않는다.** 컨트롤러가 브라우저에서 수집한 목록이 있었지만
 * 그것은 **그 순간 화면에 떠 있던 상태**만 본 것이라, 오류·선택 같은
 * 상태에서만 나타나는 클래스(`seed-field__errorMessage`,
 * `seed-checkmark__icon--*`)가 통째로 빠져 있었다. 손 목록을 상수로
 * 두면 그 구멍이 그대로 굳는다.
 *
 * 대신 **App을 그대로 렌더해** `.entry-screen` 아래의 클래스를 모은다.
 * 새 SEED 컴포넌트를 이 화면에 넣는 사람은 아무것도 하지 않아도 그
 * 컴포넌트가 이 검사에 들어온다.
 *
 * 한 번의 렌더로 못 보는 자리는 하나 남았다:
 *
 * - **오류 상태**: `#cash`에 숫자로 읽을 수 없는 값을 넣어
 *   `MoneyInput`의 `errorMessage` 슬롯을 띄운다.
 *
 * 예전에는 조건부 필드(규제지역 체크박스·부채 입력·전용면적 입력)와
 * 선택 상태(체크된 체크박스의 체크마크 아이콘)를 띄우려고 `ProfileForm`을
 * 따로 한 번 더 렌더했다. 화면 1이 네 질문으로 줄면서 그 입력란들이 전부
 * 사라졌고, **SEED 체크박스도 화면 1에서 함께 사라졌다**(평형대 칩은
 * 네이티브 `<input type="checkbox">`다 — `AreaBandSelect.tsx`). 조건부로
 * 더 그릴 것이 없으므로 App 한 번의 렌더가 곧 모집합이다.
 */
const RENDERED_SEED_CLASSES: ReadonlySet<string> = (() => {
  const classes = new Set<string>();
  const collect = (root: Element) => {
    for (const el of root.querySelectorAll("*")) {
      for (const cls of el.classList) {
        if (cls.startsWith("seed-")) classes.add(cls);
      }
    }
  };

  const app = render(createElement(App));
  const entry = app.container.querySelector(".entry-screen");
  if (entry === null) {
    throw new Error(
      "App 렌더에 .entry-screen이 없다 — 이 검사의 모집합이 통째로 비어 공허하게 통과한다",
    );
  }
  collect(entry);

  const cash = entry.querySelector("#cash");
  if (cash === null) {
    throw new Error("화면 1에 #cash 입력란이 없다 — 오류 상태를 띄울 수 없다");
  }
  fireEvent.change(cash, { target: { value: "숫자아님" } });
  collect(entry);
  app.unmount();

  return classes;
})();

/**
 * 컨트롤러가 **실제 브라우저**(포트 4173)에서 `.entry-screen` 안을 훑어
 * 수집한 클래스 목록. 위 jsdom 유도가 현실보다 작은 집합을 돌려주면
 * (예: 렌더가 조용히 실패해 빈 화면이 되면) 여기서 먼저 깨진다.
 *
 * **이 목록을 늘리지 마라.** 이것은 모집합이 아니라 하한선이다 — 모집합은
 * {@link RENDERED_SEED_CLASSES}가 유도한다.
 */
const BROWSER_OBSERVED_CLASSES = [
  // 체크박스 셋(`seed-checkbox__root`·`seed-checkbox__label`·
  // `seed-checkmark__root`)은 빠졌다. 화면 1이 네 질문으로 줄면서
  // 생애최초·규제지역 체크박스가 사라졌고, 새로 생긴 평형대 칩은
  // SEED가 아니라 네이티브 `<input type="checkbox">`다
  // (`AreaBandSelect.tsx`) — 이 화면에 SEED 체크박스가 더 이상 없다.
  "seed-field__root",
  "seed-field__header",
  "seed-field__footer",
  "seed-field__description",
  "seed-field-label__root",
  "seed-text-input__root",
  "seed-text-input__value",
];

/*
 * ══════════════════════════════════════════════════════════════════
 * 2. 명시도 계산 — override가 벤더 규칙을 실제로 이기는지 본다
 * ══════════════════════════════════════════════════════════════════
 */

export type Specificity = [number, number, number];

/**
 * CSS 명시도 (id, class·attr·pseudo-class, element·pseudo-element).
 *
 * `:is()`/`:not()`은 인자 중 가장 높은 명시도를 가져오고, `:where()`는
 * 0을 기여한다(CSS Selectors Level 4). 이 프로젝트의 override와 SEED가
 * 실제로 쓰는 선택자를 다루기에 충분한 범위이고, 다루지 못하는 형태가
 * 들어오면 아래 "파서 전제" 테스트가 먼저 깨진다.
 */
export function specificity(selector: string): Specificity {
  let rest = "";
  const total: Specificity = [0, 0, 0];
  let i = 0;

  while (i < selector.length) {
    const fn = /:(is|not|matches|any|where|has)\(/gi;
    fn.lastIndex = i;
    const m = fn.exec(selector);
    if (m === null) {
      rest += selector.slice(i);
      break;
    }
    rest += selector.slice(i, m.index);

    // 괄호 짝을 세어 인자를 정확히 잘라낸다.
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < selector.length; end++) {
      if (selector[end] === "(") depth++;
      else if (selector[end] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const args = selector.slice(m.index + m[0].length, end);
    if (m[1]!.toLowerCase() !== "where") {
      let best: Specificity = [0, 0, 0];
      for (const arg of splitTopLevel(args)) {
        const s = specificity(arg);
        if (compareSpecificity(s, best) > 0) best = s;
      }
      total[0] += best[0];
      total[1] += best[1];
      total[2] += best[2];
    }
    i = end + 1;
  }

  // 남은 평범한 부분을 센다. **순서가 중요하다** — 먼저 걷어낸 것이 뒤
  // 정규식에 두 번 세어지지 않게 한다. 속성 선택자를 가장 먼저 걷는
  // 이유는 그 값 안에 `.`·`#`이 들어갈 수 있기 때문이다.
  let plain = rest;
  const count = (re: RegExp) => {
    const n = (plain.match(re) ?? []).length;
    plain = plain.replace(re, " ");
    return n;
  };
  total[1] += count(/\[[^\]]*\]/g); // 속성
  total[2] += count(/::[\w-]+/g); // 가상 요소
  total[0] += count(/#[\w-]+/g); // id
  total[1] += count(/\.[\w-]+/g); // 클래스
  total[1] += count(/:[\w-]+/g); // 가상 클래스
  total[2] += (plain.match(/(?:^|[\s>+~,])\s*[a-zA-Z][\w-]*/g) ?? []).length;

  return total;
}

/** 최상위(괄호·대괄호 밖) 쉼표로 자른다. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * 선택자의 **주어**(마지막 compound). 결합자(공백·`>`·`+`·`~`)를 최상위
 * 에서만 본다 — `:not(.a .b)` 안의 공백은 결합자가 아니다.
 */
function subjectCompound(selector: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && (ch === " " || ch === ">" || ch === "+" || ch === "~")) {
      start = i + 1;
    }
  }
  return selector.slice(start);
}

function compareSpecificity(a: Specificity, b: Specificity): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

const showSpecificity = (s: Specificity) => `(${s.join(",")})`;

/*
 * ══════════════════════════════════════════════════════════════════
 * 3. 벤더 CSS에서 "밝은 면 글자색을 거는 규칙"을 모은다
 * ══════════════════════════════════════════════════════════════════
 */

interface ColorRule {
  /** 쉼표로 나뉜 개별 선택자 하나 */
  selector: string;
  /** `color:` 선언의 원문 값 */
  color: string;
  /** 선택자의 마지막 compound(주어)에 걸린 클래스들 */
  subjectClasses: string[];
  /** 주어에 붙은 가상 요소(`::placeholder` 등). 없으면 "" */
  pseudoElement: string;
  specificity: Specificity;
}

/** `{ ... }` 규칙을 선택자별로 평평하게 편다. `@media` 조건은 무시한다. */
function colorRules(css: string): ColorRule[] {
  const flat = stripComments(css).replace(/@media[^{]*\{/g, "");
  const rules: ColorRule[] = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const color = m[2]!.match(/(?:^|[;\s])color:\s*([^;]+)/);
    if (color === null) continue;
    for (const selector of splitTopLevel(m[1]!.replace(/\s+/g, " ").trim())) {
      const subject = subjectCompound(selector);
      const pseudo = subject.match(/::[\w-]+/);
      rules.push({
        selector,
        color: color[1]!.trim(),
        subjectClasses: [...subject.matchAll(/\.([\w-]+)/g)].map((c) => c[1]!),
        pseudoElement: pseudo === null ? "" : pseudo[0],
        specificity: specificity(selector),
      });
    }
  }
  return rules;
}

/**
 * 비활성 상태는 WCAG 1.4.3의 명시적 예외다("inactive user interface
 * component"). 예외를 **선택자 패턴**으로 두는 이유는, 새 규칙이 이
 * 예외에 올라타려면 실제로 비활성 셀렉터를 달아야 하기 때문이다.
 */
const isDisabledState = (selector: string) =>
  /:disabled|\[disabled\]|\[data-disabled\]/.test(selector);

/**
 * SEED가 화면 1의 요소에 거는 밝은 면 글자색 규칙.
 *
 * 걸러내는 조건:
 * - `color: var(--seed-color-fg-…)`를 건다. 이 `fg-*` 계열이 바로 이
 *   저장소가 밝은 면(`--on-sheet` 등)으로 다시 가리킨 토큰들이다.
 *   `currentColor`(상속이라 정의상 안전하다)와 `palette-static-white`
 *   (브랜드색으로 칠한 체크마크 위의 아이콘 — 면과 무관하게 고정)는
 *   여기서 빠진다.
 * - 선택자에 나오는 클래스가 **전부** 화면 1에 실제로 렌더된다.
 * - 비활성 상태가 아니다.
 */
const VENDOR_COLOR_RULES = colorRules(VENDOR_CSS).filter((rule) => {
  if (!/^var\(--seed-color-fg-[\w-]+\)$/.test(rule.color)) return false;
  if (isDisabledState(rule.selector)) return false;
  const classes = [...rule.selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
  return classes.length > 0 && classes.every((c) => RENDERED_SEED_CLASSES.has(c));
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 4. 우리 쪽 override — `.entry-screen`으로 스코프된 SEED 클래스 색 규칙
 * ══════════════════════════════════════════════════════════════════
 */

/** 벤더 규칙과 override를 짝짓는 열쇠: 주어 클래스 + 가상 요소. */
const keyOf = (classes: readonly string[], pseudoElement: string) =>
  `${[...classes].sort().join(".")}${pseudoElement}`;

interface Override extends ColorRule {
  /** hex로 푼 색. 못 풀면 null */
  hex: string | null;
}

/** override 선택자의 주어에 걸린 SEED 클래스들. */
const seedClassesOf = (rule: ColorRule) =>
  rule.subjectClasses.filter((c) => c.startsWith("seed-"));

/**
 * `.entry-screen`으로 스코프되고 **주어가 SEED 클래스인** 색 규칙.
 *
 * 주어를 보는 것이 중요하다 — `.entry-screen .seed-field__root p`처럼
 * SEED 클래스를 조상으로만 쓰는 규칙은 벤더 규칙과 짝지을 대상이 아니다
 * (그런 규칙의 대비는 `scripts/seed-semantic-tokens.test.ts`의 전수
 * 검사가 이미 본다).
 */
const ENTRY_OVERRIDES: Override[] = colorRules(STYLES_CSS)
  .filter(
    (rule) =>
      rule.selector.startsWith(".entry-screen") && seedClassesOf(rule).length > 0,
  )
  .map((rule) => ({ ...rule, hex: resolveColor(rule.color) }));

/**
 * 벤더 규칙을 **실제로 이기는** override를 찾는다.
 *
 * 명시도가 **엄격히 높아야** 한다. 같으면 소스 순서가 이기는데, SEED의
 * 컴포넌트 CSS는 각 컴포넌트 모듈이 자기 CSS를 import해 들어오므로
 * `src/styles.css`보다 뒤에 놓일 수 있다 — 순서에 기대는 override는
 * 번들러 설정이 바뀌는 날 조용히 진다.
 */
function winningOverride(
  vendor: ColorRule,
  overrides: readonly Override[] = ENTRY_OVERRIDES,
): Override | undefined {
  const wanted = keyOf(vendor.subjectClasses, vendor.pseudoElement);
  return overrides.find(
    (o) =>
      keyOf(seedClassesOf(o), o.pseudoElement) === wanted &&
      compareSpecificity(o.specificity, vendor.specificity) > 0,
  );
}

/*
 * ══════════════════════════════════════════════════════════════════
 * 검사
 * ══════════════════════════════════════════════════════════════════
 */

describe("화면 1에 렌더되는 SEED 클래스 유도", () => {
  it("브라우저에서 실측한 클래스를 전부 포함한다", () => {
    const missing = BROWSER_OBSERVED_CLASSES.filter(
      (c) => !RENDERED_SEED_CLASSES.has(c),
    );
    expect(
      missing,
      "jsdom 렌더가 실제 브라우저보다 작은 집합을 돌려줬다 — 아래 검사의 " +
        "모집합이 조용히 좁아진 상태다.",
    ).toEqual([]);
  });

  it("상태에서만 나타나는 클래스까지 잡는다", () => {
    // 컨트롤러의 브라우저 실측이 놓친 자리. 이것이 빠지면 오류 상태가
    // 검사 밖으로 나간다. (선택 상태의 체크마크 아이콘은 화면 1에서
    // SEED 체크박스가 사라지면서 함께 없어졌다 — 평형대 칩은 네이티브
    // 체크박스라 SEED 클래스를 하나도 그리지 않는다.)
    expect(RENDERED_SEED_CLASSES.has("seed-field__errorMessage")).toBe(true);
  });
});

describe("명시도 계산기 (파서 전제)", () => {
  it.each([
    [".a", [0, 1, 0]],
    ["p", [0, 0, 1]],
    ["#x", [1, 0, 0]],
    [".entry-screen .seed-field-label__root", [0, 2, 0]],
    [".a::placeholder", [0, 1, 1]],
    [".a[data-readonly]", [0, 2, 0]],
    [".a:hover", [0, 2, 0]],
    [".a:is(:disabled, [disabled])", [0, 2, 0]],
    [".a:not(.b .c)", [0, 3, 0]],
    [".a:where(.b)", [0, 1, 0]],
    [".entry-screen .money-input input::placeholder", [0, 2, 2]],
  ])("%s → %j", (selector, expected) => {
    expect(specificity(selector as string)).toEqual(expected);
  });
});

describe("SEED 벤더 CSS 훑기 (파서 전제)", () => {
  it("훑을 규칙을 실제로 찾았다 — 파서가 빈손으로 통과하지 않는다", () => {
    expect(VENDOR_COLOR_RULES.length).toBeGreaterThan(0);
    /*
     * 이 사고를 낸 바로 그 규칙(`.seed-checkbox__label`)은 화면 1에서
     * SEED 체크박스가 사라지면서 모집합에서 함께 빠졌다 — 그 자리가
     * 없어졌으니 지킬 것도 없다. 대신 **지금 이 화면에 실제로 있는**
     * 같은 형태의 규칙 하나를 못박는다: `MoneyInput`의 라벨이다. 이
     * 검사의 내용은 특정 클래스가 아니라 "파서가 빈손으로 통과하지
     * 않는다"이므로, 살아 있는 자리를 짚어야 뜻이 선다.
     */
    expect(
      VENDOR_COLOR_RULES.some((r) => r.selector === ".seed-field-label__root"),
    ).toBe(true);
  });

  it("모든 대상 규칙의 주어가 SEED 클래스다", () => {
    const odd = VENDOR_COLOR_RULES.filter(
      (r) => r.subjectClasses.filter((c) => c.startsWith("seed-")).length === 0,
    ).map((r) => r.selector);
    expect(
      odd,
      "주어에 SEED 클래스가 없는 규칙이다 — 이 파일의 짝짓기 전제(주어 " +
        "클래스로 override를 찾는다)가 더 이상 성립하지 않는다.",
    ).toEqual([]);
  });
});

describe("어두운 입력 화면에서 SEED 벤더 색을 전부 덮는다", () => {
  it("덮이지 않은 벤더 규칙이 없다", () => {
    const uncovered = VENDOR_COLOR_RULES.filter(
      (v) => winningOverride(v) === undefined,
    ).map(
      (v) =>
        `${v.selector} ${showSpecificity(v.specificity)} { color: ${v.color} } ` +
        `→ .entry-screen 스코프 override 없음`,
    );
    expect(
      uncovered,
      "SEED 벤더 CSS가 화면 1(어두운 면)의 요소에 밝은 면 글자색을 다시 " +
        "못박고 있는데, src/styles.css에 그것을 이기는 `.entry-screen` " +
        "override가 없습니다. 그 SEED 클래스 이름을 직접 적은 override를 " +
        "추가하세요 — 요소 이름(예: `label`)에 기대면 SEED가 태그를 바꾸는 " +
        "날 조용히 무너집니다.",
    ).toEqual([]);
  });

  it("override 색이 전부 hex로 풀린다", () => {
    const unresolvable = ENTRY_OVERRIDES.filter((o) => o.hex === null).map(
      (o) => `${o.selector} { color: ${o.color} }`,
    );
    expect(unresolvable).toEqual([]);
  });

  it("override 색이 화면 1의 면 대비 4.5:1을 넘는다", () => {
    const failures: string[] = [];
    for (const o of ENTRY_OVERRIDES) {
      if (o.hex === null) continue; // 위 테스트가 따로 잡는다
      const ratio = contrastRatio(o.hex, SCRIM_FLOOR);
      if (ratio < BODY_TEXT_MIN_RATIO) {
        failures.push(
          `${ratio.toFixed(2)}:1  ${o.selector} { color: ${o.color} → ${o.hex} } on ${SCRIM_FLOOR}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("반대 방향 — override가 아무것도 지키지 않는 채로 남지 않는다", () => {
  const overriddenSeedClasses = ENTRY_OVERRIDES.flatMap((o) =>
    o.subjectClasses.filter((c) => c.startsWith("seed-")),
  );

  it("override가 이름을 적은 SEED 클래스가 실제로 화면 1에 렌더된다", () => {
    const stale = overriddenSeedClasses.filter(
      (c) => !RENDERED_SEED_CLASSES.has(c),
    );
    expect(
      stale,
      "화면 1에 더 이상 나타나지 않는 SEED 클래스를 덮고 있습니다. 그 " +
        "컴포넌트가 화면에서 빠졌다면 override도 함께 지우세요.",
    ).toEqual([]);
  });

  it("override마다 실제로 덮는 벤더 규칙이 있다", () => {
    const vendorKeys = new Set(
      VENDOR_COLOR_RULES.map((v) => keyOf(v.subjectClasses, v.pseudoElement)),
    );
    const pointless = ENTRY_OVERRIDES.filter(
      (o) => !vendorKeys.has(keyOf(seedClassesOf(o), o.pseudoElement)),
    ).map((o) => o.selector);
    expect(
      pointless,
      "SEED가 이 클래스에 `--seed-color-fg-*` 색을 걸지 않는데 덮고 " +
        "있습니다 — SEED를 올리며 규칙이 사라졌다면 이 override도 " +
        "지우세요. 값이 아니라 이 짝이 이 검사의 내용입니다.",
    ).toEqual([]);
  });
});

/**
 * 변이 검사 — 이 가드가 실제로 무는지 증명한다.
 *
 * 이 저장소는 "가드를 달았지만 아무것도 지키지 않는" 사고를 이미 겪었다
 * (`task-1-report.md`의 `land-lease.test.ts` 항목). 위 검사들이 초록인
 * 것만으로는 그물이 찢어졌는지 알 수 없으므로, 일부러 구멍을 내고
 * 잡히는지 확인한다.
 */
describe("변이 검사 — 가드가 실제로 문다", () => {
  // 화면 1에 실제로 남아 있는, 벤더가 색을 거는 자리 하나를 표본으로
  // 쓴다(예전 표본이던 `.seed-checkbox__label`은 이 화면에서 사라졌다).
  const SAMPLE = ".seed-field-label__root";
  const SAMPLE_CLASS = "seed-field-label__root";
  const sample = VENDOR_COLOR_RULES.find((r) => r.selector === SAMPLE);

  const uncoveredAgainst = (overrides: Override[]): string[] =>
    VENDOR_COLOR_RULES.filter(
      (v) => winningOverride(v, overrides) === undefined,
    ).map((v) => v.selector);

  it("override를 하나 지우면 그 벤더 규칙이 드러난다", () => {
    expect(sample).toBeDefined();
    const poisoned = ENTRY_OVERRIDES.filter(
      (o) => !o.subjectClasses.includes(SAMPLE_CLASS),
    );
    expect(poisoned.length).toBeLessThan(ENTRY_OVERRIDES.length);
    expect(uncoveredAgainst(poisoned)).toContain(SAMPLE);
  });

  it("명시도가 모자란 override는 덮은 것으로 쳐 주지 않는다", () => {
    // 벤더 규칙과 **같은** 명시도(0,1,0)짜리 override. 실제 캐스케이드
    // 에서는 소스 순서에 기대게 되는 형태라 통과시키면 안 된다.
    const weak: Override = {
      selector: SAMPLE,
      color: "var(--paper)",
      subjectClasses: [SAMPLE_CLASS],
      pseudoElement: "",
      specificity: specificity(SAMPLE),
      hex: resolveColor("var(--paper)"),
    };
    const withoutReal = ENTRY_OVERRIDES.filter(
      (o) => !o.subjectClasses.includes(SAMPLE_CLASS),
    );
    expect(uncoveredAgainst([...withoutReal, weak])).toContain(SAMPLE);
  });

  it("밝은 면 글자색을 override에 쓰면 대비 검사가 잡는다", () => {
    const lightSurfaceColor = resolveColor("var(--on-sheet)");
    expect(lightSurfaceColor).not.toBeNull();
    expect(contrastRatio(lightSurfaceColor!, SCRIM_FLOOR)).toBeLessThan(
      BODY_TEXT_MIN_RATIO,
    );
  });
});
