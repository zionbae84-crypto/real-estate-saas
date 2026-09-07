import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createComplexesDeps } from "./_lib/deps.js";
import { handleComplexesRequest } from "./_lib/handleComplexes.js";
import { sendAndSettle } from "./_lib/sendAndSettle.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const regionCode = typeof req.query.regionCode === "string" ? req.query.regionCode : null;
  const dong = typeof req.query.dong === "string" ? req.query.dong : null;
  const key = process.env.PUBLIC_DATA_API_KEY;

  if (!key) {
    res.status(500).json({ error: "서버에 PUBLIC_DATA_API_KEY가 설정되지 않았습니다" });
    return;
  }

  const result = await handleComplexesRequest({ regionCode, dong }, createComplexesDeps(key));

  // 응답을 보낸 뒤, 뒤에서 도는 캐시 갱신을 마저 기다린다.
  await sendAndSettle(res, result);
}
