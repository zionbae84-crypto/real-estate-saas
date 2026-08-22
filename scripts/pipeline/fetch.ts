import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, RAW_DIR, loadRegions } from "./config";
import { parseResponse } from "./parse-response";
import type { RawTrade } from "./types";

/** report(Task 6)가 "수집 실패"를 알려면 fetch가 남기는 이 로그가 필요하다. */
export interface FetchLogEntry {
  regionCode: string;
  yearMonth: string;
  status: "fetched" | "cached" | "empty" | "failed";
  tradeCount: number;
  failures: number;
  error?: string;
}

// 프로브(Task 1)로 확정된 엔드포인트. JSON을 지원하므로 XML 파서는 필요 없다.
const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
const KEY_ENV = "PUBLIC_DATA_API_KEY";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const THROTTLE_MS = 200;
const NUM_OF_ROWS = "1000";
const MONTHS_BACK = 12;

/** 이번 달부터 과거로 months개월치 (지역 × 월) 조합을 만든다. */
export function buildTargets(
  now: Date,
  months: number,
  regions: string[],
): Array<{ regionCode: string; yearMonth: string }> {
  const targets: Array<{ regionCode: string; yearMonth: string }> = [];
  for (let back = 0; back < months; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    for (const regionCode of regions) {
      targets.push({ regionCode, yearMonth: ym });
    }
  }
  return targets;
}

/** 캐시가 있고 이미 닫힌 달이면 건너뛴다. 이번 달은 계속 쌓이므로 다시 받는다. */
export function shouldSkip(yearMonth: string, now: Date, cacheExists: boolean): boolean {
  if (!cacheExists) return false;
  const current = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return yearMonth < current;
}

/**
 * 키가 새어나갈 수 있는 모든 문자열(로그, 에러 메시지, 파일)에 적용한다.
 * 원본뿐 아니라 URL 인코딩된 형태(encodeURIComponent/encodeURI)도 가린다 —
 * fetch 에러나 API 에러 응답이 키를 인코딩된 채로 되돌려주는 경우가 있어서다.
 */
export function redactKey(message: string, key: string): string {
  const forms = [key, encodeURIComponent(key), encodeURI(key)];
  let out = message;
  for (const form of forms) {
    if (form.length === 0) continue;
    out = out.split(form).join("<REDACTED>");
  }
  return out;
}

type Waiter = (ms: number) => Promise<void>;
const defaultWait: Waiter = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(regionCode: string, yearMonth: string, key: string): URL {
  const url = new URL(ENDPOINT);
  // serviceKey는 반드시 searchParams로 넣는다 — 이어붙이면(rawAppend) 403이 난다.
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("LAWD_CD", regionCode);
  url.searchParams.set("DEAL_YMD", yearMonth);
  url.searchParams.set("numOfRows", NUM_OF_ROWS);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("_type", "json");
  return url;
}

/** 429·5xx는 지수 백오프로 재시도한다. 그 외 4xx는 소용없으므로 즉시 실패한다. */
export async function fetchOne(
  regionCode: string,
  yearMonth: string,
  key: string,
  wait: Waiter = defaultWait,
): Promise<string> {
  const url = buildUrl(regionCode, yearMonth, key);
  let lastError = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await wait(BASE_BACKOFF_MS * 2 ** attempt);
    }

    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      // 네트워크 오류(타임아웃 등)는 재시도할 가치가 있다.
      // URL에는 키가 들어 있으므로 절대 메시지에 그대로 남기지 않는다.
      lastError = redactKey(e instanceof Error ? e.message : String(e), key);
      continue;
    }

    if (res.ok) return await res.text();
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`HTTP ${res.status}`);
    }
    lastError = `HTTP ${res.status}`;
  }

  throw new Error(lastError || "알 수 없는 실패");
}

interface FetchDeps {
  rawDir: string;
  dataDir: string;
  regions: string[];
  now: Date;
  months: number;
  key: string;
  wait: Waiter;
  throttle: Waiter;
}

/** 실제 수집 루프. 테스트가 주입할 수 있도록 모든 경로·시간·의존성을 인자로 받는다. */
export async function runFetch(deps: FetchDeps): Promise<FetchLogEntry[]> {
  mkdirSync(deps.rawDir, { recursive: true });
  const targets = buildTargets(deps.now, deps.months, deps.regions);
  const log: FetchLogEntry[] = [];

  for (const { regionCode, yearMonth } of targets) {
    const path = join(deps.rawDir, `${regionCode}-${yearMonth}.json`);

    if (shouldSkip(yearMonth, deps.now, existsSync(path))) {
      const cached = JSON.parse(readFileSync(path, "utf8")) as RawTrade[];
      log.push({ regionCode, yearMonth, status: "cached", tradeCount: cached.length, failures: 0 });
      continue;
    }

    try {
      const body = await fetchOne(regionCode, yearMonth, deps.key, deps.wait);
      const { trades, failures } = parseResponse(body);
      writeFileSync(path, JSON.stringify(trades, null, 2));
      log.push({
        regionCode,
        yearMonth,
        status: trades.length === 0 ? "empty" : "fetched",
        tradeCount: trades.length,
        failures,
      });
      console.log(`${regionCode} ${yearMonth}: ${trades.length}건 (파싱실패 ${failures})`);
    } catch (e) {
      // 이 달만 건너뛴다. 기존 캐시가 있어도 실패 시에는 덮어쓰지 않는다.
      const message = redactKey(e instanceof Error ? e.message : String(e), deps.key);
      log.push({ regionCode, yearMonth, status: "failed", tradeCount: 0, failures: 0, error: message });
      console.error(`${regionCode} ${yearMonth}: 실패 — ${message}`);
    }

    await deps.throttle(THROTTLE_MS);
  }

  writeFileSync(join(deps.dataDir, "fetch-log.json"), JSON.stringify(log, null, 2));
  return log;
}

export async function main(): Promise<void> {
  const key = process.env[KEY_ENV];
  if (!key) {
    console.error(
      `${KEY_ENV} 환경변수가 없습니다.\n` +
        `공공데이터포털(https://www.data.go.kr)에서 "아파트 매매 실거래가" 활용신청 후\n` +
        `발급된 키를 .env에 ${KEY_ENV}=... 로 넣어 주세요. .env는 gitignore 대상입니다.`,
    );
    process.exit(1);
  }

  const log = await runFetch({
    rawDir: RAW_DIR,
    dataDir: DATA_DIR,
    regions: loadRegions(),
    now: new Date(),
    months: MONTHS_BACK,
    key,
    wait: defaultWait,
    throttle: defaultWait,
  });

  const failed = log.filter((e) => e.status === "failed").length;
  console.log(`\n완료: ${log.length}건 중 실패 ${failed}건. 로그는 data/fetch-log.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
