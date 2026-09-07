import { defaultWait } from "../../scripts/pipeline/fetch.js";
import { fetchComplexAddresses } from "../../scripts/pipeline/geocode-addresses.js";
import { lookupHouseholdCounts } from "../../scripts/pipeline/householdCount.js";
import { fetchLiveComplexes } from "../../scripts/pipeline/live.js";
import reportConfig from "../../scripts/pipeline/report-config.json" with { type: "json" };
import regulatedRegions from "../_data/regulated-regions.json" with { type: "json" };
import { createUpstashGeocodeCache } from "./geocodeCache.js";
import { fetchHouseholdCount, fetchHouseholdCountsByRegion } from "./householdCountApi.js";
import { createUpstashHouseholdCountCache } from "./householdCountCache.js";
import { geocodeAddress } from "./naverGeocode.js";
import { createUpstashResponseCache } from "./responseCache.js";
import { createUpstashTradeCache } from "./tradeCache.js";
import type { HandleComplexesDeps } from "./handleComplexes.js";
import type { HandleGeocodeDeps } from "./handleGeocode.js";
import type { ReportConfig } from "../../scripts/pipeline/types";

/**
 * 두 엔드포인트의 의존성 배선을 한곳에 모은다.
 *
 * 원래는 `api/complexes.ts`·`api/geocode.ts`가 각자 들고 있었는데,
 * 크론 데우기(`api/warm.ts`)가 **같은 배선으로** 같은 핸들러를 불러야
 * 하면서 셋이 되었다. 갈라져 있으면 한쪽만 고쳐지고(예: 세대수 일괄
 * 조회를 크론만 못 쓰는 식) 데운 것과 사용자가 받는 것이 달라진다.
 */
export function createComplexesDeps(key: string): HandleComplexesDeps {
  const tradeCache = createUpstashTradeCache();
  const householdCountCache = createUpstashHouseholdCountCache();

  return {
    fetchLive: (rc, d) =>
      fetchLiveComplexes(
        rc,
        d,
        new Date(),
        key,
        reportConfig as ReportConfig,
        defaultWait,
        tradeCache,
        /*
          세대수 조회. 캐시 미스가 많으면 단건 대신 **시군구 일괄**로
          간다(`householdCount.ts`의 "일괄로 가는 조건") — 해운대구
          기준 단건 15배치 약 11초가 일괄 한 번 1.3초가 된다.
          `fetchHouseholdCount`(단건)도 함께 넘긴다: 미스가 적을 때와
          일괄이 실패했을 때 되돌아갈 길이다.
        */
        (pnus) =>
          lookupHouseholdCounts(pnus, householdCountCache, (pnu) => fetchHouseholdCount(pnu, key), {
            fetchByRegion: (regionCode) => fetchHouseholdCountsByRegion(regionCode, key),
          }),
      ),
    key,
    regions: regulatedRegions,
    cache: createUpstashResponseCache(),
  };
}

export function createGeocodeDeps(
  dataKey: string,
  clientId: string,
  clientSecret: string,
): HandleGeocodeDeps {
  const tradeCache = createUpstashTradeCache();

  return {
    fetchAddresses: (rc, d) =>
      fetchComplexAddresses(rc, d, new Date(), dataKey, defaultWait, tradeCache),
    cache: createUpstashGeocodeCache(),
    responseCache: createUpstashResponseCache(),
    geocode: (address) => geocodeAddress(address, clientId, clientSecret),
    /*
      502 경로에서 실제로 새어나갈 수 있는 키는 국토부 키다 —
      fetchComplexAddresses가 키를 쿼리 파라미터에 담아 요청하므로
      그 URL이 네트워크 오류 메시지에 실려 온다.
    */
    dataKey,
    key: clientId,
    secret: clientSecret,
  };
}
