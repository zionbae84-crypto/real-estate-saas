import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHouseholdCountCache,
  createNoopHouseholdCountCache,
  createUpstashHouseholdCountCache,
  type RedisLike,
} from "./householdCountCache";

function fakeRedis(): RedisLike & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)) as RedisLike["get"],
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }) as RedisLike["set"],
  };
}

describe("createHouseholdCountCache", () => {
  it("캐시 미스면 null을 반환한다", async () => {
    const redis = fakeRedis();
    const cache = createHouseholdCountCache(redis);
    expect(await cache.get("1168010600103160000")).toBeNull();
  });

  it("저장한 값을 그대로 돌려준다", async () => {
    const redis = fakeRedis();
    const cache = createHouseholdCountCache(redis);
    await cache.set("1168010600103160000", 499);
    expect(await cache.get("1168010600103160000")).toBe(499);
  });

  it("만료(TTL) 없이 저장한다 — set 호출에 EX 옵션을 주지 않는다", async () => {
    const redis = fakeRedis();
    const cache = createHouseholdCountCache(redis);
    await cache.set("PNU", 100);
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining("household-count:"), 100);
    const call = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toHaveLength(2);
  });

  it("PNU별로 다른 캐시 키를 쓴다", async () => {
    const redis = fakeRedis();
    const cache = createHouseholdCountCache(redis);
    await cache.set("PNU-A", 100);
    await cache.set("PNU-B", 200);
    expect(redis.store.size).toBe(2);
  });
});

describe("createNoopHouseholdCountCache", () => {
  it("get은 언제나 미스이고, set은 그 사실을 바꾸지 않는다", async () => {
    const cache = createNoopHouseholdCountCache();
    await cache.set("PNU", 100);
    expect(await cache.get("PNU")).toBeNull();
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
      await cache.set("PNU", 100);
      expect(await cache.get("PNU")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
