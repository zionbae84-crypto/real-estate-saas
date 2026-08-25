import { useCallback, useEffect, useState } from "react";
import { SELECTABLE_PURCHASE_TYPES, type PurchaseType } from "../lib/purchase";

export const PURCHASE_TYPE_STORAGE_KEY = "purchase-type-v1";

/**
 * 구매 유형을 기억한다.
 *
 * **왜 저장하는가.** `useProfileForm`은 현금·소득·규제지역 같은 프로필을
 * 전부 localStorage에 남기는데 구매 유형만 남기지 않았다. 그래서 갭투자를
 * 고른 사람이 새로고침하면 화면이 조용히 실거주로 되돌아가고, 저장된
 * 프로필로 계산한 "실구매 가능 가격"이 다시 떴다 — **기억한 것처럼 보이는
 * 화면이 자기 매수에 해당하지 않는 한도를 보여주는 것**이라, 유형 선택이
 * 애초에 막으려던 바로 그 오해다(PurchaseTypeSelect 문서 참고).
 *
 * **읽지 못하면 실거주로 떨어지되 조용히 떨어지지 않는다.** localStorage는
 * 사용자가 직접 고칠 수 있는 자리이고, 저장 형식이 바뀔 수도 있다. 모르는
 * 값이면 가장 안전한 쪽(지금까지 이 화면이 말없이 전제하던 유형)으로
 * 떨어지지만, 그 사실을 화면에 남긴다 — 말없이 실거주로 시작하면 위와
 * 똑같은 오해가 된다.
 */
export interface StoredPurchaseType {
  type: PurchaseType;
  /** 저장된 값이 있었는데 읽지 못해 실거주로 떨어졌는가 */
  restoreFailed: boolean;
}

const SAFE_DEFAULT: PurchaseType = "실거주";

/**
 * `SELECTABLE_PURCHASE_TYPES` 기준으로 판단한다 — 갭투자를 뺀 목록이다.
 * 예전에 갭투자를 저장해 둔 사용자가 있으면(지금은 규제로 고를 수
 * 없는 유형이다) "모르는 값"과 같은 경로로 실거주 폴백을 태우고 그
 * 사실을 화면에 남긴다. `PURCHASE_TYPES`로 넓혀 체크하면 화면에는 없는
 * 라디오가 골라진 채로 값만 복원돼, 사용자가 자기 선택을 다시 확인할
 * 방법이 없어진다.
 */
function isPurchaseType(value: string): value is PurchaseType {
  return (SELECTABLE_PURCHASE_TYPES as readonly string[]).includes(value);
}

/**
 * 저장된 유형을 복원한다. 저장된 적이 없으면 실거주에서 시작하고, 그건
 * 실패가 아니다 — 처음 오는 사람의 정상 경로다.
 */
export function loadStoredPurchaseType(
  storage: Pick<Storage, "getItem">,
): StoredPurchaseType {
  let stored: string | null;
  try {
    stored = storage.getItem(PURCHASE_TYPE_STORAGE_KEY);
  } catch {
    // 저장소 접근 자체가 막힌 경우(사생활 보호 모드 등). 남긴 값이
    // 있었는지조차 알 수 없으므로 실패로 보지 않는다.
    return { type: SAFE_DEFAULT, restoreFailed: false };
  }

  if (stored === null) return { type: SAFE_DEFAULT, restoreFailed: false };
  if (isPurchaseType(stored)) return { type: stored, restoreFailed: false };
  return { type: SAFE_DEFAULT, restoreFailed: true };
}

export interface PurchaseTypeState {
  purchaseType: PurchaseType;
  setPurchaseType: (type: PurchaseType) => void;
  /** 저장된 값을 읽지 못해 실거주로 떨어졌는가. 사용자가 다시 고르면 꺼진다 */
  restoreFailed: boolean;
}

export function usePurchaseType(): PurchaseTypeState {
  const [state, setState] = useState<StoredPurchaseType>(() =>
    loadStoredPurchaseType(window.localStorage),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, state.type);
    } catch {
      // 저장 실패는 기능에 영향을 주지 않는다(useProfileForm과 같은 판단).
    }
  }, [state.type]);

  const setPurchaseType = useCallback((type: PurchaseType) => {
    // 사용자가 직접 고른 순간부터는 복원 실패 안내가 뜻을 잃는다.
    setState({ type, restoreFailed: false });
  }, []);

  return {
    purchaseType: state.type,
    setPurchaseType,
    restoreFailed: state.restoreFailed,
  };
}
