import { describe, expect, it } from "vitest";
import {
  loadStoredPurchaseType,
  PURCHASE_TYPE_STORAGE_KEY,
} from "./usePurchaseType";

/**
 * 리뷰 밖에서 찾은 결함(P1): 구매 유형만 저장되지 않았다.
 *
 * 현금·소득·규제지역 같은 나머지 프로필은 전부 localStorage에 남는데
 * 유형만 남지 않아, 갭투자를 고른 사람이 새로고침하면 화면이 조용히
 * 실거주로 되돌아가고 저장된 프로필로 계산한 "실구매 가능 가격"이 다시
 * 떴다. **기억한 것처럼 보이는 화면이 자기 매수에 해당하지 않는 한도를
 * 보여주는 것**이라, 유형 선택이 애초에 막으려던 바로 그 오해다.
 */

function storage(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key) => (key === PURCHASE_TYPE_STORAGE_KEY ? value : null) };
}

describe("loadStoredPurchaseType", () => {
  it("저장된 적이 없으면 실거주에서 시작한다 — 실패가 아니다", () => {
    expect(loadStoredPurchaseType(storage(null))).toEqual({
      type: "실거주",
      restoreFailed: false,
    });
  });

  it.each(["실거주", "갭투자", "월세수익형"] as const)(
    "%s를 저장했으면 그대로 되살린다",
    (type) => {
      expect(loadStoredPurchaseType(storage(type))).toEqual({
        type,
        restoreFailed: false,
      });
    },
  );

  it("모르는 값이면 실거주로 떨어지되 조용히 떨어지지 않는다", () => {
    for (const broken of ["", "  ", "전세", "실거주 ", '"갭투자"', "{}", "null"]) {
      expect(loadStoredPurchaseType(storage(broken)), broken).toEqual({
        type: "실거주",
        restoreFailed: true,
      });
    }
  });

  it("저장소 접근 자체가 막히면 실패로 보지 않는다", () => {
    // 남긴 값이 있었는지조차 알 수 없다 — 안내할 사실이 없다.
    const blocked: Pick<Storage, "getItem"> = {
      getItem() {
        throw new Error("접근 거부");
      },
    };
    expect(loadStoredPurchaseType(blocked)).toEqual({
      type: "실거주",
      restoreFailed: false,
    });
  });

  it("떨어지는 방향은 언제나 실거주다(변이 검사 대비 전제)", () => {
    // 안전한 쪽으로 떨어진다는 것이 요점이다. 투자 유형으로 떨어지면
    // 사용자가 고른 적 없는 전제 위에서 지표가 계산된다.
    expect(loadStoredPurchaseType(storage("아무거나")).type).toBe("실거주");
  });
});
