import { describe, expect, it } from "vitest";
import { maxPrincipal, monthlyPayment } from "./amortization";

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
