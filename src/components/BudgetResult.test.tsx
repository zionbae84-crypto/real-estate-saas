import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AffordableResult } from "../lib/finance";
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

describe("BudgetResult", () => {
  it("실구매력을 크게 보여준다", () => {
    render(<BudgetResult result={result()} />);
    expect(screen.getByText("6억 4,000만원")).toBeInTheDocument();
  });

  it("부대비용 합계를 보여준다", () => {
    render(<BudgetResult result={result()} />);
    // Task 4에서 costs.total에 brokerageVat·housingBondCost가 더해지며
    // 13,060,000 → 14,247,840으로 바뀌었다("1,306만원" → "1,424만 7,840원").
    expect(screen.getByText("1,424만 7,840원")).toBeInTheDocument();
  });

  it("걸린 제약 설명을 함께 보여준다", () => {
    render(<BudgetResult result={result()} />);
    expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
  });

  it("실구매력이 0이면 숫자 대신 안내를 보여준다", () => {
    render(<BudgetResult result={result({ affordablePrice: 0 })} />);
    expect(
      screen.getByText(/현재 조건으로는 주택담보대출이 나오지 않습니다/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
  });

  describe("실구매력 0원의 원인 안내", () => {
    // Group 3a 결함 재현: cash 0, income 3억, debt 0. 실제로는 매매가 0원에서도
    // 발생하는 고정 부대비용(법무비·이사비)조차 현금이 못 감당해서 0이 되는데,
    // breakdown.DSR이 nonzero인데도(소득이 3억이니 당연하다) 예전 문구는
    // 항상 "소득이 없거나 기존 부채가..."라고 잘못 말했다.
    it("DSR이 0이 아니면(소득·부채 문제가 아니면) 현금 부족을 원인으로 짚는다", () => {
      render(
        <BudgetResult
          result={result({
            affordablePrice: 0,
            loanLimit: {
              amount: 0,
              binding: "LTV",
              breakdown: { LTV: 0, DSR: 373_305_491, CAP: 600_000_000, POLICY: 0 },
            },
            warnings: ["고정 부대비용(법무비·이사비)만으로도 보유 현금을 초과합니다."],
          })}
        />,
      );
      expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
      expect(
        screen.queryByText(/소득이 없거나 기존 부채가/),
      ).not.toBeInTheDocument();
    });

    it("DSR이 0이면 소득·부채 문제를 원인으로 짚는다", () => {
      render(
        <BudgetResult
          result={result({
            affordablePrice: 0,
            loanLimit: {
              amount: 0,
              binding: "LTV",
              breakdown: { LTV: 0, DSR: 0, CAP: 600_000_000, POLICY: 0 },
            },
          })}
        />,
      );
      expect(screen.getByText(/소득이 없거나 기존 부채가/)).toBeInTheDocument();
      expect(screen.queryByText(/현금을 더 모으면/)).not.toBeInTheDocument();
    });
  });

  it("경고가 있으면 결과 위에 보여준다", () => {
    render(
      <BudgetResult
        result={result({ warnings: ["양도세가 반영되지 않았습니다."] })}
      />,
    );
    expect(
      screen.getByText("양도세가 반영되지 않았습니다."),
    ).toBeInTheDocument();
  });
});
