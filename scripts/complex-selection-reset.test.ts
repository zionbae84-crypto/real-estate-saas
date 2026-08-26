import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * "고른 단지(평형)에 매달린 상태"를 비우는 자리가 **하나뿐인지** 소스에서
 * 검사한다.
 *
 * 왜 이 검사가 있는가 — C1의 실패 형태 그대로다. 예전에는 이 리셋이
 * 상세를 닫는 핸들러마다 손으로 되풀이돼 있었다. Task 3이 `RegionSelect`를 `EntryScreen`으로 옮겨 "상세를 연 채
 * 다른 지역을 조회한다"는 **새 경로**를 열었을 때 `handleRegionSelect`만
 * 그 리셋을 받지 못했고, 결과 화면은 서초구를 조회하고도 강남 단지의
 * 상세를 계속 그렸다 — 그동안 `effectiveProfile`이 화면 전체의 계산을 그
 * 단지의 전용면적으로 바꿔치기한 채로.
 *
 * 행동 테스트(`src/App.test.tsx`의 "상세를 연 채 지역을 다시 조회한다")는
 * **지금 아는 경로**를 잠근다. 이 테스트는 다음 경로가 생길 때를 잠근다:
 * 세 setter의 `null` 호출이 `clearComplexSelection` 밖으로 흩어지는 순간
 * 깨지므로, 새 핸들러를 쓰는 사람에게 남는 선택지가 "그 함수를 부른다"
 * 하나가 된다.
 *
 * 소스 문자열을 보는 검사의 한계는 분명하다 — 그 상태를 비우지 **않는**
 * 새 핸들러는 이 검사로 잡히지 않는다. 그쪽은 행동 테스트의 몫이다.
 *
 * 진단 종합이 제거되면서 함께 비우던 `priceAssessment`·
 * `locationAssessment` 두 상태가 사라졌다. 남은 것은 `selectedUnit`
 * 하나지만, 자리를 하나로 붙들어 두는 이 검사의 이유는 그대로다.
 */

const APP = readFileSync("src/App.tsx", "utf8");

/** 주석 안의 예시 문자열이 잡히지 않게 주석을 걷어낸 소스 */
const CODE = APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function count(needle: string): number {
  return CODE.split(needle).length - 1;
}

describe("고른 단지에 매달린 상태의 리셋 지점", () => {
  it("clearComplexSelection이 실제로 존재한다", () => {
    // 아래 단언들이 "이름이 바뀌어 아무것도 못 찾았다"로 조용히 통과하지
    // 않게 하는 전제다.
    expect(CODE).toContain("function clearComplexSelection()");
  });

  it.each(["setSelectedUnit(null)"])(
    "%s는 소스 전체에 딱 한 번만 나온다",
    (call) => {
      expect(count(call)).toBe(1);
    },
  );

  it("그 한 번은 clearComplexSelection 안이다", () => {
    const start = CODE.indexOf("function clearComplexSelection()");
    expect(start).toBeGreaterThan(-1);
    const body = CODE.slice(start, CODE.indexOf("\n  }", start));

    expect(body).toContain("setSelectedUnit(null)");
  });

  it("지역을 다시 조회하는 핸들러가 그 함수를 부른다", () => {
    const start = CODE.indexOf("function handleRegionSelect(");
    expect(start).toBeGreaterThan(-1);
    const body = CODE.slice(start, CODE.indexOf("\n  }", start));

    expect(body).toContain("clearComplexSelection()");
    // 같은 핸들러가 지역 코드를 실제로 바꾼다는 것도 함께 못박는다 —
    // 이 함수가 다른 일을 하게 바뀌면 위 단언이 엉뚱한 자리를 지킨다.
    expect(body).toContain("setCurrentRegionCode(regionCode)");
  });
});
