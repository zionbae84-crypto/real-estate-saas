import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuyerProfile, HouseholdStatus } from "../lib/finance";
import { rules } from "./useAffordability";

export const STORAGE_KEY = "budget-profile-v1";

export interface ExistingHomeFormState {
  expectedSalePrice: number | null;
  remainingLoan: number | null;
  capitalGainsTax: number | null;
}

/**
 * 사용자가 직접 값을 정한 항목. 여기 없으면 기본값(=가정)으로 계산 중이다.
 *
 * **하나만 남았다.** 예전에는 기존 부채·규제지역·전용면적 셋이었고, 셋
 * 다 `AssumptionLine`의 칩을 눌러 폼에서 고칠 수 있었다. 입력 화면이 네
 * 질문으로 줄면서 기존 부채와 전용면적 입력란이 사라졌으므로 그 둘은
 * 이제 **고칠 수 없는 가정**이다 — 고칠 수 없는 것을 "손댔는지" 기록해
 * 봐야 아무 데도 쓰이지 않고, 누를 곳 없는 칩만 남는다.
 *
 * 규제지역이 남는 이유는 사용자가 아니라 **지역 조회**가 이 값을 정하기
 * 때문이다. 조회가 규제 여부를 알려주면 그 값은 가정이 아니라 확인된
 * 사실이 되고, `AssumptionLine`의 문구가 "가정했어요"에서 "판정했어요"로
 * 갈린다. 그 구분이 없으면 우리가 확인하지 못한 지역에 대해서도 화면이
 * 단정하게 된다.
 */
export type AssumableField = "regulatedArea";

const ALL_ASSUMABLE_FIELDS: readonly AssumableField[] = ["regulatedArea"];

/** setField가 건드린 키를 어느 AssumableField로 기록할지 매핑한다 */
const ASSUMABLE_KEY_MAP: Partial<Record<keyof ProfileFormState, AssumableField>> =
  {
    isRegulatedArea: "regulatedArea",
  };

/**
 * 위 매핑의 역방향. `resetField`가 "이 가정 항목의 값이 어느 키인가"를
 * 되찾는 데 쓴다 — 두 방향을 각각 손으로 적으면 언젠가 어긋난다.
 */
const ASSUMABLE_FIELD_KEY: Record<AssumableField, keyof ProfileFormState> = {
  regulatedArea: "isRegulatedArea",
};

/**
 * `touched`의 각 항목이 **새 세션에서도 여전히 참인가**.
 *
 * - `"restorable"` — 사용자가 화면에서 직접 정했고, 마운트 뒤에도 그
 *   입력란이 화면에 남아 있어 값도 지위도 눈으로 확인·수정할 수 있다.
 * - `"session"` — 그 지위가 **이번 세션에만 존재하는 것에 매여 있다.**
 *   복원하면 근거가 사라진 채 결론만 살아남는다.
 *
 * ⚠ **`regulatedArea`가 `"session"`인 이유.** 이 값을 정하는 것은
 * 사용자가 아니라 **지역 조회**이고(`App.tsx`의 useEffect), 조회한
 * 지역은 저장되지 않는다 — 새로 뜬 화면에는 지역이 없다. 그런데도
 * `touched`를 복원하면 화면과 종이가 "고른 지역은 규제지역으로
 * 판정했어요"라고 **단정**하면서, 정작 그 지역의 이름은 대지 못한다.
 * 확인할 체크박스도 이제 화면에 없다(그 입력란은 이번 라운드에
 * 사라졌다). 저장된 값이 `false`(비규제)면 방향까지 나쁘다 — LTV가
 * 40%가 아니라 70%로 잡혀 헤드라인이 부풀려진다.
 *
 * 복원하지 않으면 `isRegulatedArea`도 함께 기본값으로 돌아가고(아래
 * `loadStoredState`), 화면은 "확인하지 못해 …로 보고 계산했어요"라는
 * **가정 문구**로 시작한다. 지역을 다시 조회하는 순간 판정이 돌아온다.
 *
 * `Record`라 항목을 늘리면 여기에 답을 적지 않는 한 타입이 통과하지
 * 않는다 — "이 지위가 새 세션에서도 참인가"를 빠뜨릴 자리가 없다.
 */
const ASSUMABLE_FIELD_SCOPE: Record<
  AssumableField,
  "restorable" | "session"
> = {
  regulatedArea: "session",
};

/**
 * 화면에서 **없앤 입력들이 계산에 넘기는 값**.
 *
 * ⚠ **이 값들은 "모른다"가 아니라 "이렇게 가정했다"이다.** 그 차이가
 * 화면에 보여야 한다 — 이 저장소는 "한 축의 모름이 다른 축의 기본값으로
 * 흡수되는" 버그를 여섯 번 반복했고, 조용히 깔린 기본값이 그 사고의
 * 시작점이었다.
 *
 * 그래서 이 객체는 **`AssumptionLine`이 문장을 만드는 원본이기도 하다**
 * (`removedInputNotices`). 그쪽 함수의 반환 타입이 이 객체의 키 전체를
 * 요구하는 `Record`라, 여기 항목을 하나 더 넣으면 **문장을 쓰지 않는 한
 * 타입이 통과하지 않는다.** 가정을 늘리면서 고지를 빠뜨릴 자리가
 * 구조적으로 없다.
 *
 * 값 자체가 문장에 들어가므로 값을 바꾸면 문장도 함께 바뀐다. 문장을
 * 하드코딩하지 않는다.
 *
 * ⚠ **원래 셋이었다 — 생애최초·기존 대출·주택 수.** 사용자 지시로
 * 생애최초와 주택 수는 다시 화면 1의 실제 질문이 됐다(대출·취득세
 * 계산에 직접 반영해야 한다는 요청). 그래서 이제 이 객체에는
 * `existingDebtAnnualPayment` 하나만 남는다 — 나머지 둘은
 * `ProfileFormState.isFirstTimeBuyer`·`ownedHomeCount`에서 직접 온다
 * (`toProfile` 참고). 기존 대출만 남은 이유는 그대로다: 매달 갚는
 * 원리금까지 물어보면 질문이 다시 늘어난다는 판단이 바뀌지 않았다.
 */
export interface AssumedRemovedInputs {
  /** 기존 대출의 연간 상환액(원) */
  existingDebtAnnualPayment: number;
}

/*
 * 타입을 `as const`로 좁히지 않는다 — 좁히면 값이 리터럴 타입(`0`)이
 * 되어, `removedInputNotices`가 **다른 값에서도 옳은 문장을 만드는지**
 * 검증하는 테스트가 타입 수준에서 막힌다. 그 검증이 곧 "문장을
 * 하드코딩하지 않았다"는 증거이므로, 값이 아니라 모양을 고정한다.
 */
export const ASSUMED_REMOVED_INPUTS: AssumedRemovedInputs = {
  existingDebtAnnualPayment: 0,
};

export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  /**
   * 보유 주택 수(채). **이번에 사려는 집은 세지 않는다.**
   *
   * `null`은 "아직 답하지 않았다"는 뜻이다 — 미답변을 0(무주택)으로
   * 조용히 채우면 정책대출 자격이 넓어져 한도가 실제보다 커진다(사용자가
   * 확인한 적 없는 값으로 낙관적인 답을 내는 셈이다). 그래서 `cash`·
   * `annualIncome`과 같은 자리에 선다 — 답하기 전에는 `toProfile`이
   * `null`을 돌려주고, 화면은 계산 자체를 하지 않는다.
   *
   * 지금 화면은 "무주택"과 "집이 있어요" 둘만 물어 정확한 채수는 묻지
   * 않는다 — 정책대출 자격(`maxOwnedHomes`)이 0/1만 가르므로 1로도
   * 충분하다. 값 자체는 그대로 원 단위 정책대출 계산에 들어가므로
   * `BuyerProfile.ownedHomeCount`와 뜻이 같다.
   */
  ownedHomeCount: number | null;
  /**
   * 생애최초 주택 구입 여부. LTV 우대(규제지역 70%)·취득세 감면·정책대출
   * 자격에 쓰인다.
   *
   * 기본값 `false`는 안전한 방향이다 — 우대를 빼고 계산하므로 실제
   * 생애최초 구매자에게는 살 수 있는 가격이 이보다 **올라간다**. 그래서
   * `ownedHomeCount`와 달리 답하기 전에 계산을 막지 않는다.
   */
  isFirstTimeBuyer: boolean;
  status: HouseholdStatus;
  isRegulatedArea: boolean;
  existingHome: ExistingHomeFormState;
  /**
   * 사용자가 명시적으로 정한 항목들.
   *
   * 값만 봐서는 가정인지 확인된 사실인지 알 수 없다 — isRegulatedArea가
   * true인 것이 "기본값 그대로"인지 "지역 조회가 규제지역이라고 답했다"인지
   * 구분되지 않는다. 가정 문구는 그 구분 위에 서 있으므로 따로 기록한다.
   */
  touched: AssumableField[];
}

export const DEFAULT_FORM_STATE: ProfileFormState = {
  cash: null,
  annualIncome: null,
  // cash·annualIncome과 같은 이유로 null이다 — 답하기 전까지는 계산
  // 자체를 하지 않는다(ProfileFormState.ownedHomeCount 주석 참고).
  ownedHomeCount: null,
  // 안전한 기본값(우대 없음)이라 답하지 않아도 계산을 막지 않는다.
  isFirstTimeBuyer: false,
  status: "무주택",
  // 켜두면 LTV·정책대출 자격을 과대평가하는 방향이므로 꺼진 쪽이 안전하다.
  // 규제지역 무주택자 LTV는 40%, 비규제(수도권)는 70%다. 잘못 꺼두면
  // 한도를 30%p 과대평가하게 되므로, 모르면 규제지역(true)으로 두는 쪽이
  // 안전하다 — 이 제품은 항상 과대평가를 피하는 쪽을 기본값으로 삼는다.
  // 지역 조회가 규제 여부를 알려주면 그 값으로 덮인다(App.tsx).
  isRegulatedArea: true,
  existingHome: {
    expectedSalePrice: null,
    remainingLoan: null,
    capitalGainsTax: null,
  },
  touched: [],
};

/**
 * 현금·연 소득·주택 수가 모두 채워졌을 때만 BuyerProfile을 만든다.
 *
 * **주택 수는 현금·소득과 같은 자리에 있다.** 미답변을 0(무주택)으로
 * 채우면 정책대출 자격이 넓어져 한도가 커지는데, 그건 사용자가 확인한
 * 적 없는 값으로 낙관적인 답을 내는 것이다(`ProfileFormState.ownedHomeCount`
 * 주석 참고) — 그래서 이 값도 없으면 계산 자체를 하지 않는다.
 *
 * 생애최초 여부는 `state.isFirstTimeBuyer`에서 직접 온다 — 기본값
 * `false`가 안전한 방향이라 답을 막지 않는다. 남은 가정 하나(기존 대출)만
 * {@link ASSUMED_REMOVED_INPUTS}에서 온다 — 값이 한 곳에만 있어야
 * `AssumptionLine`이 적는 문장과 실제 계산이 어긋날 수 없다.
 *
 * **`exclusiveAreaSqm`은 언제나 룰셋의 `ruralTaxAreaThresholdSqm`(85㎡)이다.**
 * 예전에는 화면 1에서 고른 평형대에 따라 이 값이 갈렸지만, 사용자
 * 지시로 그 질문 자체가 사라졌다 — 이제 헤드라인(실구매 가능 가격)은
 * 항상 "85㎡ 이하라면"을 전제로 계산하고, 85㎡를 넘는 매물의 농특세·
 * 정책대출 제한은 목록·상세가 그 매물의 **실제** 면적으로 다시 계산해
 * 알린다(`ComplexList.tsx`·`ComplexDetail.tsx`). 숫자를 박아 두지 않고
 * 룰셋에서 읽는 이유는 그대로다: 룰셋이 바뀐 날 이 값과 취득세 계산이
 * 조용히 어긋나지 않게 하려는 것이다.
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
    cash: state.cash,
    annualIncome: state.annualIncome,
    isRegulatedArea: state.isRegulatedArea,
    ownedHomeCount: state.ownedHomeCount,
    isFirstTimeBuyer: state.isFirstTimeBuyer,
    exclusiveAreaSqm: rules.acquisitionTax.ruralTaxAreaThresholdSqm,
    ...ASSUMED_REMOVED_INPUTS,
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
 *
 * ⚠ **여전히 입력란이 없는 값(`existingDebtAnnualPayment`·
 * `exclusiveAreaSqm`)의 저장값은 읽지 않는다 — 통째로 버린다.** 저장본에
 * 남은 값을 되살리면 사용자가 **보지도 고치지도 못하는 값**이 계산을
 * 움직이게 되고, 그건 이 저장소가 이미 겪은 결함(커밋 `c90babf` — 저장된
 * 값 때문에 빠져나올 수 없는 화면)과 같은 모양이다.
 *
 * `ownedHomeCount`·`isFirstTimeBuyer`는 **다시 화면에 입력란이 생겨서**
 * (사용자 지시) 이 규칙에서 빠졌다 — `cash`·`annualIncome`과 같은
 * 자리에 서서 그대로 복원된다. 값도 지위(=답했는지)도 화면에서 보고
 * 고칠 수 있으므로 되살려도 위 결함이 재현되지 않는다.
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

  // touched를 먼저 계산한다 — isRegulatedArea 복원이 이 값에 의존한다.
  const touched = parseTouched(o.touched);

  return {
    cash: amount(o.cash),
    annualIncome: amount(o.annualIncome),
    // cash·annualIncome과 같은 취급이다 — 이제 화면에 실제 입력란이
    // 있으므로(없앤 입력이 아니다) 저장값을 되살린다. 형태가 어긋나면
    // null로 떨어져 "아직 답하지 않음"이 되고, toProfile이 계산을 막는다.
    ownedHomeCount: ownedHomeCount(o.ownedHomeCount),
    isFirstTimeBuyer:
      typeof o.isFirstTimeBuyer === "boolean"
        ? o.isFirstTimeBuyer
        : DEFAULT_FORM_STATE.isFirstTimeBuyer,
    // "갈아타기" 상태는 저장본에 남아 있어도 항상 "무주택"으로 되돌린다.
    // ProfileForm은 status/기존 주택(existingHome) 편집 UI를 전혀
    // 렌더링하지 않는다 — 사용자가 이 값을 보거나 고칠 방법이 없다.
    // 그런데도 그대로 복원해 반영하면 calcAvailableCash가 매도 순자산을
    // 현금에 더해, 사용자가 보지도 고치지도 못한 채로 구매력이 조용히
    // 올라간다.
    //
    // existingHome 필드값 자체는 지우지 않고 아래에서 그대로 보존한다 —
    // `AssumptionLine`이 이 보존된 값을 보고 "갈아타기 정보가 있지만
    // 반영되지 않았다"는 사실을 알림 문구로 드러낸다.
    status: DEFAULT_FORM_STATE.status,
    // 손대지 않은 필드는 정의상 가정이므로, 반드시 "지금" 코드가 정하는
    // 기본값이어야 한다. touched에 없으면 저장된 값이 유효한 타입이어도
    // 무시하고 DEFAULT_FORM_STATE를 쓴다 — 그러지 않으면 옛 저장본이
    // "가정"이라는 이름표를 달고 되살아나, 사용자가 확인한 적 없는 값이
    // 계산에 쓰이면서 문구는 그 사실을 숨긴다.
    //
    // 지금은 `regulatedArea`가 `"session"`이라(`ASSUMABLE_FIELD_SCOPE`)
    // 이 조건이 참이 되는 저장본이 없다. 그래도 조건을 지운 자리에
    // 기본값을 박아 두지는 않는다 — "손대지 않은 값은 기본값"이라는
    // 규칙은 항목의 scope와 무관하게 옳고, 규칙을 한 곳(scope 표)에만
    // 두어야 다음 항목이 늘 때 두 자리가 어긋나지 않는다.
    isRegulatedArea: touched.includes("regulatedArea")
      ? typeof o.isRegulatedArea === "boolean"
        ? o.isRegulatedArea
        : DEFAULT_FORM_STATE.isRegulatedArea
      : DEFAULT_FORM_STATE.isRegulatedArea,
    existingHome: {
      expectedSalePrice: amount(home.expectedSalePrice),
      remainingLoan: amount(home.remainingLoan),
      capitalGainsTax: amount(home.capitalGainsTax),
    },
    // 옛 저장본에는 없어진 항목(existingDebt·area)이 touched에 남아 있을
    // 수 있다. `parseTouched`가 지금 존재하는 항목만, 그중에서도 새
    // 세션에서 여전히 참인 항목만 남기므로 조용히 걸러진다
    // (`ASSUMABLE_FIELD_SCOPE`).
    touched,
  };
}

/**
 * 저장본의 `touched`를 이번 세션의 것으로 복원한다.
 *
 * ⚠ **세션에 매인 항목은 복원하지 않는다**(`ASSUMABLE_FIELD_SCOPE`).
 * `touched`는 값이 아니라 **"이 값이 확인된 사실인가"라는 지위**를
 * 나르고, 그 지위가 이번 세션에 존재하지 않는 것(불러온 지역)에
 * 매여 있으면 복원하는 순간 근거 없는 단정이 된다.
 */
function parseTouched(value: unknown): AssumableField[] {
  if (!Array.isArray(value)) return [];
  return ALL_ASSUMABLE_FIELDS.filter(
    (field) =>
      ASSUMABLE_FIELD_SCOPE[field] === "restorable" && value.includes(field),
  );
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
 * 저장된 보유 주택 수를 복원한다. `amount()`와 달리 원 단위 금액이
 * 아니라 채수라 상한을 훨씬 낮게 잡는다 — 조작된 값(예: 1e300)이 그대로
 * `BuyerProfile.ownedHomeCount`로 흘러가 정책대출 자격 판정에서 이상한
 * 비교를 만들 이유가 없다.
 */
function ownedHomeCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 50
    ? value
    : null;
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
        const touched =
          assumable && !prev.touched.includes(assumable)
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
   * 쓰이는 자리는 하나다: 지역 조회. 지역 X(규제 여부를 아는 지역)를
   * 조회하면 `App.tsx`가 규제지역 값을 `setField`로 반영하고, 그 값은 그
   * 순간부터 가정이 아니라 **확인된 사실**이 된다. 그 뒤 지역 Y(우리가
   * 모르는 지역)를 조회했을 때 값을 그대로 두면, Y의 화면이 X의 값을 X의
   * 확정 지위까지 함께 물려받는다 — 우리가 Y에 대해 아무것도 확인하지
   * 못한 채로 "이 지역은 규제지역입니다"라고 단정하는 것이다.
   * (`resolveIsRegulated`가 이제 항상 boolean을 내므로 실제로는 X 다음
   * "모르는 지역"이 없다 — 이 함수는 조회 실패 같은 방어적 경로를
   * 위해 남아 있다.)
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
