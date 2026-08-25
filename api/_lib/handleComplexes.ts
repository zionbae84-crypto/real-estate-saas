import { redactKey } from "../../scripts/pipeline/fetch";
import type { LiveComplexesResult } from "../../scripts/pipeline/live";

export interface RegulatedRegions {
  regulated: string[];
  nonRegulated: string[];
}

export interface HandleComplexesDeps {
  fetchLive: (regionCode: string, dong: string | null) => Promise<LiveComplexesResult>;
  key: string;
  regions: RegulatedRegions;
}

export interface HandleComplexesQuery {
  regionCode: string | null;
  dong: string | null;
}

export interface HandleComplexesResult {
  status: number;
  body: unknown;
}

const REGION_CODE_PATTERN = /^\d{5}$/;

function resolveIsRegulated(regionCode: string, regions: RegulatedRegions): boolean | null {
  if (regions.regulated.includes(regionCode)) return true;
  if (regions.nonRegulated.includes(regionCode)) return false;
  return null;
}

/**
 * `/api/complexes` 요청을 처리하는 순수 로직. Vercel의 req/res 타입과
 * 분리해 둬서 실제 HTTP 서버 없이 테스트할 수 있다.
 */
export async function handleComplexesRequest(
  query: HandleComplexesQuery,
  deps: HandleComplexesDeps,
): Promise<HandleComplexesResult> {
  const { regionCode, dong } = query;

  if (regionCode === null || !REGION_CODE_PATTERN.test(regionCode)) {
    return { status: 400, body: { error: "regionCode는 5자리 숫자여야 합니다" } };
  }

  try {
    // `dataAsOf`(이 조회에 실제로 들어온 거래의 가장 최근 계약월)를 함께
    // 실어 보낸다. 화면은 이 값으로만 "언제 계약분까지 반영했는지"를
    // 말할 수 있다 — 옛 배치 파이프라인의 정적 상수는 다른 지역·다른
    // 시점의 값이라 이 조회에 대해서는 확인된 적 없는 주장이 된다.
    const { units, dataAsOf } = await deps.fetchLive(regionCode, dong);
    return {
      status: 200,
      body: {
        units,
        isRegulatedArea: resolveIsRegulated(regionCode, deps.regions),
        dataAsOf,
      },
    };
  } catch (e) {
    const message = redactKey(e instanceof Error ? e.message : String(e), deps.key);
    return { status: 502, body: { error: message } };
  }
}
