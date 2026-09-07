import { describe, expect, it, vi } from "vitest";
import {
  FRESH_SECONDS,
  LIVE_TIMEOUT_SECONDS,
  REVALIDATE_SECONDS,
  STALE_SECONDS,
  createNoopResponseCache,
  createResponseCache,
  type RedisLike,
} from "./responseCache";

/**
 * 이 캐시가 지키려는 것은 하나다 — **국토부가 멈춰도 앱이 통째로 죽지
 * 않는다.** 2026-09-06에 실제로 하루 종일 멈췄고, 그때 앱은 50초를
 * 기다렸다가 502를 냈다(`responseCache.ts` 머리주석).
 *
 * 그래서 검사도 그 축으로 짠다: 신선하면 안 부른다 / 지나면 부른다 /
 * 부르다 실패하면 낡은 값으로 버틴다 / **너무 낡으면 버티지 않는다**.
 * 마지막 항이 특히 중요하다 — 무한정 버티면 몇 달 지난 값을 오늘
 * 실거래가라고 부르게 된다.
 */

/** 메모리 위의 가짜 Redis. TTL은 흉내내지 않는다(테스트가 시계를 직접 민다). */
function fakeRedis(): RedisLike & { store: Map<string, unknown>; sets: number } {
  const store = new Map<string, unknown>();
  return {
    store,
    sets: 0,
    async get<T>(key: string) {
      return (store.get(key) as T) ?? null;
    },
    async set(this: { sets: number }, key: string, value: unknown) {
      store.set(key, value);
      this.sets++;
      return "OK";
    },
  };
}

describe("createResponseCache", () => {
  it("캐시가 비어 있으면 라이브를 부르고 그 값을 저장한다", async () => {
    const redis = fakeRedis();
    const now = vi.fn(() => 1_000_000);
    const cache = createResponseCache(redis, now);
    const live = vi.fn().mockResolvedValue({ units: ["a"] });

    const got = await cache.resolve("k", live);

    expect(live).toHaveBeenCalledTimes(1);
    expect(got).toEqual({ value: { units: ["a"] }, stale: false, fetchedAt: 1_000_000, revalidating: null });
    expect(redis.store.get("resp:k")).toEqual({ value: { units: ["a"] }, fetchedAt: 1_000_000 });
  });

  it("신선하면 라이브를 아예 부르지 않는다 — 국토부 호출도 그만큼 준다", async () => {
    const redis = fakeRedis();
    let t = 1_000_000;
    const cache = createResponseCache(redis, () => t);
    const live = vi.fn().mockResolvedValue("첫값");

    await cache.resolve("k", live);
    t += (FRESH_SECONDS - 1) * 1000; // 아직 신선 창 안
    const got = await cache.resolve("k", live);

    expect(live).toHaveBeenCalledTimes(1);
    expect(got).toEqual({ value: "첫값", stale: false, fetchedAt: 1_000_000, revalidating: null });
  });

  it("갱신 창까지 지나면 기다렸다가 새 값을 낸다", async () => {
    const redis = fakeRedis();
    let t = 1_000_000;
    const cache = createResponseCache(redis, () => t);
    const live = vi.fn().mockResolvedValueOnce("첫값").mockResolvedValueOnce("새값");

    await cache.resolve("k", live);
    t += (REVALIDATE_SECONDS + 1) * 1000;
    const got = await cache.resolve("k", live);

    expect(live).toHaveBeenCalledTimes(2);
    expect(got).toEqual({ value: "새값", stale: false, fetchedAt: t, revalidating: null });
  });

  /** 이 파일이 존재하는 이유. */
  it("라이브가 실패하면 낡은 값으로 버티고, 낡았다는 사실을 함께 낸다", async () => {
    const redis = fakeRedis();
    let t = 1_000_000;
    const cache = createResponseCache(redis, () => t);
    const live = vi
      .fn()
      .mockResolvedValueOnce("어제값")
      .mockRejectedValue(new Error("fetch failed"));

    await cache.resolve("k", live);
    t += (REVALIDATE_SECONDS + 1) * 1000;
    const got = await cache.resolve("k", live);

    expect(got.value).toBe("어제값");
    expect(got.stale).toBe(true);
    // 값을 **실제로 받은** 시각이지, 지금 시각이 아니다 — 화면이 이걸로
    // "○월 ○일에 받은 값"이라고 말한다.
    expect(got.fetchedAt).toBe(1_000_000);
  });

  it("허용 기간을 넘긴 값으로는 버티지 않는다 — 그대로 던진다", async () => {
    const redis = fakeRedis();
    let t = 1_000_000;
    const cache = createResponseCache(redis, () => t);
    const boom = new Error("fetch failed");
    const live = vi.fn().mockResolvedValueOnce("아주 오래된 값").mockRejectedValue(boom);

    await cache.resolve("k", live);
    t += (STALE_SECONDS + 1) * 1000;

    await expect(cache.resolve("k", live)).rejects.toBe(boom);
  });

  /*
   * ── 뒤에서 갱신하기 ────────────────────────────────────────────
   *
   * 신선 창이 지나는 순간마다 **누군가 한 명은** 국토부 조회를 온전히
   * 기다렸다(프로덕션 실측 7.2초). 아래가 그 기다림을 없앤다.
   */
  describe("갱신 창", () => {
    it("신선 창이 지나도 기다리지 않고 캐시 값을 즉시 낸다", async () => {
      const redis = fakeRedis();
      let t = 1_000_000;
      const cache = createResponseCache(redis, () => t);

      await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
      t += (FRESH_SECONDS + 1) * 1000;

      // 영원히 안 끝나는 라이브 — 그래도 이 요청은 즉시 끝나야 한다.
      const hung = vi.fn(() => new Promise(() => {}));
      const got = await cache.resolve("k", hung);

      expect(got.value).toBe("어제값");
      expect(got.fetchedAt).toBe(1_000_000);
      // 갱신은 떠 있다 — 부르긴 부른다.
      expect(hung).toHaveBeenCalledTimes(1);
      expect(got.revalidating).not.toBeNull();
    });

    /** 이 검사가 이 describe에서 가장 중요하다. */
    it("장애가 아니므로 낡음 표시를 붙이지 않는다", async () => {
      const redis = fakeRedis();
      let t = 1_000_000;
      const cache = createResponseCache(redis, () => t);

      await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
      t += (FRESH_SECONDS + 1) * 1000;
      const got = await cache.resolve("k", vi.fn(() => new Promise(() => {})));

      // `stale`은 화면에 "지금 국토교통부 서버가 응답하지 않아…"를 띄운다.
      // 여기는 정상적인 갱신 중이다 — 참으로 두면 멀쩡한 날에 장애를
      // 알리게 된다.
      expect(got.stale).toBe(false);
    });

    it("뒤에서 돈 갱신이 끝나면 다음 요청이 새 값을 받는다", async () => {
      const redis = fakeRedis();
      let t = 1_000_000;
      const cache = createResponseCache(redis, () => t);

      await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
      t += (FRESH_SECONDS + 1) * 1000;

      const got = await cache.resolve("k", vi.fn().mockResolvedValue("새값"));
      expect(got.value).toBe("어제값"); // 이 요청은 아직 옛 값으로 답했고…
      await got.revalidating; // 호출부가 응답을 보낸 뒤 기다린다

      // …다음 요청은 새 값을 받는다. 갱신 시각도 갈아 끼워졌다.
      const next = await cache.resolve("k", vi.fn());
      expect(next.value).toBe("새값");
      expect(next.fetchedAt).toBe(t);
      expect(next.revalidating).toBeNull(); // 이제 신선하니 갱신도 안 건다
    });

    it("갱신이 실패해도 이 요청은 멀쩡하고, 거부로 새어 나오지 않는다", async () => {
      const redis = fakeRedis();
      let t = 1_000_000;
      const cache = createResponseCache(redis, () => t);

      await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
      t += (FRESH_SECONDS + 1) * 1000;

      const got = await cache.resolve("k", vi.fn().mockRejectedValue(new Error("국토부 down")));
      expect(got.value).toBe("어제값");
      expect(got.stale).toBe(false);
      // 호출부는 이것을 그냥 await한다 — 던지면 응답을 보낸 **뒤** 핸들러가
      // 죽어 함수 오류로 잡힌다.
      await expect(got.revalidating).resolves.toBeUndefined();

      // 캐시는 옛 값 그대로다 — 실패한 갱신이 값을 망가뜨리지 않았다.
      expect((await cache.resolve("k", vi.fn(() => new Promise(() => {})))).value).toBe("어제값");
    });

    it("캐시 저장이 실패해도 갱신 프라미스는 조용히 끝난다", async () => {
      const redis: RedisLike = {
        get: (async () => ({ value: "어제값", fetchedAt: 0 })) as RedisLike["get"],
        async set() {
          throw new Error("redis down");
        },
      };
      const cache = createResponseCache(redis, () => (FRESH_SECONDS + 1) * 1000);
      const got = await cache.resolve("k", vi.fn().mockResolvedValue("새값"));
      await expect(got.revalidating).resolves.toBeUndefined();
    });
  });

  it("캐시가 아예 없는데 라이브가 실패하면 그 오류를 그대로 던진다 — 값을 지어내지 않는다", async () => {
    const cache = createResponseCache(fakeRedis(), () => 0);
    const boom = new Error("fetch failed");
    await expect(cache.resolve("k", vi.fn().mockRejectedValue(boom))).rejects.toBe(boom);
  });

  it("키가 다르면 서로 섞이지 않는다 — 지역·동마다 따로 버틴다", async () => {
    const redis = fakeRedis();
    let t = 1_000_000;
    const cache = createResponseCache(redis, () => t);

    await cache.resolve("강남", vi.fn().mockResolvedValue("강남값"));
    await cache.resolve("서초", vi.fn().mockResolvedValue("서초값"));
    t += (REVALIDATE_SECONDS + 1) * 1000;

    const failing = vi.fn().mockRejectedValue(new Error("fetch failed"));
    expect((await cache.resolve("강남", failing)).value).toBe("강남값");
    expect((await cache.resolve("서초", failing)).value).toBe("서초값");
  });

  /*
   * 캐시는 보조 장치다 — 저장소가 흔들려도 조회 자체는 살아야 한다
   * (`tradeCache`·`geocodeCache`와 같은 원칙).
   */
  it("캐시 읽기가 던져도 라이브로 넘어간다", async () => {
    const redis: RedisLike = {
      async get() {
        throw new Error("redis down");
      },
      async set() {
        return "OK";
      },
    };
    const cache = createResponseCache(redis, () => 0);
    expect((await cache.resolve("k", vi.fn().mockResolvedValue("값"))).value).toBe("값");
  });

  it("캐시 쓰기가 던져도 성공한 조회를 실패로 만들지 않는다", async () => {
    const redis: RedisLike = {
      async get() {
        return null;
      },
      async set() {
        throw new Error("redis down");
      },
    };
    const cache = createResponseCache(redis, () => 0);
    expect((await cache.resolve("k", vi.fn().mockResolvedValue("값"))).value).toBe("값");
  });

  /*
   * ── 버틸 값이 있으면 오래 기다리지 않는다 ─────────────────────────
   *
   * 이게 없으면 B에 큰 구멍이 남는다: 신선 창이 지난 첫 요청은 캐시에
   * 어제 값이 멀쩡히 있어도 업스트림 타임아웃(실측 50초)을 온전히
   * 기다린다. 아래 둘이 그 구멍을 막는다.
   */
  describe("라이브 대기 상한", () => {
    it("버틸 값이 있으면 상한만 기다리고 낡은 값으로 넘어간다", async () => {
      vi.useFakeTimers();
      try {
        const redis = fakeRedis();
        let t = 1_000_000;
        const cache = createResponseCache(redis, () => t);

        await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
        t += (REVALIDATE_SECONDS + 1) * 1000;

        // 영원히 안 끝나는 라이브 — 지금 국토부가 딱 이 모양이다.
        const hung = vi.fn(() => new Promise(() => {}));
        const pending = cache.resolve("k", hung);

        await vi.advanceTimersByTimeAsync(LIVE_TIMEOUT_SECONDS * 1000 + 10);
        const got = await pending;

        expect(got.value).toBe("어제값");
        expect(got.stale).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("상한 전에 라이브가 성공하면 그 값을 쓴다 — 멀쩡할 때는 아무것도 안 바뀐다", async () => {
      vi.useFakeTimers();
      try {
        const redis = fakeRedis();
        let t = 1_000_000;
        const cache = createResponseCache(redis, () => t);

        await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
        t += (REVALIDATE_SECONDS + 1) * 1000;

        const slowButOk = vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve("새값"), (LIVE_TIMEOUT_SECONDS - 2) * 1000),
            ),
        );
        const pending = cache.resolve("k", slowButOk);
        await vi.advanceTimersByTimeAsync((LIVE_TIMEOUT_SECONDS - 1) * 1000);

        const got = await pending;
        expect(got.value).toBe("새값");
        expect(got.stale).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    /*
     * 버틸 값이 없을 때 빨리 끊어 봐야 손에 남는 게 없다 — 느린 성공이
     * 빠른 실패보다 낫다. 상한을 걸지 않는다는 그 선택을 못박는다.
     */
    it("버틸 값이 없으면 상한을 걸지 않는다 — 느려도 기다린다", async () => {
      vi.useFakeTimers();
      try {
        const cache = createResponseCache(fakeRedis(), () => 0);
        const slow = vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve("느린값"), (LIVE_TIMEOUT_SECONDS + 20) * 1000),
            ),
        );
        const pending = cache.resolve("k", slow);
        await vi.advanceTimersByTimeAsync((LIVE_TIMEOUT_SECONDS + 21) * 1000);
        expect((await pending).value).toBe("느린값");
      } finally {
        vi.useRealTimers();
      }
    });

    it("상한에 진 조회가 뒤늦게 성공하면 다음 요청이 그 값을 받는다", async () => {
      vi.useFakeTimers();
      try {
        const redis = fakeRedis();
        let t = 1_000_000;
        const cache = createResponseCache(redis, () => t);

        await cache.resolve("k", vi.fn().mockResolvedValue("어제값"));
        t += (REVALIDATE_SECONDS + 1) * 1000;

        const late = vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve("뒤늦은값"), (LIVE_TIMEOUT_SECONDS + 5) * 1000),
            ),
        );
        const first = cache.resolve("k", late);
        await vi.advanceTimersByTimeAsync(LIVE_TIMEOUT_SECONDS * 1000 + 10);
        expect((await first).stale).toBe(true); // 이 요청은 낡은 값으로 답했다

        // 그 사이 라이브가 끝나 캐시에 들어간다
        await vi.advanceTimersByTimeAsync(10 * 1000);
        const second = await cache.resolve("k", vi.fn());
        expect(second.value).toBe("뒤늦은값");
        expect(second.stale).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("세 창의 순서가 뒤집혀 있지 않다(전제)", () => {
    // 순서가 어긋나면 중간 구간이 통째로 사라진다 — 예컨대 갱신 창이
    // 신선 창보다 짧으면 "뒤에서 갱신"이 한 번도 안 일어난다.
    expect(FRESH_SECONDS).toBeLessThan(REVALIDATE_SECONDS);
    expect(REVALIDATE_SECONDS).toBeLessThan(STALE_SECONDS);
  });
});

describe("createNoopResponseCache", () => {
  it("늘 라이브를 부르고, 실패하면 그대로 던진다 — 버틸 값이 없다", async () => {
    const cache = createNoopResponseCache();
    expect(await cache.resolve("k", vi.fn().mockResolvedValue("값"))).toEqual({
      value: "값",
      stale: false,
      fetchedAt: null,
      revalidating: null,
    });
    const boom = new Error("fetch failed");
    await expect(cache.resolve("k", vi.fn().mockRejectedValue(boom))).rejects.toBe(boom);
  });
});
