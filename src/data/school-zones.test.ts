import { describe, expect, it } from "vitest";
import locationConfig from "../../scripts/pipeline/location-config.json";
import { readSchoolZoneChunk as zonesFor } from "../../scripts/testUtils/schoolZoneFixtures";
import { ELEMENTARY_SCHOOLS, ELEMENTARY_SCHOOL_DETAILS } from "./location";
import { DATA_AS_OF, hasSchoolZoneData } from "./school-zones";

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
 *
 * **도형은 `public/school-zones/<학교ID>.json`에서 직접 읽는다** —
 * `src/data/school-zones.ts`는 색인만 정적으로 지고 도형은 학교를 펼치는
 * 순간에야 늦게 받으므로(`src/lib/loadSchoolZones.ts`), 이 테스트는 화면이
 * 실제로 받는 것과 같은 원본을 `scripts/testUtils/schoolZoneFixtures.ts`로
 * 직접 읽어 검사한다 — 그 헬퍼가 `src/` 밖에 있는 이유는 그쪽 문서 참고.
 * `scripts/location-data.test.ts`가 파이프라인 CSV 원본을 직접 읽는 것과
 * 같은 요령이다.
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

/** 점에서 링의 가장 가까운 변까지의 대략적인 거리(m). 아래 문턱 확인에서만 쓴다. */
function distanceToRingM(
  point: readonly [number, number],
  ring: ReadonlyArray<readonly [number, number]>,
): number {
  const [plon, plat] = point;
  const mPerLat = 111_320;
  const mPerLon = 111_320 * Math.cos((plat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const [lon1, lat1] = ring[i]!;
    const [lon2, lat2] = ring[(i + 1) % ring.length]!;
    const x1 = (lon1 - plon) * mPerLon;
    const y1 = (lat1 - plat) * mPerLat;
    const x2 = (lon2 - plon) * mPerLon;
    const y2 = (lat2 - plat) * mPerLat;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / lengthSq));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    best = Math.min(best, Math.hypot(cx, cy));
  }
  return best;
}

/**
 * 학교 위치표준데이터와 학구도 SHP는 서로 다른 기관이 따로 관리하는
 * 원본이라, 아주 드물게 한 학교가 자기 학구 경계 바깥에 살짝 걸리는
 * 채로 공시될 수 있다 — 우리 좌표계 변환의 결함이 아니라 원본 두 벌
 * 사이의 실측 오차다. **굽는 쪽(`scripts/pipeline/school-zones.py`의
 * `MAX_ACCEPTABLE_MISMATCH_M`)과 같은 값**이다 — 둘이 서로 다른 문턱을
 * 들면 언젠가 어긋난다. 서울(778개 학구) 규모에서는 이름으로 콕 집은
 * 예외 둘이면 충분했지만, 전국(7,117개 학구)에서는 18곳으로 늘고 그중
 * 분교장·광역통학구역처럼 이름으로 하나하나 확인하는 게 더는 안전하지
 * 않은 사례가 섞여 문턱으로 바꿨다.
 */
const MAX_ACCEPTABLE_MISMATCH_M = 500;

const schools = ELEMENTARY_SCHOOLS ?? [];
const bounds = locationConfig.schoolTargetBounds;

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
   *
   * **학교 단위로 확인한다 — 학구 단위가 아니다.** 공동통학구역이 걸린
   * 학교는 자기 학구들 "전부"가 아니라 "그중 하나"에만 들면 된다 — 짝을
   * 이루는 다른 학교 쪽 학구는 이 학교 건물에서 멀리 있는 게 정상이다
   * (`school-zones.py`의 같은 주석 참고).
   */
  it("통학구역이 있는 학교는 전부 자기 구역들 중 하나 안에 있다(문턱 500m)", () => {
    const withZone = schools.filter((s) => zonesFor(s.id).length > 0);
    expect(withZone.length).toBeGreaterThan(0);

    const outside = withZone.filter((school) => {
      const point = [school.coordinate.lon, school.coordinate.lat] as const;
      const rings = zonesFor(school.id).flatMap((zone) => zone.rings);
      if (rings.some((ring) => pointInRing(point, ring))) return false;
      const nearest = Math.min(...rings.map((ring) => distanceToRingM(point, ring)));
      return nearest > MAX_ACCEPTABLE_MISMATCH_M;
    });
    expect(outside.map((s) => s.name)).toEqual([]);
  });

  /**
   * 사립·국립 **대부분**은 추첨·선발로 뽑으므로 통학구역이 없다 — 서울
   * 25개 구 규모(285곳 중 13곳이 사립·국립, 전부 구역 없음)에서는 예외
   * 없이 그랬다. 그런데 전국으로 넓히니 실제로 **구역이 있는** 사립·국립도
   * 있다는 걸 실측으로 확인했다: 한국교원대학교부설월곡초등학교(국립대
   * 부설교), 여도초등학교·광양제철초등학교·광양제철남초등학교·
   * 포항제철지곡초등학교·포항제철초등학교(제철소 사택 지역을 위한 사립
   * 초등학교) — 조인 실수가 아니라 `data/sources/schools.csv` 원본에도
   * 그렇게(국립/사립) 적혀 있고 학구도 CSV에도 실제로 연결돼 있다. 그래서
   * "사립·국립이면 구역이 없다"는 이제 **원칙이지 절대 규칙이 아니다** —
   * 이 검사는 "공립인데 구역이 없다"(조인이 깨졌을 가능성)만 개수 상한으로
   * 감시하고, 반대 방향은 못 박지 않는다.
   */
  it("통학구역이 없는 공립 학교는 적다(0에 가까워야 한다)", () => {
    const missingButPublic: string[] = [];
    let publicCount = 0;
    for (const school of schools) {
      const detail = ELEMENTARY_SCHOOL_DETAILS.get(school.id);
      if (detail === undefined) continue;
      if (detail.foundationType !== "공립") continue;
      publicCount += 1;
      if (zonesFor(school.id).length === 0) missingButPublic.push(school.name);
    }
    // 전국 실측: 공립 중 학구를 못 찾은 곳은 7곳(0.11%) — school-zones.py의
    // MAX_MISMATCH_RATE(2%)보다 한참 아래다. 그 비율을 크게 넘으면 좌표계
    // 변환 자체를 의심해야 한다는 같은 원칙을 여기서도 개수 상한으로 건다.
    expect(missingButPublic.length).toBeLessThan(publicCount * 0.02);
  });

  it("구역이 없는 학교와 도면이 아예 없는 학교는 같은 집합이다", () => {
    for (const school of schools) {
      expect(hasSchoolZoneData(school.id)).toBe(zonesFor(school.id).length > 0);
    }
  });

  /**
   * `schoolTargetBounds`는 **학교 건물 좌표**(점)의 실측 범위에 여유를 둔
   * 값이다(`location-config.json`의 `_schoolTargetBoundsNote` 참고). 학구
   * **경계선**(면)은 그 점보다 바깥으로 나갈 수 있다 — 실측으로 두 곳이
   * 그 상자를 벗어났다: 대청초통학구역(백령도·대청도 서쪽 끝, 약 40m)과
   * 대진초통학구역(고성 최북단, 휴전선 인근이라 학구가 학교 점보다 훨씬
   * 북쪽까지 뻗는다, 약 6.4km) — 둘 다 학교 점 자체는 상자 안에 있고, 실제
   * 지리(휴전선·서해 도서)로 설명되는 정상적인 경계 초과다. 그래서 여기서는
   * 좌표계가 완전히 틀렸을 때만 잡히도록(수백 km 단위로 어긋나는 경우) 상자에
   * 넉넉한 여유(0.1도 ≈ 11km)를 더해 확인한다.
   */
  it("링은 점 셋 이상이고 좌표가 한반도 범위 안이다", () => {
    const margin = 0.1;
    const bad: string[] = [];
    for (const school of schools) {
      for (const zone of zonesFor(school.id)) {
        for (const ring of zone.rings) {
          if (ring.length < 3) bad.push(`${zone.name}: 점 ${ring.length}개`);
          for (const [lon, lat] of ring) {
            if (
              !(
                lat > bounds.minLat - margin &&
                lat < bounds.maxLat + margin &&
                lon > bounds.minLon - margin &&
                lon < bounds.maxLon + margin
              )
            ) {
              bad.push(`${zone.name}: (${lon}, ${lat})`);
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("공동통학구역은 이름에도 그 사실이 적혀 있다", () => {
    // 전국 6,198곳을 전부 읽으면 이 테스트만 몇 초가 걸린다 — 위 검사들이
    // 이미 전수를 훑었으니, 여기서는 표본으로 충분하다(이름 규칙은
    // school-zones.py가 굽는 시점에 이미 전수로 확인한다).
    const sample = schools.slice(0, 500);
    const zones = sample.flatMap((s) => zonesFor(s.id));
    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) {
      expect(zone.name.includes("공동")).toBe(zone.shared);
    }
  });
});
