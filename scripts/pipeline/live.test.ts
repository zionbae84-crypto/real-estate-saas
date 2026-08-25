import { describe, expect, it, vi } from "vitest";
import { fetchLiveComplexes } from "./live";
import { normalizeAll } from "./normalize";
import { aggregate } from "./aggregate";
import { toEmittedUnit } from "./emit";
import { parseResponse } from "./parse-response";
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

    const units = await fetchLiveComplexes(
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

    const units = await fetchLiveComplexes(
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

    const units = await fetchLiveComplexes(
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

  it("한 달이라도 실패하면 전체를 던진다 — 절반만 모은 데이터를 성공으로 두갑시키지 않는다", async () => {
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;

    await expect(
      fetchLiveComplexes("11680", null, new Date("2026-01-15"), "dummy-key", CONFIG, async () => {}),
    ).rejects.toThrow();
  });
});

describe("배치 파이프라인과의 패리티", () => {
  it("같은 HTTP 응답이면 라이브 경로와 배치 경로(normalizeAll→aggregate→toEmittedUnit 직접 호출)가 같은 결과를 낸다", async () => {
    const items = [tradeItem(), tradeItem({ aptSeq: "11680-2", aptNm: "다른아파트", umdNm: "삼성동" })];
    const body = responseBody(items);
    const now = new Date("2026-01-15");

    // 라이브 경로: fetchLiveComplexes가 매달 같은 응답을 받는다고 mock한다.
    globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
    const liveUnits = await fetchLiveComplexes("11680", null, now, "dummy-key", CONFIG, async () => {});

    // 배치 경로: 같은 HTTP 응답 본문을 parseResponse로 직접 파싱해
    // normalizeAll → aggregate → toEmittedUnit을 순서대로 호출한다.
    // fetchLiveComplexes는 이 응답을 12번(월별) 받으므로, 배치 경로도
    // 같은 trades를 12번 이어붙여 맞춘다.
    const oneMonth = parseResponse(body).trades;
    const twelveMonths = Array.from({ length: 12 }, () => oneMonth).flat();
    const batchUnits = aggregate(normalizeAll(twelveMonths), now, CONFIG).map(toEmittedUnit);

    expect(liveUnits).toEqual(batchUnits);
    expect(liveUnits.length).toBe(2);
  });
});
