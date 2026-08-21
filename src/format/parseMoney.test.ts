import { describe, expect, it } from "vitest";
import { parseMoney } from "./parseMoney";
import { formatWon } from "./won";

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

  it("어떤 입력으로도 NaN을 반환하지 않고 정수 범위를 초과하지 않는다", () => {
    const inputs = [
      "", " ", "abc", "-1", "1e", "억", "만", "원", "..", "3..5억",
      "9".repeat(30), "3억5000", "0", "1,2,3", "NaN", "Infinity", "1e400",
    ];
    for (const input of inputs) {
      const result = parseMoney(input);
      expect(
        result === null || (Number.isFinite(result) && Number.isInteger(result) && result >= 0 && result <= Number.MAX_SAFE_INTEGER),
        `입력: ${input}`
      ).toBe(true);
    }
  });

  it("결과는 항상 정수다", () => {
    expect(Number.isInteger(parseMoney("3.14159억") as number)).toBe(true);
  });

  describe("원 접미사 수용", () => {
    it("자체로 출력한 형식을 다시 파싱할 수 있다 (라운드 트립)", () => {
      const testValues = [
        0,
        1,
        999,
        1_234,
        10_000,
        12_345,
        50_000_000,
        100_000_000,
        300_000_000,
        350_000_000,
        612_345_678,
        640_000_000,
      ];
      for (const value of testValues) {
        const formatted = formatWon(value);
        const parsed = parseMoney(formatted);
        expect(parsed, `formatWon(${value}) = "${formatted}"`).toBe(value);
      }
    });

    it("원 접미사가 붙은 억 형식을 읽는다", () => {
      expect(parseMoney("3억원")).toBe(300_000_000);
    });

    it("원 접미사가 붙은 만 형식을 읽는다", () => {
      expect(parseMoney("5000만원")).toBe(50_000_000);
    });

    it("억과 만원을 함께 읽고 원 접미사를 수용한다", () => {
      expect(parseMoney("3억5000만원")).toBe(350_000_000);
    });

    it("억 다음에 원이 올 때 (만 없을 때) 원으로 읽는다", () => {
      // "1억 9,999원" is 100_009_999 in formatWon representation
      // After stripping commas/spaces: "1억9999원"
      expect(parseMoney("1억9999원")).toBe(100_009_999);
    });

    it("억, 만, 원 세 부분이 모두 있는 형식을 읽는다", () => {
      // "6억 1,234만 5,678원" is 612_345_678
      // After stripping commas/spaces: "6억1234만5678원"
      expect(parseMoney("6억1234만5678원")).toBe(612_345_678);
    });

    it("다양한 formatWon 출력 형식을 읽는다", () => {
      const cases = [
        ["3억5000만원", 350_000_000],
        ["1억9999원", 100_009_999],
        ["6억1234만5678원", 612_345_678],
        ["5000만원", 50_000_000],
        ["1234원", 1_234],
      ] as const;
      for (const [input, expected] of cases) {
        expect(parseMoney(input), `"${input}"`).toBe(expected);
      }
    });
  });

  describe("정수 안전 상한", () => {
    it("매우 큰 숫자 (안전 범위 초과)는 null을 반환한다", () => {
      expect(parseMoney("9".repeat(30))).toBeNull();
      expect(parseMoney("9".repeat(30) + "억")).toBeNull();
    });

    it("안전 범위 내의 큰 숫자는 파싱된다", () => {
      // Number.MAX_SAFE_INTEGER = 9007199254740991
      // Pick a value well below the limit. Use 억 marker to avoid 만원 multiplication
      const safeNumber = "90억";
      const result = parseMoney(safeNumber);
      expect(result).not.toBeNull();
      expect(result).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      expect(result).toBe(9_000_000_000);
    });
  });
});
