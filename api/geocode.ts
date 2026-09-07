import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGeocodeDeps } from "./_lib/deps.js";
import { handleGeocodeRequest } from "./_lib/handleGeocode.js";
import { sendAndSettle } from "./_lib/sendAndSettle.js";

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

  const result = await handleGeocodeRequest(
    { regionCode, dong },
    createGeocodeDeps(dataKey, clientId, clientSecret),
  );

  // 응답을 보낸 뒤, 뒤에서 도는 캐시 갱신을 마저 기다린다.
  await sendAndSettle(res, result);
}
