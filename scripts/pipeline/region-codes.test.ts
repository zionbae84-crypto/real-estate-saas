import { describe, expect, it } from "vitest";
import { buildRegionCodes, type RawLegalDongRow } from "./region-codes";

describe("buildRegionCodes", () => {
  it("법정동코드 앞 5자리로 묶어 시군구 단위로 중복 제거한다", () => {
    const rows: RawLegalDongRow[] = [
      { code: "1111010100", sidoName: "서울특별시", sigunguName: "종로구", dongName: "청운동" },
      { code: "1111010200", sidoName: "서울특별시", sigunguName: "종로구", dongName: "신교동" },
      { code: "1111000000", sidoName: "서울특별시", sigunguName: "종로구", dongName: "" },
    ];
    const result = buildRegionCodes(rows);
    expect(result).toEqual([
      { regionCode: "11110", sidoName: "서울특별시", sigunguName: "종로구" },
    ]);
  });

  it("시군구명이 빈 문자열인 행(시/도 자체를 가리키는 행)은 뺀다", () => {
    const rows: RawLegalDongRow[] = [
      { code: "1100000000", sidoName: "서울특별시", sigunguName: "", dongName: "" },
      { code: "1111010100", sidoName: "서울특별시", sigunguName: "종로구", dongName: "청운동" },
    ];
    const result = buildRegionCodes(rows);
    expect(result).toEqual([
      { regionCode: "11110", sidoName: "서울특별시", sigunguName: "종로구" },
    ]);
  });

  it("결과는 regionCode 오름차순으로 정렬된다", () => {
    const rows: RawLegalDongRow[] = [
      { code: "1168010100", sidoName: "서울특별시", sigunguName: "강남구", dongName: "역삼동" },
      { code: "1111010100", sidoName: "서울특별시", sigunguName: "종로구", dongName: "청운동" },
    ];
    const result = buildRegionCodes(rows);
    expect(result.map((r) => r.regionCode)).toEqual(["11110", "11680"]);
  });
});
