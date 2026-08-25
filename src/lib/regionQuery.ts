import { narrowLandLeasehold, type ComplexUnit } from "../data/complexes";

export interface RegionComplexesResult {
  units: ComplexUnit[];
  isRegulatedArea: boolean | null;
}

interface ApiUnit extends Omit<ComplexUnit, "landLeasehold"> {
  landLeasehold: string | null;
}

interface ApiResponse {
  units: ApiUnit[];
  isRegulatedArea: boolean | null;
}

interface ApiErrorBody {
  error?: string;
}

/**
 * 지역 실거래가를 백엔드에서 조회한다. 이 앱에서 `fetch`를 쓰는 유일한
 * 파일이다(`src/no-network.test.ts` 참고). regionCode·dong만 인자로
 * 받고, 재무 정보(현금·소득·기존부채 등)는 어디에도 등장하지 않는다.
 *
 * 실패하면 던진다 — 빈 배열을 반환하지 않는다. 호출자(`useRegionComplexes`)가
 * "조회 실패"와 "결과 0건"을 구분해야 하는데, 여기서 실패를 삼키면 그
 * 구분이 불가능해진다.
 */
export async function fetchRegionComplexes(
  regionCode: string,
  dong: string | null,
): Promise<RegionComplexesResult> {
  const params = new URLSearchParams({ regionCode });
  if (dong !== null) params.set("dong", dong);

  const res = await fetch("/api/complexes?" + params.toString());

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(body?.error ?? `조회 실패 (HTTP ${res.status})`);
  }

  const body = (await res.json()) as ApiResponse;
  return {
    units: body.units.map((u) => ({ ...u, landLeasehold: narrowLandLeasehold(u.landLeasehold) })),
    isRegulatedArea: body.isRegulatedArea,
  };
}
