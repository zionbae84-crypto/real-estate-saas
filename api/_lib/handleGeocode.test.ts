import { describe, expect, it, vi } from "vitest";
import { handleGeocodeRequest } from "./handleGeocode";

describe("handleGeocodeRequest", () => {
  it("regionCode가 없으면 400을 반환한다", async () => {
    const result = await handleGeocodeRequest(
      { regionCode: null, dong: null },
      { fetchAddresses: vi.fn(), cache: { get: vi.fn(), set: vi.fn() }, geocode: vi.fn(), key: "id", secret: "s" },
    );
    expect(result.status).toBe(400);
  });

  it("찾은 단지만 결과에 담고, 캐시 미스만 지오코딩을 부른다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(
      new Map([
        ["11680-1", "서울특별시 강남구 역삼동 719-3"], // 캐시 히트
        ["11680-2", "서울특별시 강남구 역삼동 800-1"], // 캐시 미스, 지오코딩 성공
        ["11680-3", "서울특별시 강남구 역삼동 900-1"], // 캐시 미스, 지오코딩 실패(못 찾음)
      ]),
    );
    const cache = {
      get: vi.fn(async (address: string) =>
        address === "서울특별시 강남구 역삼동 719-3" ? { lat: 1, lon: 1 } : null,
      ),
      set: vi.fn(async () => {}),
    };
    const geocode = vi.fn(async (address: string) =>
      address === "서울특별시 강남구 역삼동 800-1" ? { lat: 2, lon: 2 } : null,
    );

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, key: "id", secret: "s" },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      units: [
        { complexKey: "11680-1", lat: 1, lon: 1 },
        { complexKey: "11680-2", lat: 2, lon: 2 },
      ],
    });
    // 캐시 히트였던 첫 단지는 지오코딩을 부르지 않았다.
    expect(geocode).toHaveBeenCalledTimes(2);
    // 새로 구한 좌표만 캐시에 저장했다.
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith("서울특별시 강남구 역삼동 800-1", { lat: 2, lon: 2 });
  });

  it("응답에 주소가 실리지 않는다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(new Map([["11680-1", "서울특별시 강남구 역삼동 719-3"]]));
    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
        geocode: vi.fn().mockResolvedValue({ lat: 1, lon: 1 }),
        key: "id",
        secret: "s",
      },
    );
    expect(JSON.stringify(result.body)).not.toContain("강남구");
  });

  it("주소 조회 자체가 실패하면 502를 반환하고 시크릿을 가린다", async () => {
    const fetchAddresses = vi.fn().mockRejectedValue(new Error("HTTP 500: key=s"));
    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache: { get: vi.fn(), set: vi.fn() }, geocode: vi.fn(), key: "id", secret: "s" },
    );
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain("s");
  });
});
