import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchComplexAddresses } from "../scripts/pipeline/geocode-addresses";
import { geocodeAddress } from "./_lib/naverGeocode";
import { createUpstashGeocodeCache } from "./_lib/geocodeCache";
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

  const result = await handleGeocodeRequest(
    { regionCode, dong },
    {
      fetchAddresses: (rc, d) => fetchComplexAddresses(rc, d, new Date(), dataKey),
      cache,
      geocode: (address) => geocodeAddress(address, clientId, clientSecret),
      key: clientId,
      secret: clientSecret,
    },
  );

  res.status(result.status).json(result.body);
}
