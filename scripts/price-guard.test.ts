import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 호가 위치 화면의 **구조적** 약속을 소스·CSS에서 직접 확인한다.
 *
 * `scripts/purchase-structure.test.ts`와
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

  /**
   * ⚠ **`priceBudget:` 바로 뒤에 객체 리터럴이 오지 않는다.** 단지 상세가
   * 실거주 프로필 없이도 열리게 되면서(가격을 넣기 전에도 주소·평형·
   * 실거래 내역은 보여준다) 이 값이 `residentialProfile === null ? null :
   * {...}` 꼴이 됐다. 그래도 **이 검사가 지키는 것은 그대로다** —
   * 객체가 실제로 만들어질 때 그 `profile`이 `residentialProfile`인가.
   * 그 사이의 널 가드만 건너뛰고 본다(아래 변이 검사가 여전히
   * `effectiveProfile`로 바꿔치기하는 것을 잡는다).
   */
  function gatesPriceBudget(code: string): boolean {
    return /priceBudget:[\s\S]{0,160}?\{\s*profile:\s*residentialProfile,/.test(
      code,
    );
  }

  it("App이 priceBudget에 residentialProfile을 넘긴다", () => {
    expect(gatesPriceBudget(APP)).toBe(true);
  });

  it("다른 프로필을 넘기면 잡아낸다(변이 검사)", () => {
    // `priceBudget:` 바로 뒤가 널 가드라, 바꿔치기할 문자열은 실제로
    // 객체를 만드는 쪽이다(위 `gatesPriceBudget` 문서 참고).
    const poisoned = APP.replace(
      "{ profile: residentialProfile, financeRules: rules }",
      "{ profile: effectiveProfile, financeRules: rules }",
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

describe("층으로 값을 보정하는 경로가 없다", () => {
  /**
   * 집계가 층 범위를 함께 내보내게 되면서 생긴 새 위험이다.
   *
   * 층을 알게 된 다음의 자연스러운 다음 걸음은 "그럼 저층이면 얼마쯤
   * 빼야지"다. 그건 감정평가 영역이고, 이 앱이 `medianPrice`를 화면에서
   * 뺀 것과 정확히 같은 이유로 하면 안 된다. 층은 사용자가 자기가 보는
   * 매물과 **스스로** 견주라고 주는 사실일 뿐이다.
   *
   * 값 하나가 맞는지가 아니라 **그 결론에 닿는 경로가 소스에 존재하지
   * 않는지**를 잠근다(이 파일의 다른 검사들과 같은 태도다).
   */
  const FLOOR_FIELDS = /minFloor|maxFloor|unknownFloorCount/;
  /** 층수를 값으로 만드는 순간 나타나는 것들: 산술 연산자와 가격 식별자 */
  const ARITHMETIC = /[*/%+]|(?<![<>=!-])-(?![->])/;
  const PRICE_IDENTIFIERS = /minPrice|maxPrice|askingPrice|aboveMaxRatio|Won/;

  function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  /** 층 필드를 값으로 쓰는(=계산에 넣는) 줄들. 없어야 한다 */
  function floorArithmeticLines(code: string): string[] {
    return stripComments(code)
      .split("\n")
      .filter(
        (line) =>
          FLOOR_FIELDS.test(line) &&
          (ARITHMETIC.test(line) || PRICE_IDENTIFIERS.test(line)),
      )
      .map((line) => line.trim());
  }

  const SOURCES = [
    "src/lib/price/assess.ts",
    "src/lib/price/rules.ts",
    "src/lib/price/types.ts",
    "src/components/PriceCheck.tsx",
  ] as const;

  it.each(SOURCES)("%s에서 층 값이 어떤 계산에도 들어가지 않는다", (path) => {
    const found = floorArithmeticLines(readFileSync(path, "utf8"));
    expect(found, found.join("\n")).toEqual([]);
  });

  it("호가가 놓인 자리를 정하는 함수가 층을 아예 보지 않는다", () => {
    // bandOf는 호가와 관측 범위만으로 밴드를 정한다. 여기에 층이 들어오면
    // 그 순간 "이 층이면 이 밴드"라는 층 보정이 된다.
    const assess = stripComments(readFileSync("src/lib/price/assess.ts", "utf8"));
    const bandOf = assess.slice(
      assess.indexOf("function bandOf("),
      assess.indexOf("function budgetFinding("),
    );
    expect(bandOf).not.toBe("");
    expect(bandOf).not.toMatch(FLOOR_FIELDS);

    const gate = assess.slice(
      assess.indexOf("function evidenceGate("),
      assess.indexOf("function positionFinding("),
    );
    expect(gate).not.toBe("");
    // 표본 조건(유보 여부)도 층을 보지 않는다 — 층을 알게 됐다고 임계값이
    // 느슨해지면 안 된다.
    expect(gate).not.toMatch(FLOOR_FIELDS);
  });

  it.each([
    ["초과분을 층으로 깎는 경우", "  const excess = (askingPrice - evidence.maxPrice) / evidence.minFloor;"],
    ["층으로 가격을 보정하는 경우", "  const adjusted = evidence.maxPrice * (1 + evidence.maxFloor * 0.01);"],
    ["층을 가격 판정에 끌어들이는 경우", "  if (askingPrice > evidence.maxPrice && evidence.maxFloor > 10) return 'within';"],
  ])("검사기가 %s를 잡아낸다(변이 검사)", (_label, poisoned) => {
    expect(floorArithmeticLines(poisoned)).toHaveLength(1);
  });

  it("층이 없는 평범한 산술은 잡지 않는다(대조군)", () => {
    expect(
      floorArithmeticLines("  const excess = (askingPrice - max) / max;"),
    ).toEqual([]);
  });

  it("층을 문장에 끼워 넣기만 하는 줄은 잡지 않는다(대조군)", () => {
    expect(
      floorArithmeticLines(
        "      ? fill(d.floorSameNote, { floor: String(minFloor) })",
      ),
    ).toEqual([]);
  });
});
