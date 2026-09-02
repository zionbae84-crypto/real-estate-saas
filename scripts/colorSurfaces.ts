import { readFileSync } from "node:fs";

/**
 * 이 저장소의 색 계산과 "글자가 실제로 앉는 면"을 한 곳에 모은다.
 *
 * **왜 모듈로 뺐는가.** 예전에는 이 계산이 `scripts/seed-semantic-tokens.test.ts`
 * 안에만 있었다. 그 파일 밖에서 같은 면(영상 위 스크림)의 대비를 재려면
 * 숫자나 함수를 베껴야 하는데, 이 저장소는 그 사본이 조용히 낡는 사고를
 * 이미 여러 번 겪었다(같은 파일의 `SCRIM_PANEL_ALPHA` 주석 참고 — 그래서
 * 불투명도조차 CSS에서 읽는다). `scripts/seed-vendor-colors.test.ts`가
 * 같은 스크림 바닥을 필요로 하게 되면서, 두 검사가 **같은 한 곳**에서
 * 면과 대비 공식을 읽도록 여기로 옮겼다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로 CSS
 * 소스를 직접 읽기 때문이다(`src/no-network.test.ts`가 `src/` 안의 `node:`
 * 임포트를 금지한다 — `scripts/printCss.test.ts`의 같은 주석 참고).
 */

/** WCAG 본문 크기 텍스트 최소 대비율. */
export const BODY_TEXT_MIN_RATIO = 4.5;

/* ── WCAG 상대 휘도 → 대비율. 순수 함수다. ────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** `fg`를 불투명도 `alpha`로 `bg` 위에 얹었을 때의 합성색 */
export function composite(fg: string, alpha: number, bg: string): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return toHex([
    alpha * f[0] + (1 - alpha) * b[0],
    alpha * f[1] + (1 - alpha) * b[1],
    alpha * f[2] + (1 - alpha) * b[2],
  ] as [number, number, number]);
}

/*
 * ══════════════════════════════════════════════════════════════════
 * 색 토큰 해석기 — 소스에서 값을 읽는다
 * ══════════════════════════════════════════════════════════════════
 *
 * hex를 테스트에 다시 적지 않고 `src/seed-brand.css`·`src/styles.css`에서
 * 그대로 읽어 `var()` 사슬을 끝까지 푼다 — 값을 옮겨 적으면 그 사본이
 * 조용히 낡는다(팔레트를 교체할 때 이 저장소가 실제로 겪은 일이다).
 */

export const BRAND_CSS = readFileSync("src/seed-brand.css", "utf8");
export const STYLES_CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 소스. 주석 안의 예시 값이 정의로 잡히지 않게 한다. */
export const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

export const CUSTOM_PROPERTIES: Record<string, string> = (() => {
  const defs: Record<string, string> = {
    /*
     * SEED가 자기 base.css에서 주는 값이라 우리 소스에는 정의가 없다.
     * `.print-button`의 흰 글자가 이것을 쓴다 — 여기 적어 두지 않으면
     * 그 규칙이 "풀 수 없는 값"으로 남아 검사에서 조용히 빠진다.
     */
    "--seed-color-palette-static-white": "#ffffff",
  };
  for (const css of [stripComments(BRAND_CSS), stripComments(STYLES_CSS)]) {
    for (const m of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
      // 먼저 정의된 쪽이 이긴다 — seed-brand.css가 팔레트의 출처다.
      if (defs[m[1]!] === undefined) defs[m[1]!] = m[2]!.trim();
    }
  }
  return defs;
})();

/** `var(--a)` → `var(--b)` → `#rrggbb` 사슬을 끝까지 푼다. 못 풀면 null. */
export function resolveColor(value: string, depth = 0): string | null {
  if (depth > 10) return null;
  const v = value.trim();
  const varMatch = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (varMatch !== null) {
    const next = CUSTOM_PROPERTIES[varMatch[1]!];
    return next === undefined ? null : resolveColor(next, depth + 1);
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  return null;
}

/** 팔레트 토큰의 hex. 못 풀면 던진다 — 조용히 빠지면 검사가 공허해진다. */
export function rawToken(name: string): string {
  const hex = resolveColor(`var(${name})`);
  if (hex === null) throw new Error(`${name}을 hex로 풀 수 없다`);
  return hex;
}

/**
 * 스크림 아래에 깔리는 영상에서 **가장 밝은 픽셀**.
 *
 * `src/seed-brand.css` 머리주석은 영상의 평균색을 rgb(104, 117, 132)로
 * 적어 두었지만, 여기서는 평균을 쓰지 않는다. 브라우저에서 실제로 재
 * 봤더니(dev 서버 4173, `<video>`를 캔버스에 그려 픽셀 읽기, t = 0·3·
 * 6·9·12·15초) **입력 패널이 덮는 왼쪽 열의 평균은 rgb(123~135,
 * 139~150, 153~162)로 전체 평균보다 밝았고, 그 안에 순백(255,255,255)
 * 픽셀이 매 프레임 있었다.** 평균으로 계산했다면 실제 최악의 자리보다
 * 낙관적인 숫자를 못박게 된다.
 *
 * 그래서 기준을 **가장 밝은 픽셀**로 잡는다 — 이 기준을 통과하면 영상의
 * 어느 프레임, 어느 픽셀 위에서도 통과한다.
 */
export const VIDEO_BRIGHTEST = "#ffffff";

/**
 * 입력 패널(화면 1)이 실제로 앉는 면의 불투명도.
 *
 * `.entry-screen-panel`은 자기 배경이 없다 — 그 글자들은 `--ink`가
 * 아니라 **영상 위에 깔린 스크림 그라디언트** 위에 앉는다. 패널이 덮는
 * 범위에서 스크림이 가장 옅어지는 지점의 불투명도를 `styles.css`가
 * `--scrim-panel-alpha`로 선언하고, 여기서 그 값을 읽어 합성한다.
 *
 * **CSS에서 읽는 것이 핵심이다.** 이 숫자를 테스트에 베껴 적으면,
 * 누가 그라디언트를 옅게 바꾸는 날 화면만 조용히 나빠지고 검사는 옛
 * 숫자로 계속 통과한다.
 */
export const SCRIM_PANEL_ALPHA = (() => {
  const m = stripComments(STYLES_CSS).match(/--scrim-panel-alpha:\s*([0-9.]+)\s*;/);
  if (m === null) {
    throw new Error(
      "styles.css에 --scrim-panel-alpha가 없다 — 입력 패널이 앉는 면의 불투명도는 CSS가 선언하고 이 테스트가 읽는다",
    );
  }
  return Number.parseFloat(m[1]!);
})();

/**
 * 화면 1(`.entry-screen`)의 글자가 앉는 **가장 불리한** 면.
 * 영상의 가장 밝은 픽셀 위에 스크림 바닥을 합성한 값이다(계산값 #2a2f35).
 */
export const SCRIM_FLOOR = composite(
  rawToken("--ink"),
  SCRIM_PANEL_ALPHA,
  VIDEO_BRIGHTEST,
);
