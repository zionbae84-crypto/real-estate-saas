import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * SEED 브랜드 토큰 재정의가 빠짐없이 덮여 있는지 검사한다.
 *
 * SEED의 기본 브랜드 색은 carrot(당근 주황)이고, 이 서비스는 그것을 blue로
 * 바꿔 쓴다(`src/seed-brand.css`). 문제는 **그 재정의가 공식 문서가 보장하는
 * 경로가 아니라는 것**이다. SEED를 올렸을 때 브랜드 토큰이 하나 추가되면
 * 우리는 그것을 덮지 않았다는 사실을 알 방법이 없고, 그 토큰을 쓰는
 * 컴포넌트만 조용히 주황색으로 렌더링된다.
 *
 * 그래서 설치된 SEED CSS에서 브랜드 토큰 목록을 **매번 다시 뽑아** 우리
 * 재정의 파일과 대조한다. 목록을 이 파일에 하드코딩하면 같은 결함이
 * 그대로 재발한다 — 검사 대상이 실제 패키지가 아니라 우리 기억이 된다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** 하는 일이 UI 동작
 * 검증이 아니라 설치된 패키지를 들여다보는 빌드 타임 검사이기 때문이다.
 * `src/no-network.test.ts`는 `src/` 안에서 Node 내장 모듈 임포트를 금지하고,
 * 자기 자신 하나만 면제하며, 면제가 늘어나지 않는지 검사하는 테스트를 따로
 * 갖고 있다. 면제를 늘리는 대신 성격에 맞는 자리로 옮겼다 — 약속은 그대로
 * 두고 같은 것을 검증한다.
 */

const require = createRequire(import.meta.url);

/** `--seed-color-...brand...` 형태의 커스텀 프로퍼티 이름을 CSS에서 모은다 */
function brandTokenNames(css: string): string[] {
  const matches = css.match(/--seed-color-[a-z-]*brand[a-z-]*(?=\s*:)/g) ?? [];
  return [...new Set(matches)].sort();
}


/**
 * base.css에서 어떤 토큰을 정의하는 블록의 셀렉터를 뽑는다.
 *
 * 명시도가 이 재정의의 핵심이다. 맨 `:root`로 덮으면 SEED의
 * `:root[data-seed-color-mode="light-only"]`(명시도가 더 높다)에게 조용히
 * 져서, 파일은 멀쩡히 로드되는데 화면은 주황색으로 남는다. 실제로 한 번
 * 그렇게 짰다가 브라우저에서 확인하고 잡았다.
 */
function selectorDefining(css: string, token: string): string {
  // 주석을 먼저 걷어낸다. 안 그러면 파일 맨 앞 주석 블록이 셀렉터로 딸려온다.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const i = stripped.indexOf(`${token}:`);
  if (i < 0) return "";
  const blockStart = stripped.lastIndexOf("}", i);
  return stripped.slice(blockStart + 1, i).split("{")[0]?.trim() ?? "";
}

const SEED_BASE_CSS = readFileSync(
  require.resolve("@seed-design/css/base.css"),
  "utf8",
);

const seedTokens = brandTokenNames(SEED_BASE_CSS);
const overrideCss = readFileSync("src/seed-brand.css", "utf8");
const overriddenTokens = brandTokenNames(overrideCss);

describe("SEED 브랜드 토큰 재정의", () => {
  it("설치된 SEED CSS에서 브랜드 토큰을 실제로 찾아낸다", () => {
    // 정규식이 아무것도 못 잡으면 아래 대조가 공허하게 통과한다.
    // 이 테스트가 그 상태를 막는다.
    expect(seedTokens.length).toBeGreaterThan(0);
  });

  it("SEED의 모든 브랜드 토큰이 재정의돼 있다", () => {
    const missing = seedTokens.filter(
      (token) => !overriddenTokens.includes(token),
    );
    expect(
      missing,
      "src/seed-brand.css에서 덮이지 않은 브랜드 토큰이 있습니다. " +
        "이대로 두면 해당 토큰을 쓰는 컴포넌트가 당근 주황으로 렌더링됩니다.",
    ).toEqual([]);
  });

  it("존재하지 않는 토큰을 덮고 있지 않다", () => {
    // SEED가 토큰을 없앴는데 우리 파일에 남아 있으면 죽은 코드다.
    const stale = overriddenTokens.filter(
      (token) => !seedTokens.includes(token),
    );
    expect(stale).toEqual([]);
  });

  it("carrot 팔레트를 가리키는 재정의가 남아 있지 않다", () => {
    // 주석의 설명 문장에는 carrot이 등장하므로, 선언부만 본다.
    const declarations = overrideCss.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/carrot/);
  });

  it("SEED의 라이트 모드 셀렉터와 같은 셀렉터로 덮는다", () => {
    // 명시도가 낮으면 재정의가 조용히 진다. 파일에 적혀 있는 것과
    // 실제로 이기는 것은 다른 문제다.
    const seedSelector = selectorDefining(
      SEED_BASE_CSS,
      "--seed-color-bg-brand-solid",
    );
    const ourSelector = selectorDefining(
      overrideCss,
      "--seed-color-bg-brand-solid",
    );

    expect(seedSelector).not.toBe("");
    expect(
      normalize(ourSelector),
      "src/seed-brand.css의 셀렉터가 SEED 라이트 모드 셀렉터와 다릅니다. " +
        "명시도가 낮으면 재정의가 적용되지 않고 화면은 당근 주황으로 남습니다.",
    ).toBe(normalize(seedSelector));
  });
});

/** 셀렉터 비교용: 줄바꿈·연속 공백을 한 칸으로 눌러 표기 차이를 무시한다 */
function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}
