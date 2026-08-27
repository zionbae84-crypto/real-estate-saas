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
}

export function useAffordability(
  profile: BuyerProfile | null,
): Affordability | null {
  // null이면 "최대치에 붙어 있음"을 뜻한다. 프로필이 바뀌어 실구매력이
  // 달라져도 자동으로 따라간다.
  const [override, setOverride] = useState<number | null>(null);

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

    const loanAtPrice = calcMaxLoan(profile, rules, price);
    const safety = calcSafetyScore(profile, rules, loanAtPrice.amount);
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
    };
  }, [profile, result, override, setPrice, safePrice]);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
