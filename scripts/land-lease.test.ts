import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import rawLandLeaseRules from "../rules/land-lease-2026-08.json";

/**
 * 토지임대부 표시가 **구조적으로** 흔들리지 않는지 소스에서 직접 본다.
 *
 * 렌더링 테스트(`src/components/LandLeaseNote.test.tsx`)는 "지금 화면에
 * 나오는가"를 본다. 이 파일이 보는 것은 그것과 다르다 — 문구가 룰셋
 * 밖으로 새어 나갔는지, 세 화면이 정말 같은 컴포넌트를 쓰는지, `null`을
 * "아님"으로 접는 갈래가 코드에 다시 생겼는지, 색이 뜻을 되돌려 주는지다.
 * 이런 것들은 렌더 한 번으로는 드러나지 않고, 드러날 때는 이미 화면이
 * 조용히 낙관적으로 말하고 있다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * 소스를 직접 읽는 빌드 타임 검사이기 때문이다(`window-label`·
 * `rights-color`·`printCss`와 같은 자리). `src/no-network.test.ts`가
 * `src/` 안에서 Node 내장 모듈 임포트를 금지한다.
 */

/** 토지임대부 표시를 붙이기로 한 세 화면 */
const SCREENS = [
  "src/components/ComplexList.tsx",
  "src/components/ComplexDetail.tsx",
  "src/components/PriceCheck.tsx",
] as const;

const CSS = readFileSync("src/styles.css", "utf8");
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** `src` 아래 tsx/ts에서 테스트 파일을 뺀 것 */
function uiSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return uiSourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** 룰셋의 사용자 문구(밑줄 키는 내부 주석이라 뺀다) */
function ruleStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(ruleStrings);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      key.startsWith("_") ? [] : ruleStrings(entry),
    );
  }
  return [];
}

/** 한 선택자에 걸린 규칙의 선언부를 모은다(rights-color.test.ts와 같은 파서) */
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

describe("세 화면이 모두 같은 표시를 붙인다", () => {
  it.each(SCREENS)("%s가 LandLeaseNote를 들여온다", (path) => {
    const code = readFileSync(path, "utf8");
    expect(code).toMatch(
      /import\s*\{\s*LandLeaseNote\s*\}\s*from\s*["']\.\/LandLeaseNote["']/,
    );
  });

  it.each(SCREENS)("%s가 landLeasehold를 실제로 넘긴다", (path) => {
    const code = stripComments(readFileSync(path, "utf8"));
    expect(code).toMatch(/<LandLeaseNote[^>]*landLeasehold=\{unit\.landLeasehold\}/);
  });

  it("검사기가 배선이 끊긴 것을 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = stripComments(
      readFileSync("src/components/ComplexList.tsx", "utf8"),
    ).replace("<LandLeaseNote landLeasehold={unit.landLeasehold} />", "");
    expect(poisoned).not.toMatch(/<LandLeaseNote/);
  });
});

describe("문구가 코드가 아니라 룰셋에서 온다", () => {
  // 한글이 든 문구만 본다. `version`·`effectiveFrom`은 사람이 읽는
  // 문구가 아니고, 마침 파일 이름과 같아서 임포트 경로에 걸린다.
  const strings = ruleStrings(rawLandLeaseRules).filter(
    (s) => s.length > 8 && /[가-힣]/.test(s),
  );
  const sources = uiSourceFiles("src");

  it("검사할 문구와 소스가 실제로 있다(전제)", () => {
    expect(strings.length).toBeGreaterThan(3);
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each(strings)("소스 어디에도 %s가 박혀 있지 않다", (text) => {
    const offenders = sources.filter((file) =>
      readFileSync(file, "utf8").includes(text),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * 등급 이름(`grade.label`)은 짧아서 위 길이 필터(8자 초과)에 걸리지
   * 않는다. 그런데 이 글자야말로 화면에서 "안전" 자리에 들어가는
   * **판정 그 자체**라, 코드에 박히면 룰셋을 고쳐도 화면이 안 바뀐다.
   * 따로 본다.
   */
  it("등급 이름도 소스에 박혀 있지 않다", () => {
    const label = (rawLandLeaseRules as { grade: { label: string } }).grade.label;
    expect(label.length).toBeGreaterThan(0);
    // 주석은 걷어낸다 — 이 저장소의 주석은 등급 이름을 인용해 설명한다.
    const offenders = sources.filter((file) =>
      stripComments(readFileSync(file, "utf8")).includes(`"${label}"`),
    );
    expect(offenders).toEqual([]);
  });

  it("검사기가 박아 넣은 문구를 실제로 잡아낸다(변이 검사)", () => {
    const badge = strings[0] ?? "";
    expect(badge.length).toBeGreaterThan(0);
    const poisoned = `<span className="land-lease-badge">${badge}</span>`;
    expect(poisoned.includes(badge)).toBe(true);
  });
});

describe('`null`을 "아님"으로 접는 갈래가 코드에 없다', () => {
  const sources = uiSourceFiles("src");

  /**
   * `landLeasehold !== "Y"`·`landLeasehold === "Y" ? … : …`처럼 세 값을
   * 둘로 접는 표현. `null`(모름)이 `"N"`(아님)과 같은 자리로 가는 바로
   * 그 모양이다. 갈래는 `src/lib/land-lease/notice.ts` 한 곳에만 있어야
   * 하고, 거기서는 **`"N"`만** 걸러낸다.
   */
  const FOLDING = /landLeasehold\s*!==\s*"Y"|landLeasehold\s*===\s*"Y"/;

  it("어느 소스도 landLeasehold를 두 갈래로 접지 않는다", () => {
    const offenders = sources.filter((file) =>
      FOLDING.test(stripComments(readFileSync(file, "utf8"))),
    );
    expect(offenders).toEqual([]);
  });

  it("갈래를 내는 곳은 notice.ts 하나다", () => {
    const notice = readFileSync("src/lib/land-lease/notice.ts", "utf8");
    // "N"만 걸러내고 나머지는 전부 표시로 보낸다.
    expect(stripComments(notice)).toMatch(/value\s*===\s*"N"/);
  });

  it("검사기가 접는 갈래를 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = 'const notice = unit.landLeasehold !== "Y" ? null : copy;';
    expect(FOLDING.test(poisoned)).toBe(true);
  });
});

describe("토지임대부 표시의 색", () => {
  const SELECTORS = [".land-lease-note", ".land-lease-badge"] as const;

  it.each(SELECTORS)("%s에 색 규칙이 실제로 있다(전제)", (selector) => {
    expect(declarationsFor(DECLARATIONS, selector).length).toBeGreaterThan(0);
  });

  /**
   * 어느 상태에서도 이 표시는 "괜찮다"는 말이 아니다 — 하나는 매달
   * 나가는 돈이 우리 계산 밖에 더 있다는 뜻이고, 다른 하나는 그것조차
   * 모른다는 뜻이다. 예산 배지의 "안전" 색을 빌려 오면 화면에서 먼저
   * 읽히는 색이 문장을 되돌려 준다(`rights-color.test.ts`와 같은 규칙).
   */
  it.each(SELECTORS)("%s가 '안전' 색을 쓰지 않는다", (selector) => {
    for (const body of declarationsFor(DECLARATIONS, selector)) {
      expect(body, body).not.toMatch(/var\(\s*--safe\s*\)/);
      expect(body, body).not.toMatch(/--seed-color-fg-positive/);
    }
  });

  it("검사기가 '안전' 색을 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = DECLARATIONS.replace(
      ".land-lease-badge {\n  font-weight: 700;\n  color: var(--caution);",
      ".land-lease-badge {\n  font-weight: 700;\n  color: var(--safe);",
    );
    expect(poisoned).not.toBe(DECLARATIONS);
    const bodies = declarationsFor(poisoned, ".land-lease-badge");
    expect(bodies.some((b) => /var\(\s*--safe\s*\)/.test(b))).toBe(true);
  });

  it("하드코딩한 색을 늘리지 않는다", () => {
    for (const selector of SELECTORS) {
      for (const body of declarationsFor(DECLARATIONS, selector)) {
        expect(body, body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(body, body).not.toMatch(/\b(rgb|hsl)a?\(/);
      }
    }
  });
});

/**
 * "어디서 확인하라"는 줄(`checkNote`)은 **월 갈래에만** 붙는다
 * (`LandLeaseNote.tsx`). 금액을 지어내지 않는 대신 반드시 해야 하는
 * 말이라 화면에서 사라지면 안 되는데, 호가 갈래에서 뺄 수 있는 근거는
 * 하나뿐이다 — **호가 화면은 혼자 뜨지 않는다.** `PriceCheck`를 그리는
 * 곳이 단지 상세 하나뿐이고, 거기서는 월 갈래가 먼저 같은 문장을
 * 말한다. 그 전제가 깨지면(누가 `PriceCheck`를 다른 화면에 붙이면)
 * 그 화면에서 이 문장이 통째로 사라지므로, 전제를 소스에서 잠근다.
 */
describe("호가 화면은 혼자 뜨지 않는다", () => {
  const RENDERS_PRICE_CHECK = /<PriceCheck[\s/>]/;

  function hostsOfPriceCheck(): string[] {
    return uiSourceFiles("src").filter((file) =>
      RENDERS_PRICE_CHECK.test(stripComments(readFileSync(file, "utf8"))),
    );
  }

  it("PriceCheck를 그리는 곳은 단지 상세 하나다", () => {
    expect(hostsOfPriceCheck()).toEqual(["src/components/ComplexDetail.tsx"]);
  });

  it("단지 상세가 월 갈래를 함께 그린다", () => {
    const code = stripComments(
      readFileSync("src/components/ComplexDetail.tsx", "utf8"),
    );
    // variant를 주지 않으면 월 갈래다(LandLeaseNote의 기본값).
    expect(code).toMatch(/<LandLeaseNote\s+landLeasehold=\{unit\.landLeasehold\}\s*\/>/);
  });

  it("검사기가 다른 화면의 PriceCheck를 실제로 잡아낸다(변이 검사)", () => {
    expect(RENDERS_PRICE_CHECK.test("<PriceCheck unit={u} budget={b} />")).toBe(
      true,
    );
    expect(RENDERS_PRICE_CHECK.test('import { PriceCheck } from "./PriceCheck";')).toBe(
      false,
    );
  });
});
