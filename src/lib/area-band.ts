/**
 * 평형대(전용면적 구간). 화면 1의 **네 번째 질문**이 고르는 값이다.
 *
 * 사용자가 숫자를 직접 치지 않게 세 구간으로 나눈다 — **60㎡ 이하 /
 * 60~85㎡ / 85㎡ 초과.** 예전에는 넷이었다(소형·중소형·중형·대형,
 * 102㎡에서 한 번 더 갈랐다). 사용자가 직접 지시한 구간이 셋이라
 * 그대로 따랐고, 102㎡ 경계는 계산이 그 지점에서 아무것도 가르지 않아
 * 함께 사라졌다 — 앞 두 구간의 뜻은 예전 "소형"·"중소형" 그대로이고,
 * "중형"과 "대형"이 "중대형" 하나로 합쳐진 것이다.
 *
 * ⚠ **이 값은 "목록·지도에 무엇을 보여줄까"라는 축이지, "부대비용을
 * 어느 면적으로 계산할까"라는 축이 아니다.** 둘은 다른 질문이고, 이
 * 저장소가 여섯 번 반복한 사고가 정확히 "한 축의 값이 다른 축의
 * 기본값으로 흘러드는" 형태다. 그래서 이 모듈은 `BuyerProfile`을
 * 만들지도, `exclusiveAreaSqm`을 정하지도 않는다 — 매물을 거르는 술어와
 * **참/거짓 하나**({@link includesAreaAboveThreshold})만 제공한다.
 *
 * ⚠ **예전 주석은 "헤드라인(실구매 가능 가격)은 룰셋에서 온 가정
 * 면적으로 계산한다"고 적혀 있었다. 지금은 거짓이다.** 사용자가 평형대를
 * 직접 고르게 된 뒤로, 헤드라인은 고른 구간에 **85㎡ 초과가 섞였는지**를
 * 보고 계산한다(`useProfileForm`의 `assumedExclusiveAreaSqm`). 섞였으면
 * 농특세가 붙는 쪽(보수적)으로, 아니면 85㎡ 이하로 — 그때는 가정이
 * 아니라 **사실**이다. 고른 구간이 전부 85㎡ 이하이기 때문이다.
 *
 * 이것이 위 경고와 어긋나지 않는 이유: 흘려보내는 것은 **면적 값이
 * 아니라** "85㎡ 초과가 섞였는가"라는 참/거짓 하나이고, 그것이 면적이
 * 계산을 실제로 가르는 유일한 지점이기 때문이다(농특세 —
 * `finance/acquisition-cost.ts`, 정책대출 면적 제한 —
 * `finance/policy-loans.ts`. 둘 다 85㎡ **초과**에서 갈린다). 범위에서
 * 대표값 하나를 지어내지 않는다.
 *
 * 각 단지 줄과 상세는 지금까지처럼 **그 평형의 실제 전용면적**
 * (`ComplexUnit.maxExclusiveAreaSqm`)으로 계산한다. 변한 것 없다.
 *
 * **85㎡ 경계는 룰셋에서 받는다.** 농특세가 실제로 갈리는 지점이고
 * (`rules.acquisitionTax.ruralTaxAreaThresholdSqm`), 코드가 이미 그
 * 경계를 안다. 숫자를 여기 박아 두면 룰셋이 바뀌었을 때 "중소형"의 뜻과
 * 취득세 계산이 조용히 어긋난다.
 */

/**
 * 첫 구간과 둘째 구간을 가르는 경계(㎡). **이하**다 — 60.00㎡ 자체는
 * 첫 구간(소형)에 든다. 국민주택 소형 기준이다.
 */
export const SMALL_UPPER_SQM = 60;

export type AreaBand = "소형" | "중소형" | "중대형";

/** 화면에 그리는 순서 그대로. 좁은 쪽에서 넓은 쪽으로 */
export const AREA_BANDS: readonly AreaBand[] = ["소형", "중소형", "중대형"];

/** 구간의 한쪽 경계 */
export interface AreaBandBound {
  /** 경계값(㎡) */
  sqm: number;
  /** 경계값 **자체**가 이 구간에 드는가 */
  inclusive: boolean;
}

export interface AreaBandRange {
  band: AreaBand;
  /** 이 구간의 아래 경계. `null`이면 아래로 열려 있다 */
  from: AreaBandBound | null;
  /** 이 구간의 위 경계. `null`이면 위로 열려 있다 */
  to: AreaBandBound | null;
  /** 칩에 작게 적는 범위 라벨. ㎡가 주(主)다 */
  rangeLabel: string;
}

/**
 * 구간을 가르는 자리 하나.
 *
 * ⚠ **경계를 구간마다 따로 적지 않고 여기 한 번만 적는 것이 요점이다.**
 * 이웃한 두 구간이 같은 컷을 나눠 갖고, `belongsBelow`가 그 값을 누가
 * 가질지 정한다 — 그래서 **빈틈도 겹침도 만들 수 없다.** 구간마다 상·하한을
 * 손으로 적으면 언젠가 한쪽만 고쳐 59.99㎡짜리 집이 어느 구간에도 들지
 * 않는 날이 온다(그런 집은 어느 칩을 눌러도 목록에 나오지 않는데, 화면은
 * 그 이유를 말할 방법이 없다).
 */
interface AreaBandCut {
  sqm: number;
  /** 경계값 자체가 **아래** 구간에 드는가 */
  belongsBelow: boolean;
}

/**
 * 두 컷이 세 구간을 만든다.
 *
 * 두 컷 모두 경계값이 **아래** 구간에 든다(=이하):
 * - 60은 소형에 든다 — 사용자가 말한 구간이 "60 이하 / 60~85 / 85 초과"다.
 * - 85는 중소형에 든다 — 농특세는 85㎡ **초과**부터 붙으므로, 이렇게
 *   두어야 "중소형 이하를 골랐다"와 "농특세가 붙지 않는 집을 골랐다"가
 *   정확히 같은 말이 된다. 위로 밀면 그 두 문장이 85㎡ 하나만큼 어긋나고,
 *   어긋나는 방향이 하필 낙관 쪽이다.
 */
function areaBandCuts(ruralTaxAreaThresholdSqm: number): AreaBandCut[] {
  return [
    { sqm: SMALL_UPPER_SQM, belongsBelow: true },
    { sqm: ruralTaxAreaThresholdSqm, belongsBelow: true },
  ];
}

/** 세 구간의 경계와 라벨. 컷에서 유도하므로 빈틈·겹침이 생길 수 없다 */
export function areaBandRanges(
  ruralTaxAreaThresholdSqm: number,
): AreaBandRange[] {
  const cuts = areaBandCuts(ruralTaxAreaThresholdSqm);
  const labels = [
    `${SMALL_UPPER_SQM}㎡ 이하`,
    `${SMALL_UPPER_SQM}~${ruralTaxAreaThresholdSqm}㎡`,
    `${ruralTaxAreaThresholdSqm}㎡ 초과`,
  ];

  return AREA_BANDS.map((band, i) => {
    const below = cuts[i - 1];
    const above = cuts[i];
    return {
      band,
      // 아래 컷의 값이 아래 구간 것이면 이 구간에는 들지 않는다 — 한
      // 컷의 소유를 두 구간이 정반대로 읽는다.
      from:
        below === undefined
          ? null
          : { sqm: below.sqm, inclusive: !below.belongsBelow },
      to:
        above === undefined
          ? null
          : { sqm: above.sqm, inclusive: above.belongsBelow },
      rangeLabel: labels[i]!,
    };
  });
}

/**
 * 전용면적 하나가 어느 구간에 속하는가.
 *
 * 구간이 전 구간을 빠짐없이 덮으므로 항상 하나를 돌려준다 — 0 이하나
 * 아주 큰 값도 각각 소형·중대형에 들어간다.
 */
export function areaBandOf(
  sqm: number,
  ruralTaxAreaThresholdSqm: number,
): AreaBand {
  const ranges = areaBandRanges(ruralTaxAreaThresholdSqm);
  for (const range of ranges) {
    if (range.to === null) return range.band;
    if (sqm < range.to.sqm) return range.band;
    if (range.to.inclusive && sqm === range.to.sqm) return range.band;
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
 * 고른 평형대에 **임계값(85㎡)을 넘는 면적이 섞여 있는가.**
 *
 * ⚠ **헤드라인(실구매 가능 가격)이 평형대 선택에서 가져가는 유일한
 * 정보다.** 면적 값을 흘려보내지 않는다 — 범위에서 대표값 하나를 뽑는
 * 규칙을 새로 만들면 그 규칙이 화면 어디에도 적히지 않은 채 헤드라인을
 * 움직인다. 면적이 계산을 가르는 지점은 85㎡ 하나뿐이므로(농특세·정책대출
 * 면적 제한) 필요한 것은 참/거짓 하나가 전부다.
 *
 * 판정은 임계값을 인자로 받아 한다 — 구간 이름("중대형")으로 하드코딩하면
 * 룰셋이 85 → 100으로 바뀌어 구간 경계가 함께 움직인 날, 이 함수만 옛
 * 뜻을 계속 말한다.
 *
 * 빈 선택은 거짓이다. 그 상태는 결과 화면에 이르지 못하고(화면 1이
 * 막는다), 화면 문구가 "고른 평형대에 …가 있어서"라 없는 선택을 있다고
 * 말할 수는 없다.
 */
export function includesAreaAboveThreshold(
  bands: readonly AreaBand[],
  ruralTaxAreaThresholdSqm: number,
): boolean {
  return areaBandRanges(ruralTaxAreaThresholdSqm).some((range) => {
    if (!bands.includes(range.band)) return false;
    // 위로 열려 있으면 당연히 넘는 면적을 품는다. 닫혀 있으면 그
    // 상한이 임계값보다 클 때만 품는다 — 상한이 임계값과 같고 그 값을
    // 포함하는 구간(중소형)은 "이하"라 품지 않는다.
    return range.to === null || range.to.sqm > ruralTaxAreaThresholdSqm;
  });
}

/**
 * 고른 평형대를 종이에 적을 한 줄로 만든다(`PrintSummary`).
 *
 * 전부 고르면 "전체"라고 적는다 — 세 구간을 다 나열하면 종이에서 뜻이
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
