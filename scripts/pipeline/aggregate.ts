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
  /** 3개월 전 대비 변동률. 비교 대상이 없으면 null */
  changeRate3m: number | null;
  /** 12개월 전 대비 변동률. 비교 대상이 없으면 null */
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

function monthsBefore(asOf: Date, months: number): Date {
  return new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months, asOf.getUTCDate()),
  );
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
    const recent = group.filter((t) => at(t) >= sixMonthsAgo);
    // 최근 6개월 거래가 없으면 대표 시세를 낼 근거가 없다.
    if (recent.length === 0) continue;

    const recentPrices = recent.map((t) => t.price);
    const last3m = group.filter((t) => at(t) >= threeMonthsAgo).map((t) => t.price);
    const prior3m = group
      .filter((t) => at(t) < threeMonthsAgo && at(t) >= sixMonthsAgo)
      .map((t) => t.price);
    const prior12m = group
      .filter((t) => at(t) < sixMonthsAgo && at(t) >= twelveMonthsAgo)
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
