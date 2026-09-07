import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHouseholdCountCache,
  createNoopHouseholdCountCache,
  createUpstashHouseholdCountCache,
  type RedisLike,
} from "./householdCountCache";

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    mget: vi.fn(async (keys: string[]) => keys.map((k) => (store.has(k) ? store.get(k) : null))),
    mset: vi.fn(async (kv: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(kv)) store.set(k, v);
      return "OK";
    }),
  } as unknown as RedisLike & {
    store: Map<string, unknown>;
    mget: ReturnType<typeof vi.fn>;
    mset: ReturnType<typeof vi.fn>;
  };
}

describe("createHouseholdCountCache", () => {
  it("캐시 미스면 null을 반환한다", async () => {
    const cache = createHouseholdCountCache(fakeRedis());
    expect(await cache.getMany(["1168010600103160000"])).toEqual([null]);
  });

  it("저장한 값을 그대로 돌려준다", async () => {
    const cache = createHouseholdCountCache(fakeRedis());
    await cache.setMany([["1168010600103160000", 499]]);
    expect(await cache.getMany(["1168010600103160000"])).toEqual([499]);
  });

  it("만료(TTL) 없이 저장한다 — mset에는 만료 옵션 자리가 없다", async () => {
    const redis = fakeRedis();
    await createHouseholdCountCache(redis).setMany([["PNU", 100]]);
    expect(redis.mset).toHaveBeenCalledWith({ "household-count:PNU": 100 });
    expect(redis.mset.mock.calls[0]).toHaveLength(1);
  });

  it("PNU별로 다른 캐시 키를 쓴다", async () => {
    const redis = fakeRedis();
    await createHouseholdCountCache(redis).setMany([
      ["PNU-A", 100],
      ["PNU-B", 200],
    ]);
    expect(redis.store.size).toBe(2);
  });

  it("PNU가 여럿이어도 읽기·쓰기가 각각 한 번의 왕복이다", async () => {
    // 값만 맞으면 PNU마다 왕복해도 위 검사들은 전부 통과한다. 이 검사가
    // "묶어 보낸다"는 성질 자체를 못박는다.
    const redis = fakeRedis();
    const cache = createHouseholdCountCache(redis);
    await cache.setMany([
      ["A", 1],
      ["B", 2],
      ["C", 3],
    ]);
    expect(await cache.getMany(["A", "B", "C"])).toEqual([1, 2, 3]);
    expect(redis.mset).toHaveBeenCalledTimes(1);
    expect(redis.mget).toHaveBeenCalledTimes(1);
  });
});

describe("createNoopHouseholdCountCache", () => {
  it("getMany는 언제나 전부 미스이고, setMany는 그 사실을 바꾸지 않는다", async () => {
    const cache = createNoopHouseholdCountCache();
    await cache.setMany([["PNU", 100]]);
    expect(await cache.getMany(["PNU", "다른 PNU"])).toEqual([null, null]);
  });
});

describe("createUpstashHouseholdCountCache", () => {
  const ENV_NAMES = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ] as const;
  const saved = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));

  afterEach(() => {
    for (const name of ENV_NAMES) {
      const value = saved[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.restoreAllMocks();
  });

  it("환경변수가 없으면 던지지도, 실패하는 클라이언트를 만들지도 않는다", async () => {
    for (const name of ENV_NAMES) delete process.env[name];
    const cache = createUpstashHouseholdCountCache();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("무동작 캐시가 네트워크를 불렀다");
    }) as typeof fetch;
    try {
      await cache.setMany([["PNU", 100]]);
      expect(await cache.getMany(["PNU"])).toEqual([null]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
