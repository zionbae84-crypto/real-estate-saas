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
});
