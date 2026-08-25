// src/state/useRegionComplexes.ts
import { useCallback, useRef, useState } from "react";
import type { ComplexUnit } from "../data/complexes";
import { fetchRegionComplexes } from "../lib/regionQuery";

export type RegionComplexesStatus = "idle" | "loading" | "error" | "success";

export interface RegionComplexesState {
  status: RegionComplexesStatus;
  units: ComplexUnit[];
  isRegulatedArea: boolean | null;
  /**
   * 이 조회가 반영한 가장 최근 계약월(YYYY-MM). 모르면 `null`이다 —
   * 화면은 그때 신선도 문구를 아예 쓰지 않는다(`regionQuery.ts` 참고).
   */
  dataAsOf: string | null;
  error: string | null;
  query: (regionCode: string) => void;
  retry: () => void;
}

/**
 * 지역 실거래가 조회 상태. "조회 실패"와 "조회 성공+0건"을 status로
 * 명확히 가른다 — units가 빈 배열인지만으로는 둘을 구분할 수 없다
 * (`regionQuery.ts`의 `fetchRegionComplexes`는 실패 시 던지므로, 여기서
 * 그 예외를 삼켜 status: "error"로 옮긴다).
 *
 * **응답이 도착 순서대로 오지 않는다고 전제한다.** 조회 하나가 국토부
 * API 12개월치를 캐시 없이 병렬로 부치므로 지역마다 응답 시간이 크게
 * 다르다 — A를 고른 뒤 곧바로 B를 고르면 A의 응답이 B보다 늦게 도착하는
 * 일이 실제로 일어난다. 그때 `.then`/`.catch`가 무조건 setState를 하면
 * 화면이 B를 보여주는 채로 A의 단지 목록과 A의 **규제지역 여부**를
 * 뒤집어쓴다. 규제지역 여부는 LTV 한도를 40%↔70%로 가르고, 그 값은
 * `App.tsx`의 useEffect가 프로필에 그대로 반영한다 — 한도 과대평가로
 * 곧장 이어지는 오염이다.
 *
 * 그래서 `lastRegionCode.current`(모든 `run()` 시작 시 **동기적으로**
 * 갱신된다)와 이 promise가 담당한 `regionCode`를 대조해, 어긋나면
 * 아무것도 하지 않는다.
 */
export function useRegionComplexes(): RegionComplexesState {
  const [status, setStatus] = useState<RegionComplexesStatus>("idle");
  const [units, setUnits] = useState<ComplexUnit[]>([]);
  const [isRegulatedArea, setIsRegulatedArea] = useState<boolean | null>(null);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRegionCode = useRef<string | null>(null);

  const run = useCallback((regionCode: string) => {
    lastRegionCode.current = regionCode;
    setStatus("loading");
    setError(null);
    fetchRegionComplexes(regionCode, null)
      .then((result) => {
        // 지나간 조회의 응답이면 아무것도 하지 않는다 — 아래 주석 참고.
        if (lastRegionCode.current !== regionCode) return;
        setUnits(result.units);
        setIsRegulatedArea(result.isRegulatedArea);
        setDataAsOf(result.dataAsOf);
        setStatus("success");
      })
      .catch((e: unknown) => {
        if (lastRegionCode.current !== regionCode) return;
        setUnits([]);
        setDataAsOf(null);
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
        setStatus("error");
      });
  }, []);

  const query = useCallback((regionCode: string) => run(regionCode), [run]);

  const retry = useCallback(() => {
    if (lastRegionCode.current !== null) run(lastRegionCode.current);
  }, [run]);

  return { status, units, isRegulatedArea, dataAsOf, error, query, retry };
}
