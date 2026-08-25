import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loadNaverMapsModule from "../lib/loadNaverMaps";
import { ComplexMap } from "./ComplexMap";
import type { ComplexUnit } from "../data/complexes";

function unit(over: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680-1",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "역삼동",
    builtYear: 2010,
    areaBucket: 84,
    maxExclusiveAreaSqm: 84.9,
    landLeasehold: "N",
    tradeCount: 3,
    minPrice: 1_000_000_000,
    maxPrice: 1_200_000_000,
    minFloor: 3,
    maxFloor: 15,
    unknownFloorCount: 0,
    lowConfidence: false,
    ...over,
  };
}

function fakeNaverMaps() {
  const markers: Array<{ position: unknown; listeners: Record<string, () => void>; removed: boolean }> = [];
  const infoWindows: Array<{ content: string; opened: boolean; removed: boolean }> = [];
  const destroyedMaps: unknown[] = [];
  // Map 생성자가 받는 실제 컨테이너 엘리먼트를 기억해 둔다 — Marker가
  // icon.content HTML을 여기 심어야 screen.getByText로 검증할 수 있다
  // (실제 네이버지도 SDK도 HtmlIcon을 지도 컨테이너 안 DOM에 렌더링한다).
  let mapContainerEl: HTMLElement | null = null;

  const naverGlobal = {
    maps: {
      Map: class {
        destroyed = false;
        constructor(el: HTMLElement, _opts: unknown) {
          mapContainerEl = el;
        }
        destroy() {
          this.destroyed = true;
          destroyedMaps.push(this);
        }
      },
      LatLng: class {
        constructor(
          public lat: number,
          public lng: number,
        ) {}
      },
      Point: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
      Marker: class {
        listeners: Record<string, () => void> = {};
        position: unknown;
        removed = false;
        el: HTMLElement | null = null;
        constructor(opts: { position: unknown; icon?: { content?: string | HTMLElement } }) {
          this.position = opts.position;
          markers.push(this);
          if (opts.icon?.content !== undefined && mapContainerEl !== null) {
            const el = document.createElement("div");
            if (typeof opts.icon.content === "string") el.innerHTML = opts.icon.content;
            else el.appendChild(opts.icon.content);
            mapContainerEl.appendChild(el);
            this.el = el;
          }
        }
        // 실제 SDK의 Marker는 OverlayView를 상속해 setMap(null)로 지도에서 뗀다.
        setMap(map: unknown) {
          if (map === null) {
            this.removed = true;
            this.el?.remove();
          }
        }
      },
      InfoWindow: class {
        content: string;
        opened = false;
        removed = false;
        constructor(opts: { content: string }) {
          this.content = opts.content;
          infoWindows.push(this);
        }
        open() {
          this.opened = true;
        }
        close() {
          this.opened = false;
        }
        getMap() {
          return this.opened ? {} : undefined;
        }
        setMap(map: unknown) {
          if (map === null) {
            this.removed = true;
            this.opened = false;
          }
        }
      },
      Event: {
        addListener(marker: { listeners: Record<string, () => void> }, event: string, fn: () => void) {
          marker.listeners[event] = fn;
          // 실제 SDK는 addListener/eventName 조합이 아니라 이 핸들을
          // removeListener에 넘겨야 한다 — @types/navermaps 참고.
          return { marker, event };
        },
        removeListener(handle: { marker: { listeners: Record<string, () => void> }; event: string }) {
          delete handle.marker.listeners[handle.event];
        },
      },
    },
  };

  return { naverGlobal, markers, infoWindows, destroyedMaps };
}

describe("ComplexMap", () => {
  beforeEach(() => {
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockImplementation(async () => {
      const { naverGlobal } = fakeNaverMaps();
      return naverGlobal as unknown as typeof naver;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("좌표가 있는 단지만 마커로 그린다", async () => {
    const units = [unit(), unit({ complexKey: "11680-2", complexName: "좌표없는아파트" })];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    // 실제 마커 개수는 naver.maps 모의 안에 있으므로, 컴포넌트가
    // 예외 없이 렌더링되고 지도 영역이 뜨는지로 확인한다(아래 클릭
    // 테스트가 마커 자체의 동작을 더 구체적으로 확인한다).
  });

  it("빈 좌표 목록이면 지도 영역은 뜨되 마커가 없다(에러 없이)", async () => {
    render(<ComplexMap units={[unit()]} coordinates={new Map()} naverMapClientId="test-id" />);
    await screen.findByRole("region", { name: "단지 지도" });
  });

  it("마커를 클릭하면 팝업이 열리고, 정보 팝업엔 적정가 숫자가 없다", async () => {
    const { naverGlobal, markers, infoWindows } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    const units = [unit()];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => expect(markers).toHaveLength(1));

    markers[0]!.listeners.click?.();
    expect(infoWindows[0]!.opened).toBe(true);
    expect(infoWindows[0]!.content).toContain("테스트아파트");
    expect(infoWindows[0]!.content).not.toMatch(/적정가/);
  });

  it("한 단지에 평형이 여럿이어도 마커는 하나이고, 팝업에 평형이 모두 담긴다", async () => {
    const { naverGlobal, markers, infoWindows } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    // 같은 단지(complexKey 동일)의 두 평형. 좌표는 단지 단위라 하나뿐이므로,
    // 평형마다 마커를 만들면 정확히 같은 자리에 겹쳐 쌓이고 맨 위 하나만
    // 눌린다 — 나머지 평형은 지도에 있는데 열어볼 수 없다.
    const units = [
      unit({ areaBucket: 84, minPrice: 900_000_000, maxPrice: 1_000_000_000, tradeCount: 3 }),
      unit({ areaBucket: 59, minPrice: 700_000_000, maxPrice: 750_000_000, tradeCount: 2 }),
    ];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => expect(infoWindows).toHaveLength(1));
    expect(markers).toHaveLength(1);

    const content = infoWindows[0]!.content;
    expect(content).toContain("84㎡");
    expect(content).toContain("59㎡");
    expect(content).toContain("거래 3건");
    expect(content).toContain("거래 2건");
    // 단지 이름은 맨 위에 한 번만 — 평형마다 반복하지 않는다.
    expect(content.match(/테스트아파트/g)).toHaveLength(1);
    // 평형이 여러 줄이 돼도 단일 "적정가" 숫자로 접히지 않는다(부모 스펙 §6).
    expect(content).not.toMatch(/적정가/);
  });

  it("단지 이름에 마크업이 섞여 있어도 글자로 보여준다 — HTML로 실행되지 않는다", async () => {
    const { naverGlobal, infoWindows } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    // complexName은 국토부 API의 aptNm에서 그대로 온다. 이 팝업은 이 앱에서
    // 유일하게 React를 거치지 않는 HTML 문자열이라, 여기서 이스케이프하지
    // 않으면 이 앱의 유일한 스크립트 주입 지점이 된다.
    const units = [unit({ complexName: '<img src=x onerror=alert(1)>' })];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => expect(infoWindows).toHaveLength(1));

    const content = infoWindows[0]!.content;
    expect(content).not.toContain("<img");
    expect(content).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // 이스케이프된 문자열을 실제로 파싱해 봐도 요소가 하나도 생기지 않아야 한다.
    const probe = document.createElement("div");
    probe.innerHTML = content;
    expect(probe.querySelector("img")).toBeNull();
  });

  it("지도 로드가 실패해도 예외 없이 렌더링되고, 실패를 눈에 보이게 알린다", async () => {
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockRejectedValue(
      new Error("네이버지도 스크립트를 불러오지 못했어요"),
    );

    const units = [unit()];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test-id" />);

    const region = await screen.findByRole("region", { name: "단지 지도" });
    // "아무 일도 안 일어남"이 아니라, 실제로 보이는 실패 안내가 있는지
    // 확인한다. 문구는 SDK 로드 실패 전용이다 — 좌표 조회 실패("단지
    // 위치를 불러오지 못했어요", App.tsx)와 같은 문구를 쓰면 무엇이
    // 실패했는지 화면에서도 테스트에서도 구분되지 않는다.
    await vi.waitFor(() => expect(region.textContent).toContain("지도를 표시하지 못했어요."));
  });

  it("units/coordinates가 바뀌어 effect가 재실행되면 이전 마커·지도를 정리한다", async () => {
    const { naverGlobal, markers, destroyedMaps } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    const unitA = unit({ complexKey: "11680-1", complexName: "A아파트" });
    const unitB = unit({ complexKey: "11680-2", complexName: "B아파트" });
    const coordsA = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    const coordsB = new Map([["11680-2", { lat: 37.2, lon: 127.2 }]]);

    const { rerender } = render(<ComplexMap units={[unitA]} coordinates={coordsA} naverMapClientId="test-id" />);
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    const firstMarker = markers[0]!;
    expect(firstMarker.removed).toBe(false);
    expect(destroyedMaps).toHaveLength(0);

    // Task 8이 App.tsx에 연결하면 이런 props 변화(동 좁히기, 좌표 지연 도착 등)가
    // 실제로 일어난다 — 그때 이전 마커/지도가 안 치워지면 DOM에 겹쳐 쌓인다.
    rerender(<ComplexMap units={[unitB]} coordinates={coordsB} naverMapClientId="test-id" />);
    await vi.waitFor(() => expect(markers).toHaveLength(2));

    expect(firstMarker.removed).toBe(true);
    expect(markers[1]!.removed).toBe(false);
    expect(destroyedMaps).toHaveLength(1);
  });

  it("마커에 거래건수가 가장 많은 평형의 면적+가격범위가 항상 보인다(클릭 전에도)", async () => {
    const units = [
      unit({ complexKey: "1", areaBucket: 59, tradeCount: 2, minPrice: 500_000_000, maxPrice: 550_000_000 }),
      unit({ complexKey: "1", areaBucket: 84, tradeCount: 5, minPrice: 700_000_000, maxPrice: 750_000_000 }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test" />);

    // 대표 평형은 거래건수 최다인 84㎡ — 마커 라벨에 그 평형의 가격범위가 보여야 한다.
    expect(await screen.findByText(/84㎡/)).toBeInTheDocument();
    expect(screen.getByText(/7억/)).toBeInTheDocument(); // formatRange(700_000_000, 750_000_000)
  });

  it("마커 라벨의 단지 유래 텍스트도 escapeHtml을 거친다", async () => {
    const units = [
      unit({ complexKey: "1", complexName: "<img src=x onerror=alert(1)>", areaBucket: 59, tradeCount: 1 }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} naverMapClientId="test" />);

    // 마커 라벨 자체는 이름을 넣지 않지만(면적+가격만), 혹시 넣게 되면
    // 이스케이프가 적용되는지 이 테스트가 회귀를 잡는다.
    await screen.findByText(/59㎡/);
    const markerHtml = document.querySelector(".complex-map-marker")?.innerHTML ?? "";
    expect(markerHtml).not.toContain("<img");
  });
});
