import { describe, expect, it, vi } from "vitest";
import { handleComplexesRequest } from "./handleComplexes";
import type { EmittedComplexUnit } from "../../scripts/pipeline/emit";

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
  lowConfidence: true,
};

const REGIONS = { regulated: ["11680"], nonRegulated: ["11110"] };

describe("handleComplexesRequest", () => {
  it("regionCode가 없으면 400을 반환한다", async () => {
    const result = await handleComplexesRequest(
      { regionCode: null, dong: null },
      { fetchLive: vi.fn(), key: "dummy", regions: REGIONS },
    );
    expect(result.status).toBe(400);
  });

  it("regionCode가 5자리 숫자가 아니면 400을 반환한다", async () => {
    const result = await handleComplexesRequest(
      { regionCode: "abc", dong: null },
      { fetchLive: vi.fn(), key: "dummy", regions: REGIONS },
    );
    expect(result.status).toBe(400);
  });

  it("성공하면 200과 units·isRegulatedArea(regulated 목록)를 반환한다", async () => {
    const fetchLive = vi.fn().mockResolvedValue([UNIT]);
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ units: [UNIT], isRegulatedArea: true });
  });

  it("nonRegulated 목록에 있으면 isRegulatedArea: false를 반환한다", async () => {
    const fetchLive = vi.fn().mockResolvedValue([]);
    const result = await handleComplexesRequest(
      { regionCode: "11110", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS },
    );
    expect((result.body as { isRegulatedArea: unknown }).isRegulatedArea).toBe(false);
  });

  it("어느 목록에도 없으면 isRegulatedArea: null을 반환한다", async () => {
    const fetchLive = vi.fn().mockResolvedValue([]);
    const result = await handleComplexesRequest(
      { regionCode: "99999", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS },
    );
    expect((result.body as { isRegulatedArea: unknown }).isRegulatedArea).toBeNull();
  });

  it("국토부 조회가 실패하면 502와 에러 메시지를 반환한다 — 200+빈배열이 아니다", async () => {
    const fetchLive = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "dummy", regions: REGIONS },
    );
    expect(result.status).toBe(502);
    expect(result.status).not.toBe(200);
  });

  it("에러 메시지에 키가 노출되면 redact한다", async () => {
    const fetchLive = vi.fn().mockRejectedValue(new Error("HTTP 403: key=secret-key-value"));
    const result = await handleComplexesRequest(
      { regionCode: "11680", dong: null },
      { fetchLive, key: "secret-key-value", regions: REGIONS },
    );
    expect(JSON.stringify(result.body)).not.toContain("secret-key-value");
  });
});
