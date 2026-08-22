import { describe, expect, it } from "vitest";
import { formatWon } from "./won";

describe("formatWon", () => {
  it("0은 0원이다", () => {
    expect(formatWon(0)).toBe("0원");
  });

  it("만원 미만은 원 단위로 표기한다", () => {
    expect(formatWon(1_234)).toBe("1,234원");
  });

  it("억 미만은 만원 단위로 표기한다", () => {
    expect(formatWon(50_000_000)).toBe("5,000만원");
  });

  it("억과 만원을 함께 표기한다", () => {
    expect(formatWon(640_000_000)).toBe("6억 4,000만원");
  });

  it("만원 자리가 0이면 억만 표기한다", () => {
    expect(formatWon(600_000_000)).toBe("6억원");
  });

  it("억·만·원이 모두 있으면 셋 다 표기한다", () => {
    expect(formatWon(612_345_678)).toBe("6억 1,234만 5,678원");
  });

  it("조 단위는 억을 콤마로 묶어 표기한다", () => {
    expect(formatWon(5_000_000_000_000)).toBe("50,000억원");
  });

  it("음수는 앞에 마이너스를 붙인다", () => {
    expect(formatWon(-50_000_000)).toBe("-5,000만원");
  });

  // New test cases for non-finite input and rounding edge cases
  it("NaN은 RangeError를 던진다", () => {
    expect(() => formatWon(NaN)).toThrow(RangeError);
  });

  it("Infinity는 RangeError를 던진다", () => {
    expect(() => formatWon(Infinity)).toThrow(RangeError);
  });

  it("-Infinity는 RangeError를 던진다", () => {
    expect(() => formatWon(-Infinity)).toThrow(RangeError);
  });

  it("양수인데 0으로 반올림되는 값도 0원이다", () => {
    expect(formatWon(0.4)).toBe("0원");
  });

  it("음수로 반올림되는 값은 0원이다", () => {
    expect(formatWon(-0.5)).toBe("0원");
  });

  it("정확히 1만은 1만원이다", () => {
    expect(formatWon(10_000)).toBe("1만원");
  });

  it("1만 미만인 9999는 9,999원이다", () => {
    expect(formatWon(9_999)).toBe("9,999원");
  });

  it("정확히 1억은 1억원이다", () => {
    expect(formatWon(100_000_000)).toBe("1억원");
  });

  it("1억 미만인 99999999는 9,999만 9,999원이다", () => {
    expect(formatWon(99_999_999)).toBe("9,999만 9,999원");
  });

  it("억이 있고 만이 0인 경우 만을 생략한다", () => {
    expect(formatWon(100_009_999)).toBe("1억 9,999원");
  });

  it("더 큰 규모의 억이 있고 만이 0인 경우", () => {
    expect(formatWon(600_001_234)).toBe("6억 1,234원");
  });

  it("소수점 양수는 반올림한다", () => {
    expect(formatWon(10_000.4)).toBe("1만원");
  });
});
