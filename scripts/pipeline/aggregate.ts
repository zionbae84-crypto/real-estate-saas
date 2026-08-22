import type { NormalizedTrade } from "./normalize";
import type { ReportConfig } from "./types";

export interface ComplexUnit {
  complexKey: string;
  /** 원본 표기 중 대표 하나 */
  complexName: string;
  regionCode: string;
  legalDongName: string;
  builtYear: number;
  /** 전용면적을 1㎡ 단위로 반올림한 값 */
  areaBucket: number;
  /** 최근 6개월 거래의 중위값(원) */
  medianPrice: number;
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
  /** 최근 3개월 중위값 대비 그 이전 3개월 중위값의 변동률. 비교 대상이 없으면 null */
  changeRate3m: number | null;
  /**
   * 최근 6개월 중위값(= medianPrice) 대비 그 이전 6개월 중위값의 변동률.
   * 특정 시점(12개월 전) 대비가 아니라 "최근 6개월 vs 그 이전 6개월"이므로,
   * 3개월 vs 3개월로 대칭인 changeRate3m과 창 크기가 다르다. 비교 대상이 없으면 null.
   */
  changeRate12m: number | null;
  lowConfidence: boolean;
}

/** 중위값. 짝수 개면 가운데 둘의 평균을 내림한다. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return 0;
  if (sorted.length % 2 === 1) return a;
  const b = sorted[mid - 1];
  if (b === undefined) return a;
  return Math.floor((a + b) / 2);
}

/**
 * 전용면적을 1㎡ 단위로 반올림한다.
 *
 * 84.4와 84.6은 실제로 같은 평형인데 84와 85로 갈린다. 조용히 뭉개는 대신
 * 이상 신호 리포트의 "평형 분할 의심"이 이를 잡는다.
 */
export function areaBucket(sqm: number): number {
  return Math.round(sqm);
}

/** 주어진 연/월의 마지막 날짜(일). month는 0-indexed이며 범위를 벗어나도 Date.UTC가 정규화한다. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * asOf에서 months개월 전 날짜를 구한다.
 *
 * `Date.UTC(y, m - n, day)`를 그대로 쓰면 대상 월이 day보다 짧을 때 다음 달로
 * 넘어간다(예: 8월 31일의 6개월 전은 "2월 31일"이 아니라 3월 3일이 되어버린다).
 * 대상 월의 마지막 날로 day를 클램프해 "6개월 전"이 실행 시점에 따라 며칠씩
 * 밀리지 않게 한다.
 */
function monthsBefore(asOf: Date, months: number): Date {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth() - months;
  const day = asOf.getUTCDate();
  // Date.UTC가 month의 연/월 오버플로를 정규화해준다 (일은 1로 고정해 오염 방지).
  const normalized = new Date(Date.UTC(year, month, 1));
  const targetYear = normalized.getUTCFullYear();
  const targetMonth = normalized.getUTCMonth();
  const clampedDay = Math.min(day, lastDayOfMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

function changeRate(recent: number[], older: number[]): number | null {
  if (recent.length === 0 || older.length === 0) return null;
  const from = median(older);
  if (from === 0) return null;
  return (median(recent) - from) / from;
}

export function aggregate(
  trades: NormalizedTrade[],
  asOf: Date,
  config: ReportConfig,
): ComplexUnit[] {
  const sixMonthsAgo = monthsBefore(asOf, 6);
  const threeMonthsAgo = monthsBefore(asOf, 3);
  const twelveMonthsAgo = monthsBefore(asOf, 12);

  const groups = new Map<string, NormalizedTrade[]>();
  for (const trade of trades) {
    const key = `${trade.complexKey}|${areaBucket(trade.exclusiveAreaSqm)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(trade);
    else groups.set(key, [trade]);
  }

  const units: ComplexUnit[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;

    const at = (t: NormalizedTrade) => new Date(`${t.contractDate}T00:00:00Z`);
    // 모든 창은 asOf를 포함 상한으로 둔다. 상한이 없으면 asOf 이후(미래) 거래가
    // "최근" 구간에 섞여 들어가 중위값을 오염시킨다 — asOf가 replay 기준 시점을
    // 뜻하는 이상, 그 이후 거래를 아는 척해서는 안 된다.
    const recent = group.filter((t) => at(t) >= sixMonthsAgo && at(t) <= asOf);
    // 최근 6개월 거래가 없으면 대표 시세를 낼 근거가 없다.
    if (recent.length === 0) continue;

    const recentPrices = recent.map((t) => t.price);
    const last3m = group
      .filter((t) => at(t) >= threeMonthsAgo && at(t) <= asOf)
      .map((t) => t.price);
    const prior3m = group
      .filter((t) => at(t) < threeMonthsAgo && at(t) >= sixMonthsAgo && at(t) <= asOf)
      .map((t) => t.price);
    const prior12m = group
      .filter((t) => at(t) < sixMonthsAgo && at(t) >= twelveMonthsAgo && at(t) <= asOf)
      .map((t) => t.price);

    units.push({
      complexKey: first.complexKey,
      complexName: first.complexName,
      regionCode: first.regionCode,
      legalDongName: first.legalDongName,
      builtYear: first.builtYear,
      areaBucket: areaBucket(first.exclusiveAreaSqm),
      medianPrice: median(recentPrices),
      tradeCount: recent.length,
      minPrice: Math.min(...recentPrices),
      maxPrice: Math.max(...recentPrices),
      changeRate3m: changeRate(last3m, prior3m),
      changeRate12m: changeRate(recentPrices, prior12m),
      lowConfidence: recent.length < config.lowConfidenceMinTrades,
    });
  }

  return units;
}
