import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AREA_BANDS,
  includesAreaAboveThreshold,
  type AreaBand,
} from "../lib/area-band";
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
 * 값 자체가 문장에 들어가므로(예: `ownedHomeCount: 0` → "무주택으로
 * 계산했어요") 값을 바꾸면 문장도 함께 바뀐다. 문장을 하드코딩하지
 * 않는다.
 */
export interface AssumedRemovedInputs {
  /** 생애최초 우대(취득세 감면·정책대출)를 받는 것으로 계산하는가 */
  isFirstTimeBuyer: boolean;
  /** 기존 대출의 연간 상환액(원) */
  existingDebtAnnualPayment: number;
  /** 보유 주택 수(채) */
  ownedHomeCount: number;
}

/*
 * 타입을 `as const`로 좁히지 않는다 — 좁히면 값이 리터럴 타입(`false`·
 * `0`)이 되어, `removedInputNotices`가 **다른 값에서도 옳은 문장을
 * 만드는지** 검증하는 테스트가 타입 수준에서 막힌다. 그 검증이 곧 "문장을
 * 하드코딩하지 않았다"는 증거이므로, 값이 아니라 모양을 고정한다.
 */
export const ASSUMED_REMOVED_INPUTS: AssumedRemovedInputs = {
  isFirstTimeBuyer: false,
  existingDebtAnnualPayment: 0,
  ownedHomeCount: 0,
};

export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  /**
   * 사용자가 고른 평형대(전용면적 구간). 화면 1의 네 번째 질문이다.
   *
   * **기본값은 전체 선택**(= 필터 없음)이다. 빈 배열은 "전체"가 아니라
   * "하나도 고르지 않았다"이고, 그 상태에서는 지역 조회 자체를 시작하지
   * 않는다(`src/lib/area-band.ts`의 `matchesAreaBands` 참고).
   *
   * ⚠ **이 값에서 유도되는 것은 면적 값이 아니라 참/거짓 하나다.**
   * 헤드라인(실구매 가능 가격)은 고른 구간에 **85㎡ 초과가 섞였는가**만
   * 보고 계산한다({@link assumedExclusiveAreaSqm}) — 범위에서 대표값
   * 하나를 뽑는 규칙은 만들지 않는다. 목록의 각 줄과 상세는 지금까지처럼
   * 그 평형의 **실제** 전용면적으로 계산한다.
   */
  areaBands: AreaBand[];
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

/**
 * 고른 평형대에 85㎡ 초과가 섞였을 때 임계값 위로 얼마나 올릴지(㎡).
 *
 * **값 자체에는 뜻이 없다.** 면적이 계산을 가르는 지점은 `> 임계값`
 * 하나뿐이라(농특세 — `finance/acquisition-cost.ts`, 정책대출 면적 제한 —
 * `finance/policy-loans.ts`) 임계값을 넘기기만 하면 어떤 값을 써도 결과가
 * 같다. `useProfileForm.test.ts`의 "임계값 위에서는 어떤 값을 넣어도
 * 결과가 같다"가 그 사실을 증거로 만든다 — 언젠가 면적이 계산을 가르는
 * 지점이 하나 더 생기면 그 테스트가 먼저 깨진다.
 *
 * 그래서 이 숫자는 화면에도 종이에도 나오지 않는다. `AssumptionLine`과
 * `PrintSummary`는 "85㎡ 초과 기준"이라고 **전제**를 적는다.
 */
const ABOVE_THRESHOLD_MARGIN_SQM = 1;

/**
 * 헤드라인(실구매 가능 가격·안전선)을 계산할 전용면적을 **고른
 * 평형대에서** 유도한다.
 *
 * ⚠ **범위에서 대표값 하나를 지어내지 않는다.** 넘어가는 정보는 "고른
 * 구간에 85㎡ 초과가 섞였는가"라는 참/거짓 하나이고
 * (`includesAreaAboveThreshold`), 그것이 면적이 계산을 실제로 가르는
 * 유일한 지점이다. 대표값을 뽑는 규칙을 만들면 그 규칙이 화면 어디에도
 * 적히지 않은 채 헤드라인을 움직인다 — 한 축의 답이 다른 축의 기본값으로
 * 흡수되는, 이 저장소가 여섯 번 반복한 사고의 모양이다.
 *
 * - **섞였으면** 임계값 위로 잡는다: 농특세가 붙고 정책대출 면적 제한이
 *   걸린다. **보수적인 쪽**이다(살 수 있는 가격을 과대평가하지 않는다).
 * - **안 섞였으면** 임계값을 쓴다. 이때는 가정이 아니라 **사실**이다 —
 *   고른 구간이 전부 임계값 이하이므로 목록의 어느 줄도 농특세가 붙지
 *   않는다. 그래서 `AssumptionLine`도 `ComplexList`의 기준 안내도 그
 *   경우에는 아무 말을 하지 않는다.
 *
 * 예전에는 이 값이 **선택과 무관한 폼 상태**였다(항상 85㎡). 그때는
 * 85㎡ 초과만 고른 사용자에게 헤드라인이 낙관적으로 틀렸고(농특세가
 * 빠지고 정책대출 면적 제한이 안 걸렸다), 목록 위 문구가 그 사실을
 * 해명하고 있었다.
 *
 * 임계값을 인자로 받는 이유는 그대로다: 숫자를 박아 두면 룰셋이 바뀐 날
 * 방향이 조용히 어긋난다.
 */
export function assumedExclusiveAreaSqm(
  bands: readonly AreaBand[],
  ruralTaxAreaThresholdSqm: number = rules.acquisitionTax
    .ruralTaxAreaThresholdSqm,
): number {
  return includesAreaAboveThreshold(bands, ruralTaxAreaThresholdSqm)
    ? ruralTaxAreaThresholdSqm + ABOVE_THRESHOLD_MARGIN_SQM
    : ruralTaxAreaThresholdSqm;
}

export const DEFAULT_FORM_STATE: ProfileFormState = {
  cash: null,
  annualIncome: null,
  // 기본값은 전체 선택 = 필터 없음. 처음 온 사용자는 네 번째 질문에
  // 이미 답한 상태로 시작한다(스펙 §4).
  areaBands: [...AREA_BANDS],
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
 * 현금·연 소득이 모두 채워졌을 때만 BuyerProfile을 만든다.
 *
 * **평형대는 이 조건에 없다.** 평형대는 "무엇을 보여줄까"를 정하는
 * 축이고, 여기서 만드는 것은 "얼마를 빌릴 수 있고 얼마짜리를 살 수
 * 있는가"다 — 두 축을 한 조건에 묶으면, 평형대를 비운 사용자에게 화면이
 * "예산을 계산할 수 없다"고 **원인을 틀리게** 말하게 된다. 이 저장소가
 * 여섯 번 반복한 사고의 모양이다. 평형대가 비었다는 사실은 화면 1이
 * 따로, 자기 문장으로 말한다(App.tsx).
 *
 * 없앤 입력 셋(생애최초·기존 대출·주택 수)은 폼 상태가 아니라
 * {@link ASSUMED_REMOVED_INPUTS}에서 온다 — 값이 한 곳에만 있어야
 * `AssumptionLine`이 적는 문장과 실제 계산이 어긋날 수 없다.
 */
export function toProfile(state: ProfileFormState): BuyerProfile | null {
  if (state.cash === null || state.annualIncome === null) return null;

  const profile: BuyerProfile = {
    status: state.status,
    cash: state.cash,
    annualIncome: state.annualIncome,
    isRegulatedArea: state.isRegulatedArea,
    // 폼 상태에 면적은 없다 — 고른 평형대에서 유도한다(위 주석 참고).
    exclusiveAreaSqm: assumedExclusiveAreaSqm(state.areaBands),
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
 * ⚠ **없앤 입력들의 저장값은 읽지 않는다 — 통째로 버린다.**
 * `isFirstTimeBuyer`·`existingDebtAnnualPayment`·`ownedHomeCount`·
 * `exclusiveAreaSqm`은 이제
 * 화면에 입력란이 없다. 저장본에 남은 값을 되살리면 사용자가 **보지도
 * 고치지도 못하는 값**이 계산을 움직이게 되고, 그건 이 저장소가 이미
 * 겪은 결함(커밋 `c90babf` — 저장된 값 때문에 빠져나올 수 없는 화면)과
 * 같은 모양이다.
 *
 * 버리는 방향의 대가는 분명히 있다: 예전에 "유주택 2채"라고 답했던
 * 사용자는 이제 무주택으로 계산돼 한도가 **올라간다**(낙관 방향). 그
 * 값을 되살릴 화면이 없는 이상 피할 수 없는 대가라, 대신
 * `AssumptionLine`이 "무주택으로 계산했어요"를 **언제나** 적는다 —
 * 조용히 깔리는 기본값은 하나도 없다.
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
    areaBands: parseAreaBands(o.areaBands),
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
    // 수 있다. `parseTouched`가 지금 존재하는 항목만 남기므로 조용히
    // 걸러진다.
    touched,
  };
}

function parseTouched(value: unknown): AssumableField[] {
  if (!Array.isArray(value)) return [];
  return ALL_ASSUMABLE_FIELDS.filter((field) => value.includes(field));
}

/**
 * 저장된 평형대 선택을 복원한다.
 *
 * 배열이 아니면(옛 저장본에는 이 키가 아예 없다) **전체 선택**으로
 * 되돌린다 — 필터를 걸지 않는 쪽이라 결과를 좁히지 않는다.
 *
 * ⚠ **모르는 값이 하나라도 섞여 있으면 아는 값만 남기지 않고 통째로
 * 버린다.** 구간이 넷에서 셋으로 바뀌면서 옛 이름("중형"·"대형")이
 * 저장본에 남은 사용자가 있다. 아는 값만 남기면 "중형·대형"(옛 뜻으로
 * 85㎡ 초과 전부)을 고른 사용자가 빈 선택으로 떨어지고, 화면은 그
 * 사실을 말하지 않는다 — 저장된 값이 사용자가 고른 적 없는 조건을
 * 만드는, 이 저장소가 이미 겪은 결함(커밋 `c90babf`)과 같은 모양이다.
 * 옛 이름을 새 구간으로 **번역**하지도 않는다: 옛 "중형"은 85~102㎡였고
 * 새 구간에 같은 뜻의 자리가 없어, 무엇으로 옮기든 사용자가 고른 적
 * 없는 조건이 된다.
 *
 * 전체 선택으로 되돌리는 것은 **결과를 좁히지 않는** 방향이고, 그 상태는
 * 화면 1의 칩에 그대로 보인다 — 사용자가 곧바로 다시 좁힐 수 있다.
 *
 * 빈 배열은 그대로 둔다. 그건 "하나도 고르지 않았다"는 정당한 상태다
 * (화면 1이 그 사실을 말하고, 칩을 하나 누르면 곧바로 빠져나온다).
 *
 * 순서는 저장본이 아니라 {@link AREA_BANDS}가 정한다 — 화면에 그리는
 * 순서와 종이에 적는 순서가 저장 순서에 좌우되지 않게 한다.
 */
function parseAreaBands(value: unknown): AreaBand[] {
  if (!Array.isArray(value)) return [...DEFAULT_FORM_STATE.areaBands];
  const known = (band: unknown): band is AreaBand =>
    AREA_BANDS.includes(band as AreaBand);
  if (!value.every(known)) return [...DEFAULT_FORM_STATE.areaBands];
  return AREA_BANDS.filter((band) => value.includes(band));
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
   * 못한 채로 "이 지역은 규제지역입니다"라고 단정하는 것이다. 지금은
   * `nonRegulated` 목록이 비어 있어 보수적인 `true`만 넘어오지만, 그
   * 목록이 채워지는 순간 비규제(LTV 70%) 판정이 규제지역(40%)인 Y로
   * 새어 나가 **한도를 30%p 과대평가**한다.
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
