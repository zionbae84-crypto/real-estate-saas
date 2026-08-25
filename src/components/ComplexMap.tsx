import { useEffect, useRef, useState } from "react";
import type { ComplexUnit } from "../data/complexes";
import { loadNaverMaps } from "../lib/loadNaverMaps";
import { formatRange } from "./ComplexList";

export interface ComplexMapProps {
  units: readonly ComplexUnit[];
  /** complexKey → 좌표. 여기 없는 단지는 지도에 안 그린다 — 대체 좌표를 만들지 않는다. */
  coordinates: ReadonlyMap<string, { lat: number; lon: number }>;
  naverMapClientId: string;
}

/**
 * HTML에 문자열을 끼워 넣기 전에 이스케이프한다.
 *
 * 이 파일의 InfoWindow 콘텐츠는 **이 앱에서 유일하게 React를 거치지 않는
 * HTML 문자열**이다(네이버지도 SDK가 `content`로 마크업 문자열을 받는다).
 * 나머지 화면은 전부 React가 자동으로 이스케이프해 주므로, 여기 하나만
 * 손으로 막으면 된다.
 *
 * `complexName`은 국토부 API의 `aptNm`에서 그대로 온다 — 우리가 만든
 * 값이 아니고 어디에서도 검증하지 않는다. 그 안에 마크업이 들어 있으면
 * 여기서 실행 가능한 HTML이 되고, 그건 "입력한 재무정보가 이 브라우저를
 * 벗어나지 않는다"는 이 제품의 약속을 통째로 무너뜨리는 자리가 된다.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 단지(complexKey) 하나에 마커 하나. 그 단지의 평형이 여러 개면 팝업에
 * 줄이 여러 개 온다.
 *
 * **평형마다 마커를 만들면 안 된다.** `ComplexUnit`은 단지×평형 한 건이라
 * 같은 단지의 84㎡·59㎡가 서로 다른 unit이지만 `complexKey`는 같다
 * (`src/data/complexes.ts` 참고) — 좌표도 당연히 같으므로 마커가 정확히
 * 같은 자리에 겹쳐 쌓이고, 맨 위 하나만 눌린다. 나머지 평형은 지도에
 * 있지만 열어볼 수 없다.
 */
function groupByComplex(units: readonly ComplexUnit[]): Array<{ complexKey: string; units: ComplexUnit[] }> {
  const groups = new Map<string, ComplexUnit[]>();
  for (const unit of units) {
    const existing = groups.get(unit.complexKey);
    if (existing === undefined) groups.set(unit.complexKey, [unit]);
    else existing.push(unit);
  }
  return [...groups].map(([complexKey, groupUnits]) => ({ complexKey, units: groupUnits }));
}

/**
 * 마커 팝업 안의 HTML. 단지 이름은 맨 위에 한 번, 그 아래 평형마다 한 줄.
 *
 * 목록 행과 같은 정보만 낸다 — 가격은 범위와 거래 건수로만 말하고, 단일
 * "적정가" 숫자는 여기서도 내지 않는다(부모 스펙 §6). 평형이 여러 개여도
 * 그 원칙은 줄마다 그대로다: 어느 줄도 하나의 숫자로 접히지 않는다.
 */
function popupContent(units: readonly ComplexUnit[]): string {
  const name = escapeHtml(units[0]!.complexName);
  const rows = units
    .map(
      (u) =>
        `<span class="complex-map-popup-row">${escapeHtml(String(u.areaBucket))}㎡: ` +
        `${escapeHtml(formatRange(u.minPrice, u.maxPrice))}, 거래 ${escapeHtml(String(u.tradeCount))}건</span>`,
    )
    .join("");
  return `<div class="complex-map-popup"><strong class="complex-map-popup-name">${name}</strong>${rows}</div>`;
}

/**
 * 단지 그룹(같은 complexKey) 안에서 마커에 표시할 대표 평형을 고른다.
 * 거래건수가 가장 많은 평형 — 동률이면 배열의 첫 번째(그룹핑 순서 그대로).
 */
function representativeUnit(units: readonly ComplexUnit[]): ComplexUnit {
  return units.reduce((best, u) => (u.tradeCount > best.tradeCount ? u : best), units[0]!);
}

/**
 * 마커 위에 항상 보이는 라벨. "면적+가격범위+거래 건수"만 담는다 —
 * 단지 이름은 여기 넣지 않는다(클릭 팝업에만) — 라벨이 길어지면 지도가
 * 어지러워진다. 단일 "적정가" 숫자를 내지 않는다는 원칙은 여기서도
 * 그대로다 — 항상 `formatRange`(범위) 결과만 쓴다.
 *
 * **거래 건수를 반드시 함께 낸다.** `formatRange`는 min===max일 때 숫자
 * 하나로 접히므로("23억 5,000만원"), 건수가 없으면 이 라벨은 이 앱에서
 * 유일하게 **아무 단서 없는 가격 숫자 하나가 늘 떠 있는 자리**가 된다 —
 * 목록 행도 팝업도 같은 문자열 옆에 "거래 N건"을 늘 달고 있는데 여기만
 * 빠져 있었다. 단서 없는 숫자 하나는 감정평가·적정가로 읽히고, 그건 이
 * 제품이 절대 하지 않기로 한 말이다(부모 스펙 §6). 폭이 늘어 마커가
 * 서로 겹치는 것을 막으려 같은 줄이 아니라 아랫줄(block span)에 붙인다.
 *
 * 여기 들어가는 단지 유래 값은 전부 {@link escapeHtml}을 거친다 —
 * 이 파일은 이 앱에서 유일하게 React를 거치지 않는 HTML 문자열 자리다
 * (위 escapeHtml 주석 참고).
 *
 * 티어 클래스(`complex-map-marker--${tier}`)를 여기서 직접 클래스 목록에
 * 넣는다 — 예전엔 이 함수가 `class="complex-map-marker"`만 돌려주고
 * 호출부가 문자열 `.replace()`로 티어 클래스를 끼워 넣었는데, 그러면
 * 여기 클래스 이름이 바뀌는 순간 그 `.replace()`가 조용히 no-op이 돼
 * 모든 마커가 티어 색을 잃어도 타입체커도 테스트도 못 잡는다. `tier`를
 * 파라미터로 받아 템플릿 리터럴 안에서 완성된 클래스 문자열을 만들면
 * 그 실패 경로 자체가 없어진다.
 */
function markerLabel(representative: ComplexUnit, tier: PriceTier): string {
  const area = escapeHtml(String(representative.areaBucket));
  const range = escapeHtml(formatRange(representative.minPrice, representative.maxPrice));
  const trades = escapeHtml(String(representative.tradeCount));
  return (
    `<div class="complex-map-marker complex-map-marker--${tier}">${area}㎡ ${range}` +
    `<span class="complex-map-marker-trades">거래 ${trades}건</span></div>`
  );
}

/**
 * 지금 지도에 그려지는 단지들(대표 평형 minPrice 기준) 중 가격 3분위
 * 구간을 매긴다. 단지가 3개 미만이면 전부 중간 톤 하나로 통일한다.
 * 절대 가격대를 하드코딩하지 않는다 — 지역마다 시세가 달라 상대적인
 * 기준이어야 의미가 있다(부모 스펙 §1.4).
 *
 * `Math.ceil(n/3)`으로 3등분하기 때문에 n=4처럼 3으로 안 나뉘는 개수에서는
 * 구간이 고르지 않다 — n=4는 low 2개·mid 2개·high 0개가 된다(low/mid가
 * `third`씩, high는 나머지). 의도된 알고리즘의 실제 동작이라 여기서
 * "고치지" 않는다 — `priceTiers.test.ts`류 경계 테스트가 이 동작을
 * 그대로 문서화한다.
 */
export type PriceTier = "low" | "mid" | "high";

export function priceTiers(groups: Array<{ complexKey: string; representative: ComplexUnit }>): Map<string, PriceTier> {
  if (groups.length < 3) {
    return new Map(groups.map((g) => [g.complexKey, "mid"]));
  }
  const sorted = [...groups].sort((a, b) => a.representative.minPrice - b.representative.minPrice);
  const third = Math.ceil(sorted.length / 3);
  const tiers = new Map<string, PriceTier>();
  sorted.forEach((g, i) => {
    const tier: PriceTier = i < third ? "low" : i < third * 2 ? "mid" : "high";
    tiers.set(g.complexKey, tier);
  });
  return tiers;
}

/**
 * 한 번에 그리는 마커 수의 상한.
 *
 * 마커 라벨은 `white-space: nowrap`으로 늘 펼쳐져 있고 실제 폭이
 * 120~230px에 이른다("60㎡ 3억 9,000만원 ~ 5억 4,500만원"). 구 하나가
 * 화면에 들어오는 줌에서 이런 상자를 수백 개 그리면 지도가 아니라
 * 글자 벽이 된다 — 노원구·예산 18억으로 실측했을 때 마커 255개가
 * 816×602 지도 위에서 겹치는 쌍이 11,537개였고, **255개 전부가**
 * 무언가와 겹쳤다. 목록이 10개씩 끊어 보여주는 것과 같은 이유로
 * 여기도 상한을 둔다.
 *
 * **어느 30개인가**: `units`가 들어온 순서 그대로 앞에서부터다. 그
 * 순서는 목록이 쓰는 순서(부담이 낮은 것부터, `buildComplexList`)라,
 * 지도에 남는 30개는 목록 맨 위 30개와 같은 단지들이다 — 두 창이
 * 여기서도 어긋나지 않는다.
 *
 * **잘라낸 개수는 반드시 화면에 적는다.** 말없이 자르면 "이 지역엔
 * 이만큼뿐"으로 읽힌다.
 *
 * 클러스터링(가까운 마커를 묶어 숫자로 표시)은 여기서 만들지 않는다 —
 * 줌마다 다시 묶고 풀어야 하고, 묶인 마커의 가격 티어 색을 무엇으로
 * 할지부터 새 결정이 줄줄이 따라온다. 이 화면이 감당할 크기가 아니다.
 */
const MARKER_LIMIT = 30;

/**
 * 좌표를 아는 단지만 지도에 아이콘으로 그린다. 클릭하면 이름·가격
 * 범위·거래 건수 팝업이 뜬다 — 목록 행과 같은 정보이고, 단일 "적정가"
 * 숫자는 여기서도 내지 않는다(부모 스펙 §6).
 */
export function ComplexMap({ units, coordinates, naverMapClientId }: ComplexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * SDK는 정상인데 **그릴 좌표가 하나도 없는** 상태.
   *
   * `loadFailed`와 반드시 다른 상태로 둔다. 둘을 하나로 뭉치면 "지도를
   * 못 불러왔다"(원인: 우리 쪽 스크립트/네트워크)와 "그릴 단지의 위치를
   * 못 찾았다"(원인: 지오코딩이 그 주소들을 못 찾음)가 같은 문구로
   * 나오고, 그건 이 앱이 가장 경계하는 오류다 — 모르는 것과 확인한 것을
   * 같은 말로 보여주는 것.
   *
   * 예산에 맞는 단지만 지도에 그리게 되면서(App.tsx의 `mappedUnits`)
   * 이 상태가 실제로 자주 일어날 수 있게 됐다. 예전처럼 구 전체
   * 수십 개를 그릴 때는 그중 하나쯤은 좌표가 잡혔지만, 세 개만 그리는
   * 지금은 그 셋이 모두 지오코딩에서 빠질 수 있다. 그때 아무 문구도
   * 없이 빈 600px 상자만 남으면 사용자에겐 고장과 구분되지 않는다.
   */
  const [noneLocated, setNoneLocated] = useState(false);
  /** {@link MARKER_LIMIT}에 걸려 지도에 그리지 못한 단지 수 */
  const [hiddenCount, setHiddenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    setLoadFailed(false);
    setNoneLocated(false);
    setHiddenCount(0);

    loadNaverMaps(naverMapClientId)
      .then((naverGlobal) => {
        if (cancelled || containerRef.current === null) return;

        const withCoords = groupByComplex(units).filter((g) => coordinates.has(g.complexKey));
        if (withCoords.length === 0) {
          setNoneLocated(true);
          return;
        }

        // 상한을 넘는 단지는 그리지 않고, 몇 개를 못 그렸는지만 남긴다.
        const drawn = withCoords.slice(0, MARKER_LIMIT);
        setHiddenCount(withCoords.length - drawn.length);

        const coords = drawn.map((g) => coordinates.get(g.complexKey)!);
        /*
         * 중심을 **그리는 단지들의 평균 좌표**로 잡는다 — 예전에는
         * `withCoords[0]`(그룹핑 순서상 첫 단지) 하나를 그대로 중심으로
         * 썼다. 구 전체 수십 개를 그릴 때는 어디를 중심으로 잡아도
         * 화면에 뭔가는 걸렸지만, 예산에 맞는 몇 개만 그리는 지금은
         * 그 "첫 단지"가 무리의 가장자리일 수 있고 나머지가 화면 밖으로
         * 밀린다.
         */
        const center = {
          lat: coords.reduce((sum, c) => sum + c.lat, 0) / coords.length,
          lon: coords.reduce((sum, c) => sum + c.lon, 0) / coords.length,
        };
        const map = new naverGlobal.maps.Map(containerRef.current, {
          center: new naverGlobal.maps.LatLng(center.lat, center.lon),
          zoom: 14,
        });
        /*
         * 단지가 둘 이상이면 그 전부가 들어오도록 줌을 맞춘다. 고정
         * 줌(14)만으로는 같은 구 안이어도 서로 멀리 떨어진 단지가 화면
         * 밖으로 나간다 — 목록에는 있는데 지도에는 없는 것처럼 보이면
         * 두 창이 어긋나 보인다(이 작업이 없애려던 바로 그 어긋남이다).
         *
         * 하나뿐이면 fitBounds가 폭 0인 경계를 받아 최대 줌까지
         * 당겨 버리므로 그대로 둔다. `maxZoom`도 같은 이유로 건다 —
         * 두 단지가 아주 가까울 때 거리 감각을 잃을 만큼 확대되지 않게.
         */
        if (coords.length > 1) {
          const bounds = new naverGlobal.maps.LatLngBounds(
            new naverGlobal.maps.LatLng(
              Math.min(...coords.map((c) => c.lat)),
              Math.min(...coords.map((c) => c.lon)),
            ),
            new naverGlobal.maps.LatLng(
              Math.max(...coords.map((c) => c.lat)),
              Math.max(...coords.map((c) => c.lon)),
            ),
          );
          map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48, maxZoom: 18 });
        }
        // 재렌더로 이 effect가 다시 돌면(예: units/coordinates가 바뀌면) 같은
        // DOM 컨테이너에 새 Map을 또 만들기 전에, 이전 Map을 확실히 치운다.
        cleanupFns.push(() => map.destroy());

        // 가격 3분위는 **실제로 그린 단지들** 안에서 매긴다 — 그리지도
        // 않은 단지가 분위 경계를 흔들면 화면의 색이 화면에 없는 것을
        // 근거로 삼게 된다(priceTiers 문서의 "지금 지도에 그려지는
        // 단지들" 참고).
        const groupsWithRepresentative = drawn.map((g) => ({
          ...g,
          representative: representativeUnit(g.units),
        }));
        const tiers = priceTiers(groupsWithRepresentative);

        for (const group of groupsWithRepresentative) {
          const coord = coordinates.get(group.complexKey)!;
          const tier = tiers.get(group.complexKey) ?? "mid";
          const labelHtml = markerLabel(group.representative, tier);
          const marker = new naverGlobal.maps.Marker({
            position: new naverGlobal.maps.LatLng(coord.lat, coord.lon),
            map,
            icon: {
              content: labelHtml,
              anchor: new naverGlobal.maps.Point(0, 0),
            },
          });
          const infoWindow = new naverGlobal.maps.InfoWindow({
            content: popupContent(group.units),
          });
          const clickListener = naverGlobal.maps.Event.addListener(marker, "click", () => {
            if (infoWindow.getMap()) infoWindow.close();
            else infoWindow.open(map, marker);
          });
          // 마커·정보창·클릭 리스너를 각각 명시적으로 정리한다 — `Event.removeListener`는
          // 마커+이벤트명이 아니라 `addListener`가 돌려준 핸들을 받는다(@types/navermaps 참고).
          cleanupFns.push(() => {
            naverGlobal.maps.Event.removeListener(clickListener);
            infoWindow.setMap(null);
            marker.setMap(null);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      for (const fn of cleanupFns) fn();
    };
  }, [units, coordinates, naverMapClientId]);

  return (
    <>
    <div ref={containerRef} className="complex-map" role="region" aria-label="단지 지도">
      {loadFailed && (
        <div className="region-query-error">
          {/*
            네이버지도 SDK 자체를 못 불러온 경우다 — 좌표 조회 실패
            ("단지 위치를 불러오지 못했어요", App.tsx)와 다른 원인이므로
            다르게 말한다.
          */}
          <p>지도를 표시하지 못했어요.</p>
        </div>
      )}
      {noneLocated && (
        /*
          SDK는 떴고 좌표 조회도 성공했는데, 그리라고 받은 단지들 중
          위치를 아는 것이 하나도 없는 경우다. 위 로드 실패와도, App.tsx의
          좌표 조회 실패("단지 위치를 불러오지 못했어요")와도, 조건에 맞는
          단지가 아예 없는 경우("조건에 맞는 단지가 없어…", App.tsx)와도
          원인이 달라 각각 다르게 말한다.
        */
        <p className="complex-map-caveat">
          지도에 표시할 단지의 위치를 확인하지 못했어요. 목록은 그대로
          쓰실 수 있어요.
        </p>
      )}
    </div>
    {hiddenCount > 0 && (
      /*
        잘라낸 개수를 반드시 적는다 — 말없이 자르면 "이 지역엔 이만큼
        뿐"으로 읽힌다. 지도 **밖**에 두는 이유는 지도가 실제로 떠 있는
        상태이기 때문이다(위 두 문구는 지도가 없을 때만 뜬다).
        `.complex-map-caveat`를 함께 쓴다 — 같은 성격의 한 줄이고,
        인쇄에서 지우는 이유도 같다.
      */
      <p className="complex-map-caveat">
        지도가 어지러워지지 않게 {MARKER_LIMIT}개만 표시했어요. 조건에 맞는
        단지 {hiddenCount}개가 더 있고, 목록에서 전부 볼 수 있어요.
      </p>
    )}
    </>
  );
}
