import { describe, expect, it } from "vitest";
import {
  COMPLEX_COORDINATES,
  coordinateOf,
  ELEMENTARY_SCHOOLS,
  SUBWAY_STATIONS,
} from "./location";
import { COMPLEX_UNITS } from "./complexes";

describe("입지 데이터 자리", () => {
  it("좌표를 모르는 단지는 null을 낸다", () => {
    expect(coordinateOf("있을 리 없는 키")).toBeNull();
  });

  it("좌표표에 없는 키는 무엇이든 null이다", () => {
    // `noUncheckedIndexedAccess`가 켜져 있어 없는 키는 undefined로 오는데,
    // 그걸 그대로 내보내면 화면이 "모른다"를 두 가지 모양(null과
    // undefined)으로 다루게 된다.
    for (const unit of COMPLEX_UNITS.slice(0, 50)) {
      const known = Object.prototype.hasOwnProperty.call(
        COMPLEX_COORDINATES,
        unit.complexKey,
      );
      if (!known) expect(coordinateOf(unit.complexKey)).toBeNull();
    }
  });

  it("좌표표에 실린 값은 그대로 낸다", () => {
    for (const [key, coordinate] of Object.entries(COMPLEX_COORDINATES)) {
      expect(coordinateOf(key)).toBe(coordinate);
    }
  });

  it("목록의 '아직 없음'은 빈 배열이 아니라 null이다", () => {
    // 빈 배열은 "확인해 봤는데 없더라"로 읽히기 시작한다. 지금 우리가
    // 아는 것은 아무것도 모른다는 것뿐이다.
    for (const list of [SUBWAY_STATIONS, ELEMENTARY_SCHOOLS]) {
      expect(list === null || list.length > 0).toBe(true);
    }
  });

  it("좌표표에 실린 값은 모두 위경도 꼴이다", () => {
    // 지금은 비어 있어 이 검사가 도는 횟수가 0이다. 파이프라인이 채우는
    // 날 곧바로 살아난다 — 잘못 붙은 좌표(0,0·뒤바뀐 위경도)는 엔진이
    // 다시 한 번 거르지만, 여기서 먼저 드러나는 편이 낫다.
    for (const coordinate of Object.values(COMPLEX_COORDINATES)) {
      expect(Number.isFinite(coordinate.lat)).toBe(true);
      expect(Number.isFinite(coordinate.lon)).toBe(true);
      expect(Math.abs(coordinate.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(coordinate.lon)).toBeLessThanOrEqual(180);
    }
  });
});
