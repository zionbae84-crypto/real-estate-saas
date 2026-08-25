import { useEffect, useRef } from "react";
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

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];

    loadNaverMaps(naverMapClientId).then((naverGlobal) => {
      if (cancelled || containerRef.current === null) return;

      const withCoords = units.filter((u) => coordinates.has(u.complexKey));
      if (withCoords.length === 0) return;

      const first = coordinates.get(withCoords[0]!.complexKey)!;
      const map = new naverGlobal.maps.Map(containerRef.current, {
        center: new naverGlobal.maps.LatLng(first.lat, first.lon),
        zoom: 14,
      });

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
        naverGlobal.maps.Event.addListener(marker, "click", () => {
          if (infoWindow.getMap()) infoWindow.close();
          else infoWindow.open(map, marker);
        });
      }
    });

    return () => {
      cancelled = true;
      for (const fn of cleanupFns) fn();
    };
  }, [units, coordinates, naverMapClientId]);

  return <div ref={containerRef} className="complex-map" role="region" aria-label="단지 지도" />;
}
