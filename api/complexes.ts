import type { VercelRequest, VercelResponse } from "@vercel/node";
import { defaultWait } from "../scripts/pipeline/fetch.js";
import { lookupHouseholdCounts } from "../scripts/pipeline/householdCount.js";
import { fetchLiveComplexes } from "../scripts/pipeline/live.js";
import reportConfig from "../scripts/pipeline/report-config.json" with { type: "json" };
import regulatedRegions from "./_data/regulated-regions.json" with { type: "json" };
import { fetchHouseholdCount } from "./_lib/householdCountApi.js";
import { createUpstashHouseholdCountCache } from "./_lib/householdCountCache.js";
import { createUpstashResponseCache } from "./_lib/responseCache.js";
import { createUpstashTradeCache } from "./_lib/tradeCache.js";
import { handleComplexesRequest } from "./_lib/handleComplexes.js";
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
          (pnus) => lookupHouseholdCounts(pnus, householdCountCache, (pnu) => fetchHouseholdCount(pnu, key)),
        ),
      key,
      regions: regulatedRegions,
      cache: createUpstashResponseCache(),
    },
  );

  res.status(result.status).json(result.body);
}
