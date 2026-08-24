import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDeungiPdf } from "../src/lib/deungi";
import { parseDeungiRules } from "../src/lib/deungi/rules";
import { buildDeungiPdf, sampleDeungi } from "../src/lib/deungi/synthetic-deungi";
import rawDeungiRules from "../rules/deungi-2026-08.json";

/**
 * 등기부 PDF를 파싱하는 동안 **네트워크로 나가는 호출이 하나도 없는지**
 * 실행으로 확인한다.
 *
 * ## 왜 `src/no-network.test.ts`만으로는 부족한가
 *
 * 그 검사는 `src/` 아래 소스에서 금지 패턴을 찾는 정적 스캔이다. 이번에
 * 번들에 들어온 pdf.js는 `node_modules`에 있어서 그 그물에 걸리지 않는데,
 * **pdf.js 안에는 네트워크로 가는 길이 실제로 들어 있다** — 문서를 URL로
 * 받는 길, 워커를 URL로 띄우는 길, 표준 폰트·CMap을 받아오는 길이다.
 * 우리가 그 길을 하나도 밟지 않는다는 것은 스캔이 아니라 실행으로만
 * 확인할 수 있다.
 *
 * 등기부에는 실명·주소·채무가 들어 있다. 이 파일이 브라우저를 벗어나면
 * 안 된다는 것이 이 기능에서 가장 중요한 약속이다.
 *
 * 이 검사가 `scripts/`에 있는 이유는 `tone-guard`·`motion-guard`와 같다 —
 * 앱이 쓰지 않는 검사용 파일이고, `src/` 안에 두면 no-network 스캔이
 * 여기 적힌 금지어("fetch" 같은)를 유출로 오인한다.
 *
 * ## 이 검사가 확인하지 못하는 것
 *
 * vitest는 `process`가 있는 환경이라 pdf.js가 스스로를 Node로 보고 워커를
 * 이미 꺼 둔다. 그래서 "브라우저였다면 `new Worker(url)`을 불렀을 텐데
 * 안 불렀다"까지는 여기서 증명되지 않는다. 그 경로도 같은 자리
 * (`globalThis.pdfjsWorker`)를 먼저 보는데, 그 자리를 채우는 것은 워커
 * 모듈을 **정적으로 불러오는 한 줄**이다. vitest는 그 줄이 없어도
 * node_modules에서 워커 파일을 찾아 주지만 브라우저는 그러지 못하므로,
 * 그 줄만은 실행이 아니라 소스로 지킨다(아래 마지막 두 검사).
 */

const rules = parseDeungiRules(rawDeungiRules);
const bytes = buildDeungiPdf(sampleDeungi());

const globals = globalThis as unknown as Record<string, unknown>;

interface Stubbed {
  name: string;
  original: unknown;
  had: boolean;
}

const STUBBED_NAMES = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "EventSource",
  "importScripts",
] as const;

let calls: string[] = [];
let saved: Stubbed[] = [];

beforeEach(() => {
  calls = [];
  saved = STUBBED_NAMES.map((name) => ({
    name,
    original: globals[name],
    had: name in globals,
  }));
  for (const name of STUBBED_NAMES) {
    globals[name] = function trap(): never {
      calls.push(name);
      throw new Error(`네트워크 호출이 일어났어요: ${name}`);
    };
  }
});

afterEach(() => {
  for (const entry of saved) {
    if (entry.had) globals[entry.name] = entry.original;
    else delete globals[entry.name];
  }
});

describe("등기부 파싱은 네트워크를 타지 않는다", () => {
  it("실제 PDF를 끝까지 읽는 동안 어떤 네트워크 API도 부르지 않는다", async () => {
    const reading = await parseDeungiPdf(rules, bytes);

    // 파싱이 실제로 끝까지 갔는지 먼저 확인한다. 조용히 실패한 뒤
    // "호출이 없었다"고 말하면 이 검사는 아무것도 지키지 않는다.
    expect(reading.crossCheck).toBe("agreed");
    expect(reading.totals.mortgage.won).toBe(2_320_000_000);

    expect(calls).toEqual([]);
  });

  it("워커가 같은 스레드에서 돌 준비가 돼 있다", async () => {
    // pdf.js는 워커를 띄우기 전에 이 자리를 먼저 본다. 비어 있으면
    // 워커 파일을 URL로 찾아 나선다 — 그게 네트워크 요청이다.
    await parseDeungiPdf(rules, bytes);
    const worker = globals.pdfjsWorker as Record<string, unknown> | undefined;

    expect(worker).toBeDefined();
    expect(typeof worker?.WorkerMessageHandler).toBe("function");
  });

  it("워커 모듈을 정적으로 불러와 번들에 넣는다", () => {
    /*
     * 이것만은 실행이 아니라 소스로 확인한다.
     *
     * vitest는 pdf.js가 워커 파일을 동적으로 불러오는 것도 그냥 풀어
     * 준다(node_modules에 파일이 있으니까). 그래서 이 import를 지워도
     * 테스트는 초록으로 남고, **브라우저에서만 404가 난다** — 정확히
     * 테스트가 보지 못하는 자리다. 그 줄이 있는지 직접 본다.
     */
    const source = readFileSync("src/lib/deungi/pdf.ts", "utf8");

    expect(source).toMatch(
      /^import \* as \w+ from "pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs";$/mu,
    );
    expect(source).toMatch(/\.pdfjsWorker = /u);
  });

  it("pdf.js에 URL을 하나도 넘기지 않는다", () => {
    // 문서·표준 폰트·CMap을 URL로 주면 pdf.js가 그것을 받아 온다.
    // 우리는 문서를 바이트로만 넘기고 나머지는 아예 주지 않는다.
    const source = readFileSync("src/lib/deungi/pdf.ts", "utf8");
    const call = /getDocument\(\{[\s\S]*?\}\)/u.exec(source)?.[0] ?? "";

    expect(call).toContain("data: bytes");
    for (const forbidden of ["url:", "standardFontDataUrl", "cMapUrl", "workerSrc"]) {
      expect(call, `${forbidden}을 넘기면 안 돼요`).not.toContain(forbidden);
    }
  });
});
