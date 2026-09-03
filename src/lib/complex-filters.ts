import type { ComplexUnit } from "../data/complexes";

/**
 * 목록·지도 화면의 슬라이더 필터(사용자 지시: "필터 : 면적/입주년차/세대수/
 * 가격을 조정하여 필터로"). 세대수는 조인할 데이터가 아직 없어 뺐고
 * (별도 과제 — API 점검 결과 참고), 이 파일은 **면적·가격·입주년차** 셋을
 * 다룬다.
 *
 * ⚠ **이 필터는 `BuyerProfile.exclusiveAreaSqm`(헤드라인 계산이 가정하는
 * 면적)과 다른 축이다.** 화면 1의 평형대 질문이 사라진 뒤(사용자 지시),
 * 헤드라인은 언제나 룰셋의 `ruralTaxAreaThresholdSqm`(85㎡) 이하로
 * 가정한다(`useProfileForm`의 `toProfile` 참고) — 이 파일의 면적 필터는
 * "목록에 무엇을 보여줄까"만 정하고, 그 가정을 절대 바꾸지 않는다. 이
 * 저장소가 여섯 번 반복한 사고("한 축의 값이 다른 축의 기본값으로
 * 흘러드는 것")를 다시 반복하지 않으려는 경계다.
 *
 * 각 단지 줄·상세는 지금까지처럼 그 평형의 **실제** 전용면적으로
 * 부대비용·정책대출 자격을 계산한다 — 이 필터는 그 계산에 관여하지 않고
 * 어느 줄을 화면에 낼지만 정한다.
 */

export interface NumericRange {
  min: number;
  max: number;
}

/**
 * 슬라이더 3축의 지금 값. **언제나 구체적인 [최소, 최대]다** — "필터를
 * 아직 안 걸었다"는 상태를 `null`로 따로 두지 않는다. 대신 지역을 새로
 * 조회할 때마다 {@link priceBounds}·{@link areaBounds}·
 * {@link builtYearAgeBounds}가 그 지역 데이터의 실제 최소·최대로 다시
 * 계산되고, 그 값 그대로가 "필터 없음"과 같은 뜻이 된다(범위가 데이터
 * 전체를 덮으므로 아무것도 걸러지지 않는다).
 */
export interface ComplexFilterState {
  price: NumericRange;
  area: NumericRange;
  builtYearAge: NumericRange;
}

/** 값이 이 범위 안(양 끝 포함)인가 */
function withinRange(value: number, range: NumericRange): boolean {
  return value >= range.min && value <= range.max;
}

/**
 * 빈 목록의 경계. 실제로 이 값 그대로 필터에 쓰이는 일은 없다 — 호출부가
 * `units.length === 0`이면 애초에 필터를 걸 것이 없다(App.tsx가 그
 * 상태를 먼저 가른다). 그래도 `Math.min(...[])`(=Infinity)을 그대로
 * 두면 슬라이더가 `min > max`인 뒤집힌 범위를 받게 되므로, 여기서
 * `{ min: 0, max: 0 }`으로 막는다.
 */
const EMPTY_BOUNDS: NumericRange = { min: 0, max: 0 };

/**
 * 매매가 범위(원). 그 지역 매물의 `maxPrice` 최소·최대를 그대로 쓴다 —
 * 대표값을 지어내지 않는다는 이 저장소의 원칙과 같은 이유로, 반올림도
 * 하지 않는다(가격은 이미 원 단위 정수이고 자릿수를 접으면 "5,000만원
 * 언저리"가 실제 최댓값보다 낮아져 그 값의 매물이 슬라이더 밖으로
 * 밀려난다).
 */
export function priceBounds(units: readonly ComplexUnit[]): NumericRange {
  if (units.length === 0) return EMPTY_BOUNDS;
  const prices = units.map((u) => u.maxPrice);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * 전용면적 범위(㎡). **바깥쪽으로만 반올림한다**(최소는 내림, 최대는
 * 올림) — 안쪽으로 반올림하면 소수점 끝자리의 실제 매물이 슬라이더
 * 범위 밖으로 밀려난다. 이 방향(넓히는 쪽으로 틀리기)은 이
 * 저장소에서 반복해서 쓰는 원칙이다(`location-config.json`의 버퍼
 * 방향과 같다) — 좁히는 쪽은 매물을 조용히 숨기지만, 넓히는 쪽은
 * 슬라이더 눈금이 정수 하나만큼 여유로울 뿐이다.
 */
export function areaBounds(units: readonly ComplexUnit[]): NumericRange {
  if (units.length === 0) return EMPTY_BOUNDS;
  const areas = units.map((u) => u.maxExclusiveAreaSqm);
  return { min: Math.floor(Math.min(...areas)), max: Math.ceil(Math.max(...areas)) };
}

/**
 * 입주년차 범위(년). `now.getFullYear() - builtYear` — `ComplexDetail.tsx`의
 * `builtLabel`이 "N년차"를 셀 때 쓰는 것과 같은 계산이다.
 *
 * **최소는 0 아래로 내려가지 않는다.** 입주 전(준공년도가 미래인) 단지는
 * 이 계산이 음수를 낼 수 있는데, "마이너스 년차"는 사용자에게 뜻이 서지
 * 않는 슬라이더 눈금이다 — 그런 단지는 연차 0(신축과 같은 취급)으로
 * 걸러지게 최소를 0에 묶는다. `now`를 인자로 받는 이유는 이 파일이
 * "지금이 몇 년인가"를 스스로 부르지 않기 위해서다(테스트가 날짜를
 * 고정할 수 있어야 한다) — `PrintSummary`의 `now` prop과 같은 이유다.
 */
export function builtYearAgeBounds(
  units: readonly ComplexUnit[],
  now: Date,
): NumericRange {
  if (units.length === 0) return EMPTY_BOUNDS;
  const year = now.getFullYear();
  const ages = units.map((u) => year - u.builtYear);
  return { min: Math.max(0, Math.min(...ages)), max: Math.max(...ages) };
}

/** 세 축을 한 번에 계산한다. App.tsx가 지역을 새로 조회할 때마다 부른다. */
export function complexFilterBounds(
  units: readonly ComplexUnit[],
  now: Date,
): ComplexFilterState {
  return {
    price: priceBounds(units),
    area: areaBounds(units),
    builtYearAge: builtYearAgeBounds(units, now),
  };
}

/** 세 축을 모두 적용해 거른다. 순서는 뜻에 영향이 없다 — 세 술어의 교집합이다. */
export function filterByComplexFilters(
  units: readonly ComplexUnit[],
  filters: ComplexFilterState,
  now: Date,
): ComplexUnit[] {
  const year = now.getFullYear();
  return units.filter(
    (u) =>
      withinRange(u.maxPrice, filters.price) &&
      withinRange(u.maxExclusiveAreaSqm, filters.area) &&
      withinRange(year - u.builtYear, filters.builtYearAge),
  );
}

/**
 * 이 축 하나만 지금 범위 대신 **전체 범위**(그 지역 데이터의 실제
 * 최소·최대)로 풀면 결과가 생기는가.
 *
 * 0건일 때 "어느 조건을 넓혀야 하는지"를 축마다 따로 답하기 위한
 * 함수다 — 세 조건을 한 문구로 뭉뚱그리면 사용자가 어느 슬라이더를
 * 만져야 할지 알 수 없다(이 저장소가 지역·평형대·예산 세 축을 가를 때
 * 이미 겪은 실패와 같은 형태). 다른 두 축은 지금 값 그대로 두고 이
 * 축만 전체로 되돌려 다시 걸러 본다.
 */
export function wouldHelpToResetAxis(
  units: readonly ComplexUnit[],
  filters: ComplexFilterState,
  bounds: ComplexFilterState,
  axis: "price" | "area" | "builtYearAge",
  now: Date,
): boolean {
  const relaxed: ComplexFilterState = { ...filters, [axis]: bounds[axis] };
  return filterByComplexFilters(units, relaxed, now).length > 0;
}
