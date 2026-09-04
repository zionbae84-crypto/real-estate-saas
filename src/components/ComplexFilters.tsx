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
 * 매매가 슬라이더의 고정 상한. 그 지역 실제 최고가(강남구 한 채가
 * 218억까지 올라간 경우를 실측했다)까지 슬라이더를 늘리면, 대부분의
 * 매물이 몰린 낮은 구간이 트랙의 극히 일부로 눌려 손잡이를 세밀하게
 * 움직일 수 없다. 그래서 40억을 넘는 값은 전부 오른쪽 끝(아래
 * `isPriceCapped`가 참일 때만 걸린다 — 그 지역 실제 최댓값이 40억
 * 이하면 상한이 할 일이 없다)에 뭉친다. 그 끝의 글자는 `RangeSlider`의
 * 기본값 "최대"를 그대로 쓴다(사용자 지시로 "40억 초과" 문구는 걷어냈다
 * — 상한 자체는 그대로 살아 있다).
 */
const PRICE_CAP = 4_000_000_000;

/**
 * 면적 슬라이더의 고정 상한(평). {@link PRICE_CAP}과 같은 이유(그 지역
 * 실제 최댓값이 훨씬 큰 아웃라이어 하나 때문에 대부분의 매물이 몰린
 * 낮은 구간이 눌리는 것을 막는다)로 둔다.
 *
 * 값 자체(40)는 사용자 지시("10평/20평/30평 각 구간을 만들고 마지막을
 * 최대로")를 만족하는 가장 작은 값이다 — 10평 간격 눈금은 상한
 * **자체**는 눈금으로 찍지 않으므로(`niceAxisTicks`의 "max 자체는
 * 포함하지 않는다" 규칙), 상한을 30으로 두면 30이 "최대"에 먹혀 절대
 * 제 눈금으로 못 뜬다. 40으로 한 칸 올려야 10·20·30이 전부 살고,
 * "최대"는 그 뒤(40 또는 그보다 큰 실제 최댓값)에 따로 선다.
 */
const AREA_CAP_PYEONG = 40;

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

  /*
   * 상한을 걸 뜻이 있을 때만 건다 — 그 지역 실제 최댓값이 이미 상한
   * 이하면 상한이 할 일이 없다(오히려 `min < max`가 깨질 수 있는
   * 극단값 방어이기도 하다: 최저가 자체가 상한을 넘는 초고가 지역이면
   * 상한을 걸지 않고 원래대로 실제 최댓값을 쓴다).
   */
  const isPriceCapped = bounds.price.max > PRICE_CAP && bounds.price.min < PRICE_CAP;
  const priceSliderMax = isPriceCapped ? PRICE_CAP : bounds.price.max;
  // 상한을 걸면 손잡이도 그 이상은 못 넘어간다 — 실제 값이 상한보다
  // 커도(예: 218억짜리 한 채 때문에 안 건드린 값이 여전히 그 실제
  // 최댓값이다) 화면에는 상한에 붙어 있는 것으로 보여준다.
  const priceValueForSlider = {
    min: value.price.min,
    max: isPriceCapped ? Math.min(value.price.max, PRICE_CAP) : value.price.max,
  };

  const isAreaCapped = areaBoundsPyeong.max > AREA_CAP_PYEONG && areaBoundsPyeong.min < AREA_CAP_PYEONG;
  const areaSliderMaxPyeong = isAreaCapped ? AREA_CAP_PYEONG : areaBoundsPyeong.max;
  const areaValuePyeongForSlider = {
    min: areaValuePyeong.min,
    max: isAreaCapped ? Math.min(areaValuePyeong.max, AREA_CAP_PYEONG) : areaValuePyeong.max,
  };

  return (
    <div className="complex-range-filters">
      {/*
        사용자 지시: 매매가는 "10억단위로 구분" — 눈금 최소 단위를
        10억으로 못박는다(`tickUnit`). 오른쪽 끝은 `priceSliderMax`
        (상한이 걸렸으면 40억, 아니면 실제 최댓값)이고, 라벨은 다른
        축과 똑같이 기본값 "최대"를 쓴다. 손잡이가 상한에 붙은 채로
        나가는 값은 실제 최댓값으로 되돌린다 — 상한은 슬라이더가 세밀한
        구간에 집중하기 위한 화면상의 장치일 뿐, 40억을 넘는 매물을
        실제로 걸러내진 않는다(아래 onChange).
      */}
      <RangeSlider
        label="매매가"
        min={bounds.price.min}
        max={priceSliderMax}
        step={10_000_000}
        value={priceValueForSlider}
        formatValue={formatWon}
        formatTick={formatPriceTick}
        tickUnit={1_000_000_000}
        onChange={(price) =>
          onChange({
            ...value,
            price: {
              min: price.min,
              max: isPriceCapped && price.max >= PRICE_CAP ? bounds.price.max : price.max,
            },
          })
        }
      />
      {/*
        사용자 지시(참고 사진): 면적 슬라이더는 평으로 보여준다. **거르는
        값은 여전히 ㎡다** — 여기서 평으로 바꾼 값을 다시 ㎡로 되돌려
        `onChange`에 넘긴다(`src/format/area.ts`의 경고 주석 참고).
        `min`/`max`(=경계)도 함께 평으로 바꿔야 `RangeSlider`가 "전체"
        여부를 그 경계와 비교해 스스로 판단할 수 있다.

        라벨은 "면적 (전용)" — 이 앱의 면적은 전부 국토부 실거래가의
        전용면적(`excluUseAr`)이지 분양 안내에 흔한 공급면적이 아니다.
        사용자가 "평" 하나만 보고 어느 기준인지 헷갈리지 않도록(사용자
        지시) 라벨에 바로 적는다.

        사용자 지시: "10평/20평/30평 각 구간을 만들고 마지막을 최대로" —
        10평 간격 눈금(`tickUnit`)이 10·20·30 세 구간을 각자 따로 낸다.
        "최대"는 상한(40평, 또는 그보다 큰 실제 최댓값)에서 다른 축과
        똑같이 뜬다. 손잡이가 상한에 붙은 채로 나가는 값은 실제
        최댓값으로 되돌린다(아래 onChange).
      */}
      <RangeSlider
        label="면적 (전용)"
        min={areaBoundsPyeong.min}
        max={areaSliderMaxPyeong}
        step={1}
        value={areaValuePyeongForSlider}
        formatValue={(v) => `${Math.round(v)}평`}
        tickUnit={10}
        onChange={(areaPyeong) =>
          onChange({
            ...value,
            area: {
              min: pyeongToSqm(areaPyeong.min),
              max:
                isAreaCapped && areaPyeong.max >= AREA_CAP_PYEONG
                  ? bounds.area.max
                  : pyeongToSqm(areaPyeong.max),
            },
          })
        }
      />
      {/*
        사용자 지시: "입주년차 40년 글자 표기" — 실제 지역 최댓값이
        40년과 가까우면(예: 오래된 동네라 최댓값이 40대 후반) "40년"이
        "최대"와 너무 붙어 보여 축 글자에서 빠지는 경우가 있었다
        (`RangeSlider.tsx`의 `MAX_LABEL_COLLISION_RATIO` 참고 — 그
        임계값을 낮춰 이 정도 여유는 더 이상 빼지 않게 고쳤다). 여기서는
        다른 두 축과 같은 이유로 눈금 최소 단위를 10년으로 못박아
        간격을 고정한다.
      */}
      <RangeSlider
        label="입주년차"
        min={bounds.builtYearAge.min}
        max={bounds.builtYearAge.max}
        step={1}
        value={value.builtYearAge}
        formatValue={(v) => `${v}년차`}
        formatTick={(v) => `${v}년`}
        tickUnit={10}
        onChange={(builtYearAge) => onChange({ ...value, builtYearAge })}
      />
    </div>
  );
}
