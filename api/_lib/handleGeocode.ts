import { redactKey } from "../../scripts/pipeline/fetch";
import type { Coordinate, GeocodeCache } from "./geocodeCache";

export interface HandleGeocodeDeps {
  fetchAddresses: (regionCode: string, dong: string | null) => Promise<Map<string, string>>;
  cache: GeocodeCache;
  geocode: (address: string) => Promise<Coordinate | null>;
  /**
   * 국토부(공공데이터포털) API 키. **에러 메시지에서 실제로 새어나갈 수
   * 있는 키가 이것이다** — `fetchAddresses`가 부르는
   * `scripts/pipeline/fetch.ts`는 키를 쿼리 파라미터에 담은 URL로 요청하고,
   * 그 URL이 네트워크 오류 메시지에 그대로 실려 온다(`api/complexes.ts`가
   * 같은 이유로 이 키를 넘긴다).
   */
  dataKey: string;
  /** 네이버 Geocoding client id. 지금 경로에서 새지는 않지만 함께 가린다 */
  key: string;
  /** 네이버 Geocoding client secret. 위와 같다 */
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
 * 동시에 띄우는 지오코딩 요청 수.
 *
 * 한 건씩 순차로 돌면 캐시가 빈 큰 시군구(단지 수백 개)에서 수십 초~수 분이
 * 걸려 Vercel 함수의 실행 시간 상한에 걸린다. 반대로 전부 한꺼번에 띄우면
 * 네이버 Geocoding 쪽 rate limit에 걸려 대량 실패로 바뀐다 — 그 실패는
 * 조용히 삼켜져 "좌표 없는 단지"로 보이므로, 화면에는 지도가 비어 있는
 * 것과 구분되지 않는다. 그래서 상한을 둔 병렬로 간다.
 */
const GEOCODE_CONCURRENCY = 8;

/**
 * 에러 메시지에서 이 엔드포인트가 다루는 자격증명을 **전부** 가린다.
 *
 * 지금 실제로 샐 수 있는 것은 국토부 키(`dataKey`)다 —
 * `scripts/pipeline/fetch.ts`가 키를 쿼리 파라미터에 담아 요청하므로 그
 * URL이 네트워크 오류 메시지에 그대로 실린다. 네이버 자격증명은 헤더로만
 * 나가 지금 경로에서는 새지 않지만, 함께 가려 두면 나중에 경로가 바뀌어도
 * 이 자리를 다시 고칠 필요가 없다. 가리는 비용은 사실상 0이고, 빠뜨렸을
 * 때의 비용은 키 유출이다.
 */
function redactAllKeys(e: unknown, deps: HandleGeocodeDeps): string {
  const message = e instanceof Error ? e.message : String(e);
  return [deps.dataKey, deps.key, deps.secret].reduce(
    (redacted, key) => redactKey(redacted, key),
    message,
  );
}

/**
 * 주소 하나를 좌표로 옮긴다. 캐시를 먼저 보고, 없을 때만 지오코딩한다.
 *
 * 실패는 전부 이 단지 하나를 빼는 것으로 끝난다 — 절대 던지지 않는다.
 * 병렬로 도는 자리라 여기서 던지면 같은 묶음의 멀쩡한 주소들까지 함께
 * 무너진다(순차 루프의 `continue`가 하던 일을 그대로 유지한다).
 */
async function resolveCoordinate(
  complexKey: string,
  address: string,
  deps: HandleGeocodeDeps,
): Promise<{ complexKey: string; lat: number; lon: number } | null> {
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
      // 않는다(주소 조회 자체의 실패와는 다르다 — 그쪽은 502다).
      return null;
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

  return coordinate === null ? null : { complexKey, lat: coordinate.lat, lon: coordinate.lon };
}

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
    return { status: 502, body: { error: redactAllKeys(e, deps) } };
  }

  const units: Array<{ complexKey: string; lat: number; lon: number }> = [];

  // `GEOCODE_CONCURRENCY`개씩 끊어 병렬로 돈다. 묶음 안의 순서는
  // `Promise.all`이, 묶음 사이의 순서는 이 루프가 지키므로 결과 순서는
  // 주소 Map의 순서 그대로다(응답 순서가 조회 순서와 어긋나지 않는다).
  const entries = [...addresses];
  for (let i = 0; i < entries.length; i += GEOCODE_CONCURRENCY) {
    const batch = entries.slice(i, i + GEOCODE_CONCURRENCY);
    const resolved = await Promise.all(
      batch.map(([complexKey, address]) => resolveCoordinate(complexKey, address, deps)),
    );
    for (const unit of resolved) {
      if (unit !== null) units.push(unit);
    }
  }

  return { status: 200, body: { units } };
}
