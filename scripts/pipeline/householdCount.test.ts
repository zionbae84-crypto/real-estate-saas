import { describe, expect, it, vi } from "vitest";
import {
  lookupHouseholdCounts,
  noopHouseholdCountCache,
  noopHouseholdCountLookup,
  type HouseholdCountCache,
} from "./householdCount";

function fakeCache(): HouseholdCountCache & { store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    store,
    async get(pnu) {
      return store.get(pnu) ?? null;
    },
    async set(pnu, count) {
      store.set(pnu, count);
    },
  };
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
      async get() {
        throw new Error("redis down");
      },
      async set() {},
    };
    const fetchOne = vi.fn(async () => 100);

    const result = await lookupHouseholdCounts(["A"], cache, fetchOne);

    expect(result.get("A")).toBe(100);
  });

  it("캐시 저장이 실패해도 이미 구한 값은 그대로 돌려준다", async () => {
    const cache: HouseholdCountCache = {
      async get() {
        return null;
      },
      async set() {
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

    const result = await lookupHouseholdCounts(pnus, cache, fetchOne, 8);

    expect(result.size).toBe(20);
    expect(result.get("P19")).toBe(19);
  });

  it("noopHouseholdCountLookup은 언제나 빈 Map이다", async () => {
    expect(await noopHouseholdCountLookup(["A", "B"])).toEqual(new Map());
  });

  it("noopHouseholdCountCache는 언제나 미스다", async () => {
    await noopHouseholdCountCache.set("A", 100);
    expect(await noopHouseholdCountCache.get("A")).toBeNull();
  });
});
