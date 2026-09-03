import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSchoolZones, resetSchoolZonesCacheForTest } from "./loadSchoolZones";

const CHUNK = {
  schemaVersion: 1,
  zones: [
    { id: "Z1", name: "테스트초통학구역", shared: false, rings: [[127000000, 37000000, 100, 200]] },
  ],
};

function stubFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("loadSchoolZones", () => {
  afterEach(() => {
    resetSchoolZonesCacheForTest();
    vi.unstubAllGlobals();
  });

  it("학교ID로 상대경로 청크를 요청하고, 인코딩된 링을 좌표쌍으로 되돌린다", async () => {
    const fetchMock = stubFetchOnce(CHUNK);

    const zones = await loadSchoolZones("B0001");

    expect(fetchMock).toHaveBeenCalledWith("/school-zones/B0001.json");
    expect(zones).toEqual([
      {
        id: "Z1",
        name: "테스트초통학구역",
        shared: false,
        rings: [[[127, 37], [127.0001, 37.0002]]],
      },
    ]);
  });

  it("학교ID를 URL에 안전하게 인코딩한다", async () => {
    const fetchMock = stubFetchOnce(CHUNK);

    await loadSchoolZones("B 001/x");

    expect(fetchMock).toHaveBeenCalledWith(`/school-zones/${encodeURIComponent("B 001/x")}.json`);
  });

  it("같은 학교를 다시 부르면 다시 내려받지 않는다 — 캐시를 쓴다", async () => {
    const fetchMock = stubFetchOnce(CHUNK);

    await loadSchoolZones("B0001");
    await loadSchoolZones("B0001");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("같은 학교를 빠르게 두 번 부르면 요청이 한 번만 나간다 — 진행 중 요청을 공유한다", async () => {
    const fetchMock = stubFetchOnce(CHUNK);

    const [a, b] = await Promise.all([loadSchoolZones("B0001"), loadSchoolZones("B0001")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("응답이 실패(HTTP 4xx/5xx)면 던진다 — 빈 배열로 삼키지 않는다", async () => {
    stubFetchOnce(null, false, 404);

    await expect(loadSchoolZones("B0001")).rejects.toThrow("HTTP 404");
  });

  it("실패한 요청은 캐시하지 않는다 — 다음 호출이 다시 시도할 수 있다", async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve(null) });
    vi.stubGlobal("fetch", failing);
    await expect(loadSchoolZones("B0001")).rejects.toThrow();

    const succeeding = stubFetchOnce(CHUNK);
    await expect(loadSchoolZones("B0001")).resolves.not.toEqual([]);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
