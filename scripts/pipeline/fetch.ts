import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
  /**
   * 페이지네이션 중 데이터 손실 위험이 감지되면 true.
   * 페이지 상한에 걸리거나, totalCount를 읽지 못했는데 응답이 numOfRows만큼
   * 꽉 찼거나, 어떤 페이지에서도 진전(새 거래)이 없었던 경우다. 조용히
   * `status: "fetched"`로만 남기면 report(Task 6)가 잘림을 알 방법이 없다.
   */
  truncated?: boolean;
  /**
   * 캐시 파일이 손상돼(깨진 JSON, 봉투(객체) 형식이 아니거나 trades 필드가
   * 배열이 아님) 캐시 없음으로 취급하고 다시 받았으면 true. 재수집이 성공해도
   * 이 사실 자체는 드러나야 한다 — 디스크 손상이 조용히 "정상 캐시 히트"처럼
   * 보이면 안 된다.
   */
  cacheCorrupted?: boolean;
}

// 프로브(Task 1)로 확정된 엔드포인트. JSON을 지원하므로 XML 파서는 필요 없다.
const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
const KEY_ENV = "PUBLIC_DATA_API_KEY";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const THROTTLE_MS = 200;
const NUM_OF_ROWS = "1000";
const NUM_OF_ROWS_NUM = Number(NUM_OF_ROWS);
const MONTHS_BACK = 12;
/**
 * 시군구·월 "하나"에 대해 받을 최대 페이지 수(66개 시군구 전체에 곱하는 값이
 * 아니다 — 이 상한은 대상 하나하나에 독립적으로 적용된다). totalCount를 계속
 * 못 채워도 무한 루프에 빠지지 않도록 하는 상한이다. numOfRows(1000) × 20 =
 * 20,000건이면 시군구 하나의 한 달치 아파트 거래량으로 충분히 넉넉하다.
 */
export const MAX_PAGES = 20;

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

function buildUrl(regionCode: string, yearMonth: string, key: string, pageNo: number): URL {
  const url = new URL(ENDPOINT);
  // serviceKey는 반드시 searchParams로 넣는다 — 이어붙이면(rawAppend) 403이 난다.
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("LAWD_CD", regionCode);
  url.searchParams.set("DEAL_YMD", yearMonth);
  url.searchParams.set("numOfRows", NUM_OF_ROWS);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("_type", "json");
  return url;
}

/** 429·5xx는 지수 백오프로 재시도한다. 그 외 4xx는 소용없으므로 즉시 실패한다. */
export async function fetchOne(
  regionCode: string,
  yearMonth: string,
  key: string,
  wait: Waiter = defaultWait,
  pageNo = 1,
): Promise<string> {
  const url = buildUrl(regionCode, yearMonth, key, pageNo);
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

/**
 * 응답 본문에서 `response.body.totalCount`를 읽는다. 공공데이터포털 응답은
 * 이 필드를 숫자로도 문자열로도 보낼 수 있어 둘 다 받아준다. 본문을 JSON으로
 * 읽을 수 없거나 경로/타입이 예상과 다르면 null — 호출자가 잘림 위험으로
 * 다뤄야 한다는 신호다.
 */
function parseTotalCount(body: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const response = (parsed as Record<string, unknown>).response;
  if (typeof response !== "object" || response === null) return null;
  const responseBody = (response as Record<string, unknown>).body;
  if (typeof responseBody !== "object" || responseBody === null) return null;
  const totalCount = (responseBody as Record<string, unknown>).totalCount;
  if (typeof totalCount === "number" && Number.isFinite(totalCount)) return totalCount;
  if (typeof totalCount === "string" && totalCount.trim() !== "") {
    const n = Number(totalCount);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

interface PageAccumulator {
  trades: RawTrade[];
  failures: number;
  truncated: boolean;
}

/**
 * 한 시군구·월의 모든 페이지를 받아 합산한다.
 *
 * 잘림(truncated)으로 표시하는 경우:
 * - totalCount를 읽지 못했는데 이번 페이지가 numOfRows만큼 꽉 찼다(더 있을 수도
 *   있는데 확인할 방법이 없다).
 * - 목표(totalCount)에 못 미쳤는데 이번 페이지에서 새 항목이 하나도 없었다
 *   (진전 없음 — 서버가 이상하게 응답하고 있다).
 * - MAX_PAGES 상한에 걸렸는데 아직 목표에 못 미쳤다.
 *
 * 페이지 하나가 실패하면(fetchOne이 throw) 이 함수도 그대로 throw한다 —
 * 절반만 모은 데이터를 성공으로 둔갑시키지 않기 위해서다. 호출자가 그 시군구·
 * 월 전체를 실패로 기록해야 한다.
 */
async function fetchAllPages(
  regionCode: string,
  yearMonth: string,
  key: string,
  wait: Waiter,
): Promise<PageAccumulator> {
  const trades: RawTrade[] = [];
  let failures = 0;
  let cumulativeItems = 0;
  let truncated = false;

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const body = await fetchOne(regionCode, yearMonth, key, wait, pageNo);
    const parsed = parseResponse(body);
    trades.push(...parsed.trades);
    failures += parsed.failures;

    const itemsThisPage = parsed.trades.length + parsed.failures + parsed.cancelled;
    cumulativeItems += itemsThisPage;

    const totalCount = parseTotalCount(body);

    if (totalCount === null) {
      if (itemsThisPage >= NUM_OF_ROWS_NUM) truncated = true;
      break;
    }

    if (cumulativeItems >= totalCount) break;

    if (itemsThisPage === 0) {
      truncated = true;
      break;
    }

    if (pageNo === MAX_PAGES) {
      truncated = true;
      break;
    }
  }

  return { trades, failures, truncated };
}

/**
 * 임시 파일에 쓴 뒤 rename한다 — 쓰다가 끊겨도 반쪽 파일이 남지 않는다.
 * rename 자체가 실패하면(예: 대상 경로가 디렉터리) 임시 파일을 지우고
 * 원래 에러를 그대로 던진다 — 정리가 실패해도 원래 에러를 삼키지 않는다.
 */
function writeFileAtomic(path: string, data: string): void {
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, data);
  try {
    renameSync(tmpPath, path);
  } catch (renameError) {
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // 정리 실패는 무시한다 — 아래에서 원래 에러를 그대로 던진다.
    }
    throw renameError;
  }
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
    let cacheCorrupted = false;

    try {
      // 캐시가 있고 닫힌 달이면 캐시를 쓴다. 단, 캐시 읽기가 깨지면(이전 실행이
      // 쓰다가 끊겼거나 수동 편집·디스크 손상) 예외가 이 함수 전체를 뚫고
      // 나가지 않도록 보호하고, 캐시 없음으로 취급해 아래에서 다시 받는다.
      if (shouldSkip(yearMonth, deps.now, existsSync(path))) {
        try {
          const cached = readCache(path);
          log.push({
            regionCode,
            yearMonth,
            status: "cached",
            tradeCount: cached.trades.length,
            failures: cached.failures,
            // 잘린 채 캐시된 달은 이번 실행에서 다시 fetch하지 않으므로, 봉투에
            // 저장해 둔 truncated를 그대로 이어받아야 report(Task 6)가 계속
            // 알 수 있다 — 그렇지 않으면 캐시 적중 다음 실행부터 잘림이 사라진다.
            ...(cached.truncated ? { truncated: true } : {}),
          });
          continue;
        } catch {
          cacheCorrupted = true;
          // 아래로 이어져 캐시 없음 취급으로 다시 받는다.
        }
      }

      const { trades, failures, truncated } = await fetchAllPages(
        regionCode,
        yearMonth,
        deps.key,
        deps.wait,
      );
      const envelope: CacheEnvelope = {
        trades,
        failures,
        ...(truncated ? { truncated: true } : {}),
      };
      writeFileAtomic(path, JSON.stringify(envelope, null, 2));
      log.push({
        regionCode,
        yearMonth,
        status: trades.length === 0 ? "empty" : "fetched",
        tradeCount: trades.length,
        failures,
        ...(truncated ? { truncated: true } : {}),
        ...(cacheCorrupted ? { cacheCorrupted: true } : {}),
      });
      console.log(`${regionCode} ${yearMonth}: ${trades.length}건 (파싱실패 ${failures})`);
    } catch (e) {
      // 이 달만 건너뛴다. 기존 캐시가 있어도 실패 시에는 덮어쓰지 않는다.
      // 예상하지 못한 예외(예: 디스크 쓰기 오류)도 여기서 잡혀 이 대상만
      // 실패로 남고 나머지 대상 처리는 계속된다.
      const message = redactKey(e instanceof Error ? e.message : String(e), deps.key);
      log.push({
        regionCode,
        yearMonth,
        status: "failed",
        tradeCount: 0,
        failures: 0,
        error: message,
        ...(cacheCorrupted ? { cacheCorrupted: true } : {}),
      });
      console.error(`${regionCode} ${yearMonth}: 실패 — ${message}`);
    }

    await deps.throttle(THROTTLE_MS);
  }

  writeFileAtomic(join(deps.dataDir, "fetch-log.json"), JSON.stringify(log, null, 2));
  return log;
}

/**
 * 캐시 파일의 봉투 형식. 최상위가 RawTrade[]였던 옛 형식과 달리, 거래 배열과
 * 함께 수집 메타데이터(failures, truncated)를 담아 캐시 적중 시에도
 * FetchLogEntry를 정확히 재구성할 수 있게 한다 — 특히 truncated는 캐시
 * 적중 경로가 다시 fetch를 부르지 않으므로 봉투에 없으면 영영 사라진다.
 * 필드명은 FetchLogEntry의 대응 필드와 맞춘다.
 */
interface CacheEnvelope {
  trades: RawTrade[];
  failures: number;
  truncated?: boolean;
}

/**
 * 캐시 파일을 읽어 CacheEnvelope로 반환한다. 아직 실제 캐시 파일이 만들어진
 * 적이 없으므로(실제 수집은 Task 7에서 처음 돈다) 옛 배열 형식과의 호환은
 * 다루지 않는다 — 봉투(객체)가 아니거나 trades가 배열이 아니면 손상으로
 * 보고 throw한다. 호출자가 캐시 없음 취급으로 다시 받는다.
 */
function readCache(path: string): CacheEnvelope {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("캐시 파일이 봉투(객체) 형식이 아닙니다");
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.trades)) {
    throw new Error("캐시 봉투의 trades 필드가 배열이 아닙니다");
  }
  const failures = typeof obj.failures === "number" ? obj.failures : 0;
  return {
    trades: obj.trades as RawTrade[],
    failures,
    ...(obj.truncated === true ? { truncated: true } : {}),
  };
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

// `file://${process.argv[1]}`로 직접 비교하면 저장소 경로에 비-ASCII 문자가
// 있을 때(이 저장소의 실제 경로 "부동산 saas"가 그렇다) import.meta.url은
// 퍼센트 인코딩되는 반면 process.argv[1]은 원문 그대로라 항상 false가 되어
// npm run pipeline:fetch가 콘솔 출력도 에러도 없이 exit 0으로 조용히 아무
// 일도 안 한다 — "정상 종료"처럼 보이는 최악의 실패다. pathToFileURL로
// 양쪽을 같은 방식으로 인코딩해 비교한다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
