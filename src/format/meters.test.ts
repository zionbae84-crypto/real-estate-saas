import { describe, expect, it } from "vitest";
import { formatMeters } from "./meters";

describe("formatMeters", () => {
  it("미터를 그대로 적는다", () => {
    expect(formatMeters(350)).toBe("350m");
  });

  it("네 자리부터 쉼표를 넣는다", () => {
    // "8000m"와 "800m"는 눈으로 가르기 어렵다.
    expect(formatMeters(8000)).toBe("8,000m");
    expect(formatMeters(12_345)).toBe("12,345m");
  });

  it("km로 바꾸지 않는다", () => {
    // 1,150m와 1,249m가 같은 "1.2km"가 되면 관측치가 뭉개진다.
    expect(formatMeters(1150)).toBe("1,150m");
    expect(formatMeters(1249)).toBe("1,249m");
    expect(formatMeters(1150)).not.toBe(formatMeters(1249));
  });

  it("0m도 그대로 적는다", () => {
    expect(formatMeters(0)).toBe("0m");
  });

  it("소수는 반올림한다", () => {
    expect(formatMeters(350.4)).toBe("350m");
    expect(formatMeters(350.5)).toBe("351m");
  });

  it("숫자가 아니면 던진다", () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(() => formatMeters(value)).toThrow(RangeError);
    }
  });
});
