// scripts/pipeline/geocode-addresses.test.ts
import { describe, expect, it } from "vitest";
import { buildAddressString, fetchComplexAddresses } from "./geocode-addresses";
import type { RawTrade } from "./types";

function trade(over: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "역삼동",
    aptSeq: "11680-1",
    complexName: "테스트아파트",
    builtYear: 2010,
    exclusiveAreaSqm: 84.9,
    floor: 5,
    price: 1_000_000_000,
    contractDate: "2026-01-10",
    landLeasehold: "N",
    address: {
      roadNm: "테헤란로", roadNmCd: "111", bonbun: "719", bubun: "3",
      jibun: "719-3", umdCd: "1168010100",
    },
    ...over,
  };
}

function tradeItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    sggCd: "11680", aptSeq: "11680-1", umdNm: "역삼동", aptNm: "테스트아파트",
    buildYear: "2010", excluUseAr: "84.9", floor: "5", dealAmount: "100,000",
    dealYear: "2026", dealMonth: "1", dealDay: "10", cdealType: " ",
    roadNm: "테헤란로", roadNmCd: "111", bonbun: "719", bubun: "3",
    jibun: "719-3", umdCd: "1168010100",
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

describe("buildAddressString", () => {
  it("시도+시군구+법정동+지번을 합친다", () => {
    expect(buildAddressString(trade())).toBe("서울특별시 강남구 역삼동 719-3");
  });

  it("지번이 없으면 본번-부번으로 대신 만든다", () => {
    const t = trade({ address: { ...trade().address, jibun: null } });
    expect(buildAddressString(t)).toBe("서울특별시 강남구 역삼동 719-3");
  });

  it("지번이 없고 부번이 0 패딩된 '0000'이면 본번만으로 만든다", () => {
    const t = trade({
      address: { ...trade().address, jibun: null, bubun: "0000" },
    });
    expect(buildAddressString(t)).toBe("서울특별시 강남구 역삼동 719");
  });

  it("지번이 없고 부번이 0 패딩된 '0003'이면 선행 0을 뗀 -3으로 만든다", () => {
    const t = trade({
      address: { ...trade().address, jibun: null, bubun: "0003" },
    });
    expect(buildAddressString(t)).toBe("서울특별시 강남구 역삼동 719-3");
  });

  it("지번도 본번도 없으면 null이다 — 지어내지 않는다", () => {
    const t = trade({
      address: { roadNm: null, roadNmCd: null, bonbun: null, bubun: null, jibun: null, umdCd: null },
    });
    expect(buildAddressString(t)).toBeNull();
  });

  it("모르는 regionCode면 null이다", () => {
    const t = trade({ regionCode: "99999" });
    expect(buildAddressString(t)).toBeNull();
  });
});

describe("fetchComplexAddresses", () => {
  it("단지별로 대표 주소 하나씩 Map으로 낸다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        responseBody([
          tradeItem(),
          tradeItem({ floor: "8" }), // 같은 단지, 다른 거래 — 주소는 하나만 남아야 한다
          tradeItem({ aptSeq: "11680-2", aptNm: "다른아파트", jibun: "800-1", bonbun: "800", bubun: "1" }),
        ]),
        { status: 200 },
      )) as typeof fetch;

    const result = await fetchComplexAddresses("11680", null, new Date("2026-01-15"), "dummy-key", async () => {});

    expect(result.size).toBe(2);
    expect(result.get("11680-1")).toBe("서울특별시 강남구 역삼동 719-3");
    expect(result.get("11680-2")).toBe("서울특별시 강남구 역삼동 800-1");
  });

  it("dong을 주면 그 법정동 거래만 남긴다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        responseBody([
          tradeItem({ umdNm: "역삼동" }),
          tradeItem({ aptSeq: "11680-2", aptNm: "다른아파트", umdNm: "삼성동", jibun: "1-1", bonbun: "1", bubun: "1" }),
        ]),
        { status: 200 },
      )) as typeof fetch;

    const result = await fetchComplexAddresses("11680", "삼성동", new Date("2026-01-15"), "dummy-key", async () => {});

    expect(result.size).toBe(1);
    expect(result.has("11680-2")).toBe(true);
  });

  it("한 달만 조회한다 — 12개월치를 부르지 않는다", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(responseBody([]), { status: 200 });
    }) as typeof fetch;

    await fetchComplexAddresses("11680", null, new Date("2026-01-15"), "dummy-key", async () => {});
    expect(calls).toBe(1);
  });
});
