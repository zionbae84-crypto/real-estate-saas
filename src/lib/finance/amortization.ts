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

/** {@link equalPrincipalSchedule}이 내는 세 값. */
export interface EqualPrincipalSchedule {
  /** 1회차(첫 달) 상환액(원) — 원금균등에서 가장 큰 값 */
  firstPayment: number;
  /** 마지막 회차(만기) 상환액(원) — 가장 작은 값 */
  lastPayment: number;
  /** 상환 기간 전체의 이자 총액(원) */
  totalInterest: number;
}

/**
 * 원금균등상환 방식.
 *
 * 매달 갚는 원금은 `principal / months`로 고정이고, 이자는 남은 원금에만
 * 붙으므로 회차가 갈수록 상환액이 줄어든다 — 원리금균등(`monthlyPayment`,
 * 매달 같은 금액)과 다르다.
 *
 * ```
 * k회차(1-base) 상환 직전 남은 원금 B_k = P · (1 − (k−1)/n)
 * k회차 상환액                        = P/n + B_k · r          (r = a/12)
 *
 * firstPayment (k=1) = P/n + P · r
 * lastPayment  (k=n) = P/n + (P/n) · r
 * ```
 *
 * 이자 총액은 `B_k`가 등차수열이라 루프 없이 닫힌 식으로 낸다:
 *
 * ```
 * Σ_{k=1..n} B_k · r = r·P/n · Σ_{k=1..n} (n−k+1)
 *                    = r·P/n · n(n+1)/2
 *                    = r · P · (n+1) / 2
 * ```
 *
 * (`amortization.test.ts`가 이 닫힌 식을 회차별 루프와 직접 대조한다.)
 *
 * ⚠ **여기서는 반올림하지 않는다.** `Math.round`를 어디에도 걸지 않고
 * 부동소수점 그대로 돌려준다 — 바로 위 `monthlyPayment`·`maxPrincipal`과
 * 같은 규칙이다. 이유는 둘이다.
 *
 * 1. 이 저장소는 **표시할 때** 반올림한다(`formatWon`이 원 단위로,
 *    `formatWonRoundedToMan`이 만원 단위로). 엔진이 미리 반올림하면 같은
 *    값이 두 번 반올림돼, 화면 숫자가 계산에 쓰인 값과 조용히 갈린다.
 * 2. `lastPayment`처럼 유한소수가 아닌 값(예: 10,041,666.666…)을 엔진에서
 *    잘라 버리면 `firstPayment + … + lastPayment`가 원금+이자와 맞지 않게
 *    된다 — 검산이 불가능해진다.
 *
 * @param principal 대출 원금(원)
 * @param annualRate 연이율 (0.0453 = 4.53%)
 * @param months 상환 개월수
 */
export function equalPrincipalSchedule(
  principal: number,
  annualRate: number,
  months: number,
): EqualPrincipalSchedule {
  if (months <= 0) {
    throw new RangeError(`months는 1 이상이어야 합니다: ${months}`);
  }
  if (!(principal >= 0)) {
    // 음수·NaN을 조용히 0으로 만들면 호출자의 계산 오류가 그대로 묻힌다
    throw new RangeError(`principal은 0 이상이어야 합니다: ${principal}`);
  }
  // `monthlyPayment`에는 없는 검사다. 그쪽 식은 음수 금리에서 부호가
  // 어긋나 눈에 띄지만, 원금균등은 음수 금리에서도 "원금 몫보다 조금
  // 작은 상환액"이라는 그럴듯한 숫자를 낸다 — 낙관 방향으로 조용히
  // 틀리는 모양이라 여기서 막는다.
  if (!(annualRate >= 0)) {
    throw new RangeError(`annualRate는 0 이상이어야 합니다: ${annualRate}`);
  }

  if (principal === 0) {
    return { firstPayment: 0, lastPayment: 0, totalInterest: 0 };
  }

  const perMonthPrincipal = principal / months;
  if (annualRate === 0) {
    return {
      firstPayment: perMonthPrincipal,
      lastPayment: perMonthPrincipal,
      totalInterest: 0,
    };
  }

  const r = annualRate / 12;
  return {
    firstPayment: perMonthPrincipal + principal * r,
    lastPayment: perMonthPrincipal + perMonthPrincipal * r,
    totalInterest: (r * principal * (months + 1)) / 2,
  };
}
