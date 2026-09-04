import type { VercelRequest, VercelResponse } from "@vercel/node";
import { defaultWait } from "../scripts/pipeline/fetch";
import { lookupHouseholdCounts } from "../scripts/pipeline/householdCount";
import { fetchLiveComplexes } from "../scripts/pipeline/live";
import reportConfig from "../scripts/pipeline/report-config.json";
import regulatedRegions from "./_data/regulated-regions.json";
import { fetchHouseholdCount } from "./_lib/householdCountApi";
import { createUpstashHouseholdCountCache } from "./_lib/householdCountCache";
import { createUpstashTradeCache } from "./_lib/tradeCache";
import { handleComplexesRequest } from "./_lib/handleComplexes";
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
    },
  );

  res.status(result.status).json(result.body);
}
