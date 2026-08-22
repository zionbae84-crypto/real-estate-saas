import { describe, expect, it } from "vitest";
import { buildComplexKey, normalizeAll, normalizeName } from "./normalize";
import type { RawTrade } from "./types";

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    complexName: "래미안대치팰리스",
    builtYear: 2015,
    exclusiveAreaSqm: 84.97,
    floor: 10,
    price: 3_000_000_000,
    contractDate: "2026-06-15",
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("공백을 없앤다", () => {
    expect(normalizeName("래미안 대치팰리스")).toBe(normalizeName("래미안대치팰리스"));
  });

  it("대소문자를 통일한다", () => {
    expect(normalizeName("E편한세상")).toBe(normalizeName("e편한세상"));
  });

  it("특수문자를 없앤다", () => {
    expect(normalizeName("래미안(대치)팰리스")).toBe(normalizeName("래미안대치팰리스"));
  });

  it("차수를 지우지 않는다 — 실제로 다른 단지다", () => {
    expect(normalizeName("우성1차")).not.toBe(normalizeName("우성2차"));
  });

  it("단지 번호를 지우지 않는다", () => {
    expect(normalizeName("주공1단지")).not.toBe(normalizeName("주공2단지"));
  });

  it("아파트 접미사를 지우지 않는다 — 지우면 다른 단지와 충돌할 수 있다", () => {
    expect(normalizeName("우성아파트")).not.toBe(normalizeName("우성"));
  });
});

describe("buildComplexKey", () => {
  it("법정동·건축년도·정규화명을 합친다", () => {
    expect(buildComplexKey(trade())).toBe("11680|대치동|2015|래미안대치팰리스");
  });

  it("표기가 흔들려도 같은 키가 된다", () => {
    expect(buildComplexKey(trade({ complexName: "래미안 대치팰리스" }))).toBe(
      buildComplexKey(trade({ complexName: "래미안대치팰리스" })),
    );
  });

  it("건축년도가 다르면 다른 키다", () => {
    expect(buildComplexKey(trade({ builtYear: 2015 }))).not.toBe(
      buildComplexKey(trade({ builtYear: 2016 })),
    );
  });

  it("법정동이 다르면 다른 키다 — 같은 이름의 단지가 여러 동에 있다", () => {
    expect(buildComplexKey(trade({ legalDongName: "역삼동" }))).not.toBe(
      buildComplexKey(trade({ legalDongName: "대치동" })),
    );
  });
});

describe("normalizeAll", () => {
  it("모든 거래에 키를 붙인다", () => {
    const result = normalizeAll([trade(), trade({ complexName: "은마" })]);
    expect(result).toHaveLength(2);
    expect(result[0]?.complexKey).toBeDefined();
    expect(result[0]?.complexKey).not.toBe(result[1]?.complexKey);
  });

  it("원본 필드를 보존한다", () => {
    const [result] = normalizeAll([trade()]);
    expect(result?.complexName).toBe("래미안대치팰리스");
    expect(result?.price).toBe(3_000_000_000);
  });
});
