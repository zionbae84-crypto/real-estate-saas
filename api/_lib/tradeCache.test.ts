import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNoopTradeCache,
  createTradeCache,
  createUpstashTradeCache,
  type RedisLike,
} from "./tradeCache";
import type { PageAccumulator } from "../../scripts/pipeline/fetch";

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

function page(over: Partial<PageAccumulator> = {}): PageAccumulator {
  return { trades: [], failures: 0, cancelled: 0, truncated: false, ...over };
}

describe("createTradeCache", () => {
  it("캐시 미스면 null을 반환한다", async () => {
    const redis = fakeRedis();
    const cache = createTradeCache(redis);
    expect(await cache.get("11680", "202601")).toBeNull();
  });

  it("저장한 값을 그대로 돌려준다", async () => {
    const redis = fakeRedis();
    const cache = createTradeCache(redis);
    const value = page({ trades: [], failures: 1 });
    await cache.set("11680", "202601", value);
    expect(await cache.get("11680", "202601")).toEqual(value);
  });

  it("만료(TTL)를 걸어 저장한다 — geocodeCache와 달리 영구 저장이 아니다", async () => {
    const redis = fakeRedis();
    const cache = createTradeCache(redis);
    await cache.set("11680", "202601", page());
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining("molit-raw:11680:202601"),
      expect.anything(),
      expect.objectContaining({ ex: expect.any(Number) }),
    );
  });

  it("지역·월 조합별로 다른 캐시 키를 쓴다", async () => {
    const redis = fakeRedis();
    const cache = createTradeCache(redis);
    await cache.set("11680", "202601", page());
    await cache.set("11680", "202602", page());
    await cache.set("11650", "202601", page());
    expect(redis.store.size).toBe(3);
  });
});

describe("createNoopTradeCache", () => {
  it("get은 언제나 미스이고, set은 그 사실을 바꾸지 않는다", async () => {
    const cache = createNoopTradeCache();
    await cache.set("11680", "202601", page());
    expect(await cache.get("11680", "202601")).toBeNull();
  });
});

describe("createUpstashTradeCache", () => {
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
    const cache = createUpstashTradeCache();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("무동작 캐시가 네트워크를 불렀다");
    }) as typeof fetch;
    try {
      await cache.set("11680", "202601", page());
      expect(await cache.get("11680", "202601")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
