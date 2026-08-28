import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loadNaverMapsModule from "../lib/loadNaverMaps";
import { ComplexMap, MARKER_ANCHOR, burdenTiers } from "./ComplexMap";
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
  const createdMaps: Array<{ options: { center?: { lat: number; lng: number } } }> = [];
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
        constructor(el: HTMLElement, opts: { center?: { lat: number; lng: number } }) {
          mapContainerEl = el;
          this.options = opts;
          createdMaps.push(this);
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
   * 제거하고, 단지명과 금액 레인지만 표시하게 해줘."
   *
   * **단서 없는 가격 숫자 하나가 되지 않는다.** `formatRange`는 min===max면
   * 숫자 하나로 접히는데("23억 5,000만원"), 예전에는 그 단서를 거래
   * 건수가 졌다. 지금은 **단지명**이 진다 — 오히려 더 분명한 단서다.
   * 숫자 하나가 아무 이름 없이 떠 있으면 감정평가·적정가로 읽히지만
   * (부모 스펙 §6), "테스트아파트 23억 5,000만원"은 그 단지 거래가를
   * 가리키는 말이지 평가액이 아니다.
   */
  it("마커 라벨은 단지명·가격 범위·부담 수준을 낸다 — 면적·거래건수 문구는 없다", async () => {
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

    await screen.findByText("라벨아파트");
    const marker = document.querySelector(".complex-map-marker");
    expect(marker?.textContent).toContain("라벨아파트");
    expect(marker?.textContent).toContain("23억 5,000만원");
    // 사용자 지시: "마커는 기존처럼 대출없음/대출있음으로 구분해주고
    // … 아래쪽에 표시해줘." — 색만이 아니라 글자로도 남는다.
    expect(marker?.textContent).toContain("대출 없이");
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
    expect(noLoanPin?.textContent).toContain("대출 없이");
    expect(loanPin?.className).toContain("complex-map-pin--loan");
    expect(loanPin?.textContent).toContain("대출 필요");
  });

  it("대표 평형이 burdenByUnit에 없으면 보수적으로 '대출 필요'로 접는다", async () => {
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
    expect(pin?.textContent).toContain("대출 필요");
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

    expect(markers[0]!.anchor).toEqual({ x: MARKER_ANCHOR.x, y: MARKER_ANCHOR.y });
    // 옛 버그를 이름으로 못박는다: 두 값이 다 0이면 라벨의 왼쪽 위
    // 모서리가 좌표에 앉는다.
    expect(MARKER_ANCHOR.y).toBeGreaterThan(0);
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

  it("마커를 클릭하면 팝업이 열리고, 정보 팝업엔 적정가 숫자가 없다", async () => {
    const { naverGlobal, markers, infoWindows } = fakeNaverMaps();
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockResolvedValue(naverGlobal as unknown as typeof naver);

    const units = [unit()];
    const coordinates = new Map([["11680-1", { lat: 37.1, lon: 127.1 }]]);
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

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

  it("마커에 거래건수가 가장 많은 평형의 가격 범위가 항상 보인다(클릭 전에도)", async () => {
    const units = [
      unit({ complexKey: "1", areaBucket: 59, tradeCount: 2, minPrice: 500_000_000, maxPrice: 550_000_000 }),
      unit({ complexKey: "1", areaBucket: 84, tradeCount: 5, minPrice: 700_000_000, maxPrice: 750_000_000 }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);

    // 대표 평형은 거래건수 최다인 84㎡ — 면적은 라벨에 적지 않지만,
    // **그 평형의** 가격 범위가 보여야 한다(59㎡의 5억대가 아니다).
    expect(await screen.findByText(/7억/)).toBeInTheDocument(); // formatRange(700_000_000, 750_000_000)
    const marker = document.querySelector(".complex-map-marker");
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

  it("단지가 30개를 넘으면 30개만 그리고, 못 그린 개수를 화면에 적는다", async () => {
    // 라벨은 nowrap이라 실제 폭이 120~230px에 이른다. 구 하나가 들어오는
    // 줌에서 수백 개를 그리면 지도가 글자 벽이 된다(노원구 실측: 마커
    // 255개, 겹치는 쌍 11,537개, 255개 전부가 무언가와 겹침).
    const units = Array.from({ length: 42 }, (_, i) =>
      unit({ complexKey: `k${i}`, complexName: `단지${i}`, minPrice: 100_000_000 + i, maxPrice: 200_000_000 + i }),
    );
    const coordinates = new Map(units.map((u, i) => [u.complexKey, { lat: 37 + i * 0.001, lon: 127 + i * 0.001 }]));

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(30),
    );
    // 말없이 자르면 "이 지역엔 이만큼뿐"으로 읽힌다.
    await screen.findByText(/30개만 표시했어요/);
    await screen.findByText(/12개가 더 있고/);
  });

  it("30개 이하면 자르지 않고, 잘랐다는 문구도 뜨지 않는다", async () => {
    const units = Array.from({ length: 5 }, (_, i) => unit({ complexKey: `k${i}` }));
    const coordinates = new Map(units.map((u, i) => [u.complexKey, { lat: 37 + i * 0.01, lon: 127 + i * 0.01 }]));

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test" />);

    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(5),
    );
    expect(screen.queryByText(/개만 표시했어요/)).not.toBeInTheDocument();
  });

  /**
   * 마커 색이 부담 수준을 나타내던 규칙이 사라졌다(사용자 지시:
   * "대출없이(색으로 구분)는 제거"). 색이 아무것도 분류하지 않으므로
   * **모든 마커가 한 색**이다 — 이 검사는 티어 클래스가 하나도 남지
   * 않았는지, 그리고 마커가 전부 같은 클래스 목록인지를 본다.
   */
  it("마커에 부담 수준 클래스가 하나도 붙지 않는다 — 전부 같은 한 색이다", async () => {
    const units = [
      unit({ complexKey: "cash-key", complexName: "현금단지", areaBucket: 59, tradeCount: 1 }),
      unit({ complexKey: "loan-key", complexName: "대출단지", areaBucket: 84, tradeCount: 1 }),
    ];
    const coordinates = new Map([
      ["cash-key", { lat: 37.1, lon: 127.1 }],
      ["loan-key", { lat: 37.2, lon: 127.2 }],
    ]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={new Map()} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(2),
    );

    expect(document.querySelectorAll(".complex-map-marker--no-loan")).toHaveLength(0);
    expect(document.querySelectorAll(".complex-map-marker--loan")).toHaveLength(0);
    // 두 마커의 클래스 목록이 글자 그대로 같다 — 색을 가르는 자리가 없다.
    const classLists = [
      ...document.querySelectorAll<HTMLElement>(".complex-map-marker"),
    ].map((el) => el.className);
    expect(new Set(classLists).size).toBe(1);
    // 이름은 마커마다 다르다(라벨이 실제로 그 단지를 가리킨다).
    expect(screen.getByText("현금단지")).toBeInTheDocument();
    expect(screen.getByText("대출단지")).toBeInTheDocument();
  });

  /**
   * 색이 하나가 되면서 범례가 설명할 갈림이 없어졌다 — 통째로 뺐다.
   * 남겨 두면 지도에 없는 구분을 설명하는 고아 상자가 된다.
   */
  it("색 범례를 더 이상 내지 않는다 — 설명할 색 구분이 없다", async () => {
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
    expect(screen.queryByRole("list", { name: "마커 색 안내" })).not.toBeInTheDocument();
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
