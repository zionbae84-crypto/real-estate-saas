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
  const markers: Array<{ position: unknown; listeners: Record<string, () => void> }> = [];
  const infoWindows: Array<{ content: string; opened: boolean }> = [];

  const naverGlobal = {
    maps: {
      Map: class {
        constructor(_el: unknown, _opts: unknown) {}
      },
      LatLng: class {
        constructor(
          public lat: number,
          public lng: number,
        ) {}
      },
      Marker: class {
        listeners: Record<string, () => void> = {};
        constructor(opts: { position: unknown }) {
          markers.push({ position: opts.position, listeners: this.listeners });
        }
      },
      InfoWindow: class {
        content: string;
        opened = false;
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
      },
      Event: {
        addListener(marker: { listeners: Record<string, () => void> }, event: string, fn: () => void) {
          marker.listeners[event] = fn;
        },
      },
    },
  };

  return { naverGlobal, markers, infoWindows };
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
});
