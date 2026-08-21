import { useCallback, useEffect, useState } from "react";
import type { BuyerProfile, HouseholdStatus } from "../lib/finance";

export const STORAGE_KEY = "budget-profile-v1";

export interface ExistingHomeFormState {
  expectedSalePrice: number | null;
  remainingLoan: number | null;
  capitalGainsTax: number | null;
}

export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  existingDebtAnnualPayment: number;
  status: HouseholdStatus;
  isFirstTimeBuyer: boolean;
  exclusiveAreaSqm: number;
  existingHome: ExistingHomeFormState;
}

export const DEFAULT_FORM_STATE: ProfileFormState = {
  cash: null,
  annualIncome: null,
  existingDebtAnnualPayment: 0,
  status: "무주택",
  // 켜두면 LTV·정책대출 자격을 과대평가하는 방향이므로 꺼진 쪽이 안전하다.
  isFirstTimeBuyer: false,
  exclusiveAreaSqm: 84,
  existingHome: {
    expectedSalePrice: null,
    remainingLoan: null,
    capitalGainsTax: null,
  },
};

/** 필수값(현금·소득)이 채워졌을 때만 BuyerProfile을 만든다. */
export function toProfile(state: ProfileFormState): BuyerProfile | null {
  if (state.cash === null || state.annualIncome === null) return null;

  const profile: BuyerProfile = {
    status: state.status,
    cash: state.cash,
    annualIncome: state.annualIncome,
    existingDebtAnnualPayment: state.existingDebtAnnualPayment,
    isFirstTimeBuyer: state.isFirstTimeBuyer,
    exclusiveAreaSqm: state.exclusiveAreaSqm,
  };

  const home = state.existingHome;
  if (
    state.status === "갈아타기" &&
    home.expectedSalePrice !== null &&
    home.remainingLoan !== null
  ) {
    profile.existingHome = {
      expectedSalePrice: home.expectedSalePrice,
      remainingLoan: home.remainingLoan,
      // 미입력이면 넣지 않는다. 엔진이 "양도세 미반영" 경고를 낸다.
      ...(home.capitalGainsTax !== null
        ? { capitalGainsTax: home.capitalGainsTax }
        : {}),
    };
  }

  return profile;
}

/**
 * 저장된 폼 상태를 복원한다.
 * localStorage는 사용자가 직접 고칠 수 있는 자리이므로 신뢰하지 않는다.
 * 형태가 어긋난 필드는 조용히 기본값으로 대체한다.
 */
export function loadStoredState(
  storage: Pick<Storage, "getItem">,
): ProfileFormState {
  let raw: unknown;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_FORM_STATE;
    raw = JSON.parse(stored);
  } catch {
    return DEFAULT_FORM_STATE;
  }

  if (typeof raw !== "object" || raw === null) return DEFAULT_FORM_STATE;
  const o = raw as Record<string, unknown>;
  const home =
    typeof o.existingHome === "object" && o.existingHome !== null
      ? (o.existingHome as Record<string, unknown>)
      : {};

  return {
    cash: nullableAmount(o.cash),
    annualIncome: nullableAmount(o.annualIncome),
    existingDebtAnnualPayment:
      amount(o.existingDebtAnnualPayment) ??
      DEFAULT_FORM_STATE.existingDebtAnnualPayment,
    status:
      o.status === "무주택" || o.status === "갈아타기"
        ? o.status
        : DEFAULT_FORM_STATE.status,
    isFirstTimeBuyer:
      typeof o.isFirstTimeBuyer === "boolean"
        ? o.isFirstTimeBuyer
        : DEFAULT_FORM_STATE.isFirstTimeBuyer,
    exclusiveAreaSqm:
      positive(o.exclusiveAreaSqm) ?? DEFAULT_FORM_STATE.exclusiveAreaSqm,
    existingHome: {
      expectedSalePrice: nullableAmount(home.expectedSalePrice),
      remainingLoan: nullableAmount(home.remainingLoan),
      capitalGainsTax: nullableAmount(home.capitalGainsTax),
    },
  };
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function nullableAmount(value: unknown): number | null {
  return amount(value);
}

function positive(value: unknown): number | null {
  const n = amount(value);
  return n !== null && n > 0 ? n : null;
}

export function useProfileForm() {
  const [state, setState] = useState<ProfileFormState>(() =>
    loadStoredState(window.localStorage),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장 실패는 기능에 영향을 주지 않는다. 조용히 넘어간다.
    }
  }, [state]);

  const setField = useCallback(
    <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setExistingHomeField = useCallback(
    <K extends keyof ExistingHomeFormState>(
      key: K,
      value: ExistingHomeFormState[K],
    ) => {
      setState((prev) => ({
        ...prev,
        existingHome: { ...prev.existingHome, [key]: value },
      }));
    },
    [],
  );

  const reset = useCallback(() => setState(DEFAULT_FORM_STATE), []);

  return { state, setField, setExistingHomeField, reset, profile: toProfile(state) };
}
