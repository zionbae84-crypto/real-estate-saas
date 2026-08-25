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
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue([
      { complexKey: "11680-1", lat: 37.1, lon: 127.1 },
    ]);
    const { result } = renderHook(() => useComplexCoordinates());

    act(() => result.current.query("11680", null));
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.coordinates.get("11680-1")).toEqual({ lat: 37.1, lon: 127.1 });
  });

  it("실패하면 error 상태가 되고, coordinates는 비어 있다", async () => {
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockRejectedValue(new Error("실패"));
    const { result } = renderHook(() => useComplexCoordinates());

    act(() => result.current.query("11680", null));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.coordinates.size).toBe(0);
  });
});
