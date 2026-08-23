import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { areaBucket } from "./aggregate";
import { DATA_DIR } from "./config";
import type { NormalizedTrade } from "./normalize";

/**
 * 단지×평형 한 달치 시세.
 *
 * **`medianPrice`도, 변동률도 없다.** 화면이 낼 수 있는 것은 범위(min~max)와
 * 건수뿐이라는 규칙(부모 스펙 §12 — 감정평가법 저촉·수익률 예측 금지)이
 * 월별 시계열에도 그대로 적용된다. 이 파일이 나중에 시세 추이 화면의
 * 재료가 되더라도, 재료 자체에 금지된 값이 없으면 실수로 화면에 흘릴
 * 방법이 없다.
 */
export interface MonthlyPoint {
  /** 계약월, YYYY-MM */
  month: string;
  /** 원 단위 정수. 그 달 거래들의 최저가 */
  minPrice: number;
  /** 원 단위 정수. 그 달 거래들의 최고가 */
  maxPrice: number;
  /** 그 달 거래 건수 */
  tradeCount: number;
}

/**
 * `complexKey|areaBucket` → 월(오름차순) 순 시계열.
 *
 * 키 형식은 aggregate.ts의 집계 키(`${complexKey}|${areaBucket(...)}`)와
 * 같다 — 화면이 나중에 이 파일을 complexes.json과 이어 붙일 때 같은 키로
 * 조인할 수 있게 하기 위해서다.
 */
export type MonthlySeries = Record<string, MonthlyPoint[]>;

/**
 * 정규화된 거래 전체에서 단지×평형×월별 최저·최고가·건수를 낸다.
 *
 * aggregate()와 달리 "최근 6개월 대표가" 하나로 뭉치지 않고 원본 거래가
 * 커버하는 모든 달을 각각 남긴다 — 시세 추이(트렌드) 화면의 재료가 되려면
 * 대표값 하나가 아니라 달마다의 점이 필요하다.
 *
 * asOf를 포함 상한으로 둔다 — aggregate()와 같은 이유다: asOf가 replay
 * 기준 시점을 뜻하는 이상, 그 이후(미래) 거래를 아는 척해서는 안 된다.
 */
export function buildMonthlySeries(trades: NormalizedTrade[], asOf: Date): MonthlySeries {
  const byKey = new Map<string, Map<string, number[]>>();

  for (const trade of trades) {
    const contractDate = new Date(`${trade.contractDate}T00:00:00Z`);
    if (contractDate > asOf) continue;

    const key = `${trade.complexKey}|${areaBucket(trade.exclusiveAreaSqm)}`;
    const month = trade.contractDate.slice(0, 7);

    const byMonth = byKey.get(key) ?? new Map<string, number[]>();
    const prices = byMonth.get(month) ?? [];
    prices.push(trade.price);
    byMonth.set(month, prices);
    byKey.set(key, byMonth);
  }

  const series: MonthlySeries = {};
  // 산출물 순서를 결정론화: 키로 정렬, 각 키 안에서는 월 오름차순.
  const sortedKeys = [...byKey.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const key of sortedKeys) {
    const byMonth = byKey.get(key);
    if (byMonth === undefined) continue;
    const months = [...byMonth.keys()].sort();
    series[key] = months.map((month) => {
      const prices = byMonth.get(month) ?? [];
      return {
        month,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        tradeCount: prices.length,
      };
    });
  }
  return series;
}

/**
 * `data/monthly.json`을 따로 쓴다. `emit()`(complexes.json 등)과 의도적으로
 * 분리한다 — 화면에 붙이는 것은 별도 결정이라 지금은 파이프라인이 만들기만
 * 한다(`src/`에서 이 파일을 import하지 않는다는 것은
 * `scripts/pipeline/monthly.test.ts`의 가드가 지킨다).
 */
export function emitMonthly(series: MonthlySeries, dataDir: string = DATA_DIR): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "monthly.json"), JSON.stringify(series));
}
