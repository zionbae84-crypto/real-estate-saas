import { Redis } from "@upstash/redis";

/**
 * ══════════════════════════════════════════════════════════════════
 * 응답 캐시 — 국토부가 멈춰도 어제 값으로 버틴다
 * ══════════════════════════════════════════════════════════════════
 *
 * **왜 만들었나.** 2026-09-06, 공공데이터포털의 OpenAPI 게이트웨이
 * (`apis.data.go.kr`)가 하루 종일 응답하지 않았다. TCP는 붙는데 TLS
 * 핸드셰이크가 0바이트로 끝나는 형태라, 우리 서버·Vercel·다른 네트워크
 * 모두 같은 증상이었다(같은 대역의 `www.data.go.kr`는 멀쩡했으니 우리
 * 쪽 문제가 아니었다). 그동안 `/api/complexes`는 50초를 기다렸다가 502를
 * 냈고 앱은 통째로 죽었다.
 *
 * 같은 시각 아실·호갱노노는 멀쩡했다. 실제로 확인해 보니 그들은 사용자
 * 요청 때 국토부를 부르지 않는다 — 자기 DB에 적재해 두고 거기서 뿌린다
 * (네트워크 요청 중 `data.go.kr`로 가는 것이 하나도 없었다). 우리는
 * 요청마다 라이브로 부르므로 업스트림이 죽으면 같이 죽는다.
 *
 * 이 모듈은 그 간극을 **가장 작은 변경으로** 메운다: 마지막으로 성공한
 * 응답을 그대로 들고 있다가, 라이브 조회가 실패하면 그것을 대신 낸다.
 *
 * ── 두 개의 창 ────────────────────────────────────────────────────
 *
 *   |<-- 신선(6시간) -->|<---------- 낡음(7일까지) ---------->| 만료
 *   그냥 낸다           라이브 실패했을 때만 낸다              아무것도 없다
 *
 * `FRESH_SECONDS` 안이면 라이브를 아예 부르지 않는다(그만큼 국토부 호출도
 * 준다). 지나면 라이브를 부르고, **성공하면** 새 값으로 갈아 끼운다.
 * 실패하면 그때 비로소 낡은 값을 꺼내되 `STALE_SECONDS`까지만이다.
 *
 * ── 왜 7일인가(사용자 결정) ───────────────────────────────────────
 *
 * 실거래 신고는 계약 후 한 달쯤 늦게 들어온다(화면의 신선도 문구가 이미
 * 그렇게 말한다). 그 지연에 비하면 7일 차이는 큰 오차가 아니다. 반대로
 * 30일이나 무제한으로 두면 새 거래가 쌓인 단지에서 **실제로 틀린 값**을
 * 실거래가라고 부르게 된다 — 이 저장소가 가장 경계하는 형태다.
 *
 * ⚠ **낡은 값을 낼 때는 반드시 그 사실을 함께 낸다.** 이 모듈은
 * `stale`과 `fetchedAt`을 돌려주고, 호출부가 응답에 실어 화면까지
 * 나른다(`ComplexList`의 신선도 줄). 조용히 낡은 값을 내주면 사용자는
 * 그것을 오늘 조회한 값으로 읽는다.
 *
 * ── 기존 `tradeCache`와 무엇이 다른가 ─────────────────────────────
 *
 * `tradeCache`는 국토부 **원본 페이지**를 (지역, 월) 단위로 5분간 들고
 * 있다. 목적이 다르다 — "한 번의 지역 조회 안에서 벌어지는 중복 호출
 * 없애기"이지 장애 대비가 아니다(그 파일 주석 참고). 이쪽은 **완성된
 * 응답**을 (지역, 동) 단위로 들고 있어, 12개월 조립 중 어디가 실패하든
 * 통째로 대체할 수 있다. 둘은 층이 달라 함께 있어도 겹치지 않는다.
 */

/** 이 파일이 쓰는 Redis 표면만. `tradeCache.ts`의 것과 같다. */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

/** 캐시에 실제로 담기는 모양 — 값과 "언제 받았는지" */
interface CacheEntry<T> {
  value: T;
  /** 라이브 조회가 성공한 시각(epoch ms) */
  fetchedAt: number;
}

/** 이 안이면 라이브를 부르지 않는다 */
export const FRESH_SECONDS = 6 * 60 * 60;

/** 라이브가 실패했을 때 낡은 값을 내줄 수 있는 한계 */
export const STALE_SECONDS = 7 * 24 * 60 * 60;

/**
 * **버틸 값이 있을 때** 라이브를 기다려 주는 최대 시간(초).
 *
 * 이것이 없으면 B(낡은 값으로 버티기)에 큰 구멍이 남는다: 신선 창이
 * 지난 **첫 요청**은 국토부가 죽어 있어도 그 사실을 알기까지 온전히
 * 기다린다. 2026-09-06 실측으로 그 시간이 **50초**였다(연결 타임아웃이
 * 그만큼 걸렸다). 캐시에 어제 값이 멀쩡히 있는데도 사용자는 50초를
 * 보고 있어야 한다 — 대부분 그전에 창을 닫는다.
 *
 * 그래서 버틸 값이 있으면 8초만 기다리고 넘어간다. 8초는 정상일 때의
 * 조회 시간(12개월 × 동별, 캐시가 비면 수 초)을 넉넉히 덮으면서
 * 사람이 기다릴 만한 상한이다.
 *
 * ⚠ **버틸 값이 없을 때는 이 상한을 걸지 않는다.** 그때 빨리 끊어 봐야
 * 손에 남는 게 없다 — 느린 성공이 빠른 실패보다 낫다. 함수 실행 상한
 * (`vercel.json`의 `maxDuration: 60`)이 최종 안전망이다.
 *
 * 시간이 지나 라이브가 뒤늦게 성공하면 그 값은 **캐시에 저장된다** —
 * 이 요청은 이미 낡은 값으로 답했지만, 다음 요청이 새 값을 받는다.
 */
export const LIVE_TIMEOUT_SECONDS = 8;

export interface Resolved<T> {
  value: T;
  /** 낡은 값인가 — 참이면 라이브가 실패해 캐시로 버틴 것이다 */
  stale: boolean;
  /** 이 값을 실제로 국토부에서 받은 시각(epoch ms). 캐시가 없으면 `null` */
  fetchedAt: number | null;
}

export interface ResponseCache {
  /**
   * `key`에 대한 값을 낸다. 신선하면 캐시에서, 아니면 `live()`로,
   * `live()`가 던지면 낡은 캐시로.
   *
   * **캐시가 아예 없는데 `live()`가 던지면 그 오류를 그대로 다시
   * 던진다** — 호출부의 502 경로가 지금까지처럼 동작해야 한다. 없는
   * 값을 지어내지 않는다.
   */
  resolve<T>(key: string, live: () => Promise<T>): Promise<Resolved<T>>;
}

const CACHE_KEY_PREFIX = "resp:";

/**
 * 시계가 이겼음을 나르는 표식. `Error`가 아니라 심볼인 이유는, 라이브가
 * 낸 진짜 오류와 **절대 헷갈리지 않게** 하기 위해서다 — 메시지 문자열로
 * 구분하면 업스트림이 "timeout"이라고 말하는 순간 무너진다.
 */
const TIMED_OUT = Symbol("live-timeout");

function raceWithTimeout<T>(pending: Promise<T>): Promise<T> {
  return Promise.race([
    pending,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(TIMED_OUT), LIVE_TIMEOUT_SECONDS * 1000),
    ),
  ]);
}

/**
 * 시계에 진 라이브 조회의 뒤처리. 뒤늦게 성공하면 캐시에 넣어 **다음**
 * 요청이 새 값을 받게 한다. 실패하면 아무것도 하지 않는다 — 이 요청은
 * 이미 낡은 값으로 답했고, 여기서 더 할 일이 없다.
 */
function settleInBackground<T>(
  pending: Promise<T>,
  cacheKey: string,
  redis: RedisLike,
  now: () => number,
): void {
  void pending
    .then((value) => redis.set(cacheKey, { value, fetchedAt: now() }, { ex: STALE_SECONDS }))
    .catch(() => {
      /* 무시 — 위 주석 참고 */
    });
}

export function createResponseCache(redis: RedisLike, now: () => number = Date.now): ResponseCache {
  return {
    async resolve<T>(key: string, live: () => Promise<T>): Promise<Resolved<T>> {
      const cacheKey = `${CACHE_KEY_PREFIX}${key}`;

      /*
       * 캐시 읽기가 던져도 조회 자체는 살아야 한다 — 캐시는 어디까지나
       * 보조 장치다(`tradeCache`·`geocodeCache`와 같은 원칙). 못 읽으면
       * "없는 것"으로 보고 라이브로 간다.
       */
      let cached: CacheEntry<T> | null = null;
      try {
        cached = await redis.get<CacheEntry<T>>(cacheKey);
      } catch {
        cached = null;
      }

      const ageSeconds =
        cached === null ? Number.POSITIVE_INFINITY : (now() - cached.fetchedAt) / 1000;

      if (cached !== null && ageSeconds < FRESH_SECONDS) {
        return { value: cached.value, stale: false, fetchedAt: cached.fetchedAt };
      }

      /*
       * 버틸 값이 있으면 라이브를 무한정 기다리지 않는다(위
       * {@link LIVE_TIMEOUT_SECONDS} 주석). 경주에서 시계가 이기면
       * `TIMED_OUT`이 나오고, 아래 catch가 낡은 값으로 답한다.
       *
       * **라이브 프라미스를 버리지 않는다** — 뒤늦게 성공하면 캐시에
       * 넣어 다음 요청이 새 값을 받게 한다. 그 뒤처리는 아래
       * `settleInBackground`가 맡고, 거부는 삼킨다(처리되지 않은 거부를
       * 만들지 않는다).
       */
      const canFallBack = cached !== null && ageSeconds < STALE_SECONDS;
      const pending = live();

      try {
        const value = await (canFallBack ? raceWithTimeout(pending) : pending);
        const fetchedAt = now();
        /*
         * 쓰기 실패도 삼킨다 — 값은 이미 손에 있고, 못 저장한 결과는
         * "다음 요청이 캐시를 못 쓴다"뿐이다. 그것 때문에 지금 성공한
         * 조회를 실패로 만들 이유가 없다.
         */
        try {
          await redis.set(cacheKey, { value, fetchedAt }, { ex: STALE_SECONDS });
        } catch {
          /* 무시 — 위 주석 참고 */
        }
        return { value, stale: false, fetchedAt };
      } catch (e) {
        if (canFallBack && cached !== null) {
          if (e === TIMED_OUT) settleInBackground(pending, cacheKey, redis, now);
          return { value: cached.value, stale: true, fetchedAt: cached.fetchedAt };
        }
        /*
         * 여기까지 왔다면 `canFallBack`이 거짓이라 경주를 걸지 않았고,
         * 따라서 `e`는 시계가 아니라 라이브가 낸 진짜 오류다.
         */
        throw e;
      }
    },
  };
}

/**
 * 아무것도 기억하지 않는 캐시. `resolve`는 늘 `live()`를 부르고 그 결과를
 * 그대로 낸다 — 실패하면 그대로 던진다(버틸 값이 없다).
 *
 * 저장소가 없을 때 쓰는 대체물이다. **그 상황을 조용히 넘기지 않는다** —
 * {@link createUpstashResponseCache}가 경고를 한 줄 남긴다.
 */
export function createNoopResponseCache(): ResponseCache {
  return {
    async resolve<T>(_key: string, live: () => Promise<T>): Promise<Resolved<T>> {
      const value = await live();
      return { value, stale: false, fetchedAt: null };
    },
  };
}

/**
 * 실제 배포에서 쓰는 캐시.
 *
 * `tradeCache`·`geocodeCache`와 **한 가지가 다르다: 저장소가 없으면
 * 경고를 남긴다.** 저 둘은 속도 장치라 없어도 결과가 같지만, 이쪽은
 * 없으면 **장애 내성이 통째로 사라지는데 화면상으로는 아무 차이가 없다**
 * — 그래서 다음번 장애 때까지 아무도 모른다. 이 저장소가 반복해서 겪은
 * "조용히 통과하는 실패"의 정확한 형태라, 로그로라도 드러낸다.
 */
export function createUpstashResponseCache(): ResponseCache {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.warn(
      "[responseCache] UPSTASH_REDIS_REST_URL/KV_REST_API_URL이 없어 응답 캐시를 " +
        "쓰지 않습니다 — 국토부 API가 멈추면 조회가 그대로 실패합니다.",
    );
    return createNoopResponseCache();
  }
  try {
    return createResponseCache(Redis.fromEnv());
  } catch (e) {
    console.warn("[responseCache] Upstash 연결에 실패해 응답 캐시를 쓰지 않습니다:", e);
    return createNoopResponseCache();
  }
}
