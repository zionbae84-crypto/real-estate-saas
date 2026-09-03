import rawZones from "../../data/school-zones.json";

/**
 * 초등학교 통학구역(학구도) 도면.
 *
 * ## 여기 있는 것이 무엇이 아닌가
 *
 * **배정 결과가 아니다.** 통학구역은 교육청이 정한 "이 구역에 살면 이 학교로
 * 갈 수 있다"는 경계일 뿐, 실제 배정은 공동통학구역·근거리 배정·학교 사정으로
 * 달라진다. 게다가 원본이 "수시"로 갱신된다(`DATA_AS_OF`가 이 파일이 굳은
 * 날이다). 그래서 화면은 이 경계를 그리면서도 룰셋의 `schoolZoneNote`
 * ("배정은 학구도로 정해지니 교육지원청에 확인하라")를 함께 낸다
 * (`ComplexMap.tsx` 참고).
 *
 * ## 좌표가 접혀 있는 이유
 *
 * 파일 안의 링은 `[lon0, lat0, dlon1, dlat1, ...]` 꼴의 **정수 배열**이다
 * (단위 1e-6도 ≈ 11cm, 첫 점 뒤로는 이웃 점과의 차이만 적는다). 그대로
 * 좌표쌍을 적으면 470KB인데 이렇게 접으면 216KB다 — 정밀도는 그대로다
 * (`scripts/pipeline/school-zones.py`의 `encode_ring` 참고).
 *
 * 이 파일을 청크로 잘라 늦게 부르면 이런 접기가 필요 없지만, 그러려면 동적
 * 모듈 로딩 문법이 필요하고 그 문법은 `src/no-network.test.ts`가 막는다 —
 * 리뷰어가 심었던 유출 경로 7개 중 하나가 임의 URL을 그 문법으로 불러오는
 * 것이었다. 그 가드를 느슨하게 하는 것보다 파일을 줄이는 편이 맞바꿈이
 * 낫다고 보았다(그 가드는 주석까지 훑으므로 여기서도 그 문법을 적지 않는다).
 */

/** 통학구역 하나. `rings`의 점은 **[경도, 위도]** 순서다(GeoJSON과 같다). */
export interface SchoolZone {
  id: string;
  /** 학구명(예: "서울학동초통학구역", "서울금옥초서울옥수초공동통학구역") */
  name: string;
  /**
   * 공동통학구역인가. **참이면 그 구역 안에서 학교를 고를 수 있다**는 뜻이라,
   * 경계를 "이 학교로 간다"로 읽으면 더 틀린다.
   */
  shared: boolean;
  rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

interface RawFile {
  schemaVersion: number;
  dataAsOf: string | string[];
  zones: Record<string, { name: string; shared: boolean; rings: number[][] }>;
  bySchool: Record<string, string[]>;
}

const raw = rawZones as unknown as RawFile;

/** 도면이 굳은 날(원본의 데이터기준일자) */
export const DATA_AS_OF: string = Array.isArray(raw.dataAsOf)
  ? raw.dataAsOf.join(", ")
  : raw.dataAsOf;

/** 접어 둔 정수 배열을 좌표쌍으로 되돌린다(`encode_ring`의 역). */
function decodeRing(encoded: readonly number[]): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    if (i === 0) {
      x = encoded[0]!;
      y = encoded[1]!;
    } else {
      x += encoded[i]!;
      y += encoded[i + 1]!;
    }
    out.push([x / 1_000_000, y / 1_000_000]);
  }
  return out;
}

/** 한 번 푼 학구는 다시 풀지 않는다 — 같은 학교를 다시 눌러도 그대로 쓴다. */
const decoded = new Map<string, SchoolZone>();

function zoneById(id: string): SchoolZone | null {
  const cached = decoded.get(id);
  if (cached !== undefined) return cached;
  const z = raw.zones[id];
  if (z === undefined) return null;
  const zone: SchoolZone = {
    id,
    name: z.name,
    shared: z.shared,
    rings: z.rings.map(decodeRing),
  };
  decoded.set(id, zone);
  return zone;
}

/**
 * 그 학교의 통학구역들.
 *
 * **빈 배열은 "이 학교는 통학구역이 없다"는 뜻이다** — 사립·국립 초등학교가
 * 그렇다(추첨·선발로 뽑으므로 배정 구역 자체가 없다). 우리 지역 285곳 중
 * 13곳이 여기 해당하고, 그 13곳은 실제로 전부 사립 12곳·국립 1곳이었다.
 *
 * 한 학교가 구역을 여럿 가질 수 있다(우리 지역 272곳 중 85곳) — 공동통학구역이
 * 섞이거나 구역이 떨어져 있는 경우다.
 */
export function schoolZonesFor(schoolId: string): SchoolZone[] {
  const ids = raw.bySchool[schoolId] ?? [];
  return ids.flatMap((id) => {
    const zone = zoneById(id);
    return zone === null ? [] : [zone];
  });
}

/** 통학구역 자료가 있는 학교인가 — "없다"와 "모른다"를 가르는 데 쓴다. */
export function hasSchoolZoneData(schoolId: string): boolean {
  return schoolId in raw.bySchool;
}
