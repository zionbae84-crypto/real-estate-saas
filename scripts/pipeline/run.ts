import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { aggregate } from "./aggregate";
import { DATA_DIR, RAW_DIR, loadReportConfig } from "./config";
import { emit } from "./emit";
import type { FetchLogEntry } from "./fetch";
import { normalizeAll } from "./normalize";
import { buildReport } from "./report";
import type { RawTrade } from "./types";

const RULES_PATH = join(DATA_DIR, "..", "rules", "2026-03.json");

/**
 * data/raw/*.json 캐시 파일의 봉투 형식. fetch.ts의 (export되지 않은)
 * CacheEnvelope와 같은 모양이다. fetch.ts의 시그니처는 바꾸지 않으므로
 * 여기서 형식 판정 기준만 다시 정의한다.
 */
interface CacheEnvelope {
  trades: RawTrade[];
  failures: number;
  truncated?: boolean;
}

function isCacheEnvelope(value: unknown): value is CacheEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).trades);
}

/**
 * raw/의 모든 캐시 파일을 읽어 하나로 합친다.
 *
 * 캐시 파일은 최상위가 RawTrade[]가 아니라 봉투 { trades, failures, truncated? }
 * 형식이다(fetch.ts 참고). 봉투가 아니거나 trades가 배열이 아닌 파일을 만나면
 * **조용히 건너뛰지 않고 즉시 던진다.** 건너뛰면 그 시군구·월의 거래가 통째로
 * 사라진 채 파이프라인이 "정상 종료"처럼 보인다 — 이 제품은 "사지 말아야 할
 * 때를 말해주는 것"이 방침이므로, 데이터가 조용히 빠진 완전한 결과보다는
 * 크래시가 낫다. 사람이 놓칠 수 없어야 한다.
 *
 * 디렉터리가 없거나 캐시 파일이 하나도 없을 때도 같은 이유로 던진다 — 0건짜리
 * complexes.json이 조용히 만들어지면 그것도 "데이터가 없다"는 사실을 감춘다.
 */
export function loadRawTrades(dir: string = RAW_DIR): RawTrade[] {
  if (!existsSync(dir)) {
    throw new Error(`${dir}가 없습니다. 먼저 npm run pipeline:fetch 를 실행하세요.`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`${dir}에 캐시 파일이 없습니다. 먼저 npm run pipeline:fetch 를 실행하세요.`);
  }

  const trades: RawTrade[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isCacheEnvelope(parsed)) {
      throw new Error(
        `${file}: 캐시 파일이 봉투(객체 { trades, failures }) 형식이 아니거나 ` +
          `trades 필드가 배열이 아닙니다. 디스크 손상이거나 옛 배열 형식일 수 ` +
          `있습니다. 이 파일을 건너뛰면 거래가 조용히 빠진 채 파이프라인이 ` +
          `정상 종료된 것처럼 보이므로, 건너뛰는 대신 여기서 멈춥니다.`,
      );
    }
    trades.push(...parsed.trades);
  }
  return trades;
}

/**
 * data/fetch-log.json을 읽는다. 없거나 배열이 아니면 빈 배열.
 *
 * 이 로그는 report의 "수집 실패/잘림/캐시손상" 절에만 쓰이고 complexes.json
 * 자체의 신뢰도(즉 raw 거래 수)에는 영향을 주지 않으므로, loadRawTrades와
 * 달리 빈 배열로 조용히 폴백해도 "데이터가 있는 척"하는 위험이 없다.
 */
export function loadFetchLog(dataDir: string = DATA_DIR): FetchLogEntry[] {
  const path = join(dataDir, "fetch-log.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return Array.isArray(parsed) ? (parsed as FetchLogEntry[]) : [];
}

/** 수집된 거래 중 가장 최근 계약월(YYYY-MM). manifest의 dataAsOf가 된다. */
export function latestContractMonth(trades: RawTrade[]): string {
  let latest = "";
  for (const t of trades) {
    const month = t.contractDate.slice(0, 7);
    if (month > latest) latest = month;
  }
  return latest;
}

/** 규제 룰셋 버전을 읽는다. version 필드가 없거나 문자열이 아니면 "unknown". */
export function currentRulesVersion(path: string = RULES_PATH): string {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
  return typeof raw.version === "string" ? raw.version : "unknown";
}

/**
 * fetch를 제외한 나머지 전 단계(parse는 fetch가 이미 끝냈으므로 normalize
 * 부터)를 잇는다. asOf는 호출자가 한 번 만든 값을 그대로 받는다 — 이 함수
 * 자신은 시각을 읽지 않는다.
 */
export function runPipeline(asOf: Date): void {
  const config = loadReportConfig();

  const raw = loadRawTrades();
  console.log(`raw 거래 ${raw.length}건`);

  const normalized = normalizeAll(raw);
  const units = aggregate(normalized, asOf, config);
  console.log(
    `단지 ${new Set(units.map((u) => u.complexKey)).size}개 / 평형 ${units.length}개`,
  );

  emit(units, asOf, latestContractMonth(raw), currentRulesVersion());

  const report = buildReport(units, loadFetchLog(), config);
  writeFileSync(join(DATA_DIR, "report.md"), report);

  console.log("완료. data/ 아래 complexes.json, regions.json, manifest.json, report.md");
}

// `file://${process.argv[1]}`로 직접 비교하면 저장소 경로에 비-ASCII 문자가
// 있을 때(이 저장소의 실제 경로 "부동산 saas"가 그렇다) import.meta.url은
// 퍼센트 인코딩되는 반면 process.argv[1]은 원문 그대로라 항상 false가 되어
// 이 스크립트가 조용히 아무 일도 안 하고 exit 0으로 끝난다 — 콘솔 출력도
// 에러도 없어 "정상 종료"처럼 보이는 최악의 실패다. pathToFileURL로 양쪽을
// 같은 방식으로 인코딩해 비교한다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPipeline(new Date());
}
