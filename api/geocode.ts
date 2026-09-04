import type { VercelRequest, VercelResponse } from "@vercel/node";
import { defaultWait } from "../scripts/pipeline/fetch";
import { fetchComplexAddresses } from "../scripts/pipeline/geocode-addresses";
import { geocodeAddress } from "./_lib/naverGeocode";
import { createUpstashGeocodeCache } from "./_lib/geocodeCache";
import { createUpstashTradeCache } from "./_lib/tradeCache";
import { handleGeocodeRequest } from "./_lib/handleGeocode";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const regionCode = typeof req.query.regionCode === "string" ? req.query.regionCode : null;
  const dong = typeof req.query.dong === "string" ? req.query.dong : null;

  const dataKey = process.env.PUBLIC_DATA_API_KEY;
  const clientId = process.env.NAVER_GEOCODE_CLIENT_ID;
  const clientSecret = process.env.NAVER_GEOCODE_CLIENT_SECRET;

  if (!dataKey || !clientId || !clientSecret) {
    res.status(500).json({ error: "서버에 필요한 환경변수가 설정되지 않았습니다" });
    return;
  }

  const cache = createUpstashGeocodeCache();
  const tradeCache = createUpstashTradeCache();

  const result = await handleGeocodeRequest(
    { regionCode, dong },
    {
      fetchAddresses: (rc, d) => fetchComplexAddresses(rc, d, new Date(), dataKey, defaultWait, tradeCache),
      cache,
      geocode: (address) => geocodeAddress(address, clientId, clientSecret),
      // 502 경로에서 실제로 새어나갈 수 있는 키는 국토부 키다 —
      // fetchComplexAddresses가 키를 쿼리 파라미터에 담아 요청하므로
      // 그 URL이 네트워크 오류 메시지에 실려 온다(api/complexes.ts와 같다).
      dataKey,
      key: clientId,
      secret: clientSecret,
    },
  );

  res.status(result.status).json(result.body);
}
