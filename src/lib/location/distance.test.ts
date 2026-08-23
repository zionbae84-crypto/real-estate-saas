import { describe, expect, it } from "vitest";
import { EARTH_MEAN_RADIUS_M, straightLineMeters } from "./distance";
import type { Coordinate } from "./types";

/**
 * 하버사인 계산을 **독립적으로 검산한다.**
 *
 * 같은 공식을 두 번 써서 비교하면 아무것도 확인하지 못한다(둘 다 틀리면
 * 둘 다 같은 답을 낸다). 그래서 여기서는 구면 기하에서 손으로 낼 수 있는
 * 값들과 견준다:
 *
 * - 자오선을 따라 위도 1도 = 지구 둘레의 1/360 = R·π/180 ≈ 111.19km
 * - 적도를 따라 경도 1도도 같은 값(적도는 대원이다)
 * - 위도 φ에서 경도 1도 = 그 위도권의 반지름이 R·cos φ이므로 ≈ 111.19·cos φ km
 * - 마주 보는 두 점(대척점) 사이 = 반원 = π·R
 *
 * 이 값들은 하버사인 공식과 **무관하게** 나오므로, 구현이 코사인 법칙이든
 * 하버사인이든 평면 근사이든 상관없이 맞는지 틀리는지가 드러난다. 평면
 * 근사(피타고라스)는 마지막 두 검사에서 반드시 깨진다.
 */

function at(lat: number, lon: number): Coordinate {
  return { lat, lon };
}

/** 자오선 1도의 길이. 위 주석의 R·π/180을 이 파일에서 직접 계산한다 */
const ONE_DEGREE_M = (EARTH_MEAN_RADIUS_M * Math.PI) / 180;

describe("직선거리(하버사인)", () => {
  it("지구 평균 반지름이 실제 값 언저리다(전제)", () => {
    // IUGG 평균 반지름은 6,371.0088km다. 이 전제가 깨지면 아래 검산이
    // 전부 같은 방향으로 함께 틀어져 아무것도 못 잡는다.
    expect(EARTH_MEAN_RADIUS_M).toBeGreaterThan(6_360_000);
    expect(EARTH_MEAN_RADIUS_M).toBeLessThan(6_380_000);
  });

  it("자오선을 따라 위도 1도는 약 111.19km다", () => {
    // 상수를 쓰지 않은 독립 수치와도 견준다 — 111,195m는 널리 인용되는 값이다.
    const measured = straightLineMeters(at(37, 127), at(38, 127));
    expect(measured).toBeCloseTo(ONE_DEGREE_M, 0);
    expect(Math.abs(measured - 111_195)).toBeLessThan(200);
  });

  it("적도를 따라 경도 1도도 같은 길이다", () => {
    const measured = straightLineMeters(at(0, 0), at(0, 1));
    expect(measured).toBeCloseTo(ONE_DEGREE_M, 0);
  });

  it("위도 60도에서 경도 1도는 그 절반이다(cos 60° = 0.5)", () => {
    // 평면 근사라면 여기서 위도와 같은 길이가 나와 두 배로 틀린다.
    const measured = straightLineMeters(at(60, 0), at(60, 1));
    expect(measured / ONE_DEGREE_M).toBeCloseTo(0.5, 3);
  });

  it("위도 37.5도에서 경도 1도는 cos 37.5배다", () => {
    const measured = straightLineMeters(at(37.5, 126), at(37.5, 127));
    const expected = ONE_DEGREE_M * Math.cos((37.5 * Math.PI) / 180);
    // 위도권을 따라가는 길이와 그 두 점을 잇는 대원 거리는 아주 조금
    // 다르다(대원이 살짝 더 짧다). 1도 폭에서는 0.01% 수준이다.
    expect(measured / expected).toBeCloseTo(1, 3);
  });

  it("대척점 사이는 반원(π·R)이다", () => {
    // 평면 근사·좁은 각도 근사가 반드시 깨지는 자리다.
    const measured = straightLineMeters(at(0, 0), at(0, 180));
    expect(measured / (Math.PI * EARTH_MEAN_RADIUS_M)).toBeCloseTo(1, 6);
  });

  it("극에서 극까지도 반원이다", () => {
    const measured = straightLineMeters(at(-90, 0), at(90, 0));
    expect(measured / (Math.PI * EARTH_MEAN_RADIUS_M)).toBeCloseTo(1, 6);
  });

  it("같은 점 사이는 0이다", () => {
    expect(straightLineMeters(at(37.5, 127.1), at(37.5, 127.1))).toBe(0);
  });

  it("아주 가까운 두 점에서 음수나 NaN이 나오지 않는다", () => {
    // 하버사인은 여기서 안정적이지만, 코사인 법칙 구현은 부동소수점
    // 반올림 때문에 acos의 인자가 1을 살짝 넘어 NaN을 낸다.
    const measured = straightLineMeters(at(37.5, 127.1), at(37.5, 127.100001));
    expect(Number.isFinite(measured)).toBe(true);
    expect(measured).toBeGreaterThanOrEqual(0);
    expect(measured).toBeLessThan(1);
  });

  it("방향을 바꿔도 같은 값이다", () => {
    const a = at(37.4, 126.9);
    const b = at(37.6, 127.2);
    expect(straightLineMeters(a, b)).toBe(straightLineMeters(b, a));
  });

  it("경도 180도 선을 넘어도 짧은 쪽으로 잰다", () => {
    // 179°E와 179°W는 2도 차이지 358도 차이가 아니다.
    const measured = straightLineMeters(at(0, 179), at(0, -179));
    expect(measured / (ONE_DEGREE_M * 2)).toBeCloseTo(1, 6);
  });

  it("서울 도심 규모에서 자릿수가 맞다", () => {
    // 위도 0.009도 ≈ 1km. 도시 안 거리가 km 자릿수로 나오는지 본다.
    const measured = straightLineMeters(at(37.5, 127.0), at(37.509, 127.0));
    expect(measured).toBeGreaterThan(950);
    expect(measured).toBeLessThan(1050);
  });
});
