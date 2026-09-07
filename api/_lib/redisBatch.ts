/**
 * Redis 키-값 캐시를 **묶어서** 오가는 공용 코드.
 *
 * `geocodeCache`(주소→좌표)와 `householdCountCache`(PNU→세대수)는 성질이
 * 같다 — 둘 다 만료가 없고, 둘 다 한 지역의 항목 수백 개를 한꺼번에
 * 다루는 자리에서만 쓰인다. 한 건씩 왕복하면 그 수백 번이 그대로
 * 네트워크 왕복이 되고, 실제로 그것이 지도 첫 조회 시간의 큰 몫이었다.
 *
 * 그래서 두 캐시 모두 `mget`/`mset`으로만 오간다. **만료를 두지 않는다는
 * 성질이 명령 선택으로 지켜진다** — `mset`에는 애초에 만료 옵션 자리가
 * 없다.
 *
 * **이미 쌓여 있는 캐시는 그대로 읽힌다.** 예전 코드가 한 건씩 `set`으로
 * 넣은 값을 `mget`이 똑같이 돌려주고, `mset`으로 넣은 값은 `get`으로도
 * 읽힌다 — 저장되는 원문이 양쪽 모두 같기 때문이다(`{"lat":…}`, `"499"`).
 * @upstash/redis 1.38.2로 실제 확인했다. 그래서 이 변경은 캐시를 다시
 * 데울 필요가 없고, 배포 중 옛·새 버전이 잠깐 섞여 돌아도 안전하다.
 */

/**
 * 이 모듈이 실제로 쓰는 Redis 표면만 담은 타입. `@upstash/redis`의
 * `Redis` 클래스는 이 타입을 만족한다 — 테스트는 진짜 Redis 없이 이
 * 인터페이스만 흉내 낸 가짜로 돈다.
 */
export interface RedisLike {
  mget(keys: string[]): Promise<unknown[]>;
  mset(kv: Record<string, unknown>): Promise<unknown>;
}

/**
 * 한 번의 `mget`/`mset`에 담는 키 수.
 *
 * 나누는 이유는 속도가 아니라 **요청 크기**다 — Upstash REST는 명령을
 * JSON 본문으로 보내므로 키가 수천 개면 본문이 커진다. 시군구 하나가
 * 300개 안팎이라 지금은 대부분 한두 번에 끝나고, 이 값은 아주 큰 지역이
 * 들어와도 본문이 터지지 않게 하는 상한이다.
 */
export const CACHE_BATCH_SIZE = 256;

/** 목록을 {@link CACHE_BATCH_SIZE}개씩 끊는다. 빈 묶음은 만들지 않는다. */
function chunk<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CACHE_BATCH_SIZE) {
    out.push(items.slice(i, i + CACHE_BATCH_SIZE));
  }
  return out;
}

/**
 * 여러 키를 한 번에 읽는다. 결과는 입력 순서 그대로이고, 없는 자리는
 * `null`이다 — **길이도 언제나 입력과 같다.**
 */
export async function readMany<T>(
  redis: RedisLike,
  prefix: string,
  ids: readonly string[],
): Promise<Array<T | null>> {
  const out: Array<T | null> = [];
  for (const batch of chunk(ids)) {
    const values = await redis.mget(batch.map((id) => `${prefix}${id}`));
    // 돌려받은 배열이 요청한 키보다 짧아도 나머지를 미스로 채운다 —
    // 캐시는 속도 장치일 뿐이라, 모양이 어긋나면 "없는 셈" 치고 실제
    // 조회로 넘어가는 것이 맞다. 앞의 값을 뒤로 밀어 넣으면 항목이 남의
    // 값을 받는다(좌표라면 지도에 엉뚱한 위치로 찍힌다).
    for (let i = 0; i < batch.length; i++) {
      out.push((values[i] as T | null | undefined) ?? null);
    }
  }
  return out;
}

/** 여러 키를 한 번에 쓴다. 만료는 두지 않는다(위 머리주석 참고). */
export async function writeMany<T>(
  redis: RedisLike,
  prefix: string,
  entries: ReadonlyArray<readonly [string, T]>,
): Promise<void> {
  for (const batch of chunk(entries)) {
    await redis.mset(Object.fromEntries(batch.map(([id, value]) => [`${prefix}${id}`, value])));
  }
}
