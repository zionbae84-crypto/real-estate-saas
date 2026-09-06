import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BODY_TEXT_MIN_RATIO,
  BRAND_CSS as overrideCss,
  SCRIM_FLOOR,
  STYLES_CSS,
  composite,
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
 * 지도 마커 채움 위 흰 글자의 대비율.
 *
 * **예전에는 부담 수준 2분류(파랑 "대출 없이" / 주황 "대출 필요")였고,
 * 두 채움 다 기준에 못 미쳐 아래 예외 목록에 이름으로 적혀 있었다**
 * (각각 2.65:1 / 3.28:1). 사용자 지시로 마커에서 색 구분을 걷어내며
 * (면적·거래건과 함께) 그 두 채움이 사라졌고, 남은 한 색은
 * `--result-ink`(#12294d)다 — 예외를 물려받지 않고 기준을 넘긴다.
 *
 * 그 전에는 `priceTiers`(가격 3분위)였다. 두 번 다 **화면 어디에도 없는
 * 색의 대비율을 재는, 통과해도 아무것도 지키지 않는 검사**가 남는 것을
 * 막으려고 이 블록을 함께 옮겼다(task-1에서 `land-lease.test.ts`가 같은
 * 이유로 옮겨졌다).
 */
describe("지도 마커 대비율 — 채움 대비 흰 글자, 본문 크기 기준 4.5:1", () => {
  it("마커: bg #12294d(--result-ink) / text #ffffff", () => {
    expect(contrastRatio(rawToken("--result-ink"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("실측값이 14.48:1이다 — 옛 채움(2.65:1 / 3.28:1)과 비교해 남긴다", () => {
    expect(contrastRatio(rawToken("--result-ink"), "#ffffff").toFixed(2)).toBe("14.48");
    // 예전 두 채움. 지금은 마커에 쓰이지 않지만, "왜 바꿨는가"가 숫자로
    // 남아 있어야 다음 사람이 되돌리기 전에 이 값을 본다.
    expect(contrastRatio(rawToken("--result-signal"), "#ffffff").toFixed(2)).toBe("2.65");
    expect(contrastRatio(rawToken("--result-warn"), "#ffffff").toFixed(2)).toBe("3.28");
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
 * 그래도 이 토큰을 쓰는 자리를 둘(`.detail-stat-value`,
 * `.slider-price--max`)로 못박은 아래 소스 검사는 그대로 둔다 —
 * "같은 금액이 여러 번 나올 때
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
    //
    // `.detail-stat-value`는 단지 상세의 두 블록(design.md §6)이다.
    // 화면에 찍히는 값의 종류가 같아서(금액) 같은 색을 쓴다.
    //
    // ⚠ **더 이상 "큰 굵은 글자"가 아니다** — 사용자 지시로 28px에서
    // 18px로 줄였다(styles.css의 그 규칙 주석 참고). 그래도 이 목록에
    // 남는 이유는 두 가지다: (1) 이 토큰은 2026-08-26 팔레트 교체 이후
    // 카드 면 5.63:1이라 본문 크기 기준(4.5:1)도 넘으므로 크기가 줄어도
    // 대비 요건이 깨지지 않고(아래 "단지 상세 Stat Block" describe가
    // 실측한다), (2) 이 목록의 목적은 애초에 크기 제약이 아니라 "같은
    // 금액이 여러 번 나올 때 색이 갈리지 않게 한다"는 것이다(위 describe
    // 머리 주석).
    //
    // `.detail-max-loan-amount`는 단지 상세의 최대 대출 가능 금액이다
    // (사용자 지시: "최대대출금액 도 부대비용과 같은 황금색으로
    // 수정해줘"). `.detail-stat-value`와 정확히 같은 크기·굵기
    // (1.125rem/700)이고 화면에 찍히는 값의 종류도 같다(금액) — 같은
    // 색을 쓰는 것이 "같은 종류의 값은 같은 색"이라는 이 목록의 규칙에
    // 그대로 맞는다.
    //
    // `.affordable-price`(구 헤드라인 카드)와
    // `.safe-line-item--max .safe-line-amount`(구 `SafeLine`)는 각각
    // 사용자 지시로 헤드라인 카드 자체와 그 안의 비교 줄이 없어지며
    // 함께 없어졌다 — 상단바가 이미 같은 값을 보여주므로 잃는 정보는
    // 없다.
    expect(users.sort()).toEqual([
      ".detail-max-loan-amount",
      ".detail-stat-value",
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
/**
 * 평형대 칩(화면 1의 네 번째 질문) — **새로 만든 컨트롤이라 실측을 여기
 * 못박는다.**
 *
 * 아래 "텍스트 색 사용처 전수 검사"가 `styles.css`의 모든 `color` 규칙을
 * 이미 훑지만, 그 검사는 규칙 하나라도 통과하면 조용해진다 — 어느 값이
 * 얼마였는지는 남지 않는다. 새 컨트롤의 네 상태(고름·안 고름 × 이름·범위)가
 * 실제로 몇 대 몇이었는지를 숫자로 남겨, 팔레트가 움직였을 때 **어느
 * 방향으로** 움직였는지 diff에서 보이게 한다.
 *
 * 칩이 앉는 면은 둘이다: 고르지 않은 칩은 영상 위 스크림 바닥(#2a2f35),
 * 고른 칩은 자기 배경 `--paper`(#eef1f4)다.
 */
describe("평형대 칩 대비율 실측 — 본문 크기 기준 4.5:1", () => {
  const paper = rawToken("--paper");

  /**
   * 고르지 않은 칩의 글자색은 이 화면의 **라벨 색 규칙**
   * (`.entry-screen .field label`, `--haze-lift`)이 정한다 — 칩 자신의
   * 규칙은 명시도가 낮아 색을 이기지 못한다(브라우저 `getComputedStyle`
   * 로 확인: `rgb(154, 167, 180)` = `#9aa7b4`). 그래서 실측도 그 색으로
   * 잰다 — 칩 규칙에 적힌 색을 재면 화면에 없는 값을 검사하게 된다.
   */
  it("안 고른 칩의 구간 이름: --haze-lift on 스크림 바닥 = 5.50:1", () => {
    const ratio = contrastRatio(rawToken("--haze-lift"), SCRIM_FLOOR);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.50");
  });

  it("안 고른 칩의 범위 라벨: --haze on 스크림 바닥 = 4.70:1", () => {
    const ratio = contrastRatio(rawToken("--haze"), SCRIM_FLOOR);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("4.70");
  });

  it("고른 칩의 구간 이름: --ink on --paper = 16.48:1", () => {
    const ratio = contrastRatio(rawToken("--ink"), paper);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("16.48");
  });

  it("고른 칩의 범위 라벨: --on-sheet on --paper = 14.55:1", () => {
    const ratio = contrastRatio(rawToken("--on-sheet"), paper);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("14.55");
  });

  /**
   * 고른 칩의 범위 라벨에 **밝은 면 보조색을 쓰지 않은 이유**를 숫자로
   * 남긴다. `--on-sheet-soft`는 흰 바탕(#ffffff)에서는 통과하지만 이 칩의
   * 면(`--paper`)에서는 **4.49:1**로 0.01 모자란다 — 아슬아슬하게 통과하는
   * 값을 골라 두면 팔레트가 한 칸만 움직여도 조용히 무너진다.
   */
  it("--on-sheet-soft는 이 면에서 4.49:1이라 쓰지 않았다", () => {
    const ratio = contrastRatio(rawToken("--on-sheet-soft"), paper);
    expect(ratio).toBeLessThan(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("4.49");
  });
});

/**
 * 화면 1 재스킨(`prototype.html`) — **옮겨 온 글자 색을 전부 실측해
 * 여기 못박는다.**
 *
 * 아래 "텍스트 색 사용처 전수 검사"가 `.entry-screen` 스코프의 모든
 * `color` 규칙을 이미 스크림 바닥 대비로 훑지만, 그 검사는 통과하면
 * 조용해져 **어느 값이 얼마였는지** 남지 않는다. 프로토타입에서 옮겨 온
 * 역할마다 숫자를 남겨, 팔레트가 움직였을 때 어느 방향으로 움직였는지
 * diff에서 보이게 한다(평형대 칩·단지 상세 블록과 같은 이유).
 *
 * ⚠ **프로토타입의 색을 그대로 베끼지 않은 자리가 둘 있다.** 그 두 값은
 * 이 면에서 기준을 넘지 못한다 — 아래 마지막 두 테스트가 그 사실을
 * 계산으로 남긴다. 디자인을 옮기는 일과 읽히지 않는 글자를 옮기는 일은
 * 다르다.
 */
describe("화면 1 재스킨 대비율 실측 — 영상 위 스크림 바닥 기준", () => {
  const floor = SCRIM_FLOOR;

  it("표제(.entry-headline): --paper on 스크림 바닥 = 11.90:1", () => {
    const ratio = contrastRatio(rawToken("--paper"), floor);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("11.90");
  });

  it("워드마크(.entry-wordmark): --paper-dim on 스크림 바닥 = 9.20:1", () => {
    // 프로토타입은 `--paper`에 `opacity: .85`를 걸어 살짝 물러나게 했다.
    // 불투명도는 **위 전수 검사가 보지 못하는 값**이라(그 검사는 규칙의
    // `color`만 읽는다) 같은 효과를 토큰으로 낸다 — 검사와 화면이 같은
    // 것을 보게 하려면 투명도가 아니라 색으로 말해야 한다.
    const ratio = contrastRatio(rawToken("--paper-dim"), floor);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("9.20");
  });

  it("부제·라벨(.subtitle, 필드 라벨): --haze on 스크림 바닥 = 4.70:1", () => {
    const ratio = contrastRatio(rawToken("--haze"), floor);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("4.70");
  });

  it("환산값·조회 버튼(.echo, .go): --brass-lift on 스크림 바닥 = 6.46:1", () => {
    const ratio = contrastRatio(rawToken("--brass-lift"), floor);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("6.46");
  });

  /**
   * 입력 밑줄 — **비텍스트 대비(WCAG 1.4.11)의 3:1이 걸리는 자리다.**
   * 상자를 없앤 입력에서 밑줄은 그 컨트롤을 식별하는 유일한 경계다.
   *
   * 값은 프로토타입과 **같은 방식**으로 만든다(면 위에 `--paper`를
   * 얹는다). 프로토타입의 불투명도 .22는 이 면에서 1.94:1이라 기준을
   * 넘지 못해 .40으로 올려 다시 계산했고, 그 합성 결과를 화면 1
   * 스코프의 `--entry-rule`에 hex로 박았다 — CSS의 `rgba()`는
   * `resolveColor`가 풀지 못해 전수 검사에서 조용히 빠진다.
   */
  it("입력 밑줄(--entry-rule): 비텍스트 대비 3:1을 넘는다 = 3.24:1", () => {
    const ratio = contrastRatio(rawToken("--entry-rule"), floor);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio.toFixed(2)).toBe("3.24");
  });

  it("--entry-rule은 --paper를 이 면에 40%로 얹은 값이다", () => {
    // 토큰이 손으로 적은 hex라, 그 hex가 어디서 왔는지를 계산으로
    // 남긴다. 면이나 팔레트가 움직이면 여기서 먼저 깨진다.
    expect(rawToken("--entry-rule")).toBe(
      composite(rawToken("--paper"), 0.4, floor),
    );
  });

  it("프로토타입의 밑줄 값(--paper 22%)은 이 면에서 1.94:1이라 쓰지 않았다", () => {
    const ratio = contrastRatio(composite(rawToken("--paper"), 0.22, floor), floor);
    expect(ratio).toBeLessThan(3);
    expect(ratio.toFixed(2)).toBe("1.94");
  });

  it("프로토타입의 --haze-dim(#66727e)은 이 면에서 2.75:1이라 쓰지 않았다", () => {
    // 프로토타입은 힌트 줄(`.hintline`)에 이 색을 쓴다. 그 줄은 "무엇이
    // 모자라서 조회가 안 되는지"를 말하는 본문이라 4.5:1이 그대로
    // 걸린다 — 실제 앱에서는 `.entry-screen .prompt`가 그 역할이고
    // `--paper-dim`(9.20:1)을 쓴다.
    const ratio = contrastRatio("#66727e", floor);
    expect(ratio).toBeLessThan(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("2.75");
  });
});

/**
 * 화면 2 재스킨(`prototype-results.html`) — **옮겨 온 색을 전부 실측해
 * 여기 못박는다.**
 *
 * 화면 1과 같은 이유다(위 describe 참고): 아래 전수 검사는 통과하면
 * 조용해져 **어느 값이 얼마였는지** 남지 않는다. 프로토타입 머리주석이
 * 실측표로 남긴 숫자를 그대로 다시 계산해, 팔레트가 움직였을 때 어느
 * 방향으로 움직였는지 diff에서 보이게 한다.
 *
 * 화면 2의 면은 **흰색**이다(사용자 지시 ③으로 사이드바까지 흰색이
 * 됐다) — 영상 위 스크림이 아니다.
 *
 * ⚠ **마지막 두 테스트는 기준에 못 미치는 값을 남긴다.** 사용자가 두 번
 * 명시적으로 지시한 채움이고, 위 전수 검사의 예외 목록이 같은 세 자리를
 * 다시 잰다. 디자인을 옮기는 일과 읽히지 않는 글자를 옮기는 일은 다르지만,
 * 이 자리들은 **뜻이 색이 아니라 글자에 있다**(마커 라벨·범례에 "대출
 * 없이"/"대출 필요"가 적혀 있다).
 */
describe("화면 2 재스킨 대비율 실측 — 흰 면 기준", () => {
  const paper = "#ffffff";

  it("본문·제목(--result-ink) on 흰 면 = 14.48:1", () => {
    const ratio = contrastRatio(rawToken("--result-ink"), paper);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("14.48");
  });

  it("보조 글자(--result-gray) on 흰 면 = 5.57:1", () => {
    const ratio = contrastRatio(rawToken("--result-gray"), paper);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.57");
  });

  /** 화면에서 가장 중요한 숫자(실구매 가능 가격)가 이 색이다. */
  it("금액(--result-signal-ink) on 흰 면 = 5.44:1", () => {
    const ratio = contrastRatio(rawToken("--result-signal-ink"), paper);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.44");
  });

  /**
   * 선택된 카드는 바탕이 `--result-signal-wash`로 바뀐다. 그 위에 앉는
   * 가장 옅은 글자(`--result-gray`)가 기준을 넘는지가 이 면의 관건이다 —
   * 전수 검사는 규칙에 배경이 **함께 선언된 경우만** 그 면으로 재므로,
   * 물려받는 이 면은 여기서만 잰다.
   */
  it("선택된 카드 바탕 위 보조 글자: --result-gray on --result-signal-wash = 4.98:1", () => {
    const ratio = contrastRatio(
      rawToken("--result-gray"),
      rawToken("--result-signal-wash"),
    );
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("4.98");
  });

  it("선택된 카드 바탕 위 본문: --result-ink on --result-signal-wash = 12.97:1", () => {
    const ratio = contrastRatio(
      rawToken("--result-ink"),
      rawToken("--result-signal-wash"),
    );
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("12.97");
  });

  it("파랑 채움 위 흰 글자 = 2.65:1 — 기준 미달, 사용자 지시", () => {
    const ratio = contrastRatio(paper, rawToken("--result-signal"));
    expect(ratio).toBeLessThan(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("2.65");
  });

  it("주황 채움 위 흰 글자 = 3.28:1 — 기준 미달, 파랑보다는 낫다", () => {
    const ratio = contrastRatio(paper, rawToken("--result-warn"));
    expect(ratio).toBeLessThan(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("3.28");
  });

  /**
   * 카드 경계선. 흰 사이드바 위 흰 카드에서 이 선이 유일한 경계라
   * **비텍스트 대비(WCAG 1.4.11)의 3:1**이 걸릴 법한 자리지만, 실측은
   * 1.25:1이다.
   *
   * **그래도 프로토타입 값을 그대로 쓴다.** 1.4.11이 요구하는 것은 "그
   * 컨트롤을 식별하는 데 필요한 시각적 정보"인데, 카드는 자기 경계가
   * 없어도 이름·가격·거래 건수라는 글자 덩어리로 이미 식별된다 — 화면
   * 1의 입력 밑줄(상자 없는 입력에서 밑줄이 컨트롤을 식별하는 **유일한**
   * 단서라 3:1을 맞춰 올렸다)과 다른 사정이다. 대신 그 사실을 여기
   * 숫자로 남긴다.
   */
  it("카드 테두리(--result-rule) on 흰 면 = 1.25:1 — 비텍스트 3:1 미만", () => {
    const ratio = contrastRatio(rawToken("--result-rule"), paper);
    expect(ratio).toBeLessThan(3);
    expect(ratio.toFixed(2)).toBe("1.25");
  });
});

/**
 * 단지 상세의 두 블록(design.md §6) — **새로 만든 Stat Block이라 실측을
 * 여기 못박는다.**
 *
 * 평형대 칩과 같은 이유다: 아래 "텍스트 색 사용처 전수 검사"가 이미 모든
 * `color` 규칙을 훑지만 그 검사는 통과하면 조용해져 어느 값이 얼마였는지
 * 남지 않는다. 팔레트가 움직였을 때 **어느 방향으로** 움직였는지 diff에서
 * 보이게 한다.
 *
 * **이 블록이 앉는 면이 바뀌었다.** 예전에는 사이드바 바탕(`--sheet`
 * #f3f6f8)이었다. 사용자 지시("카드를 선택했을때의 내용도 카드형식의
 * 표로 만들어줘")로 두 블록이 **흰 카드**(`--result-paper` #ffffff,
 * `.complex-row`와 같은 값)가 되면서, 이제 글자가 실제로 앉는 면은
 * 흰색이다 — 사이드바 자체도 화면 2 재스킨에서 이미 흰색이 됐다.
 * 대비는 세 자리 모두 **올라갔다**(면이 밝아졌고 글자는 어둡다).
 *
 * 흰색은 `--sheet-2`와 같은 값이라 아래는 그 토큰으로 잰다 — 카드 면을
 * 뜻하는 전역 이름이 이미 그것이고, `--result-paper`는 `.result-shell`
 * 스코프 이름이라 여기서 다시 부르면 같은 색에 이름이 둘이 된다.
 */
describe("단지 상세 Stat Block 대비율 실측 — 본문 크기 기준 4.5:1", () => {
  /** 카드 면(흰색). `--result-paper`(#ffffff)와 같은 값이다. */
  const card = rawToken("--sheet-2");

  it("카드 면이 결과 화면의 --result-paper와 같은 색이다(전제)", () => {
    // 두 이름이 갈리면 아래 숫자들이 화면과 다른 면을 재게 된다.
    expect(card).toBe("#ffffff");
  });

  it("값(.detail-stat-value): --brass-ink on 카드 면 = 5.63:1", () => {
    const ratio = contrastRatio(rawToken("--brass-ink"), card);
    // 28px/600은 WCAG의 "큰 글자"(18.66px 이상 굵은 글자)라 3:1이면
    // 되지만, 이 값은 본문 기준까지 넘는다 — 여유를 숫자로 남긴다.
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.63");
  });

  it("라벨(.detail-stat-label): --on-sheet-soft on 카드 면 = 5.09:1", () => {
    // 12px짜리 본문이라 4.5:1이 그대로 요구된다.
    const ratio = contrastRatio(rawToken("--on-sheet-soft"), card);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.09");
  });

  it("가정 한 줄(.detail-stat-note): --on-sheet-soft on 카드 면 = 5.09:1", () => {
    // 금리·기간 가정과 농특세 고지가 이 색으로 나간다. 라벨과 같은
    // 토큰이라 값도 같다 — 여기서 따로 재는 이유는 이 줄이 "가정"이라는
    // 무게를 지기 때문이다: 대비가 무너지면 가장 먼저 안 읽히는 줄이다.
    const ratio = contrastRatio(rawToken("--on-sheet-soft"), card);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.09");
  });

  it("부담률 한 줄(.detail-burden-ratio): --on-sheet on 카드 면 = 16.49:1", () => {
    // 자기 color 규칙이 없어 본문 색을 그대로 물려받는다.
    const ratio = contrastRatio(rawToken("--on-sheet"), card);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("16.49");
  });

  /**
   * 내역을 펼치는 아이콘 버튼(`.cost-breakdown-toggle`). 화살표는
   * 글자가 아니라 **비텍스트 콘텐츠**라 WCAG 1.4.11의 3:1이 기준이지만,
   * 이 자리도 본문 기준을 넘긴다 — 이 버튼이 부대비용 내역으로 가는
   * 유일한 길이라 여유를 남겼다.
   */
  it("내역 아이콘(.cost-breakdown-toggle): --result-signal-ink on 카드 면 = 5.44:1", () => {
    const ratio = contrastRatio(rawToken("--result-signal-ink"), card);
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
    expect(ratio.toFixed(2)).toBe("5.44");
  });
});

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
   * component"). 지금 걸리는 것은 하나 — 필수 입력이 덜 찬 동안의
   * `.entry-screen button:disabled`다(예전에는 늘 "아파트"로 고정돼 있던
   * `.housing-type-select select:disabled`도 있었는데, 사용자 지시로 그
   * select가 없어졌다). 예외를 선택자 패턴으로 두는 이유는, 새 규칙이 이
   * 예외에 올라타려면 `:disabled`를 실제로 달아야 하기 때문이다.
   */
  const isDisabledControl = (selector: string) => selector.includes(":disabled");

  /**
   * **사용자가 명시적으로 지시한, 기준에 못 미치는 채움 한 자리.**
   *
   * 화면 2 재스킨의 출처인 `prototype-results.html`은 그 판단을 머리주석에
   * 이미 적어 두었다 — 파랑(`--result-signal` #3ba6f1) 채움 **위 굵은 흰
   * 글자**는 2.65:1로 본문 기준(4.5:1)에 못 미친다. 굵기로도 메워지지
   * 않는다: 3:1 완화는 18.66px부터인데 이 자리는 11~13px이다.
   *
   * **지도 마커의 두 채움(파랑 "대출 없이" / 주황 "대출 필요")도 함께
   * 적혀 있다.** 한때(면적·거래건과 함께) 색 구분 자체를 걷어낸 적이
   * 있었지만, 사용자 지시로 되돌아왔다 — 지금은 마커가 흰 바탕 사각
   * 배지이고, 이 두 채움은 **단지명이 앉는 상단 색 탭**(`.complex-map-
   * marker-name`)에만 쓰인다. 가격 줄은 이 예외에 없다 — 같은 계열의
   * 어두운 `-ink` 변형(`--result-signal-ink`/`--result-warn-ink`)을
   * 써 4.5:1을 넘기 때문이다(아래 "예외를 어둡게 하면 기준을 넘는다"가
   * 그 계산을 증명한다).
   *
   * **통과시키는 방법은 있다** — 채움을 `--result-signal-ink`(#1f6ea9,
   * 흰 글자 5.44:1)로 내리면 된다. 그만큼 사용자가 지정한 색에서
   * 멀어지고, 사용자는 이 색을 두 차례(커밋 `1c47333`·`ce41eda`)
   * 명시적으로 지시했다. 지시가 바뀌면 여기부터 고치면 된다.
   *
   * ⚠ **예외는 선택자 하나하나로 적는다.** "흰 글자면 봐준다" 같은 규칙을
   * 두면 다음 사람이 아무 자리에나 흰 글자를 얹어 조용히 이 검사를
   * 빠져나간다. 아래 "예외가 실제로 그 값인지" 테스트가 그 자리의 실측을
   * 다시 잰다 — 채움이 움직이면 예외 쪽이 먼저 깨진다.
   */
  const USER_MANDATED_LOW_CONTRAST_FILLS: ReadonlyArray<{
    selector: string;
    /** 실측 대비율(소수 둘째 자리까지) */
    ratio: string;
  }> = [
    // 상단바 "조건 다시 넣기"(프로토타입의 `.ghost`)
    { selector: ".back-to-entry-button", ratio: "2.65" },
    // 지도 마커 상단 색 탭(단지명) — "대출 없이" 티어(밝은 블루). 사용자
    // 지시: "색상도 기존처럼 밝은블루/주황으로 수정하고" — 처음 지시
    // (커밋 `1c47337`)와 같은 값이다. 마커가 사각 배지로 바뀌며 선택자가
    // `.complex-map-marker`에서 이름 탭(`-name`)으로 좁혀졌다 — 값은
    // 그대로다.
    { selector: ".complex-map-pin--no-loan .complex-map-marker-name", ratio: "2.65" },
    // 지도 마커 상단 색 탭(단지명) — "대출 필요" 티어(주황). 커밋
    // `ce41eda`와 같은 값.
    { selector: ".complex-map-pin--loan .complex-map-marker-name", ratio: "3.28" },
  ];

  const isUserMandatedFill = (selector: string) =>
    USER_MANDATED_LOW_CONTRAST_FILLS.some((e) => e.selector === selector);

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
      if (isUserMandatedFill(rule.selector)) continue;
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

  /*
   * ── 예외가 조용히 낡지 않게 한다 ────────────────────────────────
   * 위 예외 목록은 "검사에서 빼는" 목록이라, 아무 검사도 받지 않으면
   * 채움이 바뀌어도 조용하다. 그래서 각 자리를 여기서 **다시 잰다** —
   * 채움이 움직이면 아래 테스트가 먼저 깨지고, 그때 예외를 유지할지
   * 지울지 다시 판단하게 된다.
   */
  it("예외에 적힌 자리가 실제로 존재하고, 흰 글자 + 채움 짝이다", () => {
    const missing = USER_MANDATED_LOW_CONTRAST_FILLS.filter(
      (e) =>
        !COLOR_RULES.some(
          (r) =>
            r.selector === e.selector &&
            resolveColor(r.color) === "#ffffff" &&
            r.background !== null &&
            resolveColor(r.background) !== null,
        ),
    ).map((e) => e.selector);

    expect(
      missing,
      "예외 목록에 있는 선택자가 styles.css에서 '흰 글자 + 채움' 규칙으로 " +
        "존재하지 않습니다 — 아무것도 지키지 않는 예외가 남았습니다.",
    ).toEqual([]);
  });

  it("예외에 적힌 자리의 실측 대비율이 못박은 값 그대로다", () => {
    const measured = USER_MANDATED_LOW_CONTRAST_FILLS.map((e) => {
      const rule = COLOR_RULES.find((r) => r.selector === e.selector)!;
      const ratio = contrastRatio(
        resolveColor(rule.color)!,
        resolveColor(rule.background!)!,
      );
      return `${e.selector} ${ratio.toFixed(2)}`;
    });

    expect(measured).toEqual(
      USER_MANDATED_LOW_CONTRAST_FILLS.map((e) => `${e.selector} ${e.ratio}`),
    );
  });

  it("예외를 어둡게 하면 기준을 넘는다 — 지시가 바뀌면 여기부터 고친다", () => {
    // 프로토타입 머리주석이 적어 둔 대안. 값이 실제로 통과한다는 것을
    // 계산으로 남겨, "고칠 방법이 없다"로 굳지 않게 한다. (주황 쪽
    // 대안 #c8431b은 그 채움을 쓰던 마커가 사라지며 함께 뺐다.)
    expect(contrastRatio("#ffffff", rawToken("--result-signal-ink")).toFixed(2)).toBe(
      "5.44",
    );
  });

  it("문제 토큰이 실제로 이 검사를 받는 자리에 쓰이고 있다", () => {
    // 위 테스트가 "쓰이는 데가 없어서" 통과하는 일이 없게 못박는다.
    const used = (token: string) =>
      COLOR_RULES.some(
        (r) => r.color === `var(${token})` && !isDisabledControl(r.selector),
      );

    expect(used("--haze")).toBe(true);
  });

  /**
   * `--seed-color-fg-neutral-subtle`은 이 목록에서 빠졌다 — **없어진 것이
   * 아니라 우리 CSS의 소비처가 바뀐 것이다.**
   *
   * 첫 소비처는 결과 화면 상단바의 모든 값 라벨(`.result-topbar-item-label`,
   * 11px)이었다. 화면 2 재스킨이 그 자리를 프로토타입의 `--result-gray`
   * (#4f6a8c, 흰 면 5.57:1)로 옮기면서 남은 소비처는 비활성 컨트롤
   * (`.housing-type-select select:disabled`) 하나뿐이 됐고, **사용자
   * 지시로 그 select 자체가 없어지면서 이제 `src/styles.css`에 소비처가
   * 하나도 없다**("지금 현재 모두 아파트 대상으로 하니 매물유형은
   * 제거해줘").
   *
   * 토큰 자체는 죽지 않았다 — SEED 벤더 CSS가 `.seed-field__description`과
   * text-input placeholder에 그대로 쓴다(`src/seed-brand.css`의 해당 주석).
   * 그쪽은 `scripts/seed-vendor-colors.test.ts`가 본다.
   *
   * **그래서 "0개여야 한다"가 아니라 "쓰려면 비활성 컨트롤에만"으로
   * 잠근다.** 0개를 못박으면 오피스텔 연동 때 그 select가 돌아오는
   * 정상 변경이 이 검사를 깨뜨린다. 반대로 검사를 지우면, 누군가 이
   * 토큰을 평범한 글자색으로 되살렸을 때(그 자리는 흰 면 대비가
   * 모자란다) 아무도 막지 않는다 — 지금 지키려는 것은 그 경계다.
   */
  it("--seed-color-fg-neutral-subtle을 쓴다면 비활성 컨트롤에만 쓴다", () => {
    const consumers = COLOR_RULES.filter(
      (r) => r.color === "var(--seed-color-fg-neutral-subtle)",
    ).map((r) => r.selector);

    // 지금은 0개다(위 주석). 늘어나면 전부 :disabled여야 한다.
    expect(consumers.every((s) => isDisabledControl(s))).toBe(true);
  });

  // 변이 검사: 위 단언이 "0개라서" 공허하게 통과하는 것이 아니라, 비활성이
  // 아닌 소비처가 생기면 실제로 걸러 내는지 확인한다.
  it("비활성이 아닌 자리에서 쓰면 잡아낸다(변이 검사)", () => {
    const poisoned = [".some-label", ".region-results-sidebar select:disabled"];
    expect(poisoned.every((s) => isDisabledControl(s))).toBe(false);
  });
});
