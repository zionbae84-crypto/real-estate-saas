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
  /**
   * PNU들의 세대수를 **한 번에** 조회한다. 결과는 입력 순서 그대로이고,
   * 캐시에 없는 자리는 `null`이다. 한 건씩 왕복하면 단지 수백 개인 시군구
   * 하나에 수백 번의 네트워크 왕복이 된다 — `geocodeCache`가 같은 이유로
   * 같은 모양을 쓴다(`api/_lib/redisBatch.ts`).
   */
  getMany(pnus: readonly string[]): Promise<Array<number | null>>;
  /** PNU→세대수 쌍을 **한 번에** 저장한다. */
  setMany(entries: ReadonlyArray<readonly [string, number]>): Promise<void>;
}

/** 아무것도 기억하지 않는 캐시. 기존 호출자(테스트, 오프라인 배치)의 기본값이다. */
export const noopHouseholdCountCache: HouseholdCountCache = {
  async getMany(pnus) {
    return pnus.map(() => null);
  },
  async setMany() {},
};

/** PNU 하나로 세대수를 실제로 조회하는 함수의 모양. 진짜 구현(HTTP 호출)은 `api/_lib/`에 둔다. */
export type FetchHouseholdCount = (pnu: string) => Promise<number | null>;

/**
 * 시군구 하나의 세대수를 한 번에 긁어 오는 함수의 모양(PNU → 세대수).
 * 진짜 구현은 `api/_lib/householdCountApi.ts`의
 * `fetchHouseholdCountsByRegion`이다.
 */
export type FetchHouseholdCountsByRegion = (regionCode: string) => Promise<Map<string, number>>;

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
export const HOUSEHOLD_COUNT_CONCURRENCY = 16;

/** PNU 앞 5자리가 곧 시군구 코드다(`pnu.ts` 참고). */
function regionOf(pnu: string): string | null {
  return pnu.length >= 5 ? pnu.slice(0, 5) : null;
}

/** 목록을 `concurrency`개씩 끊어 병렬로 돈다. 결과 순서는 입력 순서 그대로다. */
async function inBatches<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    out.push(...(await Promise.all(items.slice(i, i + concurrency).map(fn))));
  }
  return out;
}

export interface LookupHouseholdCountsOptions {
  /** 동시에 띄우는 요청 수. 기본값 {@link HOUSEHOLD_COUNT_CONCURRENCY}. */
  concurrency?: number;
  /**
   * 시군구 일괄 조회. 주면 캐시 미스가 많을 때 단건 조회 대신 이것을 쓴다
   * (아래 {@link lookupHouseholdCounts} 문서의 "일괄로 가는 조건" 참고).
   * 안 주면 예전처럼 전부 단건으로 돈다 — 오프라인 배치·기존 테스트가 그렇다.
   */
  fetchByRegion?: FetchHouseholdCountsByRegion;
}

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
 *
 * ── 일괄로 가는 조건 ─────────────────────────────────────────────
 *
 * 캐시 미스가 `concurrency`보다 많고 `fetchByRegion`이 있으면, 단건을
 * 여러 배치로 도는 대신 **시군구별로 한 번씩** 긁어 온다. 실측 근거:
 *
 *     단건 16건 동시 → 741ms       (해운대구 242개 = 15배치 ≈ 11초)
 *     시군구 일괄     → 1,290ms    (2,300건 3페이지, 한 번)
 *
 * 그래서 미스가 한 배치 안에 들어오면(≤ concurrency) 단건이 더 싸고,
 * 그보다 많으면 일괄이 이긴다 — 그 경계를 `concurrency`로 잡았다.
 *
 * **일괄이 실패하면 그 시군구는 단건으로 되돌아간다.** 일괄 조회는
 * 속도 장치일 뿐이라, 없으면 없는 대로 돌아야 한다(`tradeCache`·
 * `geocodeCache`와 같은 원칙).
 *
 * **일괄 표에 없는 PNU는 단건으로 다시 묻지 않는다.** 같은 데이터셋을
 * 같은 필터로 훑은 결과라 단건으로 물어도 답은 같다(실측: 표본 12건
 * 12/12 일치). 표가 반쪽일 수 있는 경우 — 페이지 상한에 걸린 경우 —
 * 는 `fetchHouseholdCountsByRegion`이 아예 던지므로 여기까지 오지 않는다.
 */
export async function lookupHouseholdCounts(
  pnus: readonly string[],
  cache: HouseholdCountCache,
  fetchOne: FetchHouseholdCount,
  options: LookupHouseholdCountsOptions = {},
): Promise<Map<string, number>> {
  const { concurrency = HOUSEHOLD_COUNT_CONCURRENCY, fetchByRegion } = options;
  const uniquePnus = [...new Set(pnus)];
  const result = new Map<string, number>();

  // ── 1. 캐시부터. 읽기는 **한 번의 묶음 조회**다 — PNU마다 왕복하면
  //       그 수백 번이 그대로 네트워크 왕복이 되어, 캐시가 다 찬 지역이
  //       오히려 느려진다.
  const cached = await safeGetMany(cache, uniquePnus);
  const misses: string[] = [];
  uniquePnus.forEach((pnu, i) => {
    const count = cached[i];
    if (count !== null && count !== undefined) result.set(pnu, count);
    else misses.push(pnu);
  });
  if (misses.length === 0) return result;

  // ── 2. 미스가 많으면 시군구 일괄로. 실패하거나 조건이 안 맞는 것은
  //       아래 단건 경로로 넘긴다.
  const bySingle: string[] = [];
  if (fetchByRegion !== undefined && misses.length > concurrency) {
    const byRegion = new Map<string, string[]>();
    for (const pnu of misses) {
      const region = regionOf(pnu);
      // 형식이 어긋난 PNU는 시군구를 못 뽑는다 — 단건으로 보낸다.
      if (region === null) {
        bySingle.push(pnu);
        continue;
      }
      const list = byRegion.get(region);
      if (list === undefined) byRegion.set(region, [pnu]);
      else list.push(pnu);
    }

    const fresh: Array<[string, number]> = [];
    for (const [region, regionPnus] of byRegion) {
      let table: Map<string, number>;
      try {
        table = await fetchByRegion(region);
      } catch {
        // 일괄이 죽어도 조회 자체는 살아야 한다 — 단건으로 되돌아간다.
        bySingle.push(...regionPnus);
        continue;
      }
      for (const pnu of regionPnus) {
        const count = table.get(pnu);
        // 표에 없으면 "모른다" — 위 문서의 "단건으로 다시 묻지 않는다" 참고.
        if (count === undefined) continue;
        result.set(pnu, count);
        fresh.push([pnu, count]);
      }
    }
    // 캐시 쓰기도 묶음으로 — 위 읽기와 같은 이유다.
    await safeSetMany(cache, fresh);
  } else {
    bySingle.push(...misses);
  }

  // ── 3. 남은 것은 단건으로. 구한 값은 마지막에 한 번에 저장한다.
  if (bySingle.length > 0) {
    const resolved = await inBatches(bySingle, concurrency, (pnu) => resolveOne(pnu, fetchOne));
    const fresh: Array<readonly [string, number]> = [];
    bySingle.forEach((pnu, i) => {
      const count = resolved[i];
      if (count !== null && count !== undefined) {
        result.set(pnu, count);
        fresh.push([pnu, count]);
      }
    });
    await safeSetMany(cache, fresh);
  }

  return result;
}

/**
 * 캐시 조회 실패는 전부 미스와 동일하게 취급한다 — 기능은 계속 동작하고
 * 속도 이점만 잃는다. 돌려주는 배열은 언제나 `pnus`와 같은 길이다.
 */
async function safeGetMany(
  cache: HouseholdCountCache,
  pnus: readonly string[],
): Promise<Array<number | null>> {
  try {
    const cached = await cache.getMany(pnus);
    return pnus.map((_, i) => cached[i] ?? null);
  } catch {
    return pnus.map(() => null);
  }
}

/** 저장 실패로 이미 구한 값을 버리지 않는다 — 다음 요청이 다시 구할 뿐이다. */
async function safeSetMany(
  cache: HouseholdCountCache,
  entries: ReadonlyArray<readonly [string, number]>,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await cache.setMany(entries);
  } catch {
    /* 무시 — 위 주석 참고 */
  }
}

/** 캐시를 이미 확인한 PNU 하나를 단건 API로 구한다. 저장은 호출부가 묶어서 한다. */
async function resolveOne(
  pnu: string,
  fetchOne: FetchHouseholdCount,
): Promise<number | null> {
  try {
    return await fetchOne(pnu);
  } catch {
    // 이 PNU 하나의 조회가 실패했다 — 나머지 PNU들의 조회를 막지 않는다.
    return null;
  }
}
