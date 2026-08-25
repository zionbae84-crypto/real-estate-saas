import { redactKey } from "../../scripts/pipeline/fetch";
import type { Coordinate, GeocodeCache } from "./geocodeCache";

export interface HandleGeocodeDeps {
  fetchAddresses: (regionCode: string, dong: string | null) => Promise<Map<string, string>>;
  cache: GeocodeCache;
  geocode: (address: string) => Promise<Coordinate | null>;
  key: string;
  secret: string;
}

export interface HandleGeocodeQuery {
  regionCode: string | null;
  dong: string | null;
}

export interface HandleGeocodeResult {
  status: number;
  body: unknown;
}

const REGION_CODE_PATTERN = /^\d{5}$/;

/**
 * `/api/geocode` 요청을 처리하는 순수 로직. Vercel의 req/res 타입과
 * 분리해 둬서 실제 HTTP 서버 없이 테스트할 수 있다(`api/_lib/handleComplexes.ts`와
 * 같은 패턴).
 */
export async function handleGeocodeRequest(
  query: HandleGeocodeQuery,
  deps: HandleGeocodeDeps,
): Promise<HandleGeocodeResult> {
  const { regionCode, dong } = query;

  if (regionCode === null || !REGION_CODE_PATTERN.test(regionCode)) {
    return { status: 400, body: { error: "regionCode는 5자리 숫자여야 합니다" } };
  }

  let addresses: Map<string, string>;
  try {
    addresses = await deps.fetchAddresses(regionCode, dong);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { status: 502, body: { error: redactKey(redactKey(message, deps.key), deps.secret) } };
  }

  const units: Array<{ complexKey: string; lat: number; lon: number }> = [];

  for (const [complexKey, address] of addresses) {
    let coordinate = await deps.cache.get(address);
    if (coordinate === null) {
      try {
        coordinate = await deps.geocode(address);
      } catch {
        // 이 단지 하나의 지오코딩 실패는 조용히 건너뛴다 — §7의 "좌표
        // 없는 단지는 빠진다"는 원칙과 같다. 전체 요청을 실패로 만들지
        // 않는다(주소 조회 자체의 실패와는 다르다 — 위 catch를 보라).
        continue;
      }
      if (coordinate !== null) await deps.cache.set(address, coordinate);
    }
    if (coordinate !== null) units.push({ complexKey, lat: coordinate.lat, lon: coordinate.lon });
  }

  return { status: 200, body: { units } };
}
