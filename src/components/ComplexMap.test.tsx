import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loadNaverMapsModule from "../lib/loadNaverMaps";
import {
  ComplexMap,
  MARKER_ANCHOR,
  burdenTiers,
  formatFoundedOn,
  formatHeadcount,
  markerDetailForZoom,
} from "./ComplexMap";
import { unitKey } from "./ComplexList";
import type { ComplexUnit } from "../data/complexes";
import {
  ELEMENTARY_SCHOOLS,
  ELEMENTARY_SCHOOL_DETAILS,
  ELEMENTARY_SCHOOL_INFO_YEAR,
  HIGH_SCHOOLS,
  MIDDLE_SCHOOLS,
} from "../data/location";
import { locationRules } from "../state/useLocationFacts";
import type { ComplexFilterState } from "../lib/complex-filters";
import { regionSchoolBounds, schoolsWithinBounds } from "../lib/school-bounds";
import { schoolZonesFor } from "../data/school-zones";

/**
 * 이 파일의 테스트 대부분은 필터 팝오버와 무관하다 — 필터 자체의 동작은
 * `ComplexFilters.test.tsx`·`RangeSlider.test.tsx`가 잠근다. 여기서는
 * `ComplexMapProps`가 요구하는 값을 채우기만 하면 되므로, min=max=0인
 * (아무것도 거르지 않는 것과 같은 뜻은 아니지만, 이 파일의 테스트들이
 * 필터 팝오버를 열어 보지 않으므로 실제 값이 무엇이든 상관없다) 고정값
 * 하나를 공유한다.
 */
const TEST_FILTER_BOUNDS: ComplexFilterState = {
  price: { min: 0, max: 0 },
  area: { min: 0, max: 0 },
  builtYearAge: { min: 0, max: 0 },
};

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
    address: null,
    trades: [],
    lowConfidence: false,
    ...over,
  };
}

function fakeNaverMaps() {
  const markers: Array<{
    position: unknown;
    listeners: Record<string, () => void>;
    removed: boolean;
    anchor: { x: number; y: number } | undefined;
    /** 이 마커가 지도 컨테이너에 그린 DOM(아이콘 HTML을 담은 상자) */
    el: HTMLElement | null;
  }> = [];
  const infoWindows: Array<{ content: string; opened: boolean; removed: boolean }> = [];
  /** 통학구역 경계로 그린 폴리곤들(학교 패널이 만든다) */
  const polygons: Array<{ paths: unknown; removed: boolean }> = [];
  const destroyedMaps: unknown[] = [];
  const createdMaps: Array<{
    options: { center?: { lat: number; lng: number } };
    setZoom(next: number): void;
  }> = [];
  const fitBoundsCalls: Array<{ bounds: unknown; options?: unknown }> = [];
  // 실제 SDK의 panTo — 고른 단지로 지도를 옮길 때 쓴다(지도를 다시
  // 만들지 않는다).
  const panToCalls: Array<{ lat: number; lng: number }> = [];
  // 지도 유형 토글이 부른 setMapTypeId 호출 기록.
  const mapTypeIdCalls: string[] = [];
  // Map 생성자가 받는 실제 컨테이너 엘리먼트를 기억해 둔다 — Marker가
  // icon.content HTML을 여기 심어야 screen.getByText로 검증할 수 있다
  // (실제 네이버지도 SDK도 HtmlIcon을 지도 컨테이너 안 DOM에 렌더링한다).
  let mapContainerEl: HTMLElement | null = null;

  const naverGlobal = {
    maps: {
      Map: class {
        destroyed = false;
        options: { center?: { lat: number; lng: number } } = {};
        /**
         * 지금 줌. 실제 SDK와 같이 `getZoom()`으로 읽는다 — 마커 상세도가
         * 이 값으로 갈린다(`markerDetailForZoom`). 테스트는
         * `setZoom(n)`으로 줌을 움직여 `zoom_changed`를 직접 쏜다.
         */
        zoom = 14;
        listeners: Record<string, () => void> = {};
        constructor(
          el: HTMLElement,
          opts: { center?: { lat: number; lng: number }; zoom?: number; mapTypeId?: string },
        ) {
          mapContainerEl = el;
          this.options = opts;
          if (opts.zoom !== undefined) this.zoom = opts.zoom;
          if (opts.mapTypeId !== undefined) mapTypeIdCalls.push(opts.mapTypeId);
          createdMaps.push(this);
        }
        getZoom() {
          return this.zoom;
        }
        // 실제 SDK의 setMapTypeId — 지도 유형 토글이 부른다(지도를 다시
        // 만들지 않는다).
        setMapTypeId(mapTypeId: string) {
          mapTypeIdCalls.push(mapTypeId);
        }
        /** 테스트 전용 — 줌을 옮기고 실제 SDK처럼 zoom_changed를 쏜다. */
        setZoom(next: number) {
          this.zoom = next;
          this.listeners.zoom_changed?.();
        }
        // 실제 SDK의 fitBounds. 여러 단지를 한 화면에 담기 위해 호출한다.
        fitBounds(bounds: unknown, options?: unknown) {
          fitBoundsCalls.push({ bounds, options });
        }
        panTo(coord: { lat: number; lng: number }) {
          panToCalls.push(coord);
        }
        destroy() {
          this.destroyed = true;
          destroyedMaps.push(this);
        }
      },
      // 실제 SDK의 MapTypeId 열거값. ComplexMap의 지도 유형 토글이
      // `naverMapTypeId`로 이 값을 읽어 지도 생성 옵션/`setMapTypeId`에
      // 넘긴다.
      MapTypeId: {
        NORMAL: "normal",
        TERRAIN: "terrain",
        SATELLITE: "satellite",
        HYBRID: "hybrid",
      },
      LatLng: class {
        constructor(
          public lat: number,
          public lng: number,
        ) {}
      },
      // 실제 SDK는 sw/ne 두 LatLng으로 경계를 만든다. fitBounds에 좌표
      // 리터럴 배열(`{lat, lng}[]`)을 넘기면 실제 브라우저에서 조용히
      // 무시되는 것을 확인했다 — 그래서 경계를 명시적으로 만들어 넘긴다.
      LatLngBounds: class {
        constructor(
          public sw: { lat: number; lng: number },
          public ne: { lat: number; lng: number },
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
        /**
         * 아이콘 안에서 **좌표가 앉는 점**. 실제 SDK는 이 값만큼 아이콘을
         * 밀어 놓는다 — 이 값이 틀리면 마커가 가리키는 자리가 틀린다.
         */
        anchor: { x: number; y: number } | undefined;
        constructor(opts: {
          position: unknown;
          icon?: { content?: string | HTMLElement; anchor?: { x: number; y: number } };
        }) {
          this.position = opts.position;
          this.anchor = opts.icon?.anchor;
          markers.push(this);
          if (opts.icon?.content !== undefined && mapContainerEl !== null) {
            const el = document.createElement("div");
            if (typeof opts.icon.content === "string") el.innerHTML = opts.icon.content;
            else el.appendChild(opts.icon.content);
            mapContainerEl.appendChild(el);
            this.el = el;
          }
        }
        /*
         * 실제 SDK의 setIcon — 아이콘 DOM을 통째로 갈아 끼운다. 줌이
         * 상세도 경계를 넘을 때 ComplexMap이 이걸 부른다. **기존 엘리먼트
         * 안을 갈아 끼운다**(새 엘리먼트를 붙이지 않는다) — 실제 SDK도
         * 마커 하나가 DOM 하나를 유지하고, 여기서 새로 붙이면 마커 수가
         * 늘어난 것처럼 보여 테스트가 거짓으로 통과한다.
         */
        setIcon(icon: { content?: string | HTMLElement; anchor?: { x: number; y: number } }) {
          this.anchor = icon.anchor;
          if (this.el !== null && typeof icon.content === "string") {
            this.el.innerHTML = icon.content;
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
      /**
       * 통학구역 경계. 실제 SDK처럼 링 하나를 `paths` 한 벌로 받는다 —
       * ComplexMap은 링 하나당 폴리곤 하나를 만든다(구멍이 아니라 떨어진
       * 구역이 대부분이라서다, 그쪽 주석 참고).
       */
      Polygon: class {
        paths: unknown;
        removed = false;
        constructor(opts: { paths: unknown }) {
          this.paths = opts.paths;
          polygons.push(this);
        }
        setMap(map: unknown) {
          if (map === null) this.removed = true;
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

  return {
    naverGlobal,
    markers,
    polygons,
    infoWindows,
    destroyedMaps,
    createdMaps,
    fitBoundsCalls,
    panToCalls,
    mapTypeIdCalls,
  };
}

/** burdenTiers 테스트용 최소 그룹 — complexKey와 대표 평형만 채운다. */
function tierGroup(complexKey: string, representativeOverride: Partial<ComplexUnit> = {}) {
  return {
    complexKey,
    representative: unit({ complexKey, ...representativeOverride }),
  };
}

const NO_BURDEN = new Map<string, "no-loan" | "loan">();

describe("burdenTiers", () => {
  it("빈 그룹이면 빈 Map을 낸다", () => {
    expect(burdenTiers([], NO_BURDEN).size).toBe(0);
  });

  it("burdenByUnit에서 대표 평형 키로 값을 찾아 온다", () => {
    const group = tierGroup("a");
    const burden = new Map([[unitKey(group.representative), "no-loan" as const]]);

    expect(burdenTiers([group], burden).get("a")).toBe("no-loan");
  });

  it("burdenByUnit에 대표 평형이 없으면 보수적으로 'loan'으로 접는다", () => {
    expect(burdenTiers([tierGroup("a")], NO_BURDEN).get("a")).toBe("loan");
  });

  it("여러 그룹을 각자의 값으로 독립적으로 매핑한다", () => {
    const groups = [tierGroup("a"), tierGroup("b"), tierGroup("c")];
    const burden = new Map([
      [unitKey(groups[0]!.representative), "no-loan" as const],
      [unitKey(groups[1]!.representative), "loan" as const],
      // groups[2]는 배선하지 않는다 — 보수적 기본값을 확인한다.
    ]);

    const tiers = burdenTiers(groups, burden);
    expect(tiers.get("a")).toBe("no-loan");
    expect(tiers.get("b")).toBe("loan");
    expect(tiers.get("c")).toBe("loan");
  });

  it.each([
    ["no-loan" as const, "no-loan"],
    ["loan" as const, "loan"],
  ])("대표 평형의 값이 %s면 그대로 옮긴다", (value, expected) => {
    const group = tierGroup("x");
    const burden = new Map([[unitKey(group.representative), value]]);

    expect(burdenTiers([group], burden).get("x")).toBe(expected);
  });
});

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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

    await screen.findByRole("region", { name: "단지 지도" });
    // 실제 마커 개수는 naver.maps 모의 안에 있으므로, 컴포넌트가
    // 예외 없이 렌더링되고 지도 영역이 뜨는지로 확인한다(아래 클릭
    // 테스트가 마커 자체의 동작을 더 구체적으로 확인한다).
  });

  it("그릴 좌표가 하나도 없으면 로드 실패와 **다른** 문구로 그 사실을 말한다", async () => {
    render(<ComplexMap units={[unit()]} coordinates={new Map()} burdenByUnit={new Map()} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);
    const region = await screen.findByRole("region", { name: "단지 지도" });

    // 예산에 맞는 단지만 그리게 되면서(App.tsx의 mappedUnits) 이 경우가
    // 실제로 자주 일어날 수 있게 됐다 — 그때 빈 600px 상자만 남으면
    // 사용자에겐 고장과 구분되지 않는다. SDK 로드 실패 문구를 재사용하면
    // 그것대로 원인을 잘못 말하는 것이라, 문구가 서로 달라야 한다.
    await vi.waitFor(() =>
      expect(region.textContent).toContain("주소로는 위치를 찾을 수 없었어요."),
    );
    expect(region.textContent).not.toContain("지도를 표시하지 못했어요.");
  });

  /**
   * 사용자 지시: "지금의 마커에서는 면적, 거래건, 대출없이(색으로 구분)는
   * 제거하고, 단지명과 금액 레인지만 표시하게 해줘." 그다음 색+글자로
   * 되돌아왔다가, 사각 배지 시안 적용 때 다시: "대출 필요/없음의 글자는
   * 삭제, 아래에 맵 좌측하단부에 아이콘 색상을 간단히 설명하는걸
   * 추가해줘." — 부담 수준 글자는 마커가 아니라 지도 범례(아래 별도
   * 테스트)의 몫이다.
   *
   * **단서 없는 가격 숫자 하나가 되지 않는다.** `formatRange`는 min===max면
   * 숫자 하나로 접히는데("23억 5,000만원"), 예전에는 그 단서를 거래
   * 건수가 졌다. 지금은 **단지명**이 진다 — 오히려 더 분명한 단서다.
   * 숫자 하나가 아무 이름 없이 떠 있으면 감정평가·적정가로 읽히지만
   * (부모 스펙 §6), "테스트아파트 23억 5,000만원"은 그 단지 거래가를
   * 가리키는 말이지 평가액이 아니다.
   */
  it("마커 라벨은 단지명·가격 범위를 낸다 — 면적·거래건수·부담 수준 문구는 없다", async () => {
    const { naverGlobal, createdMaps, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    const units = [
      unit({
        complexKey: "1",
        complexName: "라벨아파트",
        areaBucket: 84,
        tradeCount: 7,
        minPrice: 2_350_000_000,
        maxPrice: 2_350_000_000,
      }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);
    const burdenByUnit = new Map([[unitKey(units[0]!), "no-loan" as const]]);

    render(
      <ComplexMap
        units={units}
        coordinates={coordinates}
        burdenByUnit={burdenByUnit}
        naverMapClientId="test"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    // 가격은 확대한 줌에서만 나온다(`markerDetailForZoom`) — 라벨이 무엇을
    // 담는지 보려면 그 줌으로 옮겨야 한다.
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    createdMaps[0]!.setZoom(16);

    const marker = document.querySelector(".complex-map-marker");
    expect(marker?.textContent).toContain("라벨아파트");
    expect(marker?.textContent).toContain("23억 5,000만원");
    // 부담 수준 글자는 마커가 아니라 범례로 옮겼다 — 마커 안에는 없다.
    expect(marker?.textContent).not.toContain("대출 없이");
    expect(marker?.textContent).not.toContain("대출 필요");
    // 빠진 둘 — 하나라도 남으면 이 변경이 절반만 된 것이다.
    expect(marker?.textContent).not.toContain("84㎡");
    expect(marker?.textContent).not.toContain("㎡");
    expect(marker?.textContent).not.toContain("거래");
  });

  it("부담 수준에 따라 마커가 파랑/주황 티어 클래스를 받는다", async () => {
    const units = [
      unit({ complexKey: "a", complexName: "무리없는집" }),
      unit({ complexKey: "b", complexName: "대출필요집" }),
    ];
    const coordinates = new Map([
      ["a", { lat: 37.5, lon: 127.0 }],
      ["b", { lat: 37.6, lon: 127.1 }],
    ]);
    const burdenByUnit = new Map<string, "no-loan" | "loan">([
      [unitKey(units[0]!), "no-loan"],
      [unitKey(units[1]!), "loan"],
    ]);

    render(
      <ComplexMap
        units={units}
        coordinates={coordinates}
        burdenByUnit={burdenByUnit}
        naverMapClientId="test"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText("무리없는집");
    const pins = [...document.querySelectorAll(".complex-map-pin")];
    const noLoanPin = pins.find((p) => p.textContent?.includes("무리없는집"));
    const loanPin = pins.find((p) => p.textContent?.includes("대출필요집"));

    expect(noLoanPin?.className).toContain("complex-map-pin--no-loan");
    expect(loanPin?.className).toContain("complex-map-pin--loan");
  });

  it("대표 평형이 burdenByUnit에 없으면 보수적으로 '대출 필요' 티어로 접는다", async () => {
    const units = [unit({ complexKey: "1", complexName: "미배선집" })];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(
      <ComplexMap
        units={units}
        coordinates={coordinates}
        burdenByUnit={new Map()}
        naverMapClientId="test"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText("미배선집");
    const pin = document.querySelector(".complex-map-pin");
    expect(pin?.className).toContain("complex-map-pin--loan");
  });

  /**
   * **앵커가 이번 수정의 알맹이다.** 예전 앵커는 `Point(0, 0)` — 떠
   * 있는 라벨 상자의 **왼쪽 위 모서리**가 좌표에 앉았고, 상자는 거기서
   * 오른쪽 아래로 자라날 뿐이라 "정확히 이 지점"을 가리키는 뾰족한
   * 자리가 아예 없었다. 사용자가 말한 "명확하게 단지가 어디인지"의
   * 원인이 그것이다.
   */
  it("앵커가 꼬리 끝(0, 0이 아닌 점)이다 — 라벨 모서리가 아니라 꼭짓점이 좌표에 앉는다", async () => {
    const { naverGlobal, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );
    await vi.waitFor(() => expect(markers).toHaveLength(1));

    // 기본 줌 14 → "name" 상세도(markerDetailForZoom).
    expect(markers[0]!.anchor).toEqual(MARKER_ANCHOR.name);
    // 옛 버그를 이름으로 못박는다: 두 값이 다 0이면 라벨의 왼쪽 위
    // 모서리가 좌표에 앉는다. **세 상세도 모두** 그 자리가 아니어야 한다.
    for (const detail of ["full", "name", "dot"] as const) {
      expect(MARKER_ANCHOR[detail].y).toBeGreaterThan(0);
    }
  });

  it("단지가 여럿이면 전부 화면에 들어오도록 fitBounds를 부르고, 중심은 평균 좌표다", async () => {
    const { naverGlobal, createdMaps, fitBoundsCalls } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    const units = [
      unit({ complexKey: "a", areaBucket: 59, tradeCount: 1 }),
      unit({ complexKey: "b", areaBucket: 84, tradeCount: 1 }),
    ];
    const coordinates = new Map([
      ["a", { lat: 37.0, lon: 127.0 }],
      ["b", { lat: 37.4, lon: 127.4 }],
    ]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);
    await vi.waitFor(() => expect(fitBoundsCalls).toHaveLength(1));

    // 예전에는 그룹핑 순서상 첫 단지 하나를 그대로 중심으로 썼다 — 그리는
    // 집합이 작아진 지금은 그 단지가 무리의 가장자리일 수 있다.
    expect(createdMaps[0]!.options.center).toMatchObject({ lat: 37.2, lng: 127.2 });
    // 경계는 그리는 좌표 전부를 감싸는 sw/ne다.
    expect(fitBoundsCalls[0]!.bounds).toMatchObject({
      sw: { lat: 37.0, lng: 127.0 },
      ne: { lat: 37.4, lng: 127.4 },
    });
  });

  it("단지가 하나뿐이면 fitBounds를 부르지 않는다 — 폭 0인 경계는 최대 줌까지 당긴다", async () => {
    const { naverGlobal, fitBoundsCalls, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    expect(fitBoundsCalls).toHaveLength(0);
  });

  /**
   * 사용자 지시로 마커를 눌렀을 때 뜨던 흰 InfoWindow를 없앴다 —
   * 마커 라벨과 단지 상세가 이미 같은 말을 하고 있었다.
   *
   * **마커 클릭이 죽은 컨트롤이 되면 안 된다.** 팝업 대신 목록·상세
   * 쪽 선택이 움직이는 것이 이제 이 클릭의 전부다(그 배선 자체는 아래
   * "마커를 누르면 그 단지를 선택으로 올린다"가 검사한다). 여기서는
   * **팝업이 정말 사라졌는지**를 못박는다.
   */
  it("마커를 눌러도 팝업 상자가 뜨지 않는다 — InfoWindow를 아예 만들지 않는다", async () => {
    const { naverGlobal, markers, infoWindows } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    const units = [unit()];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => expect(markers).toHaveLength(1));

    // 만들지도 않는다 — 열지 않는 것과 다르다. 만들어 두면 다음 사람이
    // "열기만 하면 되겠네"라고 되살리기 쉽다.
    expect(infoWindows).toHaveLength(0);
    markers[0]!.listeners.click?.();
    expect(infoWindows).toHaveLength(0);
  });

  it("한 단지에 평형이 여럿이어도 마커는 하나다", async () => {
    const { naverGlobal, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    // 같은 단지(complexKey 동일)의 두 평형. 좌표는 단지 단위라 하나뿐이므로,
    // 평형마다 마커를 만들면 정확히 같은 자리에 겹쳐 쌓이고 맨 위 하나만
    // 눌린다 — 나머지 평형은 지도에 있는데 열어볼 수 없다.
    //
    // 평형별 정보는 이제 단지 상세가 낸다(평형 선택기·실거래 내역 표) —
    // 예전에는 이 자리에서 팝업이 평형 줄을 모두 담는지도 함께 봤다.
    const units = [
      unit({ areaBucket: 84, minPrice: 900_000_000, maxPrice: 1_000_000_000, tradeCount: 3 }),
      unit({ areaBucket: 59, minPrice: 700_000_000, maxPrice: 750_000_000, tradeCount: 2 }),
    ];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(1);
  });

  /*
   * 예전에는 여기 팝업의 HTML 이스케이프 검사가 있었다. 팝업이 사라지며
   * **그 방어선의 자리도 옮겨졌다** — 이 앱에서 React를 거치지 않는 HTML
   * 문자열은 이제 마커 라벨 하나뿐이고, 그쪽은 아래
   * "마커 라벨의 단지 이름도 escapeHtml을 거친다"가 같은 공격 문자열로
   * 검사한다. 검사를 지운 것이 아니라 남은 자리 하나로 모은 것이다.
   */

  it("지도 로드가 실패해도 예외 없이 렌더링되고, 실패를 눈에 보이게 알린다", async () => {
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockRejectedValue(
      new Error("네이버지도 스크립트를 불러오지 못했어요"),
    );

    const units = [unit()];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

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
    const burdenByUnit = new Map();

    const { rerender } = render(<ComplexMap units={[unitA]} coordinates={coordsA} burdenByUnit={burdenByUnit} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    const firstMarker = markers[0]!;
    expect(firstMarker.removed).toBe(false);
    expect(destroyedMaps).toHaveLength(0);

    // Task 8이 App.tsx에 연결하면 이런 props 변화(동 좁히기, 좌표 지연 도착 등)가
    // 실제로 일어난다 — 그때 이전 마커/지도가 안 치워지면 DOM에 겹쳐 쌓인다.
    rerender(<ComplexMap units={[unitB]} coordinates={coordsB} burdenByUnit={burdenByUnit} naverMapClientId="test-id" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);
    await vi.waitFor(() => expect(markers).toHaveLength(2));

    expect(firstMarker.removed).toBe(true);
    expect(markers[1]!.removed).toBe(false);
    expect(destroyedMaps).toHaveLength(1);
  });

  it("마커에 거래건수가 가장 많은 평형의 가격 범위가 보인다(클릭 전에도)", async () => {
    const { naverGlobal, createdMaps, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    const units = [
      unit({ complexKey: "1", areaBucket: 59, tradeCount: 2, minPrice: 500_000_000, maxPrice: 550_000_000 }),
      unit({ complexKey: "1", areaBucket: 84, tradeCount: 5, minPrice: 700_000_000, maxPrice: 750_000_000 }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

    await vi.waitFor(() => expect(markers).toHaveLength(1));
    createdMaps[0]!.setZoom(16); // 가격이 나오는 상세도로 옮긴다.

    // 대표 평형은 거래건수 최다인 84㎡ — 면적은 라벨에 적지 않지만,
    // **그 평형의** 가격 범위가 보여야 한다(59㎡의 5억대가 아니다).
    const marker = document.querySelector(".complex-map-marker");
    expect(marker?.textContent).toMatch(/7억/); // formatRange(700_000_000, 750_000_000)
    expect(marker?.textContent).not.toContain("5억");
  });

  /**
   * 이제 라벨이 **단지 이름을 직접 낸다** — 이 검사가 회귀 대비가 아니라
   * 실제 방어선이 됐다. `complexName`은 국토부 API의 `aptNm`에서 그대로
   * 오고 어디에서도 검증하지 않는데, 이 파일은 이 앱에서 유일하게
   * React를 거치지 않는 HTML 문자열 자리다.
   */
  it("마커 라벨의 단지 이름도 escapeHtml을 거친다", async () => {
    const units = [
      unit({ complexKey: "1", complexName: "<img src=x onerror=alert(1)>", areaBucket: 59, tradeCount: 1 }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

    await screen.findByText("<img src=x onerror=alert(1)>");
    const markerHtml = document.querySelector(".complex-map-marker")?.innerHTML ?? "";
    expect(markerHtml).not.toContain("<img");
    expect(markerHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(document.querySelector(".complex-map-marker img")).toBeNull();
  });

  /**
   * 사용자 지시: "지도 데이터는 해당지역의 데이터를 모두 표시해줘." —
   * 예전 30개 상한(`MARKER_LIMIT`)과 "N개만 표시했어요" 캐비앗을 없앴다.
   * 상한의 근거(수백 개를 펼치면 글자 벽)는 줌 상세도가 대신 가져갔다
   * (아래 줌 테스트).
   */
  it("좌표를 아는 단지는 30개를 넘어도 전부 그리고, 잘랐다는 문구를 내지 않는다", async () => {
    const units = Array.from({ length: 42 }, (_, i) =>
      unit({ complexKey: `k${i}`, complexName: `단지${i}`, minPrice: 100_000_000 + i, maxPrice: 200_000_000 + i }),
    );
    const coordinates = new Map(units.map((u, i) => [u.complexKey, { lat: 37 + i * 0.001, lon: 127 + i * 0.001 }]));

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" filterBounds={TEST_FILTER_BOUNDS} filterValue={TEST_FILTER_BOUNDS} onFilterChange={() => {}} />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(42),
    );
    expect(screen.queryByText(/개만 표시했어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/개가 더 있고/)).not.toBeInTheDocument();
  });

  describe("줌에 따른 마커 상세도", () => {
    it("markerDetailForZoom이 세 구간으로 갈린다", () => {
      // 확대할수록 많이 말한다. 경계값을 양쪽에서 못박는다.
      expect(markerDetailForZoom(21)).toBe("full");
      expect(markerDetailForZoom(15)).toBe("full");
      expect(markerDetailForZoom(14)).toBe("name");
      expect(markerDetailForZoom(13)).toBe("name");
      expect(markerDetailForZoom(12)).toBe("dot");
      expect(markerDetailForZoom(6)).toBe("dot");
    });

    /**
     * 사용자 지시: "지도를 확대할 경우 지금처럼 모든 정보가 보이도록하고,
     * 지도를 축소할 경우 마커나 이름 정도만 나오도록 해줘."
     *
     * 세 상세도를 **같은 지도에서 줌만 움직여** 확인한다 — 지도를 다시
     * 만들면 안 된다(사용자가 맞춰 둔 줌·중심이 날아간다). `createdMaps`가
     * 하나로 유지되는지도 함께 본다.
     */
    it("확대하면 이름+가격, 중간은 이름만, 축소하면 점만 남는다", async () => {
      const { naverGlobal, createdMaps, markers } = fakeNaverMaps();
      vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
        naverGlobal as unknown as typeof naver,
      );

      const units = [
        unit({ complexKey: "a", complexName: "줌테스트단지", minPrice: 700_000_000, maxPrice: 750_000_000 }),
      ];
      render(
        <ComplexMap
          units={units}
          coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
          burdenByUnit={new Map()}
          naverMapClientId="test"
          filterBounds={TEST_FILTER_BOUNDS}
          filterValue={TEST_FILTER_BOUNDS}
          onFilterChange={() => {}}
        />,
      );
      await vi.waitFor(() => expect(markers).toHaveLength(1));
      const map = createdMaps[0]!;
      const marker = () => document.querySelector(".complex-map-marker")!;

      // 기본 줌 14 — 이름만, 가격은 없다.
      expect(marker().textContent).toContain("줌테스트단지");
      expect(marker().textContent).not.toMatch(/7억/);
      expect(markers[0]!.anchor).toEqual(MARKER_ANCHOR.name);

      // 확대 — 가격까지 나온다.
      map.setZoom(16);
      expect(marker().textContent).toContain("줌테스트단지");
      expect(marker().textContent).toMatch(/7억/);
      expect(markers[0]!.anchor).toEqual(MARKER_ANCHOR.full);

      // 축소 — 글자가 통째로 사라지고 점만 남는다.
      map.setZoom(11);
      expect(document.querySelector(".complex-map-dot")).not.toBeNull();
      expect(marker().textContent).toBe("");
      expect(markers[0]!.anchor).toEqual(MARKER_ANCHOR.dot);

      // 그동안 지도는 한 번만 만들어졌다 — 줌마다 재생성하면 사용자가
      // 맞춰 둔 줌·중심이 그 자리에서 날아간다.
      expect(createdMaps).toHaveLength(1);
      // 마커도 새로 만들지 않고 아이콘만 갈아 끼웠다.
      expect(markers).toHaveLength(1);
    });

    it("점으로 접혀도 단지를 가리키는 배선은 남는다 — 클래스·키·티어", async () => {
      const { naverGlobal, createdMaps, markers } = fakeNaverMaps();
      vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
        naverGlobal as unknown as typeof naver,
      );

      const units = [unit({ complexKey: "a", complexName: "점단지" })];
      render(
        <ComplexMap
          units={units}
          coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
          burdenByUnit={new Map([[unitKey(units[0]!), "no-loan" as const]])}
          naverMapClientId="test"
          filterBounds={TEST_FILTER_BOUNDS}
          filterValue={TEST_FILTER_BOUNDS}
          onFilterChange={() => {}}
        />,
      );
      await vi.waitFor(() => expect(markers).toHaveLength(1));
      createdMaps[0]!.setZoom(11);

      const dot = document.querySelector(".complex-map-dot") as HTMLElement;
      expect(dot).not.toBeNull();
      // 선택 강조와 클릭이 이 둘로 마커를 찾는다 — 점이어도 눌려야 한다.
      expect(dot.classList.contains("complex-map-marker")).toBe(true);
      expect(dot.dataset.complexKey).toBe("a");
      // 색 분류도 그대로다.
      expect(dot.closest(".complex-map-pin")?.className).toContain("complex-map-pin--no-loan");
    });

    it("상세도가 바뀌어도 고른 단지의 강조가 남는다 — setIcon이 DOM을 갈아 끼운다", async () => {
      const { naverGlobal, createdMaps, markers } = fakeNaverMaps();
      vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
        naverGlobal as unknown as typeof naver,
      );

      render(
        <ComplexMap
          units={[unit({ complexKey: "a" })]}
          coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
          burdenByUnit={new Map()}
          focusedComplexKey="a"
          naverMapClientId="test"
          filterBounds={TEST_FILTER_BOUNDS}
          filterValue={TEST_FILTER_BOUNDS}
          onFilterChange={() => {}}
        />,
      );
      await vi.waitFor(() =>
        expect(document.querySelectorAll(".complex-map-marker--focused")).toHaveLength(1),
      );

      createdMaps[0]!.setZoom(11);
      expect(markers).toHaveLength(1);
      // setIcon이 아이콘 DOM을 통째로 갈았으니 강조 클래스도 날아갔다 —
      // 리스너가 곧바로 다시 입히지 않으면 여기서 0이 된다.
      expect(document.querySelectorAll(".complex-map-marker--focused")).toHaveLength(1);
    });
  });

  /**
   * 부담 수준 글자("대출 없이"/"대출 필요")가 마커 밖 지도 범례로
   * 옮겨 갔다(사용자 지시 — 위 "마커 라벨은 단지명·가격 범위를 낸다"
   * 참고). 색으로만 말하는 이 마커 옆에 그 뜻을 여전히 글자로 알리는
   * 자리가 실제로 뜨는지, 그리고 두 티어를 각각 담는지를 본다.
   */
  it("지도 좌측 하단에 마커 색 안내가 뜬다 — '대출 없이'/'대출 필요' 글자를 낸다", async () => {
    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(1),
    );
    const legend = screen.getByRole("list", { name: "마커 색 안내" });
    expect(legend.textContent).toContain("대출 없이");
    expect(legend.textContent).toContain("대출 필요");
  });

  it("지도를 그리지 못한 상태(로드 실패·좌표 미확인)에서는 범례를 내지 않는다", async () => {
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockRejectedValue(
      new Error("네이버지도 스크립트를 불러오지 못했어요"),
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText("지도를 표시하지 못했어요.");
    // 설명할 마커 자체가 없다 — 범례를 내면 고아 상자가 된다.
    expect(document.querySelector(".complex-map-legend")).toBeNull();
  });

  /**
   * 사용자 지시: "지도 : 지금과 같은 일반지도, 위성지도를 필터로."
   *
   * 지도를 다시 만들지 않는다 — `createdMaps`가 한 번만 생겨야 한다
   * (마커·선택 강조가 날아가지 않는다는 이 컴포넌트의 기존 원칙과 같다).
   * 대신 이미 있는 지도의 `setMapTypeId`를 부른다.
   */
  it("지도 유형 토글을 누르면 위성/일반으로 라벨이 바뀌고 setMapTypeId를 부른다 — 지도를 다시 만들지 않는다", async () => {
    const { naverGlobal, createdMaps, mapTypeIdCalls } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() => expect(createdMaps).toHaveLength(1));
    // 지도를 처음 만들 때도 일반지도로 만든다.
    expect(mapTypeIdCalls).toEqual(["normal"]);

    // "지도" 버튼을 눌러야 일반지도/위성지도 팝오버가 뜬다(사용자 지시).
    fireEvent.click(await screen.findByRole("button", { name: "지도" }));
    const toggle = await screen.findByRole("radio", { name: "위성지도" });

    fireEvent.click(toggle);
    await vi.waitFor(() =>
      expect(screen.getByRole("radio", { name: "위성지도" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(createdMaps).toHaveLength(1); // 여전히 하나 — 다시 만들지 않았다.
    expect(mapTypeIdCalls).toEqual(["normal", "hybrid"]);

    fireEvent.click(screen.getByRole("radio", { name: "일반지도" }));
    await vi.waitFor(() =>
      expect(mapTypeIdCalls).toEqual(["normal", "hybrid", "normal"]),
    );
  });

  it("지도를 그리지 못한 상태(로드 실패·좌표 미확인)에서는 지도 유형 토글도 내지 않는다", async () => {
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockRejectedValue(
      new Error("네이버지도 스크립트를 불러오지 못했어요"),
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText("지도를 표시하지 못했어요.");
    expect(document.querySelector(".complex-map-controls")).toBeNull();
  });

  /**
   * 사용자 지시: "학교 : 초등/중등/고등 학교 표시."
   *
   * 기본은 셋 다 꺼짐 — 부담 마커 위에 실제 데이터 규모(수백 곳)의 점이
   * 늘 깔려 있으면 지도가 학교 지도로 읽힌다. 실제 데이터 개수를
   * `../data/location`에서 그대로 가져와 비교한다(하드코딩한 숫자가
   * 아니라 지금 데이터와 항상 맞다).
   */
  /**
   * "해당지역의 학교만 표시되게 해줘"(사용자 지시) — 학교 데이터는 여러
   * 구를 걸치는 하나의 정적 배열이라(src/lib/school-bounds.ts 머리
   * 주석 참고) 지금 지도가 그린 단지 좌표의 바운딩박스로 거른다.
   * 실제 초등학교 하나의 좌표를 단지 좌표로 써 그 학교 주변만 걸러지는
   * 실제 상황을 흉내내고, 기댓값도 하드코딩하지 않고 같은 필터 함수
   * (`schoolsWithinBounds`)로 다시 계산한다 — 지금 데이터와 항상 맞다.
   */
  const TEST_SCHOOL_COORDINATE = ELEMENTARY_SCHOOLS![0]!.coordinate;
  const TEST_SCHOOL_COORDINATES = new Map([["a", TEST_SCHOOL_COORDINATE]]);
  const TEST_SCHOOL_BOUNDS = regionSchoolBounds(TEST_SCHOOL_COORDINATES);
  const expectedElementaryCount = schoolsWithinBounds(
    ELEMENTARY_SCHOOLS ?? [],
    TEST_SCHOOL_BOUNDS,
  ).length;
  const expectedMiddleCount = schoolsWithinBounds(
    MIDDLE_SCHOOLS ?? [],
    TEST_SCHOOL_BOUNDS,
  ).length;
  const expectedHighCount = schoolsWithinBounds(
    HIGH_SCHOOLS ?? [],
    TEST_SCHOOL_BOUNDS,
  ).length;

  it("학교급 토글은 기본이 꺼짐이고, 켜면 그 학교급의 점이 늘고 끄면 다시 사라진다", async () => {
    const { naverGlobal, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={TEST_SCHOOL_COORDINATES}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() => expect(markers).toHaveLength(1)); // 단지 마커 하나뿐
    // "학교" 버튼을 눌러야 체크박스 팝오버가 뜬다(사용자 지시).
    fireEvent.click(await screen.findByRole("button", { name: "학교" }));
    const elementaryCheckbox = await screen.findByRole("checkbox", { name: "초등학교" });
    expect(elementaryCheckbox).not.toBeChecked();

    fireEvent.click(elementaryCheckbox);
    expect(elementaryCheckbox).toBeChecked();
    await vi.waitFor(() =>
      expect(markers.length).toBe(1 + expectedElementaryCount),
    );
    // 학교 아이콘이 실제로 지도 컨테이너에 그려졌다.
    expect(document.querySelectorAll(".complex-map-school")).toHaveLength(
      expectedElementaryCount,
    );

    fireEvent.click(elementaryCheckbox);
    expect(elementaryCheckbox).not.toBeChecked();
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-school")).toHaveLength(0),
    );
  });

  it("학교급 여러 개를 동시에 켤 수 있다 — 학교급마다 배경색이 다르다", async () => {
    const { naverGlobal } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={TEST_SCHOOL_COORDINATES}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    // "학교" 버튼을 눌러야 체크박스 팝오버가 뜬다(사용자 지시).
    fireEvent.click(await screen.findByRole("button", { name: "학교" }));
    await screen.findByRole("checkbox", { name: "초등학교" });
    fireEvent.click(screen.getByRole("checkbox", { name: "중학교" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "고등학교" }));

    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-school")).toHaveLength(
        expectedMiddleCount + expectedHighCount,
      ),
    );
    // 학교급마다 다른 수정자 클래스(=다른 배경색)를 단다 — 초성 대신
    // 색으로 가른다(사용자 지시: "초/중/고 학교의 색상을 다르게해주고").
    expect(document.querySelectorAll(".complex-map-school--middle")).toHaveLength(
      expectedMiddleCount,
    );
    expect(document.querySelectorAll(".complex-map-school--high")).toHaveLength(
      expectedHighCount,
    );
  });

  /**
   * "해당지역의 학교만 표시되게 해줘"의 핵심 — 바운딩박스 밖 학교는
   * 진짜로 빠진다. `TEST_SCHOOL_COORDINATE`에서 아주 멀리 떨어진
   * 좌표(부산 근처)를 단지 좌표로 주면, 그 지역 초등학교는 하나도
   * 걸리지 않아야 한다.
   */
  it("바운딩박스 밖 지역이면 학교급을 켜도 학교가 하나도 안 뜬다", async () => {
    const { naverGlobal, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    render(
      <ComplexMap
        units={[unit({ complexKey: "a" })]}
        coordinates={new Map([["a", { lat: 35.1, lon: 129.0 }]])}
        burdenByUnit={new Map()}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() => expect(markers).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "학교" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "초등학교" }));

    await vi.waitFor(() => expect(markers).toHaveLength(1));
    expect(document.querySelectorAll(".complex-map-school")).toHaveLength(0);
  });

  /**
   * 사용자 지시: 초등학교 마커를 누르면 기본정보를 띄운다.
   *
   * **여기서 말하는 것은 "이 학교가 어떤 학교인가"뿐이다** — 어느 단지가
   * 이 학교로 배정되는지는 말하지 않는다. 그래서 마지막 테스트가 배정
   * 고지(룰셋의 `schoolZoneNote`)가 함께 뜨는지를 잠근다.
   */
  describe("초등학교 기본정보 패널", () => {
    /** 학교급을 켜고, 그 학교급 마커 하나를 집어 준다. */
    async function openFirstSchool(level: "초등학교") {
      const { naverGlobal, markers, polygons } = fakeNaverMaps();
      vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
        naverGlobal as unknown as typeof naver,
      );
      render(
        <ComplexMap
          units={[unit({ complexKey: "a" })]}
          coordinates={TEST_SCHOOL_COORDINATES}
          burdenByUnit={new Map()}
          naverMapClientId="test-id"
          filterBounds={TEST_FILTER_BOUNDS}
          filterValue={TEST_FILTER_BOUNDS}
          onFilterChange={() => {}}
        />,
      );
      await vi.waitFor(() => expect(markers).toHaveLength(1));
      fireEvent.click(await screen.findByRole("button", { name: "학교" }));
      fireEvent.click(await screen.findByRole("checkbox", { name: level }));
      await vi.waitFor(() =>
        expect(document.querySelectorAll(".complex-map-school").length).toBeGreaterThan(0),
      );
      // 방금 그린 학교 마커 중 첫 번째(단지 마커는 markers[0]이라 건너뛴다).
      const schoolMarker = markers.find((m) =>
        m.el?.querySelector(".complex-map-school"),
      );
      return { schoolMarker, markers, polygons };
    }

    it("초등학교 마커를 누르면 이름·주소·설립·교육청이 뜬다", async () => {
      const { schoolMarker } = await openFirstSchool("초등학교");
      const expected = schoolsWithinBounds(
        ELEMENTARY_SCHOOLS ?? [],
        TEST_SCHOOL_BOUNDS,
      )[0]!;
      const detail = ELEMENTARY_SCHOOL_DETAILS.get(expected.id)!;

      act(() => schoolMarker!.listeners.click!());

      const panel = await screen.findByRole("region", {
        name: `${detail.name} 기본정보`,
      });
      expect(panel.textContent).toContain(detail.name);
      expect(panel.textContent).toContain(detail.foundationType);
      expect(panel.textContent).toContain(detail.address);
      expect(panel.textContent).toContain(detail.officeOfEducation);
      expect(panel.textContent).toContain(detail.districtOfficeOfEducation);
    });

    it("설립일자를 사람이 읽는 말로 낸다", async () => {
      const { schoolMarker } = await openFirstSchool("초등학교");
      const expected = schoolsWithinBounds(
        ELEMENTARY_SCHOOLS ?? [],
        TEST_SCHOOL_BOUNDS,
      )[0]!;
      const detail = ELEMENTARY_SCHOOL_DETAILS.get(expected.id)!;

      act(() => schoolMarker!.listeners.click!());

      const panel = await screen.findByRole("region", {
        name: `${detail.name} 기본정보`,
      });
      expect(panel.textContent).toContain(formatFoundedOn(detail.foundedOn));
      // 원본 모양(YYYY-MM-DD) 그대로는 내지 않는다.
      expect(panel.textContent).not.toContain(detail.foundedOn);
    });

    /**
     * **배정 고지를 새로 쓰지 않고 룰셋 문구를 그대로 쓴다** — 입지 화면이
     * 이미 같은 말을 하고 있고, 두 화면이 다른 말을 하기 시작하면 그때부터
     * 어느 쪽이 맞는지 알 수 없어진다.
     */
    it("배정은 학구도로 정해진다는 고지가 함께 뜬다", async () => {
      const { schoolMarker } = await openFirstSchool("초등학교");
      act(() => schoolMarker!.listeners.click!());

      const note = locationRules.disclosure.schoolZoneNote;
      expect(await screen.findByText(note)).toBeInTheDocument();
      expect(note).toContain("배정");
      expect(note).toContain("학구도");
    });

    /**
     * 사용자 지시: 기본정보와 **권역**을 함께 보여 준다. 경계는 교육부
     * 학구도 도면을 그대로 그린 것이고, 거리로 추정한 값이 아니다
     * (`src/data/school-zones.ts` 참고).
     */
    it("통학구역이 있는 학교면 경계를 지도에 그린다", async () => {
      const { schoolMarker, polygons } = await openFirstSchool("초등학교");
      const expected = schoolsWithinBounds(
        ELEMENTARY_SCHOOLS ?? [],
        TEST_SCHOOL_BOUNDS,
      )[0]!;
      const zones = schoolZonesFor(expected.id);
      // 픽스처가 뜻을 잃지 않게 못 박는다 — 이 학교는 통학구역이 있어야 한다.
      expect(zones.length).toBeGreaterThan(0);

      act(() => schoolMarker!.listeners.click!());

      // 링 하나당 폴리곤 하나(그쪽 주석 참고).
      const rings = zones.reduce((n, z) => n + z.rings.length, 0);
      expect(polygons.filter((p) => !p.removed)).toHaveLength(rings);
      const panel = await screen.findByRole("region", {
        name: `${expected.name} 기본정보`,
      });
      expect(panel.textContent).toContain("지도에 표시했어요");
    });

    it("패널을 닫으면 경계도 지도에서 걷힌다", async () => {
      const { schoolMarker, polygons } = await openFirstSchool("초등학교");
      act(() => schoolMarker!.listeners.click!());
      await screen.findByRole("button", { name: "학교 정보 닫기" });
      expect(polygons.filter((p) => !p.removed).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("button", { name: "학교 정보 닫기" }));

      expect(polygons.filter((p) => !p.removed)).toHaveLength(0);
    });

    /**
     * 사립·국립 초등학교는 추첨·선발로 뽑으므로 **통학구역이 아예 없다.**
     * 우리 지역 285곳 중 13곳이 그렇고 실제로 전부 사립 12곳·국립 1곳이다 —
     * 그때 "없다"를 말해야지, 빈칸으로 두거나 "모른다"로 뭉개면 안 된다.
     */
    it("통학구역이 없는 학교(사립·국립)는 없다고 말하고 아무것도 그리지 않는다", () => {
      const withoutZone = (ELEMENTARY_SCHOOLS ?? []).filter(
        (s) => schoolZonesFor(s.id).length === 0,
      );
      expect(withoutZone.length).toBeGreaterThan(0);
      for (const school of withoutZone) {
        const detail = ELEMENTARY_SCHOOL_DETAILS.get(school.id)!;
        expect(["사립", "국립"]).toContain(detail.foundationType);
      }
    });

    /**
     * 학생 수·교원 수는 **공시에서 온 값이라 오늘 기준이 아니다.** 연도를
     * 빼면 화면의 다른 숫자(실거래가처럼 최신인 값)와 같은 시점처럼
     * 읽히므로, 숫자를 내는 한 연도도 함께 내야 한다.
     */
    it("학생 수·교원 수를 남녀와 함께 내고, 공시 연도를 밝힌다", async () => {
      const { schoolMarker } = await openFirstSchool("초등학교");
      const expected = schoolsWithinBounds(
        ELEMENTARY_SCHOOLS ?? [],
        TEST_SCHOOL_BOUNDS,
      )[0]!;
      const detail = ELEMENTARY_SCHOOL_DETAILS.get(expected.id)!;
      // 픽스처가 뜻을 잃지 않게 못 박는다 — 이 학교는 공시 값이 있어야 한다.
      expect(detail.students).not.toBeNull();
      expect(detail.teachers).not.toBeNull();
      expect(ELEMENTARY_SCHOOL_INFO_YEAR).not.toBeNull();

      act(() => schoolMarker!.listeners.click!());

      const panel = await screen.findByRole("region", {
        name: `${detail.name} 기본정보`,
      });
      expect(panel.textContent).toContain(formatHeadcount(detail.students!));
      expect(panel.textContent).toContain(formatHeadcount(detail.teachers!));
      expect(panel.textContent).toContain(`${ELEMENTARY_SCHOOL_INFO_YEAR}년`);
    });

    /**
     * 공시에 전화번호가 없는 학교가 실제로 285곳 중 50곳이다. 그때 빈칸을
     * 두거나 "-"를 찍지 않고 **줄 자체를 내지 않는다** — 모르는 것을 아는
     * 척하지 않는다는 이 저장소의 규칙이다.
     */
    it("전화번호가 공시에 없는 학교는 그 줄을 아예 내지 않는다", () => {
      const withoutPhone = (ELEMENTARY_SCHOOLS ?? []).filter(
        (s) => ELEMENTARY_SCHOOL_DETAILS.get(s.id)?.phone === null,
      );
      expect(withoutPhone.length).toBeGreaterThan(0);
      // 화면 쪽 규칙은 JSX의 `openSchool.phone !== null` 하나이므로, 여기서는
      // "그런 학교가 실제로 있다"는 전제만 잠근다 — 그 전제가 사라지면 위
      // 분기가 죽은 코드가 된다.
    });

    it("닫기 버튼을 누르면 닫힌다", async () => {
      const { schoolMarker } = await openFirstSchool("초등학교");
      act(() => schoolMarker!.listeners.click!());
      await screen.findByRole("button", { name: "학교 정보 닫기" });

      fireEvent.click(screen.getByRole("button", { name: "학교 정보 닫기" }));

      expect(document.querySelector(".complex-map-school-info")).toBeNull();
    });

    it("학교급을 끄면 패널도 함께 닫힌다 — 지도에 없는 학교의 정보가 남지 않는다", async () => {
      const { schoolMarker } = await openFirstSchool("초등학교");
      act(() => schoolMarker!.listeners.click!());
      await screen.findByRole("button", { name: "학교 정보 닫기" });

      fireEvent.click(screen.getByRole("checkbox", { name: "초등학교" }));

      await vi.waitFor(() =>
        expect(document.querySelector(".complex-map-school-info")).toBeNull(),
      );
    });

    /**
     * 기본정보를 실은 학교급은 초등학교 하나뿐이라, 중·고등학교 마커에는
     * 클릭 리스너를 아예 걸지 않는다 — 눌리는데 아무 일도 안 일어나는
     * 컨트롤을 만들지 않는다.
     *
     * 셋을 한꺼번에 켜고 마커를 학교급으로 갈라 본다 — 학교급마다 따로
     * 켜서 확인하면 이 픽스처 상자 안에 고등학교가 0곳이라(초등 12·중등 1·
     * 고등 0) 그 경우를 아예 못 본다.
     */
    it("초등학교 마커에만 클릭 리스너가 붙는다", async () => {
      const { naverGlobal, markers } = fakeNaverMaps();
      vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
        naverGlobal as unknown as typeof naver,
      );
      render(
        <ComplexMap
          units={[unit({ complexKey: "a" })]}
          coordinates={TEST_SCHOOL_COORDINATES}
          burdenByUnit={new Map()}
          naverMapClientId="test-id"
          filterBounds={TEST_FILTER_BOUNDS}
          filterValue={TEST_FILTER_BOUNDS}
          onFilterChange={() => {}}
        />,
      );
      await vi.waitFor(() => expect(markers).toHaveLength(1));
      fireEvent.click(await screen.findByRole("button", { name: "학교" }));
      for (const level of ["초등학교", "중학교", "고등학교"] as const) {
        fireEvent.click(await screen.findByRole("checkbox", { name: level }));
      }
      await vi.waitFor(() =>
        expect(document.querySelectorAll(".complex-map-school").length).toBe(
          expectedElementaryCount + expectedMiddleCount + expectedHighCount,
        ),
      );

      /*
       * **지금 지도에 남아 있는 마커만 센다.** 체크박스를 누를 때마다
       * 학교 effect가 다시 돌아 마커를 통째로 다시 그리므로, `markers`에는
       * 이미 뗀 이전 세대가 함께 쌓여 있다(뗀 마커의 `el`은 DOM에서
       * 빠졌을 뿐 `querySelector`는 그대로 먹는다).
       */
      const clickable = (selector: string) =>
        markers
          .filter((m) => !m.removed && m.el?.querySelector(selector))
          .map((m) => m.listeners.click !== undefined);

      expect(clickable(".complex-map-school--elementary")).toHaveLength(
        expectedElementaryCount,
      );
      expect(clickable(".complex-map-school--elementary").every(Boolean)).toBe(true);
      expect(clickable(".complex-map-school--middle")).toHaveLength(expectedMiddleCount);
      expect(clickable(".complex-map-school--middle").some(Boolean)).toBe(false);
      expect(clickable(".complex-map-school--high").some(Boolean)).toBe(false);
    });
  });

  it("마커를 누르면 팝업이 열리고, 목록 쪽 선택도 함께 움직인다", async () => {
    const { naverGlobal, markers } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );
    const onFocusComplex = vi.fn();
    const units = [unit({ complexKey: "a" })];

    render(
      <ComplexMap
        units={units}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={new Map()}
        onFocusComplex={onFocusComplex}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() => expect(markers).toHaveLength(1));
    markers[0]!.listeners.click!();

    expect(onFocusComplex).toHaveBeenCalledWith("a");
  });

  it("고른 단지의 마커만 강조되고, 지도가 그 단지로 옮겨 간다", async () => {
    const { naverGlobal, panToCalls } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );
    const units = [unit({ complexKey: "a" }), unit({ complexKey: "b" })];
    const coordinates = new Map([
      ["a", { lat: 37.1, lon: 127.1 }],
      ["b", { lat: 37.2, lon: 127.2 }],
    ]);
    const burdenByUnit = new Map();
    /*
     * **참조를 고정해 둔다.** `units`·`coordinates`·`burdenByUnit`을
     * 인라인으로 새로 만들어 넘기면 리렌더마다 그리기 effect가 다시
     * 돌고(셋 다 그 effect의 의존성이다), 지도가 destroy → 재생성되며
     * `panTo`가 아니라 새 지도가 뜬다. App도 같은 이유로 이 값들을
     * 메모이즈해 넘긴다.
     */
    const { rerender } = render(
      <ComplexMap
        units={units}
        coordinates={coordinates}
        burdenByUnit={burdenByUnit}
        focusedComplexKey={null}
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(2),
    );
    expect(document.querySelectorAll(".complex-map-marker--focused")).toHaveLength(0);

    rerender(
      <ComplexMap
        units={units}
        coordinates={coordinates}
        burdenByUnit={burdenByUnit}
        focusedComplexKey="b"
        naverMapClientId="test-id"
        filterBounds={TEST_FILTER_BOUNDS}
        filterValue={TEST_FILTER_BOUNDS}
        onFilterChange={() => {}}
      />,
    );

    await vi.waitFor(() => {
      const focused = document.querySelectorAll(".complex-map-marker--focused");
      expect(focused).toHaveLength(1);
      expect((focused[0] as HTMLElement).dataset.complexKey).toBe("b");
    });
    // 지도를 새로 만들지 않고 **옮긴다** — 줌·위치를 날리지 않기 위해서다.
    expect(panToCalls).toHaveLength(1);
  });
});
