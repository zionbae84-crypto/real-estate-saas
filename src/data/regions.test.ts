import { describe, expect, it } from "vitest";
import { regionNameByCode, sigunguBySido, SIDO_NAMES } from "./regions";

describe("regions", () => {
  it("SIDO_NAMES는 중복 없이 정렬된 시도 목록이다", () => {
    expect(SIDO_NAMES).toContain("서울특별시");
    expect(new Set(SIDO_NAMES).size).toBe(SIDO_NAMES.length);
    expect(SIDO_NAMES).toEqual(
      [...SIDO_NAMES].sort((a, b) => a.localeCompare(b, "ko")),
    );
  });

  it("sigunguBySido는 그 시도의 구만 반환한다", () => {
    const seoul = sigunguBySido("서울특별시");
    expect(seoul.some((r) => r.sigunguName === "강남구")).toBe(true);
    expect(seoul.every((r) => r.regionCode.startsWith("11"))).toBe(true);
  });

  it("모르는 시도명이면 빈 배열이다", () => {
    expect(sigunguBySido("없는시도")).toEqual([]);
  });

  it("regionNameByCode는 '시도 시군구' 형태로 합쳐 반환한다", () => {
    expect(regionNameByCode("11680")).toBe("서울특별시 강남구");
  });

  it("모르는 코드면 null이다", () => {
    expect(regionNameByCode("00000")).toBeNull();
  });
});
