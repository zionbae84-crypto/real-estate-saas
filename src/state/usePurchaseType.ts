import { useEffect } from "react";
import type { PurchaseType } from "../lib/purchase";

export const PURCHASE_TYPE_STORAGE_KEY = "purchase-type-v1";

/**
 * 이 앱이 전제하는 유일한 구매 유형.
 *
 * 구매 유형 선택(실거주 / 월세수익형 라디오)은 사용자 지시로 제거됐다.
 * 그래도 이 값을 상수 하나로 남겨 두는 이유는, 실거주 대출 한도 계산에
 * 걸린 게이트들(`App.tsx`의 `residentialProfile`과 `buildComplexList`
 * 조건)이 이 값을 읽어 서 있기 때문이다 — 그 게이트가
 * `scripts/purchase-structure.test.ts`가 지키는 "투자 목적 매수에
 * 실거주 한도를 쓰지 않는다"의 자리다. 유형이 다시 늘어나는 날
 * 되돌릴 곳이 이 상수 하나로 남는다.
 */
export const FIXED_PURCHASE_TYPE: PurchaseType = "실거주";

/**
 * 구매 유형을 돌려준다. **언제나 실거주다.**
 *
 * 하는 일이 하나 더 있다: 저장소에 남아 있는 값을 실거주로 덮는다.
 *
 * **왜 덮어야 하는가.** 유형을 고를 수 있던 시절에 "월세수익형"을
 * 저장해 둔 사용자가 있다. 그 값을 그대로 되살리면 이 앱에 더 이상
 * 존재하지 않는 화면을 요구하는 상태가 되고, 그것이 정확히 커밋
 * `c90babf`가 고친 사고의 형태다(저장된 투자 유형으로 새로 열면
 * 빠져나올 수 없는 화면이 떴다). 지금은 아예 읽지 않으므로 그 사고가
 * 재현될 경로 자체가 없지만, 남은 값을 그대로 두면 유형이 다시
 * 늘어나는 날 사용자가 고른 적 없는 유형이 조용히 되살아난다.
 *
 * 저장 실패는 삼킨다(`useProfileForm`과 같은 판단) — 사생활 보호
 * 모드에서 저장소 접근이 막히는 것은 기능에 영향을 주지 않는다.
 */
export function usePurchaseType(): PurchaseType {
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PURCHASE_TYPE_STORAGE_KEY,
        FIXED_PURCHASE_TYPE,
      );
    } catch {
      // 저장소 접근이 막힌 경우. 읽지도 않으므로 잃는 것이 없다.
    }
  }, []);

  return FIXED_PURCHASE_TYPE;
}
