import { redactKey } from "../../scripts/pipeline/fetch.js";
import type { Coordinate, GeocodeCache } from "./geocodeCache";
import type { ResponseCache } from "./responseCache";

export interface HandleGeocodeDeps {
  fetchAddresses: (regionCode: string, dong: string | null) => Promise<Map<string, string>>;
  cache: GeocodeCache;
  /**
   * 국토부에서 받아 온 **주소 목록**을 들고 있다가, 국토부가 멈췄을 때
   * 마지막 성공값으로 대신 내주는 캐시({@link ResponseCache}).
   *
   * **좌표가 아니라 주소를 담는 이유**: 이 엔드포인트에서 실제로 죽는
   * 곳은 `fetchAddresses`(국토부) 하나다. 그 뒤의 네이버 지오코딩은
   * 멀쩡했고(2026-09-06 실측), 게다가 주소→좌표는 위 `cache`가 영구
   * 보관한다. 그러니 주소 목록만 버텨 주면 지도는 그대로 뜬다.
   *
   * `Map`은 JSON을 왕복하지 못하므로 엔트리 배열로 담는다.
   */
  responseCache: ResponseCache;
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
 *
 * ── 8 → 32 (실측으로 올렸다) ──────────────────────────────────────
 *
 * 처음 8로 잡은 것은 위 rate limit 걱정을 **재 보지 않고** 보수적으로
 * 고른 값이었다. 실제로 재 보니 그 걱정만큼 좁힐 이유가 없었다 —
 * 부산 해운대구의 **실제 주소 96건**을 두 값으로 돌린 결과:
 *
 *     동시성  8 → 5,029ms, 실패 0건
 *     동시성 32 → 1,752ms, 실패 0건   (2.9배)
 *
 * 단건 지연이 155ms인데 8건 동시가 305ms, 32건 동시가 392ms다 —
 * 네이버 쪽은 32건까지도 거의 직선으로 받아 준다. 병목은 네이버가
 * 아니라 우리가 잘게 끊어 순차로 돈 것이었다. 콜드 조회(해운대구
 * 272개 주소)가 24.9초였고, 이 값 하나로 그 중 9초쯤이 빠진다.
 *
 * **더 올리지 않는 이유**: 32에서 이미 네이버 지연이 눕기 시작했고
 * (8→32에서 요청 수는 4배인데 시간은 1.3배), 그 위는 얻는 것보다
 * rate limit에 가까워지는 위험이 크다. 위 문단이 경고하는 실패 모양
 * (조용히 "좌표 없는 단지"가 되는 것)은 지금도 그대로 유효하다 —
 * 다만 그 경계가 8이 아니라는 것이 실측으로 확인됐을 뿐이다.
 *
 * 이 값을 다시 올리려거든 **같은 방식으로 재고 나서** 올려라:
 * 실제 시군구의 주소 100건 남짓을 그 동시성으로 돌려 실패 0건인지
 * 본다. `partialFailureCount`가 0보다 크게 나오기 시작하면 그 값은
 * 이미 너무 크다.
 */
export const GEOCODE_CONCURRENCY = 32;

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
 * 주소 하나의 지오코딩 결과. "좌표를 구했다"/"조용히 뺀다"의 두 갈래가
 * 아니라 세 갈래다 — `deps.geocode`가 **던졌다**(429/5xx/인증 실패/네트워크
 * 오류처럼 "확인하지 못했다")와 **`null`을 돌려줬다**(주소를 진짜로 못
 * 찾았다, "확인했더니 없다")를 구분해야 한다. 두 갈래를 합치면 클라이언트는
 * "이 지역엔 지도에 찍을 게 없다"와 "우리가 확인을 못 했다"를 구분하지
 * 못한다 — 이 앱이 다른 곳에서 여러 번 고친 바로 그 오류 패턴이다(지역
 * 0건/예산 부족, 동 0건/지역 0건, 규제지역 모름/확정 아님, 그리고 이
 * 브랜치의 SDK 로드·좌표 조회 3분기).
 */
type GeocodeOneResult =
  | { kind: "resolved"; address: string; coordinate: Coordinate }
  | { kind: "notFound"; address: string }
  | { kind: "failed"; address: string };

/**
 * 주소 하나를 지오코딩한다. **캐시는 보지 않는다** — 캐시 조회는 이미
 * 위에서 통째로 끝났고(`getMany`), 여기 오는 것은 미스뿐이다.
 *
 * 절대 던지지 않는다 — 병렬로 도는 자리라 여기서 던지면 같은 묶음의
 * 멀쩡한 주소들까지 함께 무너진다.
 */
async function geocodeOne(address: string, deps: HandleGeocodeDeps): Promise<GeocodeOneResult> {
  let coordinate: Coordinate | null;
  try {
    coordinate = await deps.geocode(address);
  } catch {
    // 이 주소 하나의 지오코딩 자체가 실패했다 — 주소가 없다는 뜻이
    // 아니라 "확인하지 못했다"는 뜻이다(429/5xx/인증 실패/네트워크
    // 오류). §7의 "좌표 없는 단지는 빠진다"는 원칙대로 이 주소를 쓰는
    // 단지는 여전히 `units`에서 빠지지만, 전체 요청을 502로 실패시키지도
    // 않는다 — 대신 이 사실을 `partialFailureCount`로 응답에 남긴다.
    return { kind: "failed", address };
  }
  if (coordinate === null) return { kind: "notFound", address };
  return { kind: "resolved", address, coordinate };
}

/**
 * 캐시에 담긴 좌표를 한 번에 읽는다. 절대 던지지 않는다 — 캐시 조회
 * 실패는 캐시 미스와 동일하게 취급한다(Redis가 죽어 있어도 지오코딩
 * API로 바로 조회해 기능은 계속 동작하고, 속도 이점만 잃는다).
 *
 * 돌려주는 배열은 언제나 `addresses`와 같은 길이다.
 */
async function readCache(
  addresses: readonly string[],
  deps: HandleGeocodeDeps,
): Promise<Array<Coordinate | null>> {
  try {
    const cached = await deps.cache.getMany(addresses);
    return addresses.map((_, i) => cached[i] ?? null);
  } catch {
    return addresses.map(() => null);
  }
}

/**
 * 새로 구한 좌표를 한 번에 저장한다. 절대 던지지 않는다 — 저장에
 * 실패했다고 이미 올바르게 구한 좌표를 버리지 않는다(다음 요청에서
 * 다시 지오코딩하게 될 뿐이다).
 */
async function writeCache(
  entries: ReadonlyArray<readonly [string, Coordinate]>,
  deps: HandleGeocodeDeps,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await deps.cache.setMany(entries);
  } catch {
    /* 무시 — 위 주석 참고 */
  }
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
    // 캐시를 거쳐 부른다 — 신선하면 국토부를 아예 안 부르고, 라이브가
    // 실패하면 마지막 성공값으로 버틴다(`responseCache.ts`).
    const resolved = await deps.responseCache.resolve<Array<[string, string]>>(
      `addresses:${regionCode}:${dong ?? ""}`,
      async () => [...(await deps.fetchAddresses(regionCode, dong))],
    );
    addresses = new Map(resolved.value);
  } catch (e) {
    return { status: 502, body: { error: redactAllKeys(e, deps) } };
  }

  // 같은 주소를 쓰는 단지가 둘 이상일 수 있다. 캐시 조회도 지오코딩도
  // **주소 단위로 한 번씩만** 한다 — 예전에는 같은 묶음에 든 중복 주소를
  // 각각 지오코딩했다.
  const entries = [...addresses];
  const uniqueAddresses = [...new Set(entries.map(([, address]) => address))];

  // ── 1. 캐시를 통째로 읽는다.
  //
  // 예전에는 주소마다 `get → 지오코딩 → set` 세 번의 왕복이 **직렬로**
  // 붙어 있었다. 동시성 32로 끊어 돌아도 묶음 하나가 `get`을 다 기다린
  // 뒤에야 네이버를 부르고, 또 `set`을 다 기다린 뒤에야 다음 묶음으로
  // 갔다 — 주소 289개면 Upstash 왕복만 500회가 넘는다. 이제 읽기는
  // 지역 전체에 대해 `mget` 한두 번이다.
  const known = new Map<string, Coordinate>();
  const misses: string[] = [];
  const cached = await readCache(uniqueAddresses, deps);
  uniqueAddresses.forEach((address, i) => {
    const coordinate = cached[i] ?? null;
    if (coordinate === null) misses.push(address);
    else known.set(address, coordinate);
  });

  // 지오코딩이 **던져서** 확인하지 못한 주소들 — 진짜로 좌표가 없는
  // 주소("notFound")는 여기 넣지 않는다. 이 값이 0보다 크면 클라이언트는
  // "이 지역엔 지도에 찍을 게 없다"와 "우리가 일부를 확인하지 못했다"를
  // 구분할 수 있다.
  const failed = new Set<string>();

  // ── 2. 미스만 `GEOCODE_CONCURRENCY`개씩 끊어 병렬로 지오코딩한다.
  //
  // 묶음마다의 캐시 저장은 **기다리지 않고 띄워 둔 뒤** 마지막에 한꺼번에
  // 거둔다. 저장을 기다리면 다음 묶음의 네이버 호출이 그만큼 늦게 시작된다.
  // 그렇다고 전부 끝난 뒤에 한 번만 저장하면, 함수가 시간 상한에 걸렸을 때
  // 그때까지 구한 좌표가 통째로 날아가 다음 요청도 똑같이 상한에 걸린다 —
  // 묶음 단위로 흘려보내면 재시도가 매번 조금씩 앞으로 나아간다.
  const writes: Array<Promise<void>> = [];
  for (let i = 0; i < misses.length; i += GEOCODE_CONCURRENCY) {
    const batch = misses.slice(i, i + GEOCODE_CONCURRENCY);
    const resolved = await Promise.all(batch.map((address) => geocodeOne(address, deps)));
    const fresh: Array<readonly [string, Coordinate]> = [];
    // 주소를 결과에 실어 돌려받는다 — 자리를 맞춰 인덱스로 되찾는 것보다
    // 어긋날 여지가 없다(예전 코드가 `complexKey`를 실어 나른 것과 같다).
    for (const result of resolved) {
      if (result.kind === "resolved") {
        known.set(result.address, result.coordinate);
        fresh.push([result.address, result.coordinate]);
      } else if (result.kind === "failed") {
        failed.add(result.address);
      }
    }
    writes.push(writeCache(fresh, deps));
  }
  await Promise.all(writes);

  // ── 3. 단지 순서대로 답을 조립한다. 순서는 주소 Map의 순서 그대로다
  //       (응답 순서가 조회 순서와 어긋나지 않는다).
  const units: Array<{ complexKey: string; lat: number; lon: number }> = [];
  let partialFailureCount = 0;
  for (const [complexKey, address] of entries) {
    const coordinate = known.get(address);
    if (coordinate !== undefined) {
      units.push({ complexKey, lat: coordinate.lat, lon: coordinate.lon });
    } else if (failed.has(address)) {
      partialFailureCount++;
    }
  }

  return { status: 200, body: { units, partialFailureCount } };
}
