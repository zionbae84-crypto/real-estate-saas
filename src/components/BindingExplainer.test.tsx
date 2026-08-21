import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BindingConstraint, LoanLimit } from "../lib/finance";
import { BindingExplainer } from "./BindingExplainer";

function limit(binding: BindingConstraint): LoanLimit {
  return {
    amount: 420_000_000,
    binding,
    breakdown: {
      LTV: 420_000_000,
      DSR: 574_316_140,
      CAP: 600_000_000,
      POLICY: 0,
    },
  };
}

describe("BindingExplainer", () => {
  it("LTV면 현금을 더 모으라고 안내한다", () => {
    render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
  });

  it("DSR이면 기존 부채를 갚으라고 안내한다", () => {
    render(<BindingExplainer loanLimit={limit("DSR")} />);
    expect(screen.getByText(/기존 부채를 갚으면/)).toBeInTheDocument();
  });

  it("CAP이면 대출로는 못 늘린다고 못박는다", () => {
    render(<BindingExplainer loanLimit={limit("CAP")} />);
    expect(screen.getByText(/대출로는 늘릴 수 없습니다/)).toBeInTheDocument();
  });

  it("POLICY면 정책대출을 택했을 때의 한도임을 밝힌다", () => {
    render(<BindingExplainer loanLimit={limit("POLICY")} />);
    expect(screen.getByText(/정책대출을 택했을 때/)).toBeInTheDocument();
  });

  it("걸린 한도 금액을 보여준다", () => {
    // amount와 breakdown.LTV는 엔진 불변식상 같은 값이므로 텍스트가 두 곳에
    // 나온다. getByText는 복수 매칭에서 예외를 던지므로 요소를 특정한다.
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(container.querySelector(".binding-amount")).toHaveTextContent(
      "4억 2,000만원",
    );
  });

  it("네 제약의 한도를 모두 펼쳐 보여준다", () => {
    render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(screen.getByText("5억 7,431만 6,140원")).toBeInTheDocument();
    expect(screen.getByText("6억원")).toBeInTheDocument();
    expect(screen.getByText("0원")).toBeInTheDocument();
  });
});
