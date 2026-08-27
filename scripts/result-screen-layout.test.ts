import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ══════════════════════════════════════════════════════════════════
 * 화면 2(결과 화면) 재스킨의 **구조 규칙**을 `prototype-results.html`에
 * 잠근다
 * ══════════════════════════════════════════════════════════════════
 *
 * 색의 대비율은 `scripts/seed-semantic-tokens.test.ts`가 잰다. 이 파일이
 * 잠그는 것은 프로토타입이 **주석으로 남긴, 실제로 겪었거나 사용자가
 * 명시적으로 지시한** 규칙들이다 — 값 하나가 조용히 되돌아가면 화면이
 * 승인된 시안과 달라지거나, 프로토타입이 이미 한 번 겪은 버그가 돌아온다.
 *
 * 1. **결과 화면 전용 토큰은 `.result-shell` 스코프다.** 전역 토큰
 *    (`--ink`·`--paper`·`--rule`·`--brass` …, `src/seed-brand.css`)은
 *    화면 1이 여전히 쓴다 — 같은 이름을 결과 화면에서 다른 값으로 다시
 *    선언하면 두 화면이 한 이름을 두고 다른 색을 뜻하게 되고,
 *    `scripts/colorSurfaces.ts`의 토큰 해석기(파일을 순서대로 훑어 **먼저
 *    정의된 쪽**을 쓴다)는 그 갈림을 볼 수 없어 **화면과 다른 색을 재게
 *    된다.**
 * 2. **사이드바 폭 298px**(사용자 지시 ②: 20%쯤 줄일 것). 예산 상세
 *    패널은 그 열을 **정확히** 덮는 오버레이라 같은 값이어야 한다
 *    (`ResultShell.tsx`·`src/App.test.tsx`의 그 주석 참고 — 폭이 어긋나면
 *    패널이 지도 왼쪽을 덮는다).
 * 3. **무대 행은 `minmax(0, 1fr)`.** `auto`로 두면 지도(자식이 전부
 *    absolute라 내재 높이 0)가 높이를 못 받아 타일이 아예 안 뜬다 —
 *    프로토타입 주석의 ⚠ 첫째다.
 * 4. **사이드바는 흰색**(사용자 지시 ③)이고, 그래서 **카드는 테두리로
 *    경계를 세운다.** 프로토타입 머리주석: "사이드바가 흰색이 되면서 흰
 *    카드가 바탕에 묻히므로, 카드는 헤어라인 테두리 + 얕은 그림자로
 *    경계를 세운다(DESIGN.md도 '그림자만으로는 카드 가장자리가 서지
 *    않는다'고 못박는다)."
 * 5. **카드를 상자에 가두지 않는다.** 실제 카드는 목업보다 정보가 많다 —
 *    준공년·월 상환액·부담률·등급 글자·등급이 멈춘 이유·토지임대부 표시가
 *    길어질 수 있고, 그 대부분이 `MUST_SURVIVE_PRINT_CLASSES`다. 고정
 *    높이나 `overflow: hidden`을 걸면 그 정보가 잘린다.
 * 6. **마커 선택 표시가 채움색을 바꾸지 않는다.** 채움이 곧 분류
 *    (파랑=대출 없이, 주황=대출 필요)라, 고른 순간 색이 바뀌면 그 마커가
 *    어느 분류였는지 사라진다 — 프로토타입이 사용자 요청으로 바꿔 둔
 *    규칙이다(바깥 테로만 표시한다).
 * 7. **채움색은 마커와 범례가 같은 토큰을 쓴다.** 두 자리가 각자 hex를
 *    들면 한쪽만 바뀌는 날 범례가 지도에 없는 색을 설명한다.
 * 8. **`--result-signal`은 글자색으로 쓰지 않는다.** 프로토타입이 직접
 *    적어 둔 규칙이다 — "색이 **글자로** 나가야 하는 자리는 어둡게 한
 *    변형(`--result-signal-ink`)을 쓴다. 화면에서 가장 중요한 숫자를
 *    2.65:1로 둘 수는 없다."
 *
 * `node:fs`로 CSS 소스를 직접 읽는 빌드 타임 검사라 `src/`가 아니라
 * `scripts/`에 있다(`scripts/printCss.test.ts`의 같은 주석 참고).
 */

const CSS = readFileSync("src/styles.css", "utf8");
const BRAND_CSS = readFileSync("src/seed-brand.css", "utf8");

/** 주석을 걷어낸 선언부. 주석 안의 예시가 규칙으로 잡히지 않게 한다. */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selector: string;
  body: string;
}

/**
 * `@media screen`을 **뺀 모든** `@media` 블록을 통째로 걷어낸다.
 *
 * 이 파일이 재는 것은 **넓은 화면의 기본값**이다. 다른 미디어 블록들도
 * 같은 선택자에 같은 속성을 다시 선언한다 — 좁은 화면에서는 1열이라
 * 사이드바 열 폭이라는 것이 없어 `.budget-panel { width: 100% }`이고,
 * 인쇄에서는 배치가 통째로 풀려 `width: auto`다. 그것까지 같은 목록에
 * 담으면 "마지막 값"이 화면의 기본값이 아니라 인쇄 해제 값이 된다.
 *
 * `@media screen`만 남긴다 — 예산 상세 패널의 **기본 규칙**이 그 안에
 * 있고(인쇄에 닿지 않게 하려는 의도적 배치, `printCss.test.ts` 참고),
 * 그것이 이 화면의 기본값이다.
 */
function stripNonScreenMediaBlocks(css: string): string {
  let out = "";
  let i = 0;
  const re = /@media([^{]*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (m[1]!.trim() === "screen") continue; // 남긴다
    out += css.slice(i, m.index);
    let depth = 0;
    let j = m.index + m[0].length - 1;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
    re.lastIndex = i;
  }
  return out + css.slice(i);
}

/**
 * 평평한 규칙 목록. `@media …{`만 걷어내면 남는 것은 규칙들이고, 짝을
 * 잃은 닫는 중괄호는 아래 정규식이 알아서 건너뛴다
 * (`scripts/map-overlay-guard.test.ts`와 같은 파서다).
 */
const RULES: Rule[] = (() => {
  const flat = stripNonScreenMediaBlocks(DECLARATIONS).replace(/@media[^{]*\{/g, "");
  const out: Rule[] = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({
      selector: m[1]!
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
      body: m[2]!,
    });
  }
  return out;
})();

/** 선택자 목록에 `selector`가 **한 항으로** 들어 있는 규칙들. */
function rulesFor(selector: string): Rule[] {
  return RULES.filter((r) =>
    r.selector.split(",").some((part) => part.trim() === selector),
  );
}

/** 그 선택자에 마지막으로 선언된 속성 값. 없으면 undefined. */
function declared(selector: string, property: string): string | undefined {
  let found: string | undefined;
  const re = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "gi");
  for (const rule of rulesFor(selector)) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rule.body)) !== null) found = m[1]!.trim();
  }
  return found;
}

/*
 * ══════════════════════════════════════════════════════════════════
 * 1. 결과 화면 전용 토큰 — `.result-shell` 스코프, 전역 이름과 겹치지 않는다
 * ══════════════════════════════════════════════════════════════════
 */

/** 프로토타입 `:root` 블록이 실측 대비와 함께 정리해 둔 값 그대로다. */
const RESULT_TOKENS: ReadonlyArray<[string, string]> = [
  ["--result-paper", "#ffffff"],
  ["--result-ink", "#12294d"],
  ["--result-gray", "#4f6a8c"],
  ["--result-rule", "#dbe7f3"],
  ["--result-signal", "#3ba6f1"],
  ["--result-signal-ink", "#1f6ea9"],
  ["--result-signal-wash", "#e8f4fe"],
  ["--result-warn", "#e8663c"],
];

describe("파서 전제", () => {
  it("좁은 화면 오버라이드를 실제로 걷어낸다(그리고 다 걷어내지는 않는다)", () => {
    // 이 두 단언이 없으면 파서가 아무것도 안 하거나 파일을 통째로 날려도
    // 아래 검사들이 조용히 통과한다.
    const stripped = stripNonScreenMediaBlocks(DECLARATIONS);
    expect(stripped.length).toBeLessThan(DECLARATIONS.length);
    expect(stripped).toContain(".region-results-grid");
    expect(stripped).not.toMatch(/max-width:\s*900px/);
  });

  it("결과 화면의 주요 선택자를 실제로 찾는다", () => {
    for (const selector of [
      ".result-shell",
      ".region-results-grid",
      ".region-results-sidebar",
      ".complex-row",
      ".complex-map-marker",
      ".budget-panel",
    ]) {
      expect(rulesFor(selector).length, `${selector} 규칙을 못 찾았다`).toBeGreaterThan(0);
    }
  });
});

describe("결과 화면 전용 색 토큰", () => {
  it(".result-shell 스코프에서 프로토타입의 값 그대로 선언한다", () => {
    const shell = rulesFor(".result-shell").map((r) => r.body).join("\n");
    const missing = RESULT_TOKENS.filter(
      ([name, hex]) =>
        !new RegExp(`${name}\\s*:\\s*${hex}\\s*;`, "i").test(shell),
    ).map(([name, hex]) => `${name}: ${hex}`);

    expect(
      missing,
      ".result-shell이 결과 화면 전용 토큰을 프로토타입 값으로 선언하지 " +
        "않습니다 — prototype-results.html의 :root 블록이 출처입니다.",
    ).toEqual([]);
  });

  it("전역 팔레트 토큰의 이름을 결과 화면에서 다시 선언하지 않는다", () => {
    /*
     * `src/seed-brand.css`가 선언한 이름 전부. 그중 하나라도 styles.css의
     * 다른 스코프에서 다시 선언되면, 같은 이름이 화면에 따라 다른 색을
     * 뜻하게 된다 — 그리고 `scripts/colorSurfaces.ts`의 해석기는 **먼저
     * 정의된 쪽**만 보므로 대비 검사가 화면과 다른 색을 잰다.
     */
    const globalNames = [
      ...new Set(
        [...BRAND_CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
          (m) => m[1]!,
        ),
      ),
    ];
    const redeclared: string[] = [];
    for (const rule of RULES) {
      // `:root`는 전역 정의 자리다 — 그 자리에서의 선언은 갈림이 아니다.
      if (rule.selector.split(",").some((p) => p.trim().startsWith(":root"))) continue;
      for (const name of globalNames) {
        if (new RegExp(`(?:^|[;\\s])${name}\\s*:`).test(rule.body)) {
          redeclared.push(`${rule.selector} { ${name}: … }`);
        }
      }
    }

    expect(
      redeclared,
      "전역 팔레트 토큰의 이름을 다른 스코프에서 다시 선언했습니다 — " +
        "결과 화면 전용 값은 --result-* 라는 새 이름으로 두세요.",
    ).toEqual([]);
  });

  it("--result-signal을 글자색으로 쓰지 않는다(어두운 변형이 따로 있다)", () => {
    const asText = RULES.filter((r) =>
      /(?:^|[;\s])color\s*:\s*var\(--result-signal\)\s*(?:;|$)/.test(r.body),
    ).map((r) => r.selector);

    expect(
      asText,
      "--result-signal(#3ba6f1)을 글자색으로 썼습니다 — 흰 배경 대비 " +
        "2.65:1입니다. 글자로 나가야 하는 자리는 --result-signal-ink" +
        "(#1f6ea9, 5.44:1)를 쓰세요(prototype-results.html의 :root 주석).",
    ).toEqual([]);
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 2. 무대 — 사이드바 폭 298px, 행은 minmax(0, 1fr)
 * ══════════════════════════════════════════════════════════════════
 */

/** 사용자 지시 ②로 정해진 사이드바 열 폭. 패널도 이 값을 그대로 쓴다. */
const SIDEBAR_WIDTH = "298px";

describe("결과 화면 무대", () => {
  it(`사이드바 열이 ${SIDEBAR_WIDTH}다(사용자 지시 ②)`, () => {
    expect(declared(".region-results-grid", "grid-template-columns")).toBe(
      `${SIDEBAR_WIDTH} minmax(0, 1fr)`,
    );
  });

  it("예산 상세 패널의 폭이 사이드바 열과 같다", () => {
    expect(
      declared(".budget-panel", "width"),
      "패널은 사이드바 열을 **정확히** 덮는 오버레이입니다 — 폭이 어긋나면 " +
        "지도 왼쪽을 덮거나 열이 삐져나옵니다(ResultShell.tsx 참고).",
    ).toBe(SIDEBAR_WIDTH);
  });

  it("무대 행이 minmax(0, 1fr)다 — auto면 지도 높이가 0이 된다", () => {
    expect(declared(".region-results-grid", "grid-template-rows")).toBe(
      "minmax(0, 1fr)",
    );
    expect(declared(".result-shell", "grid-template-rows")).toBe(
      "auto minmax(0, 1fr)",
    );
  });

  it("사이드바 바탕이 흰색이다(사용자 지시 ③)", () => {
    expect(declared(".region-results-sidebar", "background")).toBe(
      "var(--result-paper)",
    );
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 3. 카드 — 흰 바탕 위에서 테두리로 서고, 상자에 갇히지 않는다
 * ══════════════════════════════════════════════════════════════════
 */

describe("단지 카드", () => {
  it("헤어라인 테두리와 얕은 그림자를 함께 가진다", () => {
    const border = declared(".complex-row", "border");
    const shadow = declared(".complex-row", "box-shadow");
    expect(
      border,
      "흰 사이드바 위의 흰 카드는 그림자만으로 가장자리가 서지 않습니다 " +
        "— 프로토타입 머리주석이 그 이유를 적어 두었습니다.",
    ).toMatch(/^1px solid var\(--result-rule\)$/);
    expect(shadow).toBeDefined();
  });

  it("반경이 24px다(DESIGN.md의 카드 반경)", () => {
    expect(declared(".complex-row", "border-radius")).toBe("24px");
  });

  it("선택된 카드는 바탕·테두리로 표시한다", () => {
    const focused = rulesFor(".complex-row--focused");
    expect(focused.length).toBeGreaterThan(0);
    const body = focused.map((r) => r.body).join("\n");
    expect(body).toMatch(/background\s*:\s*var\(--result-signal-wash\)/);
    expect(body).toMatch(/border-color\s*:\s*var\(--result-signal\)/);
  });

  /**
   * 실제 카드는 목업보다 정보가 많다 — 준공년·월 상환액·부담률·등급
   * 글자·**등급이 멈춘 이유**·**토지임대부 표시**가 붙고, 그 대부분이
   * `MUST_SURVIVE_PRINT_CLASSES`다. 상자에 가두면 그 정보가 잘린다.
   */
  it("카드와 그 안쪽을 상자에 가두지 않는다", () => {
    const CONFINED = /(?:^|[;\s])(overflow(?:-[xy])?|height|max-height|-webkit-line-clamp)\s*:/i;
    const offenders: string[] = [];
    for (const selector of [
      ".complex-row",
      ".complex-row-button",
      ".complex-burden",
      ".complex-name",
      ".complex-range",
    ]) {
      for (const rule of rulesFor(selector)) {
        if (CONFINED.test(rule.body)) offenders.push(rule.selector);
      }
    }

    expect(
      offenders,
      "카드에 높이 상한이나 overflow를 걸었습니다 — 등급이 멈춘 이유와 " +
        "토지임대부 표시가 잘립니다(둘 다 인쇄에서도 사라지면 안 되는 " +
        "보호 대상입니다).",
    ).toEqual([]);
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 4. 지도 마커 — 채움이 분류를 지고, 선택은 채움을 건드리지 않는다
 * ══════════════════════════════════════════════════════════════════
 */

/** 두 티어의 채움 토큰. 마커와 범례가 **같은 토큰**을 써야 한다. */
const TIER_FILL: ReadonlyArray<[string, string]> = [
  ["no-loan", "var(--result-signal)"],
  ["loan", "var(--result-warn)"],
];

describe("지도 마커와 범례", () => {
  for (const [tier, fill] of TIER_FILL) {
    it(`마커 --${tier}는 ${fill} 채움 + 흰 글자다`, () => {
      const selector = `.complex-map-marker--${tier}`;
      expect(declared(selector, "background")).toBe(fill);
      expect(
        declared(selector, "color"),
        "채움과 글자색을 **같은 규칙**에 함께 선언해야 대비 검사가 그 " +
          "짝을 실제로 잽니다(seed-semantic-tokens.test.ts).",
      ).toBe("#ffffff");
    });

    it(`범례 견본 --${tier}가 마커와 같은 토큰을 쓴다`, () => {
      expect(
        declared(`.complex-map-legend-swatch--${tier}`, "background"),
        "범례와 마커가 각자 색을 들면 한쪽만 바뀌는 날 범례가 지도에 " +
          "없는 색을 설명합니다.",
      ).toBe(fill);
    });
  }

  it("마커가 18px 알약이다", () => {
    expect(declared(".complex-map-marker", "border-radius")).toBe("18px");
  });

  /**
   * 사용자 요청으로 프로토타입에서 바꿔 둔 규칙이다: 채움이 곧 분류라,
   * 고른 순간 색이 바뀌면 그 마커가 어느 분류였는지 사라진다.
   */
  it("선택 표시가 채움색·글자색을 건드리지 않는다", () => {
    const rules = rulesFor(".complex-map-marker--focused");
    expect(rules.length).toBeGreaterThan(0);
    const body = rules.map((r) => r.body).join("\n");
    expect(
      /(?:^|[;\s])(background|background-color|color)\s*:/.test(body),
      "선택된 마커의 채움색이나 글자색을 바꿨습니다 — 그러면 그 마커가 " +
        "'대출 없이'였는지 '대출 필요'였는지가 고른 순간 사라집니다.",
    ).toBe(false);
    expect(
      /(?:^|[;\s])(box-shadow|outline)\s*:/.test(body),
      "선택 표시가 아무것도 그리지 않습니다 — 바깥 테로 표시해야 합니다.",
    ).toBe(true);
  });

  it("범례가 아래 마커의 클릭을 먹지 않는다", () => {
    expect(declared(".complex-map-legend", "pointer-events")).toBe("none");
  });
});
