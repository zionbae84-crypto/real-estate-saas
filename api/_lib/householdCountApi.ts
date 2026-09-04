import { redactKey } from "../../scripts/pipeline/fetch";

const ENDPOINT = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

interface AptInfoResponseBody {
  data?: Array<{ UNIT_CNT?: number }>;
}

/**
 * PNU로 한국부동산원 "공동주택 단지 식별정보 조회 서비스"에서 세대수를
 * 조회한다.
 *
 * 못 찾으면(`data`가 빈 배열) `null` — 에러가 아니다. `naverGeocode.ts`의
 * `geocodeAddress`와 같은 원칙: "확인했더니 없다"와 "확인하지 못했다"를
 * 구분해야 하는데, 여기서 실패를 삼키면 그 구분이 불가능해진다. 그래서
 * HTTP 실패는 그대로 던진다 — 호출부(`lookupHouseholdCounts`)가 그
 * PNU 하나만 "확인 못 함"으로 다룬다.
 *
 * 이 API는 국토부 실거래가·K-apt와 같은 `apis.data.go.kr` 도메인이 아니라
 * `api.odcloud.kr`이지만, **공공데이터포털(data.go.kr) 계정의 같은
 * 인증키를 그대로 쓴다** — 실측으로 확인했다(별도 발급 불필요).
 */
export async function fetchHouseholdCount(
  pnu: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("page", "1");
  url.searchParams.set("perPage", "1");
  url.searchParams.set("cond[PNU::EQ]", pnu);
  url.searchParams.set("serviceKey", key);

  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(redactKey(message, key));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      redactKey(`한국부동산원 공동주택 단지 식별정보 조회 실패: HTTP ${res.status} ${body}`, key),
    );
  }

  const body = (await res.json()) as AptInfoResponseBody;
  const first = body.data?.[0];
  if (first === undefined) return null;

  const count = first.UNIT_CNT;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
  return Math.round(count);
}
