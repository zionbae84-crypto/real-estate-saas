import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STYLES_CSS, stripComments } from "./colorSurfaces";

/**
 * ══════════════════════════════════════════════════════════════════
 * 화면 1의 **구조 규칙**을 `prototype.html`에 잠근다
 * ══════════════════════════════════════════════════════════════════
 *
 * `prototype.html`(이 저장소에 커밋된 승인된 시각 디자인)은 화면 1을
 * 만들며 실제로 겪은 버그 셋을 주석으로 남겼다. 재스킨이 그 버그를
 * 그대로 물려받지 않도록, 세 규칙을 **CSS 텍스트에서** 검사한다:
 *
 * 1. 바닥 정렬은 `justify-content: flex-end`가 아니라 자식의
 *    `margin-top: auto`로 한다(flex-end는 내용이 칸보다 길어지면
 *    **위쪽이 잘리고 스크롤로도 닿지 못한다** — 프로토타입이 두 번
 *    겪은 버그다).
 * 2. 낮은 창(`max-height: 780px`)에서 활자·여백을 함께 줄인다(안 줄이면
 *    제목 윗줄이 사라진다).
 * 3. 활자는 **Pretendard 한 벌**이다. 예전에는 이 항이 "화면 1만"이었고
 *    전역 `h1, h2` 명조 규칙은 화면 2가 쓰므로 남겨 두었다 — 사용자가
 *    "pretendard로 모두 통일해줘"라고 지시하면서 그 예외가 사라졌다.
 *    이제 명조는 앱 어디에도 없다(아래 "활자 한 벌" describe 참고).
 *
 * jsdom은 `styles.css`를 적용하지 않으므로 렌더 결과로는 확인할 수 없다.
 * `scripts/printCss.test.ts`와 같은 방식으로 CSS 텍스트를 직접 읽는다 —
 * 그래서 이 파일도 `src/`가 아니라 `scripts/`에 있다(`src/no-network.test.ts`가
 * `src/` 안의 `node:` 임포트를 막는다. `colorSurfaces.ts`가 `node:fs`로
 * 읽어 온 문자열을 그대로 쓴다).
 */

const DECLARATIONS = stripComments(STYLES_CSS);

/**
 * `@media` 블록을 통째로 걷어낸 소스.
 *
 * {@link ruleBody}가 "이 선택자의 규칙은 하나뿐"이라고 요구하는데, 같은
 * 선택자가 조건부 블록 안에 한 번 더 나오는 것은 **정상**이다(낮은 창에서
 * 활자를 줄이는 규칙이 바로 그것이다). 기본값을 물을 때는 조건부를 빼고
 * 본다 — 조건부 쪽은 아래 "낮은 창" describe가 따로 검사한다.
 */
const TOP_LEVEL = (() => {
  let out = "";
  let i = 0;
  while (i < DECLARATIONS.length) {
    const at = DECLARATIONS.indexOf("@media", i);
    if (at === -1) {
      out += DECLARATIONS.slice(i);
      break;
    }
    out += DECLARATIONS.slice(i, at);
    let depth = 0;
    let j = DECLARATIONS.indexOf("{", at);
    for (; j < DECLARATIONS.length; j++) {
      if (DECLARATIONS[j] === "{") depth++;
      else if (DECLARATIONS[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
})();

/** 정규식 메타문자를 전부 이스케이프한다 */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 선택자 하나의 규칙 본문. **일치가 정확히 하나임을 요구한다** —
 * 같은 선택자가 둘이면 어느 쪽을 봐야 하는지 이 파일이 정할 수 없으므로
 * 깨뜨린다.
 */
function ruleBody(selector: string): string {
  const matches = [
    ...TOP_LEVEL.matchAll(
      new RegExp(`(?:^|[{}])\\s*${escapeRegExp(selector)}\\s*{([^}]*)}`, "g"),
    ),
  ];
  expect(matches.length, `${selector} 규칙이 하나가 아니다`).toBe(1);
  return matches[0]![1]!;
}

describe("바닥 정렬 — flex-end가 아니라 margin-top: auto", () => {
  /**
   * `prototype.html`의 `.entry .col > .inner` 주석:
   * "flex-end로 하면 내용이 칸보다 길어졌을 때 위쪽이 잘리고 스크롤로도
   * 닿지 못한다 — 지난 프로토타입이 실제로 겪은 버그이고, 이번에도 처음엔
   * 제목 윗줄이 사라졌다."
   */
  it("패널은 flex 열이고 스스로 스크롤한다", () => {
    const body = ruleBody(".entry-screen-panel");
    expect(body).toContain("flex-direction: column");
    expect(body).toContain("overflow-y: auto");
  });

  it("패널이 flex-end로 바닥 정렬하지 않는다", () => {
    expect(ruleBody(".entry-screen-panel")).not.toContain("flex-end");
  });

  it("바닥 정렬은 표제의 margin-top: auto가 한다", () => {
    expect(ruleBody(".entry-screen .entry-headline")).toContain(
      "margin-top: auto",
    );
  });

  it("워드마크는 줄어들지 않고 맨 위에 남는다", () => {
    expect(ruleBody(".entry-screen .entry-wordmark")).toContain("flex: none");
  });
});

describe("낮은 창 — 활자와 여백을 함께 줄인다", () => {
  /**
   * `prototype.html`의 `@media (max-height: 780px)` 블록을 그대로 옮긴
   * 자리. 안 옮기면 세로가 짧은 창에서 제목 윗줄이 잘리는 같은 버그가
   * 재현된다.
   */
  const SHORT_WINDOW = DECLARATIONS.match(
    /@media \(max-height: 780px\) {([\s\S]*?)\n}/,
  );

  it("규칙이 존재한다", () => {
    expect(SHORT_WINDOW, "@media (max-height: 780px) 규칙이 없다").not.toBeNull();
  });

  it("표제·워드마크·입력 활자를 함께 줄인다", () => {
    const body = SHORT_WINDOW![1]!;
    expect(body).toContain(".entry-screen .entry-headline");
    expect(body).toContain(".entry-screen .entry-wordmark");
    expect(body).toContain(".seed-text-input__value");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════
 * 활자 한 벌 — **앱 전체가** Pretendard다
 * ══════════════════════════════════════════════════════════════════
 *
 * 예전에는 이 describe가 "화면 1만 Pretendard, 화면 2는 아직 명조"를
 * 잠갔다. 사용자가 상단바의 "내 예산으로 살 수 있는 집"이 명조로 뜨는
 * 스크린샷을 두고 **"pretendard로 모두 통일해줘"**라고 지시하면서 그
 * 경계가 사라졌다 — 이제 명조를 쓰는 자리가 하나도 없어야 한다.
 *
 * 그래서 검사가 **전역**이 됐다: 화면 1 스코프뿐 아니라 `styles.css`
 * 어디에도 `--font-serif`가 없어야 하고, 토큰 정의 자체와
 * `@fontsource/nanum-myeongjo` 의존성도 함께 죽는다. 셋을 같이 잠그는
 * 이유는 하나만 남으면 "왜 여기 있는지 모르는 죽은 코드"가 되기
 * 때문이다 — 이 저장소에서 실제로 몇 번 겪은 모양이다.
 */
describe("활자 한 벌 — 앱 전체가 Pretendard다", () => {
  it("워드마크와 표제가 각자 font-family를 다시 선언한다", () => {
    // 화면 1은 스코프 override로 이미 Pretendard였다. 전역 규칙이
    // 사라져도 이 선언은 그대로 둔다 — 이 화면의 활자 규율(크기가
    // 아니라 굵기·자간이 위계를 만든다)이 여기 붙어 있다.
    expect(ruleBody(".entry-screen .entry-wordmark")).toContain("font-family:");
    expect(ruleBody(".entry-screen .entry-headline")).toContain("font-family:");
  });

  it("styles.css 어디에서도 명조(--font-serif)를 쓰지 않는다", () => {
    const serifUsers: string[] = [];
    for (const m of DECLARATIONS.matchAll(/([^{}]+){([^{}]*)}/g)) {
      if (!m[2]!.includes("var(--font-serif)")) continue;
      serifUsers.push(m[1]!.replace(/\s+/g, " ").trim());
    }
    expect(
      serifUsers,
      "명조를 쓰는 규칙이 남아 있습니다 — 사용자 지시는 " +
        '"pretendard로 모두 통일해줘"입니다.',
    ).toEqual([]);
  });

  it("--font-serif 토큰 정의 자체가 없다 — 아무도 쓰지 않는 토큰은 남기지 않는다", () => {
    expect(DECLARATIONS).not.toContain("--font-serif");
  });

  it("나눔명조 폰트 이름이 스타일시트에 남아 있지 않다", () => {
    expect(DECLARATIONS).not.toMatch(/Nanum Myeongjo|Apple Myungjo/);
  });

  it("전역 h1, h2 규칙이 body의 Pretendard를 덮지 않는다", () => {
    // 이제 제목도 본문과 같은 한 벌이다. 규칙 자체를 지워 body에서
    // 상속받게 했으므로, `h1, h2`에 font-family 선언이 다시 생기면
    // 그건 통일을 되돌리는 변경이다.
    for (const m of DECLARATIONS.matchAll(/([^{}]+){([^{}]*)}/g)) {
      const selector = m[1]!.replace(/\s+/g, " ").trim();
      if (!/^h1,\s*h2$/.test(selector)) continue;
      expect(m[2]).not.toContain("font-family");
    }
  });

  it("@fontsource/nanum-myeongjo를 더 이상 들여오지도 의존하지도 않는다", () => {
    // 번들에서 약 440KB가 빠진다. import만 지우고 의존성을 남기면
    // 다음 사람이 "쓰는 데가 있나 보다" 하고 되살린다.
    const mainTsx = readFileSync("src/main.tsx", "utf8");
    expect(mainTsx).not.toContain("nanum-myeongjo");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain(
      "@fontsource/nanum-myeongjo",
    );
    expect(Object.keys(pkg.devDependencies ?? {})).not.toContain(
      "@fontsource/nanum-myeongjo",
    );
  });
});

describe("입력 밑줄 — 화면 1 전용 토큰을 쓴다", () => {
  /**
   * `prototype.html`은 입력 밑줄을 `rgba(238,241,244,.22)`로 뒀다.
   * 그 값은 이 화면의 면(영상 위 스크림 바닥) 대비 **1.94:1**이라
   * WCAG 1.4.11(비텍스트 대비 3:1)을 넘지 못한다 — 상자를 없앤 입력에서
   * 밑줄은 그 컨트롤을 식별하는 **유일한 경계**라 그 기준이 그대로
   * 걸린다. 그래서 프로토타입 값을 그대로 베끼지 않고 같은 방식(면 위에
   * `--paper`를 얹는다)으로 불투명도만 올려 다시 계산했다 —
   * 실측값은 `scripts/seed-semantic-tokens.test.ts`가 못박는다.
   */
  it("--entry-rule은 .entry-screen 스코프에만 있다 — 전역 팔레트를 건드리지 않는다", () => {
    const defs = [
      ...DECLARATIONS.matchAll(/([^{}]+){([^{}]*--entry-rule:[^{}]*)}/g),
    ].map((m) => m[1]!.replace(/\s+/g, " ").trim());
    expect(defs).toEqual([".entry-screen"]);
  });

  it("입력 밑줄이 --entry-rule을 쓴다", () => {
    expect(DECLARATIONS).toContain("border-bottom: 1px solid var(--entry-rule)");
  });

  it("--rule(이 면에서 1.02:1, 사실상 보이지 않는다)을 화면 1의 경계에 쓰지 않는다", () => {
    const users: string[] = [];
    for (const m of DECLARATIONS.matchAll(/([^{}]+){([^{}]*)}/g)) {
      if (!/border[^;:]*:[^;]*var\(--rule\)/.test(m[2]!)) continue;
      const selector = m[1]!.replace(/\s+/g, " ").trim();
      if (selector.split(",").some((s) => s.trim().startsWith(".entry-screen"))) {
        users.push(selector);
      }
    }
    expect(users).toEqual([]);
  });
});

/**
 * 예전에는 여기 "평형대 칩 — 상자가 아니라 밑줄 토글" describe가 있었다.
 * 사용자 지시로 화면 1의 평형대 질문(칩 넷)이 통째로 사라졌다 —
 * 면적·가격·입주년차는 이제 결과 화면의 슬라이더 필터가 맡는다
 * (`src/components/ComplexFilters.tsx`). `.area-band-select`·
 * `.area-band-option`·`.area-band-options` 선택자 자체가 `styles.css`에서
 * 사라졌으므로 여기서 잠글 규칙이 없다.
 */

/**
 * 조회 버튼은 원래 `prototype.html`의 `.go`(글자 + 늘어나는 선)였다 —
 * 사용자 지시로 원형 아이콘 버튼으로 바뀌었고(RegionSelect.tsx의 SVG
 * 화살표), 자리도 selects 아래 독립된 줄에서 두 select와 같은 줄의
 * 셋째 열로 옮겨졌다. 이 describe는 그 새 모양을 잠근다.
 */
describe("조회 버튼 — 원형 아이콘 버튼", () => {
  it("두 select와 같은 줄, 셋째 열에 원형 테두리로 선다", () => {
    const btn = ruleBody(".entry-screen .region-select-query");
    expect(btn).toContain("grid-column: 3");
    expect(btn).toContain("border-radius: 50%");
    expect(btn).toContain("border: 1.5px solid var(--brass-lift)");
  });

  it("호버에서 테두리색으로 채워지고 글자색이 뒤집힌다", () => {
    const hover = ruleBody(
      ".entry-screen .region-select-query:not(:disabled):hover",
    );
    expect(hover).toContain("background: var(--brass-lift)");
    expect(hover).toContain("color: var(--ink)");
  });

  it("비활성은 화살표 버튼과 같은 --haze다(WCAG 1.4.3 예외지만 읽히는 값)", () => {
    const disabled = ruleBody(".entry-screen .region-select-query:disabled");
    expect(disabled).toContain("border-color: var(--haze)");
    expect(disabled).toContain("color: var(--haze)");
  });
});
