import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loadNaverMapsModule from "../lib/loadNaverMaps";
import { ComplexMap, MARKER_ANCHOR, burdenTiers, markerDetailForZoom } from "./ComplexMap";
import { unitKey } from "./ComplexList";
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
  }> = [];
  const infoWindows: Array<{ content: string; opened: boolean; removed: boolean }> = [];
  const destroyedMaps: unknown[] = [];
  const createdMaps: Array<{
    options: { center?: { lat: number; lng: number } };
    setZoom(next: number): void;
  }> = [];
  const fitBoundsCalls: Array<{ bounds: unknown; options?: unknown }> = [];
  // 실제 SDK의 panTo — 고른 단지로 지도를 옮길 때 쓴다(지도를 다시
  // 만들지 않는다).
  const panToCalls: Array<{ lat: number; lng: number }> = [];
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
        constructor(el: HTMLElement, opts: { center?: { lat: number; lng: number }; zoom?: number }) {
          mapContainerEl = el;
          this.options = opts;
          if (opts.zoom !== undefined) this.zoom = opts.zoom;
          createdMaps.push(this);
        }
        getZoom() {
          return this.zoom;
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
    infoWindows,
    destroyedMaps,
    createdMaps,
    fitBoundsCalls,
    panToCalls,
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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    // 실제 마커 개수는 naver.maps 모의 안에 있으므로, 컴포넌트가
    // 예외 없이 렌더링되고 지도 영역이 뜨는지로 확인한다(아래 클릭
    // 테스트가 마커 자체의 동작을 더 구체적으로 확인한다).
  });

  it("그릴 좌표가 하나도 없으면 로드 실패와 **다른** 문구로 그 사실을 말한다", async () => {
    render(<ComplexMap units={[unit()]} coordinates={new Map()} burdenByUnit={new Map()} naverMapClientId="test-id" />);
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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);
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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

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

    const { rerender } = render(<ComplexMap units={[unitA]} coordinates={coordsA} burdenByUnit={burdenByUnit} naverMapClientId="test-id" />);
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    const firstMarker = markers[0]!;
    expect(firstMarker.removed).toBe(false);
    expect(destroyedMaps).toHaveLength(0);

    // Task 8이 App.tsx에 연결하면 이런 props 변화(동 좁히기, 좌표 지연 도착 등)가
    // 실제로 일어난다 — 그때 이전 마커/지도가 안 치워지면 DOM에 겹쳐 쌓인다.
    rerender(<ComplexMap units={[unitB]} coordinates={coordsB} burdenByUnit={burdenByUnit} naverMapClientId="test-id" />);
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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);

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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);

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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);

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
      />,
    );

    await screen.findByText("지도를 표시하지 못했어요.");
    // 설명할 마커 자체가 없다 — 범례를 내면 고아 상자가 된다.
    expect(document.querySelector(".complex-map-legend")).toBeNull();
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
