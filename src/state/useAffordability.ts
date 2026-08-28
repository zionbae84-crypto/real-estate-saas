import { useCallback, useMemo, useState } from "react";
import rawRules from "../../rules/2026-08.json";
import {
  calcAffordablePrice,
  calcMaxLoan,
  calcSafePrice,
  calcSafetyScore,
  ownFundsRequired,
  parseRules,
  PRICE_STEP,
  type AffordableResult,
  type BuyerProfile,
  type LoanLimit,
  type Rules,
  type SafetyScore,
} from "../lib/finance";
import { parseRatePercent } from "../lib/rate-input";

/**
 * 번들에 포함된 규제 룰셋.
 * 빌드 타임에 import되므로 네트워크 요청도 로딩 상태도 없다.
 */
export const rules: Rules = parseRules(rawRules);

/**
 * 슬라이더가 **실구매 가능 가격보다 얼마나 위까지** 올라가는가.
 *
 * 예전에는 상한이 곧 실구매 가능 가격이었다 — 슬라이더를 끝까지 밀어도
 * "여기가 한계"라는 말만 들었고, **얼마가 모자라서 한계인지**는 화면
 * 어디에도 없었다. 사용자 지시로 그 위를 볼 수 있게 열었다: 한계를 넘긴
 * 가격에서는 `cashShortfall`이 "현금이 얼마 더 필요한지"를 원 단위로
 * 답한다(`PriceSlider`의 초과 경고).
 *
 * ⚠ **이 비율은 규제값이 아니라 화면이 보여주는 탐색 범위다.** 룰셋
 * (`rules/2026-08.json`)에서 유도할 수 있는 숫자가 아니므로 여기 둔다 —
 * 금액 계산에는 하나도 쓰이지 않는다(초과분의 부족 현금은 엔진의
 * `ownFundsRequired`가 그대로 낸다). 1.3인 이유는 두 가지를 함께
 * 만족하는 값이라서다: 실구매 가능 가격이 눈금의 약 77% 자리에 남아
 * 원래 쓰던 구간(0~한계)이 좁아지지 않고, 그 위로도 부족 현금이
 * 뚜렷하게 벌어지는 구간이 생긴다.
 */
export const SLIDER_HEADROOM_RATIO = 1.3;

/**
 * 슬라이더 상한. `PRICE_STEP`의 배수로 올림한다 — 키보드 `End`가
 * 반 스텝짜리 어중간한 값에 떨어지지 않게 한다.
 *
 * 실구매 가능 가격이 0이면 상한도 0이다. 그 프로필에서는 슬라이더 자체가
 * 그려지지 않지만(`App.tsx`가 `affordablePrice > 0`으로 가른다), 0에
 * 비율을 곱해 0이 나오는 것이 자연스러운 답이라 특별 취급하지 않는다.
 */
export function sliderMaxFor(affordablePrice: number): number {
  return (
    Math.ceil((affordablePrice * SLIDER_HEADROOM_RATIO) / PRICE_STEP) *
    PRICE_STEP
  );
}

export interface Affordability {
  result: AffordableResult;
  /** 슬라이더가 가리키는 현재 가격(원) */
  price: number;
  setPrice: (price: number) => void;
  /**
   * 슬라이더의 **상한**(원). `result.affordablePrice`보다 위다
   * ({@link SLIDER_HEADROOM_RATIO} 참고) — 지금 현금으로 못 사는 가격도
   * 짚어 볼 수 있어야 "현금이 얼마 더 필요한지"를 말할 수 있다.
   *
   * ⚠ **이 값을 "살 수 있는 최대"로 읽으면 안 된다.** 그 숫자는 여전히
   * `result.affordablePrice`다.
   */
  sliderMax: number;
  /**
   * 지금 가격에서 **모자란 현금**(원). 0이면 지금 현금으로 살 수 있다는
   * 뜻이다(가격이 실구매 가능 가격 이하인 구간 전체가 그렇다).
   *
   * 엔진의 `ownFundsRequired`(그 가격에서 현금으로 내야 하는 총액)에서
   * 가용현금을 뺀 값이다 — 화면이 자기 식으로 다시 유도하지 않는다.
   * 그래야 "얼마가 모자라다"와 "얼마까지 살 수 있다"가 같은 계산에서
   * 나온다.
   */
  cashShortfall: number;
  /** 현재 가격에서의 대출 한도 */
  loanAtPrice: LoanLimit;
  /** 현재 가격에서 그 대출을 받았을 때의 상환 부담 */
  safety: SafetyScore;
  /**
   * 상환 부담이 안전 범위에 머무는 최대 매매가(원), 또는 그런 가격이
   * 하나도 없으면 `null`(`calcSafePrice` 문서 참고). 슬라이더가 가리키는
   * 현재 가격(`price`/`override`)과 무관하게 프로필·룰셋만으로 정해지는
   * 값이라 `result.affordablePrice`와 같은 층위(프로필 단위)에서
   * 독립적으로 메모이즈한다 — 슬라이더를 움직일 때마다 다시 계산할
   * 이유가 없다.
   */
  safePrice: number | null;
  /**
   * 부담(월 상환액·부담률) 계산에 쓰는 금리 입력란의 **문자열 값**.
   * 사용자 지시로 "이 가격으로 샀을 때 최대로 빌린다면"의 상환액이
   * 룰셋의 고정 금리(`rules.baseRate`)가 아니라 사용자가 조정할 수
   * 있는 금리로 계산된다 — 여기 담기는 문자열이 그 입력이다.
   *
   * ⚠ **`loanAtPrice`(받을 수 있는 최대 대출액)는 이 금리를 보지
   * 않는다.** 그 값은 DSR 스트레스 금리(`rules.baseRate +
   * rules.stressDSR.surcharge`)라는 규제 심사 기준으로 정해지고, 이
   * 입력란은 "받은 대출을 실제로 갚을 때 얼마가 나가는가"를 살펴보는
   * 별개의 탐색용 숫자다. 둘을 섞으면 사용자가 금리를 낮게 넣었을 때
   * 은행 심사 기준까지 함께 느슨해진 것처럼 보인다 — 규제 계산과
   * 탐색용 가정은 분리해서 지킨다.
   */
  ratePercentText: string;
  setRatePercentText: (text: string) => void;
  /**
   * `safety`가 실제로 쓴 금리(소수, 예: 0.0453). `ratePercentText`가
   * 비어 있거나 범위 밖이면 `rules.baseRate`로 조용히 되돌아간다 —
   * 입력이 무효라고 해서 이 카드의 숫자 전체가 사라지면 안 된다(이
   * 카드는 상시 노출되는 정보이지, 사용자가 열어야 나타나는
   * 계산기가 아니다). 화면은 이 값을 그대로 다시 적어 "지금 이
   * 금리로 계산했다"는 사실을 감추지 않는다.
   */
  effectiveRate: number;
}

export function useAffordability(
  profile: BuyerProfile | null,
): Affordability | null {
  // null이면 "최대치에 붙어 있음"을 뜻한다. 프로필이 바뀌어 실구매력이
  // 달라져도 자동으로 따라간다.
  const [override, setOverride] = useState<number | null>(null);

  // 기본값은 룰셋의 기준 금리다 — 아무것도 만지지 않은 화면은 예전과
  // 같은 금리로 계산한다. 문자열로 드는 이유는 `ratePercentText`
  // 문서와 같다.
  const [ratePercentText, setRatePercentText] = useState(() =>
    String(+(rules.baseRate * 100).toFixed(2)),
  );

  const result = useMemo(
    () => (profile === null ? null : calcAffordablePrice(profile, rules)),
    [profile],
  );

  // safePrice는 슬라이더 위치(override/price)와 무관하게 프로필·룰셋만으로
  // 정해진다. result와 같은 의존성 배열([profile])로 따로 메모이즈해,
  // 아래 반환 useMemo에 넣고 override를 의존성에 걸어 슬라이더를 움직일
  // 때마다(=override가 바뀔 때마다) 다시 검색하지 않게 한다.
  const safePrice = useMemo(
    () => (profile === null ? null : calcSafePrice(profile, rules)),
    [profile],
  );

  const setPrice = useCallback((next: number) => setOverride(next), []);

  return useMemo(() => {
    if (profile === null || result === null) return null;

    /*
     * 상한이 실구매 가능 가격이 아니라 그 위(`sliderMax`)다 — 지금
     * 현금으로 못 사는 가격도 짚어 볼 수 있어야 부족한 현금을 말할 수
     * 있다. 기본값(override === null)은 **여전히 실구매 가능 가격**이라,
     * 아무것도 만지지 않은 화면은 예전과 똑같이 "살 수 있는 최대"에서
     * 시작한다 — 열어 준 것은 위로 갈 수 있는 길이지 시작점이 아니다.
     */
    const sliderMax = sliderMaxFor(result.affordablePrice);
    const price =
      override === null
        ? result.affordablePrice
        : clamp(override, 0, sliderMax);

    /*
     * `loanAtPrice`(받을 수 있는 최대 대출)는 언제나 룰셋의 규제
     * 금리로 구한다 — 이 값은 은행 심사 기준이지 사용자가 조정해 볼
     * 대상이 아니다. `effectiveRate`가 그 아래 `safety`(실제로 그
     * 대출을 갚을 때의 부담)에만 들어간다.
     */
    const loanAtPrice = calcMaxLoan(profile, rules, price);

    const { percent: ratePercent, valid: rateValid } =
      parseRatePercent(ratePercentText);
    const effectiveRate =
      rateValid && ratePercent !== null ? ratePercent / 100 : rules.baseRate;
    const safetyRules: Rules =
      effectiveRate === rules.baseRate ? rules : { ...rules, baseRate: effectiveRate };
    const safety = calcSafetyScore(profile, safetyRules, loanAtPrice.amount);
    /*
     * 실구매 가능 가격 이하에서는 정의상 0이다(그 가격이 바로
     * "현금으로 감당되는 최대"이므로). 그래도 조건 분기 없이 언제나
     * 엔진에게 물어 `Math.max(0, …)`으로만 바닥을 깐다 — 화면이 "여기선
     * 0일 것"이라고 스스로 단정하면, 엔진의 절벽(정책대출 자격 상실·
     * 절대캡 구간)이 바뀐 날 그 단정만 조용히 틀린다.
     */
    const cashShortfall = Math.max(
      0,
      ownFundsRequired(price, profile, rules) - result.availableCash,
    );

    return {
      result,
      price,
      setPrice,
      sliderMax,
      cashShortfall,
      loanAtPrice,
      safety,
      safePrice,
      ratePercentText,
      setRatePercentText,
      effectiveRate,
    };
  }, [profile, result, override, setPrice, safePrice, ratePercentText]);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
