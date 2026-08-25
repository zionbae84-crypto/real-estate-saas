// src/state/useComplexCoordinates.ts
import { useCallback, useState } from "react";
import { fetchComplexCoordinates } from "../lib/regionQuery";

export type ComplexCoordinatesStatus = "idle" | "loading" | "error" | "success";

export interface ComplexCoordinatesState {
  status: ComplexCoordinatesStatus;
  /** complexKey → 좌표. 실패·로딩 중에는 비어 있다 — 가짜 좌표를 만들지 않는다. */
  coordinates: Map<string, { lat: number; lon: number }>;
  query: (regionCode: string, dong: string | null) => void;
}

/**
 * 지도용 좌표 조회 상태. 목록·예산 흐름(`useRegionComplexes`)과 별개로
 * 돈다 — 지도가 느리게 채워져도 목록은 이미 뜬 채로 있어야 한다(부모
 * 스펙 §3).
 */
export function useComplexCoordinates(): ComplexCoordinatesState {
  const [status, setStatus] = useState<ComplexCoordinatesStatus>("idle");
  const [coordinates, setCoordinates] = useState<Map<string, { lat: number; lon: number }>>(new Map());

  const query = useCallback((regionCode: string, dong: string | null) => {
    setStatus("loading");
    fetchComplexCoordinates(regionCode, dong)
      .then((units) => {
        setCoordinates(new Map(units.map((u) => [u.complexKey, { lat: u.lat, lon: u.lon }])));
        setStatus("success");
      })
      .catch(() => {
        setCoordinates(new Map());
        setStatus("error");
      });
  }, []);

  return { status, coordinates, query };
}
