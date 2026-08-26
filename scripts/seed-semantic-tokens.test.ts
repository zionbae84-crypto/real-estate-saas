import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRAND_CSS as overrideCss,
  SCRIM_FLOOR,
  STYLES_CSS,
  contrastRatio,
  rawToken,
  resolveColor,
  stripComments,
  toHex,
} from "./colorSurfaces";

/**
 * seed-brand.css가 Seline 의미 계층 토큰을 실제로 덮고 있는지, 그리고
 * 안전/주의/위험 등급색이 흰 배경·본문 크기 기준 4.5:1을 넘는지 검사한다.
 *
 * scripts/seed-brand-tokens.test.ts와 다른 대상을 본다 — 그 테스트는
 * "brand"가 이름에 들어간 토큰만 자동으로 찾아 대조하고, 이 테스트는
 * 이 프로젝트가 실제로 쓰기로 정한 확장 토큰 목록(fg-neutral,
 * bg-layer-default, 등급색 등)을 직접 나열해 확인한다 — 이 토큰들은
 * "brand" 계열이 아니라서 그 정규식에 잡히지 않는다.
 *
 * 2026-08-26: Seline 팔레트(따뜻한 stone + cyan)를 영상에서 뽑은
 * 청회색·황동 팔레트로 교체했다(docs/superpowers/specs/
 * 2026-08-26-영상히어로-전체화면지도-design.md §1). 아래 테스트의 hex는
 * 그 교체 이후 값이고, 계산값은 이 파일이 직접 검증한다.
 */

const EXTENDED_TOKENS = [
  "--seed-color-bg-layer-default",
  "--seed-color-bg-layer-floating",
  "--seed-color-fg-neutral",
  "--seed-color-fg-neutral-muted",
  "--seed-color-fg-neutral-subtle",
  "--seed-color-stroke-neutral-weak",
  "--seed-color-stroke-neutral-muted",
  "--seed-color-bg-neutral-weak",
  "--seed-color-fg-positive-contrast",
  "--seed-color-bg-positive-weak",
  "--seed-color-fg-warning-contrast",
  "--seed-color-bg-warning-weak",
  "--seed-color-fg-critical-contrast",
  "--seed-color-bg-critical-weak",
];

describe("SEED 의미 계층 토큰 확장", () => {
  it.each(EXTENDED_TOKENS)("%s가 seed-brand.css에서 오버라이드된다", (token) => {
    expect(overrideCss).toContain(`${token}:`);
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 색 계산·면(surface)은 `scripts/colorSurfaces.ts`에서 가져온다
 * ══════════════════════════════════════════════════════════════════
 *
 * 대비 공식(WCAG 상대 휘도), `var()` 사슬 해석기, 그리고 화면 1의 글자가
 * 실제로 앉는 면(`SCRIM_FLOOR` — 영상의 가장 밝은 픽셀 위에 스크림
 * 바닥을 합성한 값)이 예전에는 이 파일 안에만 있었다.
 * `scripts/seed-vendor-colors.test.ts`가 **같은 면** 위에서 SEED 벤더
 * CSS를 검사하게 되면서 한 곳으로 옮겼다 — 두 검사가 서로 다른 면을
 * 재기 시작하면 한쪽이 통과하는데 화면은 깨지는 상태가 생긴다.
 */

/**
 * 등급색(--safe/--warn/--risk, src/styles.css :root)이 실제로 가리키는
 * -contrast 토큰 값. 스펙 §1 "상태색"의 원색(#4c9d7a/#c98a3c/#c4574f)은
 * 흰 배경 대비 각각 3.28:1/2.92:1/4.35:1(계산값, 이 파일 하단
 * "spec 상태색 원색" 블록 참고)이라 본문 크기 기준(4.5:1)을 못 넘는다
 * (--warn은 큰 굵은 글자 기준 3:1도 못 넘는다) — 그런데 이 등급색은
 * src/styles.css 곳곳에서 본문 크기 텍스트에 쓰인다. 그래서 스펙이
 * "밝은 면 위 태그"로 제시한 진한 값(--risk는 스펙에 태그 짝이 없어
 * 같은 방식으로 새로 골랐다)을 대신 쓴다 — src/seed-brand.css의
 * 해당 토큰 주석 참고.
 */
describe("등급색 대비율 — 흰 배경(#ffffff), 본문 크기 기준 4.5:1", () => {
  it("safe(#1d5c43)", () => {
    expect(contrastRatio("#1d5c43", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("warn(#6d4610)", () => {
    expect(contrastRatio("#6d4610", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("risk(#8a2e28)", () => {
    expect(contrastRatio("#8a2e28", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * 지도 마커 **부담 수준** 2분류의 배경-텍스트 대비율.
 * `src/styles.css`의 `.complex-map-marker--{no-loan,loan}`(과 같은 규칙을
 * 공유하는 범례 견본)이 실제로 쓰는 토큰 값을 그대로 옮겨 계산한다.
 *
 * **예전에는 가격 3분위(low/mid/high)였다.** Task 4에서 마커 색의 뜻이
 * 가격대에서 부담 수준으로 바뀌며 그 세 클래스가 사라졌다 — 그 조합을
 * 그대로 두면 이 테스트는 **화면 어디에도 없는 색**의 대비율을 재는,
 * 통과해도 아무것도 지키지 않는 검사가 된다(task-1에서
 * `land-lease.test.ts`가 같은 이유로 함께 옮겨졌다).
 *
 * 두 색은 design.md §1이 "밝은 면 위 태그"로 제시한 짝 그대로다.
 */
describe("지도 마커 부담 수준 대비율 — 배경 대비 텍스트, 본문 크기 기준 4.5:1", () => {
  it("대출 없이: bg #dff0e8(bg-positive-weak) / text #1d5c43(fg-positive-contrast)", () => {
    expect(contrastRatio("#dff0e8", "#1d5c43")).toBeGreaterThanOrEqual(4.5);
  });
  it("대출 필요: bg #f7e9cf(bg-warning-weak) / text #6d4610(fg-warning-contrast)", () => {
    expect(contrastRatio("#f7e9cf", "#6d4610")).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * `--seed-color-fg-brand-contrast`의 대비율과 **쓸 수 있는 자리의
 * 경계**를 못박는다.
 *
 * 2026-08-26 팔레트 교체 전에는 이 토큰이 cyan(#3398e1)을 가리켰고,
 * 카드 면(#ffffff) 3.13:1 / 페이지 바탕(#fafaf9) 2.99:1로 본문 크기
 * 기준(4.5:1)을 넘지 못해 "큰 굵은 글자 전용"이라는 제약이 값 자체에서
 * 나왔다. 교체 후에는 --brass-ink(#8a5f14)를 가리키고, 카드 면
 * (--sheet-2, #ffffff) 5.63:1 / 페이지 바탕(--sheet, #f3f6f8) 5.19:1로
 * 본문 크기 기준도 넉넉히 넘는다 — 값만 보면 "큰 굵은 글자 전용" 제약이
 * 더는 필요하지 않다.
 *
 * 그래도 이 토큰을 쓰는 자리를 셋(`.affordable-price`,
 * `.safe-line-item--max .safe-line-amount`, `.slider-price--max`)으로
 * 못박은 아래 소스 검사는 그대로 둔다 — "같은 금액이 여러 번 나올 때
 * 색이 갈리지 않게 한다"는 규칙의 목적은 대비 수치와 무관하고, 값이
 * 다시 바뀔 때(예: Task 2~5에서 브랜드색을 또 조정할 때) 이 자리 목록이
 * 계속 정확한 채로 남아야 회귀를 잡을 수 있다.
 */
describe("fg-brand-contrast(#8a5f14, --brass-ink) — 본문 크기까지 통과하는 값", () => {
  const BRAND_CONTRAST = "#8a5f14";
  const CANVAS = "#f3f6f8"; // bg-layer-default(--sheet) — 페이지 바탕
  const CARD = "#ffffff"; // bg-layer-floating(--sheet-2) — 카드 면

  it("본문 크기 기준(4.5:1)을 두 배경 모두에서 넘는다", () => {
    expect(contrastRatio(BRAND_CONTRAST, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(BRAND_CONTRAST, CANVAS)).toBeGreaterThanOrEqual(4.5);
  });

  it("실측값을 못박는다 — 카드 면 5.63:1, 페이지 바탕 5.19:1", () => {
    // 값이 바뀌면 여기서 먼저 깨진다. 위 주석의 근거 숫자가 조용히
    // 낡는 일(예전 팔레트 교체 때 이 파일이 실제로 겪은 일)을 막는다.
    expect(contrastRatio(BRAND_CONTRAST, CARD)).toBeCloseTo(5.63, 1);
    expect(contrastRatio(BRAND_CONTRAST, CANVAS)).toBeCloseTo(5.19, 1);
  });

  it("돌아가기 버튼이 쓰는 색(fg-neutral/on-sheet)은 본문 기준을 넉넉히 넘는다", () => {
    // `.complex-detail-back`이 이 토큰 대신 쓰는 값. 상세에서 목록으로
    // 돌아가는 유일한 길이라 본문 기준을 반드시 넘어야 한다. 이 값은
    // 금액과 무관한 순수 본문이라 값이 바뀐 뒤에도 브랜드색으로
    // 되돌리지 않았다(src/styles.css의 .complex-detail-back 주석 참고).
    expect(contrastRatio("#15202b", CANVAS)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * 위 규칙이 실제 CSS와 어긋나지 않는지 소스에서 확인한다.
 *
 * 대비율만 재면 "이 토큰을 어디에 썼는가"는 잡히지 않는다 — 예전
 * 팔레트 교체 때 새어 나간 회귀가 정확히 그 모양이었다.
 */
describe("fg-brand-contrast를 쓰는 자리", () => {
  const STYLES = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  /** `--seed-color-fg-brand-contrast`를 color로 쓰는 규칙의 선택자들 */
  const users = [...STYLES.matchAll(/([^{}]+)\{[^{}]*color:\s*var\(--seed-color-fg-brand-contrast\)/g)].map(
    (m) => m[1]!.trim().split("\n").pop()!.trim(),
  );

  it("큰 굵은 글자 세 자리에서만 쓴다", () => {
    // 늘리려면 그 자리가 정말 큰 굵은 글자인지 먼저 확인하고 여기에
    // 적어야 한다. (2026-08-26 팔레트 교체로 이 토큰은 이제 본문 크기
    // 기준도 넘지만, 이 제약은 "여러 자리에서 색이 갈리지 않게 한다"는
    // 목적이라 값과 무관하게 유지한다 — 위 describe 블록 참고.)
    expect(users.sort()).toEqual([
      ".affordable-price",
      ".safe-line-item--max .safe-line-amount",
      ".slider-price--max",
    ]);
  });

  it("돌아가기 버튼은 더 이상 이 토큰을 쓰지 않는다", () => {
    expect(users).not.toContain(".complex-detail-back");
  });
});

/**
 * design.md §1 "밝은 면"·"어두운 면" 표의 조합 중 실제로 텍스트로 쓰이는
 * 짝을 계산한다(task-1-brief.md Step 2가 요구하는 목록).
 *
 * **아래 목록은 손으로 고른 것이라 그 자체로는 완전하지 않다.** 실제로
 * 이 파일이 오래 놓친 것이 정확히 그 구멍이었다 — 스펙 표가 "보조
 * 텍스트"·"라벨" 역할로 지정한 `--haze`와 `--on-sheet-faint`가 이 목록에
 * 없어서, 두 토큰이 각각 4.25:1·2.95:1로 본문 기준을 못 넘는데도 아홉
 * 조합이 전부 통과했다. 지금은 둘 다 목록에 있고, 그와 별개로 아래
 * "텍스트 색 사용처 전수 검사"가 **소스에서 사용처를 찾아** 검사한다 —
 * 손으로 적은 목록은 값의 기준선이고, 회귀를 막는 것은 그쪽이다.
 */
describe("design.md §1 — 밝은 면·어두운 면 대비율", () => {
  it("밝은 면 본문: --on-sheet(#15202b) on --sheet(#f3f6f8)", () => {
    expect(contrastRatio("#15202b", "#f3f6f8")).toBeGreaterThanOrEqual(4.5);
  });
  it("밝은 면 본문: --on-sheet(#15202b) on --sheet-2(#ffffff)", () => {
    expect(contrastRatio("#15202b", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("밝은 면 보조: --on-sheet-soft(#61707e) on --sheet-2(#ffffff)", () => {
    expect(contrastRatio("#61707e", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("밝은 면 금액: --brass-ink(#8a5f14) on --sheet-2(#ffffff)", () => {
    expect(contrastRatio("#8a5f14", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("어두운 면 본문: --paper(#eef1f4) on --ink(#0d1319)", () => {
    expect(contrastRatio("#eef1f4", "#0d1319")).toBeGreaterThanOrEqual(4.5);
  });
  it("어두운 면 본문: --paper(#eef1f4) on --ink-2(#131b23)", () => {
    expect(contrastRatio("#eef1f4", "#131b23")).toBeGreaterThanOrEqual(4.5);
  });
  it("어두운 면 금액: --brass-lift(#e0aa54) on --ink-2(#131b23)", () => {
    expect(contrastRatio("#e0aa54", "#131b23")).toBeGreaterThanOrEqual(4.5);
  });
  it("태그 — 안전: 글자 #1d5c43 on 바탕 #dff0e8", () => {
    expect(contrastRatio("#1d5c43", "#dff0e8")).toBeGreaterThanOrEqual(4.5);
  });
  it("태그 — 주의: 글자 #6d4610 on 바탕 #f7e9cf", () => {
    expect(contrastRatio("#6d4610", "#f7e9cf")).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * 아래 둘이 이 목록에 오래 빠져 있던 자리다(리뷰 findings의 m1).
   * 스펙 §1 표는 `--on-sheet-faint`에 "라벨", `--haze`에 "보조 텍스트"
   * 역할을 배정했다 — 둘 다 본문 크기 텍스트고, Global Constraints는
   * 본문에 4.5:1을 요구한다.
   */
  it("밝은 면 라벨: --on-sheet-faint on --sheet-2(#ffffff)", () => {
    expect(contrastRatio(rawToken("--on-sheet-faint"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("밝은 면 라벨: --on-sheet-faint on --sheet(#f3f6f8)", () => {
    expect(contrastRatio(rawToken("--on-sheet-faint"), "#f3f6f8")).toBeGreaterThanOrEqual(4.5);
  });
  it("어두운 면 보조: --haze on --ink(#0d1319)", () => {
    expect(contrastRatio(rawToken("--haze"), "#0d1319")).toBeGreaterThanOrEqual(4.5);
  });
  it("어두운 면 보조: --haze on 스크림 바닥(영상 위 합성값)", () => {
    // 입력 패널은 자기 배경이 없다(`.entry-screen-panel`) — 이 글자들이
    // 실제로 앉는 면은 --ink가 아니라 **영상 위에 깔린 스크림**이다.
    // 아래 SCRIM_FLOOR가 그 합성값이고, styles.css의
    // `--scrim-panel-alpha`에서 계산한다.
    expect(contrastRatio(rawToken("--haze"), SCRIM_FLOOR)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * design.md §1 "상태색" 원색(--safe/--warn/--risk의 스펙 표 값,
 * #4c9d7a/#c98a3c/#c4574f)은 흰 배경·본문 크기 기준을 넘지 못한다는
 * 사실을 못박는다 — 그래서 src/styles.css의 --safe/--warn/--risk가
 * 이 원색 대신 위 "밝은 면 위 태그" 진한 값을 가리킨다(이 파일 상단
 * "등급색 대비율" describe 참고). 스펙 값 자체가 실패한다는 사실을
 * 계산으로 남겨 둬야, 다음에 이 원색을 텍스트에 직접 쓰려는 시도가
 * 있을 때 이 테스트가 먼저 깨진다.
 */
describe("spec 상태색 원색 — 흰 배경 대비, 본문 크기 텍스트로는 쓸 수 없다", () => {
  it("safe 원색(#4c9d7a)은 4.5:1에 못 미친다(계산값 3.28:1)", () => {
    expect(contrastRatio("#4c9d7a", "#ffffff")).toBeLessThan(4.5);
  });
  it("warn 원색(#c98a3c)은 큰 굵은 글자 기준(3:1)에도 못 미친다(계산값 2.92:1)", () => {
    expect(contrastRatio("#c98a3c", "#ffffff")).toBeLessThan(3);
  });
  it("risk 원색(#c4574f)은 4.5:1에 못 미친다(계산값 4.35:1)", () => {
    expect(contrastRatio("#c4574f", "#ffffff")).toBeLessThan(4.5);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════
 * 텍스트 색 사용처 전수 검사 (리뷰 findings m1)
 * ══════════════════════════════════════════════════════════════════
 *
 * **왜 이 검사가 생겼는가.** 위쪽 대비율 테스트들은 손으로 고른 조합만
 * 잰다. 그래서 `--haze`(4.25:1)와 `--on-sheet-faint`(2.95:1)가 목록에
 * 없다는 이유만으로 통과했고, 이 브랜치가 그 두 토큰을 결과 화면 상단바
 * 라벨과 입력 화면 본문에 새로 붙였을 때 아무 테스트도 깨지지 않았다.
 * 값이 아니라 **사용처**를 봐야 잡히는 회귀다.
 *
 * 이 블록은 `src/styles.css`에서 `color:`를 선언하는 규칙을 전부 찾아,
 * 각 규칙이 앉는 면과의 대비를 계산한다. 새 규칙이 어두운 토큰을 밝은
 * 면에(또는 그 반대로) 쓰는 순간 여기서 먼저 깨진다 — 목록을 손으로
 * 늘릴 필요가 없다.
 *
 * **면이 무엇인지 어떻게 아는가**(세 단계, 위에서부터 이긴다):
 * 1. 규칙이 자기 `background`를 선언하면 그 값. (`transparent`·`none`·
 *    `inherit`은 자기 면이 아니므로 아래로 내려간다.)
 * 2. 선택자가 `.entry-screen`으로 시작하면 화면 1 — 영상 위 스크림
 *    ({@link SCRIM_FLOOR}).
 * 3. 나머지는 밝은 면. 페이지 바탕(`--sheet`)과 카드 면(`--sheet-2`)
 *    **둘 다**에서 통과해야 한다 — 어느 쪽에 앉을지는 선택자만 보고
 *    알 수 없다.
 *
 * **알고 있는 한계**(고의로 남긴다):
 * - `--seed-color-bg-neutral-weak`(#eef3f7) 같은 옅은 강조 면은 그 면을
 *   **선언한 규칙**에서만 검사된다. 그 면 안의 자손이 색만 따로 바꾸면
 *   3단계의 밝은 면 기준으로 재게 되는데, 두 면의 차이가 작아
 *   (#f3f6f8 vs #eef3f7) 실질적인 구멍은 아니다.
 * - `@media` 조건은 무시하고 규칙을 평평하게 편다. 인쇄 전용 색 규칙이
 *   생기면 그때 이 전제를 다시 봐야 한다.
 * - jsdom이 아니라 **소스 텍스트**를 본다. 캐스케이드로 실제로 어느
 *   규칙이 이기는지는 보지 못한다.
 * - SEED 자기 컴포넌트 CSS(node_modules)는 보지 않는다. 그쪽은 이
 *   프로젝트가 재정의한 **토큰 값**으로만 영향을 받으므로, 위쪽
 *   "design.md §1" 블록의 값 검사가 그 몫을 맡는다.
 */
describe("텍스트 색 사용처 전수 검사 — styles.css의 모든 color 규칙", () => {
  interface ColorRule {
    selector: string;
    color: string;
    background: string | null;
  }

  const COLOR_RULES: ColorRule[] = (() => {
    // `@media …{`만 걷어내면 남는 것은 평평한 규칙 목록이다. 짝을 잃은
    // 닫는 중괄호는 아래 정규식이 알아서 건너뛴다.
    const flat = stripComments(STYLES_CSS).replace(/@media[^{]*\{/g, "");
    const rules: ColorRule[] = [];
    for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1]!
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ");
      const body = m[2]!;
      const color = body.match(/(?:^|[;\s])color:\s*([^;]+)/);
      if (color === null) continue;
      const background = body.match(/(?:^|[;\s])background(?:-color)?:\s*([^;]+)/);
      rules.push({
        selector,
        color: color[1]!.trim(),
        background: background === null ? null : background[1]!.trim(),
      });
    }
    return rules;
  })();

  /** 자기 면이 아닌 배경 값 — 이 값들은 뒤에 있는 면이 그대로 비친다. */
  const NOT_A_SURFACE = ["transparent", "none", "inherit"];

  const LIGHT_SURFACES = [rawToken("--sheet"), rawToken("--sheet-2")];

  function surfacesOf(rule: ColorRule): string[] {
    if (rule.background !== null && !NOT_A_SURFACE.includes(rule.background)) {
      const own = resolveColor(rule.background);
      if (own !== null) return [own];
    }
    const onEntryScreen = rule.selector
      .split(",")
      .some((part) => part.trim().startsWith(".entry-screen"));
    return onEntryScreen ? [SCRIM_FLOOR] : LIGHT_SURFACES;
  }

  /**
   * 비활성 컨트롤은 WCAG 1.4.3의 명시적 예외다("inactive user interface
   * component"). 지금 걸리는 것은 둘 — 오피스텔 연동 전까지 고정된
   * `.housing-type-select select:disabled`와, 필수 입력이 덜 찬 동안의
   * `.entry-screen button:disabled`다. 예외를 선택자 패턴으로 두는
   * 이유는, 새 규칙이 이 예외에 올라타려면 `:disabled`를 실제로 달아야
   * 하기 때문이다.
   */
  const isDisabledControl = (selector: string) => selector.includes(":disabled");

  it("검사할 규칙이 실제로 많다 — 파서가 아무것도 못 찾은 채 통과하지 않는다", () => {
    expect(COLOR_RULES.length).toBeGreaterThan(50);
  });

  it("--scrim-ink가 --ink와 같은 색이다", () => {
    // 스크림 그라디언트는 `rgb(<채널> / <불투명도>)` 문법이라 hex 토큰을
    // 그대로 쓸 수 없어 채널을 따로 적는다. 두 값이 갈라지면 위
    // SCRIM_FLOOR가 화면과 다른 면을 재게 된다.
    const m = stripComments(STYLES_CSS).match(/--scrim-ink:\s*([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*;/);
    expect(m).not.toBeNull();
    const channels = [m![1]!, m![2]!, m![3]!].map(Number) as [number, number, number];

    expect(toHex(channels)).toBe(rawToken("--ink"));
  });

  it("모든 color 값이 hex로 풀린다(못 푸는 값은 검사에서 빠진다)", () => {
    const unresolvable = COLOR_RULES.filter(
      (r) => r.color !== "inherit" && resolveColor(r.color) === null,
    ).map((r) => `${r.selector} { color: ${r.color} }`);

    expect(unresolvable).toEqual([]);
  });

  it("모든 배경 값도 hex로 풀린다", () => {
    const unresolvable = COLOR_RULES.filter(
      (r) =>
        r.background !== null &&
        !NOT_A_SURFACE.includes(r.background) &&
        resolveColor(r.background) === null,
    ).map((r) => `${r.selector} { background: ${r.background} }`);

    expect(unresolvable).toEqual([]);
  });

  it("본문 크기 텍스트는 앉는 면 대비 4.5:1을 넘는다", () => {
    const failures: string[] = [];
    for (const rule of COLOR_RULES) {
      if (rule.color === "inherit") continue;
      if (isDisabledControl(rule.selector)) continue;
      const fg = resolveColor(rule.color);
      if (fg === null) continue; // 위 테스트가 따로 잡는다
      for (const bg of surfacesOf(rule)) {
        const ratio = contrastRatio(fg, bg);
        if (ratio < 4.5) {
          failures.push(
            `${ratio.toFixed(2)}:1  ${rule.selector} { color: ${rule.color} → ${fg} } on ${bg}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("두 문제 토큰이 실제로 이 검사를 받는 자리에 쓰이고 있다", () => {
    // 위 테스트가 "쓰이는 데가 없어서" 통과하는 일이 없게 못박는다.
    const used = (token: string) =>
      COLOR_RULES.some(
        (r) => r.color === `var(${token})` && !isDisabledControl(r.selector),
      );

    expect(used("--seed-color-fg-neutral-subtle")).toBe(true);
    expect(used("--haze")).toBe(true);
  });
});
