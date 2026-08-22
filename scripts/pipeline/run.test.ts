import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ComplexUnit } from "./aggregate";
import { DATA_DIR } from "./config";
import {
  assertRawNonEmpty,
  assertUnitsNonEmpty,
  currentRulesVersion,
  latestContractMonth,
  loadFetchLog,
  loadRawTrades,
  runPipeline,
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

  it("regions.json 설정에 없는 지역의 거래가 섞여 있으면 조용히 흘려보내지 않고 던진다 — I6", () => {
    // I6: 지역이 설정(regions.json)에서 빠진 뒤에도 그 지역의 raw 캐시
    // 파일이 남아 있으면, 예전에는 아무 필터링 없이 계속 complexes.json·
    // manifest.regionCodes로 흘러들었다. manifest.regionCodes는 "이 산출물이
    // 어느 지역을 담고 있다"를 주장하는 필드라, 설정과 어긋나면 그 자체로
    // 거짓말이 된다.
    writeCache(rawDir, "99999-202607.json", {
      trades: [trade({ regionCode: "99999" })],
      failures: 0,
    });

    expect(() => loadRawTrades(rawDir, ["11680", "11650"])).toThrow(/regions\.json|99999/);
  });

  it("regions.json 설정에 있는 지역만 있으면 정상 처리된다(회귀 방지) — I6", () => {
    writeCache(rawDir, "11680-202607.json", { trades: [trade({ regionCode: "11680" })], failures: 0 });

    expect(loadRawTrades(rawDir, ["11680", "11650"])).toHaveLength(1);
  });

  it("regions 인자를 생략하면 실제 regions.json(loadRegions())을 기본값으로 쓴다 — I6", () => {
    // 기존 테스트들이 두 번째 인자 없이 loadRawTrades(rawDir)를 부르고도
    // "11680"/"11650" 거래를 정상 처리하는 것 자체가 이 회귀 방지다 — 실제
    // regions.json에 두 코드가 있기 때문이다. 여기서는 실제 설정에 없는
    // 코드로 기본값 배선 자체를 직접 검증한다.
    writeCache(rawDir, "00000-202607.json", { trades: [trade({ regionCode: "00000" })], failures: 0 });

    expect(() => loadRawTrades(rawDir)).toThrow(/regions\.json|00000/);
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

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|1979|은마",
    complexName: "은마",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 1979,
    areaBucket: 84,
    medianPrice: 2_000_000_000,
    tradeCount: 5,
    minPrice: 1_900_000_000,
    maxPrice: 2_100_000_000,
    changeRate3m: 0.02,
    changeRate3mRecentCount: 3,
    changeRate3mPriorCount: 3,
    changeRate3mLowConfidence: false,
    changeRate12m: 0.1,
    changeRate12mRecentCount: 5,
    changeRate12mPriorCount: 5,
    changeRate12mLowConfidence: false,
    lowConfidence: false,
    ...overrides,
  };
}

describe("assertRawNonEmpty", () => {
  it("raw 거래가 0건이면 무엇이 잘못됐는지와 무엇을 해야 하는지를 말하며 던진다", () => {
    // 이 케이스가 리뷰에서 지적된 핵심 위험이다: 모든 raw 캐시 파일이 형식은
    // 멀쩡한 봉투인데 trades가 전부 []이면(예: API가 파라미터 오류로 200 + 빈
    // 응답만 계속 돌려주면) 지금까지는 파이프라인이 그대로 성공 종료했다.
    expect(() => assertRawNonEmpty([])).toThrow(/거래.*0건/);
    expect(() => assertRawNonEmpty([])).toThrow(/pipeline:fetch/);
  });

  it("raw 거래가 있으면 던지지 않는다", () => {
    expect(() => assertRawNonEmpty([trade()])).not.toThrow();
  });
});

describe("assertUnitsNonEmpty", () => {
  it("raw 거래는 있지만 집계 결과가 0개면 던진다", () => {
    // 예: raw 전체가 asOf 기준 최근 6개월 창 밖에 있으면 aggregate가 전부
    // 걸러내 units가 빈 배열이 된다. raw만 보는 assertRawNonEmpty로는 못 잡는다.
    expect(() => assertUnitsNonEmpty([trade()], [])).toThrow(/집계 결과가 0개/);
  });

  it("집계 결과가 있으면 던지지 않는다 (회귀 방지: 정상 데이터 경로는 막지 않는다)", () => {
    expect(() => assertUnitsNonEmpty([trade()], [unit()])).not.toThrow();
  });
});

describe("runPipeline: 빈 데이터 가드 (통합)", () => {
  let root: string;
  let rawDir: string;

  const OUTPUT_FILES = ["complexes.json", "regions.json", "manifest.json", "report.md", "README.md"];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "run-pipeline-integration-"));
    rawDir = join(root, "raw");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * 실제 data/ 아래 산출물 파일들의 mtime을 스냅샷한다. 파일이 없으면 null —
   * data/는 gitignore 대상이라 깨끗한 체크아웃·CI·동료 기계에는 아예 없을 수
   * 있다(이 파일들을 만드는 것은 emit()뿐이고, 이 스위트의 어떤 테스트도
   * emit()을 부르지 않는다). "없음"도 유효한 스냅샷 상태로 다뤄야
   * statSync가 ENOENT로 테스트 전체를 깨뜨리지 않는다.
   *
   * 이 스위트는 "가드가 emit() 도달 전에 멈춰서 실제 산출물을 절대 건드리지
   * 않는다"는 것을 증명해야 한다. emit()은 DATA_DIR을 하드코딩해서 쓰므로,
   * 진짜로 안 쓰였는지 확인하는 유일한 방법은 실제 data/ 파일의 mtime(또는
   * 부재)이 runPipeline 호출 전후로 그대로인지 보는 것이다.
   */
  function snapshotOutputMtimes(): Record<string, number | null> {
    const snapshot: Record<string, number | null> = {};
    for (const name of OUTPUT_FILES) {
      const path = join(DATA_DIR, name);
      snapshot[name] = existsSync(path) ? statSync(path).mtimeMs : null;
    }
    return snapshot;
  }

  it("모든 raw 파일이 trades: [] 봉투이면 실패하고 실제 산출물 파일을 하나도 건드리지 않는다", () => {
    writeCache(rawDir, "11680-202607.json", { trades: [], failures: 0 });
    writeCache(rawDir, "11650-202608.json", { trades: [], failures: 0 });

    const before = snapshotOutputMtimes();

    expect(() => runPipeline(new Date("2026-08-22T00:00:00Z"), rawDir)).toThrow(
      /거래.*0건/,
    );

    expect(snapshotOutputMtimes()).toEqual(before);
  });

  it("raw 거래는 있지만 asOf 기준 6개월 밖이라 집계가 비면 실패하고 실제 산출물을 건드리지 않는다", () => {
    writeCache(rawDir, "11680-202001.json", {
      trades: [trade({ contractDate: "2020-01-15" })],
      failures: 0,
    });

    const before = snapshotOutputMtimes();

    expect(() => runPipeline(new Date("2026-08-22T00:00:00Z"), rawDir)).toThrow(
      /집계 결과가 0개/,
    );

    expect(snapshotOutputMtimes()).toEqual(before);
  });
});
