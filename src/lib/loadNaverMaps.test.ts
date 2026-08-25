import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNaverMaps } from "./loadNaverMaps";

describe("loadNaverMaps", () => {
  afterEach(() => {
    document.querySelectorAll("script").forEach((s) => s.remove());
    Reflect.deleteProperty(window, "naver");
    vi.resetModules();
  });

  it("스크립트 태그를 정확히 하나 만들고, 로드되면 naver를 반환한다", async () => {
    const promise = loadNaverMaps("test-client-id");
    const script = document.querySelector("script");
    expect(script?.src).toContain("oapi.map.naver.com");
    expect(script?.src).toContain("ncpKeyId=test-client-id");

    // 실제 스크립트 로드를 흉내낸다.
    (window as unknown as { naver: unknown }).naver = { maps: {} };
    script?.onload?.(new Event("load"));

    const naverGlobal = await promise;
    expect(naverGlobal).toBe(window.naver);
    expect(document.querySelectorAll("script")).toHaveLength(1);
  });

  it("naver.maps가 이미 있으면 스크립트를 다시 넣지 않는다", async () => {
    (window as unknown as { naver: unknown }).naver = { maps: {} };
    await loadNaverMaps("test-client-id");
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });
});
