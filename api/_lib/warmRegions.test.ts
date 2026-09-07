import { describe, expect, it } from "vitest";
import { regionByCode } from "../../src/data/regions";
import { WARM_REGION_CODES } from "./warmRegions";

/**
 * 이 목록의 크기가 곧 **데우기가 쓸모 있는지**를 정한다.
 *
 * 국토부가 한 실행에 10곳 안팎에서 `HTTP 429`로 막는다(실측: 40곳 시도 →
 * 9곳 성공). 하루 두 번이니 한 바퀴가 하루 안에 끝나려면 목록이 그
 * 언저리여야 한다 — 넘어가면 갱신 창(24시간)을 못 지켜 데우기가 하는
 * 일이 없어진다. 게다가 지역마다 국토부를 12~36회 부르므로 늘린 만큼
 * 일일 호출 한도도 먹는다.
 *
 * 그래서 개수에 상한을 건다. 이 선을 넘기려면 한도와 한 바퀴 시간을
 * 먼저 다시 재라.
 */
describe("WARM_REGION_CODES", () => {
  it("서울 25개 자치구를 모두 담는다", () => {
    const seoul = WARM_REGION_CODES.filter((c) => c.startsWith("11"));
    expect(seoul).toHaveLength(25);
  });

  it("코드가 전부 실재하는 지역이다", () => {
    expect(WARM_REGION_CODES.map((c) => regionByCode(c)).every((r) => r !== null)).toBe(true);
  });

  it("중복이 없다 — 같은 지역을 두 번 데우면 한도만 두 번 먹는다", () => {
    expect(new Set(WARM_REGION_CODES).size).toBe(WARM_REGION_CODES.length);
  });

  it("하루 한 바퀴를 돌 수 있는 크기다", () => {
    // 한 실행이 10곳 안팎에서 막히고 크론은 하루 두 번이다 — 25곳이
    // 상한이라고 보면 된다. 이 값을 늘리려면 위 머리주석대로 먼저 재라.
    expect(WARM_REGION_CODES.length).toBeLessThanOrEqual(25);
    expect(WARM_REGION_CODES.length).toBeGreaterThan(20);
  });

  it("서울 바깥으로 새어 나가지 않았다", () => {
    const sidos = new Set(WARM_REGION_CODES.map((c) => regionByCode(c)!.sidoName));
    expect(sidos).toEqual(new Set(["서울특별시"]));
  });
});
