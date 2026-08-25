import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_SCHEMA_VERSION,
  MAX_PAGES,
  buildTargets,
  fetchOne,
  redactKey,
  runFetch,
  shouldSkip,
} from "./fetch";

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
  aptSeq: "11680-314",
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
    mkdtempCache(rawDir, "11680-202607.json", {
      trades: [{ dummy: true }, { dummy: true }],
      failures: 0,
    });

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
      cancelled: 0,
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
    expect(written.trades).toHaveLength(1);
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

function gatewayErrorXml(): string {
  return (
    "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>" +
    "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>" +
    "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"
  );
}

function serviceErrorJson(resultCode: string, resultMsg: string): unknown {
  return {
    response: {
      header: { resultCode, resultMsg },
      body: { items: "", numOfRows: 10, pageNo: 1, totalCount: 0 },
    },
  };
}

describe("runFetch — C1: HTTP 200 오류 응답을 거래 없음과 구분한다", () => {
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

  it("게이트웨이 XML(HTTP 200, JSON 아님)은 실패로 기록되고 캐시를 남기지 않는다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(gatewayErrorXml(), { status: 200 }));
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

    expect(log[0]).toMatchObject({ status: "failed", tradeCount: 0 });
    expect(log[0]?.error).toBeDefined();
    expect(existsSync(join(rawDir, "11680-202608.json"))).toBe(false);
  });

  it("성공이 아닌 resultCode를 담은 JSON(HTTP 200)은 실패로 기록되고 캐시를 남기지 않는다", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(serviceErrorJson("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR")));
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

    expect(log[0]).toMatchObject({ status: "failed", tradeCount: 0 });
    expect(log[0]?.error).toContain("22");
    expect(existsSync(join(rawDir, "11680-202608.json"))).toBe(false);
  });

  it("진짜 거래 0건 응답(resultCode 000, items 빈 문자열)은 정상적으로 empty로 기록되고 캐시된다", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(serviceErrorJson("000", "OK")));
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
    expect(existsSync(join(rawDir, "11680-202608.json"))).toBe(true);
  });

  it("오류 응답 실패 메시지에 요청 URL이나 서비스키가 섞이지 않는다", async () => {
    const key = "leak-if-not-redacted";
    const fetchMock = vi.fn().mockImplementation(async () => new Response(gatewayErrorXml(), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 1,
      key,
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    expect(log[0]?.error).toBeDefined();
    expect(log[0]?.error ?? "").not.toContain(key);
  });
});

function pageBody(itemCount: number, totalCount: number | string): unknown {
  const item =
    itemCount === 0
      ? ""
      : itemCount === 1
        ? SAMPLE_ITEM
        : Array.from({ length: itemCount }, () => SAMPLE_ITEM);
  return { response: { body: { totalCount, items: itemCount === 0 ? "" : { item } } } };
}

describe("runFetch — 페이지네이션·캐시 견고성", () => {
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

  it("totalCount가 numOfRows보다 크면 다음 페이지를 받아 합산한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pageBody(1000, 1500)))
      .mockResolvedValueOnce(jsonResponse(pageBody(500, 1500)));
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = fetchMock.mock.calls[0]?.[0] as URL;
    const secondUrl = fetchMock.mock.calls[1]?.[0] as URL;
    expect(firstUrl.searchParams.get("pageNo")).toBe("1");
    expect(secondUrl.searchParams.get("pageNo")).toBe("2");
    expect(log[0]).toMatchObject({ status: "fetched", tradeCount: 1500, failures: 0 });
    expect(log[0]?.truncated).toBeUndefined();
    const written = JSON.parse(readFileSync(join(rawDir, "11680-202608.json"), "utf8"));
    expect(written.trades).toHaveLength(1500);
    expect(written.truncated).toBeUndefined();
  });

  it("totalCount가 문자열이어도 페이지네이션이 동작한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pageBody(1000, "1500")))
      .mockResolvedValueOnce(jsonResponse(pageBody(500, "1500")));
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log[0]).toMatchObject({ status: "fetched", tradeCount: 1500 });
  });

  it("페이지 상한에 걸리면 조용히 통과시키지 않고 잘림 신호를 남긴다", async () => {
    // Response 본문은 한 번만 읽을 수 있으므로 호출마다 새 Response를 만들어야 한다.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(pageBody(1000, 100_000)));
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

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock.mock.calls.length).toBe(MAX_PAGES);
    expect(log[0]?.truncated).toBe(true);
    expect(log[0]?.status).not.toBe("failed");
  });

  it("페이지에 새 거래가 0건인데 목표에 못 미치면 진전없음으로 멈추고 잘림 신호를 남긴다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(pageBody(0, 1500)));
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
    expect(log[0]?.truncated).toBe(true);
  });

  it("중간 페이지가 실패하면 해당 시군구·월 전체가 실패로 기록되고 캐시가 남지 않는다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pageBody(1000, 1500)))
      .mockResolvedValue(new Response("등록되지 않은 서비스키", { status: 403 }));
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

    expect(log[0]).toMatchObject({ status: "failed", tradeCount: 0 });
    expect(existsSync(join(rawDir, "11680-202608.json"))).toBe(false);
  });

  it("캐시 파일이 깨진 JSON이면 캐시 없음으로 취급해 재수집하고 그 사실을 로그에 남긴다", async () => {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "11680-202607.json"), "{not valid json");
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.status).not.toBe("cached");
    expect(entry?.cacheCorrupted).toBe(true);
    // 예외가 새어나가지 않고 fetch-log.json이 정상적으로 쓰였는지도 확인한다.
    expect(existsSync(join(dataDir, "fetch-log.json"))).toBe(true);
  });

  it("캐시가 봉투 형식이 아니면(trades 필드 없음) 손상으로 취급한다", async () => {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "11680-202607.json"), JSON.stringify({ not: "an array" }));
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

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

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.cacheCorrupted).toBe(true);
  });

  it("한 대상이 예상 못한 예외를 던져도 나머지 대상의 로그가 fetch-log.json에 남는다", async () => {
    // 11680의 캐시 경로 자리에 디렉터리를 만들어 원자적 쓰기(rename)가 실패하게 한다 —
    // fetchOne/parseResponse가 아닌, 전혀 다른 종류의 예상 못한 예외를 시뮬레이션한다.
    mkdirSync(join(rawDir, "11680-202608.json"), { recursive: true });
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680", "11650"],
      now,
      months: 1,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    expect(log).toHaveLength(2);
    const badEntry = log.find((e) => e.regionCode === "11680");
    const goodEntry = log.find((e) => e.regionCode === "11650");
    expect(badEntry?.status).toBe("failed");
    expect(badEntry?.error).toBeDefined();
    expect(goodEntry).toMatchObject({ status: "fetched", tradeCount: 1 });
    const logPath = join(dataDir, "fetch-log.json");
    expect(existsSync(logPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(logPath, "utf8")) as unknown[];
    expect(parsed).toHaveLength(2);
  });
});

describe("runFetch — 캐시 봉투와 잘림 표시 영속화", () => {
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

  // 202608(이번 달)이 존재하면 재수집 대상이 되어 버리므로, "지난 달" 캐시 하나만
  // 보도록 now를 202608로 두고 202607 캐시를 검사한다. months=1이면 대상은
  // 202608뿐이라, 캐시 히트를 확인하려면 202607을 대상에 넣어야 한다 — months=2로
  // 이번 달(202608, fetch mock 필요)과 지난 달(202607, 캐시 히트) 둘 다 대상에 넣는다.
  const now = new Date("2026-08-22T00:00:00Z");

  it("잘린 채 캐시된 달은 다음 실행에서도 캐시 적중 시 잘림 표시가 남는다", async () => {
    mkdtempCache(rawDir, "11680-202607.json", {
      trades: [{ dummy: true }],
      failures: 0,
      truncated: true,
    });
    // 이번 달(202608)은 캐시가 있어도 무조건 다시 받으므로 fetch가 최소 1번은
    // 불린다. mockResolvedValue로 같은 Response 인스턴스를 재사용하면 두 번째
    // 호출에서 "body already read"가 나므로 호출마다 새 Response를 만든다.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry).toEqual({
      regionCode: "11680",
      yearMonth: "202607",
      status: "cached",
      tradeCount: 1,
      failures: 0,
      cancelled: 0,
      truncated: true,
    });
  });

  it("정상적으로 캐시된 달은 잘림 표시가 붙지 않는다", async () => {
    mkdtempCache(rawDir, "11680-202607.json", {
      trades: [{ dummy: true }],
      failures: 0,
    });
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.truncated).toBeUndefined();
    expect(entry).toEqual({
      regionCode: "11680",
      yearMonth: "202607",
      status: "cached",
      tradeCount: 1,
      failures: 0,
      cancelled: 0,
    });
  });

  it("캐시 파일이 봉투가 아닌 옛 배열 형식이면 손상으로 보고 재수집하며 로그에 남긴다", async () => {
    // Task 6 이전 세대의 캐시 형식(최상위가 RawTrade[]). 봉투가 아니므로 손상으로 처리해야 한다.
    mkdtempCache(rawDir, "11680-202607.json", [{ dummy: true }, { dummy: true }]);
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.status).not.toBe("cached");
    expect(entry?.cacheCorrupted).toBe(true);
  });

  it("캐시 봉투의 trades 필드가 배열이 아니면 손상으로 취급한다", async () => {
    mkdtempCache(rawDir, "11680-202607.json", { trades: "not-an-array", failures: 0 });
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(1)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.cacheCorrupted).toBe(true);
  });
});

describe("runFetch — I5: cancelled(해제 거래)이 로그·캐시 봉투에 남는다", () => {
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

  function cancelledBody(): unknown {
    return {
      response: {
        header: { resultCode: "000", resultMsg: "OK" },
        body: { items: { item: [{ ...SAMPLE_ITEM, cdealType: "O" }, SAMPLE_ITEM] } },
      },
    };
  }

  it("해제된 거래는 fetch-log에 cancelled로 남는다 — I5", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(cancelledBody()));
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

    expect(log[0]).toMatchObject({ status: "fetched", tradeCount: 1, cancelled: 1 });
  });

  it("해제 건수가 캐시 봉투에도 저장된다 — I5", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(cancelledBody()));
    vi.stubGlobal("fetch", fetchMock);

    await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 1,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const written = JSON.parse(readFileSync(join(rawDir, "11680-202608.json"), "utf8"));
    expect(written.cancelled).toBe(1);
  });

  it("캐시 적중 시에도 캐시 봉투의 cancelled가 로그로 이어진다 — I5", async () => {
    mkdtempCache(rawDir, "11680-202607.json", {
      trades: [{ dummy: true }],
      failures: 0,
      cancelled: 3,
    });
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.cancelled).toBe(3);
  });

  it("cancelled 필드가 없는 옛 캐시 봉투는 0으로 취급한다(하위호환)", async () => {
    mkdtempCache(rawDir, "11680-202607.json", {
      trades: [{ dummy: true }],
      failures: 0,
    });
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(sampleBody(0)));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now,
      months: 2,
      key: "key",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });

    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.cancelled).toBe(0);
  });
});

/**
 * 캐시 파일을 쓴다. `schemaVersion`을 명시하지 않으면 현재 버전을 붙인다 —
 * 이 헬퍼를 쓰는 테스트 대부분은 "형식은 최신인데 내용이 이러할 때"를 본다.
 * 버전 불일치 자체는 그것만 보는 테스트에서 직접 넘겨 확인한다.
 */
function mkdtempCache(rawDir: string, filename: string, data: unknown): void {
  mkdirSync(rawDir, { recursive: true });
  const withVersion =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? { schemaVersion: CACHE_SCHEMA_VERSION, ...(data as Record<string, unknown>) }
      : data;
  writeFileSync(join(rawDir, filename), JSON.stringify(withVersion));
}

describe("fetchAllPages (export 확인)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("모듈 바깥에서 호출할 수 있다", async () => {
    const { fetchAllPages } = await import("./fetch");
    const fake = async () => JSON.stringify({
      response: {
        header: { resultCode: "000" },
        body: { totalCount: 0, items: "" },
      },
    });
    // fetchOne이 내부에서 fetch를 쓰므로 globalThis.fetch를 모의한다.
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(await fake(), { status: 200 })) as typeof fetch;
    try {
      const result = await fetchAllPages("11680", "202601", "dummy-key", async () => {});
      expect(result.trades).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("MONTHS_BACK은 12다", async () => {
    const { MONTHS_BACK } = await import("./fetch");
    expect(MONTHS_BACK).toBe(12);
  });
});

describe("캐시 형식 버전 — 옛 캐시를 조용히 읽지 않는다", () => {
  let root: string;
  let rawDir: string;
  let dataDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "fetch-schema-test-"));
    rawDir = join(root, "raw");
    dataDir = root;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  /** 닫힌 달(캐시 적중 경로가 도는 달)에 봉투를 심어 두고 fetch를 돌린다. */
  async function runWithCache(envelope: Record<string, unknown>) {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "11680-202607.json"), JSON.stringify(envelope));
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(sampleBody(1))));
    vi.stubGlobal("fetch", fetchMock);
    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now: new Date("2026-08-15T00:00:00Z"),
      months: 2,
      key: "k",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });
    return { log, fetchMock, entry: log.find((e) => e.yearMonth === "202607") };
  }

  it("schemaVersion이 없는 옛 봉투는 캐시 없음으로 보고 다시 받는다", async () => {
    const { entry } = await runWithCache({ trades: [{ dummy: true }], failures: 0, cancelled: 0 });
    expect(entry?.status).toBe("fetched");
    expect(entry?.cacheSchemaMismatch).toBe(true);
  });

  it("schemaVersion이 다르면 캐시 없음으로 보고 다시 받는다", async () => {
    const { entry } = await runWithCache({
      schemaVersion: CACHE_SCHEMA_VERSION + 1,
      trades: [{ dummy: true }],
      failures: 0,
      cancelled: 0,
    });
    expect(entry?.status).toBe("fetched");
    expect(entry?.cacheSchemaMismatch).toBe(true);
  });

  it("형식 불일치를 캐시 손상으로 세지 않는다 — 사람이 할 일이 다르다", async () => {
    const { entry } = await runWithCache({ trades: [{ dummy: true }], failures: 0, cancelled: 0 });
    expect(entry?.cacheCorrupted).toBeUndefined();
  });

  it("진짜 손상은 여전히 cacheCorrupted로 센다 — 형식 불일치와 뭉치지 않는다", async () => {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "11680-202607.json"), "{ 깨진 JSON");
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(sampleBody(1))));
    vi.stubGlobal("fetch", fetchMock);
    const log = await runFetch({
      rawDir,
      dataDir,
      regions: ["11680"],
      now: new Date("2026-08-15T00:00:00Z"),
      months: 2,
      key: "k",
      wait: NO_WAIT,
      throttle: NO_WAIT,
    });
    const entry = log.find((e) => e.yearMonth === "202607");
    expect(entry?.cacheCorrupted).toBe(true);
    expect(entry?.cacheSchemaMismatch).toBeUndefined();
  });

  it("현재 버전 봉투는 그대로 캐시 적중이다 — 매번 다시 받지 않는다", async () => {
    const { entry, fetchMock } = await runWithCache({
      schemaVersion: CACHE_SCHEMA_VERSION,
      trades: [{ dummy: true }],
      failures: 0,
      cancelled: 0,
    });
    expect(entry?.status).toBe("cached");
    expect(entry?.cacheSchemaMismatch).toBeUndefined();
    // 이번 달(202608)만 부르고 닫힌 달은 캐시를 썼다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("새로 쓰는 봉투에는 현재 schemaVersion이 박힌다", async () => {
    await runWithCache({ trades: [{ dummy: true }], failures: 0, cancelled: 0 });
    const written = JSON.parse(readFileSync(join(rawDir, "11680-202607.json"), "utf8")) as {
      schemaVersion?: unknown;
    };
    expect(written.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
  });
});

