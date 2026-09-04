import {
  buildTargets,
  defaultWait,
  fetchAllPagesCached,
  MONTHS_BACK,
  noopRawTradeCache,
  type RawTradeCache,
  type Waiter,
} from "./fetch";
import { normalizeAll } from "./normalize";
import { aggregate } from "./aggregate";
import { noopHouseholdCountLookup, type HouseholdCountLookup } from "./householdCount";
import { toEmittedUnit, type EmittedComplexUnit } from "./emit";
import type { ReportConfig } from "./types";

export interface LiveComplexesResult {
  units: EmittedComplexUnit[];
  /**
   * 이 조회에 실제로 들어온 거래 중 **가장 최근 계약월**(YYYY-MM).
   * 거래가 한 건도 없었으면 `null`이다 — 최대값을 낼 대상이 없는데
   * 날짜를 지어내면 화면이 "이 달 계약분까지 반영했다"는 확인한 적 없는
   * 사실을 말하게 된다.
   *
   * 배치 파이프라인의 `manifest.dataAsOf`와 같은 뜻·같은 형식이다
   * (`scripts/pipeline/run.ts`의 `latestContractMonth`). 신고월이 아니라
   * 계약월이라, 최근 달일수록 아직 신고되지 않은 거래가 있어 과소
   * 집계된 상태일 수 있다 — 화면이 그 사실을 함께 말한다.
   */
  dataAsOf: string | null;
}

/**
 * 지역 하나의 최근 12개월치를 라이브로 조회해 집계한다.
 *
 * 전부 메모리에서만 처리한다 — 디스크에 아무것도 쓰지 않는다. 12개월인
 * 이유는 `aggregate()`가 저신뢰 판정 등에 12개월 창을 쓰기 때문이다(화면에
 * 보이는 창은 6개월이지만, 6개월만 받으면 이 판정이 배치 파이프라인과
 * 달라진다). 지역이 하나뿐이라 12개월을 병렬로 호출해도 무리가 없다 —
 * 배치 파이프라인의 순차+쓰로틀은 지역이 여러 개일 때만 필요했다.
 *
 * 한 달이라도 `fetchAllPages`가 던지면 이 함수도 그대로 던진다 — 절반만
 * 모은 데이터를 성공으로 응답하지 않기 위해서다. 호출자(API 핸들러)가
 * 이걸 실패 상태코드로 옮긴다.
 *
 * 집계 이후 `lookupHouseholdCounts`로 세대수를 채운다(한국부동산원
 * "공동주택 단지 식별정보" API, 각 단지의 PNU로 조회). **이 조회는
 * 실패해도 이 함수를 던지지 않는다** — 위 문단의 "한 달 실패 → 전체
 * 던짐"과 대비된다. 가격·면적·입주년차는 이 앱의 핵심이지만 세대수는
 * 부가 정보라, 세대수 조회 하나가 실패했다고 목록 전체를 502로
 * 죽일 이유가 없다.
 */
export async function fetchLiveComplexes(
  regionCode: string,
  dong: string | null,
  now: Date,
  key: string,
  config: ReportConfig,
  wait: Waiter = defaultWait,
  cache: RawTradeCache = noopRawTradeCache,
  lookupHouseholdCounts: HouseholdCountLookup = noopHouseholdCountLookup,
): Promise<LiveComplexesResult> {
  const targets = buildTargets(now, MONTHS_BACK, [regionCode]);
  const pages = await Promise.all(
    targets.map((t) => fetchAllPagesCached(t.regionCode, t.yearMonth, key, wait, cache)),
  );
  const trades = pages.flatMap((p) => p.trades);
  const normalized = normalizeAll(trades);
  const units = aggregate(normalized, now, config);
  const filtered = dong === null ? units : units.filter((u) => u.legalDongName === dong);

  // 세대수는 부가 정보라, 이 조회 전체를 502로 죽이지 않는다 — 주입받은
  // lookupHouseholdCounts 자체가 PNU 하나하나의 실패를 이미 삼키지만
  // (householdCount.ts), 함수 자체가 예상 밖의 이유로 던져도 여기서 한 번
  // 더 막아 목록 조회(가격·면적·입주년차)는 절대 영향받지 않게 한다.
  const pnus = filtered.map((u) => u.pnu).filter((p): p is string => p !== null);
  let householdCounts: Map<string, number>;
  try {
    householdCounts = await lookupHouseholdCounts(pnus);
  } catch {
    householdCounts = new Map();
  }
  const enriched = filtered.map((u) => ({
    ...u,
    householdCount: u.pnu !== null ? (householdCounts.get(u.pnu) ?? null) : null,
  }));

  return { units: enriched.map(toEmittedUnit), dataAsOf: latestContractMonth(normalized) };
}

/**
 * 들어온 거래 중 가장 최근 계약월(YYYY-MM). 거래가 없으면 `null`.
 *
 * **동으로 좁히기 전의 거래 전체**를 본다 — 이 값이 말하는 것은 "이
 * 조회가 어느 계약월까지 반영했는가"이고, 그건 사용자가 목록을 어떻게
 * 좁혔는지와 무관한 조회 자체의 성질이기 때문이다.
 *
 * `run.ts`의 `latestContractMonth`와 같은 규칙이다. 거기서 그대로 쓰지
 * 않는 이유는 그 모듈이 파일시스템(raw 캐시)에 매여 있어서다.
 */
function latestContractMonth(trades: { contractDate: string }[]): string | null {
  let latest: string | null = null;
  for (const t of trades) {
    const month = t.contractDate.slice(0, 7);
    if (latest === null || month > latest) latest = month;
  }
  return latest;
}
