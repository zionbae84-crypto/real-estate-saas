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

/**
 * 위 매핑의 역방향. `resetField`가 "이 가정 항목의 값이 어느 키인가"를
 * 되찾는 데 쓴다 — 두 방향을 각각 손으로 적으면 언젠가 어긋난다.
 */
const ASSUMABLE_FIELD_KEY: Record<AssumableField, keyof ProfileFormState> = {
  existingDebt: "existingDebtAnnualPayment",
  regulatedArea: "isRegulatedArea",
  area: "exclusiveAreaSqm",
};

export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  existingDebtAnnualPayment: number | null;
  /**
   * 지금 보유한 주택 수(채). **이번에 사려는 집은 세지 않는다.**
   * `0`은 무주택, `1` 이상은 유주택, `null`은 **아직 답하지 않았다**는
   * 뜻이다.
   *
   * **`null`을 0으로 대신 채우지 않는다.** 무주택으로 가정하면 디딤돌·
   * 보금자리론 자격이 모두 열려 정책 한도가 커지고, 그만큼 실구매력이
   * 올라간다 — 사용자가 확인한 적 없는 값으로 "더 빌릴 수 있다"고
   * 답하는 낙관 방향이다. 이 제품이 가장 피해야 하는 오답이라, 답을
   * 듣기 전에는 계산을 시작하지 않는다({@link toProfile}).
   *
   * 반대 방향(모르면 1채로 가정)도 택하지 않았다. 그건 사용자에 대해
   * 사실이 아닌 것을 지어내는 쪽이고, 대부분의 사용자에게 틀린 취득세
   * 경고를 띄워 경고를 닳게 만든다.
   */
  ownedHomeCount: number | null;
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
 * 전용면적 기본값. **농특세 임계값과 같다**(전용 85㎡ 이하) — 국민주택규모
 * 기준으로 가정해 달라는 제품 결정이다.
 *
 * 이전에는 임계값을 **넘는**(86㎡) 쪽을 기본값으로 뒀다 — 농특세가 붙는
 * 쪽으로 가정해야 부대비용을 과소 계상하지 않고, 그래야 "살 수 있는
 * 가격"을 과대평가하지 않기 때문이다(이 제품이 가장 피해야 하는
 * 방향이다). 그 안전마진을 85㎡ 기준으로 낮춘 것은 의도적인 트레이드오프
 * 다 — 사용자가 실제 평형을 아직 넣지 않은 상태에서 보는 헤드라인
 * 숫자(실구매 가능 가격·안전선)가, 실제로 85㎡를 넘는 평형을 고르면
 * 화면에 보이는 값보다 부대비용이 더 붙어 비싸질 수 있다. `ComplexList`의
 * `BasisNote`가 "각 줄은 그 평형의 실제 전용면적으로 계산했다"고 이미
 * 밝히므로 목록 자체는 여전히 정확하지만, 그 위의 헤드라인은 이제
 * 낙관적인 가정 위에 서 있다.
 *
 * 룰셋에서 유도하는 이유는 그대로다: 숫자를 박아 두면 임계값이 바뀌었을
 * 때 방향이 조용히 어긋난다.
 */
const ASSUMED_AREA_SQM = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

export const DEFAULT_FORM_STATE: ProfileFormState = {
  cash: null,
  annualIncome: null,
  // 다른 금액 필드와 마찬가지로 미입력은 null이다. 0을 기본값으로 두면
  // MoneyInput이 "0"을 표시하고, 사용자가 지우려 해도 다시 "0"으로
  // 스냅백해 필드를 비울 방법이 없어진다. 실제 엔진 계산 시에는
  // toProfile이 null을 0으로 바꾼다.
  existingDebtAnnualPayment: null,
  // 미입력이다. 무주택(0)으로 시작하지 않는 이유는 위 필드 주석 참고 —
  // 낙관 방향의 기본값이라 답을 듣기 전에는 계산하지 않는다.
  ownedHomeCount: null,
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

/**
 * 필수값(현금·소득·주택 수)이 모두 채워졌을 때만 BuyerProfile을 만든다.
 *
 * **주택 수가 세 번째 필수값이 됐다.** 현금·소득처럼 값이 없으면 계산
 * 자체를 시작하지 않는다. 미입력을 무주택으로 대신 채우면 정책대출
 * 자격이 넓어져 한도가 커지는데, 그건 사용자가 확인한 적 없는 값으로
 * 낙관적인 답을 내는 것이다({@link ProfileFormState.ownedHomeCount}).
 */
export function toProfile(state: ProfileFormState): BuyerProfile | null {
  if (
    state.cash === null ||
    state.annualIncome === null ||
    state.ownedHomeCount === null
  ) {
    return null;
  }

  const profile: BuyerProfile = {
    status: state.status,
    ownedHomeCount: state.ownedHomeCount,
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

  // touched를 먼저 계산한다 — isRegulatedArea·exclusiveAreaSqm 복원이
  // 이 값에 의존한다(아래 리뷰 수정 Critical 2 참고).
  const touched = parseTouched(o.touched);

  return {
    cash: amount(o.cash),
    annualIncome: amount(o.annualIncome),
    existingDebtAnnualPayment: amount(o.existingDebtAnnualPayment),
    // 주택 수가 없는 저장본(이 필드가 생기기 전의 저장본)은 null로
    // 둔다 — **무주택으로 가정하지 않는다.** 무주택 가정은 디딤돌·
    // 보금자리론 자격을 모두 열어 정책 한도를 키우고 실구매력을
    // 올린다. 사용자가 확인한 적 없는 값으로 "더 빌릴 수 있다"고
    // 답하는 방향이라, 이 저장소가 예전에 겪은 결함(옛 저장본이 손대지
    // 않은 전용면적으로 되살아나 실구매력을 부풀린 것)과 정확히 같은
    // 모양이다. 그래서 다시 묻는다 — 한 번 더 묻는 쪽이 조용히
    // 낙관하는 쪽보다 낫다.
    //
    // touched로 판단하지 않는 이유: 주택 수는 가정할 수 있는 항목이
    // 아니라 필수 답이라 AssumableField가 아니다. 값이 있으면 사용자가
    // 직접 고른 것이고, 없으면 답한 적이 없다.
    ownedHomeCount: wholeCount(o.ownedHomeCount),
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
    // 리뷰 수정(Critical 2): 손대지 않은 필드는 정의상 가정이므로, 반드시
    // "지금" 코드가 정하는 기본값이어야 한다. touched에 없으면 저장된
    // 값이 유효한 타입이어도(boolean·양수) 무시하고 DEFAULT_FORM_STATE를
    // 쓴다 — 그러지 않으면 옛 저장본(예: 전용면적 84, 마이그레이션 전
    // 기본값)이 "가정"이라는 이름표를 달고 되살아나, 사용자가 확인한 적
    // 없는 값이 계산에 쓰이면서 문구는 그 사실을 숨긴다. touched에 있으면
    // (사용자가 실제로 정한 값이면) 기존과 같은 타입 검증을 거쳐 그대로
    // 복원한다.
    isRegulatedArea: touched.includes("regulatedArea")
      ? typeof o.isRegulatedArea === "boolean"
        ? o.isRegulatedArea
        : DEFAULT_FORM_STATE.isRegulatedArea
      : DEFAULT_FORM_STATE.isRegulatedArea,
    exclusiveAreaSqm: touched.includes("area")
      ? (positive(o.exclusiveAreaSqm) ?? DEFAULT_FORM_STATE.exclusiveAreaSqm)
      : DEFAULT_FORM_STATE.exclusiveAreaSqm,
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
    touched,
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

/**
 * 주택 수는 "채" 단위라 0 이상의 정수여야 한다. 소수·음수·문자열은
 * 폼이 만들 수 없는 값이므로 조작된 저장본으로 보고 미입력으로
 * 되돌린다 — 미입력은 다시 묻는 쪽이라 안전한 방향이다.
 */
function wholeCount(value: unknown): number | null {
  const n = amount(value);
  return n !== null && Number.isInteger(n) ? n : null;
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

  /**
   * 가정 항목 하나를 **가정 상태로 되돌린다** — 값을 지금 코드가 정하는
   * 기본값으로 되돌리고, `touched`에서 뺀다.
   *
   * `setField`의 반대 방향이 필요한 자리가 하나 있다: 지역 조회다. 지역
   * X(규제 여부를 아는 지역)를 조회하면 `App.tsx`가 규제지역 값을
   * `setField`로 반영하고, 그 값은 그 순간부터 가정이 아니라 **확인된
   * 사실**이 되어 가정 문구에서 빠진다. 그 뒤 지역 Y(우리가 모르는
   * 지역)를 조회했을 때 값을 그대로 두면, Y의 화면이 X의 값을 X의 확정
   * 지위까지 함께 물려받는다 — 우리가 Y에 대해 아무것도 확인하지 못한
   * 채로 "이 지역은 규제지역입니다"라고 단정하는 것이다. 지금은
   * `nonRegulated` 목록이 비어 있어 보수적인 `true`만 넘어오지만, 그
   * 목록이 채워지는 순간 비규제(LTV 70%) 판정이 규제지역(40%)인 Y로
   * 새어 나가 **한도를 30%p 과대평가**한다.
   *
   * 사용자가 방금 체크박스를 직접 눌렀다가 곧바로 모르는 지역을
   * 조회하는 경우까지 함께 되돌아간다 — 지금 상태 모양으로는 "지역
   * 조회가 정한 값"과 "사용자가 직접 정한 값"을 구분할 수 없다. 드문
   * 순서이고, 되돌아가도 사용자는 다시 누르면 된다. 반대쪽(가정 고지를
   * 잃는 것)은 화면이 확인한 적 없는 것을 사실로 말하게 두는 일이라
   * 훨씬 나쁘다.
   */
  const resetField = useCallback((field: AssumableField) => {
    setState((prev) => {
      const key = ASSUMABLE_FIELD_KEY[field];
      // 이미 가정 상태면 새 객체를 만들지 않는다 — 이 함수를 부르는
      // 자리가 useEffect라, 매번 새 상태를 내면 렌더 루프가 된다.
      if (!prev.touched.includes(field) && prev[key] === DEFAULT_FORM_STATE[key]) {
        return prev;
      }
      return {
        ...prev,
        [key]: DEFAULT_FORM_STATE[key],
        touched: prev.touched.filter((f) => f !== field),
      };
    });
  }, []);

  const reset = useCallback(() => setState(DEFAULT_FORM_STATE), []);

  // toProfile(state)가 매 렌더마다 새 객체를 만들면, useAffordability의
  // useMemo(() => calcAffordablePrice(...), [profile])가 참조 동등성으로
  // 의존성을 비교하는 한 절대 캐시에 걸리지 않아 매 렌더 재계산된다.
  // state가 실제로 바뀔 때만 새 profile을 만들도록 메모이즈한다.
  const profile = useMemo(() => toProfile(state), [state]);

  return { state, setField, resetField, reset, profile };
}
