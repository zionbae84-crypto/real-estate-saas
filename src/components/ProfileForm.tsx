import { useEffect, useState } from "react";
import type {
  ExistingHomeFormState,
  ProfileFormState,
} from "../state/useProfileForm";
import { MoneyInput } from "./MoneyInput";

export interface ProfileFormProps {
  state: ProfileFormState;
  setField: <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => void;
  setExistingHomeField: <K extends keyof ExistingHomeFormState>(
    key: K,
    value: ExistingHomeFormState[K],
  ) => void;
}

export function ProfileForm({
  state,
  setField,
  setExistingHomeField,
}: ProfileFormProps) {
  return (
    <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
      <MoneyInput
        id="cash"
        label="보유 현금"
        value={state.cash}
        onChange={(won) => setField("cash", won)}
        hint="단위를 안 쓰면 만원으로 읽습니다. '3억5000'처럼 써도 됩니다."
      />

      <MoneyInput
        id="income"
        label="연 소득 (세전)"
        value={state.annualIncome}
        onChange={(won) => setField("annualIncome", won)}
      />

      <MoneyInput
        id="debt"
        label="기존 부채 연간 원리금"
        value={state.existingDebtAnnualPayment}
        onChange={(won) => setField("existingDebtAnnualPayment", won)}
        hint="없으면 비워 두세요."
      />

      <div className="field">
        <label htmlFor="status">주택 보유 상황</label>
        <select
          id="status"
          value={state.status}
          onChange={(e) =>
            setField(
              "status",
              e.target.value === "갈아타기" ? "갈아타기" : "무주택",
            )
          }
        >
          <option value="무주택">무주택</option>
          <option value="갈아타기">갈아타기 (기존 주택 매도)</option>
        </select>
      </div>

      {state.status === "갈아타기" && (
        <fieldset className="existing-home">
          <legend>기존 주택</legend>
          <MoneyInput
            id="sale-price"
            label="기존 주택 예상 매도가"
            value={state.existingHome.expectedSalePrice}
            onChange={(won) => setExistingHomeField("expectedSalePrice", won)}
          />
          <MoneyInput
            id="remaining-loan"
            label="상환할 기존 대출"
            value={state.existingHome.remainingLoan}
            onChange={(won) => setExistingHomeField("remainingLoan", won)}
          />
          <MoneyInput
            id="capital-gains-tax"
            label="예상 양도세"
            value={state.existingHome.capitalGainsTax}
            onChange={(won) => setExistingHomeField("capitalGainsTax", won)}
            hint="비워 두면 계산에 반영되지 않고 경고가 표시됩니다."
          />
        </fieldset>
      )}

      <div className="field">
        <label htmlFor="first-time">
          <input
            id="first-time"
            type="checkbox"
            checked={state.isFirstTimeBuyer}
            onChange={(e) => setField("isFirstTimeBuyer", e.target.checked)}
          />
          생애최초 주택 구입
        </label>
      </div>

      <div className="field">
        <label htmlFor="regulated-area">
          <input
            id="regulated-area"
            type="checkbox"
            checked={state.isRegulatedArea}
            onChange={(e) => setField("isRegulatedArea", e.target.checked)}
          />
          규제지역(투기과열지구·조정대상지역)
        </label>
        <p className="hint">
          무주택자 LTV가 규제지역은 40%, 비규제(수도권)는 70%로 갈립니다.
          잘 모르면 켜 둔 채로 계산하세요 — 한도를 과대평가하지 않습니다.
        </p>
      </div>

      <AreaInput
        value={state.exclusiveAreaSqm}
        onChange={(value) => setField("exclusiveAreaSqm", value)}
      />
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
