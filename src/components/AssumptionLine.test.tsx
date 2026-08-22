import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rules } from "../state/useAffordability";
import {
  DEFAULT_FORM_STATE,
  loadStoredState,
  type AssumableField,
  type ProfileFormState,
} from "../state/useProfileForm";
import { AssumptionLine, buildAssumptionItems } from "./AssumptionLine";

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

  describe("리뷰 수정: 저장된 부채가 있으면 문구가 거짓말하지 않는다 (Important 1)", () => {
    it("옛 저장본을 복원해 실제 부채가 반영돼 있으면 '없음'이라고 말하지 않는다", () => {
      // loadStoredState로 실제 복원 경로를 거친다 — touched는 옛 저장본에
      // 없으므로 빈 배열로 채워지지만, 부채 금액 자체는 그대로 복원되어
      // 엔진 계산에 반영된다. 이 상태에서 "기존 대출 없음으로 계산했어요"라고
      // 말하면 계산과 문구가 어긋난다.
      const restored = loadStoredState({
        getItem: () =>
          JSON.stringify({
            cash: 200_000_000,
            annualIncome: 50_000_000,
            existingDebtAnnualPayment: 6_000_000,
          }),
      });
      expect(restored.touched).toEqual([]); // 전제 확인: touched는 비어 있다
      expect(restored.existingDebtAnnualPayment).toBe(6_000_000); // 전제 확인: 값은 살아 있다

      render(<AssumptionLine state={restored} onOpen={vi.fn()} />);
      expect(screen.queryByText(/기존 대출 없음/)).not.toBeInTheDocument();
    });

    it("touched가 비어 있어도 실제 값이 null이면 여전히 가정 문구를 보여준다", () => {
      const restored = loadStoredState({
        getItem: () =>
          JSON.stringify({ cash: 200_000_000, annualIncome: 50_000_000 }),
      });
      expect(restored.existingDebtAnnualPayment).toBeNull();

      render(<AssumptionLine state={restored} onOpen={vi.fn()} />);
      expect(screen.getByText(/기존 대출 없음/)).toBeInTheDocument();
    });
  });

  describe("리뷰 수정: 면적 임계값은 룰셋에서 유도한다 (Important 2)", () => {
    it("buildAssumptionItems가 받은 threshold 값을 그대로 문구에 쓴다 — 85 하드코딩이 아니다 (임계값 초과 방향)", () => {
      const items = buildAssumptionItems(
        { ...DEFAULT_FORM_STATE, exclusiveAreaSqm: 120 },
        100,
      );
      const areaItem = items.find((item) => item.field === "area");
      expect(areaItem?.text).toContain("100㎡ 이하면");
      expect(areaItem?.text).not.toContain("85㎡");
    });

    it("실제 컴포넌트는 룰셋의 ruralTaxAreaThresholdSqm 값을 문구에 반영한다", () => {
      renderLine();
      const threshold = rules.acquisitionTax.ruralTaxAreaThresholdSqm;
      expect(
        screen.getByText(new RegExp(`${threshold}㎡ 이하면`)),
      ).toBeInTheDocument();
    });
  });

  describe("리뷰 수정: 면적 문구가 방향을 분기한다 (Important 1)", () => {
    // C2를 고쳐도 이 문제는 남는다 — 문장이 "임계값 이하면 늘어날 수
    // 있다"는 한 방향만 말한다. 가정 면적이 이미 임계값 이하(농특세 미부과)로
    // 계산 중이면, 진실을 말해도 부대비용이 "줄어들" 수는 없다 — 오히려
    // 실제 면적이 임계값을 넘으면 부대비용이 늘어 가격이 "낮아질" 수
    // 있다는 반대 방향이 진실이다. regulatedArea 항목이 이미 이 양방향
    // 분기를 제대로 다루고 있으므로 같은 방식을 따른다.
    it("가정 면적이 임계값을 넘으면(농특세 부과) — 고치면 늘어날 수 있다고 말한다", () => {
      const items = buildAssumptionItems(
        { ...DEFAULT_FORM_STATE, exclusiveAreaSqm: 120 },
        100,
      );
      const areaItem = items.find((item) => item.field === "area");
      expect(areaItem?.text).toMatch(/늘어날 수 있어요/);
      expect(areaItem?.text).not.toMatch(/낮아질 수 있어요/);
    });

    it("가정 면적이 임계값 이하면(농특세 미부과) — 고치면 낮아질 수 있다고 반대로 말한다", () => {
      const items = buildAssumptionItems(
        { ...DEFAULT_FORM_STATE, exclusiveAreaSqm: 80 },
        100,
      );
      const areaItem = items.find((item) => item.field === "area");
      expect(areaItem?.text).toContain("100㎡를 넘으면");
      expect(areaItem?.text).toMatch(/낮아질 수 있어요/);
      expect(areaItem?.text).not.toMatch(/늘어날 수 있어요/);
    });

    it("실제 기본값(임계값+1)은 초과 방향이므로 늘어날 수 있다고 말한다", () => {
      renderLine();
      expect(
        screen.getByText(/부대비용이 줄어 살 수 있는 가격이 늘어날 수 있어요/),
      ).toBeInTheDocument();
    });
  });

  describe("리뷰 수정: 옛 갈아타기 정보를 조용히 버리지 않고 알린다 (Important 3, 방향 a)", () => {
    it("무주택으로 처리됐지만 옛 매도 정보가 남아 있으면 알림 문구를 보여준다", () => {
      const restored = loadStoredState({
        getItem: () =>
          JSON.stringify({
            cash: 50_000_000,
            annualIncome: 100_000_000,
            status: "갈아타기",
            existingHome: {
              expectedSalePrice: 700_000_000,
              remainingLoan: 300_000_000,
              capitalGainsTax: 20_000_000,
            },
          }),
      });
      expect(restored.status).toBe("무주택"); // 전제 확인: Important 3 수정으로 무주택 처리됨
      expect(restored.existingHome.expectedSalePrice).toBe(700_000_000); // 전제 확인: 데이터는 보존됨

      render(<AssumptionLine state={restored} onOpen={vi.fn()} />);
      expect(screen.getByText(/갈아타기/)).toBeInTheDocument();
    });

    it("옛 매도 정보가 없으면 알림 문구를 보여주지 않는다", () => {
      renderLine(); // DEFAULT_FORM_STATE — existingHome이 전부 null
      expect(screen.queryByText(/갈아타기/)).not.toBeInTheDocument();
    });

    it("알림 문구는 버튼이 아니다 — 고칠 UI가 없으므로 눌러도 아무 일도 없다는 것을 정직하게 드러낸다", () => {
      const restored = loadStoredState({
        getItem: () =>
          JSON.stringify({
            cash: 50_000_000,
            annualIncome: 100_000_000,
            status: "갈아타기",
            existingHome: {
              expectedSalePrice: 700_000_000,
              remainingLoan: 300_000_000,
              capitalGainsTax: 20_000_000,
            },
          }),
      });
      render(<AssumptionLine state={restored} onOpen={vi.fn()} />);
      const notice = screen.getByText(/갈아타기/);
      expect(notice.closest("button")).toBeNull();
    });
  });

  describe("리뷰 수정: 커버리지 보강 (Minor 3)", () => {
    it("면적 문구에 실제 전용면적 값이 들어간다", () => {
      renderLine({ state: { exclusiveAreaSqm: 59 } });
      expect(
        screen.getByText(/59㎡로 가정하고 계산했어요/),
      ).toBeInTheDocument();
    });

    it("규제지역 버튼을 누르면 onOpen(\"regulatedArea\")가 불린다", () => {
      const onOpen = vi.fn();
      renderLine({ onOpen });
      fireEvent.click(screen.getByRole("button", { name: /규제지역/ }));
      expect(onOpen).toHaveBeenCalledWith("regulatedArea");
    });

    it("전용면적 버튼을 누르면 onOpen(\"area\")가 불린다", () => {
      const onOpen = vi.fn();
      renderLine({ onOpen });
      fireEvent.click(screen.getByRole("button", { name: /전용면적/ }));
      expect(onOpen).toHaveBeenCalledWith("area");
    });
  });
});
