import { describe, expect, it } from "vitest";
import { ELEMENTARY_SCHOOLS, ELEMENTARY_SCHOOL_DETAILS } from "./location";
import { DATA_AS_OF, hasSchoolZoneData, schoolZonesFor } from "./school-zones";

/**
 * 실린 통학구역 도면이 성립하는지 본다.
 *
 * **가장 중요한 것은 아래 "학교가 자기 통학구역 안에 있다"이다.** 도면은
 * EPSG:5186(중부원점, 미터)로 오는데 우리 화면은 위경도를 쓴다 — 그 변환이
 * 몇 미터만 어긋나도 지도는 멀쩡히 그려지고 경계만 통째로 틀린다. 눈에 안
 * 띄는 종류의 실패라, 학교 좌표(전혀 다른 원본에서 온 값)가 자기 구역 안에
 * 드는지로 교차검증한다. 굽는 단계(`scripts/pipeline/school-zones.py`)도
 * 같은 검사를 하지만, 그건 다시 구울 때만 돌고 여기 실린 파일은 검사하지
 * 않는다.
 */

/** 짝수-홀수 규칙. 점이 링 안에 있는가 */
function pointInRing(
  point: readonly [number, number],
  ring: ReadonlyArray<readonly [number, number]>,
): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

const schools = ELEMENTARY_SCHOOLS ?? [];

describe("통학구역 도면", () => {
  it("전제 — 초등학교가 실려 있다", () => {
    expect(schools.length).toBeGreaterThan(0);
  });

  it("기준일자가 날짜 모양이다", () => {
    expect(DATA_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * 좌표계 변환이 맞는지를 확인하는 교차검증(위 머리 주석 참고). 학교
   * 좌표는 「전국초중등학교위치표준데이터」에서, 도면은 학구도 SHP에서
   * 온다 — 서로 다른 파일이라 변환이 틀리면 여기서 무너진다.
   */
  it("통학구역이 있는 학교는 전부 자기 구역 안에 있다", () => {
    const withZone = schools.filter((s) => schoolZonesFor(s.id).length > 0);
    expect(withZone.length).toBeGreaterThan(0);

    const outside = withZone.filter((school) => {
      const point = [school.coordinate.lon, school.coordinate.lat] as const;
      return !schoolZonesFor(school.id).some((zone) =>
        zone.rings.some((ring) => pointInRing(point, ring)),
      );
    });
    expect(outside.map((s) => s.name)).toEqual([]);
  });

  /**
   * 사립·국립은 추첨·선발로 뽑으므로 통학구역이 없다. **그 사실이 데이터에
   * 그대로 드러나는지**를 못 박는다 — 공립인데 구역이 없다면 조인이 깨진
   * 것이고, 사립인데 구역이 있다면 원본을 잘못 읽은 것이다.
   */
  it("통학구역이 없는 학교는 전부 사립·국립이고, 공립은 전부 있다", () => {
    const missingButPublic: string[] = [];
    const presentButPrivate: string[] = [];
    for (const school of schools) {
      const detail = ELEMENTARY_SCHOOL_DETAILS.get(school.id);
      if (detail === undefined) continue;
      const has = schoolZonesFor(school.id).length > 0;
      if (detail.foundationType === "공립" && !has) missingButPublic.push(school.name);
      if (detail.foundationType !== "공립" && has) presentButPrivate.push(school.name);
    }
    expect(missingButPublic).toEqual([]);
    expect(presentButPrivate).toEqual([]);
  });

  it("구역이 없는 학교와 도면이 아예 없는 학교는 같은 집합이다", () => {
    for (const school of schools) {
      expect(hasSchoolZoneData(school.id)).toBe(schoolZonesFor(school.id).length > 0);
    }
  });

  it("링은 점 셋 이상이고 좌표가 우리 지역 안이다", () => {
    const bad: string[] = [];
    for (const school of schools) {
      for (const zone of schoolZonesFor(school.id)) {
        for (const ring of zone.rings) {
          if (ring.length < 3) bad.push(`${zone.name}: 점 ${ring.length}개`);
          for (const [lon, lat] of ring) {
            if (!(lat > 37 && lat < 38 && lon > 126 && lon < 128)) {
              bad.push(`${zone.name}: (${lon}, ${lat})`);
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("공동통학구역은 이름에도 그 사실이 적혀 있다", () => {
    const zones = schools.flatMap((s) => schoolZonesFor(s.id));
    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) {
      expect(zone.name.includes("공동")).toBe(zone.shared);
    }
  });
});
