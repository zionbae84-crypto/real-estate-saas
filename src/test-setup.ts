import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

/**
 * jsdom은 `ResizeObserver`를 구현하지 않는다. SEED `Slider`가 내부에서 쓰는
 * `@radix-ui/react-use-size`가 썸 크기를 관찰하려고 이 생성자를 직접
 * 호출하므로, 이 스텁이 없으면 `Slider`를 렌더링하는 모든 테스트가
 * `ResizeObserver is not defined`로 죽는다. 실제 크기 측정은 테스트에
 * 의미가 없으므로(레이아웃이 없다) 아무 것도 하지 않는 스텁으로 충분하다.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

/**
 * jsdom도 `window.matchMedia`를 구현하지 않는다. SEED `Slider`가 값
 * 인디케이터를 hover로 보여줄지 active로 보여줄지 고르려고
 * `window.matchMedia("(hover: hover)")`를 직접 부른다. 테스트 환경에는
 * 실제 포인터 장치가 없으므로 "hover 지원 안 함"(matches: false)으로
 * 답하는 스텁이면 충분하다.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
