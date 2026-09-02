import { describe, expect, it } from "vitest";
import { formatWon, formatWonRoundedToMan } from "./won";

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

/**
 * 만원 단위 반올림 표기(`formatWonRoundedToMan`).
 *
 * **표시 전용이다.** 단지 상세의 큰 숫자 둘("취득시 부대비용"·"매달
 * 나가는 돈")만 이걸 쓰고, 내역·인쇄 요약·목록의 가격은 그대로
 * `formatWon`의 정확한 원 단위를 쓴다 — 계산에는 어느 쪽도 쓰이지 않는다.
 *
 * 경계값을 여기 못박는다: 위로 가는 반올림·아래로 가는 반올림·정확히
 * 0.5만원(5,000원)인 경우. 마지막 것이 이 함수의 유일한 판단이다
 * (`Math.round`는 절반을 **양의 무한대 방향**으로 올린다 — 음수에서는
 * 그 방향이 "0에 가까운 쪽"이라 뜻이 갈리므로 그것도 함께 적는다).
 */
describe("formatWonRoundedToMan", () => {
  it("만원 미만 자리가 절반에 못 미치면 내린다", () => {
    expect(formatWonRoundedToMan(43_144_720)).toBe("4,314만원");
  });

  it("만원 미만 자리가 절반을 넘으면 올린다", () => {
    expect(formatWonRoundedToMan(43_147_200)).toBe("4,315만원");
  });

  it("정확히 5,000원이면 올린다(Math.round의 방향)", () => {
    expect(formatWonRoundedToMan(43_145_000)).toBe("4,315만원");
  });

  it("이미 만원 단위인 값은 그대로 둔다", () => {
    expect(formatWonRoundedToMan(1_200_000)).toBe("120만원");
  });

  it("0은 0원이다", () => {
    expect(formatWonRoundedToMan(0)).toBe("0원");
  });

  it("만원의 절반에 못 미치면 0원이 된다 — 없는 값이 아니라 반올림 결과다", () => {
    expect(formatWonRoundedToMan(4_999)).toBe("0원");
  });

  it("만원의 절반이면 1만원으로 올라간다", () => {
    expect(formatWonRoundedToMan(5_000)).toBe("1만원");
  });

  it("억 자리까지 올라가는 반올림도 자릿수를 그대로 잇는다", () => {
    expect(formatWonRoundedToMan(99_999_999)).toBe("1억원");
  });

  it("음수도 반올림한다 — Math.round는 절반을 양의 방향으로 올린다", () => {
    expect(formatWonRoundedToMan(-43_145_000)).toBe("-4,314만원");
    expect(formatWonRoundedToMan(-43_146_000)).toBe("-4,315만원");
  });

  it("유한하지 않은 값은 formatWon과 같은 이유로 RangeError를 던진다", () => {
    expect(() => formatWonRoundedToMan(NaN)).toThrow(RangeError);
    expect(() => formatWonRoundedToMan(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
