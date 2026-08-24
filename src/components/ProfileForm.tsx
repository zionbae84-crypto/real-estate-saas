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
  /**
   * 지금 화면이 특정 평형의 상세를 보여주고 있어, 그 평형의 실제
   * 전용면적으로 계산 중인가(App.tsx의 `effectiveProfile`).
   *
   * 참이면 전용면적 입력란을 **내보내지 않는다.** 상세가 열려 있는
   * 동안에는 화면 계산이 그 평형의 면적을 쓰므로, 입력란에 값을 넣어도
   * 화면이 꿈쩍하지 않는다 — 입력이 조용히 무시되는 상태다. 무시할
   * 거라면 물어보지 않는 편이 정직하다. `AssumptionLine`이 같은
   * 이유로 전용면적 가정 문구를 빼는 것과 짝을 이룬다. 상세를 닫으면
   * 이 플래그가 꺼지고 입력란도 원래 조건대로 돌아온다.
   */
  areaOverridden?: boolean;
}

export function ProfileForm({
  state,
  setField,
  openField = null,
  areaOverridden = false,
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

      <OwnedHomeField
        value={state.ownedHomeCount}
        onChange={(count) => setField("ownedHomeCount", count)}
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

      {!areaOverridden &&
        (openField === "area" || state.touched.includes("area")) && (
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

interface OwnedHomeFieldProps {
  /** 보유 주택 수(채). `null`이면 아직 답하지 않았다 */
  value: number | null;
  onChange: (count: number | null) => void;
}

/**
 * 주택 수를 묻는다 — 먼저 무주택/유주택을 고르고, 유주택이면 몇 채인지
 * 적는다.
 *
 * **미리 골라 두지 않는다.** 무주택을 기본 선택으로 두면 아무것도
 * 고르지 않은 사람이 무주택으로 계산되는데, 그건 디딤돌·보금자리론
 * 자격을 모두 열어 한도를 키우는 낙관 방향이다. 이 폼의 다른 기본값
 * (규제지역 켬 · 농특세가 붙는 면적)이 전부 과대평가를 피하는 쪽으로
 * 놓인 것과 같은 판단이고, 주택 수는 그 "안전한 쪽"이 사실을 지어내는
 * 것이 되므로(당신은 집이 있다) 아예 답을 받는다.
 *
 * 유주택을 고르면 1채로 시작한다. 유주택이라고 답한 사람이 가질 수
 * 있는 가장 작은 수이고, 여기서 늘리는 방향은 자격이 좁아지는 쪽이라
 * 시작값이 한도를 부풀리지 않는다.
 *
 * **라디오 두 개 + 숫자 하나**로 나눈 이유: "0채"를 숫자 입력으로만
 * 받으면 빈 칸과 0채가 화면에서 구분되지 않는다. 무주택은 이 계산에서
 * 자격이 가장 넓어지는 답이라, 고른 적 없는 사람이 그 답을 얻는 경로를
 * 만들면 안 된다.
 *
 * 색으로 뜻을 전달하지 않는다 — 어느 쪽을 골랐는지는 라디오와 글자가
 * 말하고, 아래 힌트가 무엇이 달라지는지 문장으로 적는다.
 */
function OwnedHomeField({ value, onChange }: OwnedHomeFieldProps) {
  const hasHome = value !== null && value > 0;

  return (
    <fieldset className="field owned-home-field">
      <legend>지금 집이 몇 채 있나요?</legend>
      <p className="hint">
        이번에 사려는 집은 빼고 세어 주세요. 주택 수에 따라 받을 수 있는
        정책대출이 달라져요 — 디딤돌은 무주택만, 보금자리론은 1주택까지
        받을 수 있어요.
      </p>
      <div className="owned-home-options">
        <label className="owned-home-option">
          <input
            type="radio"
            name="owned-home"
            value="none"
            checked={value === 0}
            onChange={() => onChange(0)}
          />
          <span>무주택</span>
        </label>
        <label className="owned-home-option">
          <input
            type="radio"
            name="owned-home"
            value="some"
            checked={hasHome}
            // 유주택으로 넘어올 때는 1채로 시작한다. 이미 유주택이면
            // 사용자가 적어 둔 수를 그대로 둔다.
            onChange={() => onChange(hasHome ? value : 1)}
          />
          <span>유주택</span>
        </label>
      </div>

      {hasHome && (
        <HomeCountInput value={value} onChange={(next) => onChange(next)} />
      )}
    </fieldset>
  );
}

interface HomeCountInputProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * 보유 주택 수 입력란. `AreaInput`과 같은 방식이다 — 원본 텍스트를
 * 로컬 상태로 들고, 읽을 수 있는 값일 때만 상위 상태를 갱신하며,
 * 포커스를 잃는 순간 여전히 읽을 수 없으면 마지막으로 유효했던 값으로
 * 되돌린다. 입력 중에는 지웠다 다시 쓸 수 있으면서, 입력을 마쳤을 때는
 * 화면과 계산값이 항상 일치한다.
 *
 * 1채 미만·소수는 받지 않는다 — 여기까지 온 사용자는 이미 유주택을
 * 골랐고, 0채는 위 라디오가 담당한다.
 */
function HomeCountInput({ value, onChange }: HomeCountInputProps) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  function parse(raw: string): number | null {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isInteger(parsed) || parsed < 1) {
      return null;
    }
    return parsed;
  }

  return (
    <div className="field owned-home-count">
      <label htmlFor="owned-home-count">갖고 있는 주택 수 (채)</label>
      <input
        id="owned-home-count"
        type="number"
        min={1}
        step={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parse(e.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        onBlur={() => {
          if (parse(text) === null) setText(String(value));
        }}
      />
    </div>
  );
}
