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

    it("여유액이 0이면 일반 라인 대신 동일 금액 재걸림을 알린다", () => {
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
      // 여유가 0이면 "여유가 있다"는 일반 문구는 거짓이므로 표시하지 않는다.
      expect(container.querySelector(".runner-up")).not.toBeInTheDocument();
      // 대신 같은 금액에서 다른 제약이 다시 걸린다는, 별도 클래스의 문구를 보여준다 —
      // 조언을 따라도 한도가 늘지 않는다는 정보이므로 숨기면 안 된다.
      const tied = container.querySelector(".runner-up-tied");
      expect(tied).toHaveTextContent("담보 가치(LTV)");
      expect(tied).toHaveTextContent("늘어나지 않습니다");
    });

    it("2순위 라인은 조사 없이 라벨 뒤에 '입니다'가 오는 문장 전체를 정확히 렌더링한다", () => {
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
      // "담보 가치(LTV)" 뒤에 은/는/이/가 같은 조사가 붙지 않고 '입니다'가
      // 바로 이어지므로, 받침 유무와 무관하게 항상 문법적으로 안전하다.
      expect(runnerUp?.textContent).toBe(
        "다음으로 가까운 한도는 담보 가치(LTV)입니다. 1억 7,771만원 여유가 있습니다.",
      );
    });

    it("binding이 POLICY이면 2순위 라인도 동률 라인도 렌더링하지 않는다", () => {
      // 엔진 불변식(src/lib/finance/loan-limit.ts): binding은 breakdown.POLICY가
      // min(LTV, DSR, CAP)보다 "엄격히 클" 때만 POLICY가 된다. 즉 2순위 탐색이
      // 찾는 값(=그 min)은 항상 amount(=breakdown.POLICY)보다 작으므로 여유는
      // 항상 음수다 — 이 상태에서 아무 라인도 뜨지 않는 것은 우연이 아니라
      // 엔진 불변식으로 보장되는 것이다.
      const loanLimit: LoanLimit = {
        amount: 200_000_000,
        binding: "POLICY",
        breakdown: {
          LTV: 100_000_000,
          DSR: 120_000_000,
          CAP: 150_000_000,
          POLICY: 200_000_000,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      expect(container.querySelector(".runner-up")).not.toBeInTheDocument();
      expect(container.querySelector(".runner-up-tied")).not.toBeInTheDocument();
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
