import { formatWon } from "../format/won";
import { PRICE_STEP } from "../lib/finance";

export interface PriceSliderProps {
  price: number;
  max: number;
  onChange: (price: number) => void;
}

export function PriceSlider({ price, max, onChange }: PriceSliderProps) {
  return (
    <section className="price-slider">
      <label htmlFor="price-slider">이 가격에 산다면</label>
      <p className="slider-price">{formatWon(price)}</p>

      <input
        id="price-slider"
        type="range"
        min={0}
        max={max}
        step={PRICE_STEP}
        value={price}
        aria-valuetext={formatWon(price)}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      {price === max && (
        <p className="slider-warning">
          이것은 빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다.
          슬라이더를 내려 부담이 어떻게 달라지는지 확인해 보세요.
        </p>
      )}
    </section>
  );
}
