import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BindingConstraint, LoanLimit } from "../lib/finance";
import { BindingExplainer, getBindingTitle } from "./BindingExplainer";

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
    // POLICY: 0은 NO_POLICY_LIMIT — "0원 받을 수 있다"가 아니라 "정책대출
    // 이라는 선택지 자체가 없다"는 뜻이므로 그렇게 표시해야 한다.
    expect(screen.getByText("선택지 없음")).toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
  });

  it("정책대출 한도가 0이 아니면 금액을 그대로 보여준다", () => {
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
    const policyRow = container.querySelector('[data-binding="POLICY"]');
    expect(policyRow).toHaveTextContent("2억원");
    expect(policyRow).not.toHaveTextContent("선택지 없음");
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

    // POLICY는 상한이 아니라 선택지다(loan-limit.ts: amount = max(min(은행 셋), POLICY)).
    // 아래 케이스들은 POLICY가 0이 아닌 값을 가지면서 은행 제약이 binding인
    // 상황을 다룬다 — 리뷰가 지적한 대로, 기존 픽스처는 전부 POLICY: 0만
    // 써서 이 경로가 네 차례 리뷰를 통과해 살아남았다.

    it("POLICY가 binding과 2순위 은행 제약 사이에 있어도 2순위는 은행 제약을 가리킨다", () => {
      const loanLimit: LoanLimit = {
        amount: 100_000_000,
        binding: "LTV",
        breakdown: {
          LTV: 100_000_000,
          DSR: 250_000_000,
          CAP: 300_000_000,
          POLICY: 200_000_000,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      expect(runnerUp).toHaveTextContent("상환 능력(DSR)");
      expect(runnerUp).not.toHaveTextContent("정책대출");
      expect(runnerUp).toHaveTextContent("1억 5,000만원");
      expect(container.querySelector(".runner-up-tied")).not.toBeInTheDocument();
    });

    it("POLICY가 binding과 같은 값이어도 동률 안내를 내지 않고 은행 2순위를 가리킨다", () => {
      // Group 1 결함 재현 (a): 무주택·현금 1억·소득 6,500만 프로필의 실제
      // calcAffordablePrice 출력. binding은 LTV인데 POLICY가 우연히 같은
      // 값이다 — 정책 경로 자체가 LTV에 걸려 있기 때문(디딤돌: min(maxAmount,
      // LTV한도, DSR한도@3.2%)). 고친 전에는 이것이 "정책대출도 같은 금액에서
      // 다시 걸린다"는 동률 안내를 냈는데, 실제로는 진짜 DSR 여유가 있다.
      const loanLimit: LoanLimit = {
        amount: 217_490_000,
        binding: "LTV",
        breakdown: {
          LTV: 217_490_000,
          DSR: 373_305_491,
          CAP: 600_000_000,
          POLICY: 217_490_000,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      expect(container.querySelector(".runner-up-tied")).not.toBeInTheDocument();
      const runnerUp = container.querySelector(".runner-up");
      expect(runnerUp).toHaveTextContent("상환 능력(DSR)");
      expect(runnerUp).not.toHaveTextContent("정책대출");
      // 여유액 = 373,305,491 - 217,490,000 = 155,815,491
      expect(runnerUp).toHaveTextContent("1억 5,581만 5,491원");
    });

    it("POLICY가 은행 제약 전부보다 커도(엔진상 불가능한 방어 케이스) 은행 2순위를 그대로 가리킨다", () => {
      const loanLimit: LoanLimit = {
        amount: 100_000_000,
        binding: "LTV",
        breakdown: {
          LTV: 100_000_000,
          DSR: 150_000_000,
          CAP: 200_000_000,
          POLICY: 500_000_000,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      expect(runnerUp).toHaveTextContent("상환 능력(DSR)");
      expect(runnerUp).toHaveTextContent("5,000만원");
    });

    it("결함 재현 (b): POLICY가 binding보다 작아도 실제 은행 2순위 여유가 사라지지 않는다", () => {
      // Group 1 결함 재현 (b): 무주택·소득 6,500만, 현금 2억 지점의 실제
      // calcAffordablePrice 출력. binding은 DSR이고 LTV에 2,058만원의
      // 진짜 여유가 있는데, 고친 전에는 POLICY(3.6억)가 DSR(3.733억)보다
      // 작아 음수 headroom으로 계산되어 2순위 라인 자체가 사라졌다.
      const loanLimit: LoanLimit = {
        amount: 373_305_491,
        binding: "DSR",
        breakdown: {
          LTV: 393_890_000,
          DSR: 373_305_491,
          CAP: 600_000_000,
          POLICY: 360_000_000,
        },
      };
      const { container } = render(<BindingExplainer loanLimit={loanLimit} />);
      const runnerUp = container.querySelector(".runner-up");
      expect(runnerUp).not.toBeNull();
      expect(runnerUp).toHaveTextContent("담보 가치(LTV)");
      expect(runnerUp).not.toHaveTextContent("정책대출");
      // 여유액 = 393,890,000 - 373,305,491 = 20,584,509
      expect(runnerUp).toHaveTextContent("2,058만 4,509원");
      expect(container.querySelector(".runner-up-tied")).not.toBeInTheDocument();
    });
  });

  describe("showTitle", () => {
    it("기본값은 제목을 보여준다", () => {
      render(<BindingExplainer loanLimit={limit("LTV")} />);
      expect(
        screen.getByRole("heading", { name: "담보 가치(LTV)에 걸렸습니다" }),
      ).toBeInTheDocument();
    });

    it("false면 제목 줄을 그리지 않는다 — BudgetResult가 같은 문구를 이미 밖에서 보여줄 때 쓴다", () => {
      render(<BindingExplainer loanLimit={limit("LTV")} showTitle={false} />);
      expect(
        screen.queryByRole("heading", { name: "담보 가치(LTV)에 걸렸습니다" }),
      ).not.toBeInTheDocument();
      // 나머지 내용(금액·조언)은 그대로 남아 있다 — 제목만 빠진다.
      expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
    });
  });

  describe("getBindingTitle", () => {
    it("각 제약의 한 줄 제목을 컴포넌트가 그리는 것과 똑같이 돌려준다", () => {
      const bindings: BindingConstraint[] = ["LTV", "DSR", "CAP", "POLICY"];
      for (const binding of bindings) {
        render(<BindingExplainer loanLimit={limit(binding)} />);
        expect(
          screen.getByRole("heading", { name: getBindingTitle(binding) }),
        ).toBeInTheDocument();
      }
    });
  });
});
