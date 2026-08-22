import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ComplexUnit } from "./aggregate";
import { DATA_DIR } from "./config";

export interface RegionMeta {
  regionCode: string;
  complexCount: number;
  unitCount: number;
}

export interface Manifest {
  /** 파이프라인이 이 산출물을 만든 시각 */
  generatedAt: string;
  /** 실거래 데이터의 기준 월 (YYYY-MM) */
  dataAsOf: string;
  /** 이 데이터와 함께 쓸 규제 룰셋 버전 */
  rulesVersion: string;
  complexCount: number;
  unitCount: number;
  lowConfidenceUnitCount: number;
  regionCodes: string[];
}

export function buildRegions(units: ComplexUnit[]): RegionMeta[] {
  const byRegion = new Map<string, Set<string>>();
  const unitCounts = new Map<string, number>();

  for (const unit of units) {
    const keys = byRegion.get(unit.regionCode) ?? new Set<string>();
    keys.add(unit.complexKey);
    byRegion.set(unit.regionCode, keys);
    unitCounts.set(unit.regionCode, (unitCounts.get(unit.regionCode) ?? 0) + 1);
  }

  // 산출물 순서를 결정론화: regionCode로 정렬 (locale-independent)
  return [...byRegion.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([regionCode, keys]) => ({
      regionCode,
      complexCount: keys.size,
      unitCount: unitCounts.get(regionCode) ?? 0,
    }));
}

export function buildManifest(
  units: ComplexUnit[],
  generatedAt: Date,
  dataAsOf: string,
  rulesVersion: string,
): Manifest {
  const complexKeys = new Set(units.map((u) => u.complexKey));
  return {
    generatedAt: generatedAt.toISOString(),
    dataAsOf,
    rulesVersion,
    complexCount: complexKeys.size,
    unitCount: units.length,
    lowConfidenceUnitCount: units.filter((u) => u.lowConfidence).length,
    regionCodes: [...new Set(units.map((u) => u.regionCode))].sort(),
  };
}

/**
 * complexes.json·manifest.json·regions.json 옆에 함께 두는 스키마 문서(I7).
 *
 * changeRate12m 같은 필드는 이름이 뜻과 다르다 — "12개월 전 시점"도
 * "12개월 창"도 아니라 "최근 6개월 vs 그 이전 6개월" 비교다. 이 정의는
 * scripts/ 안 TypeScript 주석(aggregate.ts)에만 있었는데, data/complexes.json을
 * 읽는 화면 개발자는 그 파일을 열 이유가 없다 — 이름만 보고 "1년 변동률"로
 * 렌더링하기 쉽다. 파이프라인은 맞는데 화면이 틀리게 되는 이음매를 막으려면
 * 산출물 옆에 창(window)·단위·null 의미를 적어 둬야 한다.
 *
 * 내용은 데이터에 의존하지 않는 정적 문서라 결정론을 해치지 않는다 —
 * 같은 코드면 언제 실행해도 바이트 단위로 같은 문자열이 나온다.
 */
export function buildSchemaDoc(): string {
  return `# data/ 산출물 스키마

이 파일은 \`emit\`이 파이프라인을 돌릴 때마다 다시 쓴다. 필드 이름만 보고
화면에서 잘못 렌더링하기 쉬운 것들(특히 창 크기·단위·null 의미)을 정의한다.

## complexes.json (ComplexUnit[])

정렬 순서: complexKey 오름차순, 같으면 areaBucket 오름차순 — 파일은 gzip
전이라도 항상 같은 순서로 나온다(같은 입력 → 같은 바이트).

| 필드 | 타입 | 단위/창 | null 의미 |
|---|---|---|---|
| complexKey | string | 형식: 지역코드\\|법정동명\\|건축년도\\|정규화된 단지명 (파이프로 구분) | 없음(항상 존재) |
| complexName | string | 원본 표기 중 대표 하나 | 없음 |
| regionCode | string | 시군구 코드 5자리 | 없음 |
| legalDongName | string | 법정동명 | 없음 |
| builtYear | number | 건축년도(연도) | 없음 |
| areaBucket | number | 전용면적을 1㎡ 단위로 반올림. 84.4·84.6이 84·85로 갈릴 수 있다(report.md의 "평형 분할 의심" 참고) | 없음 |
| medianPrice | number | 원 단위 정수. **최근 6개월** 거래의 중위값 | 없음(항상 존재) |
| tradeCount | number | 최근 6개월 거래 건수 | 없음 |
| minPrice / maxPrice | number | 원 단위 정수. 최근 6개월 창 안의 최저·최고가 | 없음 |
| changeRate3m | number \\| null | 최근 **3개월** 중위값 대비 그 이전 3개월 중위값의 변동률(비율, 0.05 = 5%) | 비교할 이전 3개월 거래가 없으면 null |
| changeRate3mRecentCount | number | changeRate3m의 "최근 3개월" 창 거래 건수 | 없음 |
| changeRate3mPriorCount | number | changeRate3m의 "그 이전 3개월" 창 거래 건수(분모 쪽) | 없음 |
| changeRate3mLowConfidence | boolean | 위 두 창 중 하나라도 report-config.json의 lowConfidenceMinTrades 미만이면 true | 해당 없음(changeRate3m이 null이면 항상 false) |
| changeRate12m | number \\| null | **주의: "12개월 전 시점" 대비도 "12개월 창" 비교도 아니다.** 최근 **6개월** 중위값(= medianPrice)과 그 이전 **6개월** 중위값을 비교한 변동률(비율) | 비교할 이전 6개월 거래가 없으면 null |
| changeRate12mRecentCount | number | changeRate12m의 "최근 6개월" 창 거래 건수. tradeCount와 같은 값이다 | 없음 |
| changeRate12mPriorCount | number | changeRate12m의 "그 이전 6개월" 창 거래 건수(분모 쪽) | 없음 |
| changeRate12mLowConfidence | boolean | changeRate3mLowConfidence와 같은 뜻으로 changeRate12m에 대해 판정 | 해당 없음(changeRate12m이 null이면 항상 false) |
| lowConfidence | boolean | 대표가(medianPrice) 자체의 신뢰도. 최근 6개월 거래 건수가 lowConfidenceMinTrades 미만이면 true | 없음 |

## manifest.json (Manifest)

| 필드 | 타입 | 의미 |
|---|---|---|
| generatedAt | string (ISO 8601) | 파이프라인이 이 산출물을 만든 시각. **유일한 비결정적 필드** — 같은 입력이라도 실행 시각마다 값이 다르다 |
| dataAsOf | string (YYYY-MM) | raw 거래 중 가장 최근 **계약월**. 신고월이 아니다 — 국토부 실거래 신고는 계약 후 최대 약 30일 지연되므로, dataAsOf에 가까운 최근 달일수록 아직 신고되지 않은 거래가 많아 실제보다 적게 집계된 상태(과소 보고)일 수 있다 |
| rulesVersion | string | 이 데이터와 함께 쓸 규제 룰셋 버전. 룰 파일을 못 읽거나 version 필드가 없으면 "unknown" |
| complexCount | number | 등장한 서로 다른 complexKey 개수(단지 수) |
| unitCount | number | complexes.json 배열 길이(평형 수, 단지×평형 조합) |
| lowConfidenceUnitCount | number | lowConfidence가 true인 평형 개수 |
| regionCodes | string[] | 등장한 regionCode를 오름차순 정렬한 목록 |

## regions.json (RegionMeta[])

시군구(regionCode) 오름차순 정렬.

| 필드 | 타입 | 의미 |
|---|---|---|
| regionCode | string | 시군구 코드 5자리 |
| complexCount | number | 이 시군구에 속한 서로 다른 complexKey 개수 |
| unitCount | number | 이 시군구에 속한 평형(ComplexUnit) 개수 |

## 참고

- 이상 신호(과소·과대병합 후보, 평형 분할 의심, 수집 실패/파싱 실패/거래
  0건/데이터 잘림/캐시 손상, 해제 거래)는 여기 담기지 않는다 —
  \`data/report.md\`를 본다. 그 리포트는 사람이 읽고 이 데이터를 내보낼지
  판단하는 절차의 일부다.
- 임계값(lowConfidenceMinTrades 등)은 \`scripts/pipeline/report-config.json\`에
  있다.
`;
}

export function emit(
  units: ComplexUnit[],
  generatedAt: Date,
  dataAsOf: string,
  rulesVersion: string,
  dataDir: string = DATA_DIR,
): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "complexes.json"), JSON.stringify(units));
  writeFileSync(
    join(dataDir, "regions.json"),
    JSON.stringify(buildRegions(units), null, 2),
  );
  writeFileSync(
    join(dataDir, "manifest.json"),
    JSON.stringify(buildManifest(units, generatedAt, dataAsOf, rulesVersion), null, 2),
  );
  writeFileSync(join(dataDir, "README.md"), buildSchemaDoc());
}
