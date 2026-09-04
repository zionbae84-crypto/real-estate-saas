// scripts/pipeline/householdCount.ts

/**
 * PNU → 세대수 캐시의 최소 표면. 실제(Redis 기반) 구현은
 * `api/_lib/householdCountCache.ts`에 있다 — 이 모듈(파이프라인 계층)은
 * Vercel 서버리스 전용 의존성(Upstash)을 몰라야 하므로 인터페이스만
 * 여기 둔다(`fetch.ts`의 `RawTradeCache`와 같은 이유). 세대수는 건물의
 * 물리적 성질이라 사실상 영구적이다 — `geocodeCache`(주소→좌표, 만료
 * 없음)와 같은 이유로 이 캐시도 TTL을 두지 않는다.
 */
export interface HouseholdCountCache {
  get(pnu: string): Promise<number | null>;
  set(pnu: string, count: number): Promise<void>;
}

/** 아무것도 기억하지 않는 캐시. 기존 호출자(테스트, 오프라인 배치)의 기본값이다. */
export const noopHouseholdCountCache: HouseholdCountCache = {
  async get() {
    return null;
  },
  async set() {},
};

/** PNU 하나로 세대수를 실제로 조회하는 함수의 모양. 진짜 구현(HTTP 호출)은 `api/_lib/`에 둔다. */
export type FetchHouseholdCount = (pnu: string) => Promise<number | null>;

/** PNU 목록 전체로 세대수를 배치 조회하는 함수의 모양. `live.ts`가 이 모양을 받는다. */
export type HouseholdCountLookup = (pnus: readonly string[]) => Promise<Map<string, number>>;

/** 아무것도 조회하지 않는 기본값 — 기존 호출자(테스트, 오프라인 배치)가 쓴다. */
export const noopHouseholdCountLookup: HouseholdCountLookup = async () => new Map();

/**
 * 동시에 띄우는 세대수 조회 수. `api/_lib/handleGeocode.ts`의
 * `GEOCODE_CONCURRENCY`와 같은 이유(한 건씩 순차로 돌면 단지 수백 개인
 * 큰 시군구에서 너무 느리고, 전부 한꺼번에 띄우면 API rate limit에
 * 걸린다)로 상한을 둔 병렬로 간다.
 */
export const HOUSEHOLD_COUNT_CONCURRENCY = 8;

/**
 * PNU 목록에서 세대수를 배치로 조회한다. 캐시를 먼저 보고, 없을 때만
 * 실제 API를 부른다 — `handleGeocode.ts`의 `resolveCoordinate`와 같은
 * 원칙으로 실패를 다룬다: 캐시 조회·저장·API 호출 어느 하나가 실패해도
 * 그 PNU 하나만 조용히 결과 Map에서 빠지고, 나머지·전체 조회는 무너지지
 * 않는다.
 *
 * **"확인하지 못했다"와 "세대수가 없다"를 구분하지 않는다** — 지오코딩의
 * `partialFailureCount`와 달리, 세대수는 이 앱의 핵심 필터(매매가·면적·
 * 입주년차)가 아니라 부가 정보라 그 구분을 화면까지 끌고 갈 만한 무게가
 * 없다는 판단이다. 둘 다 결과 Map에 그 PNU가 없는 것으로 나타나고,
 * 호출부는 "모른다"로만 다룬다.
 */
export async function lookupHouseholdCounts(
  pnus: readonly string[],
  cache: HouseholdCountCache,
  fetchOne: FetchHouseholdCount,
  concurrency: number = HOUSEHOLD_COUNT_CONCURRENCY,
): Promise<Map<string, number>> {
  const uniquePnus = [...new Set(pnus)];
  const result = new Map<string, number>();

  for (let i = 0; i < uniquePnus.length; i += concurrency) {
    const batch = uniquePnus.slice(i, i + concurrency);
    const resolved = await Promise.all(batch.map((pnu) => resolveOne(pnu, cache, fetchOne)));
    for (let j = 0; j < batch.length; j++) {
      const count = resolved[j];
      const pnu = batch[j];
      if (count !== null && count !== undefined && pnu !== undefined) result.set(pnu, count);
    }
  }

  return result;
}

async function resolveOne(
  pnu: string,
  cache: HouseholdCountCache,
  fetchOne: FetchHouseholdCount,
): Promise<number | null> {
  let cached: number | null;
  try {
    cached = await cache.get(pnu);
  } catch {
    // 캐시 조회 실패는 미스와 동일하게 취급한다 — 기능은 계속 동작하고 속도 이점만 잃는다.
    cached = null;
  }
  if (cached !== null) return cached;

  let count: number | null;
  try {
    count = await fetchOne(pnu);
  } catch {
    // 이 PNU 하나의 조회가 실패했다 — 나머지 PNU들의 조회를 막지 않는다.
    return null;
  }
  if (count === null) return null;

  try {
    await cache.set(pnu, count);
  } catch {
    // 저장 실패로 이미 구한 값을 버리지 않는다 — 다음 요청이 다시 구할 뿐이다.
  }
  return count;
}
