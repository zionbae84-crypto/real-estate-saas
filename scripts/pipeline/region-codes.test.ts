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

/**
 * 국토부 실거래가 API의 `LAWD_CD`는 **구가 있는 시**에서는 구 단위 코드를
 * 받는다. 그런데 법정동코드 원본에는 모구(수원시 `41110`)와 그 자식 구
 * (`41111` 수원시장안구 …)가 **나란히** 들어 있어, 그대로 두면 선택기에
 * 고를 수 있는 항목으로 모구가 남는다 — 고르면 조회가 0건으로 돌아오고,
 * 화면은 그 0건을 "이 지역엔 실거래가가 없어요"라는 **사실 서술**로
 * 그린다. 우리가 확인한 적 없는 것을 확인한 것처럼 말하는, 이 앱이 가장
 * 경계하는 오류다. 그래서 고를 수 없게 데이터에서 뺀다.
 */
describe("buildRegionCodes — 구가 있는 시의 모구(시 단위) 코드는 뺀다", () => {
  it("자치구로 나뉜 시는 모구(5번째 자리 0)를 빼고 구만 남긴다", () => {
    const rows: RawLegalDongRow[] = [
      { code: "4111000000", sidoName: "경기도", sigunguName: "수원시", dongName: "" },
      { code: "4111110100", sidoName: "경기도", sigunguName: "수원시장안구", dongName: "파장동" },
      { code: "4111310100", sidoName: "경기도", sigunguName: "수원시권선구", dongName: "세류동" },
    ];
    const result = buildRegionCodes(rows);
    expect(result.map((r) => r.regionCode)).toEqual(["41111", "41113"]);
    expect(result.map((r) => r.sigunguName)).toEqual(["수원시장안구", "수원시권선구"]);
  });

  it("구로 나뉘지 않은 평범한 시군구는 그대로 남는다", () => {
    const rows: RawLegalDongRow[] = [
      { code: "4115010100", sidoName: "경기도", sigunguName: "평택시", dongName: "비전동" },
      { code: "1111010100", sidoName: "서울특별시", sigunguName: "종로구", dongName: "청운동" },
    ];
    const result = buildRegionCodes(rows);
    expect(result.map((r) => r.regionCode)).toEqual(["11110", "41150"]);
  });

  /**
   * **앞 4자리만 보고 자르면 안 된다.** 실제 데이터에서 충청북도
   * 영동군(`43740`)과 증평군(`43745`)은 앞 4자리가 같지만 서로 다른
   * 시군구다 — 증평군은 영동군의 자치구가 아니다. 앞 4자리만 보는 규칙은
   * 멀쩡한 영동군을 선택기에서 지워, 그 지역 사람에게는 이 앱이 아예
   * 닿지 않게 된다. 그래서 이름이 실제로 모구 이름으로 시작하는지까지
   * 확인한다.
   */
  it("앞 4자리가 같아도 자치구가 아니면(이름이 이어지지 않으면) 둘 다 남는다", () => {
    const rows: RawLegalDongRow[] = [
      { code: "4374010100", sidoName: "충청북도", sigunguName: "영동군", dongName: "계산리" },
      { code: "4374510100", sidoName: "충청북도", sigunguName: "증평군", dongName: "증평리" },
    ];
    const result = buildRegionCodes(rows);
    expect(result.map((r) => r.sigunguName)).toEqual(["영동군", "증평군"]);
  });
});
