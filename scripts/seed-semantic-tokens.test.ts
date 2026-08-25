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

describe("등급색 대비율 — 흰 배경(#ffffff), 본문 크기 기준 4.5:1", () => {
  it("safe(#15803d)", () => {
    expect(contrastRatio("#15803d", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("caution(#b45309)", () => {
    expect(contrastRatio("#b45309", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("danger(#b91c1c)", () => {
    expect(contrastRatio("#b91c1c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * 지도 마커 가격 3분위(low/mid/high) 배경-텍스트 대비율.
 * src/styles.css .complex-map-marker--{low,mid,high}와 src/seed-brand.css의
 * 실제 값을 그대로 옮겨 계산한다. 예전 값(low #7cc4f5 + 흰 텍스트 ~1.9:1,
 * mid bg-brand-solid #3ba6f1 + 흰 텍스트 ~2.7:1, high
 * bg-brand-solid-pressed #3398e1 + 흰 텍스트 ~3.1:1)은 셋 다 이 기준을
 * 못 넘었다(review 발견) — 지금은 low/mid를 옅은 배경+어두운 글자로,
 * high를 진한 배경+흰 글자로 바꿔 셋 다 넘긴다.
 */
describe("지도 마커 티어 대비율 — 배경 대비 텍스트, 본문 크기 기준 4.5:1", () => {
  it("low: bg #c1e1f7(bg-brand-weak) / text #0c0a09(fg-neutral)", () => {
    expect(contrastRatio("#c1e1f7", "#0c0a09")).toBeGreaterThanOrEqual(4.5);
  });
  it("mid: bg #3ba6f1(bg-brand-solid) / text #0c0a09(fg-neutral)", () => {
    expect(contrastRatio("#3ba6f1", "#0c0a09")).toBeGreaterThanOrEqual(4.5);
  });
  it("high: bg #0f5f96(bg-tier-high, 신규) / text #ffffff(palette-static-white)", () => {
    expect(contrastRatio("#0f5f96", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
