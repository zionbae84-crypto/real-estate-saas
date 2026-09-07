import { describe, expect, it, vi } from "vitest";
import {
  HOUSEHOLD_COUNT_CONCURRENCY,
  lookupHouseholdCounts,
  noopHouseholdCountCache,
  noopHouseholdCountLookup,
  type HouseholdCountCache,
} from "./householdCount";

/**
 * 진짜 캐시와 같은 약속을 지키는 가짜 — `getMany`는 물어본 순서 그대로,
 * 물어본 개수만큼 돌려준다. 길이나 순서가 어긋나면 호출부가 자리를 잘못
 * 맞춰 PNU가 남의 세대수를 받는다. `reads`/`writes`로 **왕복 횟수**도
 * 세어 둔다 — 이 캐시가 묶음 명령만 두는 이유가 그것이다.
 */
function fakeCache(): HouseholdCountCache & {
  store: Map<string, number>;
  reads: number;
  writes: number;
} {
  const store = new Map<string, number>();
  const cache = {
    store,
    reads: 0,
    writes: 0,
    async getMany(pnus: readonly string[]) {
      cache.reads += 1;
      return pnus.map((pnu) => store.get(pnu) ?? null);
    },
    async setMany(entries: ReadonlyArray<readonly [string, number]>) {
      cache.writes += 1;
      for (const [pnu, count] of entries) store.set(pnu, count);
    },
  };
  return cache;
}

describe("lookupHouseholdCounts", () => {
  it("PNU마다 fetchOne을 불러 결과 Map을 만든다", async () => {
    const cache = fakeCache();
    const fetchOne = vi.fn(async (pnu: string) => (pnu === "A" ? 100 : pnu === "B" ? 200 : null));

    const result = await lookupHouseholdCounts(["A", "B", "C"], cache, fetchOne);

    expect(result).toEqual(new Map([["A", 100], ["B", 200]]));
    // "C"는 못 찾았으니(null) 결과 Map에 아예 없다 — 0이나 다른 값으로 채우지 않는다.
    expect(result.has("C")).toBe(false);
  });

  it("중복 PNU는 한 번만 조회한다", async () => {
    const cache = fakeCache();
    const fetchOne = vi.fn(async () => 50);

    await lookupHouseholdCounts(["A", "A", "A"], cache, fetchOne);

    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it("캐시에 있으면 fetchOne을 부르지 않는다", async () => {
    const cache = fakeCache();
    cache.store.set("A", 300);
    const fetchOne = vi.fn(async () => 999);

    const result = await lookupHouseholdCounts(["A"], cache, fetchOne);

    expect(result.get("A")).toBe(300);
    expect(fetchOne).not.toHaveBeenCalled();
  });

  it("조회에 성공하면 캐시에 저장해 다음 조회가 재사용한다", async () => {
    const cache = fakeCache();
    const fetchOne = vi.fn(async () => 400);

    await lookupHouseholdCounts(["A"], cache, fetchOne);
    await lookupHouseholdCounts(["A"], cache, fetchOne);

    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it("캐시 조회가 실패해도 미스로 취급해 계속 동작한다", async () => {
    const cache: HouseholdCountCache = {
      async getMany() {
        throw new Error("redis down");
      },
      async setMany() {},
    };
    const fetchOne = vi.fn(async () => 100);

    const result = await lookupHouseholdCounts(["A"], cache, fetchOne);

    expect(result.get("A")).toBe(100);
  });

  it("캐시 저장이 실패해도 이미 구한 값은 그대로 돌려준다", async () => {
    const cache: HouseholdCountCache = {
      async getMany(pnus) {
        return pnus.map(() => null);
      },
      async setMany() {
        throw new Error("redis down");
      },
    };
    const fetchOne = vi.fn(async () => 100);

    const result = await lookupHouseholdCounts(["A"], cache, fetchOne);

    expect(result.get("A")).toBe(100);
  });

  it("한 PNU의 조회가 던져도 나머지는 그대로 결과에 담긴다", async () => {
    const cache = fakeCache();
    const fetchOne = vi.fn(async (pnu: string) => {
      if (pnu === "BAD") throw new Error("HTTP 500");
      return 100;
    });

    const result = await lookupHouseholdCounts(["GOOD", "BAD"], cache, fetchOne);

    expect(result.get("GOOD")).toBe(100);
    expect(result.has("BAD")).toBe(false);
  });

  it("concurrency를 넘는 PNU도 배치로 나눠 전부 처리한다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: 20 }, (_, i) => `P${i}`);
    const fetchOne = vi.fn(async (pnu: string) => Number(pnu.slice(1)));

    const result = await lookupHouseholdCounts(pnus, cache, fetchOne, { concurrency: 8 });

    expect(result.size).toBe(20);
    expect(result.get("P19")).toBe(19);
  });

  it("noopHouseholdCountLookup은 언제나 빈 Map이다", async () => {
    expect(await noopHouseholdCountLookup(["A", "B"])).toEqual(new Map());
  });

  it("noopHouseholdCountCache는 언제나 미스다", async () => {
    await noopHouseholdCountCache.setMany([["A", 100]]);
    expect(await noopHouseholdCountCache.getMany(["A", "B"])).toEqual([null, null]);
  });

  it("PNU가 많아도 캐시 왕복은 손에 꼽는다 — PNU마다 왕복하지 않는다", async () => {
    // 예전에는 읽기·쓰기가 PNU마다 한 번씩이었다. 단지 수백 개인 시군구
    // 하나면 그것만으로 수백 번의 네트워크 왕복이 된다.
    const cache = fakeCache();
    const pnus = Array.from({ length: 200 }, (_, i) => `P${i}`);
    const fetchOne = vi.fn(async () => 100);

    await lookupHouseholdCounts(pnus, cache, fetchOne, { concurrency: 8 });

    expect(cache.store.size).toBe(200); // 값은 전부 남았고…
    expect(cache.reads).toBe(1); // …왕복은 읽기 한 번,
    expect(cache.writes).toBe(1); // 쓰기 한 번이다.
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 시군구 일괄 조회 — 단건 수백 번을 한 번으로 바꾼다
 * ══════════════════════════════════════════════════════════════════
 *
 * 실측 근거(부산 해운대구): 단건 16건 동시 741ms × 15배치 ≈ 11초 vs
 * 시군구 일괄 1,290ms 한 번. 다만 **속도 장치일 뿐**이라, 일괄이 죽어도
 * 조회 자체는 단건으로 살아남아야 한다 — 아래가 그 경계를 잠근다.
 */
describe("lookupHouseholdCounts — 시군구 일괄", () => {
  /** PNU 앞 5자리가 시군구다(`pnu.ts`). 19자리를 흉내 낸다. */
  const pnu = (region: string, n: number) => region + String(n).padStart(14, "0");

  /** 미스가 한 배치를 넘어야 일괄로 간다 — 그 조건을 만족하는 수 */
  const MANY = HOUSEHOLD_COUNT_CONCURRENCY + 1;

  it("미스가 배치보다 많으면 시군구마다 한 번씩만 부른다 — 단건은 아예 안 부른다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    const fetchOne = vi.fn(async () => 999);
    const fetchByRegion = vi.fn(async () => new Map(pnus.map((p, i) => [p, i + 1])));

    const result = await lookupHouseholdCounts(pnus, cache, fetchOne, { fetchByRegion });

    expect(fetchByRegion).toHaveBeenCalledTimes(1);
    expect(fetchByRegion).toHaveBeenCalledWith("26350");
    expect(fetchOne).not.toHaveBeenCalled();
    expect(result.size).toBe(MANY);
    expect(result.get(pnus[0]!)).toBe(1);
  });

  it("시군구가 섞여 있으면 시군구마다 한 번씩 부른다", async () => {
    const cache = fakeCache();
    const a = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    const b = Array.from({ length: MANY }, (_, i) => pnu("11680", i));
    const fetchByRegion = vi.fn(async (region: string) =>
      new Map((region === "26350" ? a : b).map((p) => [p, 7])),
    );

    await lookupHouseholdCounts([...a, ...b], cache, vi.fn(), { fetchByRegion });

    expect(fetchByRegion.mock.calls.map((c) => c[0]).sort()).toEqual(["11680", "26350"]);
  });

  it("일괄로 구한 값도 캐시에 남긴다 — 다음 조회는 API를 안 부른다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    const fetchByRegion = vi.fn(async () => new Map(pnus.map((p) => [p, 42])));
    const fetchOne = vi.fn();

    await lookupHouseholdCounts(pnus, cache, fetchOne, { fetchByRegion });
    expect(cache.store.size).toBe(MANY);

    fetchByRegion.mockClear();
    const again = await lookupHouseholdCounts(pnus, cache, fetchOne, { fetchByRegion });
    expect(fetchByRegion).not.toHaveBeenCalled();
    expect(fetchOne).not.toHaveBeenCalled();
    expect(again.get(pnus[0]!)).toBe(42);
  });

  /** 이 검사가 이 describe에서 가장 중요하다 — 속도 장치가 죽어도 기능은 산다. */
  it("일괄이 던지면 그 시군구를 단건으로 되돌려 조회한다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    const fetchByRegion = vi.fn(async () => {
      throw new Error("일괄 조회 실패");
    });
    const fetchOne = vi.fn(async () => 55);

    const result = await lookupHouseholdCounts(pnus, cache, fetchOne, { fetchByRegion });

    expect(fetchOne).toHaveBeenCalledTimes(MANY);
    expect(result.size).toBe(MANY);
    expect(result.get(pnus[0]!)).toBe(55);
  });

  it("일괄 표에 없는 PNU는 단건으로 다시 묻지 않는다 — 같은 출처라 답이 같다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    // 절반만 표에 있다.
    const half = pnus.slice(0, Math.floor(MANY / 2));
    const fetchByRegion = vi.fn(async () => new Map(half.map((p) => [p, 3])));
    const fetchOne = vi.fn(async () => 999);

    const result = await lookupHouseholdCounts(pnus, cache, fetchOne, { fetchByRegion });

    expect(fetchOne).not.toHaveBeenCalled();
    expect(result.size).toBe(half.length);
  });

  it("미스가 배치 안에 들어오면 일괄을 쓰지 않는다 — 그때는 단건이 더 싸다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: HOUSEHOLD_COUNT_CONCURRENCY }, (_, i) => pnu("26350", i));
    const fetchByRegion = vi.fn();
    const fetchOne = vi.fn(async () => 11);

    await lookupHouseholdCounts(pnus, cache, fetchOne, { fetchByRegion });

    expect(fetchByRegion).not.toHaveBeenCalled();
    expect(fetchOne).toHaveBeenCalledTimes(HOUSEHOLD_COUNT_CONCURRENCY);
  });

  it("fetchByRegion을 안 주면 예전처럼 전부 단건으로 돈다", async () => {
    const cache = fakeCache();
    const pnus = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    const fetchOne = vi.fn(async () => 1);

    await lookupHouseholdCounts(pnus, cache, fetchOne);

    expect(fetchOne).toHaveBeenCalledTimes(MANY);
  });

  it("PNU가 5자리보다 짧아 시군구를 못 뽑으면 단건으로 보낸다", async () => {
    const cache = fakeCache();
    const good = Array.from({ length: MANY }, (_, i) => pnu("26350", i));
    const bad = "1234";
    const fetchByRegion = vi.fn(async () => new Map(good.map((p) => [p, 8])));
    const fetchOne = vi.fn(async () => 77);

    const result = await lookupHouseholdCounts([...good, bad], cache, fetchOne, { fetchByRegion });

    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(fetchOne).toHaveBeenCalledWith(bad);
    expect(result.get(bad)).toBe(77);
  });
});

