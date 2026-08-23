import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 호가 위치 화면의 **구조적** 약속을 소스·CSS에서 직접 확인한다.
 *
 * `scripts/rights-color.test.ts`·`scripts/purchase-structure.test.ts`와
 * 같은 태도다 — 값 하나가 맞는지가 아니라 "그 결론에 닿는 경로가
 * 존재하지 않는지"를 잠근다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * 파일을 직접 읽는 빌드 타임 검사이기 때문이다. `src/no-network.test.ts`가
 * `src/` 안에서 Node 내장 모듈 임포트를 금지한다.
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 CSS. 주석 안의 예시가 실제 규칙으로 오인되는 것을 막는다 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function declarationsFor(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^{}]*)\\}`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (m[2] !== undefined) out.push(m[2]);
  }
  return out;
}

const CLEAR_SELECTOR = '.price-overall[data-verdict="clear"]';

describe("호가 위치 결론의 색", () => {
  it("clear 결론에 색 규칙이 실제로 있다(전제)", () => {
    expect(declarationsFor(DECLARATIONS, CLEAR_SELECTOR).length).toBeGreaterThan(
      0,
    );
  });

  it("clear 결론이 '안전' 색(--safe)을 쓰지 않는다", () => {
    // 권리분석·구매 유형 결론과 같은 이유다. 이 화면의 clear는
    // "걸리는 게 없었어요"이지 "잘 샀어요"도 "안전해요"도 아닌데,
    // 화면에서 먼저 읽히는 것은 문장이 아니라 색이다.
    for (const body of declarationsFor(DECLARATIONS, CLEAR_SELECTOR)) {
      expect(body, body).not.toMatch(/var\(\s*--safe\s*\)/);
      expect(body, body).not.toMatch(/--seed-color-fg-positive/);
    }
  });

  it("파서가 실제로 --safe를 잡아낸다(변이 검사)", () => {
    const poisoned = `${CLEAR_SELECTOR} { color: var(--safe); }`;
    expect(declarationsFor(poisoned, CLEAR_SELECTOR)[0]).toMatch(
      /var\(\s*--safe\s*\)/,
    );
  });
});

describe("호가 위치의 예산 줄은 실거주 프로필에서만 나온다", () => {
  /**
   * 실거주가 아닐 때 `residentialProfile`은 `null`이고, 그 값이 그대로
   * 호가 위치 확인으로 내려가야 한다. `effectiveProfile`이나 `profile`을
   * 넘기면 실거주 전제의 LTV·DSR로 낸 숫자가 투자 목적 매수 화면에
   * 나타난다 — `purchase-structure.test.ts`가 막는 것과 같은 결함이다.
   */
  const APP = readFileSync("src/App.tsx", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  function gatesPriceBudget(code: string): boolean {
    return /priceBudget:\s*\{\s*profile:\s*residentialProfile,/.test(code);
  }

  it("App이 priceBudget에 residentialProfile을 넘긴다", () => {
    expect(gatesPriceBudget(APP)).toBe(true);
  });

  it("다른 프로필을 넘기면 잡아낸다(변이 검사)", () => {
    const poisoned = APP.replace(
      "priceBudget: { profile: residentialProfile,",
      "priceBudget: { profile: effectiveProfile,",
    );
    expect(poisoned).not.toBe(APP);
    expect(gatesPriceBudget(poisoned)).toBe(false);
  });
});

describe("호가 입력란은 인쇄에서 사라지고 고지는 남는다", () => {
  /**
   * `printCss.test.ts`가 목록 동기화·특정도까지 이미 검사하므로,
   * 여기서는 이 화면 고유의 관계만 못박는다: 조작 장치(입력란)는
   * 숨김 목록에 있고, **판정과 함께 나가야 하는 고지**는 보호
   * 목록에 있다.
   */
  const HIDDEN = readFileSync("src/print/hiddenInPrint.ts", "utf8");

  it("입력란이 숨김 목록에 있다", () => {
    expect(HIDDEN).toContain('".price-check-form"');
  });

  it.each([
    "price-no-estimate",
    "price-verdict",
    "price-overall",
    "price-evidence",
    "price-finding",
    "price-finding-verdict",
    "price-budget-absent",
    "price-disclosure",
    "price-disclaimer",
  ])("%s가 보호 목록에 있다", (cls) => {
    expect(HIDDEN).toContain(`"${cls}"`);
  });
});
