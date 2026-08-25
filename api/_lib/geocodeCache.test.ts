import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGeocodeCache,
  createNoopGeocodeCache,
  createUpstashGeocodeCache,
  type RedisLike,
} from "./geocodeCache";

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

describe("createGeocodeCache", () => {
  it("캐시 미스면 null을 반환한다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    expect(await cache.get("서울특별시 강남구 역삼동 719-3")).toBeNull();
  });

  it("저장한 값을 그대로 돌려준다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    await cache.set("서울특별시 강남구 역삼동 719-3", { lat: 37.1, lon: 127.1 });
    expect(await cache.get("서울특별시 강남구 역삼동 719-3")).toEqual({ lat: 37.1, lon: 127.1 });
  });

  it("만료(TTL) 없이 저장한다 — set 호출에 EX 옵션을 주지 않는다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    await cache.set("주소", { lat: 1, lon: 1 });
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining("geocode:"), { lat: 1, lon: 1 });
    // 세 번째 인자(옵션)를 넘기지 않았는지 — 인자 개수로 확인한다.
    const call = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toHaveLength(2);
  });

  it("주소별로 다른 캐시 키를 쓴다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    await cache.set("주소A", { lat: 1, lon: 1 });
    await cache.set("주소B", { lat: 2, lon: 2 });
    expect(redis.store.size).toBe(2);
  });
});

describe("createNoopGeocodeCache", () => {
  it("get은 언제나 미스이고, set은 그 사실을 바꾸지 않는다", async () => {
    const cache = createNoopGeocodeCache();
    await cache.set("주소", { lat: 1, lon: 1 });
    expect(await cache.get("주소")).toBeNull();
  });
});

describe("createUpstashGeocodeCache", () => {
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
    // Upstash 연동을 붙이기 전(=첫 배포 시점)의 상태다. 이 자리에서 예외가
    // 나면 형식이 잘못돼 400으로 끝났어야 할 요청까지 핸들러에 닿기도 전에
    // 죽고, 예외 대신 url이 빈 클라이언트를 만들면 주소마다 get/set이 각각
    // 실패하며 요청이 그만큼 느려진다. 둘 다 아니어야 한다.
    const cache = createUpstashGeocodeCache();

    // 무동작 캐시는 네트워크를 아예 건드리지 않는다 — fetch를 부르면 실패시킨다.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("무동작 캐시가 네트워크를 불렀다");
    }) as typeof fetch;
    try {
      await cache.set("주소", { lat: 1, lon: 1 });
      expect(await cache.get("주소")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
