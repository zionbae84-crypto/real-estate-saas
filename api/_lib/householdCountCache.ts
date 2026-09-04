import { Redis } from "@upstash/redis";
import type { HouseholdCountCache } from "../../scripts/pipeline/householdCount";

/**
 * 이 파일이 실제로 쓰는 Redis 표면만 담은 타입. `geocodeCache.ts`의
 * `RedisLike`와 같은 모양이다(만료 없음 — 세대수도 주소→좌표처럼
 * 사실상 영구적이다). `@upstash/redis`의 `Redis` 클래스는 이 타입을
 * 만족한다 — 테스트는 진짜 Redis 없이 이 인터페이스만 흉내 낸 가짜로 돈다.
 */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

const CACHE_KEY_PREFIX = "household-count:";

/**
 * PNU → 세대수 캐시. **만료(TTL)를 두지 않는다** — 세대수는 건물이
 * 재건축되지 않는 한 바뀌지 않는 물리적 성질이라, `geocodeCache`(주소→
 * 좌표)와 같은 이유로 낡을 일이 없다.
 */
export function createHouseholdCountCache(redis: RedisLike): HouseholdCountCache {
  return {
    async get(pnu) {
      return redis.get<number>(`${CACHE_KEY_PREFIX}${pnu}`);
    },
    async set(pnu, count) {
      await redis.set(`${CACHE_KEY_PREFIX}${pnu}`, count);
    },
  };
}

/**
 * 아무것도 기억하지 않는 캐시. `get`은 언제나 미스, `set`은 아무 데도
 * 쓰지 않는다 — `geocodeCache.ts`의 `createNoopGeocodeCache`와 같은 이유다.
 */
export function createNoopHouseholdCountCache(): HouseholdCountCache {
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
 * 대로 도는 것이 맞다(국토부·한국부동산원 키가 없는 것과 다르다 —
 * 그때는 답 자체를 낼 수 없다).
 */
export function createUpstashHouseholdCountCache(): HouseholdCountCache {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return createNoopHouseholdCountCache();
  try {
    return createHouseholdCountCache(Redis.fromEnv());
  } catch {
    return createNoopHouseholdCountCache();
  }
}
