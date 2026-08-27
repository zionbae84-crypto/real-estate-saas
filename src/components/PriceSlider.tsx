import { Slider } from "seed-design/ui/slider";
import { formatWon } from "../format/won";
import { PRICE_STEP } from "../lib/finance";

export interface PriceSliderProps {
  price: number;
  /**
   * 슬라이더 눈금의 **상한**. 사용자 지시로 이제 실구매 가능 가격보다
   * 위다(`useAffordability`의 `sliderMax`) — 못 사는 가격도 짚어 볼 수
   * 있어야 "현금이 얼마 더 필요한지"를 말할 수 있다.
   */
  max: number;
  /**
   * 지금 현금으로 살 수 있는 최대가. 눈금 위 어디까지가 "살 수 있는
   * 구간"인지를 가르는 값이라, 상한(`max`)과 **뜻이 다르다**.
   *
   * 기본값은 `max`다 — 그러면 둘이 같아져 이 컴포넌트는 상한이 곧
   * 한계였던 예전 그대로 움직인다(초과 구간 자체가 없다).
   */
  affordablePrice?: number;
  /**
   * 지금 가격에서 모자란 현금(원). `useAffordability`의 `cashShortfall`을
   * 그대로 받는다 — 이 컴포넌트는 금액을 스스로 계산하지 않는다.
   *
   * 0이면 모자라지 않다는 뜻이고, 그때 초과 경고는 나오지 않는다.
   */
  cashShortfall?: number;
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

export function PriceSlider({
  price,
  max,
  affordablePrice = max,
  cashShortfall = 0,
  safePrice,
  onChange,
}: PriceSliderProps) {
  const markers: { value: number; label: string }[] = [];
  if (
    safePrice !== null &&
    safePrice !== undefined &&
    safePrice >= 0 &&
    safePrice <= max
  ) {
    markers.push({ value: safePrice, label: "무리 없는 선" });
  }
  /*
   * 눈금이 실구매 가능 가격 위로도 이어지면서 "어디까지가 살 수 있는
   * 구간인지"가 눈금만 봐서는 사라졌다 — 그 경계를 마커로 되돌린다.
   *
   * 안전선과 **값이 같으면 붙이지 않는다.** 같은 자리에 마커 둘이 겹쳐
   * 라벨이 서로를 덮고, 무엇보다 같은 지점을 두 이름으로 부르게 된다.
   */
  if (affordablePrice < max && affordablePrice !== safePrice) {
    markers.push({ value: affordablePrice, label: "살 수 있는 최대" });
  }

  // 리뷰 수정(색 일관성): 슬라이더가 실구매 가능 가격에 있을 때 이 숫자는
  // 상단바가 이미 "실구매 가능 가격"으로 보여준 것과 같은 데이터다.
  // 같은 의미는 같은 색 계열(강조색)로 반복한다.
  // 슬라이더를 움직여 사용자가 임의의 값을 탐색 중이 되면 더는 그
  // 데이터가 아니므로(한계가 아니라 지금 보는 값일 뿐) 기본색으로
  // 되돌린다 — "한계 가격이라 황동"이지 "지금 보는 값이라 황동"이
  // 아니다.
  //
  // ⚠ 기준이 `max`가 아니라 `affordablePrice`다. 눈금 상한이 그 위로
  // 열리면서 둘이 갈렸고, 색이 말하는 것은 "이 숫자가 실구매 가능
  // 가격이다"이지 "슬라이더가 끝까지 갔다"가 아니다.
  const isAtLimit = price === affordablePrice;
  /*
   * 초과 구간. **`cashShortfall > 0`을 함께 요구한다** — 금액을 말하는
   * 경고라 금액이 0이면 낼 말이 없다. 두 조건은 정상 상태에서 함께
   * 참이지만, 하나만 보고 문장을 내면 엔진과 화면이 어긋난 날 "현금이
   * 0원 더 필요해요"라는 답의 모양을 한 거짓말이 나간다.
   */
  const overLimit = price > affordablePrice && cashShortfall > 0;

  return (
    <section className="price-slider">
      <p
        className={
          isAtLimit ? "slider-price slider-price--max" : "slider-price"
        }
      >
        {formatWon(price)}
      </p>

      {/*
        인쇄 시 지우는 부분을 이 wrapper 하나로 한정한다
        (`src/print/hiddenInPrint.ts`의 `.price-slider-control`).
        드래그로 값을 바꾸는 장치는 종이 위에서 무의미하지만, 지금 가리키는
        **값**(위의 `.slider-price`)과 한계 안내(아래 `.slider-warning`)는
        바로 아래 대출 배지가 이 가격을 기준으로 계산되므로(전제) 남긴다 —
        그래서 Slider만 별도 div로 감싼다.
      */}
      <div className="price-slider-control">
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
      </div>

      {/*
        ⚠ **초과 경고가 한계 경고보다 먼저다.** 두 문장은 같은 자리를
        두고 배타적으로 갈린다(`price > affordablePrice` vs `===`).
        초과 구간에서 "이건 빌릴 수 있는 한계예요"만 나가면, 지금 현금으로
        살 수 없는 가격을 살 수 있는 것처럼 말하게 된다 — 이 앱이 가장
        경계하는 방향(낙관 쪽으로 틀리는 것)이다.

        `.slider-warning`은 인쇄에서 살아남아야 하는 클래스다
        (`MUST_SURVIVE_PRINT_CLASSES`) — 두 갈래 모두 그 클래스를 그대로
        쓴다. 종이를 건네받은 사람에게 "이 가격은 현금이 모자란다"는
        사실이 빠지면, 남은 숫자를 그냥 살 수 있는 가격으로 읽는다.
      */}
      {overLimit && (
        <p className="slider-warning slider-warning--over">
          지금 현금으로는 이 가격을 살 수 없어요. 현금이{" "}
          <span className="slider-shortfall">{formatWon(cashShortfall)}</span>{" "}
          더 필요해요. 지금 살 수 있는 최대는 {formatWon(affordablePrice)}
          {/*
            `formatWon`은 언제나 "원"으로 끝나고(won.ts) "원"에는 받침이
            있으므로 계사는 항상 "이에요"다 — 받침 유무로 갈릴 일이 없어
            분기를 두지 않는다.
          */}
          이에요.
        </p>
      )}

      {isAtLimit && (
        <p className="slider-warning">
          {/*
            리뷰 수정(인쇄 결함 2): "이건 빌릴 수 있는 한계예요. 무리
            없는 선은 따로 있어요"는 인쇄물에서 가장 중요한 문장 중
            하나라 반드시 남긴다. 뒤의 "슬라이더를 내려 ~"만 종이 위에서
            누를 수 없는 조작 지시라 별도 span으로 감싸 인쇄에서 지운다
            — hiddenInPrint.ts의 .slider-action.
          */}
          이건 빌릴 수 있는 한계예요. 무리 없는 선은 따로 있어요.{" "}
          <span className="slider-action">
            슬라이더를 내려 부담이 어떻게 달라지는지 확인해 보세요.
          </span>
        </p>
      )}
    </section>
  );
}
