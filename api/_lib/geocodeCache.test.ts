import { describe, expect, it, vi } from "vitest";
import { createGeocodeCache, type RedisLike } from "./geocodeCache";

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
