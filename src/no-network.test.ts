import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 이 제품의 약속은 "재무정보가 네트워크를 탈 경로가 코드상 존재하지 않는다"이다.
 * 설정이 아니라 구조로 보장되어야 하므로 소스를 직접 훑어 확인한다.
 *
 * 이 테스트만은 fs를 쓴다 — 순수 함수 규칙의 의도적 예외다.
 */
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /\bWebSocket\b/,
  /navigator\.sendBeacon/,
  /https?:\/\/(?!www\.w3\.org)/,
];

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
});
