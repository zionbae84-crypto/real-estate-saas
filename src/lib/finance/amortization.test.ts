import { describe, expect, it } from "vitest";
import {
  equalPrincipalSchedule,
  maxPrincipal,
  monthlyPayment,
} from "./amortization";

describe("monthlyPayment", () => {
  it("무이자면 원금을 개월수로 나눈 값이다", () => {
    expect(monthlyPayment(120_000_000, 0, 120)).toBe(1_000_000);
  });

  it("원금이 0이면 상환액도 0이다", () => {
    expect(monthlyPayment(0, 0.04, 360)).toBe(0);
  });

  it("3억 · 연 4% · 30년이면 월 143만원대다", () => {
    const payment = monthlyPayment(300_000_000, 0.04, 360);
    expect(payment).toBeGreaterThan(1_430_000);
    expect(payment).toBeLessThan(1_435_000);
  });

  it("금리가 높을수록 상환액이 커진다", () => {
    const low = monthlyPayment(300_000_000, 0.03, 360);
    const high = monthlyPayment(300_000_000, 0.05, 360);
    expect(high).toBeGreaterThan(low);
  });

  it("개월수가 0 이하면 예외를 던진다", () => {
    expect(() => monthlyPayment(100_000_000, 0.04, 0)).toThrow(RangeError);
  });

  it("원금이 음수면 조용히 0을 주지 않고 예외를 던진다", () => {
    expect(() => monthlyPayment(-1, 0.04, 360)).toThrow(RangeError);
  });

  it("원금이 NaN이면 예외를 던진다", () => {
    expect(() => monthlyPayment(NaN, 0.04, 360)).toThrow(RangeError);
  });
});

describe("maxPrincipal", () => {
  it("monthlyPayment의 역함수다", () => {
    const principal = 450_000_000;
    const payment = monthlyPayment(principal, 0.042, 360);
    expect(maxPrincipal(payment, 0.042, 360)).toBeCloseTo(principal, 0);
  });

  it("무이자면 상환액 × 개월수다", () => {
    expect(maxPrincipal(1_000_000, 0, 120)).toBe(120_000_000);
  });

  it("상환 여력이 0이면 대출 가능액도 0이다", () => {
    expect(maxPrincipal(0, 0.04, 360)).toBe(0);
  });

  it("상환 여력이 음수면 조용히 0을 주지 않고 예외를 던진다", () => {
    expect(() => maxPrincipal(-1, 0.04, 360)).toThrow(RangeError);
  });

  it("상환 여력이 NaN이면 예외를 던진다", () => {
    expect(() => maxPrincipal(NaN, 0.04, 360)).toThrow(RangeError);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════
 * 원금균등상환 — 기준값을 손으로 검산해 못박는다
 * ══════════════════════════════════════════════════════════════════
 *
 * 이 저장소에 없던 **새 금융 계산식**이라, "그럴듯한 숫자가 나온다"로는
 * 통과시키지 않는다. 아래 세 갈래로 잠근다.
 *
 * 1. **손 검산 기준값**(브리프의 예시를 직접 다시 계산했다 — 아래 주석에
 *    과정을 그대로 적는다).
 * 2. **닫힌 식 ↔ 루프 대조**: 총 이자를 등차수열 합 공식으로 내는데,
 *    같은 값을 회차별로 실제로 돌린 루프와 맞춰 본다. 공식을 잘못 옮기면
 *    (예: `(months + 1)`을 `(months - 1)`로) 이 대조가 곧바로 깨진다.
 * 3. **방향**: 원금균등은 회차가 갈수록 상환액이 **줄어든다**
 *    (`firstPayment > lastPayment`). 방향이 뒤집히면 공식을 반대로
 *    옮긴 것이고, 화면에서는 "1회차"와 "마지막 회차"가 서로 바뀐다.
 */
describe("equalPrincipalSchedule", () => {
  /**
   * 브리프의 예시를 손으로 다시 계산한 값.
   *
   * `principal = 120,000,000원`, `annualRate = 0.05`, `months = 12`
   *
   * - 매달 갚는 원금 p = 120,000,000 / 12 = **10,000,000원**
   * - 월이율 r = 0.05 / 12 (= 0.0041666…, 유한소수가 아니다)
   * - firstPayment = p + P·r
   *   = 10,000,000 + 120,000,000 × 0.05 / 12
   *   = 10,000,000 + 6,000,000 / 12
   *   = 10,000,000 + 500,000 = **10,500,000원** (딱 떨어진다)
   * - lastPayment = p + p·r
   *   = 10,000,000 + 10,000,000 × 0.05 / 12
   *   = 10,000,000 + 500,000 / 12
   *   = 10,000,000 + 41,666.666… = **10,041,666.67원**
   *   (브리프가 적은 10,041,667은 이 값을 원 단위로 반올림한 것이다 —
   *   엔진은 반올림하지 않으므로 여기서는 소수점을 그대로 잰다)
   * - totalInterest = r · P · (n+1) / 2
   *   = (0.05 / 12) × 120,000,000 × 13 / 2
   *   = 500,000 × 6.5 = **3,250,000원** (딱 떨어진다)
   */
  const 예시 = { principal: 120_000_000, annualRate: 0.05, months: 12 };

  it("첫 회차는 원금 몫 + 전체 원금에 붙는 이자다 (검산: 1,050만원)", () => {
    const schedule = equalPrincipalSchedule(
      예시.principal,
      예시.annualRate,
      예시.months,
    );
    // 딱 떨어지는 값이라 부동소수점 오차를 감안해도 원 단위 이하다.
    expect(schedule.firstPayment).toBeCloseTo(10_500_000, 6);
  });

  it("마지막 회차는 원금 몫 + 마지막 남은 원금에 붙는 이자다 (검산: 10,041,666.67원)", () => {
    const schedule = equalPrincipalSchedule(
      예시.principal,
      예시.annualRate,
      예시.months,
    );
    expect(schedule.lastPayment).toBeCloseTo(10_041_666.666_666_666, 6);
  });

  it("총 이자는 등차수열 닫힌 식으로 나온다 (검산: 325만원)", () => {
    const schedule = equalPrincipalSchedule(
      예시.principal,
      예시.annualRate,
      예시.months,
    );
    expect(schedule.totalInterest).toBeCloseTo(3_250_000, 6);
  });

  /**
   * 닫힌 식이 실제 회차별 계산과 같은지 **루프로 대조**한다.
   *
   * k회차(1-base) 상환 직전 남은 원금 = P − (k−1)·(P/n)
   * k회차 이자 = 그 남은 원금 × r
   *
   * 이 루프는 엔진의 공식을 그대로 베낀 것이 아니라 정의에서 다시
   * 쓴 것이다 — 그래서 닫힌 식(`r·P·(n+1)/2`)을 잘못 옮기면 여기서
   * 갈린다.
   */
  it("총 이자가 회차별 이자의 합과 일치한다 (루프 대조)", () => {
    const principal = 320_000_000;
    const annualRate = 0.0453;
    const months = 360;

    const r = annualRate / 12;
    const perMonthPrincipal = principal / months;
    let sum = 0;
    for (let k = 1; k <= months; k++) {
      sum += (principal - (k - 1) * perMonthPrincipal) * r;
    }

    const schedule = equalPrincipalSchedule(principal, annualRate, months);
    // 상대오차 기준으로 본다 — 3억대 값이라 절대 허용오차 몇 원이면
    // 부동소수점 누적합과 닫힌 식이 갈릴 수 있다.
    expect(schedule.totalInterest / sum).toBeCloseTo(1, 12);
  });

  it("갚을수록 상환액이 줄어든다 — 첫 회차가 마지막 회차보다 크다", () => {
    const schedule = equalPrincipalSchedule(320_000_000, 0.0453, 360);
    expect(schedule.firstPayment).toBeGreaterThan(schedule.lastPayment);
  });

  /**
   * 원리금균등과 견주는 방향. 같은 원금·금리·기간에서
   * 원금균등의 1회차는 원리금균등의 매달 상환액보다 **크고**,
   * 마지막 회차는 **작다** — 화면이 두 방식을 나란히 보여주므로
   * 이 관계가 뒤집히면 사용자가 곧바로 이상하다고 느낄 자리다.
   */
  it("원리금균등의 월 상환액이 원금균등의 첫 회차와 마지막 회차 사이에 있다", () => {
    const principal = 320_000_000;
    const annualRate = 0.0453;
    const months = 360;
    const level = monthlyPayment(principal, annualRate, months);
    const schedule = equalPrincipalSchedule(principal, annualRate, months);

    expect(schedule.firstPayment).toBeGreaterThan(level);
    expect(schedule.lastPayment).toBeLessThan(level);
  });

  it("원금균등의 총 이자가 원리금균등보다 적다", () => {
    const principal = 320_000_000;
    const annualRate = 0.0453;
    const months = 360;
    const levelTotalInterest =
      monthlyPayment(principal, annualRate, months) * months - principal;
    const schedule = equalPrincipalSchedule(principal, annualRate, months);
    expect(schedule.totalInterest).toBeLessThan(levelTotalInterest);
  });

  describe("경계값", () => {
    it("원금이 0이면 셋 다 0이다", () => {
      expect(equalPrincipalSchedule(0, 0.0453, 360)).toEqual({
        firstPayment: 0,
        lastPayment: 0,
        totalInterest: 0,
      });
    });

    it("무이자면 두 회차가 같고 이자는 0이다", () => {
      expect(equalPrincipalSchedule(120_000_000, 0, 120)).toEqual({
        firstPayment: 1_000_000,
        lastPayment: 1_000_000,
        totalInterest: 0,
      });
    });

    it("한 달짜리면 첫 회차와 마지막 회차가 같다", () => {
      // n = 1이면 남은 원금이 곧 전체 원금이라 두 값이 만난다.
      // totalInterest = r·P·(1+1)/2 = r·P — 한 달치 이자 그대로다.
      const schedule = equalPrincipalSchedule(100_000_000, 0.06, 1);
      expect(schedule.firstPayment).toBeCloseTo(100_500_000, 6);
      expect(schedule.lastPayment).toBeCloseTo(100_500_000, 6);
      expect(schedule.totalInterest).toBeCloseTo(500_000, 6);
    });

    it("개월수가 0 이하면 예외를 던진다", () => {
      expect(() => equalPrincipalSchedule(100_000_000, 0.04, 0)).toThrow(
        RangeError,
      );
      expect(() => equalPrincipalSchedule(100_000_000, 0.04, -12)).toThrow(
        RangeError,
      );
    });

    it("원금이 음수면 조용히 0을 주지 않고 예외를 던진다", () => {
      expect(() => equalPrincipalSchedule(-1, 0.04, 360)).toThrow(RangeError);
    });

    it("원금이 NaN이면 예외를 던진다", () => {
      expect(() => equalPrincipalSchedule(NaN, 0.04, 360)).toThrow(RangeError);
    });

    /**
     * `monthlyPayment`보다 검사가 **하나 더 있다.** 그쪽은 금리를 보지
     * 않는데, 원금균등에서 음수 금리는 상환액을 원금 몫보다 **작게**
     * 만들어(낙관 방향) 조용히 그럴듯한 숫자가 된다 — 이 저장소가 가장
     * 경계하는 종류의 오답이다. NaN도 같은 이유로 막는다(NaN이 화면까지
     * 흘러가면 `formatWon`이 던진다).
     */
    it("금리가 음수거나 NaN이면 예외를 던진다", () => {
      expect(() => equalPrincipalSchedule(100_000_000, -0.01, 360)).toThrow(
        RangeError,
      );
      expect(() => equalPrincipalSchedule(100_000_000, NaN, 360)).toThrow(
        RangeError,
      );
    });
  });
});
