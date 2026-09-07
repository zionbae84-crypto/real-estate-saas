import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createComplexesDeps, createGeocodeDeps } from "./_lib/deps.js";
import { handleComplexesRequest } from "./_lib/handleComplexes.js";
import { handleGeocodeRequest } from "./_lib/handleGeocode.js";
import { runWarm } from "./_lib/runWarm.js";
import { WARM_REGION_CODES } from "./_lib/warmRegions.js";

/**
 * 인기 지역을 미리 데우는 크론 엔드포인트(`vercel.json`의 `crons`).
 *
 * 응답 캐시는 하루 안에 받은 값이면 즉시 내주고 갱신은 뒤에서 한다
 * (`responseCache.ts`의 갱신 창). 그 창을 살려 두려면 지역마다 하루에
 * 한 번은 조회가 일어나야 하는데, 발길이 뜸한 지역은 그러지 못해
 * 첫 방문자가 국토부 조회를 온전히 기다린다(실측 7.2초). 여기가 그
 * 한 번을 대신 채운다.
 *
 * **사용자 요청과 똑같은 경로로 데운다** — 같은 핸들러, 같은 배선
 * (`deps.ts`). 다른 경로로 데우면 데운 것과 사용자가 받는 것이 갈린다.
 */

/**
 * 새 묶음을 시작하지 않는 시각. 함수 상한(60초)보다 넉넉히 낮게 둔다 —
 * 마지막 묶음이 예산을 넘겨 도는 것까지 상한 안에 들어와야 한다.
 */
const BUDGET_MS = 40_000;

/**
 * 동시에 데우는 지역 수.
 *
 * 지역 하나가 국토부를 12개월치 병렬로 부르므로, 이 값이 8이면 최대
 * 96개 요청이 동시에 뜬다. 더 올리면 한 번에 도는 지역은 늘지만
 * 국토부 rate limit에 가까워지고, 그 실패는 조용히 "안 데워진 지역"이
 * 되어 눈에 띄지 않는다(`handleGeocode.ts`의 동시성 주석과 같은 성질).
 *
 * ── 6 → 8 (실측으로 올렸다) ───────────────────────────────────────
 *
 * 처음 6으로 잡은 것은 **재 보지 않은** 추정치였다. 첫 실행 뒤 목록
 * 앞·중간·끝을 찔러 보니 한 번에 약 15곳에서 멈췄다(인덱스 12는 259ms
 * 로 데워졌고 18은 10,520ms로 안 데워졌다). 하루 두 번이면 한 바퀴에
 * 2.5일이라, 갱신 창 24시간을 못 지킨다.
 *
 * 첫 실행은 좌표 캐시가 비어 가장 느리다(지역당 10~14초). 좌표가
 * 채워진 뒤에는 국토부 주소 조회가 대부분이라 지역당 8초쯤이고,
 * 그때 8이면 예산 40초에 약 40곳 — 하루 두 번으로 70곳을 넘긴다.
 *
 * **더 올리지 않는 이유**: 예산이 끝나는 순간 시작한 묶음이 함수 상한
 * (60초)까지 돌 여유가 있어야 한다 — 40초 + 최악 14초 = 54초다.
 * 그리고 96개 동시 요청은 이미 적지 않다. 다음 실행의 `failed`가
 * 0이 아니면 이 값이 너무 큰 것이니 되돌려라.
 */
const CONCURRENCY = 8;

/** 어디까지 데웠는지. 다음 실행이 이어받는다. */
const CURSOR_KEY = "warm:cursor";

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /*
   * **자격증명이 없으면 아예 돌지 않는다.** 이 경로는 부를 때마다 국토부
   * 일일 호출 한도를 수백 회씩 먹는다 — 열어 두면 아무나 한도를 태워
   * 정작 사용자 조회를 막을 수 있다. Vercel 크론은 CRON_SECRET이
   * 설정돼 있으면 이 헤더를 실어 보낸다.
   */
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(500).json({ error: "서버에 CRON_SECRET이 설정되지 않아 데우기를 돌리지 않습니다" });
    return;
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "인증되지 않은 요청입니다" });
    return;
  }

  const dataKey = process.env.PUBLIC_DATA_API_KEY;
  const clientId = process.env.NAVER_GEOCODE_CLIENT_ID;
  const clientSecret = process.env.NAVER_GEOCODE_CLIENT_SECRET;
  if (!dataKey || !clientId || !clientSecret) {
    res.status(500).json({ error: "서버에 필요한 환경변수가 설정되지 않았습니다" });
    return;
  }

  const redis = createRedis();
  let startIndex = 0;
  if (redis !== null) {
    try {
      startIndex = (await redis.get<number>(CURSOR_KEY)) ?? 0;
    } catch {
      // 커서를 못 읽으면 처음부터 돈다 — 데우기는 보조 장치다.
    }
  }

  const complexesDeps = createComplexesDeps(dataKey);
  const geocodeDeps = createGeocodeDeps(dataKey, clientId, clientSecret);

  const result = await runWarm({
    regions: WARM_REGION_CODES,
    startIndex,
    budgetMs: BUDGET_MS,
    concurrency: CONCURRENCY,
    warmOne: async (regionCode) => {
      /*
       * 목록과 좌표를 나란히 건다 — 사용자 화면(`App.tsx`의
       * `handleRegionSelect`)이 하는 것과 같다.
       *
       * **`pending`까지 기다린다.** 갱신 창 안이면 핸들러는 캐시 값을
       * 즉시 돌려주고 실제 갱신은 `pending`에서 돈다 — 그것을 안
       * 기다리면 데운 척만 하고 캐시는 그대로다.
       */
      const [complexes, geocode] = await Promise.all([
        handleComplexesRequest({ regionCode, dong: null }, complexesDeps),
        handleGeocodeRequest({ regionCode, dong: null }, geocodeDeps),
      ]);
      await Promise.all([complexes.pending, geocode.pending]);

      /*
       * 502(업스트림 실패)는 데우지 못한 것이다 — 성공으로 세지 않는다.
       * **핸들러가 낸 메시지를 그대로 싣는다.** 상태 코드만으로는 국토부가
       * 한도를 막은 것인지 다른 이유인지 가릴 수 없다. 그 메시지는 이미
       * 핸들러 안에서 키를 가린 것이다(`redactKey`).
       */
      if (complexes.status !== 200 || geocode.status !== 200) {
        const why = (label: string, r: { status: number; body: unknown }) =>
          r.status === 200
            ? null
            : `${label} ${r.status} ${String((r.body as { error?: string })?.error ?? "").slice(0, 120)}`;
        throw new Error(
          [why("complexes", complexes), why("geocode", geocode)].filter((x) => x !== null).join(" / "),
        );
      }
    },
  });

  if (redis !== null) {
    try {
      await redis.set(CURSOR_KEY, result.nextIndex);
    } catch {
      // 커서를 못 남기면 다음 실행이 같은 자리에서 다시 돈다 — 느릴 뿐이다.
    }
  }

  const summary = { total: WARM_REGION_CODES.length, startIndex, ...result };

  /*
   * **로그로 남긴다.** 크론은 사람이 응답 본문을 보지 않는다 —
   * 남기지 않으면 몇 곳을 데웠는지도, 실패했는지도 알 방법이 없다.
   * 실제로 첫 실행 뒤 이 값들을 몰라 지역을 하나씩 찔러 봐야 했다.
   *
   * `failed`가 비어 있지 않으면 동시성이 너무 크다는 뜻이다(위
   * {@link CONCURRENCY} 주석).
   */
  console.log("[warm]", JSON.stringify(summary));

  res.status(200).json(summary);
}
