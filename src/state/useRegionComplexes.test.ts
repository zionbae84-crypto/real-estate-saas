// src/state/useRegionComplexes.test.ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    });
    const { result } = renderHook(() => useRegionComplexes());

    act(() => result.current.query("11680"));
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.isRegulatedArea).toBe(true);
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
      .mockResolvedValueOnce({ units: [], isRegulatedArea: null });

    const { result } = renderHook(() => useRegionComplexes());
    act(() => result.current.query("11680"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("success"));

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(2, "11680", null);
  });
});
