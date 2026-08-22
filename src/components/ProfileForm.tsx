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
        onChange={(won) => setField("existingDebtAnnualPayment", won ?? 0)}
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
        <label htmlFor="area">전용면적 (㎡)</label>
        <input
          id="area"
          type="number"
          min={1}
          step={1}
          value={state.exclusiveAreaSqm}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) {
              setField("exclusiveAreaSqm", next);
            }
          }}
        />
      </div>
    </form>
  );
}
