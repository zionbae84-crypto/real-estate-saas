import { describe, expect, it, vi } from "vitest";
import { fetchLiveComplexes } from "./live";
import { normalizeAll } from "./normalize";
import { aggregate } from "./aggregate";
import { toEmittedUnit } from "./emit";
import { parseResponse } from "./parse-response";
import { latestContractMonth } from "./run";
import type { ReportConfig } from "./types";

const CONFIG: ReportConfig = {
  widePriceRangeMinRatio: 2.0,
  widePriceRangeMinTradeCount: 4,
  lowConfidenceMinTrades: 3,
  emptyRatioWarnThreshold: 0.2,
};

function tradeItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    sggCd: "11680",
    aptSeq: "11680-1",
    umdNm: "역삼동",
    aptNm: "테스트아파트",
    buildYear: "2010",
    excluUseAr: "84.9",
    floor: "5",
    dealAmount: "100,000",
    dealYear: "2026",
    dealMonth: "1",
    dealDay: "1",
    // 공백 한 칸 = 정상(해제되지 않은) 거래. classifyDealStatus는 이 필드가
    // 문자열이 아니면(필드 없음 포함) "판정 불가"로 보고 failures로 세지,
    // 관대하게 정상 거래로 봐주지 않는다(parse-response.ts 참고) — 그래서
    // 이 필드를 빠뜨리면 아래 모든 테스트의 거래가 전부 실패로 사라진다.
    cdealType: " ",
    ...over,
  };
}

function responseBody(items: ReturnType<typeof tradeItem>[]) {
  return JSON.stringify({
    response: {
      header: { resultCode: "000" },
      body: { totalCount: items.length, items: { item: items } },
    },
  });
}

describe("fetchLiveComplexes", () => {
  it("한 지역의 12개월치를 병렬로 모아 집계한다", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      const u = new URL(url);
      calls.push(u.searchParams.get("DEAL_YMD") ?? "");
      // 첫 달만 거래 하나, 나머지는 0건.
      const items = u.searchParams.get("DEAL_YMD") === "202601" ? [tradeItem()] : [];
      return new Response(responseBody(items), { status: 200 });
    }) as typeof fetch;

    const { units } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(calls).toHaveLength(12); // MONTHS_BACK
    expect(units).toHaveLength(1);
    expect(units[0]?.complexName).toBe("테스트아파트");
    expect(units[0]?.tradeCount).toBe(1);
  });

  it("medianPrice·changeRate*를 응답에서 뺀다", async () => {
    globalThis.fetch = (async () =>
      new Response(responseBody([tradeItem()]), { status: 200 })) as typeof fetch;

    const { units } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(units[0]).not.toHaveProperty("medianPrice");
    expect(units[0]).not.toHaveProperty("changeRate3m");
    expect(units[0]).not.toHaveProperty("changeRate12m");
  });

  it("dong을 주면 그 법정동 거래만 남긴다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        responseBody([tradeItem({ umdNm: "역삼동" }), tradeItem({ aptSeq: "11680-2", umdNm: "삼성동", aptNm: "다른아파트" })]),
        { status: 200 },
      )) as typeof fetch;

    const { units } = await fetchLiveComplexes(
      "11680",
      "삼성동",
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(units).toHaveLength(1);
    expect(units[0]?.legalDongName).toBe("삼성동");
  });

  it("dataAsOf는 들어온 거래 중 가장 최근 계약월(YYYY-MM)이다", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const ymd = new URL(url).searchParams.get("DEAL_YMD") ?? "";
      // 202511·202601 두 달에만 거래가 있다. 가장 최근 쪽을 골라야 한다.
      const items =
        ymd === "202511"
          ? [tradeItem({ dealYear: "2025", dealMonth: "11", dealDay: "3" })]
          : ymd === "202601"
            ? [tradeItem({ dealYear: "2026", dealMonth: "1", dealDay: "9" })]
            : [];
      return new Response(responseBody(items), { status: 200 });
    }) as typeof fetch;

    const { dataAsOf } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(dataAsOf).toBe("2026-01");
  });

  /**
   * 거래가 한 건도 없으면 최대값을 낼 대상이 없다. 오늘 날짜 같은 것으로
   * 채우면 화면이 "그 달 계약분까지 반영했어요"라는, 우리가 확인한 적
   * 없는 사실을 말하게 된다 — 근거를 실제보다 튼튼해 보이게 하는 쪽이라
   * 이 앱이 가장 경계하는 오표기다.
   */
  it("거래가 0건이면 dataAsOf는 null이다 — 날짜를 지어내지 않는다", async () => {
    globalThis.fetch = (async () =>
      new Response(responseBody([]), { status: 200 })) as typeof fetch;

    const { units, dataAsOf } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(units).toEqual([]);
    expect(dataAsOf).toBeNull();
  });

  /**
   * 동으로 좁혀도 dataAsOf는 좁히기 **전** 거래 전체에서 낸다 — 이 값이
   * 말하는 것은 "이 조회가 어느 계약월까지 반영했는가"이고, 그건 사용자가
   * 목록을 어떻게 좁혔는지와 무관한 조회 자체의 성질이다.
   */
  it("dong으로 좁혀도 dataAsOf는 조회 전체 기준이다", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const ymd = new URL(url).searchParams.get("DEAL_YMD") ?? "";
      const items =
        ymd === "202601"
          ? [
              tradeItem({ umdNm: "삼성동", dealYear: "2025", dealMonth: "12", dealDay: "1" }),
              tradeItem({
                aptSeq: "11680-2",
                aptNm: "다른아파트",
                umdNm: "역삼동",
                dealYear: "2026",
                dealMonth: "1",
                dealDay: "9",
              }),
            ]
          : [];
      return new Response(responseBody(items), { status: 200 });
    }) as typeof fetch;

    const { units, dataAsOf } = await fetchLiveComplexes(
      "11680",
      "삼성동",
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(units.map((u) => u.legalDongName)).toEqual(["삼성동"]);
    // 삼성동 거래는 2025-12뿐이지만, 조회 자체는 2026-01까지 받았다.
    expect(dataAsOf).toBe("2026-01");
  });

  it("한 달이라도 실패하면 전체를 던진다 — 절반만 모은 데이터를 성공으로 두갑시키지 않는다", async () => {
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;

    await expect(
      fetchLiveComplexes("11680", null, new Date("2026-01-15"), "dummy-key", CONFIG, async () => {}),
    ).rejects.toThrow();
  });
});

describe("fetchLiveComplexes — 세대수(householdCount)", () => {
  it("lookupHouseholdCounts가 준 값을 pnu로 매칭해 채운다", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const ymd = new URL(url).searchParams.get("DEAL_YMD") ?? "";
      // pnu를 만들려면 주소가 필요하다 — 기본 tradeItem()에는 없다.
      const items = ymd === "202601" ? [tradeItem({ bonbun: "902", jibun: "902", umdCd: "10100" })] : [];
      return new Response(responseBody(items), { status: 200 });
    }) as typeof fetch;

    const { units } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
      undefined,
      async (pnus) => {
        const map = new Map<string, number>();
        // 실제 pnu가 뭐든 그대로 되돌려 주는 대신, 조회에 들어온 pnu
        // 각각에 499를 매핑해 "매칭이 실제로 pnu로 일어나는지"를 확인한다.
        for (const pnu of pnus) map.set(pnu, 499);
        return map;
      },
    );

    expect(units[0]?.householdCount).toBe(499);
  });

  it("lookupHouseholdCounts를 안 주면(기본값) householdCount는 언제나 null이다", async () => {
    globalThis.fetch = (async () =>
      new Response(responseBody([tradeItem()]), { status: 200 })) as typeof fetch;

    const { units } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
    );

    expect(units[0]?.householdCount).toBeNull();
  });

  it("lookupHouseholdCounts가 던져도 목록 조회 자체는 성공한다 — 세대수는 부가 정보다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        responseBody([tradeItem({ bonbun: "902", jibun: "902", umdCd: "10100" })]),
        { status: 200 },
      )) as typeof fetch;

    const { units } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
      undefined,
      async () => {
        throw new Error("household count API down");
      },
    );

    expect(units).toHaveLength(1);
    expect(units[0]?.householdCount).toBeNull();
  });

  it("pnu가 없는(주소를 못 만든) 단지는 조회 대상에서 빠지고 householdCount는 null이다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        responseBody([tradeItem({ jibun: null, bonbun: null, bubun: null, umdCd: null })]),
        { status: 200 },
      )) as typeof fetch;

    const lookup = vi.fn(async () => new Map<string, number>());
    const { units } = await fetchLiveComplexes(
      "11680",
      null,
      new Date("2026-01-15"),
      "dummy-key",
      CONFIG,
      async () => {},
      undefined,
      lookup,
    );

    expect(units[0]?.householdCount).toBeNull();
    // pnu가 없으니 lookup에 넘어가는 목록도 비어 있다.
    expect(lookup).toHaveBeenCalledWith([]);
  });
});

describe("배치 파이프라인과의 패리티", () => {
  it("같은 HTTP 응답이면 라이브 경로와 배치 경로(normalizeAll→aggregate→toEmittedUnit 직접 호출)가 같은 결과를 낸다", async () => {
    const items = [tradeItem(), tradeItem({ aptSeq: "11680-2", aptNm: "다른아파트", umdNm: "삼성동" })];
    const body = responseBody(items);
    const now = new Date("2026-01-15");

    // 라이브 경로: fetchLiveComplexes가 매달 같은 응답을 받는다고 mock한다.
    globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
    const live = await fetchLiveComplexes("11680", null, now, "dummy-key", CONFIG, async () => {});

    // 배치 경로: 같은 HTTP 응답 본문을 parseResponse로 직접 파싱해
    // normalizeAll → aggregate → toEmittedUnit을 순서대로 호출한다.
    // fetchLiveComplexes는 이 응답을 12번(월별) 받으므로, 배치 경로도
    // 같은 trades를 12번 이어붙여 맞춘다.
    const oneMonth = parseResponse(body).trades;
    const twelveMonths = Array.from({ length: 12 }, () => oneMonth).flat();
    const batchUnits = aggregate(normalizeAll(twelveMonths), now, CONFIG).map(toEmittedUnit);

    expect(live.units).toEqual(batchUnits);
    expect(live.units.length).toBe(2);

    // dataAsOf도 배치 경로(run.ts의 latestContractMonth)와 같은 규칙이다 —
    // 같은 거래에서 가장 최근 계약월을 YYYY-MM으로 낸다.
    expect(live.dataAsOf).toBe(latestContractMonth(twelveMonths));
  });
});
