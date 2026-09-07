import { describe, expect, it } from "vitest";
import { regionByCode } from "../../src/data/regions";
import { WARM_REGION_CODES } from "./warmRegions";

/**
 * 이 목록은 **국토부 일일 호출 한도를 직접 먹는다** — 지역 하나가
 * 12개월치를 부르므로 12~36회다. 늘어난 것을 아무도 모르는 채 배포되면
 * 정작 사용자 조회가 막힌다. 그래서 개수에 상한을 걸어 둔다.
 */
describe("WARM_REGION_CODES", () => {
  it("서울 25개 자치구를 모두 담는다", () => {
    const seoul = WARM_REGION_CODES.filter((c) => c.startsWith("11"));
    expect(seoul).toHaveLength(25);
  });

  it("광역시 자치구를 담되 군·시는 빼놓는다", () => {
    const names = WARM_REGION_CODES.map((c) => regionByCode(c));
    expect(names.every((r) => r !== null)).toBe(true);
    const outsideSeoul = names.filter((r) => r!.sidoName !== "서울특별시");
    expect(outsideSeoul.length).toBeGreaterThan(30);
    // 달성군·울주군·강화군처럼 '군'인 곳, 목포시·여수시처럼 '시'인 곳은
    // 들어오면 안 된다.
    expect(outsideSeoul.filter((r) => !r!.sigunguName.endsWith("구"))).toEqual([]);
  });

  /** 처음 짤 때 실제로 빠뜨렸던 자리. */
  it("광주 5개 자치구가 빠지지 않는다 — 이 데이터에서 광주는 전남과 통합돼 있다", () => {
    const gwangju = WARM_REGION_CODES.map((c) => regionByCode(c)!).filter(
      (r) => r.sidoName === "전남광주통합특별시",
    );
    expect(gwangju.map((r) => r.sigunguName).sort()).toEqual(
      ["광산구", "남구", "동구", "북구", "서구"].sort(),
    );
  });

  it("중복이 없다 — 같은 지역을 두 번 데우면 한도만 두 번 먹는다", () => {
    expect(new Set(WARM_REGION_CODES).size).toBe(WARM_REGION_CODES.length);
  });

  it("한도를 걱정할 만큼 늘어나지 않았다", () => {
    // 75곳 × 최대 36회 ≈ 2,700회. 개발계정 일일 한도(보통 1만 회) 안에서
    // 사용자 조회 몫을 넉넉히 남긴다. 이 선을 넘기려면 한도부터 다시 재라 —
    // 전국 256곳이면 3,000~9,000회로 사용자 조회가 막힐 수 있다.
    expect(WARM_REGION_CODES.length).toBeLessThanOrEqual(75);
    expect(WARM_REGION_CODES.length).toBeGreaterThan(50);
  });

  it("전국을 통째로 담고 있지는 않다(범위가 새어 나가지 않았다)", () => {
    const sidos = new Set(WARM_REGION_CODES.map((c) => regionByCode(c)!.sidoName));
    expect(sidos).toEqual(
      new Set([
        "서울특별시",
        "부산광역시",
        "대구광역시",
        "인천광역시",
        "대전광역시",
        "울산광역시",
        "전남광주통합특별시",
      ]),
    );
  });
});
