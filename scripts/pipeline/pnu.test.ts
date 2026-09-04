import { describe, expect, it } from "vitest";
import { computePnu } from "./pnu";

describe("computePnu", () => {
  it("법정동코드+본번+부번을 이어 19자리 PNU를 만든다", () => {
    // 강남센트럴아이파크 실측: regionCode 11680, umdCd 10100(역삼동), 902번지.
    expect(computePnu("11680", "10100", "902", null)).toBe("1168010100109020000");
  });

  it("부번이 있으면 뒤에 그대로 붙인다", () => {
    // 롯데캐슬노블 실측: 835-68.
    expect(computePnu("11680", "10100", "835", "68")).toBe("1168010100108350068");
  });

  it("umdCd·본번·부번의 선행 0을 padStart로 되살린다", () => {
    expect(computePnu("11680", "100", "5", "3")).toBe("1168000100100050003");
  });

  it("bonbun이 null이면 만들 수 없다 — 지어내지 않는다", () => {
    expect(computePnu("11680", "10100", null, null)).toBeNull();
  });

  it("umdCd가 null이면 만들 수 없다", () => {
    expect(computePnu("11680", null, "902", null)).toBeNull();
  });

  it("regionCode가 5자리가 아니면 만들 수 없다", () => {
    expect(computePnu("1168", "10100", "902", null)).toBeNull();
    expect(computePnu("116800", "10100", "902", null)).toBeNull();
  });

  it("본번·부번이 4자리를 넘으면 만들 수 없다 — 자르지 않는다", () => {
    expect(computePnu("11680", "10100", "99999", null)).toBeNull();
    expect(computePnu("11680", "10100", "902", "99999")).toBeNull();
  });
});
