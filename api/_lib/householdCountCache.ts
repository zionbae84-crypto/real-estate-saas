import { Redis } from "@upstash/redis";
import type { HouseholdCountCache } from "../../scripts/pipeline/householdCount";
import { readMany, writeMany, type RedisLike } from "./redisBatch";

export type { RedisLike };

const CACHE_KEY_PREFIX = "household-count:";

/**
 * PNU → 세대수 캐시. **만료(TTL)를 두지 않는다** — 세대수는 건물이
 * 재건축되지 않는 한 바뀌지 않는 물리적 성질이라, `geocodeCache`(주소→
 * 좌표)와 같은 이유로 낡을 일이 없다.
 */
export function createHouseholdCountCache(redis: RedisLike): HouseholdCountCache {
  return {
    getMany: (pnus) => readMany<number>(redis, CACHE_KEY_PREFIX, pnus),
    setMany: (entries) => writeMany(redis, CACHE_KEY_PREFIX, entries),
  };
}

/**
 * 아무것도 기억하지 않는 캐시. `get`은 언제나 미스, `set`은 아무 데도
 * 쓰지 않는다 — `geocodeCache.ts`의 `createNoopGeocodeCache`와 같은 이유다.
 */
export function createNoopHouseholdCountCache(): HouseholdCountCache {
  return {
    async getMany(pnus) {
      return pnus.map(() => null);
    },
    async setMany() {},
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
