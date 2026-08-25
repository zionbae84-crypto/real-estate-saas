import { Redis } from "@upstash/redis";

export interface Coordinate {
  lat: number;
  lon: number;
}

/**
 * 이 파일이 실제로 쓰는 Redis 표면만 담은 타입. `@upstash/redis`의
 * `Redis` 클래스는 이 타입을 만족한다 — 테스트는 진짜 Redis 없이 이
 * 인터페이스만 흉내 낸 가짜로 돈다.
 */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

export interface GeocodeCache {
  get(address: string): Promise<Coordinate | null>;
  set(address: string, coordinate: Coordinate): Promise<void>;
}

const CACHE_KEY_PREFIX = "geocode:";

/**
 * 주소 → 좌표 캐시. **만료(TTL)를 두지 않는다** — 건물 주소는 실질적으로
 * 영구적이라, 국토부 실거래가 캐싱과 달리 낡을 일이 없다(부모 스펙 §4).
 */
export function createGeocodeCache(redis: RedisLike): GeocodeCache {
  return {
    async get(address) {
      return redis.get<Coordinate>(`${CACHE_KEY_PREFIX}${address}`);
    },
    async set(address, coordinate) {
      await redis.set(`${CACHE_KEY_PREFIX}${address}`, coordinate);
    },
  };
}

/** 실제 배포에서 쓰는 캐시. 환경변수(KV_REST_API_URL/TOKEN)에서 자동으로 연결한다. */
export function createUpstashGeocodeCache(): GeocodeCache {
  return createGeocodeCache(Redis.fromEnv());
}
