import { describe, expect, it, vi } from "vitest";
import { GEOCODE_CONCURRENCY, handleGeocodeRequest } from "./handleGeocode";
import { createNoopResponseCache } from "./responseCache";

/**
 * 전부 미스인 캐시. `getMany`는 물어본 주소 수만큼 `null`을 돌려준다 —
 * 길이가 어긋나면 핸들러가 자리를 잘못 맞추게 되므로, 가짜도 진짜와
 * 같은 약속(입력 순서·입력 길이)을 지킨다.
 */
function emptyCache() {
  return {
    getMany: vi.fn(async (addresses: readonly string[]) => addresses.map(() => null)),
    setMany: vi.fn(async () => {}),
  };
}

describe("handleGeocodeRequest", () => {
  it("regionCode가 없으면 400을 반환한다", async () => {
    const result = await handleGeocodeRequest(
      { regionCode: null, dong: null },
      { fetchAddresses: vi.fn(), cache: { getMany: vi.fn(), setMany: vi.fn() }, geocode: vi.fn(), responseCache: createNoopResponseCache(), dataKey: "molit-key", key: "id", secret: "s" },
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
      getMany: vi.fn(async (addresses: readonly string[]) =>
        addresses.map((address) =>
          address === "서울특별시 강남구 역삼동 719-3" ? { lat: 1, lon: 1 } : null,
        ),
      ),
      setMany: vi.fn(async () => {}),
    };
    const geocode = vi.fn(async (address: string) =>
      address === "서울특별시 강남구 역삼동 800-1" ? { lat: 2, lon: 2 } : null,
    );

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, responseCache: createNoopResponseCache(), dataKey: "molit-key", key: "id", secret: "s" },
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
    // 주소가 셋이어도 캐시 조회는 **한 번**이다 — 주소마다 왕복하면
    // 시군구 하나에 수백 번이 된다(이 최적화가 없애려던 것이 그것이다).
    expect(cache.getMany).toHaveBeenCalledTimes(1);
    expect(cache.getMany).toHaveBeenCalledWith([
      "서울특별시 강남구 역삼동 719-3",
      "서울특별시 강남구 역삼동 800-1",
      "서울특별시 강남구 역삼동 900-1",
    ]);
    // 새로 구한 좌표만, 역시 한 번에 저장했다.
    expect(cache.setMany).toHaveBeenCalledTimes(1);
    expect(cache.setMany).toHaveBeenCalledWith([
      ["서울특별시 강남구 역삼동 800-1", { lat: 2, lon: 2 }],
    ]);
  });

  it("응답에 주소가 실리지 않는다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(new Map([["11680-1", "서울특별시 강남구 역삼동 719-3"]]));
    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses,
        cache: emptyCache(),
        geocode: vi.fn().mockResolvedValue({ lat: 1, lon: 1 }),
        responseCache: createNoopResponseCache(),
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
        cache: { getMany: vi.fn(), setMany: vi.fn() },
        geocode: vi.fn(),
        responseCache: createNoopResponseCache(),
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
        cache: { getMany: vi.fn(), setMany: vi.fn() },
        geocode: vi.fn(),
        responseCache: createNoopResponseCache(),
        dataKey: "molit-key",
        key: "naver-client-id",
        secret: "naver-client-secret",
      },
    );
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain("naver-client-secret");
  });

  it("캐시 미스가 여러 개면 한 건씩이 아니라 동시에 지오코딩하되, 상한을 지킨다", async () => {
    // 순차로 돌면 캐시가 빈 큰 시군구(단지 수백 개)에서 Vercel 함수의
    // 실행 시간 상한에 걸린다. "동시에 최소 두 건이 떠 있었는가"를
    // 실제로 세어 확인한다 — 호출 횟수만 세면 순차든 병렬이든 같다.
    //
    // **주소 수는 상한보다 많아야 한다.** 적으면 전부 한 번에 떠 버려
    // "상한을 지킨다"는 아래 단언이 공허하게 통과한다 — 상한이 얼마든
    // 그보다 적은 요청은 늘 상한 안에 들어오기 때문이다.
    const total = GEOCODE_CONCURRENCY * 2 + 5;
    const addresses = new Map(
      Array.from({ length: total }, (_, i) => [`11680-${i}`, `주소 ${i}`] as const),
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
        cache: emptyCache(),
        geocode,
        responseCache: createNoopResponseCache(),
        dataKey: "molit-key",
        key: "id",
        secret: "s",
      },
    );

    expect(result.status).toBe(200);
    expect(geocode).toHaveBeenCalledTimes(total);
    expect(maxInFlight).toBeGreaterThan(1);
    // 무제한 병렬은 아니다 — 네이버 rate limit에 걸리면 대량 실패가
    // 조용히 "좌표 없는 단지"로 둔갑한다.
    //
    // **상수를 그대로 본다.** 예전에는 여기에 `10`이 적혀 있었는데,
    // 그러면 같은 숫자가 두 곳에 살아 상수를 옮길 때마다 이 검사도
    // 손으로 고쳐야 했다(실제로 8 → 32로 올릴 때 이 줄이 먼저
    // 깨졌다). 이 검사가 지켜야 하는 것은 특정 숫자가 아니라 "상한이
    // 있고 그것이 지켜진다"는 성질이다.
    expect(maxInFlight).toBeLessThanOrEqual(GEOCODE_CONCURRENCY);
    // 위 단언이 공허하지 않았음을 못박는다 — 상한을 실제로 눌러 봤다.
    expect(total).toBeGreaterThan(GEOCODE_CONCURRENCY);
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
        cache: emptyCache(),
        geocode,
        responseCache: createNoopResponseCache(),
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
        cache: emptyCache(),
        geocode,
        responseCache: createNoopResponseCache(),
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

  it("같은 주소를 쓰는 단지가 여럿이어도 조회는 한 번, 좌표는 단지마다 준다", async () => {
    // 한 주소에 단지가 둘 이상 붙는 일은 흔하다(같은 지번의 여러 동).
    // 예전에는 같은 묶음에 든 중복 주소를 각각 지오코딩했다 — 네이버를
    // 공짜로 두 번 부르고, 답은 똑같았다.
    const fetchAddresses = vi.fn().mockResolvedValue(
      new Map([
        ["11680-1", "서울특별시 강남구 역삼동 719-3"],
        ["11680-2", "서울특별시 강남구 역삼동 719-3"], // 같은 주소
        ["11680-3", "서울특별시 강남구 역삼동 800-1"],
      ]),
    );
    const cache = emptyCache();
    const geocode = vi.fn(async () => ({ lat: 1, lon: 1 }));

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, responseCache: createNoopResponseCache(), dataKey: "molit-key", key: "id", secret: "s" },
    );

    // 조회는 주소 단위로 한 번씩이지만…
    expect(cache.getMany).toHaveBeenCalledWith([
      "서울특별시 강남구 역삼동 719-3",
      "서울특별시 강남구 역삼동 800-1",
    ]);
    expect(geocode).toHaveBeenCalledTimes(2);
    // …답은 단지 단위로, 하나도 빠짐없이 나간다.
    expect(result.body).toEqual({
      units: [
        { complexKey: "11680-1", lat: 1, lon: 1 },
        { complexKey: "11680-2", lat: 1, lon: 1 },
        { complexKey: "11680-3", lat: 1, lon: 1 },
      ],
      partialFailureCount: 0,
    });
  });

  it("지오코딩이 다 끝나기 전에도 그때까지 구한 좌표를 캐시로 흘려보낸다", async () => {
    // 전부 끝난 뒤 한 번만 저장하면, 함수가 실행 시간 상한에 걸렸을 때
    // 그때까지 구한 좌표가 통째로 날아간다 — 다음 요청도 처음부터 다시
    // 하다 같은 상한에 걸려 영영 앞으로 나아가지 못한다. 묶음 단위로
    // 흘려보내면 재시도가 매번 조금씩 전진한다.
    const total = GEOCODE_CONCURRENCY * 3;
    const addresses = new Map(
      Array.from({ length: total }, (_, i) => [`11680-${i}`, `주소 ${i}`] as const),
    );
    let geocoded = 0;
    const geocode = vi.fn(async () => {
      geocoded += 1;
      return { lat: 1, lon: 1 };
    });
    // 저장이 시작된 시점에 몇 건이나 지오코딩됐는지를 적어 둔다.
    const geocodedAtSave: number[] = [];
    const cache = {
      getMany: vi.fn(async (a: readonly string[]) => a.map(() => null)),
      setMany: vi.fn(async () => {
        geocodedAtSave.push(geocoded);
      }),
    };

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      {
        fetchAddresses: vi.fn().mockResolvedValue(addresses),
        cache,
        geocode,
        responseCache: createNoopResponseCache(),
        dataKey: "molit-key",
        key: "id",
        secret: "s",
      },
    );

    expect(result.status).toBe(200);
    // 마지막 주소까지 다 구하기 전에 이미 저장이 일어났다.
    expect(Math.min(...geocodedAtSave)).toBeLessThan(total);
    // 그렇다고 주소마다 저장하지도 않는다 — 그게 이 최적화가 없앤 것이다.
    expect(cache.setMany.mock.calls.length).toBeLessThan(total);
    expect(geocodedAtSave.length).toBeGreaterThan(1);
  });

  it("캐시 조회가 실패해도 캐시 미스처럼 지오코딩으로 넘어가 결과를 담는다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(new Map([["11680-1", "서울특별시 강남구 역삼동 719-3"]]));
    const cache = {
      getMany: vi.fn().mockRejectedValue(new Error("Redis 연결 실패")),
      setMany: vi.fn(async () => {}),
    };
    const geocode = vi.fn().mockResolvedValue({ lat: 1, lon: 1 });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, responseCache: createNoopResponseCache(), dataKey: "molit-key", key: "id", secret: "s" },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ units: [{ complexKey: "11680-1", lat: 1, lon: 1 }], partialFailureCount: 0 });
    expect(geocode).toHaveBeenCalledWith("서울특별시 강남구 역삼동 719-3");
  });

  it("캐시 저장이 실패해도 이미 구한 좌표는 결과에 남는다", async () => {
    const fetchAddresses = vi.fn().mockResolvedValue(new Map([["11680-1", "서울특별시 강남구 역삼동 719-3"]]));
    const cache = {
      ...emptyCache(),
      setMany: vi.fn().mockRejectedValue(new Error("Redis 쓰기 실패")),
    };
    const geocode = vi.fn().mockResolvedValue({ lat: 1, lon: 1 });

    const result = await handleGeocodeRequest(
      { regionCode: "11680", dong: null },
      { fetchAddresses, cache, geocode, responseCache: createNoopResponseCache(), dataKey: "molit-key", key: "id", secret: "s" },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ units: [{ complexKey: "11680-1", lat: 1, lon: 1 }], partialFailureCount: 0 });
  });
});
