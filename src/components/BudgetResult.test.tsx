import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AffordableResult } from "../lib/finance";
import { rules } from "../state/useAffordability";
import { BudgetResult } from "./BudgetResult";

function result(overrides: Partial<AffordableResult> = {}): AffordableResult {
  return {
    affordablePrice: 640_000_000,
    loanLimit: {
      amount: 420_000_000,
      binding: "LTV",
      breakdown: { LTV: 420_000_000, DSR: 574_316_140, CAP: 600_000_000, POLICY: 0 },
    },
    costs: {
      acquisitionTax: 8_400_000,
      brokerageFee: 2_560_000,
      legalFee: 600_000,
      movingCost: 1_500_000,
      // Task 4로 CostBreakdown에 추가된 두 항목. 값은 실제 엔진
      // (calcAcquisitionCosts)이 가격 6억4천만원에서 산출하는 값과
      // 같게 맞췄다: brokerageVat = brokerageFee(2,560,000) * 10%.
      // housingBondCost = calcHousingBondCost(640_000_000, rules).
      brokerageVat: 256_000,
      housingBondCost: 931_840,
      // 위 두 항목이 늘어난 만큼 합계도 늘어난다.
      // 이전 값 13,060,000 → 새 값 14,247,840
      // (13,060,000 + 256,000 + 931,840).
      total: 14_247_840,
    },
    availableCash: 200_000_000,
    matchedPolicyLoans: [],
    warnings: [],
    ...overrides,
  };
}

interface RenderResultOverrides {
  result?: AffordableResult;
  isRegulatedArea?: boolean;
  isFirstTimeBuyer?: boolean;
}

function renderResult(overrides: RenderResultOverrides = {}) {
  const r = overrides.result ?? result();
  return render(
    <BudgetResult
      result={r}
      householdCountNote={rules.acquisitionTax.householdCountNote}
      isRegulatedArea={overrides.isRegulatedArea ?? true}
      isFirstTimeBuyer={overrides.isFirstTimeBuyer ?? false}
    />,
  );
}

describe("BudgetResult", () => {
  /**
   * 사용자 지시로 헤드라인 카드("실구매 가능 가격")를 없앴다 — 상단바가
   * 이미 같은 라벨·같은 값을 보여주는 자리라 중복이었다. 이 카드는 이제
   * 대출 한도·부대비용·정책대출, 카드 셋으로 시작한다.
   */
  it("대출 한도 카드로 시작한다 — 헤드라인 카드는 더 이상 없다", () => {
    const { container } = renderResult();
    const section = container.querySelector(".budget-result");
    expect(section?.firstElementChild?.className).toBe("binding-explainer");
  });

  it("부대비용 합계를 만원 단위로 반올림해 보여준다", () => {
    renderResult();
    // 사용자 지시로 만원 단위까지만 보여준다 — 14,247,840원은 "1,425만원".
    expect(screen.getByText("1,425만원")).toBeInTheDocument();
  });

  /**
   * `calcAcquisitionCosts`는 취득자의 주택 수를 읽지 않고 언제나
   * 무주택 기준 세율로 계산한다(acquisition-cost.ts 참고) — 부대비용이
   * 나오는 이 자리에도 그 사실과 방향을 알리는 고지가 반드시 함께
   * 나가야 한다. `CostBreakdown.test.tsx`가 이미 문구 자체와 방향을
   * 잠그므로, 여기서는 이 화면이 실제로 그 컴포넌트를 통해 고지를
   * 보여주는지만 확인한다. (실제 앱에서 이 prop에 무엇이 들어가는지는
   * `App.tsx`가 정한다 — 지금은 사용자 지시로 짧은 고정 문구를 쓴다.
   * `BudgetResult` 자신은 받은 문구를 그대로 낼 뿐이라 이 테스트는
   * 여전히 임의의 문구로 그 계약만 확인한다.)
   */
  it("부대비용 옆에 주택 수 고지가 함께 나온다", () => {
    renderResult();
    expect(
      screen.getByText(rules.acquisitionTax.householdCountNote),
    ).toBeInTheDocument();
  });

  /**
   * 사용자 지시: "대출한도 부분 >> 부대비용 형식과 동일하게 표시." 두
   * 카드가 같은 summary/토글 형식이고, summary만으로도 요점(제목+금액)이
   * 보인다 — 펼치지 않아도 된다.
   */
  it("부대비용 합계와 대출 한도 금액이 각자 summary에 접히지 않고 보인다", () => {
    renderResult();

    const costTotal = screen.getByText("1,425만원");
    expect(costTotal.closest("summary")).not.toBeNull();
    expect(costTotal.closest("details")).toHaveClass("cost-breakdown");

    // amount(420,000,000)와 breakdown.LTV가 엔진 불변식상 같은 값이라
    // 표의 LTV 줄에도 "4억 2,000만원"이 나온다 — summary 안의 금액으로
    // 범위를 좁힌다.
    const loanTotal = screen.getByText("4억 2,000만원", {
      selector: ".binding-total",
    });
    expect(loanTotal.closest("summary")).not.toBeNull();
    expect(loanTotal.closest("details")).toHaveClass("binding-explainer");
  });

  it("실구매력이 0이면 숫자 대신 안내를 보여준다", () => {
    renderResult({ result: result({ affordablePrice: 0 }) });
    expect(
      screen.getByText(/현재 조건으로는 주택담보대출이 나오지 않아요/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
  });

  describe("실구매력 0원의 원인 안내", () => {
    // Group 3a 결함 재현: cash 0, income 3억, debt 0. 실제로는 매매가 0원에서도
    // 발생하는 고정 부대비용(법무비·이사비)조차 현금이 못 감당해서 0이 되는데,
    // breakdown.DSR이 nonzero인데도(소득이 3억이니 당연하다) 예전 문구는
    // 항상 "소득이 없거나 기존 부채가..."라고 잘못 말했다.
    it("DSR이 0이 아니면(소득·부채 문제가 아니면) 현금 부족을 원인으로 짚는다", () => {
      renderResult({
        result: result({
          affordablePrice: 0,
          loanLimit: {
            amount: 0,
            binding: "LTV",
            breakdown: { LTV: 0, DSR: 373_305_491, CAP: 600_000_000, POLICY: 0 },
          },
          warnings: ["고정 부대비용(법무비·이사비)만으로도 사용가능 현금 예산을 넘어요."],
        }),
      });
      expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
      expect(
        screen.queryByText(/소득이 없거나 기존 부채가/),
      ).not.toBeInTheDocument();
    });

    it("DSR이 0이면 소득·부채 문제를 원인으로 짚는다", () => {
      renderResult({
        result: result({
          affordablePrice: 0,
          loanLimit: {
            amount: 0,
            binding: "LTV",
            breakdown: { LTV: 0, DSR: 0, CAP: 600_000_000, POLICY: 0 },
          },
        }),
      });
      expect(screen.getByText(/소득이 없거나 기존 부채가/)).toBeInTheDocument();
      expect(screen.queryByText(/현금을 더 모으면/)).not.toBeInTheDocument();
    });
  });

  /**
   * 예전에는 여기 두 검사가 있었다 — "경고가 있으면 결과 위에
   * 보여준다"와 "경고는 details 밖에 있다 — 접히지 않는다". 둘 다 지운
   * 것이 아니라 **호출부로 옮겼다**: `src/App.test.tsx`의
   * "엔진 경고의 자리"가 같은 두 사실을 새 자리에서 검사한다(사이드바
   * 맨 위에 보인다 / 접히는 패널·`<details>` 밖이다).
   *
   * 이 컴포넌트가 통째로 접히는 예산 상세 패널 안으로 들어가면서
   * (Task 5) 여기서 그리는 경고는 자동으로 함께 접혔다 — "접지 않는다"를
   * 이 컴포넌트가 더는 지킬 수 없다. 그래서 경고를 들어냈고, 여기 남는
   * 검사는 **다시 들어오지 않는지**를 잠그는 것이다. `warnings`를 주고도
   * 아무것도 그리지 않아야 한다 — 그리면 화면과 종이에 같은 문장이 두 번
   * 나온다(호출부가 이미 그린다).
   */
  it("경고를 그리지 않는다 — 접히는 패널 밖에서 호출부가 그린다", () => {
    const { container } = renderResult({
      result: result({ warnings: ["양도세가 반영되지 않았어요."] }),
    });
    expect(
      screen.queryByText("양도세가 반영되지 않았어요."),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".warning-list")).toBeNull();
  });
});
