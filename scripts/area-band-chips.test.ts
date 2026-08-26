import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREA_BANDS } from "../src/lib/area-band";

/**
 * 평형대 칩의 **배치**를 구간 수에 잠근다.
 *
 * 칩이 넷일 때는 2×2였다. 셋이 된 지금 그 값을 그대로 두면 2+1이 되어
 * 마지막 칩 하나만 다음 줄에 홀로 남는다 — 세 구간이 좁은 쪽에서 넓은
 * 쪽으로 가는 **한 축의 눈금**인데 둘과 하나로 갈려 보이면 그 축이 읽히지
 * 않는다(원래 `auto-fit`을 버리고 열 수를 고정한 이유가 바로 이것이다).
 * 구간 수가 다시 움직이는 날 이 테스트가 먼저 깨진다.
 *
 * jsdom은 `styles.css`를 적용하지 않으므로 렌더 결과로는 확인할 수 없다.
 * `scripts/printCss.test.ts`와 같은 방식으로 CSS 텍스트를 직접 읽는다 —
 * 그래서 이 파일도 `src/`가 아니라 `scripts/`에 있다(`src/no-network.test.ts`가
 * `src/` 안의 `node:` 임포트를 막는다).
 */
const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 CSS. 주석 안의 예시가 실제 규칙으로 오인되지 않게 한다 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function ruleBody(selector: string): string {
  const match = DECLARATIONS.match(
    new RegExp(`(?:^|})\\s*${selector.replace(".", "\\.")}\\s*{([^}]*)}`),
  );
  expect(match, `${selector} 규칙이 없다`).not.toBeNull();
  return match![1]!;
}

describe("평형대 칩 배치", () => {
  it("칩 열 수는 구간 수와 같다 — 한 줄에 전부 놓여 하나의 눈금으로 읽힌다", () => {
    expect(ruleBody(".area-band-options")).toContain(
      `grid-template-columns: repeat(${AREA_BANDS.length}, minmax(0, 1fr));`,
    );
  });

  /**
   * 좁은 화면에서는 한 줄에 셋이 편히 들어가지 않는다 — 실측(뷰포트
   * 375px에서 3열을 강제): 칩 폭 103.7px, 글자 자리 60.7px, 범위 라벨이
   * 두 줄로 접혀 칩 높이가 64.4px → 85.2px가 된다. 그때는 2+1로 갈리는
   * 대신 **한 열로 세운다** — 세로로 셋이면 좁은 쪽에서 넓은 쪽으로 가는
   * 눈금이 그대로 남는다.
   */
  it("좁은 화면에서는 2+1로 갈리지 않고 한 열로 선다", () => {
    const narrow = DECLARATIONS.match(
      /@media \(max-width: 480px\) {\s*\.area-band-options\s*{([^}]*)}/,
    );
    expect(narrow, "좁은 화면 규칙이 없다").not.toBeNull();
    expect(narrow![1]).toContain("grid-template-columns: minmax(0, 1fr);");
  });
});
