import { describe, expect, it } from "vitest";
import { buildComplexKey, normalizeAll, normalizeName } from "./normalize";
import type { RawTrade } from "./types";

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    aptSeq: "11680-4394",
    complexName: "래미안대치팰리스",
    builtYear: 2015,
    exclusiveAreaSqm: 84.97,
    floor: 10,
    price: 3_000_000_000,
    contractDate: "2026-06-15",
    landLeasehold: "N",
    address: {
      roadNm: "삼성로", roadNmCd: "3122005", bonbun: "0316",
      bubun: "0000", jibun: "316", umdCd: "10600",
    },
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
  it("국토부 단지 ID(aptSeq)를 그대로 쓴다", () => {
    expect(buildComplexKey(trade())).toBe("11680-4394");
  });

  it("표기가 흔들려도 같은 키다 — 이름이 키에 안 들어가니 갈릴 수가 없다", () => {
    expect(buildComplexKey(trade({ complexName: "래미안 대치팰리스" }))).toBe(
      buildComplexKey(trade({ complexName: "래미안대치팰리스" })),
    );
  });

  it("이름이 아예 달라도 aptSeq가 같으면 같은 키다 — 과소병합이 구조적으로 불가능하다", () => {
    expect(buildComplexKey(trade({ complexName: "전혀 다른 이름" }))).toBe(
      buildComplexKey(trade()),
    );
  });

  it("이름·법정동·준공년도가 모두 같아도 aptSeq가 다르면 다른 키다 — 과대병합도 불가능하다", () => {
    expect(buildComplexKey(trade({ aptSeq: "11680-1" }))).not.toBe(
      buildComplexKey(trade({ aptSeq: "11680-2" })),
    );
  });

  it("aptSeq가 같으면 준공년도가 달라도 같은 키다 — 단지를 가르는 것은 aptSeq뿐이다", () => {
    expect(buildComplexKey(trade({ builtYear: 2015 }))).toBe(
      buildComplexKey(trade({ builtYear: 2016 })),
    );
  });

  it("지역코드를 덧붙이지 않는다 — aptSeq가 이미 시군구코드로 시작한다", () => {
    expect(buildComplexKey(trade())).not.toContain("|");
  });
});

describe("normalizeAll", () => {
  it("모든 거래에 키를 붙인다", () => {
    const result = normalizeAll([trade(), trade({ aptSeq: "11680-100", complexName: "은마" })]);
    expect(result).toHaveLength(2);
    expect(result[0]?.complexKey).toBe("11680-4394");
    expect(result[1]?.complexKey).toBe("11680-100");
  });

  it("원본 필드를 보존한다", () => {
    const [result] = normalizeAll([trade()]);
    expect(result?.complexName).toBe("래미안대치팰리스");
    expect(result?.price).toBe(3_000_000_000);
  });
});
