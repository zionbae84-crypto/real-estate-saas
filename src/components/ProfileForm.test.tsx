import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FORM_STATE,
  type AssumableField,
  type ExistingHomeFormState,
  type ProfileFormState,
} from "../state/useProfileForm";
import { rules } from "../state/useAffordability";
import { isExplicitlyChecked, ProfileForm } from "./ProfileForm";

/**
 * 실제 useProfileForm 훅과 같은 모양의 setField/setExistingHomeField를
 * 로컬 state로 재현한다. ProfileForm은 이 두 콜백의 구현을 모르므로,
 * 훅 전체를 마운트하지 않고도 실제와 같은 상태 갱신 흐름을 검증할 수 있다.
 */
function renderForm(
  overrides: {
    initial?: Partial<ProfileFormState>;
    openField?: AssumableField | null;
    onFirstTimeBuyerChange?: (value: boolean) => void;
    onExistingDebtChange?: (value: number | null) => void;
  } = {},
) {
  function Harness() {
    const [state, setState] = useState<ProfileFormState>({
      ...DEFAULT_FORM_STATE,
      ...overrides.initial,
    });

    function setField<K extends keyof ProfileFormState>(
      key: K,
      value: ProfileFormState[K],
    ) {
      setState((prev) => ({ ...prev, [key]: value }));
      if (key === "isFirstTimeBuyer") {
        overrides.onFirstTimeBuyerChange?.(value as boolean);
      }
      if (key === "existingDebtAnnualPayment") {
        overrides.onExistingDebtChange?.(value as number | null);
      }
    }

    function setExistingHomeField<K extends keyof ExistingHomeFormState>(
      key: K,
      value: ExistingHomeFormState[K],
    ) {
      setState((prev) => ({
        ...prev,
        existingHome: { ...prev.existingHome, [key]: value },
      }));
    }

    return (
      <ProfileForm
        state={state}
        setField={setField}
        setExistingHomeField={setExistingHomeField}
        openField={overrides.openField ?? null}
      />
    );
  }

  render(<Harness />);
}

describe("ProfileForm", () => {
  it("보유 현금과 연 소득을 입력할 수 있다", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "7000");
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
    expect(screen.getByLabelText("연 소득 (세전)")).toHaveValue("7000");
  });

  it("생애최초 체크박스를 토글할 수 있다", async () => {
    renderForm();
    const checkbox = screen.getByRole("checkbox", { name: /생애최초/ });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("첫 화면에는 입력이 셋뿐이다", () => {
    renderForm();
    expect(screen.getByLabelText(/보유 현금/)).toBeInTheDocument();
    expect(screen.getByLabelText(/연 소득/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /생애최초/ })).toBeInTheDocument();

    // 사라져야 하는 것들
    expect(screen.queryByLabelText(/기존 부채/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/전용면적/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /규제지역/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/주택 보유 상황/)).not.toBeInTheDocument();
  });

  it('체크박스가 "indeterminate"를 줘도 생애최초가 참이 되지 않는다', () => {
    // SEED Checkbox의 onCheckedChange는(배포판에 따라) boolean | "indeterminate"를
    // 준다. "indeterminate"를 참으로 취급하면 규제지역 LTV가 40%에서 70%로
    // 뛰어 한도를 30%p 과대 계상한다 — 이 제품이 절대 하면 안 되는 방향이다.
    //
    // 실제로 확인해 보니 이 프로젝트가 물고 있는
    // @seed-design/react-checkbox@2.0.1의 onCheckedChange는 소스 레벨에서
    // boolean 하나로만 좁혀 두어(useCheckbox.ts), 렌더된 컴포넌트를 클릭하는
    // 경로로는 "indeterminate"가 애초에 만들어지지 않는다 — 그 값을 만들 수
    // 있는 유일한 통로가 없다. 그래서 이 테스트는 ProfileForm이 실제
    // onCheckedChange에 넘기는 바로 그 좁히기 함수(isExplicitlyChecked)를
    // 직접 호출해 "indeterminate"를 통과시킨다. true/false만 넣는 우회가
    // 아니라, 렌더 트리를 거치지 않을 뿐 프로덕션 코드가 실행하는 정확히
    // 그 좁히기 로직을 그 값으로 실행한다.
    expect(isExplicitlyChecked("indeterminate")).toBe(false);
    expect(isExplicitlyChecked(true)).toBe(true);
    expect(isExplicitlyChecked(false)).toBe(false);
  });

  describe("기존 부채 — 매달 나가는 대출금", () => {
    it("매달 나가는 대출금을 묻고 엔진에는 12배로 넘긴다", () => {
      const onChange = vi.fn();
      renderForm({ openField: "existingDebt", onExistingDebtChange: onChange });

      // 라벨이 "연간 원리금"이 아니라 월 기준이어야 한다
      const input = screen.getByLabelText(/매달 나가는 대출금/);
      fireEvent.change(input, { target: { value: "50" } }); // 50만원/월

      // 만원 단위 해석 → 500,000원/월 → 연 6,000,000원
      expect(onChange).toHaveBeenLastCalledWith(6_000_000);
    });

    it("월 금액을 다시 표시할 때도 월 기준으로 되돌린다", () => {
      renderForm({
        openField: "existingDebt",
        initial: { existingDebtAnnualPayment: 6_000_000 },
      });
      // 연 600만원이 월 50만원으로 보여야 한다 — 왕복이 일치하지 않으면
      // 사용자가 자기가 넣은 값을 다시 열었을 때 다른 숫자를 본다.
      expect(screen.getByLabelText(/매달 나가는 대출금/)).toHaveValue("50");
    });

    it("비워 두면 여전히 비어 있는 채로 보인다", () => {
      renderForm({ openField: "existingDebt" });
      expect(screen.getByLabelText(/매달 나가는 대출금/)).toHaveValue("");
    });

    it("openField가 아니면 열리지 않는다", () => {
      renderForm();
      expect(
        screen.queryByLabelText(/매달 나가는 대출금/),
      ).not.toBeInTheDocument();
    });
  });

  describe("규제지역 — 열었을 때만 보인다", () => {
    it("openField가 regulatedArea면 체크박스와 안내가 나타난다", () => {
      renderForm({ openField: "regulatedArea" });
      const checkbox = screen.getByRole("checkbox", { name: /규제지역/ });
      expect(checkbox).toBeChecked(); // 기본값(가정)은 true

      const regulatedPercent = Math.round(
        rules.ltv.regulated.default * 100,
      ).toString();
      const unregulatedPercent = Math.round(
        rules.ltv.unregulated.default * 100,
      ).toString();
      const hintText = screen.getByText(/무주택자 LTV가/);
      expect(hintText.textContent).toContain(`${regulatedPercent}%`);
      expect(hintText.textContent).toContain(`${unregulatedPercent}%`);
    });

    it("체크박스를 눌러 규제지역 여부를 바꿀 수 있다", async () => {
      renderForm({ openField: "regulatedArea" });
      const checkbox = screen.getByRole("checkbox", { name: /규제지역/ });
      await userEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe("전용면적 — 열었을 때만 보인다", () => {
    it("가정값을 보여준다 — 하드코딩된 84가 아니라 실제 기본값이다", () => {
      renderForm({ openField: "area" });
      expect(screen.getByLabelText("전용면적 (㎡)")).toHaveValue(
        DEFAULT_FORM_STATE.exclusiveAreaSqm,
      );
    });

    it("유효한 값을 입력하면 그대로 반영된다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      await userEvent.type(input, "59");
      expect(input).toHaveValue(59);
    });

    it("비운 채로 blur하면 마지막 유효값으로 되돌아간다 — 값이 없는 채로 남지 않는다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      fireEvent.blur(input);
      expect(input).toHaveValue(DEFAULT_FORM_STATE.exclusiveAreaSqm);
    });

    it("0을 입력하고 blur하면 마지막 유효값으로 되돌아간다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      await userEvent.type(input, "0");
      fireEvent.blur(input);
      expect(input).toHaveValue(DEFAULT_FORM_STATE.exclusiveAreaSqm);
    });

    it("입력 도중에는(포커스가 남아 있는 동안) 지운 화면 그대로를 보여준다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      expect(input).toHaveValue(null);
    });
  });
});
