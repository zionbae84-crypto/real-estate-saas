import { useEffect, useState } from "react";
import { Checkbox } from "seed-design/ui/checkbox";
import type { AssumableField, ProfileFormState } from "../state/useProfileForm";
import { MoneyInput } from "./MoneyInput";

const MONTHS_PER_YEAR = 12;

/**
 * 연간 금액(원) → 월 금액(원). "매달 나가는 대출금"으로 물어 받은 값을
 * 엔진이 원하는 연간 값으로 바꾸는 변환의 반대 방향이다.
 *
 * 한 곳에만 둔다 — 두 군데서 곱하고 나누면 언젠가 한쪽만 고쳐 값을
 * 넣고 다시 열었을 때 12배가 된 숫자를 보게 된다. 반올림해 정수 원
 * 단위를 유지한다(이 프로젝트의 금액은 전부 원 단위 정수다).
 */
function toMonthly(annualWon: number | null): number | null {
  return annualWon === null ? null : Math.round(annualWon / MONTHS_PER_YEAR);
}

/** 월 금액(원) → 연간 금액(원). {@link toMonthly}의 역변환. */
function toAnnual(monthlyWon: number | null): number | null {
  return monthlyWon === null ? null : monthlyWon * MONTHS_PER_YEAR;
}

/**
 * SEED Checkbox의 `onCheckedChange`는 배포판에 따라 `boolean | "indeterminate"`를
 * 줄 수 있다(Radix 계열 `CheckedState` 관례). `checked === true`로 명시적으로
 * 좁힌다 — `"indeterminate"`는 truthy 문자열이라 `!!checked`나 `as boolean`으로
 * 뭉개면 참이 되고, 그러면 규제지역 LTV가 40%에서 70%로 뛰어 한도를 30%p
 * 과대 계상한다. 이 제품이 절대 하면 안 되는 방향이다.
 *
 * (지금 이 프로젝트가 물고 있는 @seed-design/react-checkbox@2.0.1의
 * `onCheckedChange`는 소스 확인 결과 boolean으로만 좁혀 두어 실제로는
 * `"indeterminate"`가 흘러들어오지 않는다. 그래도 파라미터 타입은
 * `boolean | "indeterminate"`로 넓게 받아 두어, 라이브러리가 나중에
 * `CheckedState` 유니온으로 바뀌어도 이 방어선이 조용히 무너지지 않게
 * 한다.)
 */
export function isExplicitlyChecked(
  checked: boolean | "indeterminate",
): boolean {
  return checked === true;
}

/**
 * 리뷰 수정: 이 인터페이스는 예전에 `setExistingHomeField`도 받았다.
 * status(주택 보유 상황)·existingHome(갈아타기 매도 정보) 편집 UI가
 * ProfileForm에서 완전히 빠지면서 그 prop을 어디서도 호출하지 않는
 * 죽은 배선이 됐다. 옛 갈아타기 상태를 화면 없이 조용히 반영하지
 * 않기로 한 결정(useProfileForm.ts의 loadStoredState 주석 참고)에 따라
 * 이 편집 UI는 되살아나지 않으므로 prop 자체를 지웠다 — App.tsx의
 * 호출부도 함께 정리했다.
 */
export interface ProfileFormProps {
  state: ProfileFormState;
  setField: <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => void;
  /**
   * 지금 펼쳐서 편집 중인 가정 항목. 미지정이거나 null이고, 아직 아무
   * 것도 확정하지 않은 사용자라면 첫 화면의 세 항목(보유 현금 · 연 소득 ·
   * 생애최초 여부)만 보인다.
   *
   * 나머지 가정(기존 부채 · 규제지역 · 전용면적)을 눌러서 고치는 흐름은
   * `AssumptionLine`이 결과 영역에서 담당한다 — 이 prop은 그 컴포넌트가
   * 고른 항목을 여기 전달받아 제자리(폼 안)에서 편집 UI를 펼치는
   * 자리다.
   *
   * 리뷰 수정(Critical 1): 각 필드는 `openField === field`이거나 사용자가
   * **이미 그 값을 확정**했을 때 렌더링한다(existingDebt는
   * `existingDebtAnnualPayment !== null`로, regulatedArea·area는
   * `state.touched`로 판단). `openField`는 `App`의 세션 한정
   * `useState`라 저장되지 않는다 — 이 prop만으로 판단하면 사용자가 값을
   * 정하는 순간 `AssumptionLine`에서 그 항목이 빠지면서(가정이 아니게
   * 됐으니 맞다) 동시에 그 항목을 다시 열 유일한 버튼도 함께 사라진다.
   * 그러면 값은 `localStorage`에 남아 엔진을 계속 움직이는데, 새로고침하거나
   * 다른 항목을 열면 화면에서는 그 값을 다시 보거나 고칠 방법이 없어진다.
   */
  openField?: AssumableField | null;
}

export function ProfileForm({
  state,
  setField,
  openField = null,
}: ProfileFormProps) {
  return (
    <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
      <MoneyInput
        id="cash"
        label="보유 현금"
        value={state.cash}
        onChange={(won) => setField("cash", won)}
        hint="단위를 안 쓰면 만원으로 읽어요. '3억5000'처럼 써도 돼요."
      />

      <MoneyInput
        id="income"
        label="연 소득 (세전)"
        value={state.annualIncome}
        onChange={(won) => setField("annualIncome", won)}
      />

      <div className="field">
        <Checkbox
          inputProps={{ id: "first-time" }}
          label="생애최초 주택 구입"
          checked={state.isFirstTimeBuyer}
          onCheckedChange={(checked) =>
            setField("isFirstTimeBuyer", isExplicitlyChecked(checked))
          }
        />
      </div>

      {(openField === "existingDebt" ||
        state.existingDebtAnnualPayment !== null) && (
        <MoneyInput
          id="debt-monthly"
          label="매달 나가는 대출금"
          value={toMonthly(state.existingDebtAnnualPayment)}
          onChange={(monthlyWon) =>
            setField("existingDebtAnnualPayment", toAnnual(monthlyWon))
          }
          hint="대출이 없으면 0을 입력하세요. 비워 두면 이 항목을 다음에 또 물어봐요."
        />
      )}

      {(openField === "regulatedArea" ||
        state.touched.includes("regulatedArea")) && (
        <div className="field">
          <Checkbox
            inputProps={{ id: "regulated-area" }}
            label="규제지역(투기과열지구·조정대상지역)"
            checked={state.isRegulatedArea}
            onCheckedChange={(checked) =>
              setField("isRegulatedArea", isExplicitlyChecked(checked))
            }
          />
          <p className="hint">
            무주택자 LTV가 규제지역은 40%, 비규제(수도권)는 70%로 갈려요.
            잘 모르면 켜 둔 채로 계산하세요 — 한도를 과대평가하지 않아요.
          </p>
        </div>
      )}

      {(openField === "area" || state.touched.includes("area")) && (
        <AreaInput
          value={state.exclusiveAreaSqm}
          onChange={(value) => setField("exclusiveAreaSqm", value)}
        />
      )}
    </form>
  );
}

interface AreaInputProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * 전용면적 입력란. 이전에는 change 핸들러가 파싱 실패("", "0" 등)일 때
 * 그냥 아무 것도 하지 않았다 — value prop이 그대로라 리렌더가 안 일어나고,
 * 그 결과 통제 입력(controlled input)인데도 브라우저가 사용자가 방금
 * 지운 화면 그대로("" 등)를 계속 보여줬다. 실제 계산에 쓰이는 값(농특세
 * 판정 등)과 화면이 어긋나는 상태다.
 *
 * 원본 텍스트를 로컬 상태로 따로 들고, 파싱 가능할 때만 상위 상태를
 * 갱신하며, blur 시점에 여전히 유효하지 않으면 마지막으로 유효했던
 * 값으로 되돌린다 — 입력 중에는 자유롭게 지우고 다시 쓸 수 있으면서도,
 * 입력을 마쳤을 때는 화면과 계산값이 항상 일치한다.
 */
function AreaInput({ value, onChange }: AreaInputProps) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  function handleChange(next: string) {
    setText(next);
    const parsed = Number(next);
    if (next.trim() !== "" && Number.isFinite(parsed) && parsed > 0) {
      onChange(parsed);
    }
  }

  function handleBlur() {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
      setText(String(value));
    }
  }

  return (
    <div className="field">
      <label htmlFor="area">전용면적 (㎡)</label>
      <input
        id="area"
        type="number"
        min={1}
        step={1}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
}
