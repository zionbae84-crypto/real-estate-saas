import { narrowLandLeasehold, type ComplexUnit } from "../data/complexes";

export interface RegionComplexesResult {
  units: ComplexUnit[];
  isRegulatedArea: boolean | null;
  /**
   * 이 조회에 실제로 들어온 거래 중 가장 최근 계약월(YYYY-MM). 거래가
   * 없었거나 서버가 알려주지 않았으면 `null`이다.
   *
   * **번들의 `DATA_AS_OF`로 대신하지 않는다.** 그 상수는 옛 배치
   * 파이프라인이 3개 구를 돌린 시점의 값이라, 지금 화면이 보여주는
   * 임의의 지역·임의의 시점 조회에 대해서는 우리가 확인한 적 없는
   * 주장이 된다 — 그런데 화면은 그걸 "{dataAsOf} 계약분까지 반영했어요"
   * 라는 사실 서술로 그린다.
   */
  dataAsOf: string | null;
}

interface ApiUnit extends Omit<ComplexUnit, "landLeasehold"> {
  landLeasehold: string | null;
}

interface ApiResponse {
  units: ApiUnit[];
  isRegulatedArea: boolean | null;
  dataAsOf?: unknown;
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
    dataAsOf: narrowDataAsOf(body.dataAsOf),
  };
}

/**
 * 응답의 `dataAsOf`를 `YYYY-MM` 문자열 또는 `null`로 좁힌다.
 *
 * 형식이 아닌 값(옛 배포판이라 필드 자체가 없는 경우 포함)은 `null`로
 * 간다 — 화면은 이 값을 "{dataAsOf} 계약분까지 반영했어요"라는 **사실
 * 서술**로 그리므로, 확인되지 않은 값을 그대로 흘려보내면 그 문장이
 * 근거 없는 주장이 된다. `null`이면 화면이 그 줄을 아예 쓰지 않는다.
 */
function narrowDataAsOf(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

export interface ComplexCoordinate {
  complexKey: string;
  lat: number;
  lon: number;
}

interface GeocodeApiResponse {
  units: ComplexCoordinate[];
}

/**
 * 지역의 단지 좌표를 조회한다. `fetchRegionComplexes`와 같은 파일에 두는
 * 이유는 이 파일이 `src/`에서 `fetch`를 쓸 수 있는 유일한 곳이기
 * 때문이다 — 새 엔드포인트라고 새 예외 파일을 또 만들지 않는다.
 */
export async function fetchComplexCoordinates(
  regionCode: string,
  dong: string | null,
): Promise<ComplexCoordinate[]> {
  const params = new URLSearchParams({ regionCode });
  if (dong !== null) params.set("dong", dong);

  const res = await fetch(`/api/geocode?${params.toString()}`);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(body?.error ?? `조회 실패 (HTTP ${res.status})`);
  }

  const body = (await res.json()) as GeocodeApiResponse;
  return body.units;
}
