import { redactKey } from "../../scripts/pipeline/fetch";

const ENDPOINT = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode";

interface GeocodeResponseBody {
  status?: string;
  addresses?: Array<{ x?: string; y?: string }>;
}

/**
 * 주소를 네이버 Geocoding API로 좌표로 바꾼다.
 *
 * 못 찾으면(`addresses`가 빈 배열) null — 에러가 아니다. 문서에 "못 찾음"의
 * 정확한 응답 모양이 없어서, `addresses.length === 0`이면 못 찾은 것으로
 * 방어적으로 다룬다.
 *
 * HTTP 실패는 던진다. 에러 메시지는 클라이언트 ID·시크릿 둘 다
 * `redactKey`로 가린다 — 국토부 API의 `redactKey`와 같은 이유다.
 */
export async function geocodeAddress(
  address: string,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ lat: number; lon: number } | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("query", address);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
        Accept: "application/json",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(redactKey(redactKey(message, clientId), clientSecret));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const message = redactKey(redactKey(`네이버 Geocoding 실패: HTTP ${res.status} ${body}`, clientId), clientSecret);
    throw new Error(message);
  }

  const body = (await res.json()) as GeocodeResponseBody;
  const first = body.addresses?.[0];
  if (first === undefined || first.x === undefined || first.y === undefined) return null;

  const lon = Number(first.x);
  const lat = Number(first.y);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  return { lat, lon };
}
