import { describe, expect, it } from "vitest";
import { parseMoney } from "./parseMoney";

describe("parseMoney", () => {
  it("단위 없는 숫자는 만원으로 읽는다", () => {
    expect(parseMoney("35000")).toBe(350_000_000);
  });

  it("억 단위를 읽는다", () => {
    expect(parseMoney("3억")).toBe(300_000_000);
  });

  it("억과 만원을 함께 읽는다", () => {
    expect(parseMoney("3억5000")).toBe(350_000_000);
  });

  it("만 접미사가 붙은 억+만도 읽는다", () => {
    expect(parseMoney("3억5000만")).toBe(350_000_000);
  });

  it("소수 억을 읽는다", () => {
    expect(parseMoney("3.5억")).toBe(350_000_000);
  });

  it("만 단위를 읽는다", () => {
    expect(parseMoney("5000만")).toBe(50_000_000);
  });

  it("원 단위를 명시하면 그대로 읽는다", () => {
    expect(parseMoney("1234원")).toBe(1_234);
  });

  it("콤마와 공백을 무시한다", () => {
    expect(parseMoney(" 3,5000 ")).toBe(350_000_000);
  });

  it("0을 읽는다", () => {
    expect(parseMoney("0")).toBe(0);
  });

  it("빈 문자열은 null이다", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
  });

  it("숫자가 아니면 null이다", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("3억5000원짜리")).toBeNull();
    expect(parseMoney("억")).toBeNull();
  });

  it("음수는 null이다", () => {
    expect(parseMoney("-5000")).toBeNull();
    expect(parseMoney("-3억")).toBeNull();
  });

  it("어떤 입력으로도 NaN을 반환하지 않는다", () => {
    const inputs = [
      "", " ", "abc", "-1", "1e", "억", "만", "원", "..", "3..5억",
      "9".repeat(30), "3억5000", "0", "1,2,3", "NaN", "Infinity", "1e400",
    ];
    for (const input of inputs) {
      const result = parseMoney(input);
      expect(result === null || Number.isFinite(result), `입력: ${input}`).toBe(true);
    }
  });

  it("결과는 항상 정수다", () => {
    expect(Number.isInteger(parseMoney("3.14159억") as number)).toBe(true);
  });
});
