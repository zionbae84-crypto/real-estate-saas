// src/state/useRegionComplexes.test.ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import * as regionQuery from "../lib/regionQuery";
import { useRegionComplexes } from "./useRegionComplexes";

describe("useRegionComplexes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("초기 상태는 idle이다", () => {
    const { result } = renderHook(() => useRegionComplexes());
    expect(result.current.status).toBe("idle");
  });

  it("query를 부르면 loading을 거쳐 success가 된다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [],
      isRegulatedArea: true,
      dataAsOf: null, cachedAt: null,
    });
    const { result } = renderHook(() => useRegionComplexes());

    act(() => result.current.query("11680"));
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.isRegulatedArea).toBe(true);
  });

  it("조회가 반영한 계약월(dataAsOf)을 그대로 드러낸다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [],
      isRegulatedArea: null,
      dataAsOf: "2026-01", cachedAt: null,
    });
    const { result } = renderHook(() => useRegionComplexes());

    expect(result.current.dataAsOf).toBeNull(); // 조회 전에는 모른다
    act(() => result.current.query("11680"));
    await waitFor(() => expect(result.current.status).toBe("success"));

    expect(result.current.dataAsOf).toBe("2026-01");
  });

  it("실패하면 dataAsOf도 비운다 — 앞 조회의 기준월이 남으면 안 된다", async () => {
    const spy = vi
      .spyOn(regionQuery, "fetchRegionComplexes")
      .mockResolvedValueOnce({ units: [], isRegulatedArea: null, dataAsOf: "2026-01", cachedAt: null })
      .mockRejectedValueOnce(new Error("조회 실패"));

    const { result } = renderHook(() => useRegionComplexes());
    act(() => result.current.query("11680"));
    await waitFor(() => expect(result.current.dataAsOf).toBe("2026-01"));

    act(() => result.current.query("11110"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.dataAsOf).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("실패하면 error 상태가 되고, units는 빈 배열로 폴백하지 않는다(undefined 유지)", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockRejectedValue(new Error("조회 실패"));
    const { result } = renderHook(() => useRegionComplexes());

    act(() => result.current.query("11680"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("조회 실패");
    expect(result.current.units).toEqual([]);
  });

  it("retry는 마지막으로 조회한 regionCode로 다시 부른다", async () => {
    const spy = vi
      .spyOn(regionQuery, "fetchRegionComplexes")
      .mockRejectedValueOnce(new Error("첫 실패"))
      .mockResolvedValueOnce({ units: [], isRegulatedArea: null, dataAsOf: null, cachedAt: null });

    const { result } = renderHook(() => useRegionComplexes());
    act(() => result.current.query("11680"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("success"));

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(2, "11680", null);
  });

  /**
   * 조회 하나가 국토부 API 12개월치를 병렬로 부치는 구조라(캐시 없음)
   * 응답 시간이 지역마다 크게 다르다 — A를 고른 뒤 곧바로 B를 고르면
   * A의 응답이 B보다 **늦게** 도착하는 일이 실제로 일어난다. 그때
   * `.then`이 무조건 setState를 하면 화면이 B를 보여주는 채로 A의
   * 단지 목록과 A의 규제지역 여부를 뒤집어쓴다. 규제지역 여부는
   * LTV 한도를 40%↔70%로 가르므로, 이 오염은 한도 과대평가로 바로
   * 이어진다.
   */
  it("응답이 역순으로 도착해도 마지막으로 고른 지역의 결과만 반영한다", async () => {
    let resolveA: (v: regionQuery.RegionComplexesResult) => void = () => {};
    let resolveB: (v: regionQuery.RegionComplexesResult) => void = () => {};
    const unitOf = (name: string) =>
      ({ complexName: name }) as unknown as ComplexUnit;

    vi.spyOn(regionQuery, "fetchRegionComplexes").mockImplementation(
      (regionCode: string) =>
        new Promise<regionQuery.RegionComplexesResult>((resolve) => {
          if (regionCode === "11680") resolveA = resolve;
          else resolveB = resolve;
        }),
    );

    const { result } = renderHook(() => useRegionComplexes());

    act(() => result.current.query("11680")); // A: 규제지역
    act(() => result.current.query("11110")); // B: 비규제지역

    // B가 먼저 도착한다.
    await act(async () => {
      resolveB({ units: [unitOf("B단지")], isRegulatedArea: false, dataAsOf: null, cachedAt: null });
    });
    await waitFor(() => expect(result.current.status).toBe("success"));

    // A가 뒤늦게 도착한다 — 이미 지나간 조회다.
    await act(async () => {
      resolveA({ units: [unitOf("A단지")], isRegulatedArea: true, dataAsOf: null, cachedAt: null });
    });

    expect(result.current.units.map((u) => u.complexName)).toEqual(["B단지"]);
    expect(result.current.isRegulatedArea).toBe(false);
    expect(result.current.status).toBe("success");
  });

  it("뒤늦게 도착한 실패도 현재 조회의 상태를 덮지 않는다", async () => {
    let rejectA: (e: Error) => void = () => {};
    let resolveB: (v: regionQuery.RegionComplexesResult) => void = () => {};

    vi.spyOn(regionQuery, "fetchRegionComplexes").mockImplementation(
      (regionCode: string) =>
        new Promise<regionQuery.RegionComplexesResult>((resolve, reject) => {
          if (regionCode === "11680") rejectA = reject;
          else resolveB = resolve;
        }),
    );

    const { result } = renderHook(() => useRegionComplexes());
    act(() => result.current.query("11680"));
    act(() => result.current.query("11110"));

    await act(async () => {
      resolveB({ units: [], isRegulatedArea: false, dataAsOf: null, cachedAt: null });
    });
    await waitFor(() => expect(result.current.status).toBe("success"));

    await act(async () => {
      rejectA(new Error("A 조회 실패"));
    });

    expect(result.current.status).toBe("success");
    expect(result.current.error).toBeNull();
  });
});
