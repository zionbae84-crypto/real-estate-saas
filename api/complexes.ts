import type { VercelRequest, VercelResponse } from "@vercel/node";
import { defaultWait } from "../scripts/pipeline/fetch.js";
import { lookupHouseholdCounts } from "../scripts/pipeline/householdCount.js";
import { fetchLiveComplexes } from "../scripts/pipeline/live.js";
import reportConfig from "../scripts/pipeline/report-config.json" with { type: "json" };
import regulatedRegions from "./_data/regulated-regions.json" with { type: "json" };
import {
  fetchHouseholdCount,
  fetchHouseholdCountsByRegion,
} from "./_lib/householdCountApi.js";
import { createUpstashHouseholdCountCache } from "./_lib/householdCountCache.js";
import { createUpstashResponseCache } from "./_lib/responseCache.js";
import { createUpstashTradeCache } from "./_lib/tradeCache.js";
import { handleComplexesRequest } from "./_lib/handleComplexes.js";
import { sendAndSettle } from "./_lib/sendAndSettle.js";
import type { ReportConfig } from "../scripts/pipeline/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const regionCode = typeof req.query.regionCode === "string" ? req.query.regionCode : null;
  const dong = typeof req.query.dong === "string" ? req.query.dong : null;
  const key = process.env.PUBLIC_DATA_API_KEY;

  if (!key) {
    res.status(500).json({ error: "서버에 PUBLIC_DATA_API_KEY가 설정되지 않았습니다" });
    return;
  }

  const tradeCache = createUpstashTradeCache();
  const householdCountCache = createUpstashHouseholdCountCache();

  const result = await handleComplexesRequest(
    { regionCode, dong },
    {
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
    },
  );

  // 응답을 보낸 뒤, 뒤에서 도는 캐시 갱신을 마저 기다린다.
  await sendAndSettle(res, result);
}
