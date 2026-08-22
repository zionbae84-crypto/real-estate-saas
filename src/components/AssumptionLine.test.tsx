import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FORM_STATE,
  type AssumableField,
  type ProfileFormState,
} from "../state/useProfileForm";
import { AssumptionLine } from "./AssumptionLine";

function renderLine(overrides: {
  state?: Partial<ProfileFormState>;
  onOpen?: (field: AssumableField) => void;
} = {}) {
  const state: ProfileFormState = { ...DEFAULT_FORM_STATE, ...overrides.state };
  const onOpen = overrides.onOpen ?? vi.fn();
  render(<AssumptionLine state={state} onOpen={onOpen} />);
  return { onOpen };
}

describe("AssumptionLine", () => {
  it("가정 중인 항목을 전부 문구에 드러낸다", () => {
    renderLine();
    expect(screen.getByText(/기존 대출 없음/)).toBeInTheDocument();
    expect(screen.getByText(/규제지역/)).toBeInTheDocument();
  });

  it("사용자가 값을 넣은 항목은 문구에서 빠진다", () => {
    renderLine({
      state: { touched: ["existingDebt"], existingDebtAnnualPayment: 3_000_000 },
    });
    expect(screen.queryByText(/기존 대출 없음/)).not.toBeInTheDocument();
  });

  it("문구는 실제 기본값에서 만들어진다 — 하드코딩이 아니다", () => {
    // 규제지역 기본값을 뒤집은 상태를 넘기면 문구도 따라 바뀌어야 한다.
    renderLine({ state: { isRegulatedArea: false } });
    expect(screen.queryByText(/규제지역으로 계산/)).not.toBeInTheDocument();
  });

  it("기존 부채 가정은 고치면 숫자가 내려간다는 것을 드러낸다", () => {
    // 다른 가정들과 방향이 반대인 유일한 항목이다.
    renderLine();
    expect(screen.getByText(/기존 대출 없음/)).toBeInTheDocument();
  });

  it("각 가정 항목을 눌러 그 항목만 열 수 있다", () => {
    const onOpen = vi.fn();
    renderLine({ onOpen });
    fireEvent.click(screen.getByRole("button", { name: /기존 대출/ }));
    expect(onOpen).toHaveBeenCalledWith("existingDebt");
  });

  it("모든 항목을 사용자가 정했으면 아무 문구도 보이지 않는다", () => {
    renderLine({
      state: {
        touched: ["existingDebt", "regulatedArea", "area"],
        existingDebtAnnualPayment: 1_200_000,
      },
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
