import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentRulesVersion,
  latestContractMonth,
  loadFetchLog,
  loadRawTrades,
} from "./run";
import type { RawTrade } from "./types";

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    complexName: "은마",
    builtYear: 1979,
    exclusiveAreaSqm: 84.3,
    floor: 5,
    price: 2_000_000_000,
    contractDate: "2026-06-15",
    ...overrides,
  };
}

function writeCache(dir: string, filename: string, data: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), JSON.stringify(data));
}

describe("loadRawTrades", () => {
  let root: string;
  let rawDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "run-pipeline-test-"));
    rawDir = join(root, "raw");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("raw 디렉터리가 없으면 fetch를 먼저 하라고 알려주며 던진다", () => {
    expect(() => loadRawTrades(rawDir)).toThrow(/pipeline:fetch/);
  });

  it("raw 디렉터리가 있지만 캐시 파일이 하나도 없으면 던진다", () => {
    mkdirSync(rawDir, { recursive: true });
    expect(() => loadRawTrades(rawDir)).toThrow(/pipeline:fetch/);
  });

  it("봉투 형식 캐시 파일 여러 개를 하나로 합친다", () => {
    writeCache(rawDir, "11680-202607.json", {
      trades: [trade({ complexName: "은마" })],
      failures: 0,
    });
    writeCache(rawDir, "11650-202607.json", {
      trades: [trade({ regionCode: "11650", complexName: "잠실주공" })],
      failures: 1,
    });

    const trades = loadRawTrades(rawDir);

    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.complexName).sort()).toEqual(["은마", "잠실주공"]);
  });

  it(".json이 아닌 파일은 무시한다", () => {
    writeCache(rawDir, "11680-202607.json", { trades: [trade()], failures: 0 });
    writeFileSync(join(rawDir, "README.txt"), "무시되어야 함");

    expect(loadRawTrades(rawDir)).toHaveLength(1);
  });

  it("캐시 파일 최상위가 옛 배열 형식이면 조용히 건너뛰지 않고 던진다", () => {
    // 이 케이스가 이 태스크의 핵심 위험이다: 봉투가 아닌 파일을 건너뛰면
    // 거래 0건인 채로 파이프라인이 "정상 종료"처럼 보인다.
    writeCache(rawDir, "11680-202607.json", [trade()]);

    expect(() => loadRawTrades(rawDir)).toThrow();
  });

  it("봉투이지만 trades가 배열이 아니면 던진다", () => {
    writeCache(rawDir, "11680-202607.json", { trades: "oops", failures: 0 });

    expect(() => loadRawTrades(rawDir)).toThrow();
  });

  it("일부 파일만 손상돼도(정상 파일이 먼저 읽혀도) 전체를 실패로 처리한다", () => {
    writeCache(rawDir, "a-11680-202607.json", { trades: [trade()], failures: 0 });
    writeCache(rawDir, "b-11650-202607.json", [trade()]);

    expect(() => loadRawTrades(rawDir)).toThrow();
  });
});

describe("loadFetchLog", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "run-pipeline-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("fetch-log.json이 없으면 빈 배열", () => {
    expect(loadFetchLog(root)).toEqual([]);
  });

  it("배열 형식이면 그대로 반환한다", () => {
    const log = [
      { regionCode: "11680", yearMonth: "202607", status: "fetched", tradeCount: 3, failures: 0 },
    ];
    writeFileSync(join(root, "fetch-log.json"), JSON.stringify(log));
    expect(loadFetchLog(root)).toEqual(log);
  });

  it("배열이 아니면 빈 배열로 취급한다", () => {
    writeFileSync(join(root, "fetch-log.json"), JSON.stringify({ oops: true }));
    expect(loadFetchLog(root)).toEqual([]);
  });
});

describe("latestContractMonth", () => {
  it("가장 최근 계약월을 YYYY-MM으로 반환한다", () => {
    const trades = [
      trade({ contractDate: "2026-03-01" }),
      trade({ contractDate: "2026-07-20" }),
      trade({ contractDate: "2026-01-15" }),
    ];
    expect(latestContractMonth(trades)).toBe("2026-07");
  });

  it("거래가 없으면 빈 문자열", () => {
    expect(latestContractMonth([])).toBe("");
  });
});

describe("currentRulesVersion", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "run-pipeline-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("version 필드를 문자열로 읽는다", () => {
    const path = join(root, "rules.json");
    writeFileSync(path, JSON.stringify({ version: "2026-03" }));
    expect(currentRulesVersion(path)).toBe("2026-03");
  });

  it("version 필드가 없거나 문자열이 아니면 unknown", () => {
    const path = join(root, "rules.json");
    writeFileSync(path, JSON.stringify({ version: 42 }));
    expect(currentRulesVersion(path)).toBe("unknown");
  });
});
