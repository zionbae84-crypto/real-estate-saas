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
 * 마커 위에 항상 보이는 라벨. "면적+가격범위"만 담는다 — 단지 이름은
 * 여기 넣지 않는다(클릭 팝업에만) — 라벨이 길어지면 지도가 어지러워진다.
 * 단일 "적정가" 숫자를 내지 않는다는 원칙은 여기서도 그대로다 — 항상
 * `formatRange`(범위) 결과만 쓴다.
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
  return `<div class="complex-map-marker complex-map-marker--${tier}">${area}㎡ ${range}</div>`;
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
 * 좌표를 아는 단지만 지도에 아이콘으로 그린다. 클릭하면 이름·가격
 * 범위·거래 건수 팝업이 뜬다 — 목록 행과 같은 정보이고, 단일 "적정가"
 * 숫자는 여기서도 내지 않는다(부모 스펙 §6).
 */
export function ComplexMap({ units, coordinates, naverMapClientId }: ComplexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    setLoadFailed(false);

    loadNaverMaps(naverMapClientId)
      .then((naverGlobal) => {
        if (cancelled || containerRef.current === null) return;

        const withCoords = groupByComplex(units).filter((g) => coordinates.has(g.complexKey));
        if (withCoords.length === 0) return;

        const first = coordinates.get(withCoords[0]!.complexKey)!;
        const map = new naverGlobal.maps.Map(containerRef.current, {
          center: new naverGlobal.maps.LatLng(first.lat, first.lon),
          zoom: 14,
        });
        // 재렌더로 이 effect가 다시 돌면(예: units/coordinates가 바뀌면) 같은
        // DOM 컨테이너에 새 Map을 또 만들기 전에, 이전 Map을 확실히 치운다.
        cleanupFns.push(() => map.destroy());

        const groupsWithRepresentative = withCoords.map((g) => ({
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
    </div>
  );
}
