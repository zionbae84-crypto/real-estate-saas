import type { NormalizedTrade } from "./normalize";
import type { ReportConfig } from "./types";

export interface ComplexUnit {
  complexKey: string;
  /** 원본 표기 중 대표 하나 */
  complexName: string;
  regionCode: string;
  legalDongName: string;
  builtYear: number;
  /** 전용면적을 1㎡ 단위로 반올림한 값. 화면 표시용(예: "84㎡") */
  areaBucket: number;
  /**
   * 이 버킷(complexKey × areaBucket)에 실제로 들어간 거래들의 **최대**
   * 전용면적(원본 실수값, 반올림하지 않음).
   *
   * areaBucket은 반올림값이라 실제 전용면적 85.4㎡가 85로 내려올 수 있다
   * — 그러면 화면이 85㎡ 이하로 오판해 농특세(85㎡ 초과분)를 빼고
   * 계산한다. 부대비용이 실제보다 작아지고 실구매력이 커지므로 이
   * 제품이 가장 피해야 하는 낙관 방향 오류다. 85㎡ 임계값 판정에는
   * areaBucket이 아니라 이 값을 써야 한다.
   *
   * 평균·중위값이 아니라 **최대값**을 쓴다 — 면적이 클수록 농특세가
   * 붙어 비용이 커지고 실구매력이 작아지므로, 최대값 쪽으로 틀리는
   * 것이 보수적인(안전한) 방향이다.
   *
   * 계산 대상은 `recent`(최근 6개월, 대표가를 낸 창)가 아니라 이
   * 버킷에 속한 **모든** 거래(`group`)다 — areaBucket은 시간과 무관한
   * 물리적 속성이므로, 오래된 거래라도 그 단지·평형의 실제 면적을
   * 알려준다면 반영해야 더 정확(하고 여전히 보수적인 방향)해진다.
   */
  maxExclusiveAreaSqm: number;
  /** 최근 6개월 거래의 중위값(원) */
  medianPrice: number;
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
  /**
   * (최근 3개월 중위값 − 그 이전 3개월 중위값) ÷ 그 이전 3개월 중위값.
   * 분모는 "그 이전 3개월"이다 — 한국어 "X 대비 Y"는 X가 기준(분모)이라는
   * 뜻이라 "최근 대비 이전"이라고 쓰면 정반대로 읽힌다. 양수면 최근이 더
   * 비싸졌다는 뜻, 음수면 더 싸졌다는 뜻이다(비율, 0.05 = 5%). 비교 대상(그
   * 이전 3개월 거래)이 없으면 null.
   */
  changeRate3m: number | null;
  /** changeRate3m 계산에 쓰인 "최근 3개월" 창의 거래 건수 */
  changeRate3mRecentCount: number;
  /** changeRate3m 계산에 쓰인 "그 이전 3개월" 창의 거래 건수(분모 쪽) */
  changeRate3mPriorCount: number;
  /**
   * changeRate3m이 근거한 두 창 중 하나라도 lowConfidenceMinTrades 미만이면
   * true. changeRate3m 자체는 null이 아니어도(계산은 됐어도) 표본이 1~2건뿐인
   * 급등락일 수 있다 — lowConfidence(대표가 신뢰도)와 별개로, 이 변동률
   * 하나만 두고 봐도 신뢰할 수 있는지를 나타낸다. changeRate3m이 null이면
   * 애초에 값이 없으므로 항상 false.
   */
  changeRate3mLowConfidence: boolean;
  /**
   * (최근 6개월 중위값(= medianPrice) − 그 이전 6개월 중위값) ÷ 그 이전
   * 6개월 중위값. 분모는 changeRate3m과 마찬가지로 "그 이전" 창이고, 부호
   * 의미도 같다(양수 = 상승, 음수 = 하락). 특정 시점(12개월 전) 대비가
   * 아니라 "최근 6개월 vs 그 이전 6개월"이므로, 3개월 vs 3개월로 대칭인
   * changeRate3m과 창 크기가 다르다. 비교 대상이 없으면 null.
   */
  changeRate12m: number | null;
  /** changeRate12m의 "최근 6개월" 창 거래 건수. tradeCount와 같은 값이다. */
  changeRate12mRecentCount: number;
  /** changeRate12m의 "그 이전 6개월" 창 거래 건수(분모 쪽) */
  changeRate12mPriorCount: number;
  /** changeRate3mLowConfidence와 같은 뜻으로, changeRate12m에 대해 판정한다. */
  changeRate12mLowConfidence: boolean;
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

interface ChangeRateResult {
  rate: number | null;
  recentCount: number;
  priorCount: number;
  lowConfidence: boolean;
}

/**
 * changeRate와 함께 그 값이 근거한 두 창의 거래 건수·저신뢰 여부를 낸다.
 *
 * 값을 null로 지우는 대신 정보를 더하는 기존 관례(lowConfidence가 tradeCount·
 * minPrice·maxPrice와 함께 나가는 것과 같다)를 따른다 — 표본이 1건뿐인
 * 변동률도 값 자체는 내보내되, 어느 창이 얼마나 얇았는지 소비자가 판단할 수
 * 있게 한다. 값이 애초에 null이면(비교 대상 없음) lowConfidence를 켤 대상이
 * 없으므로 항상 false다.
 */
function changeRateWithConfidence(
  recent: number[],
  older: number[],
  minTrades: number,
): ChangeRateResult {
  const rate = changeRate(recent, older);
  const lowConfidence = rate !== null && (recent.length < minTrades || older.length < minTrades);
  return { rate, recentCount: recent.length, priorCount: older.length, lowConfidence };
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

    const rate3m = changeRateWithConfidence(last3m, prior3m, config.lowConfidenceMinTrades);
    const rate12m = changeRateWithConfidence(recentPrices, prior12m, config.lowConfidenceMinTrades);

    units.push({
      complexKey: first.complexKey,
      complexName: first.complexName,
      regionCode: first.regionCode,
      legalDongName: first.legalDongName,
      builtYear: first.builtYear,
      areaBucket: areaBucket(first.exclusiveAreaSqm),
      maxExclusiveAreaSqm: Math.max(...group.map((t) => t.exclusiveAreaSqm)),
      medianPrice: median(recentPrices),
      tradeCount: recent.length,
      minPrice: Math.min(...recentPrices),
      maxPrice: Math.max(...recentPrices),
      changeRate3m: rate3m.rate,
      changeRate3mRecentCount: rate3m.recentCount,
      changeRate3mPriorCount: rate3m.priorCount,
      changeRate3mLowConfidence: rate3m.lowConfidence,
      changeRate12m: rate12m.rate,
      changeRate12mRecentCount: rate12m.recentCount,
      changeRate12mPriorCount: rate12m.priorCount,
      changeRate12mLowConfidence: rate12m.lowConfidence,
      lowConfidence: recent.length < config.lowConfidenceMinTrades,
    });
  }

  // 산출물 순서를 결정론화: complexKey로 정렬, 같으면 areaBucket으로 정렬
  // complexKey는 문자열이므로 < 연산자로 locale-independent 비교
  units.sort((a, b) => {
    const keyCompare = a.complexKey < b.complexKey ? -1 : a.complexKey > b.complexKey ? 1 : 0;
    if (keyCompare !== 0) return keyCompare;
    return a.areaBucket - b.areaBucket;
  });

  return units;
}
