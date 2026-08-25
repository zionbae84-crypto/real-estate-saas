// src/state/useRegionComplexes.ts
import { useCallback, useRef, useState } from "react";
import type { ComplexUnit } from "../data/complexes";
import { fetchRegionComplexes } from "../lib/regionQuery";

export type RegionComplexesStatus = "idle" | "loading" | "error" | "success";

export interface RegionComplexesState {
  status: RegionComplexesStatus;
  units: ComplexUnit[];
  isRegulatedArea: boolean | null;
  error: string | null;
  query: (regionCode: string) => void;
  retry: () => void;
}

/**
 * 지역 실거래가 조회 상태. "조회 실패"와 "조회 성공+0건"을 status로
 * 명확히 가른다 — units가 빈 배열인지만으로는 둘을 구분할 수 없다
 * (`regionQuery.ts`의 `fetchRegionComplexes`는 실패 시 던지므로, 여기서
 * 그 예외를 삼켜 status: "error"로 옮긴다).
 */
export function useRegionComplexes(): RegionComplexesState {
  const [status, setStatus] = useState<RegionComplexesStatus>("idle");
  const [units, setUnits] = useState<ComplexUnit[]>([]);
  const [isRegulatedArea, setIsRegulatedArea] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRegionCode = useRef<string | null>(null);

  const run = useCallback((regionCode: string) => {
    lastRegionCode.current = regionCode;
    setStatus("loading");
    setError(null);
    fetchRegionComplexes(regionCode, null)
      .then((result) => {
        setUnits(result.units);
        setIsRegulatedArea(result.isRegulatedArea);
        setStatus("success");
      })
      .catch((e: unknown) => {
        setUnits([]);
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
        setStatus("error");
      });
  }, []);

  const query = useCallback((regionCode: string) => run(regionCode), [run]);

  const retry = useCallback(() => {
    if (lastRegionCode.current !== null) run(lastRegionCode.current);
  }, [run]);

  return { status, units, isRegulatedArea, error, query, retry };
}
