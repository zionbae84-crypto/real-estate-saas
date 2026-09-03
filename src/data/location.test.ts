import { describe, expect, it } from "vitest";
import rawLocationRules from "../../rules/location-2026-08.json";
import { assessLocation, parseLocationRules } from "../lib/location";
import {
  COMPLEX_COORDINATES,
  coordinateOf,
  ELEMENTARY_SCHOOLS,
  HIGH_SCHOOLS,
  MIDDLE_SCHOOLS,
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
    for (const list of [
      SUBWAY_STATIONS,
      ELEMENTARY_SCHOOLS,
      MIDDLE_SCHOOLS,
      HIGH_SCHOOLS,
    ]) {
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

describe("실린 목록 — 학교·역은 값이 있고 단지 좌표는 없다", () => {
  it("역 목록과 학교 목록이 실제로 실려 있다", () => {
    // null이면 아래 검사들이 공허하게 통과한다.
    expect(SUBWAY_STATIONS).not.toBeNull();
    expect(ELEMENTARY_SCHOOLS).not.toBeNull();
    expect(MIDDLE_SCHOOLS).not.toBeNull();
    expect(HIGH_SCHOOLS).not.toBeNull();
    expect(SUBWAY_STATIONS?.length ?? 0).toBeGreaterThan(0);
    expect(ELEMENTARY_SCHOOLS?.length ?? 0).toBeGreaterThan(0);
    expect(MIDDLE_SCHOOLS?.length ?? 0).toBeGreaterThan(0);
    expect(HIGH_SCHOOLS?.length ?? 0).toBeGreaterThan(0);
  });

  it("모든 항목이 좌표를 갖고, 0·NaN이 없다", () => {
    for (const place of [
      ...(SUBWAY_STATIONS ?? []),
      ...(ELEMENTARY_SCHOOLS ?? []),
      ...(MIDDLE_SCHOOLS ?? []),
      ...(HIGH_SCHOOLS ?? []),
    ]) {
      expect(Number.isFinite(place.coordinate.lat)).toBe(true);
      expect(Number.isFinite(place.coordinate.lon)).toBe(true);
      expect(place.coordinate.lat).not.toBe(0);
      expect(place.coordinate.lon).not.toBe(0);
    }
  });

  it("단지 좌표는 아직 하나도 없다", () => {
    // 지오코딩은 다음 작업이다. 근처 단지 좌표나 법정동 중심점으로 대신
    // 채우면 화면은 재는 데 성공하고 숫자만 통째로 틀린다.
    expect(Object.keys(COMPLEX_COORDINATES)).toEqual([]);
  });

  it("어느 단지를 물어도 판정이 '아직 위치를 몰라요'다", () => {
    const rules = parseLocationRules(rawLocationRules);
    for (const unit of COMPLEX_UNITS) {
      const assessment = assessLocation(rules, {
        coordinate: coordinateOf(unit.complexKey),
        subwayStations: SUBWAY_STATIONS,
        elementarySchools: ELEMENTARY_SCHOOLS,
      });
      // 좌표를 모르는 갈래에는 subway·elementarySchool 필드 자체가 없다 —
      // 화면이 빈 목록을 그릴 재료를 갖지 못한다.
      expect(assessment.state).toBe("unlocated");
      expect(Object.hasOwn(assessment, "subway")).toBe(false);
      expect(Object.hasOwn(assessment, "elementarySchool")).toBe(false);
    }
  });

  it("좌표가 하나라도 있으면 그 단지는 'located'가 된다(변이 검사)", () => {
    // 위 검사가 "무엇을 넣어도 unlocated"라서 통과하는 것이 아님을 확인한다.
    const rules = parseLocationRules(rawLocationRules);
    const assessment = assessLocation(rules, {
      coordinate: { lat: 37.5, lon: 127.0 },
      subwayStations: SUBWAY_STATIONS,
      elementarySchools: ELEMENTARY_SCHOOLS,
    });
    expect(assessment.state).toBe("located");
  });
});
