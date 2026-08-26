import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

const overrideCss = readFileSync("src/seed-brand.css", "utf8");

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
  "--seed-color-bg-tier-high",
];

describe("SEED 의미 계층 토큰 확장", () => {
  it.each(EXTENDED_TOKENS)("%s가 seed-brand.css에서 오버라이드된다", (token) => {
    expect(overrideCss).toContain(`${token}:`);
  });
});

/** WCAG 상대 휘도 → 대비율 계산. 순수 함수라 이 파일 안에 직접 둔다. */
function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

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
 * 지도 마커 가격 3분위(low/mid/high) 배경-텍스트 대비율.
 * src/styles.css .complex-map-marker--{low,mid,high}와 src/seed-brand.css의
 * 실제 값을 그대로 옮겨 계산한다.
 *
 * 2026-08-26 팔레트 교체로 low/mid의 배경이 cyan 계열에서 황동 계열로
 * 바뀌었다. low(#f3e2c4, 옅은 황동)는 여전히 어두운 글자(on-sheet,
 * #15202b)와 짝짓고, mid(#8a5f14, --brass-ink — 그 자체가 어둡다)는
 * 어두운 글자와 짝지으면 2.93:1로 4.5:1을 못 넘어 흰 글자로 바꿨다.
 * high(bg-tier-high, #0f5f96)는 design.md 지시대로 이번 교체에서 값을
 * 건드리지 않았다 — Task 4가 "가격대"에서 "부담 수준"으로 뜻을 바꿀 때
 * 함께 바뀐다.
 */
describe("지도 마커 티어 대비율 — 배경 대비 텍스트, 본문 크기 기준 4.5:1", () => {
  it("low: bg #f3e2c4(bg-brand-weak) / text #15202b(fg-neutral/on-sheet)", () => {
    expect(contrastRatio("#f3e2c4", "#15202b")).toBeGreaterThanOrEqual(4.5);
  });
  it("mid: bg #8a5f14(bg-brand-solid/brass-ink) / text #ffffff(palette-static-white)", () => {
    expect(contrastRatio("#8a5f14", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("high: bg #0f5f96(bg-tier-high, 이번 교체에서 값 유지) / text #ffffff(palette-static-white)", () => {
    expect(contrastRatio("#0f5f96", "#ffffff")).toBeGreaterThanOrEqual(4.5);
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
 * 짝을 계산한다(task-1-brief.md Step 2가 요구하는 목록). 이 토큰들은
 * src/seed-brand.css에 원시 커스텀 프로퍼티(--ink, --paper, --sheet,
 * --on-sheet 등)로 정의돼 있고, 아직 이 화면(영상 히어로·전체화면 지도)을
 * 그리는 CSS가 없어(Task 2~5) SEED 의미 토큰처럼 소스에서 사용처를
 * 검사할 수는 없다 — 그래서 여기서는 값 자체의 대비율만 못박는다.
 */
describe("design.md §1 — 밝은 면·어두운 면 대비율(Task 2~5가 쓸 값)", () => {
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
