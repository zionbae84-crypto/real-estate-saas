import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGeocodeCache,
  createNoopGeocodeCache,
  createUpstashGeocodeCache,
  type RedisLike,
} from "./geocodeCache";

/**
 * 이 캐시는 **한 지역의 주소 수백 개**를 한꺼번에 다루는 자리에서만
 * 쓰인다(`handleGeocode.ts`). 그래서 검사도 두 축이다 — 값이 오가는가,
 * 그리고 **몇 번 오가는가**. 뒤엣것이 이 파일이 존재하는 이유다: 예전엔
 * 주소마다 왕복해 289개 지역이면 Upstash 왕복만 수백 번이었다.
 */
function fakeRedis(): RedisLike & { store: Map<string, unknown>; mget: ReturnType<typeof vi.fn>; mset: ReturnType<typeof vi.fn> } {
  const store = new Map<string, unknown>();
  return {
    store,
    mget: vi.fn(async (keys: string[]) => keys.map((k) => (store.has(k) ? store.get(k) : null))),
    mset: vi.fn(async (kv: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(kv)) store.set(k, v);
      return "OK";
    }),
  } as never;
}

describe("createGeocodeCache", () => {
  it("캐시 미스면 null을 반환한다", async () => {
    const cache = createGeocodeCache(fakeRedis());
    expect(await cache.getMany(["서울특별시 강남구 역삼동 719-3"])).toEqual([null]);
  });

  it("저장한 값을 그대로 돌려준다", async () => {
    const cache = createGeocodeCache(fakeRedis());
    await cache.setMany([["서울특별시 강남구 역삼동 719-3", { lat: 37.1, lon: 127.1 }]]);
    expect(await cache.getMany(["서울특별시 강남구 역삼동 719-3"])).toEqual([
      { lat: 37.1, lon: 127.1 },
    ]);
  });

  it("주소별로 다른 캐시 키를 쓴다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    await cache.setMany([
      ["주소A", { lat: 1, lon: 1 }],
      ["주소B", { lat: 2, lon: 2 }],
    ]);
    expect(redis.store.size).toBe(2);
  });

  it("만료(TTL) 없이 저장한다 — mset에는 만료 옵션 자리가 없다", async () => {
    const redis = fakeRedis();
    await createGeocodeCache(redis).setMany([["주소", { lat: 1, lon: 1 }]]);
    // 인자는 키-값 사전 하나뿐이다. (예전 `set`은 세 번째 자리에 EX 옵션을
    // 받을 수 있어 인자 개수를 세야 했다.)
    expect(redis.mset.mock.calls[0]).toHaveLength(1);
    expect(redis.mset).toHaveBeenCalledWith({ "geocode:주소": { lat: 1, lon: 1 } });
  });

  /*
   * ── 왕복 횟수 ──────────────────────────────────────────────────
   *
   * 값만 맞으면 주소마다 한 번씩 왕복해도 이 위의 검사는 전부 통과한다.
   * 아래 넷이 "묶어 보낸다"는 성질 자체를 못박는다.
   */
  it("주소가 여럿이어도 읽기는 한 번의 왕복이다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    await cache.getMany(["주소A", "주소B", "주소C"]);

    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(redis.mget).toHaveBeenCalledWith(["geocode:주소A", "geocode:주소B", "geocode:주소C"]);
  });

  it("주소가 여럿이어도 쓰기는 한 번의 왕복이다", async () => {
    const redis = fakeRedis();
    await createGeocodeCache(redis).setMany([
      ["주소A", { lat: 1, lon: 1 }],
      ["주소B", { lat: 2, lon: 2 }],
    ]);
    expect(redis.mset).toHaveBeenCalledTimes(1);
  });

  it("히트와 미스가 섞여도 자리를 지킨다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    await cache.setMany([["주소B", { lat: 2, lon: 2 }]]);

    // 순서가 어긋나면 단지가 엉뚱한 좌표를 받는다 — 지도에 잘못된 위치로
    // 찍히고, 그건 좌표가 없는 것보다 나쁘다.
    expect(await cache.getMany(["주소A", "주소B", "주소C"])).toEqual([
      null,
      { lat: 2, lon: 2 },
      null,
    ]);
  });

  it("빈 목록이면 아예 왕복하지 않는다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);

    // Redis의 MGET/MSET은 인자가 없으면 오류다. 빈 묶음을 그대로 보내면
    // 캐시가 죽는 것이 아니라 **요청이** 죽는다.
    expect(await cache.getMany([])).toEqual([]);
    await cache.setMany([]);
    expect(redis.mget).not.toHaveBeenCalled();
    expect(redis.mset).not.toHaveBeenCalled();
  });

  it("아주 큰 지역은 나눠 보내되, 값과 순서는 그대로다", async () => {
    const redis = fakeRedis();
    const cache = createGeocodeCache(redis);
    // 한 번에 담는 상한(256)을 넘긴다 — Upstash REST는 명령을 JSON 본문에
    // 담으므로 상한 없이 보내면 본문이 커진다.
    const addresses = Array.from({ length: 600 }, (_, i) => `주소${i}`);
    await cache.setMany(addresses.map((a, i) => [a, { lat: i, lon: i }] as const));

    expect(redis.mset).toHaveBeenCalledTimes(3); // 256 + 256 + 88
    redis.mget.mockClear();
    expect(await cache.getMany(addresses)).toEqual(addresses.map((_, i) => ({ lat: i, lon: i })));
    expect(redis.mget).toHaveBeenCalledTimes(3);
  });

  it("Redis가 요청한 키보다 짧게 돌려줘도 값을 지어내지 않는다", async () => {
    const redis = fakeRedis();
    redis.mget.mockResolvedValueOnce([{ lat: 1, lon: 1 }]); // 3개 물었는데 1개만 왔다
    const cache = createGeocodeCache(redis);

    // 모자란 자리는 미스로 채운다 — 앞의 값을 뒤로 밀어 넣으면 단지가
    // 남의 좌표를 받는다.
    expect(await cache.getMany(["주소A", "주소B", "주소C"])).toEqual([
      { lat: 1, lon: 1 },
      null,
      null,
    ]);
  });
});

describe("createNoopGeocodeCache", () => {
  it("getMany는 언제나 전부 미스이고, setMany는 그 사실을 바꾸지 않는다", async () => {
    const cache = createNoopGeocodeCache();
    await cache.setMany([["주소", { lat: 1, lon: 1 }]]);
    expect(await cache.getMany(["주소", "다른 주소"])).toEqual([null, null]);
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
    // 죽고, 예외 대신 url이 빈 클라이언트를 만들면 조회·저장이 매번
    // 실패하며 요청이 그만큼 느려진다. 둘 다 아니어야 한다.
    const cache = createUpstashGeocodeCache();

    // 무동작 캐시는 네트워크를 아예 건드리지 않는다 — fetch를 부르면 실패시킨다.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("무동작 캐시가 네트워크를 불렀다");
    }) as typeof fetch;
    try {
      await cache.setMany([["주소", { lat: 1, lon: 1 }]]);
      expect(await cache.getMany(["주소"])).toEqual([null]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
