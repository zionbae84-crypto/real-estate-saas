/**
 * 원리금균등상환 방식의 월 상환액.
 *
 * @param principal 대출 원금(원)
 * @param annualRate 연이율 (0.042 = 4.2%)
 * @param months 상환 개월수
 */
export function monthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0) {
    throw new RangeError(`months는 1 이상이어야 합니다: ${months}`);
  }
  if (!(principal >= 0)) {
    // 음수·NaN을 조용히 0으로 만들면 호출자의 계산 오류가 그대로 묻힌다
    throw new RangeError(`principal은 0 이상이어야 합니다: ${principal}`);
  }
  if (principal === 0) return 0;
  if (annualRate === 0) return principal / months;

  const r = annualRate / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * 월 상환 여력으로 빌릴 수 있는 최대 원금. monthlyPayment의 역함수.
 *
 * @param payment 월 상환 여력(원)
 * @param annualRate 연이율 (0.042 = 4.2%)
 * @param months 상환 개월수
 */
export function maxPrincipal(
  payment: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0) {
    throw new RangeError(`months는 1 이상이어야 합니다: ${months}`);
  }
  if (!(payment >= 0)) {
    // 음수·NaN을 조용히 0으로 만들면 호출자의 계산 오류가 그대로 묻힌다
    throw new RangeError(`payment는 0 이상이어야 합니다: ${payment}`);
  }
  if (payment === 0) return 0;
  if (annualRate === 0) return payment * months;

  const r = annualRate / 12;
  return (payment * (1 - Math.pow(1 + r, -months))) / r;
}
