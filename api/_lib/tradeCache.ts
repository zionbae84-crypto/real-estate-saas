import { Redis } from "@upstash/redis";
import type { PageAccumulator, RawTradeCache } from "../../scripts/pipeline/fetch";

export type { RawTradeCache };

/**
 * 이 파일이 실제로 쓰는 Redis 표면만 담은 타입. `geocodeCache.ts`의
 * `RedisLike`와 달리 `set`이 세 번째 인자로 만료(TTL) 옵션을 받는다 —
 * 이 캐시는 국토부 실거래가처럼 계속 갱신되는 데이터를 담으므로
 * 주소→좌표 캐시와 달리 영구 저장이면 안 된다.
 */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

const CACHE_KEY_PREFIX = "molit-raw:";

/**
 * 캐시 항목의 만료(TTL, 초). `geocodeCache`(영구 저장)와 정반대 선택이다 —
 * 이 캐시가 노리는 건 "오래 신선하게 두기"가 아니라 **한 번의 지역
 * 조회 안에서 벌어지는 중복 국토부 호출을 없애는 것**뿐이다.
 * `/api/complexes`와 `/api/geocode`가 같은 (지역, 월) 12개월치를 각각
 * 독립적으로 다시 묻는 문제(지역 하나 조회할 때마다 국토부 호출
 * 24회 — 12개월 × 2)가 실제 대상이고, 이 둘은 같은 지역 전환에서
 * 수 초 안에 연달아 일어난다. 그보다 오래 살려 둘 이유가 없어 5분으로
 * 짧게 잡는다 — 데이터가 낡을 위험보다 "속도 장치가 없으면 없는 대로
 * 돈다"는 원칙(아래 {@link createUpstashTradeCache}) 쪽이 우선이다.
 */
const TTL_SECONDS = 5 * 60;

function cacheKey(regionCode: string, yearMonth: string): string {
  return `${CACHE_KEY_PREFIX}${regionCode}:${yearMonth}`;
}

export function createTradeCache(redis: RedisLike): RawTradeCache {
  return {
    async get(regionCode, yearMonth) {
      return redis.get<PageAccumulator>(cacheKey(regionCode, yearMonth));
    },
    async set(regionCode, yearMonth, value) {
      await redis.set(cacheKey(regionCode, yearMonth), value, { ex: TTL_SECONDS });
    },
  };
}

/**
 * 아무것도 기억하지 않는 캐시. `get`은 언제나 미스, `set`은 아무 데도
 * 쓰지 않는다 — `geocodeCache.ts`의 `createNoopGeocodeCache`와 같은 이유다.
 */
export function createNoopTradeCache(): RawTradeCache {
  return {
    async get() {
      return null;
    },
    async set() {},
  };
}

/**
 * 실제 배포에서 쓰는 캐시. `geocodeCache.ts`의 `createUpstashGeocodeCache`와
 * 완전히 같은 두 겹 방어를 쓴다 — 환경변수가 없으면 아예 만들지 않고,
 * 그래도 생성이 던지면 잡는다. 캐시는 속도 장치일 뿐이라 없으면 없는
 * 대로 도는 것이 맞다(국토부 키가 없는 것과 다르다 — 그때는 답 자체를
 * 낼 수 없다).
 */
export function createUpstashTradeCache(): RawTradeCache {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return createNoopTradeCache();
  try {
    return createTradeCache(Redis.fromEnv());
  } catch {
    return createNoopTradeCache();
  }
}
