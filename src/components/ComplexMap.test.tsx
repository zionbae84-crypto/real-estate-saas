import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loadNaverMapsModule from "../lib/loadNaverMaps";
import { ComplexMap, burdenTiers } from "./ComplexMap";
import type { ComplexUnit } from "../data/complexes";
import type { BurdenTier } from "../lib/complex-list";
import { unitKey } from "./ComplexList";

/**
 * 부담 수준을 하나도 모르는 상태. 대부분의 테스트는 마커 색이 아니라
 * 다른 것을 보므로 이걸 넘긴다 — 그때 모든 마커는 보수적인 폴백
 * (`"loan"`, 대출 필요)으로 그려진다.
 *
 * **모듈 수준 상수인 이유**: 렌더마다 새 Map을 만들면 참조가 매번 달라져
 * ComplexMap의 그리기 effect가 무한히 다시 돈다(그 effect의 의존성이다).
 */
const NO_BURDEN = new Map<string, BurdenTier>();

/** 주어진 평형들을 전부 같은 부담 수준으로 두는 맵 */
function burdenMap(units: readonly ComplexUnit[], tier: BurdenTier) {
  return new Map(units.map((u) => [unitKey(u), tier]));
}

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

/** burdenTiers 테스트용 최소 그룹 — complexKey와 대표 평형만 채운다. */
function tierGroup(complexKey: string, over: Partial<ComplexUnit> = {}) {
  return { complexKey, representative: unit({ complexKey, ...over }) };
}

/**
 * 예전의 `priceTiers`(가격 3분위) 자리에 있는 검사다. 그 함수가 하던
 * 일(그린 단지들 안에서 상대적으로 싼가)과 지금 하는 일(이 단지를 대출
 * 없이 살 수 있는가)이 다르므로, 경계도 개수(n=0..4)가 아니라
 * **판정의 출처**에 맞춰 다시 짰다 — 개수가 색을 흔들지 않는다는 것
 * 자체가 이번 변경의 요점이라 그 사실을 아래에서 직접 못박는다.
 */
describe("burdenTiers", () => {
  it("단지가 0개면 빈 맵을 돌려준다", () => {
    expect(burdenTiers([], NO_BURDEN).size).toBe(0);
  });

  it("목록이 내려 준 부담 수준을 대표 평형의 키로 찾아 그대로 쓴다", () => {
    const a = tierGroup("a", { areaBucket: 59 });
    const b = tierGroup("b", { areaBucket: 84 });
    const tiers = burdenTiers(
      [a, b],
      new Map([
        [unitKey(a.representative), "no-loan" as const],
        [unitKey(b.representative), "loan" as const],
      ]),
    );
    expect(tiers.get("a")).toBe("no-loan");
    expect(tiers.get("b")).toBe("loan");
  });

  it("모르는 평형은 '대출 필요'로 둔다 — 모르는 채로 '대출 없이 살 수 있다'고 말하지 않는다", () => {
    expect(burdenTiers([tierGroup("a")], NO_BURDEN).get("a")).toBe("loan");
  });

  it.each([1, 2, 3, 4])(
    "함께 그린 단지가 %i개여도 같은 단지는 같은 색이다 — 3분위와 달리 개수가 색을 흔들지 않는다",
    (n) => {
      const groups = Array.from({ length: n }, (_, i) => tierGroup(`k${i}`));
      // 첫 단지 하나만 "대출 없이"로 둔다. 3분위였다면 n에 따라 이
      // 단지의 티어가 low↔mid로 오갔다(옛 테스트가 n=4에서 그 동작을
      // 문서화했다).
      const burden = new Map([[unitKey(groups[0]!.representative), "no-loan" as const]]);
      const tiers = burdenTiers(groups, burden);
      expect(tiers.get("k0")).toBe("no-loan");
      for (let i = 1; i < n; i++) expect(tiers.get(`k${i}`)).toBe("loan");
    },
  );

  it("한 단지에 평형이 여럿이면 **대표 평형**(거래건수 최다)의 부담 수준을 쓴다", () => {
    // 마커 라벨이 그 평형의 면적·가격·거래건수를 내므로, 색도 같은
    // 평형을 가리켜야 마커가 스스로 어긋나지 않는다.
    const representative = unit({ complexKey: "a", areaBucket: 84, tradeCount: 9 });
    const other = unit({ complexKey: "a", areaBucket: 59, tradeCount: 1 });
    const tiers = burdenTiers(
      [{ complexKey: "a", representative }],
      new Map([
        [unitKey(representative), "no-loan" as const],
        [unitKey(other), "loan" as const],
      ]),
    );
    expect(tiers.get("a")).toBe("no-loan");
  });
});

function fakeNaverMaps() {
  const markers: Array<{ position: unknown; listeners: Record<string, () => void>; removed: boolean }> = [];
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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);

    await screen.findByRole("region", { name: "단지 지도" });
    // 실제 마커 개수는 naver.maps 모의 안에 있으므로, 컴포넌트가
    // 예외 없이 렌더링되고 지도 영역이 뜨는지로 확인한다(아래 클릭
    // 테스트가 마커 자체의 동작을 더 구체적으로 확인한다).
  });

  it("그릴 좌표가 하나도 없으면 로드 실패와 **다른** 문구로 그 사실을 말한다", async () => {
    render(<ComplexMap units={[unit()]} coordinates={new Map()} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);
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

  it("마커 라벨에 거래 건수가 함께 나온다 — 단서 없는 가격 숫자 하나로 뜨지 않는다", async () => {
    // formatRange는 min===max면 숫자 하나로 접힌다. 그 숫자가 아무 단서
    // 없이 지도에 늘 떠 있으면 감정평가·적정가로 읽힌다(부모 스펙 §6).
    const units = [unit({ complexKey: "1", areaBucket: 84, tradeCount: 7, minPrice: 2_350_000_000, maxPrice: 2_350_000_000 })];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test" />);

    await screen.findByText(/84㎡/);
    const marker = document.querySelector(".complex-map-marker");
    expect(marker?.textContent).toContain("거래 7건");
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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test" />);
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
        burdenByUnit={NO_BURDEN}
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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);

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
    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);

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

    const { rerender } = render(<ComplexMap units={[unitA]} coordinates={coordsA} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);
    await vi.waitFor(() => expect(markers).toHaveLength(1));
    const firstMarker = markers[0]!;
    expect(firstMarker.removed).toBe(false);
    expect(destroyedMaps).toHaveLength(0);

    // Task 8이 App.tsx에 연결하면 이런 props 변화(동 좁히기, 좌표 지연 도착 등)가
    // 실제로 일어난다 — 그때 이전 마커/지도가 안 치워지면 DOM에 겹쳐 쌓인다.
    rerender(<ComplexMap units={[unitB]} coordinates={coordsB} burdenByUnit={NO_BURDEN} naverMapClientId="test-id" />);
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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test" />);

    // 대표 평형은 거래건수 최다인 84㎡ — 마커 라벨에 그 평형의 가격범위가 보여야 한다.
    expect(await screen.findByText(/84㎡/)).toBeInTheDocument();
    expect(screen.getByText(/7억/)).toBeInTheDocument(); // formatRange(700_000_000, 750_000_000)
  });

  it("마커 라벨의 단지 유래 텍스트도 escapeHtml을 거친다", async () => {
    const units = [
      unit({ complexKey: "1", complexName: "<img src=x onerror=alert(1)>", areaBucket: 59, tradeCount: 1 }),
    ];
    const coordinates = new Map([["1", { lat: 37.5, lon: 127.0 }]]);

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test" />);

    // 마커 라벨 자체는 이름을 넣지 않지만(면적+가격만), 혹시 넣게 되면
    // 이스케이프가 적용되는지 이 테스트가 회귀를 잡는다.
    await screen.findByText(/59㎡/);
    const markerHtml = document.querySelector(".complex-map-marker")?.innerHTML ?? "";
    expect(markerHtml).not.toContain("<img");
  });

  it("단지가 30개를 넘으면 30개만 그리고, 못 그린 개수를 화면에 적는다", async () => {
    // 라벨은 nowrap이라 실제 폭이 120~230px에 이른다. 구 하나가 들어오는
    // 줌에서 수백 개를 그리면 지도가 글자 벽이 된다(노원구 실측: 마커
    // 255개, 겹치는 쌍 11,537개, 255개 전부가 무언가와 겹침).
    const units = Array.from({ length: 42 }, (_, i) =>
      unit({ complexKey: `k${i}`, complexName: `단지${i}`, minPrice: 100_000_000 + i, maxPrice: 200_000_000 + i }),
    );
    const coordinates = new Map(units.map((u, i) => [u.complexKey, { lat: 37 + i * 0.001, lon: 127 + i * 0.001 }]));

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test" />);

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

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={NO_BURDEN} naverMapClientId="test" />);

    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(5),
    );
    expect(screen.queryByText(/개만 표시했어요/)).not.toBeInTheDocument();
  });

  it("30개로 잘려도 남은 마커의 색은 그대로다 — 부담 수준은 함께 그린 개수와 무관한 사실이다", async () => {
    // 3분위 시절에는 **그린 집합**이 분위 경계를 정해서, 몇 개가
    // 잘렸는가가 남은 마커의 색을 바꿨다. 부담 수준은 단지 자체의
    // 사실이라 그런 일이 일어나지 않는다.
    const units = Array.from({ length: 33 }, (_, i) =>
      unit({ complexKey: `k${i}`, minPrice: 100_000_000 + i * 1_000_000, maxPrice: 200_000_000 + i * 1_000_000 }),
    );
    const coordinates = new Map(units.map((u, i) => [u.complexKey, { lat: 37 + i * 0.001, lon: 127 + i * 0.001 }]));
    // 앞 5개만 "대출 없이". 33개 중 30개만 그려지지만, 그려진 앞
    // 5개는 잘림과 무관하게 그대로 "대출 없이"여야 한다.
    const burden = new Map(units.slice(0, 5).map((u) => [unitKey(u), "no-loan" as const]));

    render(<ComplexMap units={units} coordinates={coordinates} burdenByUnit={burden} naverMapClientId="test" />);

    await vi.waitFor(() =>
      expect(document.querySelectorAll(".complex-map-marker")).toHaveLength(30),
    );
    expect(document.querySelectorAll(".complex-map-marker--no-loan")).toHaveLength(5);
    expect(document.querySelectorAll(".complex-map-marker--loan")).toHaveLength(25);
  });

  it("부담 수준 클래스가 실제 마커 DOM에 반영되고, 같은 뜻이 글자로도 적힌다", async () => {
    // markerLabel(complexKey, representative, tier)가 클래스 목록을 직접
    // 조립하므로(호출부의 .replace() 문자열 치환에 의존하지 않는다), 이
    // 테스트는 그 배선이 렌더링 결과까지 실제로 이어지는지 DOM에서 확인한다.
    //
    // **글자를 함께 확인하는 이유**: 마커 색의 뜻이 가격대에서 부담
    // 수준으로 바뀌면서 색이 뜻의 유일한 전달자가 될 뻔했다(가격은
    // 라벨에 숫자로 적혀 있어 색이 덧말이었다). 흑백·색각 이상에서도
    // 뜻이 남아야 한다.
    const noLoan = unit({ complexKey: "cash-key", complexName: "현금단지", areaBucket: 59, tradeCount: 1 });
    const needsLoan = unit({ complexKey: "loan-key", complexName: "대출단지", areaBucket: 84, tradeCount: 1 });
    const coordinates = new Map([
      ["cash-key", { lat: 37.1, lon: 127.1 }],
      ["loan-key", { lat: 37.2, lon: 127.2 }],
    ]);
    const burden = new Map([
      [unitKey(noLoan), "no-loan" as const],
      [unitKey(needsLoan), "loan" as const],
    ]);

    render(
      <ComplexMap
        units={[noLoan, needsLoan]}
        coordinates={coordinates}
        burdenByUnit={burden}
        naverMapClientId="test-id"
      />,
    );

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".complex-map-marker--no-loan")).toHaveLength(1);
      expect(document.querySelectorAll(".complex-map-marker--loan")).toHaveLength(1);
    });

    const cash = document.querySelector(".complex-map-marker--no-loan");
    const loan = document.querySelector(".complex-map-marker--loan");
    expect(cash?.textContent).toContain("59㎡");
    expect(cash?.textContent).toContain("대출 없이");
    expect(loan?.textContent).toContain("84㎡");
    expect(loan?.textContent).toContain("대출 필요");
    // 클래스가 하나가 아니라 여러 개(base + tier) 동시에 붙어 있는지도 확인한다.
    expect(cash?.classList.contains("complex-map-marker")).toBe(true);
  });

  it("마커 색이 무엇을 뜻하는지 범례로 적는다", async () => {
    const units = [unit({ complexKey: "a" })];
    render(
      <ComplexMap
        units={units}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={burdenMap(units, "no-loan")}
        naverMapClientId="test-id"
      />,
    );

    const legend = await screen.findByRole("list", { name: "마커 색 안내" });
    expect(legend.textContent).toContain("대출 없이 살 수 있어요");
    expect(legend.textContent).toContain("대출이 필요해요");
  });

  /**
   * 리뷰 수정(Minor): 예전 조건(`!loadFailed && !noneLocated`)은 실패한
   * 뒤에야 켜지는 두 값을 봤다 — SDK를 불러오는 동안에는 둘 다 false라,
   * 마커가 하나도 없는 빈 액자 위에 색 안내만 잠깐 떠 있었다.
   */
  it("SDK를 불러오는 동안에는 범례를 내지 않는다 — 아직 마커가 없다", async () => {
    const { naverGlobal, markers } = fakeNaverMaps();
    let resolveLoad: (v: typeof naver) => void = () => {};
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockReturnValue(
      new Promise<typeof naver>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const units = [unit({ complexKey: "a" })];

    render(
      <ComplexMap
        units={units}
        coordinates={new Map([["a", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={burdenMap(units, "no-loan")}
        naverMapClientId="test-id"
      />,
    );

    // 로드 전: 실패한 것도 아니고 좌표가 없는 것도 아니지만 마커도 없다.
    expect(markers).toHaveLength(0);
    expect(
      screen.queryByRole("list", { name: "마커 색 안내" }),
    ).not.toBeInTheDocument();

    resolveLoad(naverGlobal as unknown as typeof naver);

    // 마커가 실제로 붙은 뒤에야 범례가 나온다(대조군).
    await screen.findByRole("list", { name: "마커 색 안내" });
    expect(markers.length).toBeGreaterThan(0);
  });

  it("지도를 못 불러왔으면 범례를 내지 않는다 — 가리킬 마커가 없다", async () => {
    vi.spyOn(loadNaverMapsModule, "loadNaverMaps").mockRejectedValue(new Error("boom"));
    render(
      <ComplexMap
        units={[unit()]}
        coordinates={new Map([["11680-1", { lat: 37.1, lon: 127.1 }]])}
        burdenByUnit={NO_BURDEN}
        naverMapClientId="test-id"
      />,
    );

    await screen.findByText("지도를 표시하지 못했어요.");
    expect(screen.queryByRole("list", { name: "마커 색 안내" })).not.toBeInTheDocument();
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
        burdenByUnit={burdenMap(units, "loan")}
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
    /*
     * **참조를 고정해 둔다.** 여기서 `burdenMap(...)`을 두 번 부르면
     * 리렌더마다 새 Map이 되어 그리기 effect가 다시 돌고(의존성이다),
     * 지도가 destroy → 재생성되며 `panTo`가 아니라 새 지도가 뜬다.
     * App은 이 값을 `useMemo`로 들고 있어 목록이 바뀔 때만 새로 만든다.
     */
    const burden = burdenMap(units, "loan");

    const { rerender } = render(
      <ComplexMap
        units={units}
        coordinates={coordinates}
        burdenByUnit={burden}
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
        burdenByUnit={burden}
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
