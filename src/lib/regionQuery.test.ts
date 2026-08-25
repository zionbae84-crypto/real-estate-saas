import { describe, expect, it, vi } from "vitest";
import { fetchRegionComplexes } from "./regionQuery";

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
