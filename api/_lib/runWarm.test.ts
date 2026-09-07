import { describe, expect, it, vi } from "vitest";
import { runWarm } from "./runWarm";

/**
 * 이 루프가 지켜야 하는 것은 넷이다 — **예산을 넘지 않는다**,
 * **이어받는다**, **한 바퀴를 넘겨 두 번 데우지 않는다**, **하나가
 * 실패해도 계속한다**. 앞의 셋은 국토부 일일 호출 한도와 함수 실행
 * 상한에 직결되고, 마지막 하나가 없으면 지역 한 곳의 장애가 크론
 * 전체를 멈춰 아무 지역도 안 데워진다.
 */
const REGIONS = Array.from({ length: 10 }, (_, i) => `R${i}`);

/** 부를 때마다 시계를 `stepMs`씩 미는 가짜. */
function fakeClock(stepMs: number) {
  let t = 0;
  return {
    now: () => t,
    advance: () => {
      t += stepMs;
    },
  };
}

describe("runWarm", () => {
  it("예산 안에 다 들어오면 한 바퀴를 돈다", async () => {
    const warmOne = vi.fn(async (_region: string) => {});
    const got = await runWarm({
      regions: REGIONS,
      startIndex: 0,
      warmOne,
      budgetMs: 60_000,
      concurrency: 5,
      now: () => 0, // 시간이 흐르지 않는다
    });

    expect(got.attempted).toBe(10);
    expect(got.warmed).toBe(10);
    expect(warmOne.mock.calls.map((c) => c[0])).toEqual(REGIONS);
  });

  it("한 바퀴를 넘겨 같은 지역을 두 번 데우지 않는다", async () => {
    // 예산이 무한해도 목록을 한 바퀴 돌면 멈춰야 한다 — 두 번째 바퀴는
    // 국토부 한도만 두 번 먹고 얻는 게 없다.
    const warmOne = vi.fn(async (_region: string) => {});
    const got = await runWarm({
      regions: REGIONS,
      startIndex: 0,
      warmOne,
      budgetMs: Number.MAX_SAFE_INTEGER,
      concurrency: 3,
      now: () => 0,
    });

    expect(got.attempted).toBe(10);
    expect(new Set(warmOne.mock.calls.map((c) => c[0])).size).toBe(10);
  });

  it("예산을 넘기면 새 묶음을 시작하지 않는다", async () => {
    const clock = fakeClock(4_000); // 묶음 하나에 4초
    const warmOne = vi.fn(async () => {
      clock.advance();
    });

    const got = await runWarm({
      regions: REGIONS,
      startIndex: 0,
      warmOne,
      budgetMs: 10_000,
      concurrency: 2,
      now: clock.now,
    });

    // 묶음마다 시계가 밀리므로 예산 10초 안에 도는 묶음은 몇 개뿐이다.
    expect(got.attempted).toBeLessThan(10);
    expect(got.attempted).toBeGreaterThan(0);
    expect(got.elapsedMs).toBeGreaterThanOrEqual(10_000);
  });

  it("다음 실행이 멈춘 자리에서 이어받는다", async () => {
    const clock = fakeClock(6_000);
    const first = await runWarm({
      regions: REGIONS,
      startIndex: 0,
      warmOne: async () => clock.advance(),
      budgetMs: 10_000,
      concurrency: 2,
      now: clock.now,
    });
    expect(first.nextIndex).toBe(first.attempted);

    const second = vi.fn(async (_region: string) => {});
    await runWarm({
      regions: REGIONS,
      startIndex: first.nextIndex,
      warmOne: second,
      budgetMs: 60_000,
      concurrency: 5,
      now: () => 0,
    });

    // 두 번째 실행은 첫 실행이 멈춘 지역부터 시작한다.
    expect(second.mock.calls[0]![0]).toBe(REGIONS[first.nextIndex]);
  });

  it("목록 끝에서 앞으로 감긴다", async () => {
    const warmOne = vi.fn(async (_region: string) => {});
    await runWarm({
      regions: REGIONS,
      startIndex: 8,
      warmOne,
      budgetMs: 60_000,
      concurrency: 4,
      now: () => 0,
    });
    expect(warmOne.mock.calls.slice(0, 4).map((c) => c[0])).toEqual(["R8", "R9", "R0", "R1"]);
  });

  it("커서가 목록 밖이면 처음부터 돈다 — 목록이 줄어도 멈추지 않는다", async () => {
    const warmOne = vi.fn(async (_region: string) => {});
    const got = await runWarm({
      regions: REGIONS,
      startIndex: 999,
      warmOne,
      budgetMs: 60_000,
      concurrency: 5,
      now: () => 0,
    });
    expect(warmOne.mock.calls[0]![0]).toBe("R0");
    expect(got.warmed).toBe(10);
  });

  /** 이 검사가 가장 중요하다 — 한 곳의 장애가 전체를 멈추면 안 된다. */
  it("한 지역이 던져도 나머지를 계속 데우고, 실패를 보고한다", async () => {
    const warmOne = vi.fn(async (region: string) => {
      if (region === "R3" || region === "R7") throw new Error("국토부 500");
    });

    const got = await runWarm({
      regions: REGIONS,
      startIndex: 0,
      warmOne,
      budgetMs: 60_000,
      concurrency: 4,
      now: () => 0,
    });

    expect(got.attempted).toBe(10);
    expect(got.warmed).toBe(8);
    expect(got.failed.sort()).toEqual(["R3", "R7"]);
  });

  it("데울 지역이 없으면 아무것도 하지 않는다", async () => {
    const warmOne = vi.fn(async (_region: string) => {});
    const got = await runWarm({
      regions: [],
      startIndex: 0,
      warmOne,
      budgetMs: 60_000,
      concurrency: 5,
      now: () => 0,
    });
    expect(warmOne).not.toHaveBeenCalled();
    expect(got).toMatchObject({ attempted: 0, warmed: 0, failed: [], nextIndex: 0 });
  });
});
