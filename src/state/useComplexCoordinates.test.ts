// src/state/useComplexCoordinates.test.ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as regionQuery from "../lib/regionQuery";
import { useComplexCoordinates } from "./useComplexCoordinates";

describe("useComplexCoordinates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("초기 상태는 idle이다", () => {
    const { result } = renderHook(() => useComplexCoordinates());
    expect(result.current.status).toBe("idle");
  });

  it("query를 부르면 loading을 거쳐 success가 되고, complexKey로 좌표를 찾을 수 있다", async () => {
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }],
      partialFailureCount: 0,
    });
    const { result } = renderHook(() => useComplexCoordinates());

    act(() => result.current.query("11680", null));
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.coordinates.get("11680-1")).toEqual({ lat: 37.1, lon: 127.1 });
    expect(result.current.hasPartialFailures).toBe(false);
  });

  it("partialFailureCount가 0보다 크면 hasPartialFailures가 true가 된다", async () => {
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }],
      partialFailureCount: 2,
    });
    const { result } = renderHook(() => useComplexCoordinates());

    act(() => result.current.query("11680", null));
    await waitFor(() => expect(result.current.status).toBe("success"));

    // 확인에 성공한 단지는 그대로 남아 있다 — 실패 신호가 성공한 좌표를
    // 지우지 않는다.
    expect(result.current.coordinates.get("11680-1")).toEqual({ lat: 37.1, lon: 127.1 });
    expect(result.current.hasPartialFailures).toBe(true);
  });

  it("실패하면 error 상태가 되고, coordinates는 비어 있다", async () => {
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockRejectedValue(new Error("실패"));
    const { result } = renderHook(() => useComplexCoordinates());

    act(() => result.current.query("11680", null));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.coordinates.size).toBe(0);
  });

  /**
   * 지역/동을 연달아 바꿔 조회하면 앞선 요청의 응답이 뒤늦게 도착할 수
   * 있다(지오코딩 API 응답 시간이 지역마다 다름). 이때 무조건 setState를
   * 하면 화면이 최신 지역을 보여주는 채로 지나간 지역의 좌표를
   * 뒤집어쓴다 — `useRegionComplexes`에서 이미 한 번 고쳐진 것과 같은
   * 버그 클래스다.
   */
  it("응답이 역순으로 도착해도 마지막으로 고른 지역의 좌표만 반영한다", async () => {
    let resolveA: (v: Awaited<ReturnType<typeof regionQuery.fetchComplexCoordinates>>) => void = () => {};
    let resolveB: (v: Awaited<ReturnType<typeof regionQuery.fetchComplexCoordinates>>) => void = () => {};

    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockImplementation(
      (regionCode: string) =>
        new Promise((resolve) => {
          if (regionCode === "11680") resolveA = resolve;
          else resolveB = resolve;
        }),
    );

    const { result } = renderHook(() => useComplexCoordinates());

    act(() => result.current.query("11680", null)); // A: 먼저 고른 지역
    act(() => result.current.query("11110", null)); // B: 나중에 고른 지역

    // B가 먼저 도착한다.
    await act(async () => {
      resolveB({ units: [{ complexKey: "11110-1", lat: 37.5, lon: 127.5 }], partialFailureCount: 0 });
    });
    await waitFor(() => expect(result.current.status).toBe("success"));

    // A가 뒤늦게 도착한다 — 이미 지나간 조회다.
    await act(async () => {
      resolveA({ units: [{ complexKey: "11680-1", lat: 37.1, lon: 127.1 }], partialFailureCount: 0 });
    });

    expect(result.current.status).toBe("success");
    expect(result.current.coordinates.get("11110-1")).toEqual({ lat: 37.5, lon: 127.5 });
    expect(result.current.coordinates.has("11680-1")).toBe(false);
  });

  it("뒤늦게 도착한 실패도 현재 조회의 상태를 덮지 않는다", async () => {
    let rejectA: (e: Error) => void = () => {};
    let resolveB: (v: Awaited<ReturnType<typeof regionQuery.fetchComplexCoordinates>>) => void = () => {};

    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockImplementation(
      (regionCode: string) =>
        new Promise((resolve, reject) => {
          if (regionCode === "11680") rejectA = reject;
          else resolveB = resolve;
        }),
    );

    const { result } = renderHook(() => useComplexCoordinates());
    act(() => result.current.query("11680", null));
    act(() => result.current.query("11110", null));

    await act(async () => {
      resolveB({ units: [{ complexKey: "11110-1", lat: 37.5, lon: 127.5 }], partialFailureCount: 0 });
    });
    await waitFor(() => expect(result.current.status).toBe("success"));

    await act(async () => {
      rejectA(new Error("A 조회 실패"));
    });

    expect(result.current.status).toBe("success");
    expect(result.current.coordinates.get("11110-1")).toEqual({ lat: 37.5, lon: 127.5 });
  });
});
