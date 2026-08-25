import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 구매 유형 분기의 **구조적** 약속을 소스에서 직접 확인한다.
 *
 * 값 하나가 맞는지가 아니라 "그 계산에 닿는 경로가 존재하지 않는지"를
 * 잠그는 검사다. `src/no-network.test.ts`가 네트워크 약속을 소스 스캔으로
 * 지키는 것과 같은 태도다.
 *
 * ## 무엇을 지키는가
 *
 * `rules/2026-08.json`의 LTV·DSR·절대상한은 전부 **실거주 매수를
 * 전제로** 고시된 값이다. 임대사업자대출·다주택자 LTV·전세 낀 매수의
 * 한도는 그 룰셋에 없다. 그러므로 갭투자·월세 수익형에서
 * `calcMaxLoan`·`calcAffordablePrice`·`calcSafePrice`를 쓰면 실거주 기준
 * 한도를 투자 목적 매수에 적용하는 것이 되고, **빌릴 수 있는 돈을 과대
 * 계상하는** 정확히 최악의 결함이 된다.
 *
 * 화면에서 숨기는 것만으로는 부족하다. 계산이 돌고 있으면 언젠가 그 값이
 * 다른 자리로 새어 나온다. 그래서 (1) 구매 유형 모듈이 그 함수들을 아예
 * 부르지 않는지, (2) App이 실거주가 아닐 때 프로필을 넘기지 않아 계산
 * 자체가 일어나지 않는지를 둘 다 확인한다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * 소스를 직접 읽는 빌드 타임 검사이기 때문이다(`printCss.test.ts`와
 * 같은 이유).
 */

/** 실거주 대출 한도로 내려가는 진입점들 */
const RESIDENTIAL_LOAN_FUNCTIONS = [
  "calcMaxLoan",
  "calcAffordablePrice",
  "calcSafePrice",
  "calcPolicyLimit",
  "buildComplexList",
  "useAffordability",
] as const;

/**
 * 주석을 걷어낸다.
 *
 * 필요하다 — 이 저장소의 주석은 금지된 함수 이름을 **설명하려고** 그대로
 * 적는다(예: assess.ts의 "calcMaxLoan…을 여기서 쓰면 과대 계상된다").
 * 주석까지 세면 그 설명을 지우게 되는데, 그건 이 결정을 기록으로 남기지
 * 말라는 말이 된다.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/**
 * 문자열 리터럴의 속을 비운다.
 *
 * 모듈 경로가 함수 이름을 품고 있는 경우를 호출로 세지 않기 위해서다 —
 * `usePurchaseCheck.ts`는 실거주 룰셋(`rules/2026-08.json`을 이미 파싱해
 * 둔 값)을 `"./useAffordability"`에서 가져오는데, 그건 훅을 부르는 것이
 * 아니라 **같은 룰셋 객체를 두 번 파싱하지 않으려는** 것이다. 이름이
 * 코드에 식별자로 등장하면(임포트든 호출이든) 여전히 잡힌다.
 */
function stripStrings(source: string): string {
  return source
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** 그 소스가 식별자로 쓰는(주석·모듈 경로가 아닌) 실거주 한도 함수 이름들 */
function residentialLoanCallsIn(source: string): string[] {
  const code = stripStrings(stripComments(source));
  return RESIDENTIAL_LOAN_FUNCTIONS.filter((name) =>
    new RegExp(`\\b${name}\\b`).test(code),
  );
}

/** 투자 유형에서 대출 한도 계산에 닿을 수 있는 파일들 */
const INVESTMENT_SOURCES = [
  ...sourceFiles("src/lib/purchase"),
  "src/components/PurchaseCheck.tsx",
  "src/components/PurchaseVerdict.tsx",
  "src/components/PurchaseTypeSelect.tsx",
  "src/state/usePurchaseCheck.ts",
];

const APP = readFileSync("src/App.tsx", "utf8");
const APP_CODE = stripComments(APP);

describe("갭투자·월세 수익형은 실거주 대출 한도를 쓰지 않는다", () => {
  it("검사할 파일을 실제로 찾는다(전제)", () => {
    // 파일을 못 찾으면 아래 검사가 공허하게 통과한다.
    expect(INVESTMENT_SOURCES.length).toBeGreaterThan(5);
    expect(INVESTMENT_SOURCES).toContain("src/lib/purchase/assess.ts");
  });

  it.each(INVESTMENT_SOURCES)("%s는 실거주 한도 함수를 부르지 않는다", (file) => {
    expect(residentialLoanCallsIn(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("그 파일들이 부대비용 계산은 그대로 재사용한다(대조군)", () => {
    // 금지 목록이 과하게 넓어져 재사용까지 막고 있지는 않은지 확인한다.
    // 취득세·중개보수는 구매 유형과 무관해서 실거주 경로와 같은 함수를
    // 쓰는 것이 맞다.
    const assess = readFileSync("src/lib/purchase/assess.ts", "utf8");
    expect(stripComments(assess)).toContain("calcAcquisitionCosts");
  });

  it("검사기가 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = `
      import { calcMaxLoan } from "../finance";
      export function x() { return calcMaxLoan(profile, rules, price); }
    `;
    expect(residentialLoanCallsIn(poisoned)).toEqual(["calcMaxLoan"]);
  });

  it("임포트만 해 두어도 잡아낸다(변이 검사)", () => {
    const poisoned = `import { calcSafePrice } from "../finance";`;
    expect(residentialLoanCallsIn(poisoned)).toEqual(["calcSafePrice"]);
  });

  it("모듈 경로에 이름이 들어 있는 것은 세지 않는다(오탐 방지 확인)", () => {
    const onlyPath = `import { rules } from "./useAffordability";`;
    expect(residentialLoanCallsIn(onlyPath)).toEqual([]);
  });

  it("주석 안의 이름은 호출로 세지 않는다(오탐 방지 확인)", () => {
    const onlyComment = `
      // calcMaxLoan을 여기서 쓰면 과대 계상된다.
      /* calcSafePrice도 마찬가지다. */
      export const x = 1;
    `;
    expect(residentialLoanCallsIn(onlyComment)).toEqual([]);
  });
});

describe("App은 실거주가 아니면 한도 계산 자체를 하지 않는다", () => {
  /**
   * 실거주가 아닐 때 프로필을 `null`로 끊는 배선이 그대로 있는지 본다.
   *
   * `useAffordability(null)`은 어떤 계산도 하지 않고 `null`을 돌려준다
   * (그 훅의 useMemo가 전부 `profile === null`에서 멈춘다). 그래서 이
   * 한 줄이 "투자 목적 매수에 실거주 한도를 쓰지 않는다"를 지키는
   * 자리다.
   */
  function gatesAffordability(code: string): boolean {
    return (
      /const\s+residentialProfile\s*=\s*\n?\s*purchaseType === "실거주" \? effectiveProfile : null;/.test(
        code,
      ) && /useAffordability\(residentialProfile\)/.test(code)
    );
  }

  /** 단지 목록도 같은 함수들로 내려간다 — 같은 조건으로 끊어야 한다 */
  function gatesComplexList(code: string): boolean {
    const call = /buildComplexList\(/.exec(code);
    if (call === null) return false;
    const before = code.slice(Math.max(0, call.index - 400), call.index);
    return /purchaseType !== "실거주"/.test(before);
  }

  it("useAffordability에 실거주일 때만 프로필이 간다", () => {
    expect(gatesAffordability(APP_CODE)).toBe(true);
  });

  it("단지 목록도 실거주일 때만 계산된다", () => {
    expect(gatesComplexList(APP_CODE)).toBe(true);
  });

  it("훅에 프로필을 그냥 넘기면 잡아낸다(변이 검사)", () => {
    const poisoned = APP_CODE.replace(
      "useAffordability(residentialProfile)",
      "useAffordability(effectiveProfile)",
    );
    expect(poisoned).not.toBe(APP_CODE);
    expect(gatesAffordability(poisoned)).toBe(false);
  });

  it("목록 계산의 유형 조건을 지우면 잡아낸다(변이 검사)", () => {
    const poisoned = APP_CODE.replace(' || purchaseType !== "실거주"', "");
    expect(poisoned).not.toBe(APP_CODE);
    expect(gatesComplexList(poisoned)).toBe(false);
  });
});

describe("유형별 결론의 색", () => {
  const CSS = readFileSync("src/styles.css", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const CLEAR_SELECTOR = '.purchase-overall[data-verdict="clear"]';

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

  it("clear 결론에 색 규칙이 실제로 있다(전제)", () => {
    expect(declarationsFor(CSS, CLEAR_SELECTOR).length).toBeGreaterThan(0);
  });

  it("clear 결론이 '안전' 색(--safe)을 쓰지 않는다", () => {
    // 권리분석 결론과 같은 이유다 — 글자는 "'안전하다'는 뜻이 아니에요"라고
    // 말하는데 색이 그걸 되돌려 주면 안 된다.
    for (const body of declarationsFor(CSS, CLEAR_SELECTOR)) {
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
