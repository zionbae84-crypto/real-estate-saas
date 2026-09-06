import { describe, expect, it, vi } from "vitest";
import { fetchComplexCoordinates, fetchRegionComplexes } from "./regionQuery";

describe("fetchRegionComplexes", () => {
  it("성공하면 units와 isRegulatedArea를 반환한다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          units: [
            {
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
              lowConfidence: true,
            },
          ],
          isRegulatedArea: true,
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await fetchRegionComplexes("11680", null);
    expect(result.units).toHaveLength(1);
    expect(result.isRegulatedArea).toBe(true);
  });

  it("dataAsOf(YYYY-MM)를 함께 읽는다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ units: [], isRegulatedArea: null, dataAsOf: "2026-01", cachedAt: null }),
        { status: 200 },
      ),
    ) as typeof fetch;

    expect((await fetchRegionComplexes("11680", null)).dataAsOf).toBe("2026-01");
  });

  /**
   * 화면은 이 값을 "{dataAsOf} 계약분까지 반영했어요"라는 사실 서술로
   * 그린다. 형식이 아닌 값(옛 배포판이라 필드가 아예 없는 경우 포함)을
   * 그대로 흘려보내면 그 문장이 근거 없는 주장이 된다 — null로 좁혀
   * 화면이 그 줄을 쓰지 않게 한다.
   */
  it("dataAsOf가 없거나 YYYY-MM 형식이 아니면 null로 좁힌다", async () => {
    for (const bad of [undefined, null, "2026", "어제", 202601, {}]) {
      globalThis.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({ units: [], isRegulatedArea: null, dataAsOf: bad }),
          { status: 200 },
        ),
      ) as typeof fetch;

      expect(
        (await fetchRegionComplexes("11680", null)).dataAsOf,
        `dataAsOf: ${JSON.stringify(bad)}`,
      ).toBeNull();
    }
  });

  it("HTTP 실패면 던진다 — 빈 배열을 반환하지 않는다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "국토부 API 오류" }), { status: 502 }),
    ) as typeof fetch;

    await expect(fetchRegionComplexes("11680", null)).rejects.toThrow("국토부 API 오류");
  });

  it("예상 못한 landLeasehold 값은 null로 좁힌다 — 'N'으로 접지 않는다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          units: [
            {
              complexKey: "11680-1",
              complexName: "테스트",
              regionCode: "11680",
              legalDongName: "역삼동",
              builtYear: 2010,
              areaBucket: 84,
              maxExclusiveAreaSqm: 84.9,
              landLeasehold: "Z",
              tradeCount: 1,
              minPrice: 1_000_000_000,
              maxPrice: 1_000_000_000,
              minFloor: 5,
              maxFloor: 5,
              unknownFloorCount: 0,
              lowConfidence: true,
            },
          ],
          isRegulatedArea: true,
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await fetchRegionComplexes("11680", null);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]?.landLeasehold).toBeNull();
  });

  it("regionCode·dong을 쿼리 파라미터로 보낸다", async () => {
    let requestedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      requestedUrl = url.toString();
      return new Response(JSON.stringify({ units: [], isRegulatedArea: null }), { status: 200 });
    }) as typeof fetch;

    await fetchRegionComplexes("11680", "역삼동");
    expect(requestedUrl).toBe("/api/complexes?regionCode=11680&dong=%EC%97%AD%EC%82%BC%EB%8F%99");
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 낡은 값 표시 — 서버가 말할 때만 화면이 말한다
 * ══════════════════════════════════════════════════════════════════
 *
 * 국토부가 멈추면 서버가 마지막 성공값을 200으로 내면서 `stale`·`cachedAt`
 * 을 함께 싣는다(`api/_lib/responseCache.ts`). 이 파싱이 어긋나면 둘 중
 * 하나가 된다 — 낡은 값을 오늘 값처럼 보여주거나(위험), 멀쩡한 조회에
 * 근거 없는 경고를 다는 것(거짓 경보). 둘 다 막는다.
 */
describe("fetchRegionComplexes — 낡은 값 표시", () => {
  function respond(body: Record<string, unknown>) {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ units: [], isRegulatedArea: null, ...body }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
  }

  it("stale과 cachedAt이 함께 오면 Date로 넘긴다", async () => {
    respond({ dataAsOf: "2026-07", stale: true, cachedAt: "2026-09-05T04:00:00.000Z" });
    const result = await fetchRegionComplexes("11680", null);
    expect(result.cachedAt).toEqual(new Date("2026-09-05T04:00:00.000Z"));
  });

  it("평소 응답(두 필드 없음)에는 null이다 — 없는 경고를 만들지 않는다", async () => {
    respond({ dataAsOf: "2026-07" });
    expect((await fetchRegionComplexes("11680", null)).cachedAt).toBeNull();
  });

  it("stale이 true가 아니면 cachedAt이 있어도 무시한다", async () => {
    respond({ dataAsOf: "2026-07", stale: false, cachedAt: "2026-09-05T04:00:00.000Z" });
    expect((await fetchRegionComplexes("11680", null)).cachedAt).toBeNull();

    // 옛 배포판이 다른 뜻으로 쓰던 값이 "낡았다"로 읽히지 않게 한다.
    respond({ dataAsOf: "2026-07", stale: "true", cachedAt: "2026-09-05T04:00:00.000Z" });
    expect((await fetchRegionComplexes("11680", null)).cachedAt).toBeNull();
  });

  it("날짜가 파싱되지 않으면 null이다 — 화면에 'Invalid Date'가 뜨지 않게", async () => {
    respond({ dataAsOf: "2026-07", stale: true, cachedAt: "어제쯤" });
    expect((await fetchRegionComplexes("11680", null)).cachedAt).toBeNull();
  });
});

describe("fetchComplexCoordinates", () => {
  it("성공하면 좌표 목록과 partialFailureCount를 반환한다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }],
          partialFailureCount: 0,
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await fetchComplexCoordinates("11680", null);
    expect(result).toEqual({
      units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }],
      partialFailureCount: 0,
    });
  });

  it("일부 지오코딩이 실패했으면 partialFailureCount에 그 수를 담아 반환한다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }],
          partialFailureCount: 3,
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await fetchComplexCoordinates("11680", null);
    expect(result.partialFailureCount).toBe(3);
  });

  it("옛 배포판처럼 partialFailureCount 필드가 없으면 0으로 본다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }] }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await fetchComplexCoordinates("11680", null);
    expect(result.partialFailureCount).toBe(0);
  });

  it("HTTP 실패면 던진다", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "실패" }), { status: 502 }),
    ) as typeof fetch;

    await expect(fetchComplexCoordinates("11680", null)).rejects.toThrow("실패");
  });

  it("/api/geocode로 요청한다", async () => {
    let requestedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      requestedUrl = url.toString();
      return new Response(JSON.stringify({ units: [], partialFailureCount: 0 }), { status: 200 });
    }) as typeof fetch;

    await fetchComplexCoordinates("11680", null);
    expect(requestedUrl).toBe("/api/geocode?regionCode=11680");
  });
});
