import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ComplexUnit } from "./aggregate";
import { DATA_DIR } from "./config";

/**
 * 산출물(`data/complexes.json`)에 실제로 나가는 필드만 남긴 모양.
 *
 * `ComplexUnit`(aggregate.ts)은 `medianPrice`·`changeRate3m`·`changeRate12m`
 * (및 그 부속 건수·저신뢰 필드)까지 계산해 담지만, 이 필드들은 화면이
 * 영영 쓸 수 없다 — `medianPrice`는 감정평가법 저촉을 피하려 가격을
 * min~max 범위로만 말한다는 방침 때문에, `changeRate*`는 부모 스펙 §12의
 * 수익률 예측 금지 때문에 각각 화면 표시가 금지돼 있다. 그런데도 그대로
 * 내보내면 번들의 절반가량이 화면이 렌더링할 수도 없는 숫자로 채워진다.
 *
 * 파이프라인 **내부**(예: 이상 신호 리포트가 필요해지면)에서는 여전히
 * `ComplexUnit`을 그대로 쓸 수 있다 — 이 타입은 오직 emit()이 파일에 쓸
 * 때만 거치는 마지막 관문이다.
 */
export type EmittedComplexUnit = Omit<
  ComplexUnit,
  | "medianPrice"
  | "changeRate3m"
  | "changeRate3mRecentCount"
  | "changeRate3mPriorCount"
  | "changeRate3mLowConfidence"
  | "changeRate12m"
  | "changeRate12mRecentCount"
  | "changeRate12mPriorCount"
  | "changeRate12mLowConfidence"
>;

/** ComplexUnit에서 화면에 낼 수 없는 필드를 뺀다. emit()이 파일을 쓰기 직전에만 부른다. */
export function toEmittedUnit(unit: ComplexUnit): EmittedComplexUnit {
  const {
    medianPrice: _medianPrice,
    changeRate3m: _changeRate3m,
    changeRate3mRecentCount: _changeRate3mRecentCount,
    changeRate3mPriorCount: _changeRate3mPriorCount,
    changeRate3mLowConfidence: _changeRate3mLowConfidence,
    changeRate12m: _changeRate12m,
    changeRate12mRecentCount: _changeRate12mRecentCount,
    changeRate12mPriorCount: _changeRate12mPriorCount,
    changeRate12mLowConfidence: _changeRate12mLowConfidence,
    ...rest
  } = unit;
  return rest;
}

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

## complexes.json (EmittedComplexUnit[])

정렬 순서: complexKey 오름차순, 같으면 areaBucket 오름차순 — 파일은 gzip
전이라도 항상 같은 순서로 나온다(같은 입력 → 같은 바이트).

| 필드 | 타입 | 단위/창 | null 의미 |
|---|---|---|---|
| complexKey | string | 형식: 지역코드\\|법정동명\\|건축년도\\|정규화된 단지명 (파이프로 구분) | 없음(항상 존재) |
| complexName | string | 원본 표기 중 대표 하나 | 없음 |
| regionCode | string | 시군구 코드 5자리 | 없음 |
| legalDongName | string | 법정동명 | 없음 |
| builtYear | number | 건축년도(연도) | 없음 |
| areaBucket | number | 전용면적을 1㎡ 단위로 반올림한 값(**표시용**). 84.4·84.6이 84·85로 갈릴 수 있다(report.md의 "평형 분할 의심" 참고) | 없음 |
| maxExclusiveAreaSqm | number | 이 버킷(complexKey × areaBucket)에 실제로 들어간 거래들의 **최대** 전용면적(원본 실수값, 반올림 안 함). **85㎡ 임계값(농특세·정책대출 자격) 판정은 areaBucket이 아니라 이 값으로 해야 한다** — areaBucket은 반올림이라 85.4㎡가 85로 내려와 초과분을 놓칠 수 있다. 평균·중위값이 아니라 최대값인 이유: 면적이 클수록 부담이 커지는 쪽이 이 제품이 택해야 하는 보수적 방향이라서다 | 없음 |
| tradeCount | number | 최근 6개월 거래 건수 | 없음 |
| minPrice / maxPrice | number | 원 단위 정수. 최근 6개월 창 안의 최저·최고가 | 없음 |
| lowConfidence | boolean | 대표가(내부적으로 계산하는 중위값) 신뢰도. 최근 6개월 거래 건수가 lowConfidenceMinTrades 미만이면 true | 없음 |

## 내보내지 않는 필드

파이프라인은 내부적으로 \`medianPrice\`(최근 6개월 중위값)와
\`changeRate3m\`·\`changeRate12m\`(및 그 부속 건수·저신뢰 필드)까지 계산하지만
(\`scripts/pipeline/aggregate.ts\`), 이 산출물(complexes.json)에는 **담지 않는다.**

- \`medianPrice\`: 특정 가격을 대표값으로 단정하면 감정평가에 저촉될 수
  있어, 화면은 가격을 항상 \`minPrice\`~\`maxPrice\` 범위로만 말한다.
- \`changeRate3m\`/\`changeRate12m\`류: 부모 스펙 §12가 금지하는 "수익률
  예측"으로 읽히기 쉽다.

둘 다 화면 표시가 금지된 값이라 애초에 쓸 곳이 없다 — 타입에서(그리고
이제 산출물에서도) 빼 두면 실수로 화면에 흘릴 방법 자체가 사라진다.

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

## monthly.json (MonthlySeries)

월별 시세 시계열이다. complexes.json과 **별도 파일**로 낸다 — 화면에
붙이는 것은 이 파이프라인 작업과 별개의 결정이라, 지금은 파이프라인이
만들기만 하고 **\`src/\`는 이 파일을 import하지 않는다**
(\`scripts/pipeline/monthly.test.ts\`의 가드가 지킨다).

최상위는 객체(\`Record<string, MonthlyPoint[]>\`)다 — 배열이 아니다.

- 키: \`complexKey|areaBucket\` (complexes.json 집계와 같은 키 형식이라
  같은 키로 조인할 수 있다). 키는 오름차순 정렬돼 있다.
- 값: 그 단지×평형의 월별 시계열, **월 오름차순** 배열. 각 원소:

| 필드 | 타입 | 의미 |
|---|---|---|
| month | string (YYYY-MM) | 계약월 |
| minPrice / maxPrice | number | 원 단위 정수. 그 달 거래들의 최저·최고가 |
| tradeCount | number | 그 달 거래 건수 |

complexes.json과 같은 규칙으로 **\`medianPrice\`도 변동률도 없다** — 화면이
낼 수 있는 것은 범위(min~max)와 건수뿐이라는 방침(위 "내보내지 않는
필드" 참고)이 월별 시계열에도 그대로 적용된다.

complexes.json과 달리 "최근 6개월 대표가" 하나로 뭉치지 않고, raw 거래가
커버하는 모든 달을 각각 담는다(asOf 이후 미래 거래만 제외).

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
  writeFileSync(join(dataDir, "complexes.json"), JSON.stringify(units.map(toEmittedUnit)));
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
