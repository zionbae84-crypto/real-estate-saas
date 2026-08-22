import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTargets, fetchOne, redactKey, runFetch, shouldSkip } from "./fetch";

describe("buildTargets", () => {
  it("지역 × 개월 수만큼 만든다", () => {
    const targets = buildTargets(new Date("2026-08-22T00:00:00Z"), 3, ["11680", "11650"]);
    expect(targets).toHaveLength(6);
  });

  it("이번 달부터 과거로 거슬러 만든다", () => {
    const targets = buildTargets(new Date("2026-08-22T00:00:00Z"), 3, ["11680"]);
    expect(targets.map((t) => t.yearMonth)).toEqual(["202608", "202607", "202606"]);
  });

  it("연도 경계를 넘는다", () => {
    const targets = buildTargets(new Date("2026-02-10T00:00:00Z"), 3, ["11680"]);
    expect(targets.map((t) => t.yearMonth)).toEqual(["202602", "202601", "202512"]);
  });
});

describe("shouldSkip", () => {
  const now = new Date("2026-08-22T00:00:00Z");

  it("캐시가 없으면 건너뛰지 않는다", () => {
    expect(shouldSkip("202607", now, false)).toBe(false);
  });

  it("지난 달 이전이고 캐시가 있으면 건너뛴다", () => {
    expect(shouldSkip("202607", now, true)).toBe(true);
  });

  it("이번 달은 캐시가 있어도 다시 받는다 — 거래가 계속 쌓인다", () => {
    expect(shouldSkip("202608", now, true)).toBe(false);
  });
});

describe("redactKey", () => {
  it("원본·encodeURIComponent·encodeURI 세 형태를 모두 가린다", () => {
    const key = "ab+cd/ef=gh";
    const message = `실패: ${key} / ${encodeURIComponent(key)} / ${encodeURI(key)}`;
    const redacted = redactKey(message, key);
    expect(redacted).not.toContain(key);
    expect(redacted).not.toContain(encodeURIComponent(key));
    expect(redacted).not.toContain(encodeURI(key));
  });

  it("빈 문자열 키는 통째로 치환하지 않는다(무한 매칭 방지)", () => {
    expect(redactKey("아무 메시지", "")).toBe("아무 메시지");
  });
});

const NO_WAIT = async () => {};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const SAMPLE_ITEM = {
  sggCd: "11680",
  umdNm: "수서동",
  aptNm: "까치마을",
  buildYear: 1993,
  excluUseAr: "34.44",
  floor: "6",
  dealAmount: "145,000",
  dealYear: "2026",
  dealMonth: "6",
  dealDay: "20",
  cdealType: "",
};

function sampleBody(itemCount: number): unknown {
  const item =
    itemCount === 0
      ? ""
      : itemCount === 1
        ? SAMPLE_ITEM
        : Array.from({ length: itemCount }, () => SAMPLE_ITEM);
  return { response: { body: { items: itemCount === 0 ? "" : { item } } } };
}

describe("fetchOne", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serviceKey를 searchParams로 붙인다(이어붙이지 않는다)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchOne("11680", "202608", "ab+cd/ef", NO_WAIT);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl).toBeInstanceOf(URL);
    expect(calledUrl.searchParams.get("serviceKey")).toBe("ab+cd/ef");
    expect(calledUrl.searchParams.get("_type")).toBe("json");
  });

  it("5xx는 재시도하다가 결국 성공하면 본문을 돌려준다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("서버 오류", { status: 500 }))
      .mockResolvedValueOnce(new Response("서버 오류", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

    const body = await fetchOne("11680", "202608", "key", NO_WAIT);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(body)).toBeTruthy();
  });

  it("429는 재시도한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchOne("11680", "202608", "key", NO_WAIT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("재시도해도 소용없는 4xx는 즉시 실패하고 더 이상 재시도하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("등록되지 않은 서비스키", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOne("11680", "202608", "key", NO_WAIT)).rejects.toThrow("HTTP 403");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("모든 시도가 네트워크 오류로 실패하면 에러 메시지에 키가 섞이지 않는다", async () => {
    const key = "super-secret-key";
    const fetchMock = vi.fn().mockRejectedValue(new Error(`fetch failed: ...${key}...`));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOne("11680", "202608", key, NO_WAIT)).rejects.toSatisfy((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      return !message.includes(key);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("백오프 대기 함수가 시도 사이에 지수적으로 커지는 ms로 호출된다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);
    const wait = vi.fn().mockResolvedValue(undefined);

    await fetchOne("11680", "202608", "key", wait);

    expect(wait.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });
});

describe("runFetch", () => {
  let rawDir: string;
  let dataDir: string;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "fetch-pipeline-test-"));
    rawDir = join(root, "raw");
    dataDir = root;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  const now = new Date("2026-08-22T00:00:00Z");

  it("캐시가 있는 지난 달은 건너뛰고 캐시 건수를 로그에 남긴다", async () => {
    // months=2 → 대상은 202608(이번 달, 캐시 없음)과 202607(지난 달, 캐시 있음).
    // 이번 달은 캐시가 없으므로 어차피 호출해야 한다 — fetchMock에 응답을 준비해 두고,
    // "지난 달은 부르지 않았다"만 별도로 검증한다.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);
    mkdtempCache(rawDir, "11680-202607.json", [{ dummy: true }, { dummy: true }]);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now: new Date("2026-08-01T00:00:00Z"),
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.searchParams.get("DEAL_YMD")).toBe("202608");
    const cachedEntry = log.find((e) => e.yearMonth === "202607");
    expect(cachedEntry).toEqual({
      regionCode: "11680",
      yearMonth: "202607",
      status: "cached",
      tradeCount: 2,
      failures: 0,
    });
  });

  it("이번 달은 캐시가 있어도 API를 불러 덮어쓴다", async () => {
    mkdtempCache(rawDir, "11680-202608.json", [{ old: true }]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 1,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log[0]).toMatchObject({ status: "fetched", tradeCount: 1, failures: 0 });
    const written = JSON.parse(readFileSync(join(rawDir, "11680-202608.json"), "utf8"));
    expect(written).toHaveLength(1);
  });

  it("거래가 없으면 status는 empty이고 빈 배열을 캐시로 남긴다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 1,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    expect(log[0]).toMatchObject({ status: "empty", tradeCount: 0 });
  });

  it("수집이 실패하면 기존 캐시를 덮어쓰지 않고 failed로 남긴다", async () => {
    mkdtempCache(rawDir, "11680-202608.json", [{ kept: true }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response("등록되지 않은 서비스키", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 1,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    expect(log[0]).toMatchObject({ status: "failed", tradeCount: 0, failures: 0 });
    expect(log[0]?.error).toBeDefined();
    const untouched = JSON.parse(readFileSync(join(rawDir, "11680-202608.json"), "utf8"));
    expect(untouched).toEqual([{ kept: true }]);
  });

  it("fetch-log.json을 dataDir에 쓰고, 실패 메시지에 섞인 키를 가린다", async () => {
    const key = "leak-if-not-redacted";
    const fetchMock = vi.fn().mockRejectedValue(new Error(`network down ${key}`));
    vi.stubGlobal("fetch", fetchMock);

    await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 1,
      key,
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const logPath = join(dataDir, "fetch-log.json");
    expect(existsSync(logPath)).toBe(true);
    const raw = readFileSync(logPath, "utf8");
    expect(raw).not.toContain(key);
    const parsed = JSON.parse(raw);
    expect(parsed[0].status).toBe("failed");
  });
});

function mkdtempCache(rawDir: string, filename: string, data: unknown): void {
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(join(rawDir, filename), JSON.stringify(data));
}
