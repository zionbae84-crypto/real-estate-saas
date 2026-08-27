import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LoanLimit } from "../lib/finance";
import { BindingExplainer } from "./BindingExplainer";

function limit(binding: LoanLimit["binding"]): LoanLimit {
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
  /**
   * 사용자 지시: "대출한도 부분 >> 부대비용 형식과 동일하게 표시" —
   * `CostBreakdown`처럼 summary에 제목+금액이 항상 보이고, 근거(네 가지
   * 한도 표)는 펼쳐야 보인다.
   */
  it("summary에 '대출 한도'와 금액이 항상 보이고, 표는 접힌 채로 시작한다", () => {
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} />);
    const details = container.querySelector(".binding-explainer");
    expect(details?.tagName).toBe("DETAILS");
    expect(details?.hasAttribute("open")).toBe(false);

    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toContain("대출 한도");
    expect(summary?.querySelector(".binding-total")).toHaveTextContent(
      "4억 2,000만원",
    );

    // 표는 summary 밖, 접히는 본문에 있다.
    const table = container.querySelector(".binding-limit-table");
    expect(summary?.contains(table)).toBe(false);
    expect(details?.contains(table)).toBe(true);
  });

  /**
   * 사용자 지시로 금액은 전부 만원 단위로 반올림한다 — DSR
   * (574,316,140원)처럼 잔돈이 있는 값도 "5억 7,432만원"으로 깔끔하게
   * 보인다.
   */
  it("네 제약의 한도를 모두 만원 단위로 반올림해 표에 보여준다", () => {
    render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(screen.getByText("5억 7,432만원")).toBeInTheDocument();
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

  /**
   * 사용자 지시: "LTV기준에 대한 간단 언급. 작은글씨로 설명." LTV 행에만
   * 붙는다 — 나머지 세 행은 이 힌트가 없다.
   */
  it("LTV 행에만 담보인정비율 기준에 대한 짧은 안내가 붙는다", () => {
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} />);
    const ltvRow = container.querySelector('[data-binding="LTV"]');
    expect(ltvRow?.querySelector(".hint")).toHaveTextContent(
      "규제지역 여부와 생애최초 여부에 따라 담보인정비율이 달라져요.",
    );

    const dsrRow = container.querySelector('[data-binding="DSR"]');
    expect(dsrRow?.querySelector(".hint")).toBeNull();
  });

  /**
   * 사용자 지시: "규제지역 주택구입 목적 주택담보대출은 금액 상한이
   * 있어요 … 멘트는 삭제." — 제약별 조언 문단을 전부 없앴다. 어느
   * binding이든 이런 문장은 더 이상 나오지 않는다.
   */
  it("제약별 조언 문단을 더 이상 그리지 않는다", () => {
    const bindings: LoanLimit["binding"][] = ["LTV", "DSR", "CAP", "POLICY"];
    for (const binding of bindings) {
      const { container, unmount } = render(
        <BindingExplainer loanLimit={limit(binding)} />,
      );
      expect(container.querySelector(".binding-advice")).toBeNull();
      unmount();
    }
    expect(screen.queryByText(/현금을 더 모으면/)).not.toBeInTheDocument();
    expect(screen.queryByText(/기존 부채를 갚으면/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/규제지역 주택구입 목적/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/정책대출을 택했을 때/)).not.toBeInTheDocument();
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
      expect(runnerUp).toHaveTextContent("규제지역 상한");
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
      expect(tied).toHaveTextContent("늘어나지 않아요");
    });

    it("2순위 라인은 줄표로 라벨을 붙여 조사·계사 분기 없이 문장 전체를 정확히 렌더링한다", () => {
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
      // "담보 가치(LTV)" 앞뒤로 조사도 계사("~입니다"/"~이에요")도 붙지 않고
      // 줄표(—)로만 이어지므로, 받침 유무와 무관하게 항상 문법적으로
      // 안전하다(리뷰 수정: 예전에는 "~입니다"라는 합니다체 계사에 기대던
      // 장치였는데, 해요체로 통일하면서 라벨별 이에요/예요 분기 없이 계사
      // 자체를 뺐다).
      expect(runnerUp?.textContent).toBe(
        "다음으로 가까운 한도 — 담보 가치(LTV). 1억 7,771만원 여유가 있어요.",
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
      // 여유액 = 373,305,491 - 217,490,000 = 155,815,491 → 만원 단위로 반올림하면 1억 5,582만원
      expect(runnerUp).toHaveTextContent("1억 5,582만원");
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
      // 여유액 = 393,890,000 - 373,305,491 = 20,584,509 → 만원 단위로 반올림하면 2,058만원
      expect(runnerUp).toHaveTextContent("2,058만원");
      expect(container.querySelector(".runner-up-tied")).not.toBeInTheDocument();
    });
  });

  /**
   * 결정된(binding) 한도 행에는 `data-active="true"`가 붙어, 표 안에서
   * 바로 어느 것이 결정됐는지 드러난다.
   */
  it("결정된 한도가 data-active로 표시된다", () => {
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} />);
    const table = container.querySelector(".binding-limit-table");

    const activeRow = table?.querySelector('[data-binding="LTV"]');
    expect(activeRow).toHaveAttribute("data-active", "true");
    const otherRow = table?.querySelector('[data-binding="DSR"]');
    expect(otherRow).not.toHaveAttribute("data-active");
  });
});
