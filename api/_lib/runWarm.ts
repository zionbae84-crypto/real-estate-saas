/**
 * 지역을 미리 데우는 루프.
 *
 * **왜 예산과 커서가 필요한가.** 데울 지역이 70곳인데 함수 실행 상한은
 * 60초다(`vercel.json`). 한 번에 다 돌 수 없으므로 (1) 시간 예산 안에서
 * 돌 수 있는 만큼만 돌고 (2) 어디까지 돌았는지 커서로 남겨 다음 실행이
 * 이어받는다. 크론을 하루 두 번 걸면 한 바퀴가 하루 안에 끝난다 —
 * 응답 캐시의 갱신 창(24시간)을 살려 두기에 그 주기가 맞다.
 *
 * 순수 로직만 담는다(Vercel·Redis 타입을 모른다) — `handleComplexes.ts`·
 * `handleGeocode.ts`와 같은 패턴이라 실제 HTTP·저장소 없이 검사할 수 있다.
 */

/** 지역 하나를 데운다. 절대 던지지 않는 것이 아니라, 던지면 루프가 잡는다. */
export type WarmOne = (regionCode: string) => Promise<void>;

export interface RunWarmOptions {
  /** 데울 지역 전체. 커서는 이 배열의 인덱스다. */
  regions: readonly string[];
  /** 이번 실행이 이어받을 자리. 범위를 벗어나면 처음부터 돈다. */
  startIndex: number;
  warmOne: WarmOne;
  /** 이 시간을 넘기면 **새 묶음을 시작하지 않는다**(진행 중인 것은 끝까지 기다린다). */
  budgetMs: number;
  /** 한 묶음에 동시에 데우는 지역 수. */
  concurrency: number;
  now?: () => number;
}

export interface RunWarmResult {
  /** 이번에 시도한 지역 수 */
  attempted: number;
  /** 그중 성공한 수 */
  warmed: number;
  /**
   * 실패한 지역과 **그 이유**. 코드만 남기면 "왜 실패했는지"를 다시
   * 추측해야 한다 — 실제로 첫 측정에서 28곳이 실패했는데 이유를 몰라
   * 동시성 탓인지 업스트림 탓인지 가릴 수 없었다.
   */
  failed: Array<{ region: string; reason: string }>;
  /** 다음 실행이 이어받을 자리 */
  nextIndex: number;
  elapsedMs: number;
}

export async function runWarm(options: RunWarmOptions): Promise<RunWarmResult> {
  const { regions, warmOne, budgetMs, concurrency } = options;
  const now = options.now ?? Date.now;
  const startedAt = now();

  // 커서가 목록 밖이면(목록이 줄었거나 처음이면) 앞에서 다시 시작한다.
  let index = Number.isInteger(options.startIndex) ? options.startIndex : 0;
  if (index < 0 || index >= regions.length) index = 0;

  const failed: Array<{ region: string; reason: string }> = [];
  let attempted = 0;
  let warmed = 0;

  // 한 바퀴를 넘겨 같은 지역을 두 번 데우지 않는다 — 한도만 두 번 먹는다.
  while (attempted < regions.length && now() - startedAt < budgetMs) {
    const batch: string[] = [];
    for (let i = 0; i < concurrency && attempted + batch.length < regions.length; i++) {
      batch.push(regions[(index + batch.length) % regions.length]!);
    }
    if (batch.length === 0) break;

    const results = await Promise.all(
      batch.map(async (regionCode) => {
        try {
          await warmOne(regionCode);
          return null;
        } catch (e) {
          // 한 지역이 실패해도 나머지는 계속 데운다 — 크론이 통째로
          // 무너지면 아무 지역도 안 데워진다.
          const reason = e instanceof Error ? e.message : String(e);
          return { region: regionCode, reason: reason.slice(0, 200) };
        }
      }),
    );

    for (const failure of results) {
      if (failure === null) warmed++;
      else failed.push(failure);
    }
    attempted += batch.length;
    index = (index + batch.length) % regions.length;
  }

  return { attempted, warmed, failed, nextIndex: index, elapsedMs: now() - startedAt };
}
