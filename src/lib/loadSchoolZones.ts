import { decodeRing, type SchoolZone } from "../data/school-zones";

interface ChunkFile {
  schemaVersion: number;
  zones: Array<{ id: string; name: string; shared: boolean; rings: number[][] }>;
}

/**
 * 학교 하나의 통학구역 도형을 `public/school-zones/<학교ID>.json`에서
 * 내려받는다. `regionQuery.ts`와 별개 파일로 두는 이유는 그 파일의 두
 * 엔드포인트(`/api/complexes`, `/api/geocode`)가 재무·지역 조건이 실린
 * **백엔드 API**인 반면, 여기는 학교ID 하나만 경로에 실어 **정적 자산**을
 * 받는 완전히 다른 성격의 호출이라서다 — 같은 파일에 섞으면 "이 파일의
 * fetch는 전부 상대경로 API 엔드포인트"라는 `regionQuery.ts` 쪽 가드의
 * 전제가 깨진다.
 *
 * 재무 정보(현금·소득·기존부채 등)는 요청에 실리지 않는다 — 인자가
 * 학교ID 하나뿐이다.
 */

/** 학교ID → 이미 내려받아 디코딩한 통학구역. 같은 학교를 다시 펼쳐도 다시 안 받는다. */
const cache = new Map<string, SchoolZone[]>();
/** 진행 중인 요청 — 같은 학교를 빠르게 두 번 펼쳐도 fetch가 두 번 나가지 않게 한다. */
const inFlight = new Map<string, Promise<SchoolZone[]>>();

export async function loadSchoolZones(schoolId: string): Promise<SchoolZone[]> {
  const cached = cache.get(schoolId);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(schoolId);
  if (pending !== undefined) return pending;

  const promise = (async () => {
    const res = await fetch(`/school-zones/${encodeURIComponent(schoolId)}.json`);
    if (!res.ok) {
      throw new Error(`통학구역 조회 실패 (HTTP ${res.status})`);
    }
    const body = (await res.json()) as ChunkFile;
    const zones: SchoolZone[] = body.zones.map((z) => ({
      id: z.id,
      name: z.name,
      shared: z.shared,
      rings: z.rings.map(decodeRing),
    }));
    cache.set(schoolId, zones);
    return zones;
  })();

  inFlight.set(schoolId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(schoolId);
  }
}

/** 테스트 전용. 캐시가 있으면 매 테스트가 이전 테스트의 fetch 결과를 재사용해 버린다. */
export function resetSchoolZonesCacheForTest(): void {
  cache.clear();
  inFlight.clear();
}
