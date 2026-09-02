import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARKER_ANCHOR } from "../src/components/ComplexMap";

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
 * 4. 지도 마커 — 부담 수준 2색 사각 배지, 앵커는 꼬리 끝
 * ══════════════════════════════════════════════════════════════════
 *
 * 사용자 지시로 여러 차례 모양이 바뀌었다: 색+글자 2분류 → 한 색으로
 * 걷어냄 → 색+글자로 되돌림 → 지금은 색 탭(이름)+흰 바탕(가격)의 사각
 * 배지로, "대출 없이"/"대출 필요" 글자는 마커에서 빠지고 지도 좌측
 * 하단 범례(`.complex-map-legend`)로 옮겼다("말풍선 핀을 남겨서
 * 좌표지점을 표기하고, 대출 필요/없음의 글자는 삭제, 아래에 맵
 * 좌측하단부에 아이콘 색상을 간단히 설명하는걸 추가해줘"). 그래서
 * 여기가 잠그는 것은 세 가지다: **분류가 색으로 드러나는가**, **범례가
 * 같은 뜻을 글자로도 지고 있는가**, 그리고 **앵커가 실제 아이콘 높이를
 * 가리키는가**(패딩이 라벨 상자 하나에서 이름·가격 두 줄로 나뉘고
 * 테두리가 새로 생기며 높이 산수가 통째로 바뀌었다).
 */

describe("지도 마커", () => {
  it("두 티어가 각자 테두리·이름 탭·가격 글자·꼬리 색을 갖는다", () => {
    // 테두리·채움은 티어 스코프 규칙에만 있다 — 기본 규칙에 색을 두면
    // "이 마커가 어느 티어인지"를 스코프 없이도 주장하게 되어, 스코프
    // 규칙과 값이 갈라져도 기본값이 조용히 눈가림한다.
    expect(declared(".complex-map-marker", "border-color")).toBeUndefined();
    expect(declared(".complex-map-marker-name", "background")).toBeUndefined();
    expect(declared(".complex-map-marker-name", "color")).toBeUndefined();
    expect(declared(".complex-map-marker-price", "color")).toBeUndefined();

    expect(declared(".complex-map-pin--no-loan .complex-map-marker", "border-color")).toBe(
      "var(--result-signal)",
    );
    expect(declared(".complex-map-pin--no-loan .complex-map-marker-name", "background")).toBe(
      "var(--result-signal)",
    );
    expect(
      declared(".complex-map-pin--no-loan .complex-map-marker-name", "color"),
      "채움과 글자색을 **같은 규칙**에 함께 선언해야 대비 검사가 그 " +
        "짝을 실제로 잽니다(seed-semantic-tokens.test.ts).",
    ).toBe("#ffffff");
    expect(declared(".complex-map-pin--no-loan .complex-map-marker-price", "color")).toBe(
      "var(--result-signal-ink)",
    );

    expect(declared(".complex-map-pin--loan .complex-map-marker", "border-color")).toBe(
      "var(--result-warn)",
    );
    expect(declared(".complex-map-pin--loan .complex-map-marker-name", "background")).toBe(
      "var(--result-warn)",
    );
    expect(declared(".complex-map-pin--loan .complex-map-marker-name", "color")).toBe("#ffffff");
    expect(declared(".complex-map-pin--loan .complex-map-marker-price", "color")).toBe(
      "var(--result-warn-ink)",
    );

    expect(
      rulesFor(".complex-map-marker-trades"),
      ".complex-map-marker-trades 규칙이 남아 있습니다 — 지도에 없는 것을 꾸미는 죽은 CSS입니다.",
    ).toEqual([]);
  });

  it("범례가 두 티어를 색 견본+글자로 설명한다 — 색만으로 말하지 않는다", () => {
    expect(rulesFor(".complex-map-legend").length).toBeGreaterThan(0);
    expect(declared(".complex-map-legend-swatch--no-loan", "background")).toBe(
      "var(--result-signal)",
    );
    expect(declared(".complex-map-legend-swatch--loan", "background")).toBe(
      "var(--result-warn)",
    );
    // 실제 "대출 없이"/"대출 필요" 글자는 ComplexMap.tsx가 MARKER_LEGEND로
    // 넣고, ComplexMap.test.tsx가 렌더 결과에서 확인한다.
  });

  it("꼬리가 같은 티어 색 계열의 어두운(-ink) 변형을 쓴다 — 밝은 값은 하드 룰이 막는다", () => {
    // `--result-signal`/`--result-warn` 자체를 색으로 쓰면 아래
    // "--result-signal을 글자색으로 쓰지 않는다" 검사가 막는다(예외
    // 없는 하드 룰). 같은 계열의 -ink 변형을 쓴다 — 라벨 상자와 정확히
    // 같은 색은 아니지만 눈으로 갈라지지 않는다.
    expect(declared(".complex-map-pin--no-loan .complex-map-marker-tail", "color")).toBe(
      "var(--result-signal-ink)",
    );
    expect(declared(".complex-map-pin--loan .complex-map-marker-tail", "color")).toBe(
      "var(--result-warn-ink)",
    );
  });

  it("마커가 흰 바탕 + 색 테두리의 둥근 사각 배지다", () => {
    expect(declared(".complex-map-marker", "border-radius")).toBe("10px");
    expect(declared(".complex-map-marker", "background")).toBe("var(--result-paper)");
    expect(declared(".complex-map-marker", "border")).toBe("1px solid");
  });

  /**
   * ⚠ **이 검사가 앵커 정확도의 알맹이를 지킨다.**
   *
   * 예전 앵커는 `naver.maps.Point(0, 0)` — 떠 있는 라벨 상자의 **왼쪽 위
   * 모서리**를 좌표에 앉혔고, 상자는 거기서 오른쪽 아래로 자라날 뿐이라
   * "정확히 이 지점"을 가리키는 자리가 아예 없었다. 지금은 말풍선
   * 꼬리 끝이 좌표에 앉는다 — 패딩이 라벨 상자 하나에서 이름·가격 두
   * 줄로 나뉘고 테두리가 새로 생기며 높이 산수의 항이 늘었지만, 방식은
   * 그대로다.
   *
   * jsdom은 레이아웃을 계산하지 않아 마커의 실제 렌더 높이를 물어볼 수
   * 없다. 그래서 `styles.css`가 px로 못박아 둔 박스 모델 성분을 읽어
   * **같은 산수를 다시 해서** `MARKER_ANCHOR.y`와 대조한다 — CSS와 상수
   * 중 하나만 움직이면 여기서 깨진다.
   */
  it("앵커 y가 styles.css의 실제 박스 모델 높이와 같다 — 세 상세도 모두", () => {
    const px = (selector: string, property: string) => {
      const value = declared(selector, property);
      expect(value, `${selector} { ${property} } 선언이 없습니다`).toBeDefined();
      expect(
        value,
        `${selector} { ${property}: ${value} }가 px가 아닙니다 — rem이면 ` +
          "루트 글꼴 크기가 바뀔 때 앵커와 실제 높이가 갈라집니다.",
      ).toMatch(/^-?\d+px$/);
      return Number.parseInt(value!, 10);
    };

    const border = declared(".complex-map-marker", "border")!;
    const borderWidthMatch = border.match(/^(\d+)px/);
    expect(borderWidthMatch, `.complex-map-marker { border: ${border} }가 px 폭으로 시작하지 않습니다`).not.toBeNull();
    const verticalBorder = Number.parseInt(borderWidthMatch![1]!, 10) * 2;

    const namePadding = declared(".complex-map-marker-name", "padding")!.split(/\s+/);
    expect(namePadding[0], "단지명 패딩의 세로 값이 px가 아닙니다").toMatch(/^\d+px$/);
    const nameVerticalPadding = Number.parseInt(namePadding[0]!, 10) * 2;

    const pricePadding = declared(".complex-map-marker-price", "padding")!.split(/\s+/);
    expect(pricePadding.length, "가격 패딩은 top/좌우/bottom 세 값이어야 합니다").toBe(3);
    const priceVerticalPadding =
      Number.parseInt(pricePadding[0]!, 10) + Number.parseInt(pricePadding[2]!, 10);

    const tail = px(".complex-map-marker-tail", "height");
    // 이름만 낼 때는 가격 두 줄(패딩 + line-height)이 통째로 빠진다.
    const nameOnly =
      verticalBorder + nameVerticalPadding + px(".complex-map-marker-name", "line-height") + tail;
    const full =
      nameOnly + priceVerticalPadding + px(".complex-map-marker-price", "line-height");

    const mismatch =
      "앵커 y와 마커의 실제 높이가 갈라졌습니다 — 마커가 가리키는 자리가 " +
      "틀어집니다(ComplexMap.tsx의 MARKER_ANCHOR 주석 참고).";
    expect(full, mismatch).toBe(MARKER_ANCHOR.full.y);
    expect(nameOnly, mismatch).toBe(MARKER_ANCHOR.name.y);

    /*
     * 점은 꼬리가 없다 — 원의 **한가운데**가 좌표다. `box-sizing:
     * border-box`가 있어야 흰 테가 지름에 더해지지 않고, 그래야 절반이
     * 실제 한가운데다.
     */
    expect(
      declared(".complex-map-dot", "box-sizing"),
      ".complex-map-dot에 box-sizing: border-box가 없습니다 — 흰 테 2px이 " +
        "지름에 더해져 앵커가 원의 한가운데를 벗어납니다(이 파일에는 전역 " +
        "box-sizing이 없습니다).",
    ).toBe("border-box");
    const dotSize = px(".complex-map-dot", "height");
    expect(px(".complex-map-dot", "width"), "점이 원이 아닙니다").toBe(dotSize);
    expect(dotSize % 2, "점 지름이 홀수라 한가운데가 정수 px이 아닙니다").toBe(0);
    expect(dotSize / 2, mismatch).toBe(MARKER_ANCHOR.dot.y);
  });

  /**
   * x=0의 근거는 폭 0짜리 세로 flex 상자다 — 자식(라벨·꼬리·점)이 그 축을
   * 기준으로 좌우 대칭으로 넘쳐 나므로, 단지 이름이 길든 짧든 꼬리
   * 꼭짓점의 x가 정확히 0이다. 폭을 주는 순간 그 산수가 깨진다.
   */
  it("앵커 x=0의 근거인 폭 0 세로 flex 상자가 그대로다", () => {
    for (const detail of ["full", "name", "dot"] as const) {
      expect(MARKER_ANCHOR[detail].x).toBe(0);
    }
    expect(declared(".complex-map-pin", "width")).toBe("0");
    expect(declared(".complex-map-pin", "flex-direction")).toBe("column");
    expect(declared(".complex-map-pin", "align-items")).toBe("center");
    // 절대 배치를 쓰면 세로 쌓임이 깨져 위 높이 산수가 성립하지 않는다.
    expect(declared(".complex-map-pin", "position")).toBeUndefined();
  });

  /**
   * 채움이 곧 분류다(파랑=대출 없이, 주황=대출 필요). 고른 순간 색이
   * 바뀌면 그 마커가 어느 분류였는지 사라진다 — 선택은 종류가 아니라
   * 상태이므로 바깥 테로 말한다. (한때 마커가 한 색이던 시기에도 같은
   * 결과를 그대로 지켰던 규칙이 분류가 돌아오며 원래 이유를 되찾았다.)
   */
  it("선택 표시가 채움색·글자색을 건드리지 않는다", () => {
    const rules = rulesFor(".complex-map-marker--focused");
    expect(rules.length).toBeGreaterThan(0);
    const body = rules.map((r) => r.body).join("\n");
    expect(
      /(?:^|[;\s])(background|background-color|color)\s*:/.test(body),
      "선택된 마커의 채움색이나 글자색을 바꿨습니다 — 마커가 전부 같은 " +
        "색인 지금, 하나만 채움이 다르면 다른 종류로 읽힙니다.",
    ).toBe(false);
    expect(
      /(?:^|[;\s])(box-shadow|outline)\s*:/.test(body),
      "선택 표시가 아무것도 그리지 않습니다 — 바깥 테로 표시해야 합니다.",
    ).toBe(true);
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 6. 상세 화면의 두 블록도 **같은 카드 언어**를 쓴다
 * ══════════════════════════════════════════════════════════════════
 *
 * 사용자 지시: "카드를 선택했을때의 내용도 카드형식의 표로 만들어줘."
 * 단지를 골라 상세가 열렸을 때의 두 블록(취득시 부대비용 · 매달 나가는
 * 돈)은 배경도 테두리도 없는 흐르는 텍스트였다.
 *
 * **새로 디자인하지 않는다.** 사이드바 목록 카드(`.complex-row`)가 이미
 * 이 저장소의 카드 언어이고, 상세는 그 카드를 눌러서 여는 화면이다 —
 * 같은 열 안에서 두 카드 문법이 갈리면 그 자체가 결함이다. 그래서 값을
 * **그대로 재사용**하고, 그 사실을 여기서 잠근다: 어느 한쪽이 움직이면
 * 나머지도 함께 움직여야 한다.
 */
describe("상세 블록 카드 — 목록 카드와 같은 값을 쓴다", () => {
  it("바탕·테두리·반경이 .complex-row와 정확히 같다", () => {
    for (const property of ["background", "border", "border-radius"]) {
      expect(
        declared(".detail-block", property),
        `.detail-block의 ${property}가 .complex-row와 다릅니다 — 한 열 ` +
          "안에서 카드 문법이 갈립니다.",
      ).toBe(declared(".complex-row", property));
    }
  });

  it("그림자도 같은 값이다", () => {
    const shadow = declared(".detail-block", "box-shadow");
    expect(shadow).toBeDefined();
    expect(shadow!.replace(/\s+/g, " ")).toBe(
      declared(".complex-row", "box-shadow")!.replace(/\s+/g, " "),
    );
  });

  /**
   * `.complex-row`와 **같은 이유**로 상자에 가두지 않는다(위 §5). 이
   * 블록 안에는 접히는 `<details>`가 둘(부대비용 내역 · 금리 시나리오)
   * 있고, 그 안의 문구 여럿이 `MUST_SURVIVE_PRINT_CLASSES`다 — 상자에
   * 가두는 규칙 하나면 화면에서 잘리고 종이에서 사라진다.
   */
  it("블록과 그 안쪽을 상자에 가두지 않는다", () => {
    const CONFINED =
      /(?:^|[;\s])(overflow(?:-[xy])?|height|max-height|position)\s*:/i;
    const offenders: string[] = [];
    for (const selector of [
      ".detail-block",
      ".detail-block--costs",
      ".detail-block--monthly",
      ".detail-value-row",
      ".detail-stat-value",
      ".cost-breakdown",
    ]) {
      for (const rule of rulesFor(selector)) {
        if (CONFINED.test(rule.body)) offenders.push(rule.selector);
      }
    }
    expect(
      offenders,
      "상세 블록에 높이 상한·overflow·고정 배치를 걸었습니다 — 접힌 " +
        "고지들이 화면에서 잘리고 종이에서 사라집니다.",
    ).toEqual([]);
  });

  /**
   * 부대비용 내역(`<dl>`)은 **두 칸 표**다 — 라벨 왼쪽, 금액 오른쪽.
   * `<table>`로 바꾸지 않았다: `<dl>`이 이미 이 정보에 맞는 시맨틱이고,
   * 태그를 갈아엎으면 인쇄 계약(`::details-content`)과 기존 검사가 함께
   * 흔들린다. 표처럼 보이게 하는 것은 CSS의 일이다.
   */
  it("내역이 두 칸 표로 정렬된다 — 금액은 오른쪽·tabular-nums", () => {
    expect(declared(".cost-breakdown-table > div", "display")).toMatch(
      /grid|flex/,
    );
    expect(declared(".cost-breakdown-table dd", "text-align")).toBe("right");
    expect(declared(".cost-breakdown-table dd", "font-variant-numeric")).toBe(
      "tabular-nums",
    );
  });
});
