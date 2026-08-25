// src/state/useComplexCoordinates.ts
import { useCallback, useRef, useState } from "react";
import { fetchComplexCoordinates } from "../lib/regionQuery";

export type ComplexCoordinatesStatus = "idle" | "loading" | "error" | "success";

export interface ComplexCoordinatesState {
  status: ComplexCoordinatesStatus;
  /** complexKey → 좌표. 실패·로딩 중에는 비어 있다 — 가짜 좌표를 만들지 않는다. */
  coordinates: Map<string, { lat: number; lon: number }>;
  /**
   * 마지막 성공한 조회에서, 지오코딩이 일부 주소를 확인하지 못했는가
   * (`api/_lib/handleGeocode.ts`의 `partialFailureCount > 0`). `status`가
   * "success"인데 이 값이 true면 `coordinates`에는 확인에 성공한 단지만
   * 담겨 있고, 지도에 안 찍힌 단지 중 일부는 "거기 없다"가 아니라
   * "확인하지 못했다"일 수 있다는 뜻이다 — 새 상태 카테고리를 만들지
   * 않고 success 상태에 붙는 부가 신호로만 둔다.
   */
  hasPartialFailures: boolean;
  query: (regionCode: string, dong: string | null) => void;
}

/** regionCode/dong 쌍을 이 훅 안에서만 쓰는 요청 식별키로 합친다. */
function requestKey(regionCode: string, dong: string | null): string {
  return `${regionCode}::${dong ?? ""}`;
}

/**
 * 지도용 좌표 조회 상태. 목록·예산 흐름(`useRegionComplexes`)과 별개로
 * 돈다 — 지도가 느리게 채워져도 목록은 이미 뜬 채로 있어야 한다(부모
 * 스펙 §3).
 *
 * **응답이 도착 순서대로 오지 않는다고 전제한다.** `useRegionComplexes`와
 * 같은 이유로(지역마다 지오코딩 응답 시간이 크게 다름) query()를 연달아
 * 부르면 앞선 요청의 응답이 뒤늦게 도착할 수 있다. 그때 `.then`/`.catch`가
 * 무조건 setState를 하면 화면이 최신 지역을 보여주는 채로 지나간 지역의
 * 좌표를 뒤집어쓴다 — 지도에 엉뚱한 위치가 찍힌다.
 *
 * 그래서 `lastRequestKey.current`(모든 query() 시작 시 **동기적으로**
 * 갱신된다)와 이 promise가 담당한 (regionCode, dong)을 대조해, 어긋나면
 * 성공·실패 양쪽 경로 모두에서 아무것도 하지 않는다.
 */
export function useComplexCoordinates(): ComplexCoordinatesState {
  const [status, setStatus] = useState<ComplexCoordinatesStatus>("idle");
  const [coordinates, setCoordinates] = useState<Map<string, { lat: number; lon: number }>>(new Map());
  const [hasPartialFailures, setHasPartialFailures] = useState(false);
  const lastRequestKey = useRef<string | null>(null);

  const query = useCallback((regionCode: string, dong: string | null) => {
    const key = requestKey(regionCode, dong);
    lastRequestKey.current = key;
    setStatus("loading");
    fetchComplexCoordinates(regionCode, dong)
      .then(({ units, partialFailureCount }) => {
        // 지나간 조회의 응답이면 아무것도 하지 않는다 — 위 주석 참고.
        if (lastRequestKey.current !== key) return;
        setCoordinates(new Map(units.map((u) => [u.complexKey, { lat: u.lat, lon: u.lon }])));
        setHasPartialFailures(partialFailureCount > 0);
        setStatus("success");
      })
      .catch(() => {
        if (lastRequestKey.current !== key) return;
        setCoordinates(new Map());
        setHasPartialFailures(false);
        setStatus("error");
      });
  }, []);

  return { status, coordinates, hasPartialFailures, query };
}
