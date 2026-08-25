import { describe, expect, it, vi } from "vitest";
import { handleGeocodeRequest } from "./handleGeocode";

describe("handleGeocodeRequest", () => {
  it("regionCode가 없으면 400을 반환한다", async () => {
    const result = await handleGeocodeRequest(
      { regionCode: null, dong: null },
      { fetchAddresses: vi.fn(), cache: { get: vi.fn(), set: vi.fn() }, geocode: vi.fn(), dataKey: "molit-key", key: "id", secret: "s" },
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
      { fetchAddresses, cache, geocode, dataKey: "molit-key", key: "id", secret: "s" },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      units: [
        { complexKey: "11680-1", lat: 1, lon: 1 },
        { complexKey: "11680-2", lat: 2, lon: 2 },
      ],
      // 세 번째 주소는 지오코딩이 null을 돌려줬을 뿐 던지지 않았다 —
      // "확인했더니 없다"이지 "확인 못 했다"가 아니므로 실패로 세지 않는다.
      partialFailureCount: 0,
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
        dataKey: "molit-key",
        key: "id",
        secret: "s",
      },
    );
    expect(JSON.stringify(result.body)).not.toContain("강남구");
  });

  it("주소 조회가 실패하면 502를 반환하고, 그 메시지에 실린 국토부 키를 가린다", async () => {
    // 이 경로에서 **실제로** 새는 것은 국토부 키다 — fetchAddresses가 부르는
    // scripts/pipeline/fetch.ts가 키를 쿼리 파라미터에 담아 요청하므로 그
    // URL이 네트워크 오류 메시지에 그대로 실려 온다. 예전 이 테스트는
    // 네이버 시크릿("s")만 확인했는데, 그 값은 한 글자라 어떤 메시지에도
    // 우연히 들어 있지 않아 사실상 아무것도 검증하지 못했다.
    const MOLIT_KEY = "aBcD1234%2FmolitServiceKey";
    const fetchAddresses = vi
      .fn()
      .mockRejectedValue(
        new Error(`fetch failed: https://apis.data.go.kr/...?serviceKey=${MOLIT_KEY}&LAWD_CD=11680`),
      );

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: { get: vi.fn(), set: vi.fn() },
        geocode: vi.fn(),
        dataKey: MOLIT_KEY,
        key: "naver-client-id",
        secret: "naver-client-secret",
      },
    );

    expect(result.status).toBe(502);
    const body = JSON.stringify(result.body);
    expect(body).not.toContain(MOLIT_KEY);
    expect(body).not.toContain("molitServiceKey");
    // 가렸다는 사실만 남고 나머지 맥락은 그대로 남아야 한다.
    expect(body).toContain("LAWD_CD=11680");
  });

  it("네이버 자격증명도 함께 가린다 — 지금은 안 새지만 경로가 바뀌어도 남아 있게", async () => {
    const fetchAddresses = vi
      .fn()
      .mockRejectedValue(new Error("naver-client-secret이 메시지에 섞였다"));
    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: { get: vi.fn(), set: vi.fn() },
        geocode: vi.fn(),
        dataKey: "molit-key",
        key: "naver-client-id",
        secret: "naver-client-secret",
      },
    );
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain("naver-client-secret");
  });

  it("캐시 미스가 여러 개면 한 건씩이 아니라 동시에 지오코딩한다", async () => {
    // 순차로 돌면 캐시가 빈 큰 시군구(단지 수백 개)에서 Vercel 함수의
    // 실행 시간 상한에 걸린다. "동시에 최소 두 건이 떠 있었는가"를
    // 실제로 세어 확인한다 — 호출 횟수만 세면 순차든 병렬이든 같다.
    const addresses = new Map(
      Array.from({ length: 20 }, (_, i) => [`11680-${i}`, `주소 ${i}`] as const),
    );
    const fetchAddresses = vi.fn().mockResolvedValue(addresses);

    let inFlight = 0;
    let maxInFlight = 0;
    const geocode = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { lat: 1, lon: 1 };
    });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn(async () => {}) },
        geocode,
        dataKey: "molit-key",
        key: "id",
        secret: "s",
      },
    );

    expect(result.status).toBe(200);
    expect(geocode).toHaveBeenCalledTimes(20);
    expect(maxInFlight).toBeGreaterThan(1);
    // 무제한 병렬은 아니다 — 네이버 rate limit에 걸리면 대량 실패가
    // 조용히 "좌표 없는 단지"로 둔갑한다.
    expect(maxInFlight).toBeLessThanOrEqual(10);
    // 순서는 주소 Map 순서 그대로여야 한다(병렬이라고 뒤섞이면 안 된다).
    expect((result.body as { units: { complexKey: string }[] }).units.map((u) => u.complexKey)).toEqual(
      [...addresses.keys()],
    );
  });

  it("병렬로 돌아도 한 주소의 지오코딩 실패가 같은 묶음의 나머지를 무너뜨리지 않는다", async () => {
    const addresses = new Map(
      Array.from({ length: 6 }, (_, i) => [`11680-${i}`, `주소 ${i}`] as const),
    );
    const fetchAddresses = vi.fn().mockResolvedValue(addresses);
    const geocode = vi.fn(async (address: string) => {
      if (address === "주소 2") throw new Error("지오코딩 실패");
      return { lat: 1, lon: 1 };
    });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn(async () => {}) },
        geocode,
        dataKey: "molit-key",
        key: "id",
        secret: "s",
      },
    );

    expect(result.status).toBe(200);
    const body = result.body as { units: { complexKey: string }[]; partialFailureCount: number };
    const keys = body.units.map((u) => u.complexKey);
    expect(keys).toEqual(["11680-0", "11680-1", "11680-3", "11680-4", "11680-5"]);
    // 던져서 뺀 한 건이 partialFailureCount에 잡힌다.
    expect(body.partialFailureCount).toBe(1);
  });

  it("일부는 던지고 일부는 정말 못 찾은 경우, units엔 성공만 남고 partialFailureCount엔 던진 것만 센다", async () => {
    // N=6개 주소: 3개는 정상 지오코딩, 2개는 geocode가 던짐(429/네트워크
    // 오류 등을 흉내), 1개는 geocode가 null을 정상적으로 돌려줌(주소가
    // 진짜로 없음). units엔 성공한 3개만 남아야 하고, partialFailureCount는
    // 던진 2개만 세야 한다 — null을 돌려준 1개는 세면 안 된다(그건
    // "확인했더니 없다"이지 "확인 못 했다"가 아니다).
    const addresses = new Map(
      Array.from({ length: 6 }, (_, i) => [`11680-${i}`, `주소 ${i}`] as const),
    );
    const fetchAddresses = vi.fn().mockResolvedValue(addresses);
    const geocode = vi.fn(async (address: string) => {
      if (address === "주소 1" || address === "주소 4") {
        throw new Error("429 Too Many Requests");
      }
      if (address === "주소 5") return null; // 진짜로 못 찾음
      return { lat: 1, lon: 1 };
    });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn(async () => {}) },
        geocode,
        dataKey: "molit-key",
        key: "id",
        secret: "s",
      },
    );

    expect(result.status).toBe(200);
    const body = result.body as {
      units: { complexKey: string }[];
      partialFailureCount: number;
    };
    expect(body.units.map((u) => u.complexKey)).toEqual([
      "11680-0",
      "11680-2",
      "11680-3",
    ]);
    expect(body.partialFailureCount).toBe(2);
  });

  it("캐시 조회가 실패해도 캐시 미스처럼 지오코딩으로 넘어가 결과를 담는다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(new Map([["11680-1", "서울특별시 강남구 역삼동 719-3"]]));
    const cache = {
      get: vi.fn().mockRejectedValue(new Error("Redis 연결 실패")),
      set: vi.fn(async () => {}),
    };
    const geocode = vi.fn().mockResolvedValue({ lat: 1, lon: 1 });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, dataKey: "molit-key", key: "id", secret: "s" },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ units: [{ complexKey: "11680-1", lat: 1, lon: 1 }], partialFailureCount: 0 });
    expect(geocode).toHaveBeenCalledWith("서울특별시 강남구 역삼동 719-3");
  });

  it("캐시 저장이 실패해도 이미 구한 좌표는 결과에 남는다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(new Map([["11680-1", "서울특별시 강남구 역삼동 719-3"]]));
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error("Redis 쓰기 실패")),
    };
    const geocode = vi.fn().mockResolvedValue({ lat: 1, lon: 1 });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, dataKey: "molit-key", key: "id", secret: "s" },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ units: [{ complexKey: "11680-1", lat: 1, lon: 1 }], partialFailureCount: 0 });
  });
});
