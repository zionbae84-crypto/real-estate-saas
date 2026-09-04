import { Slider } from "seed-design/ui/slider";

/**
 * 두 손잡이(최소·최대) 범위 슬라이더 — 결과 화면의 면적·가격·입주년차
 * 필터 셋이 함께 쓰는 하나의 컴포넌트다(`ComplexFilters.tsx`).
 *
 * SEED `Slider`는 `values`(배열)로 손잡이 개수를 정한다 — 배열에 값을
 * 둘 넣으면 그 자체로 범위 슬라이더가 된다(`PriceSlider.tsx`의 단일
 * 손잡이와 같은 컴포넌트, 다른 값 개수). 그래서 새 SEED 위젯을 만들지
 * 않고 `values={[value.min, value.max]}`만 넘긴다.
 *
 * `minStepsBetweenThumbs={1}`로 두 손잡이가 서로를 지나치지 못하게
 * 막는다 — 안 막으면 "최소가 최대보다 큰" 뒤집힌 범위가 만들어질 수
 * 있고, 그 범위로 거르면 결과가 조용히 0건이 된다(왜 0건인지 사용자가
 * 알 방법이 없다).
 *
 * ## 사용자 지시로 다시 그린 모양
 *
 * 참고 사진 셋: (1) 제목 왼쪽·"전체"(강조색) 오른쪽 한 줄, (2) 트랙
 * 아래 축에 "0 / 10평 / 20평 / 30평 / 40평 / 최대"처럼 눈금 숫자,
 * (3) 옅고 작은 손잡이. 트랙·손잡이 색은 `.range-slider` 스코프 안에서
 * SEED 슬라이더의 실제 클래스(`.seed-slider__track`·`__range`·`__thumb`,
 * `node_modules/@seed-design/css/recipes/slider.css`에서 확인했다)를
 * 직접 겨눠 덮는다 — SEED 컴포넌트 자체를 재구현하지 않으면서 색만
 * 이 화면의 톤에 맞춘다.
 */
export interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: { min: number; max: number };
  onChange: (value: { min: number; max: number }) => void;
  /** 값 하나를 사람이 읽는 문장으로("59㎡", "5억원", "12년") */
  formatValue: (value: number) => string;
  /**
   * 축 눈금에 찍을 값 하나를 사람이 읽는 짧은 말로("10", "10억"). 보통
   * `formatValue`와 같은 규칙이지만, 큰 값을 축약해 적고 싶을 때
   * (예: "10억"처럼 끝의 "원"을 뺀 형태) 따로 줄 수 있다. 기본은
   * `formatValue`를 그대로 쓴다.
   */
  formatTick?: (value: number) => string;
  /**
   * 눈금 간격의 최소 단위(사용자 지시: 매매가는 "10억단위로", 면적은
   * "10평단위로"). 주지 않으면(기본값) `niceAxisStep`이 1·2·5·10 계열
   * 중 아무 배수나 고른다 — 매매가라면 "5억"처럼 이 단위보다 잘게
   * 끊길 수 있다. 이 값을 주면 그보다 작은 간격은 절대 고르지 않는다
   * (예: `1_000_000_000`을 주면 5억·15억 같은 중간값은 나오지 않고
   * 10억·20억·50억처럼 항상 10억의 배수만 나온다).
   */
  tickUnit?: number;
  /**
   * 오른쪽 끝 고정 눈금의 글자. 기본은 "최대". 호출부가 `max`를 실제
   * 데이터 최댓값이 아니라 고정 상한으로 못박을 때(사용자 지시: 면적은
   * "30평 최대"), 그 상한값 자체를 글자에 함께 담고 싶으면 직접 준다.
   */
  maxLabel?: string;
}

/**
 * 사람이 보기 좋은 눈금 간격(1·2·5·10의 배수)을 고른다.
 *
 * `span`(=축이 덮는 범위)을 `targetCount`개 언저리로 나누는 간격 중,
 * 1·2·5·10 계열에서 가장 가까운 값을 쓴다 — 눈금이 7, 13처럼 뜻 없는
 * 수로 끊기지 않게 한다. 흔한 축 눈금 알고리즘(D3 `ticks`와 같은
 * 발상)이고, 이 저장소가 새로 지어낸 규칙이 아니다.
 */
/**
 * `unit`을 주면 그보다 작은 간격은 절대 고르지 않는다 — `rough`를 `unit`
 * 배수로 먼저 세고(그 값이 1 미만이면 1로 올려, "간격 0"을 막는다) 그
 * 위에서 같은 1·2·5·10 반올림을 적용한 뒤 다시 `unit`을 곱해 되돌린다.
 * `unit`을 안 주면(기본값) 기존 계산 그대로다 — 기존 호출부(면적 기본
 * 눈금·입주년차)의 결과를 조금도 바꾸지 않는다.
 */
export function niceAxisStep(span: number, targetCount = 5, unit?: number): number {
  if (!Number.isFinite(span) || span <= 0) return unit ?? 1;
  if (unit !== undefined) {
    const roughInUnits = Math.max(span / targetCount / unit, 1);
    const magnitude = 10 ** Math.floor(Math.log10(roughInUnits));
    const normalized = roughInUnits / magnitude;
    const niceNormalized =
      normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return niceNormalized * magnitude * unit;
  }
  const rough = span / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

/**
 * `min`~`max` 사이에 찍을 눈금 값들. **`max` 자체는 포함하지 않는다** —
 * 실제 데이터 최댓값은 대개 "뜻 없는 수"라 그 자리는 이 배열이 아니라
 * 호출부가 별도로 "최대"라는 말로 표시한다(`RangeSlider`의 렌더 참고).
 */
export function niceAxisTicks(min: number, max: number, targetCount = 5, unit?: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const step = niceAxisStep(max - min, targetCount, unit);
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v < max; v += step) {
    // 부동소수 누적 오차를 정리한다(예: 0.1 + 0.2 반복 합산 문제).
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

/**
 * 축 **글자**용 눈금만 마지막 눈금이 "최대"와 겹칠 만큼 가까우면 뺀다
 * (리뷰: 실제 화면에서 "40평"과 "최대"가 "최0평"처럼 겹쳐 보였다).
 * `niceAxisTicks`가 돌려주는 값 자체(트랙 위 구분선에는 그대로 쓴다,
 * `RangeSlider`의 렌더 참고 — 구분선은 가는 선 하나라 글자처럼 겹쳐
 * 읽히지 않는다)는 건드리지 않고, 글자를 낼 때만 이 함수로 한 번 더
 * 거른다.
 *
 * jsdom은 실제 글자 폭을 재지 못하니(레이아웃을 하지 않는다) 픽셀이
 * 아니라 **축 전체 길이 대비 비율**로 "가깝다"를 정의한다 — 좁은
 * 팝오버(`.complex-map-filter-panel`, 240px)에서 실측했을 때 마지막
 * 눈금과 "최대"가 맞닿기 시작하는 지점보다 넉넉히 보수적으로 20%를
 * 기준으로 잡는다.
 */
const MAX_LABEL_COLLISION_RATIO = 0.2;

export function axisLabelTicks(min: number, max: number, targetCount = 5, unit?: number): number[] {
  const ticks = niceAxisTicks(min, max, targetCount, unit);
  if (ticks.length === 0) return ticks;
  const span = max - min;
  const last = ticks[ticks.length - 1]!;
  const gapRatio = span > 0 ? (max - last) / span : 1;
  return gapRatio < MAX_LABEL_COLLISION_RATIO ? ticks.slice(0, -1) : ticks;
}

export function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
  formatTick = formatValue,
  tickUnit,
  maxLabel = "최대",
}: RangeSliderProps) {
  const isFullRange = value.min === min && value.max === max;
  const ticks = niceAxisTicks(min, max, 5, tickUnit);
  const labelTicks = axisLabelTicks(min, max, 5, tickUnit);
  const span = max - min;

  return (
    <div className="range-slider">
      <div className="range-slider-header">
        {/*
          SEED `Slider`의 `label` prop을 쓰지 않는다 — 그 prop을 주면
          `SeedField.Root`가 두 손잡이 모두에 같은 `aria-labelledby`를
          걸고, WAI-ARIA 접근성 이름 계산에서 `aria-labelledby`가
          `aria-label`(아래 `getAriaLabel`)보다 우선한다. 그러면 손잡이
          둘의 접근성 이름이 똑같이 "면적"으로 접혀, 스크린 리더 사용자는
          지금 만지는 것이 최소인지 최대인지 구분할 수 없다. 그래서 시각
          라벨은 이 `<p>`가 직접 그리고, 접근성 이름은 아래 `getAriaLabel`
          하나에만 맡긴다.
        */}
        <p className="range-slider-label">{label}</p>
        {/*
          사용자 지시(참고 사진): 필터를 건드리지 않았으면 숫자 대신
          "전체"를 강조색으로 낸다 — 두 손잡이가 지금도 경계값(=bounds)
          그대로라는 뜻이다.
        */}
        <p className={isFullRange ? "range-slider-value range-slider-value--all" : "range-slider-value"}>
          {isFullRange ? "전체" : `${formatValue(value.min)} ~ ${formatValue(value.max)}`}
        </p>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
        values={[value.min, value.max]}
        /*
         * 사용자 지시: "필터부분은 스크롤 사이에 표시된 각 구간에
         * 구분선을 표시해줘" — 트랙 위에 실제 구간 경계선을 낸다. SEED
         * `Slider`가 이미 `ticks` prop으로 지원하는 기능이라(`Slider.Tick`,
         * `seed-design/ui/slider.tsx` 확인) 새로 만들지 않고 그대로
         * 쓴다 — 아래 글자 축과 같은 값(`niceAxisTicks`)이라 선과 글자가
         * 항상 같은 자리를 가리킨다.
         */
        ticks={ticks}
        getAriaLabel={(thumbIndex) =>
          thumbIndex === 0 ? `${label} 최소` : `${label} 최대`
        }
        getAriaValuetext={(v) => formatValue(v)}
        getValueIndicatorLabel={({ value: v }) => formatValue(v)}
        onValuesChange={(values) => {
          /*
           * SEED가 넘기는 값은 언제나 정렬된 배열이다(useSlider가
           * `minStepsBetweenThumbs`로 순서를 보장한다) — 그래도 빈
           * 배열이 올 수 있는 프레임(PriceSlider.tsx의 같은 자리
           * 주석 참고)이 있어 방어적으로 받는다. 둘 다 있을 때만
           * 알린다 — 하나만 있는 상태로 "범위가 바뀌었다"고 알리면
           * 나머지 값이 이전 렌더의 값으로 조용히 고정된다.
           */
          const [lo, hi] = values;
          if (lo !== undefined && hi !== undefined) onChange({ min: lo, max: hi });
        }}
      />
      {/*
        축 눈금. 각 값의 실제 위치(퍼센트)에 절대 배치한다 — 글자를
        그냥 나란히 배치(`justify-content: space-between`)하면 값이
        아니라 "몇 번째 눈금인가"만 표시하게 되어, `min`이 0이 아닌
        축(예: 그 지역 매매가 최저가부터 시작하는 슬라이더)에서 위치가
        실제 값과 어긋난다.
      */}
      <div className="range-slider-axis">
        {labelTicks.map((tick) => (
          <span
            key={tick}
            className="range-slider-tick"
            style={{ left: `${((tick - min) / span) * 100}%` }}
          >
            {formatTick(tick)}
          </span>
        ))}
        <span className="range-slider-tick range-slider-tick--max" style={{ left: "100%" }}>
          {maxLabel}
        </span>
      </div>
    </div>
  );
}
