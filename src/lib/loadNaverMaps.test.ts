import { afterEach, describe, expect, it } from "vitest";
import { loadNaverMaps, resetNaverMapsLoaderForTest } from "./loadNaverMaps";

describe("loadNaverMaps", () => {
  afterEach(() => {
    document.querySelectorAll("script").forEach((s) => s.remove());
    Reflect.deleteProperty(window, "naver");
    // `vi.resetModules()`로는 static import된 이 모듈의 loadingPromise 캐시가
    // 비워지지 않는다(이미 묶인 참조를 다시 묶지 않으므로). 캐시를 직접 비운다.
    resetNaverMapsLoaderForTest();
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

  it("스크립트가 로드됐는데도 naver.maps가 없으면 그 사유로 거부한다", async () => {
    const promise = loadNaverMaps("test-client-id");
    const script = document.querySelector("script");
    // window.naver를 심지 않은 채 onload만 발화시킨다.
    script?.onload?.(new Event("load"));

    await expect(promise).rejects.toThrow(
      "네이버지도 스크립트가 로드됐지만 naver.maps가 없어요",
    );
  });

  it("스크립트 로드 자체가 실패하면 그 사유로 거부한다", async () => {
    const promise = loadNaverMaps("test-client-id");
    const script = document.querySelector("script");
    script?.onerror?.(new Event("error"));

    await expect(promise).rejects.toThrow("네이버지도 스크립트를 불러오지 못했어요");
  });
});
