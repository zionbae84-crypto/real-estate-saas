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

  describe("2순위 제약 인라인 표시", () => {
    it("DSR 제약일 때 LTV가 2순위이고 여유액을 표시한다", () => {
      const loanLimit: LoanLimit = {
        amount: 172_290_000,
        binding: "DSR",
        breakdown: {
          LTV: 350_000_000,
          DSR: 172_290_000,
          CAP: 600_000_000,
          POLICY: 0,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      // 여유액 = 350,000,000 - 172,290,000 = 177,710,000 = "1억 7,771만원"
      expect(runnerUp).toHaveTextContent("담보 가치(LTV)");
      expect(runnerUp).toHaveTextContent("1억 7,771만원");
      expect(runnerUp).toHaveTextContent("여유가");
    });

    it("CAP이 2순위인 경우를 올바르게 선택한다", () => {
      const loanLimit: LoanLimit = {
        amount: 100_000_000,
        binding: "LTV",
        breakdown: {
          LTV: 100_000_000,
          DSR: 200_000_000,
          CAP: 150_000_000,
          POLICY: 0,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      // 2순위는 CAP (150M) 이 DSR (200M) 보다 작음
      // 여유액 = 150,000,000 - 100,000,000 = 50,000,000 = "5,000만원"
      expect(runnerUp).toHaveTextContent("수도권 상한");
      expect(runnerUp).toHaveTextContent("5,000만원");
    });

    it("DSR이 2순위인 경우를 올바르게 선택한다", () => {
      const loanLimit: LoanLimit = {
        amount: 100_000_000,
        binding: "LTV",
        breakdown: {
          LTV: 100_000_000,
          DSR: 120_000_000,
          CAP: 150_000_000,
          POLICY: 0,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      // 2순위는 DSR (120M) 이 CAP (150M) 보다 작음
      // 여유액 = 120,000,000 - 100,000,000 = 20,000,000 = "2,000만원"
      expect(runnerUp).toHaveTextContent("상환 능력(DSR)");
      expect(runnerUp).toHaveTextContent("2,000만원");
    });

    it("여유액이 0이면 2순위 라인을 표시하지 않는다", () => {
      const loanLimit: LoanLimit = {
        amount: 100_000_000,
        binding: "DSR",
        breakdown: {
          LTV: 100_000_000,
          DSR: 100_000_000,
          CAP: 150_000_000,
          POLICY: 0,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      expect(container.querySelector(".runner-up")).not.toBeInTheDocument();
    });

    it("POLICY가 0이면 제외하고 2순위를 선택한다", () => {
      const loanLimit: LoanLimit = {
        amount: 100_000_000,
        binding: "CAP",
        breakdown: {
          LTV: 150_000_000,
          DSR: 200_000_000,
          CAP: 100_000_000,
          POLICY: 0,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      // 2순위는 LTV (150M) (POLICY는 0이므로 제외, DSR은 200M)
      // 여유액 = 150,000,000 - 100,000,000 = 50,000,000 = "5,000만원"
      expect(runnerUp).toHaveTextContent("담보 가치(LTV)");
      expect(runnerUp).toHaveTextContent("5,000만원");
    });
  });
});
