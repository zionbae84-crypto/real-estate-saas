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
      total: 13_060_000,
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
    expect(screen.getByText("1,306만원")).toBeInTheDocument();
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
