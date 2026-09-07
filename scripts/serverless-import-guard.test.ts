import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **서버리스 번들에 들어가는 파일의 상대 경로 import에는 `.js`가 붙어야 한다.**
 *
 * Vercel은 이 파일들을 Node ESM으로 돌리고, Node ESM은 상대 경로 import에
 * 확장자를 요구한다. 빠뜨리면 함수가 시작조차 못 하고
 * `FUNCTION_INVOCATION_FAILED`(500)로 죽는다 — 지역 조회가 통째로 멈춘다.
 *
 * **이 저장소는 여기서 두 번 넘어졌다**(73b844e, 4a2e505). 두 번 다
 * 프로덕션에서야 드러난 이유는 우리 검사 어느 것도 이걸 못 보기 때문이다:
 *
 *   · `tsc`는 확장자 없는 경로를 그대로 받아들인다(번들러 리졸브 전제)
 *   · `vitest`는 Vite 리졸버로 돌아 확장자를 알아서 채운다
 *
 * 그래서 이 검사는 코드를 실행하지 않고 **글자 그대로** 본다. 그게 이
 * 결함의 성질과 맞는 유일한 방법이다.
 *
 * `import type ...`은 보지 않는다 — 컴파일에서 지워져 런타임에 남지 않는다.
 *
 * **번들에 실제로 들어가는 파일만 본다.** `api/*.ts`(Vercel 엔트리)에서
 * 상대 경로를 따라가 닿는 파일 전부다. `scripts/pipeline`에는 tsx로만 도는
 * 오프라인 배치(`run.ts` 등)도 함께 있는데, 그쪽은 이 제약을 받지 않는다 —
 * 폴더째 검사하면 서버리스와 무관한 파일을 붙잡게 된다.
 */

/** Vercel이 함수로 만드는 엔트리들. */
const ENTRIES = ["api/complexes.ts", "api/geocode.ts"];

/** `from "..."`에 적힌 상대 경로를 실제 .ts 파일로 되돌린다. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base.replace(/\.js$/, ".ts"), `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 엔트리에서 상대 경로를 따라 닿는 모든 파일. */
function bundledFiles(): string[] {
  const seen = new Set<string>();
  const queue = ENTRIES.map((e) => resolve(e));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = RELATIVE_FROM.exec(line.trim());
      if (match === null) continue;
      const next = resolveSpecifier(file, match[1]!);
      if (next !== null) queue.push(next);
    }
  }
  return [...seen].sort();
}

/** `from "./x"` / `from "../x"` 형태의 상대 경로를 뽑는다. */
const RELATIVE_FROM = /\bfrom\s+["'](\.[^"']*)["']/;

function offendingLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // 타입만 가져오는 줄은 런타임에 남지 않는다.
      if (trimmed.startsWith("import type ") || trimmed.startsWith("export type ")) return false;
      const match = RELATIVE_FROM.exec(trimmed);
      if (match === null) return false;
      const specifier = match[1]!;
      // JSON은 `with { type: "json" }`로 따로 다룬다(73b844e).
      return !specifier.endsWith(".js") && !specifier.endsWith(".json");
    })
    .map((line) => line.trim());
}

describe("서버리스 번들의 상대 경로 import", () => {
  const files = bundledFiles();

  it("엔트리에서 출발해 파일을 실제로 따라갔다(경로가 바뀌면 이 검사가 공허해진다)", () => {
    // 엔트리 2개만 세어지면 상대 경로 추적이 끊긴 것이다.
    expect(files.length).toBeGreaterThan(10);
    // 이번에 깨뜨린 바로 그 파일이 사정권 안에 있는지 못박는다.
    expect(files.some((f) => f.endsWith("api/_lib/redisBatch.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("scripts/pipeline/householdCount.ts"))).toBe(true);
  });

  it.each(files)("%s — 상대 경로 import가 전부 .js로 끝난다", (file) => {
    expect(offendingLines(file)).toEqual([]);
  });
});
