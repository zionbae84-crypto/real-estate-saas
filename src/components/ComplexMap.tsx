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

        const withCoords = units.filter((u) => coordinates.has(u.complexKey));
        if (withCoords.length === 0) return;

        const first = coordinates.get(withCoords[0]!.complexKey)!;
        const map = new naverGlobal.maps.Map(containerRef.current, {
          center: new naverGlobal.maps.LatLng(first.lat, first.lon),
          zoom: 14,
        });
        // 재렌더로 이 effect가 다시 돌면(예: units/coordinates가 바뀌면) 같은
        // DOM 컨테이너에 새 Map을 또 만들기 전에, 이전 Map을 확실히 치운다.
        cleanupFns.push(() => map.destroy());

        for (const unit of withCoords) {
          const coord = coordinates.get(unit.complexKey)!;
          const marker = new naverGlobal.maps.Marker({
            position: new naverGlobal.maps.LatLng(coord.lat, coord.lon),
            map,
          });
          const infoWindow = new naverGlobal.maps.InfoWindow({
            content: `<div class="complex-map-popup">
              <strong>${unit.complexName}</strong> ${unit.areaBucket}㎡<br/>
              ${formatRange(unit.minPrice, unit.maxPrice)}<br/>
              거래 ${unit.tradeCount}건
            </div>`,
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
          <p>지도를 불러오지 못했어요.</p>
        </div>
      )}
    </div>
  );
}
