import { pyeongToSqm, sqmToPyeong } from "../format/area";
import { formatWon } from "../format/won";
import type { ComplexFilterState, NumericRange } from "../lib/complex-filters";
import { RangeSlider } from "./RangeSlider";

/**
 * 원 단위 억으로 축약한 눈금용 문자열("13" → "13억"). `formatWon`은
 * "1억 3,500만원"처럼 슬라이더 위 범위 문구에는 맞지만, 눈금처럼 좁은
 * 자리에 반복해 찍기엔 길다 — 참고 사진의 "10억"·"20억" 같은 짧은
 * 표기를 그대로 쓴다. 1억 미만 자투리는 눈금에서 버린다(눈금은 늘
 * 억 단위로 떨어지는 값만 고르므로 실제로 버려질 자투리가 없다 —
 * `niceAxisStep`이 항상 1·2·5·10 계열이라 억 단위 아래로는 안
 * 내려간다).
 */
function formatPriceTick(won: number): string {
  return `${Math.round(won / 100_000_000)}억`;
}

/**
 * ㎡ 경계를 평 정수 경계로. **바깥쪽으로만 반올림한다**(최소는 내림,
 * 최대는 올림) — `src/lib/complex-filters.ts`의 `areaBounds`가 ㎡에서
 * 이미 쓰는 것과 같은 방향이다. 슬라이더의 `min`/`max`/`step=1`이
 * 정수 평 단위로 딱 떨어져야 손잡이가 "24평, 25평"처럼 뜻이 서는
 * 자리에서만 멎는다 — 안쪽으로 반올림하면(또는 반올림하지 않으면)
 * 소수점 끝자리의 실제 매물이 슬라이더 범위 밖으로 밀려나거나, 손잡이
 * 한 칸이 화면에 보이는 정수 하나를 정확히 가리키지 못한다.
 */
function toPyeongBounds(range: NumericRange): NumericRange {
  return {
    min: Math.floor(sqmToPyeong(range.min)),
    max: Math.ceil(sqmToPyeong(range.max)),
  };
}

/** ㎡ 값 하나를 평으로. 경계가 아니라 지금 손잡이 값을 옮길 때 쓴다. */
function toPyeongValue(range: NumericRange, bounds: NumericRange): NumericRange {
  // 사용자가 아직 손대지 않았으면(=값이 경계와 같으면) 평으로 바꾼 값도
  // 정확히 평 경계와 같아야 `RangeSlider`가 "전체"로 판단한다 — 부동
  // 소수 변환 오차(sqmToPyeong(areaBounds.min) !== toPyeongBounds().min)가
  // 그 비교를 조용히 깨뜨리지 않도록, 경계와 같은 값은 반올림한 평
  // 경계를 그대로 쓴다.
  return {
    min: range.min === bounds.min ? toPyeongBounds(bounds).min : sqmToPyeong(range.min),
    max: range.max === bounds.max ? toPyeongBounds(bounds).max : sqmToPyeong(range.max),
  };
}

export interface ComplexFiltersProps {
  /** 그 지역 데이터의 실제 최소·최대(App.tsx의 `complexFilterBounds`) */
  bounds: ComplexFilterState;
  /** 지금 슬라이더 값 */
  value: ComplexFilterState;
  onChange: (value: ComplexFilterState) => void;
}

/**
 * 사용자 지시("필터 : 면적/입주년차/세대수/가격을 조정하여 필터로",
 * 세대수는 조인할 데이터가 없어 별도 과제로 뺐다)의 면적·가격·입주년차
 * 세 슬라이더.
 *
 * **매물 유형·행정동 좁히기와 같은 자리(`App.tsx`의 `.complex-filters`)에
 * 선다** — 셋 다 "조회 조건" 축이지 이 목록의 핵심 값이 아니다.
 *
 * 값의 출처·경계는 이 컴포넌트가 정하지 않는다. `bounds`는 App.tsx가
 * `complexFilterBounds`로 매번 그 지역 데이터에서 다시 재고, `value`도
 * App.tsx가 들고 있다가 지역을 새로 조회할 때마다 `bounds`로 되돌린다
 * (지역이 바뀌었는데 이전 지역의 좁은 범위가 남으면 새 지역 목록이
 * 조용히 텅 빈다).
 */
export function ComplexFilters({ bounds, value, onChange }: ComplexFiltersProps) {
  const areaBoundsPyeong = toPyeongBounds(bounds.area);
  const areaValuePyeong = toPyeongValue(value.area, bounds.area);

  return (
    <div className="complex-range-filters">
      <RangeSlider
        label="매매가"
        min={bounds.price.min}
        max={bounds.price.max}
        step={10_000_000}
        value={value.price}
        formatValue={formatWon}
        formatTick={formatPriceTick}
        onChange={(price) => onChange({ ...value, price })}
      />
      {/*
        사용자 지시(참고 사진): 면적 슬라이더는 평으로 보여준다. **거르는
        값은 여전히 ㎡다** — 여기서 평으로 바꾼 값을 다시 ㎡로 되돌려
        `onChange`에 넘긴다(`src/format/area.ts`의 경고 주석 참고).
        `min`/`max`(=경계)도 함께 평으로 바꿔야 `RangeSlider`가 "전체"
        여부를 그 경계와 비교해 스스로 판단할 수 있다.
      */}
      <RangeSlider
        label="면적"
        min={areaBoundsPyeong.min}
        max={areaBoundsPyeong.max}
        step={1}
        value={areaValuePyeong}
        formatValue={(v) => `${Math.round(v)}평`}
        onChange={(areaPyeong) =>
          onChange({
            ...value,
            area: {
              min: pyeongToSqm(areaPyeong.min),
              max: pyeongToSqm(areaPyeong.max),
            },
          })
        }
      />
      <RangeSlider
        label="입주년차"
        min={bounds.builtYearAge.min}
        max={bounds.builtYearAge.max}
        step={1}
        value={value.builtYearAge}
        formatValue={(v) => `${v}년차`}
        formatTick={(v) => `${v}년`}
        onChange={(builtYearAge) => onChange({ ...value, builtYearAge })}
      />
    </div>
  );
}
