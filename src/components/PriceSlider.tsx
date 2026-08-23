import { Slider } from "seed-design/ui/slider";
import { formatWon } from "../format/won";
import { PRICE_STEP } from "../lib/finance";

export interface PriceSliderProps {
  price: number;
  max: number;
  /**
   * 안전선 위치. 있으면 눈금에 마커로 표시한다. `null`/`undefined`면
   * 표시하지 않는다 — `calcSafePrice`가 `null`을 돌려줄 수 있다는 사실을
   * 그대로 전달받는다(그 프로필에는 안전한 가격이 아예 없다는 뜻).
   */
  safePrice?: number | null;
  onChange: (price: number) => void;
}

/**
 * SEED `Slider`가 주는 값(항상 배열 — 멀티 썸을 지원하는 API다)을 이
 * 컴포넌트가 쓰는 단일 가격(숫자)으로 옮기는 어댑터. **이 한 곳에만 둔다.**
 *
 * - 빈 배열이 오면 `undefined`를 돌려주고, 호출부는 그때 `onChange`를
 *   부르지 않는다 — 값이 없는 이벤트로 가격 상태를 `undefined`로 덮어쓰지
 *   않기 위해서다. 값이 여럿이면(멀티 썸) 첫 번째를 쓴다 — 이 슬라이더는
 *   항상 썸이 하나다.
 * - 반환값을 다시 `max`로 clamp한다. SEED 내부(`useSlider`의 `updateValues`)가
 *   이미 값을 `[min, max]`로 가두지만, 그 보장은 SEED 구현 디테일에
 *   있다 — "슬라이더가 최대 가격을 넘는 값을 만들면 안 된다"는 이
 *   제품의 불변식을 SEED 버전에 기대지 않고 이 어댑터가 스스로도
 *   확정해 둔다.
 */
function toPrice(values: number[], max: number): number | undefined {
  const [first] = values;
  return first === undefined ? undefined : Math.min(first, max);
}

export function PriceSlider({ price, max, safePrice, onChange }: PriceSliderProps) {
  const markers =
    safePrice !== null && safePrice !== undefined && safePrice >= 0 && safePrice <= max
      ? [{ value: safePrice, label: "무리 없는 선" }]
      : [];

  // 리뷰 수정(색 일관성): 슬라이더가 최대값에 있을 때 이 숫자는
  // BudgetResult의 `.affordable-price`가 방금 보여준 것과 같은 데이터
  // (같은 "실구매 가능 가격")다. 같은 의미는 같은 색으로 반복한다.
  // 슬라이더를 내려 사용자가 임의의 값을 탐색 중이 되면 더는 그
  // 데이터가 아니므로(최대치가 아니라 지금 보는 값일 뿐) 기본색으로
  // 되돌린다 — "최대 가격이라 파랑"이지 "지금 보는 값이라 파랑"이
  // 아니다.
  const isAtMax = price === max;

  return (
    <section className="price-slider">
      <p className={isAtMax ? "slider-price slider-price--max" : "slider-price"}>
        {formatWon(price)}
      </p>

      <Slider
        label="이 가격에 산다면"
        min={0}
        max={max}
        step={PRICE_STEP}
        values={[price]}
        getAriaLabel={() => "이 가격에 산다면"}
        getAriaValuetext={(value) => formatWon(value)}
        // 기본값은 원 단위 정수(예: 476100000)를 그대로 보여준다 — 드래그
        // 중 썸 위에 뜨는 값 표시(value indicator)에도 같은 한국식 표기를
        // 입힌다. 실제 브라우저 확인에서 이걸 빼먹으면 화면에 그 raw
        // 숫자가 그대로 노출되는 게 실제로 보인다.
        getValueIndicatorLabel={({ value }) => formatWon(value)}
        markers={markers}
        onValuesChange={(values) => {
          const next = toPrice(values, max);
          if (next !== undefined) onChange(next);
        }}
      />

      {price === max && (
        <p className="slider-warning">
          이건 빌릴 수 있는 한계예요. 무리 없는 선은 따로 있어요.
          슬라이더를 내려 부담이 어떻게 달라지는지 확인해 보세요.
        </p>
      )}
    </section>
  );
}
