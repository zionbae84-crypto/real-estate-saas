import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM_STATE,
  type ExistingHomeFormState,
  type ProfileFormState,
} from "../state/useProfileForm";
import { rules } from "../state/useAffordability";
import { ProfileForm } from "./ProfileForm";

/**
 * 실제 useProfileForm 훅과 같은 모양의 setField/setExistingHomeField를
 * 로컬 state로 재현한다. ProfileForm은 이 두 콜백의 구현을 모르므로,
 * 훅 전체를 마운트하지 않고도 실제와 같은 상태 갱신 흐름을 검증할 수 있다.
 */
function Harness({ initial }: { initial?: ProfileFormState }) {
  const [state, setState] = useState<ProfileFormState>(
    initial ?? DEFAULT_FORM_STATE,
  );

  function setField<K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
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
    />
  );
}

describe("ProfileForm", () => {
  it("보유 현금과 연 소득을 입력할 수 있다", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "7000");
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
    expect(screen.getByLabelText("연 소득 (세전)")).toHaveValue("7000");
  });

  it("기존 부채 입력란은 비울 수 있다 — 0으로 스냅백하지 않는다", async () => {
    render(<Harness />);
    const debtInput = screen.getByLabelText("기존 부채 연간 원리금");
    expect(debtInput).toHaveValue("");

    await userEvent.type(debtInput, "500");
    expect(debtInput).toHaveValue("500");

    await userEvent.clear(debtInput);
    expect(debtInput).toHaveValue("");
  });

  it("기존 부채에 자릿수를 입력해도 앞에 0이 남지 않는다", async () => {
    render(<Harness />);
    const debtInput = screen.getByLabelText("기존 부채 연간 원리금");
    await userEvent.type(debtInput, "500");
    expect(debtInput).not.toHaveValue("0500");
  });

  it("주택 보유 상황을 갈아타기로 바꾸면 기존 주택 입력란이 나타난다", async () => {
    render(<Harness />);
    expect(
      screen.queryByLabelText("기존 주택 예상 매도가"),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("주택 보유 상황"),
      "갈아타기",
    );

    expect(screen.getByLabelText("기존 주택 예상 매도가")).toBeInTheDocument();
    expect(screen.getByLabelText("상환할 기존 대출")).toBeInTheDocument();
    expect(screen.getByLabelText("예상 양도세")).toBeInTheDocument();
  });

  it("무주택으로 되돌리면 기존 주택 입력란이 사라진다", async () => {
    render(<Harness />);
    const select = screen.getByLabelText("주택 보유 상황");
    await userEvent.selectOptions(select, "갈아타기");
    await userEvent.selectOptions(select, "무주택");
    expect(
      screen.queryByLabelText("기존 주택 예상 매도가"),
    ).not.toBeInTheDocument();
  });

  it("생애최초 체크박스를 토글할 수 있다", async () => {
    render(<Harness />);
    const checkbox = screen.getByLabelText("생애최초 주택 구입");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  describe("전용면적 입력", () => {
    it("초기값 84를 보여준다", () => {
      render(<Harness />);
      expect(screen.getByLabelText("전용면적 (㎡)")).toHaveValue(84);
    });

    it("유효한 값을 입력하면 그대로 반영된다", async () => {
      render(<Harness />);
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      await userEvent.type(input, "59");
      expect(input).toHaveValue(59);
    });

    it("비운 채로 blur하면 마지막 유효값으로 되돌아간다 — 값이 없는 채로 남지 않는다", async () => {
      render(<Harness />);
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      fireEvent.blur(input);
      expect(input).toHaveValue(84);
    });

    it("0을 입력하고 blur하면 마지막 유효값으로 되돌아간다", async () => {
      render(<Harness />);
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      await userEvent.type(input, "0");
      fireEvent.blur(input);
      expect(input).toHaveValue(84);
    });

    it("입력 도중에는(포커스가 남아 있는 동안) 지운 화면 그대로를 보여준다", async () => {
      // 회귀 방지: 예전 구현은 파싱 실패 시 onChange를 호출하지 않아
      // 부모가 리렌더하지 않았고, controlled input인데도 브라우저가
      // 사용자가 지운 화면을 그대로 유지했다 — 이건 우연히 "맞아
      // 보였을" 뿐 실제로는 화면과 계산값이 어긋난 상태였다. 지금은
      // 의도적으로 로컬 텍스트 상태를 들고 있어 지운 채로 보여준다.
      render(<Harness />);
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      expect(input).toHaveValue(null);
    });
  });

  describe("규제 수치 고정", () => {
    it("규제지역 LTV 퍼센트가 규칙셋과 일치한다", () => {
      render(<Harness />);

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
  });
});
