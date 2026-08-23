import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 파이프라인의 집계 창(개월)과 화면·룰셋이 말하는 창이 어긋나면 안 된다.
 *
 * `scripts/pipeline/aggregate.ts`의 `recent`가 `tradeCount`·`minPrice`·
 * `maxPrice`·`lowConfidence`·층 범위를 낸 창이다(`data/README.md` 기준).
 * 그 개월 수는 `src/data/complexes.ts`의 `AGGREGATION_WINDOW_MONTHS` 하나로
 * 모이고, 화면·룰셋 문구는 거기서 만든 라벨을 그대로 써야 한다.
 *
 * 사람이 손으로 쓰는 화면 문구가 파이프라인이 정한 값과 따로 논 것이
 * 이 결함이었다("최근 1년"이라고 말했지만 실제 창은 6개월) — 근거
 * 기간을 두 배로 부풀려 말하면 사용자가 판정을 실제보다 튼튼하다고
 * 믿는다. 이 파일은 값 하나가 "6개월"인지가 아니라, **모든 인용이
 * 같은 근원(`AGGREGATION_WINDOW_MONTHS`)에서 갈라져 나왔는지**를
 * 소스에서 직접 확인한다. 문자열 "6개월"이 어딘가 있으면 통과하는
 * 검사는 이 저장소에서 이미 두 번 헛돌았다(인쇄 CSS 특정도,
 * `<details>` 펼침) — 그래서 여기서는 파서가 실제로 어긋남을
 * 잡아내는지를 변이 검사로 함께 확인한다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** `node:fs`로
 * 소스를 직접 읽는 빌드 타임 검사이기 때문이다. `src/no-network.test.ts`가
 * `src/` 안에서 Node 내장 모듈 임포트를 금지한다.
 */

const AGGREGATE_SRC = readFileSync("scripts/pipeline/aggregate.ts", "utf8");
const COMPLEXES_SRC = readFileSync("src/data/complexes.ts", "utf8");

/** `recent` 창을 실제로 만드는 줄에서 개월 수를 읽는다 */
function pipelineWindowMonths(code: string): number | null {
  const m = code.match(/sixMonthsAgo\s*=\s*monthsBefore\(asOf,\s*(\d+)\)/);
  return m ? Number(m[1]) : null;
}

/** 화면이 근거로 삼아야 하는 단일 상수를 읽는다 */
function exportedWindowMonths(code: string): number | null {
  const m = code.match(/AGGREGATION_WINDOW_MONTHS\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** 주석을 걷어낸 뒤에도 남아 있는 "최근 N개월"·"최근 N년" 직접 표기. 있으면 안 된다 */
function hardcodedWindowMentions(code: string): string[] {
  const matches = stripComments(code).match(/최근\s*\d+\s*(개월|년)/g);
  return matches ?? [];
}

describe("집계 창 상수가 파이프라인 값과 같다", () => {
  it("aggregate.ts에서 recent 창의 개월 수를 읽어낸다(전제)", () => {
    expect(pipelineWindowMonths(AGGREGATE_SRC)).not.toBeNull();
  });

  it("src/data/complexes.ts의 AGGREGATION_WINDOW_MONTHS가 파이프라인과 같다", () => {
    expect(exportedWindowMonths(COMPLEXES_SRC)).toBe(
      pipelineWindowMonths(AGGREGATE_SRC),
    );
  });

  it("파서가 실제로 어긋남을 잡아낸다(변이 검사)", () => {
    // recent 창이 12개월로 바뀌었는데 상수는 그대로인 상황을 흉내낸다.
    const poisoned = AGGREGATE_SRC.replace(
      "monthsBefore(asOf, 6)",
      "monthsBefore(asOf, 12)",
    );
    expect(poisoned).not.toBe(AGGREGATE_SRC);
    expect(pipelineWindowMonths(poisoned)).not.toBe(
      exportedWindowMonths(COMPLEXES_SRC),
    );
  });
});

describe("화면이 집계 창을 직접 인용하지 않고 상수를 쓴다", () => {
  const SCREENS = [
    "src/components/ComplexList.tsx",
    "src/components/ComplexDetail.tsx",
    "src/components/PriceCheck.tsx",
  ] as const;

  it.each(SCREENS)("%s가 AGGREGATION_WINDOW_LABEL을 들여온다", (path) => {
    const code = readFileSync(path, "utf8");
    expect(code).toMatch(
      /import\s*\{\s*AGGREGATION_WINDOW_LABEL\s*\}\s*from\s*["']\.\.\/data\/complexes["']/,
    );
  });

  it.each(SCREENS)(
    "%s의 렌더 코드에 '최근 N개월/년'을 직접 박아 넣은 곳이 없다",
    (path) => {
      const code = readFileSync(path, "utf8");
      expect(hardcodedWindowMentions(code)).toEqual([]);
    },
  );

  it("검사기가 직접 박아 넣은 문구를 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = readFileSync("src/components/ComplexList.tsx", "utf8").replace(
      "{AGGREGATION_WINDOW_LABEL} 거래",
      "최근 1년 거래",
    );
    expect(hardcodedWindowMentions(poisoned)).toEqual(["최근 1년"]);
  });

  it("주석 속 예시 문구는 잡지 않는다(대조군)", () => {
    // src/data/complexes.ts의 TSDoc이 "최근 1년"·"최근 12개월"을
    // 나쁜 예시로 언급한다 — 주석이므로 렌더 결과가 아니다.
    expect(hardcodedWindowMentions(COMPLEXES_SRC)).toEqual([]);
  });
});

describe("룰셋 문구가 인용하는 개월 수가 상수와 같다", () => {
  const RULES = readFileSync("rules/price-2026-08.json", "utf8");
  const windowMonths = exportedWindowMonths(COMPLEXES_SRC);

  /** "최근 N개월"·"최근 N년" 인용을 모두 뽑아 [숫자, 단위]로 돌려준다 */
  function windowMentions(json: string): Array<{ amount: number; unit: string }> {
    const out: Array<{ amount: number; unit: string }> = [];
    const re = /최근\s*(\d+)\s*(개월|년)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(json)) !== null) {
      out.push({ amount: Number(m[1]), unit: m[2] as string });
    }
    return out;
  }

  it("룰셋에 집계 창을 인용하는 문구가 실제로 있다(전제)", () => {
    expect(windowMentions(RULES).length).toBeGreaterThan(0);
  });

  it.each(windowMentions(RULES))(
    "인용 %j이 개월 단위이고 상수와 같은 숫자다",
    (mention) => {
      expect(mention.unit).toBe("개월");
      expect(mention.amount).toBe(windowMonths);
    },
  );

  it("검사기가 '년' 단위 인용을 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = RULES.replace(/최근 6개월/g, "최근 1년");
    const mentions = windowMentions(poisoned);
    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.every((m) => m.unit === "개월")).toBe(false);
  });

  it("검사기가 틀린 개월 수 인용을 실제로 잡아낸다(변이 검사)", () => {
    const poisoned = RULES.replace(/최근 6개월/g, "최근 12개월");
    const mentions = windowMentions(poisoned);
    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.every((m) => m.amount === windowMonths)).toBe(false);
  });
});
