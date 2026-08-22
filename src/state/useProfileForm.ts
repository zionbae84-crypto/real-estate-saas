import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuyerProfile, HouseholdStatus } from "../lib/finance";
import { rules } from "./useAffordability";

export const STORAGE_KEY = "budget-profile-v1";

export interface ExistingHomeFormState {
  expectedSalePrice: number | null;
  remainingLoan: number | null;
  capitalGainsTax: number | null;
}

/** 사용자가 직접 값을 정한 항목. 여기 없으면 기본값(=가정)으로 계산 중이다 */
export type AssumableField = "existingDebt" | "regulatedArea" | "area";

const ALL_ASSUMABLE_FIELDS: readonly AssumableField[] = [
  "existingDebt",
  "regulatedArea",
  "area",
];

/** setField가 건드린 키를 어느 AssumableField로 기록할지 매핑한다 */
const ASSUMABLE_KEY_MAP: Partial<Record<keyof ProfileFormState, AssumableField>> =
  {
    existingDebtAnnualPayment: "existingDebt",
    isRegulatedArea: "regulatedArea",
    exclusiveAreaSqm: "area",
  };

export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  existingDebtAnnualPayment: number | null;
  status: HouseholdStatus;
  isFirstTimeBuyer: boolean;
  isRegulatedArea: boolean;
  exclusiveAreaSqm: number;
  existingHome: ExistingHomeFormState;
  /**
   * 사용자가 명시적으로 정한 항목들.
   *
   * 값만 봐서는 가정인지 사용자 선택인지 알 수 없다 — isRegulatedArea가
   * true인 것이 "기본값 그대로"인지 "사용자가 규제지역을 골랐다"인지
   * 구분되지 않는다. 가정 문구는 그 구분 위에 서 있으므로 따로 기록한다.
   */
  touched: AssumableField[];
}

/**
 * 전용면적 기본값. 농특세 임계값을 **넘는** 쪽으로 둔다.
 *
 * 농특세는 전용 85㎡ 초과에 붙는다. 임계값 아래로 두면 부대비용이 적게
 * 잡혀 살 수 있는 가격이 실제보다 크게 나온다 — 이 제품이 피해야 하는
 * 방향이다. 사용자가 실제 면적을 넣으면 대개 이 가정보다 유리해진다.
 *
 * 룰셋에서 유도하는 이유: 숫자를 박아 두면 임계값이 바뀌었을 때 방향이
 * 조용히 뒤집힌다.
 */
const ASSUMED_AREA_SQM = rules.acquisitionTax.ruralTaxAreaThresholdSqm + 1;

export const DEFAULT_FORM_STATE: ProfileFormState = {
  cash: null,
  annualIncome: null,
  // 다른 금액 필드와 마찬가지로 미입력은 null이다. 0을 기본값으로 두면
  // MoneyInput이 "0"을 표시하고, 사용자가 지우려 해도 다시 "0"으로
  // 스냅백해 필드를 비울 방법이 없어진다. 실제 엔진 계산 시에는
  // toProfile이 null을 0으로 바꾼다.
  existingDebtAnnualPayment: null,
  status: "무주택",
  // 켜두면 LTV·정책대출 자격을 과대평가하는 방향이므로 꺼진 쪽이 안전하다.
  isFirstTimeBuyer: false,
  // isFirstTimeBuyer와 반대 방향의 같은 이유: 규제지역 무주택자 LTV는
  // 40%, 비규제(수도권)는 70%다. 잘못 꺼두면(비규제로 잘못 알면) 한도를
  // 30%p 과대평가하게 되므로, 모르면 규제지역(true)으로 두는 쪽이
  // 안전하다 — 이 제품은 항상 과대평가를 피하는 쪽을 기본값으로 삼는다.
  isRegulatedArea: true,
  exclusiveAreaSqm: ASSUMED_AREA_SQM,
  existingHome: {
    expectedSalePrice: null,
    remainingLoan: null,
    capitalGainsTax: null,
  },
  touched: [],
};

/** 필수값(현금·소득)이 채워졌을 때만 BuyerProfile을 만든다. */
export function toProfile(state: ProfileFormState): BuyerProfile | null {
  if (state.cash === null || state.annualIncome === null) return null;

  const profile: BuyerProfile = {
    status: state.status,
    cash: state.cash,
    annualIncome: state.annualIncome,
    // 엔진(BuyerProfile.existingDebtAnnualPayment)은 number 하나만 받는다.
    // "비어 있음"과 "부채 없음"을 폼에서는 구분하지만(입력란을 비울 수
    // 있어야 하므로) 엔진 경계에서는 둘 다 0이다 — 여기서만 좁힌다.
    existingDebtAnnualPayment: state.existingDebtAnnualPayment ?? 0,
    isFirstTimeBuyer: state.isFirstTimeBuyer,
    isRegulatedArea: state.isRegulatedArea,
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
    cash: amount(o.cash),
    annualIncome: amount(o.annualIncome),
    existingDebtAnnualPayment: amount(o.existingDebtAnnualPayment),
    // "갈아타기" 상태는 저장본에 남아 있어도 항상 "무주택"으로 되돌린다.
    // ProfileForm은 status/기존 주택(existingHome) 편집 UI를 전혀
    // 렌더링하지 않는다 — 사용자가 이 값을 보거나 고칠 방법이 없다.
    // 그런데도 그대로 복원해 반영하면 calcAvailableCash가 매도 순자산을
    // 현금에 더해, 사용자가 보지도 고치지도 못한 채로 구매력이 조용히
    // 올라간다. 이 제품은 항상 안전한(과소평가) 쪽을 기본값으로 삼으므로,
    // 편집 UI가 돌아오기 전까지는 무주택으로 취급한다.
    //
    // existingHome 필드값 자체는 지우지 않고 아래에서 그대로 보존한다 —
    // 편집 UI가 돌아왔을 때 사용자가 예전에 넣은 값을 잃지 않게 하기
    // 위해서다. AssumptionLine은 이 보존된 값을 보고 "갈아타기 정보가
    // 있지만 반영되지 않았다"는 사실을 알림 문구로 드러낸다.
    status: DEFAULT_FORM_STATE.status,
    isFirstTimeBuyer:
      typeof o.isFirstTimeBuyer === "boolean"
        ? o.isFirstTimeBuyer
        : DEFAULT_FORM_STATE.isFirstTimeBuyer,
    isRegulatedArea:
      typeof o.isRegulatedArea === "boolean"
        ? o.isRegulatedArea
        : DEFAULT_FORM_STATE.isRegulatedArea,
    exclusiveAreaSqm:
      positive(o.exclusiveAreaSqm) ?? DEFAULT_FORM_STATE.exclusiveAreaSqm,
    existingHome: {
      expectedSalePrice: amount(home.expectedSalePrice),
      remainingLoan: amount(home.remainingLoan),
      capitalGainsTax: amount(home.capitalGainsTax),
    },
    // 옛 저장본에는 touched가 아예 없다. 없으면 "전부 가정 중"이라는
    // 뜻이므로 빈 배열이 안전한 방향이다 — 실제로는 사용자가 예전에
    // 값을 정했을 수도 있는 항목을 다시 "가정 중"으로 보여주는 것은,
    // 반대로 사용자가 정한 적 없는 값을 "확정"으로 잘못 표시하는 것보다
    // 안전하다.
    touched: parseTouched(o.touched),
  };
}

function parseTouched(value: unknown): AssumableField[] {
  if (!Array.isArray(value)) return [];
  return ALL_ASSUMABLE_FIELDS.filter((field) => value.includes(field));
}

/**
 * localStorage는 사용자가 직접 고칠 수 있는 자리이므로 신뢰하지 않는다.
 * parseMoney(포맷/parseMoney.ts)가 적용하는 것과 같은 정수 안전 상한을
 * 여기서도 건다 — 그렇지 않으면 조작된 값(예: annualIncome: 1e300)이
 * 엔진까지 그대로 흘러가 breakdown.DSR 같은 계산을 Infinity로 밀어버릴
 * 수 있다. Infinity는 어떤 비교에도 걸리지 않아 제약이 조용히 사라진
 * 것처럼 동작한다 — "빌릴 수 없다"고 말해야 할 자리에서 "얼마든지
 * 빌릴 수 있다"고 답하는, 이 제품이 가장 피해야 하는 방향의 오답이다.
 */
function amount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
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
      setState((prev) => {
        const assumable = ASSUMABLE_KEY_MAP[key];
        // 기존 부채 입력란은 파싱 실패(못 읽는 값, 빈 칸) 시 onChange(null)을
        // 부른다. 이때도 touched로 기록하면 AssumptionLine이 "사용자가
        // 확정했다"고 오해해 문구를 감추는데, 실제 계산은 여전히 0을
        // 가정한다 — 값이 실제로 있을 때만 touched로 표시해야 문구와
        // 계산이 어긋나지 않는다. (다른 AssumableField는 체크박스·숫자
        // 입력이라 이런 "실패해서 null" 경로가 없다.)
        const isEmptyExistingDebt =
          key === "existingDebtAnnualPayment" && value === null;
        const touched =
          assumable && !isEmptyExistingDebt && !prev.touched.includes(assumable)
            ? [...prev.touched, assumable]
            : prev.touched;
        return { ...prev, [key]: value, touched };
      });
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

  // toProfile(state)가 매 렌더마다 새 객체를 만들면, useAffordability의
  // useMemo(() => calcAffordablePrice(...), [profile])가 참조 동등성으로
  // 의존성을 비교하는 한 절대 캐시에 걸리지 않아 매 렌더 재계산된다.
  // state가 실제로 바뀔 때만 새 profile을 만들도록 메모이즈한다.
  const profile = useMemo(() => toProfile(state), [state]);

  return { state, setField, setExistingHomeField, reset, profile };
}
