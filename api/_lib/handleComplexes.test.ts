import { describe, expect, it, vi } from "vitest";
import { handleComplexesRequest } from "./handleComplexes";
import type { EmittedComplexUnit } from "../../scripts/pipeline/emit";
import { createNoopResponseCache, createResponseCache, type RedisLike } from "./responseCache";

const UNIT: EmittedComplexUnit = {
  complexKey: "11680-1",
  complexName: "테스트",
  regionCode: "11680",
  legalDongName: "역삼동",
  builtYear: 2010,
  areaBucket: 84,
  maxExclusiveAreaSqm: 84.9,
  landLeasehold: "N",
  tradeCount: 1,
  minPrice: 1_000_000_000,
  maxPrice: 1_000_000_000,
  minFloor: 5,
  maxFloor: 5,
  unknownFloorCount: 0,
  address: null,
  householdCount: null,
  trades: [],
  lowConfidence: true,
};

const REGIONS = { regulated: ["11680"] };

describe("handleComplexesRequest", () => {
  it("regionCode가 없으면 400을 반환한다", async () => {
    const result = await handleComplexesRequest(
      { regionCode: null, dong: null },
      { fetchLive: vi.fn(), key: "dummy", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect(result.status).toBe(400);
  });

  it("regionCode가 5자리 숫자가 아니면 400을 반환한다", async () => {
    const result = await handleComplexesRequest(
      { regionCode: "abc", dong: null },
      { fetchLive: vi.fn(), key: "dummy", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect(result.status).toBe(400);
  });

  it("성공하면 200과 units·isRegulatedArea(regulated 목록)를 반환한다", async () => {
    const fetchLive = vi.fn().mockResolvedValue({ units: [UNIT], dataAsOf: "2026-01" });
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      units: [UNIT],
      isRegulatedArea: true,
      dataAsOf: "2026-01",
    });
  });

  /**
   * 화면은 이 값으로만 "언제 계약분까지 반영했는지"를 말할 수 있다.
   * 거래가 0건이면 `null`이 그대로 나가야 한다 — 여기서 오늘 날짜 같은
   * 것으로 메우면, 화면이 확인한 적 없는 신선도를 사실처럼 말하게 된다.
   */
  it("dataAsOf가 null이면 null 그대로 내보낸다 — 서버가 날짜를 메우지 않는다", async () => {
    const fetchLive = vi.fn().mockResolvedValue({ units: [], dataAsOf: null });
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect((result.body as { dataAsOf: unknown }).dataAsOf).toBeNull();
  });

  it("regulated 목록에 없으면 isRegulatedArea: false를 반환한다 — 목록에 없는 지역은 비규제로 본다", async () => {
    const fetchLive = vi.fn().mockResolvedValue({ units: [], dataAsOf: null });
    const result = await handleComplexesRequest(
      { regionCode: "99999", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect((result.body as { isRegulatedArea: unknown }).isRegulatedArea).toBe(false);
  });

  it("국토부 조회가 실패하면 502와 에러 메시지를 반환한다 — 200+빈배열이 아니다", async () => {
    const fetchLive = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect(result.status).toBe(502);
    expect(result.status).not.toBe(200);
  });

  it("에러 메시지에 키가 노출되면 redact한다", async () => {
    const fetchLive = vi.fn().mockRejectedValue(new Error("HTTP 403: key=secret-key-value"));
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "secret-key-value", regions: REGIONS, cache: createNoopResponseCache() },
    );
    expect(JSON.stringify(result.body)).not.toContain("secret-key-value");
  });
  /*
   * ══════════════════════════════════════════════════════════════
   * 국토부가 멈췄을 때 — 낡은 값으로 버티되, 낡았다고 말한다
   * ══════════════════════════════════════════════════════════════
   *
   * 2026-09-06에 `apis.data.go.kr`이 하루 종일 응답하지 않아 이 엔드포인트가
   * 50초 뒤 502만 내던 사고가 이 동작의 출발점이다
   * (`responseCache.ts` 머리주석).
   */
  describe("응답 캐시로 버티기", () => {
    /** 시계를 직접 미는 메모리 Redis */
    function fakeRedis(): RedisLike {
      const store = new Map<string, unknown>();
      return {
        async get<T>(key: string) {
          return (store.get(key) as T) ?? null;
        },
        async set(key: string, value: unknown) {
          store.set(key, value);
          return "OK";
        },
      };
    }

    it("라이브가 실패해도 마지막 성공값을 200으로 내고, stale·cachedAt을 함께 싣는다", async () => {
      let t = Date.parse("2026-09-05T04:00:00.000Z");
      const cache = createResponseCache(fakeRedis(), () => t);
      const fetchLive = vi
        .fn()
        .mockResolvedValueOnce({ units: [UNIT], dataAsOf: "2026-07" })
        .mockRejectedValue(new Error("fetch failed"));

      // 1회차: 정상 조회 — 캐시가 채워진다
      const first = await handleComplexesRequest(
        { regionCode: "11680", dong: null },
        { fetchLive, key: "dummy", regions: REGIONS, cache },
      );
      expect(first.status).toBe(200);
      // 신선할 때는 두 필드를 아예 싣지 않는다.
      expect(first.body).not.toHaveProperty("stale");
      expect(first.body).not.toHaveProperty("cachedAt");

      // 하루 뒤, 국토부가 죽은 상태로 다시 조회
      t += 24 * 60 * 60 * 1000;
      const second = await handleComplexesRequest(
        { regionCode: "11680", dong: null },
        { fetchLive, key: "dummy", regions: REGIONS, cache },
      );

      expect(second.status).toBe(200);
      const body = second.body as { units: unknown[]; stale?: unknown; cachedAt?: unknown };
      expect(body.units).toEqual([UNIT]);
      expect(body.stale).toBe(true);
      // **값을 실제로 받은 시각**이지 지금 시각이 아니다 — 화면이 이걸로
      // "○월 ○일에 받은 값"이라고 말한다.
      expect(body.cachedAt).toBe("2026-09-05T04:00:00.000Z");
    });

    it("버틸 값이 없으면 지금까지처럼 502다 — 빈 목록을 지어내지 않는다", async () => {
      const cache = createResponseCache(fakeRedis(), () => 0);
      const fetchLive = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const result = await handleComplexesRequest(
        { regionCode: "11680", dong: null },
        { fetchLive, key: "dummy", regions: REGIONS, cache },
      );

      expect(result.status).toBe(502);
      expect(result.body).not.toHaveProperty("units");
    });

    it("지역이 다르면 남의 캐시로 버티지 않는다", async () => {
      let t = 1_000_000;
      const cache = createResponseCache(fakeRedis(), () => t);
      const ok = vi.fn().mockResolvedValue({ units: [UNIT], dataAsOf: "2026-07" });
      await handleComplexesRequest(
        { regionCode: "11680", dong: null },
        { fetchLive: ok, key: "dummy", regions: REGIONS, cache },
      );

      t += 24 * 60 * 60 * 1000;
      const failing = vi.fn().mockRejectedValue(new Error("fetch failed"));
      const other = await handleComplexesRequest(
        { regionCode: "11650", dong: null },
        { fetchLive: failing, key: "dummy", regions: REGIONS, cache },
      );

      expect(other.status).toBe(502);
    });

    // 변이 검사: 캐시를 안 끼우면(no-op) 예전처럼 그냥 502다 — 위 검사들이
    // "원래 그랬다"로 공허하게 통과하지 않는다는 확인.
    it("캐시가 no-op이면 버티지 못한다(변이 검사)", async () => {
      const fetchLive = vi
        .fn()
        .mockResolvedValueOnce({ units: [UNIT], dataAsOf: "2026-07" })
        .mockRejectedValue(new Error("fetch failed"));
      const deps = {
        fetchLive,
        key: "dummy",
        regions: REGIONS,
        cache: createNoopResponseCache(),
      };
      await handleComplexesRequest({ regionCode: "11680", dong: null }, deps);
      const second = await handleComplexesRequest({ regionCode: "11680", dong: null }, deps);
      expect(second.status).toBe(502);
    });
  });

});
