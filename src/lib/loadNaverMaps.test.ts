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

  it("한 번 실패해도 다음 호출은 처음부터 다시 시도한다 — 실패를 캐시하지 않는다", async () => {
    // 실패까지 캐시하면 일시적 실패(네트워크 끊김, 배포 직후 도메인
    // 미등록) 하나가 그 세션 내내 회복 불가능해진다. 화면의 "다시 시도"
    // 버튼도 ComplexMap 재마운트도 같은 거부된 프라미스를 돌려받는다.
    const first = loadNaverMaps("test-client-id");
    const firstScript = document.querySelector("script");
    firstScript?.onerror?.(new Event("error"));
    await expect(first).rejects.toThrow("네이버지도 스크립트를 불러오지 못했어요");

    // 두 번째 호출: 새 스크립트 태그가 실제로 들어가야 한다.
    const second = loadNaverMaps("test-client-id");
    expect(document.querySelectorAll("script")).toHaveLength(2);

    const scripts = document.querySelectorAll("script");
    (window as unknown as { naver: unknown }).naver = { maps: {} };
    scripts[1]?.onload?.(new Event("load"));

    await expect(second).resolves.toBe(window.naver);
  });

  it("로딩 중에는 여전히 스크립트 태그를 하나만 넣는다", async () => {
    // 위 회복 경로를 만들면서 이 보장이 깨지기 쉽다 — 성공 경로에서는
    // 여러 번 불러도 같은 프라미스·같은 태그 하나여야 한다.
    const a = loadNaverMaps("test-client-id");
    const b = loadNaverMaps("test-client-id");
    expect(document.querySelectorAll("script")).toHaveLength(1);

    (window as unknown as { naver: unknown }).naver = { maps: {} };
    document.querySelector("script")?.onload?.(new Event("load"));

    await expect(a).resolves.toBe(window.naver);
    await expect(b).resolves.toBe(window.naver);
    expect(document.querySelectorAll("script")).toHaveLength(1);
  });
});
