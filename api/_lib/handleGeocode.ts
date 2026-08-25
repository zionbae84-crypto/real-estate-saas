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
    let coordinate: Coordinate | null;
    try {
      coordinate = await deps.cache.get(address);
    } catch {
      // 캐시 조회 실패는 캐시 미스와 동일하게 취급한다 — Redis가 죽어
      // 있거나 오류를 내도 지오코딩 API로 바로 조회해 기능은 계속
      // 동작한다(속도 이점만 잃는다).
      coordinate = null;
    }
    if (coordinate === null) {
      try {
        coordinate = await deps.geocode(address);
      } catch {
        // 이 단지 하나의 지오코딩 실패는 조용히 건너뛴다 — §7의 "좌표
        // 없는 단지는 빠진다"는 원칙과 같다. 전체 요청을 실패로 만들지
        // 않는다(주소 조회 자체의 실패와는 다르다 — 위 catch를 보라).
        continue;
      }
      if (coordinate !== null) {
        try {
          await deps.cache.set(address, coordinate);
        } catch {
          // 캐시 저장 실패로 이 단지의 결과를 버리지 않는다 — 이미
          // 올바른 좌표를 구했으니 그대로 응답에 담는다. 다음 요청에서
          // 다시 지오코딩하게 될 뿐이다.
        }
      }
    }
    if (coordinate !== null) units.push({ complexKey, lat: coordinate.lat, lon: coordinate.lon });
  }

  return { status: 200, body: { units } };
}
