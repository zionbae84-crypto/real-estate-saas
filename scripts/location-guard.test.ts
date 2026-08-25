import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 입지 화면의 **구조적** 약속을 소스·CSS에서 직접 확인한다.
 *
 * `scripts/price-guard.test.ts`·`scripts/purchase-structure.test.ts`와
 * 같은 태도다 — 값 하나가 맞는지가 아니라 "그 결론에 닿는 경로가
 * 존재하지 않는지"를 잠근다.
 *
 * **이 파일이 `src/`가 아니라 `scripts/`에 있는 이유:** 파일을 직접 읽는
 * 빌드 타임 검사이기 때문이다. `src/no-network.test.ts`가 `src/` 안에서
 * Node 내장 모듈 임포트를 금지한다.
 */

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * 문자열 리터럴을 걷어낸다.
 *
 * 숫자 리터럴 검사에만 쓴다 — 룰셋 파일 이름(`location-2026-08.json`)이
 * 임포트 경로 문자열 안에 있어서, 걷어내지 않으면 그 2026이 "거리로 읽힐
 * 숫자"로 잡힌다. 코드가 실제로 계산에 쓰는 숫자만 보려는 것이다.
 */
function stripStrings(code: string): string {
  return code
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

const ENGINE_SOURCES = [
  "src/lib/location/assess.ts",
  "src/lib/location/rules.ts",
  "src/lib/location/types.ts",
  "src/lib/location/distance.ts",
] as const;

const SCREEN_SOURCES = [
  "src/components/LocationFacts.tsx",
  "src/state/useLocationFacts.ts",
] as const;

describe("점수·등급·순위를 만드는 경로가 소스에 없다", () => {
  /**
   * 이 화면이 미끄러질 수 있는 유일한 방향이다. 거리를 재고 나면 다음
   * 걸음은 언제나 "그럼 400m면 몇 점이지"인데, 그건 가치판단을 사실처럼
   * 포장하는 것이고 검증할 수 없다. 이 앱이 `medianPrice`를 화면에서 뺀
   * 것과 정확히 같은 이유로 하면 안 된다.
   *
   * 값 하나가 맞는지가 아니라 **그 결론에 닿는 이름이 소스에 존재하지
   * 않는지**를 잠근다. 점수를 내려면 어딘가에 그 이름을 붙여야 하고,
   * 그 순간 여기서 걸린다.
   */
  const RANKING_IDENTIFIERS =
    /score|ranking|\brank\b|grade|rating|tier|weight|percentile|점수|등급|순위|가중치/i;

  /**
   * 등급을 **부정하는** 자리만 놓아준다.
   *
   * 이 저장소의 다른 예외 목록(`scripts/tone-guard.test.ts`의 EXCEPTIONS)과
   * 같은 규칙이다 — 각 항목에 **왜 예외인지** 적는다. 이유 없이 늘어나면
   * 그물이 무력해진다. 아래 "예외가 실제로 존재한다" 검사가 죽은 예외도
   * 함께 막는다.
   */
  const RANKING_EXCEPTIONS: ReadonlyArray<{ text: string; why: string }> = [
    {
      text: '{ key: "notARatingNote", words: ["점수", "등급", "순위"] },',
      why: "룰셋 파서가 '점수도 등급도 순위도 매기지 않아요' 고지에 그 세 단어가 실제로 들어 있는지 검사하는 줄이다. 등급을 만드는 코드가 아니라, 등급을 부정하는 문장이 비어 있지 않은지 확인하는 코드다.",
    },
    {
      text: "notARating",
      why: "고지 필드 이름(notARatingNote)과 그 data-field. 이 화면에서 rating이라는 말이 등장해도 되는 유일한 자리이고, 뜻은 정반대다.",
    },
  ];

  /** 예외를 순서대로 걷어낸다(긴 것부터 적어 둔다) */
  function stripRatingDenials(code: string): string {
    return RANKING_EXCEPTIONS.reduce(
      (acc, exception) => acc.split(exception.text).join(""),
      code,
    );
  }

  it.each([...ENGINE_SOURCES, ...SCREEN_SOURCES])(
    "%s에 등급을 만드는 이름이 없다",
    (path) => {
      const offenders = stripRatingDenials(
        stripComments(readFileSync(path, "utf8")),
      )
        .split("\n")
        .filter((line) => RANKING_IDENTIFIERS.test(line))
        .map((line) => line.trim());
      expect(offenders, offenders.join("\n")).toEqual([]);
    },
  );

  it("예외가 실제 소스에 존재한다(죽은 예외 방지)", () => {
    const all = [...ENGINE_SOURCES, ...SCREEN_SOURCES]
      .map((path) => stripComments(readFileSync(path, "utf8")))
      .join("\n");
    const stale = RANKING_EXCEPTIONS.filter(
      (exception) => !all.includes(exception.text),
    ).map((exception) => exception.text);
    expect(stale).toEqual([]);
  });

  it("예외마다 이유가 적혀 있다", () => {
    const missing = RANKING_EXCEPTIONS.filter(
      (exception) => exception.why.trim().length < 10,
    ).map((exception) => exception.text);
    expect(missing).toEqual([]);
  });

  it("등급을 부정하는 이름만 놓아주고 나머지 rating은 잡는다(대조군)", () => {
    expect(
      RANKING_IDENTIFIERS.test(stripRatingDenials("  const notARatingNote = x;")),
    ).toBe(false);
    expect(
      RANKING_IDENTIFIERS.test(stripRatingDenials("  const ratingOf = x;")),
    ).toBe(true);
  });

  it.each([
    ["점수 필드", "  const locationScore = 100 - meters / 10;"],
    ["등급 함수", "function gradeOf(meters: number) { return 'A'; }"],
    ["가중치", "  const weight = 0.4;"],
    ["한국어 점수", "  const 점수 = 90;"],
  ])("검사기가 %s를 잡아낸다(변이 검사)", (_label, poisoned) => {
    expect(RANKING_IDENTIFIERS.test(poisoned)).toBe(true);
  });

  it("거리를 재는 평범한 코드는 잡지 않는다(대조군)", () => {
    expect(
      RANKING_IDENTIFIERS.test(
        "  const straightLineMeters = Math.round(straightLineMeters(from, place.coordinate));",
      ),
    ).toBe(false);
  });
});

describe("반경은 코드가 아니라 룰셋에서 온다", () => {
  /**
   * 반경을 코드에 박으면 `_radiusMetersNote`에 적힌 근거와 실제 동작이
   * 따로 놀 수 있고, 그 어긋남은 화면 어디에도 드러나지 않는다.
   *
   * 학교를 걸러 내는 함수와 화면 컴포넌트에 **거리로 읽힐 수 있는 숫자
   * 리터럴이 하나도 없는지**를 본다. 0과 1은 개수·인덱스라 놓아준다.
   */
  const ASSESS = stripComments(readFileSync("src/lib/location/assess.ts", "utf8"));

  /** 2 이상의 숫자 리터럴(밑줄 구분자 포함). 있으면 안 된다 */
  function distanceLikeLiterals(code: string): string[] {
    return (code.match(/(?<![\w.])\d[\d_]*(\.\d+)?/g) ?? []).filter(
      (literal) => Number(literal.split("_").join("")) >= 2,
    );
  }

  it("학교를 거르는 함수에 숫자 리터럴이 없다", () => {
    const start = ASSESS.indexOf("function schoolFinding(");
    const end = ASSESS.indexOf("export function assessLocation(");
    const body = ASSESS.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(distanceLikeLiterals(body)).toEqual([]);
  });

  it.each(SCREEN_SOURCES)("%s에 거리로 읽힐 숫자 리터럴이 없다", (path) => {
    const code = stripStrings(stripComments(readFileSync(path, "utf8")));
    expect(distanceLikeLiterals(code)).toEqual([]);
  });

  it("검사기가 박아 넣은 반경을 잡아낸다(변이 검사)", () => {
    expect(
      distanceLikeLiterals("    .filter((entry) => entry.meters <= 1000)"),
    ).toEqual(["1000"]);
    expect(distanceLikeLiterals("  const RADIUS_M = 1_000;")).toEqual(["1_000"]);
  });

  it("개수·인덱스는 잡지 않는다(대조군)", () => {
    expect(distanceLikeLiterals("  if (schools.length > 0) return null;")).toEqual(
      [],
    );
    expect(distanceLikeLiterals("  const first = measured[0];")).toEqual([]);
  });

  it("지구 반지름은 distance.ts 한 곳에만 있다", () => {
    // 물리 상수는 룰셋이 아니라 코드에 두되, 두 벌이 되면 둘이 어긋날 수
    // 있다. 상수를 정의하는 자리는 하나뿐이어야 한다.
    for (const path of ENGINE_SOURCES) {
      const code = stripComments(readFileSync(path, "utf8"));
      const defines = /const\s+EARTH_MEAN_RADIUS_M\s*=/.test(code);
      expect(defines, path).toBe(path === "src/lib/location/distance.ts");
    }
  });
});

describe("좌표를 지어내는 경로가 없다", () => {
  /**
   * 좌표를 못 구한 단지를 근처 단지 좌표나 법정동 중심점으로 채우면,
   * 화면은 재는 데 성공하고 숫자만 통째로 틀린다 — 그 실패는 눈에 띄지
   * 않는다. 대체 좌표를 만들려면 좌표 리터럴이 어딘가 있어야 하므로,
   * 데이터 모듈에 좌표로 읽힐 숫자가 하나도 없는지 본다.
   */
  const DATA = stripComments(readFileSync("src/data/location.ts", "utf8"));

  it("데이터 모듈에 좌표 리터럴이 없다", () => {
    // 위경도는 소수점을 품은 숫자로만 쓸 수 있다.
    expect(DATA.match(/\d+\.\d+/g) ?? []).toEqual([]);
  });

  it("빈 목록은 '모른다'로 접힌다 — 빈 배열이 그대로 나가지 않는다", () => {
    // `[]`가 그대로 나가면 "확인해 봤는데 하나도 없더라"로 읽히기 시작한다.
    // 전국 역·학교 목록이 정말로 0개일 수는 없으므로, 비어 있다는 것은 이
    // 단지 주변에 대한 사실이 아니라 데이터가 아직 없다는 사실이다.
    expect(DATA).toMatch(/SUBWAY_STATIONS[^=]*=\s*listOrNull\(/);
    expect(DATA).toMatch(/ELEMENTARY_SCHOOLS[^=]*=\s*listOrNull\(/);
    expect(DATA).toMatch(/function listOrNull[\s\S]*?length === 0 \? null :/);
  });

  it("검사기가 빈 배열을 그대로 내보내는 코드를 잡아낸다(변이 검사)", () => {
    const poisoned = DATA.replace(
      /SUBWAY_STATIONS([^=]*)=\s*listOrNull\(/,
      "SUBWAY_STATIONS$1= (",
    );
    expect(poisoned).not.toMatch(/SUBWAY_STATIONS[^=]*=\s*listOrNull\(/);
  });

  it("검사기가 심어 둔 좌표를 잡아낸다(변이 검사)", () => {
    const poisoned = `${DATA}\nconst FALLBACK = { lat: 37.5665, lon: 126.978 };`;
    expect(poisoned.match(/\d+\.\d+/g) ?? []).not.toEqual([]);
  });
});

describe("입지 사실은 인쇄에서 통째로 살아남는다", () => {
  /**
   * 이 영역에는 조작 장치가 하나도 없어 숨길 것이 없다. 반대로 여기서
   * 가장 무거운 말인 **고지**는 종이에서 더 중요하다 — 종이를 건네받은
   * 사람은 화면의 다른 맥락을 보지 못했고, 학구도 고지가 사라지면 남은
   * 학교 목록이 배정 결과처럼 읽힌다.
   */
  const HIDDEN = readFileSync("src/print/hiddenInPrint.ts", "utf8");

  it.each([
    "location-facts",
    "location-state",
    "location-state-note",
    "location-fact",
    "location-fact-message",
    "location-school-list",
    "location-distance",
    "location-disclosure",
    "location-disclaimer",
  ])("%s가 보호 목록에 있다", (cls) => {
    expect(HIDDEN).toContain(`"${cls}"`);
  });

  it("입지 영역을 숨기는 선택자가 하나도 없다", () => {
    const hiddenBlock = HIDDEN.slice(
      HIDDEN.indexOf("PRINT_HIDDEN_SELECTORS"),
      HIDDEN.indexOf("MUST_SURVIVE_PRINT_CLASSES"),
    );
    expect(hiddenBlock).not.toContain("location-");
  });
});

describe("입지 상태의 색", () => {
  const CSS = readFileSync("src/styles.css", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

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

  const LOCATED = '.location-state[data-state="located"]';

  it("located 상태에 색 규칙이 실제로 있다(전제)", () => {
    expect(declarationsFor(CSS, LOCATED).length).toBeGreaterThan(0);
  });

  it("재기에 성공한 상태가 '안전' 색을 쓰지 않는다", () => {
    // 이 화면은 좋다·나쁘다를 말하지 않으므로 "괜찮다"를 뜻하는 색이
    // 붙을 자리가 없다. 재기에 성공한 것은 좋은 소식이 아니라 사실이다.
    for (const body of declarationsFor(CSS, LOCATED)) {
      expect(body, body).not.toMatch(/var\(\s*--safe\s*\)/);
      expect(body, body).not.toMatch(/--seed-color-fg-positive/);
    }
  });

  it("파서가 실제로 --safe를 잡아낸다(변이 검사)", () => {
    const poisoned = `${LOCATED} { color: var(--safe); }`;
    expect(declarationsFor(poisoned, LOCATED)[0]).toMatch(/var\(\s*--safe\s*\)/);
  });
});
