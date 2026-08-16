import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";

describe("parseRules", () => {
  it("실제 룰셋 파일을 통과시킨다", () => {
    const rules = parseRules(rawRules);
    expect(rules.version).toBe("2026-03");
    expect(rules.absoluteCap).toBe(600_000_000);
  });

  it("필수 필드가 없으면 어느 필드인지 알려주며 실패한다", () => {
    const broken = { ...rawRules, dsrLimit: undefined };
    expect(() => parseRules(broken)).toThrow(/dsrLimit/);
  });

  it("객체가 아니면 실패한다", () => {
    expect(() => parseRules(null)).toThrow(/객체/);
  });

  it("중개보수 구간이 오름차순이 아니면 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: [
        { upTo: 200000000, rate: 0.005, cap: null },
        { upTo: 50000000, rate: 0.006, cap: null },
        { upTo: null, rate: 0.007, cap: null },
      ],
    };
    expect(() => parseRules(broken)).toThrow(/오름차순/);
  });

  it("중개보수 마지막 구간의 upTo가 null이 아니면 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: [{ upTo: 50000000, rate: 0.006, cap: null }],
    };
    expect(() => parseRules(broken)).toThrow(/마지막 구간/);
  });
});
