import { Redis } from "@upstash/redis";
import { readMany, writeMany, type RedisLike } from "./redisBatch.js";

export interface Coordinate {
  lat: number;
  lon: number;
}

export type { RedisLike };

export interface GeocodeCache {
  /**
   * 주소들의 좌표를 **한 번에** 조회한다. 결과는 입력 순서 그대로이고,
   * 캐시에 없는 자리는 `null`이다.
   */
  getMany(addresses: readonly string[]): Promise<Array<Coordinate | null>>;
  /** 주소→좌표 쌍을 **한 번에** 저장한다. */
  setMany(entries: ReadonlyArray<readonly [string, Coordinate]>): Promise<void>;
}

const CACHE_KEY_PREFIX = "geocode:";

/**
 * 주소 → 좌표 캐시. **만료(TTL)를 두지 않는다** — 건물 주소는 실질적으로
 * 영구적이라, 국토부 실거래가 캐싱과 달리 낡을 일이 없다(부모 스펙 §4).
 */
export function createGeocodeCache(redis: RedisLike): GeocodeCache {
  return {
    getMany: (addresses) => readMany<Coordinate>(redis, CACHE_KEY_PREFIX, addresses),
    setMany: (entries) => writeMany(redis, CACHE_KEY_PREFIX, entries),
  };
}

/**
 * 아무것도 기억하지 않는 캐시. `getMany`는 언제나 전부 미스, `setMany`는
 * 아무 데도 쓰지 않는다.
 *
 * 캐시가 없으면 매 요청이 지오코딩 API를 다시 부를 뿐 **결과는 똑같다** —
 * 느려지는 것은 결함이지만 틀린 답을 주는 것은 아니다. 그래서 캐시를 못
 * 만드는 상황은 국토부·네이버 키가 없는 것과 달리 요청을 실패시킬
 * 이유가 되지 않는다.
 */
export function createNoopGeocodeCache(): GeocodeCache {
  return {
    async getMany(addresses) {
      return addresses.map(() => null);
    },
    async setMany() {},
  };
}

/**
 * 실제 배포에서 쓰는 캐시. 환경변수(KV_REST_API_URL/TOKEN)에서 연결한다.
 *
 * **연결을 만들 수 없으면 던지지 않고 무동작 캐시로 물러난다.** 이
 * 저장소를 Vercel에 올리는 시점에 Upstash Redis 연동은 아직 붙어 있지
 * 않아 두 환경변수가 없다. 그때 `Redis.fromEnv()`가 어떻게 굴러도
 * `/api/geocode`가 무너지지 않게 두 겹으로 막는다:
 *
 * 1. 환경변수가 없으면 **아예 만들지 않는다.** 지금 설치된 버전
 *    (@upstash/redis 1.38.2, nodejs 엔트리)은 이 경우 던지지 않고
 *    `url: undefined`인 클라이언트를 돌려준다 — 만들어 두면 조회마다
 *    실패하며 경고를 뿜고, 요청은 그만큼 느려진다.
 * 2. 그래도 생성이 던지면 잡는다. 다른 엔트리·다른 버전은 여기서
 *    동기적으로 던지고, 그 예외는 핸들러에 닿기도 전에(형식이 잘못돼
 *    400으로 끝났어야 할 요청까지) 요청을 통째로 죽인다.
 *
 * 캐시는 속도 장치일 뿐이라 없으면 없는 대로 도는 것이 맞다 — 국토부·
 * 네이버 키가 없는 것(그때는 답 자체를 낼 수 없다)과 다르다.
 */
export function createUpstashGeocodeCache(): GeocodeCache {
  // `fromEnv`는 UPSTASH_REDIS_REST_* 를 먼저 보고 없으면 KV_REST_API_* 를
  // 본다. 여기서도 같은 두 쌍을 봐야 한다 — KV_ 쪽만 확인하면 UPSTASH_
  // 쪽으로 제대로 설정된 배포에서 캐시를 스스로 꺼 버린다.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return createNoopGeocodeCache();
  try {
    return createGeocodeCache(Redis.fromEnv());
  } catch {
    return createNoopGeocodeCache();
  }
}
