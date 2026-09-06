import { redactKey } from "../../scripts/pipeline/fetch.js";
import type { LiveComplexesResult } from "../../scripts/pipeline/live";
import type { ResponseCache } from "./responseCache";

export interface RegulatedRegions {
  regulated: string[];
}

export interface HandleComplexesDeps {
  fetchLive: (regionCode: string, dong: string | null) => Promise<LiveComplexesResult>;
  key: string;
  regions: RegulatedRegions;
  /**
   * 마지막으로 성공한 응답을 들고 있다가 국토부가 멈췄을 때 대신 내주는
   * 캐시({@link ResponseCache}). 그 파일 머리주석에 왜 만들었는지 적었다.
   */
  cache: ResponseCache;
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

/**
 * `regulated` 목록에 없는 지역은 **비규제로 본다.** 국토부 보도자료가
 * 규제지역만 나열하므로 이 판정은 "목록에 없다"는 사실 하나에 기대는
 * 확정값이다 — 근거 문서에 없는 지역까지 규제로 단정하던 예전
 * 보수적 기본값(가정 상태로 남기기)을 사용자 지시로 걷어냈다
 * (`api/_data/regulated-regions.README.md` 참고).
 */
function resolveIsRegulated(regionCode: string, regions: RegulatedRegions): boolean {
  return regions.regulated.includes(regionCode);
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
    //
    // **캐시를 거쳐 부른다.** 신선하면 국토부를 아예 안 부르고, 라이브가
    // 실패하면 마지막 성공값으로 버틴다(`responseCache.ts`). 캐시 키에
    // 동까지 넣는 이유는 `fetchLive`의 결과가 동에 따라 다르기 때문이다.
    const resolved = await deps.cache.resolve(`complexes:${regionCode}:${dong ?? ""}`, () =>
      deps.fetchLive(regionCode, dong),
    );
    const { units, dataAsOf } = resolved.value;
    return {
      status: 200,
      body: {
        units,
        isRegulatedArea: resolveIsRegulated(regionCode, deps.regions),
        dataAsOf,
        /*
         * **낡은 값이면 그 사실을 반드시 함께 낸다.** 화면(`ComplexList`의
         * 신선도 줄)이 "언제 받은 값인지"를 덧붙일 수 있는 유일한 근거다.
         * 조용히 내주면 사용자는 오늘 조회한 값으로 읽는다.
         *
         * 신선할 때는 두 필드를 아예 넣지 않는다 — 평소 응답에 늘
         * `stale: false`가 실리면 화면이 그것을 굳이 읽어야 할 값으로
         * 오해하기 쉽고, 옛 배포판 응답과도 모양이 갈린다.
         */
        ...(resolved.stale
          ? { stale: true, cachedAt: new Date(resolved.fetchedAt ?? 0).toISOString() }
          : {}),
      },
    };
  } catch (e) {
    const message = redactKey(e instanceof Error ? e.message : String(e), deps.key);
    return { status: 502, body: { error: message } };
  }
}
