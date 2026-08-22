import { describe, expect, it } from "vitest";
import { formatRuleVersionLabel } from "./ruleVersionLabel";

describe("formatRuleVersionLabel", () => {
  it("effectiveFrom에서 연·월을 뽑아 문구를 만든다", () => {
    expect(
      formatRuleVersionLabel({ effectiveFrom: "2026-03-01" }),
    ).toBe("2026년 3월 규제 기준");
  });

  it("월 앞자리 0을 없애고 읽는다", () => {
    expect(
      formatRuleVersionLabel({ effectiveFrom: "2026-08-01" }),
    ).toBe("2026년 8월 규제 기준");
  });

  it("일(day)이 1이 아니어도 연·월만 쓴다", () => {
    expect(
      formatRuleVersionLabel({ effectiveFrom: "2026-12-25" }),
    ).toBe("2026년 12월 규제 기준");
  });

  it("YYYY-MM-DD 형식이 아니면 던진다", () => {
    expect(() =>
      formatRuleVersionLabel({ effectiveFrom: "2026-03" }),
    ).toThrow(RangeError);
    expect(() =>
      formatRuleVersionLabel({ effectiveFrom: "" }),
    ).toThrow(RangeError);
    expect(() =>
      formatRuleVersionLabel({ effectiveFrom: "not-a-date" }),
    ).toThrow(RangeError);
  });
});
