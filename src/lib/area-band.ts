/**
 * 평형대(전용면적 구간). 화면 1의 **네 번째 질문**이 고르는 값이다.
 *
 * 사용자가 숫자를 직접 치지 않게 네 구간으로 나눈다. 구간은
 * `docs/superpowers/specs/2026-08-27-세질문-간소화-design.md` §4의 표
 * 그대로다.
 *
 * ⚠ **이 값은 "목록·지도에 무엇을 보여줄까"라는 축이지, "부대비용을
 * 어느 면적으로 계산할까"라는 축이 아니다.** 둘은 다른 질문이고, 이
 * 저장소가 여섯 번 반복한 사고가 정확히 "한 축의 값이 다른 축의
 * 기본값으로 흘러드는" 형태다. 그래서 이 모듈은 `BuyerProfile`을
 * 만들지도, `exclusiveAreaSqm`을 정하지도 않는다 — 매물을 거르는 술어
 * 하나만 제공한다. 각 단지 줄과 상세는 지금까지처럼 **그 평형의 실제
 * 전용면적**(`ComplexUnit.maxExclusiveAreaSqm`)으로 계산하고, 헤드라인
 * (실구매 가능 가격)은 지금까지처럼 룰셋에서 온 가정 면적으로 계산하며
 * 그 사실을 `AssumptionLine`이 문장으로 말한다.
 *
 * **85㎡ 경계는 룰셋에서 받는다.** 농특세가 실제로 갈리는 지점이고
 * (`rules.acquisitionTax.ruralTaxAreaThresholdSqm`), 코드가 이미 그
 * 경계를 안다. 숫자를 여기 박아 두면 룰셋이 바뀌었을 때 "중소형"의 뜻과
 * 취득세 계산이 조용히 어긋난다.
 */

/** 소형의 상한(㎡, 이하). 국민주택 소형 기준이다 */
export const SMALL_UPPER_SQM = 60;

/** 중형의 상한(㎡, 이하). 그 위는 전부 대형이다 */
export const MEDIUM_UPPER_SQM = 102;

export type AreaBand = "소형" | "중소형" | "중형" | "대형";

/** 화면에 그리는 순서 그대로. 좁은 쪽에서 넓은 쪽으로 */
export const AREA_BANDS: readonly AreaBand[] = ["소형", "중소형", "중형", "대형"];

export interface AreaBandRange {
  band: AreaBand;
  /**
   * 이 구간의 하한(㎡). **초과**다 — 경계값 자체는 바로 앞 구간에
   * 속한다. `null`이면 아래로 열려 있다.
   */
  moreThanSqm: number | null;
  /** 이 구간의 상한(㎡). **이하**다. `null`이면 위로 열려 있다 */
  upToSqm: number | null;
  /** 칩에 작게 적는 범위 라벨. ㎡가 주(主)다 */
  rangeLabel: string;
}

/**
 * 네 구간의 경계. 경계를 **이하**로 잡아 85㎡가 "중소형"에 들어가게
 * 한다 — 농특세는 85㎡ **초과**부터 붙으므로, 이렇게 두어야 "중소형
 * 이하를 골랐다"와 "농특세가 붙지 않는 집을 골랐다"가 정확히 같은 말이
 * 된다. 경계를 미만으로 잡으면 그 두 문장이 85㎡ 하나만큼 어긋나고,
 * 어긋나는 방향이 하필 낙관 쪽이다(농특세가 붙는 집을 안 붙는 구간에
 * 넣게 된다).
 */
export function areaBandRanges(
  ruralTaxAreaThresholdSqm: number,
): AreaBandRange[] {
  return [
    {
      band: "소형",
      moreThanSqm: null,
      upToSqm: SMALL_UPPER_SQM,
      rangeLabel: `~${SMALL_UPPER_SQM}㎡`,
    },
    {
      band: "중소형",
      moreThanSqm: SMALL_UPPER_SQM,
      upToSqm: ruralTaxAreaThresholdSqm,
      rangeLabel: `${SMALL_UPPER_SQM}~${ruralTaxAreaThresholdSqm}㎡`,
    },
    {
      band: "중형",
      moreThanSqm: ruralTaxAreaThresholdSqm,
      upToSqm: MEDIUM_UPPER_SQM,
      rangeLabel: `${ruralTaxAreaThresholdSqm}~${MEDIUM_UPPER_SQM}㎡`,
    },
    {
      band: "대형",
      moreThanSqm: MEDIUM_UPPER_SQM,
      upToSqm: null,
      rangeLabel: `${MEDIUM_UPPER_SQM}㎡~`,
    },
  ];
}

/**
 * 전용면적 하나가 어느 구간에 속하는가.
 *
 * 구간이 전 구간을 빠짐없이 덮으므로 항상 하나를 돌려준다 — 0 이하나
 * 아주 큰 값도 각각 소형·대형에 들어간다.
 */
export function areaBandOf(
  sqm: number,
  ruralTaxAreaThresholdSqm: number,
): AreaBand {
  const ranges = areaBandRanges(ruralTaxAreaThresholdSqm);
  for (const range of ranges) {
    if (range.upToSqm === null || sqm <= range.upToSqm) return range.band;
  }
  // 마지막 구간은 위로 열려 있으므로 도달하지 않는다. 그래도 값을
  // 지어내지 않고 마지막 구간을 돌려준다.
  return ranges[ranges.length - 1]!.band;
}

/**
 * 이 전용면적이 사용자가 고른 평형대에 드는가.
 *
 * **빈 선택은 "전체"가 아니다.** 아무것도 고르지 않았으면 아무것도
 * 맞지 않는다고 답한다 — 빈 선택을 조용히 "필터 없음"으로 바꿔 읽으면,
 * 화면은 사용자가 고른 적 없는 조건으로 결과를 그리면서 그 사실을
 * 말하지 않게 된다. 화면 1은 그 상태에서 조회 자체를 시작하지 않고
 * "평형대를 하나 이상 골라 주세요"라고 말한다(App.tsx).
 *
 * 기본값이 **전체 선택**이라 처음 온 사용자에게는 이 구분이 보이지
 * 않는다(`DEFAULT_FORM_STATE.areaBands`).
 */
export function matchesAreaBands(
  sqm: number,
  bands: readonly AreaBand[],
  ruralTaxAreaThresholdSqm: number,
): boolean {
  return bands.includes(areaBandOf(sqm, ruralTaxAreaThresholdSqm));
}

/**
 * 고른 평형대를 종이에 적을 한 줄로 만든다(`PrintSummary`).
 *
 * 전부 고르면 "전체"라고 적는다 — 네 구간을 다 나열하면 종이에서 뜻이
 * 서지 않고, "필터를 걸지 않았다"가 이 답의 실제 내용이다. 하나도
 * 고르지 않은 상태는 결과 화면에 이르지 못하지만, 이 함수는 폼 상태만
 * 보므로 그 경우에도 값을 지어내지 않는다.
 */
export function describeAreaBands(
  bands: readonly AreaBand[],
  ruralTaxAreaThresholdSqm: number,
): string {
  if (bands.length === 0) return "고르지 않음";
  if (bands.length === AREA_BANDS.length) return "전체";
  const ranges = areaBandRanges(ruralTaxAreaThresholdSqm);
  return ranges
    .filter((range) => bands.includes(range.band))
    .map((range) => `${range.band}(${range.rangeLabel})`)
    .join(" · ");
}
