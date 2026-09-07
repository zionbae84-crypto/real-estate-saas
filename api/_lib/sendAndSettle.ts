/**
 * 응답을 보낸 **뒤** 뒤처리를 마저 기다린다.
 *
 * 서버리스는 핸들러가 끝나는 순간 실행을 얼린다. 응답 캐시가 뒤에서
 * 돌리는 갱신(`responseCache.ts`의 `Resolved.revalidating`)을 그냥 띄워만
 * 두고 핸들러를 끝내면 그 갱신은 중간에 죽고, 캐시는 영영 낡은 채로
 * 남는다 — 다음 요청이 또 갱신을 띄우다 또 죽는다.
 *
 * **사용자가 보는 시간은 늘지 않는다.** 응답은 `res.json()`에서 이미
 * 나갔고, 여기서 늘어나는 것은 람다가 살아 있는 시간뿐이다.
 */
export interface SettleableResult {
  status: number;
  body: unknown;
  pending?: Promise<void>;
}

/** `res`에서 이 함수가 쓰는 부분만. 실제 `VercelResponse`가 이 모양을 만족한다. */
export interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

export async function sendAndSettle(res: JsonResponse, result: SettleableResult): Promise<void> {
  res.status(result.status).json(result.body);
  if (result.pending !== undefined) await result.pending;
}
