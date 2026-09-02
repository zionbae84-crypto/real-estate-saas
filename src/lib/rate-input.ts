/**
 * 금리 입력의 상한(%).
 *
 * **20%인 이유**: 이자제한법·대부업법이 정한 최고이자율이 연 20%다 —
 * 그보다 높은 금리는 이 나라에서 주택담보대출로 존재할 수 없으므로,
 * 그 위는 "가정"이 아니라 오타(4.53을 453으로 치는 것 같은)로 보는 편이
 * 맞다. 상한을 두지 않으면 그 오타가 조용히 월 상환액 수천만원짜리
 * 그럴듯한 표가 되어 나온다.
 *
 * 하한은 0이다. 음수 금리는 `equalPrincipalSchedule`이 예외로 막지만,
 * 화면에서는 예외를 던지기 전에 먼저 안내로 잡는다.
 *
 * `LoanCalculator`와 `PriceSlider`(예산 상세의 대출 한도 카드)가 각자
 * 다른 금액에 이 상한을 적용하지만, "타이핑한 금리가 유효한가"를 가르는
 * 규칙은 하나여야 한다 — 두 곳이 따로 정의하면 한쪽만 고치는 날 두 계산기가
 * 서로 다른 상한을 갖게 된다.
 */
export const MAX_RATE_PERCENT = 20;

/** 금리 입력 문자열을 판정한 결과 */
export interface ParsedRatePercent {
  /** 빈 문자열이면 `null`, 아니면 `Number(text)`(NaN일 수 있다) */
  percent: number | null;
  /** `percent`가 0~{@link MAX_RATE_PERCENT} 사이의 유한수인가 */
  valid: boolean;
}

/**
 * 금리 입력 문자열(예: "4.53")을 판정한다.
 *
 * 숫자가 아니라 **문자열**을 다루는 이유는 호출부가 입력란의 값을
 * 그대로 들고 있기 때문이다 — "4."·"4.0"처럼 아직 다 치지 않은 상태를
 * 숫자로 강제하면 소수점을 찍는 순간 입력란이 튄다.
 */
export function parseRatePercent(text: string): ParsedRatePercent {
  const percent = text.trim() === "" ? null : Number(text);
  const valid =
    percent !== null &&
    Number.isFinite(percent) &&
    percent >= 0 &&
    percent <= MAX_RATE_PERCENT;
  return { percent, valid };
}
