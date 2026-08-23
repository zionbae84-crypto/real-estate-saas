import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ComplexUnit } from "./aggregate";
import { aggregate } from "./aggregate";
import { DATA_DIR, RAW_DIR, loadReportConfig, loadRegions } from "./config";
import { emit } from "./emit";
import { CACHE_SCHEMA_VERSION, type FetchLogEntry } from "./fetch";
import { buildMonthlySeries, emitMonthly } from "./monthly";
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
  schemaVersion: number;
  trades: RawTrade[];
  failures: number;
  cancelled: number;
  truncated?: boolean;
}

/**
 * 판정 기준은 fetch.ts의 readCache와 정확히 일치해야 한다: trades가 배열이면
 * 봉투로 본다. failures/cancelled는 없으면 0으로 취급하는 하위호환이 양쪽
 * 다 있으므로(readCache 참고) 여기서 존재를 강제하지 않는다 — 강제하면 옛
 * 캐시 파일이 한쪽에서만 손상으로 갈리게 된다.
 *
 * `schemaVersion`은 이 모양 판정에 넣지 **않는다.** 버전이 다른 파일은 "봉투가
 * 아니다"가 아니라 "봉투는 맞는데 옛 형식이다"이고, 사람이 받아야 할 안내가
 * 전혀 다르기 때문이다 — 아래 loadRawTrades가 따로 검사해 따로 설명한다.
 */
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
 *
 * I6: `fetch`는 raw 파일을 지우지 않는다. regions.json에서 시군구를 뺀
 * 뒤에도(잘못된 프로브, 오타난 코드, 의도적 롤백) 그 지역의 캐시된 달들이
 * data/raw/에 남아 있으면, 필터링 없이는 계속 complexes.json·regions.json·
 * manifest.regionCodes로 흘러든다 — manifest.regionCodes는 "이 산출물이
 * 담고 있는 지역"을 주장하는 필드이므로 이러면 그 주장 자체가 거짓말이
 * 된다. regions는 loadRegions()를 기본값으로 받아 실제 실행에서는 항상
 * 현재 설정을 기준으로 검증하고, 테스트는 임시 목록을 주입할 수 있다.
 */
export function loadRawTrades(dir: string = RAW_DIR, regions: string[] = loadRegions()): RawTrade[] {
  if (!existsSync(dir)) {
    throw new Error(`${dir}가 없습니다. 먼저 npm run pipeline:fetch 를 실행하세요.`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`${dir}에 캐시 파일이 없습니다. 먼저 npm run pipeline:fetch 를 실행하세요.`);
  }

  const allowedRegions = new Set(regions);
  const trades: RawTrade[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isCacheEnvelope(parsed)) {
      throw new Error(
        `${file}: 캐시 파일이 봉투(객체 { trades, failures }) 형식이 아니거나 ` +
          `trades 필드가 배열이 아닙니다. 디스크 손상이거나 옛 배열 형식일 수 ` +
          `있습니다. 이 파일을 건너뛰면 거래가 조용히 빠진 채 파이프라인이 ` +
          `정상 종료된 것처럼 보이므로, 건너뛰는 대신 여기서 멈춥니다. ` +
          `${file}을 지우고 그 파일명에 담긴 시군구·연월 데이터를 ` +
          `npm run pipeline:fetch 로 다시 받으세요.`,
      );
    }
    // 봉투 모양은 맞아도 형식 버전이 다르면 **읽지 않고 멈춘다.** 옛 봉투(v1)의
    // 거래에는 aptSeq가 없어서, 그대로 읽으면 단지 키가 전부 undefined가 되어
    // 서로 아무 상관 없는 거래들이 키 하나로 뭉친다 — 조용히 넘어가면
    // complexes.json이 "정상"인 얼굴로 완전히 틀린 단지 묶음을 담게 된다.
    if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) {
      throw new Error(
        `${file}: 캐시 봉투의 schemaVersion이 ${JSON.stringify(parsed.schemaVersion)}입니다 ` +
          `— 지금 코드는 ${CACHE_SCHEMA_VERSION}을 씁니다. 이 파일은 파서가 ` +
          `aptSeq·landLeasehold·주소를 남기기 전에 쓰인 것이라 단지 키를 만들 수 없습니다. ` +
          `그대로 읽으면 키가 undefined인 거래들이 하나로 뭉쳐 완전히 틀린 단지 ` +
          `묶음이 조용히 산출물로 나가므로, 건너뛰지 않고 여기서 멈춥니다. ` +
          `npm run pipeline:fetch 를 실행해 다시 받으세요(옛 형식 파일은 자동으로 ` +
          `다시 받습니다).`,
      );
    }

    for (const t of parsed.trades) {
      if (!allowedRegions.has(t.regionCode)) {
        throw new Error(
          `${file}: 거래의 regionCode "${t.regionCode}"가 현재 regions.json ` +
            `설정(${regions.join(", ")})에 없습니다. 지역이 설정에서 빠진 뒤에도 ` +
            `이 캐시 파일이 남아 있어 산출물(complexes.json·manifest.regionCodes)에 ` +
            `계속 흘러들고 있습니다. 이 지역을 계속 쓰려면 regions.json에 다시 ` +
            `추가하고, 더 이상 쓰지 않으려면 ${file}을 지우세요.`,
        );
      }
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
 * raw 거래가 0건이면 산출물을 쓰지 않고 던진다.
 *
 * data/raw/의 캐시 파일들은 봉투 형식으로 멀쩡한데 trades가 전부 []인 경우가
 * 있다 — 예를 들어 API 호출 파라미터가 미묘하게 틀리면 fetch.ts는 매번 200과
 * 함께 빈 응답만 받아 에러 없이 status: "empty"로 정상 종료하고, 봉투도
 * 정상적으로 쓴다. loadRawTrades는 봉투 "형식"만 검증하므로 이 경우를 잡지
 * 못한다. 이걸 걸러내지 않으면 complexes.json이 빈 배열인 채로, dataAsOf가
 * 빈 문자열인 채로 "성공"처럼 보이는 매니페스트가 나간다 — 이 제품의 방침은
 * "사지 말아야 할 때를 말해주는 것"이므로, 성공한 척 비어 있는 것보다 크래시가
 * 낫다.
 *
 * 새벽 2시에 이 에러를 보는 사람에게: raw 캐시 파일 자체는 있는데 그 안의
 * 거래가 0건이라는 뜻이다. data/raw/ 안의 파일 몇 개를 열어 trades가 정말
 * 비어 있는지 확인하고, 의심 가는 파일을 지운 뒤 npm run pipeline:fetch 를
 * 다시 실행하라.
 */
export function assertRawNonEmpty(raw: RawTrade[]): void {
  if (raw.length === 0) {
    throw new Error(
      "raw 거래가 0건입니다. data/raw/의 캐시 파일들은 봉투 형식은 정상이지만 " +
        "trades가 모두 비어 있습니다 — API 호출 파라미터가 미묘하게 틀려 200과 " +
        "함께 빈 응답만 계속 받았을 수 있습니다. data/raw/ 안의 파일 몇 개를 " +
        "열어 trades가 정말 비어 있는지 확인하고, 의심 가는 파일을 지운 뒤 " +
        "npm run pipeline:fetch 를 다시 실행하세요.",
    );
  }
}

/**
 * raw 거래는 있지만 집계 결과(units)가 0개면 산출물을 쓰지 않고 던진다.
 *
 * aggregate는 asOf 기준 최근 6개월 안에 거래가 없는 그룹을 조용히 걸러낸다
 * (대표 시세를 낼 근거가 없다는 이유로). raw 거래 전체가 이 창 밖에
 * 있으면 — 예를 들어 파이프라인에 넘긴 asOf가 잘못됐거나 캐시가 아주 오래된
 * 월 데이터만 담고 있으면 — units가 통째로 비면서 assertRawNonEmpty로는
 * 못 잡는 방식으로 같은 "빈 성공"이 재현된다.
 *
 * 새벽 2시에 이 에러를 보는 사람에게: raw 거래는 있는데 집계 결과가 0개라는
 * 뜻이다. raw 거래들의 contractDate 분포와 파이프라인에 넘긴 asOf 값을
 * 확인하라.
 */
export function assertUnitsNonEmpty(raw: RawTrade[], units: ComplexUnit[]): void {
  if (units.length === 0) {
    throw new Error(
      `raw 거래 ${raw.length}건은 있지만 집계 결과가 0개입니다. asOf 기준 ` +
        "최근 6개월 안에 거래가 없는 그룹은 aggregate가 걸러냅니다 — raw " +
        "거래들의 contractDate 분포와 파이프라인에 넘긴 asOf 값을 확인하세요.",
    );
  }
}

/**
 * fetch를 제외한 나머지 전 단계(parse는 fetch가 이미 끝냈으므로 normalize
 * 부터)를 잇는다. asOf는 호출자가 한 번 만든 값을 그대로 받는다 — 이 함수
 * 자신은 시각을 읽지 않는다.
 *
 * rawDir은 테스트에서 raw 캐시 위치를 주입하기 위한 것으로, 기본값은 실제
 * RAW_DIR이다 — 진입점(`runPipeline(new Date())`)의 동작은 그대로다.
 */
export function runPipeline(asOf: Date, rawDir: string = RAW_DIR): void {
  const config = loadReportConfig();

  const raw = loadRawTrades(rawDir);
  console.log(`raw 거래 ${raw.length}건`);
  assertRawNonEmpty(raw);

  const normalized = normalizeAll(raw);
  const units = aggregate(normalized, asOf, config);
  assertUnitsNonEmpty(raw, units);
  console.log(
    `단지 ${new Set(units.map((u) => u.complexKey)).size}개 / 평형 ${units.length}개`,
  );

  emit(units, asOf, latestContractMonth(raw), currentRulesVersion());

  // complexes.json과 별도 파일로 낸다 — src/에서 아직 붙이지 않는다
  // (scripts/pipeline/monthly.test.ts의 가드가 이 경계를 지킨다).
  const monthly = buildMonthlySeries(normalized, asOf);
  emitMonthly(monthly, DATA_DIR);

  // normalized(집계 전 거래)를 함께 넘긴다 — units에는 단지마다 대표 이름
  // 하나만 남아 있어 "한 단지 ID에 이름이 여러 개"를 볼 수 없다.
  const report = buildReport(units, loadFetchLog(), config, normalized);
  writeFileSync(join(DATA_DIR, "report.md"), report);

  console.log(
    "완료. data/ 아래 complexes.json, regions.json, manifest.json, monthly.json, README.md, report.md",
  );
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
