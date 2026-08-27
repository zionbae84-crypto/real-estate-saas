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

/**
 * 대부분의 테스트는 LTV 산정 기준 자체를 검증하지 않으므로 대표값
 * 하나를 공유한다 — 규제지역·무주택(생애최초 아님) 기준 40%. 이 기준
 * 자체를 검증하는 테스트는 아래에서 별도 describe로 명시적인 값을 쓴다.
 */
const LTV_BASIS = {
  price: 1_050_000_000,
  rate: 0.4,
  isRegulatedArea: true,
  isFirstTimeBuyer: false,
};

describe("BindingExplainer", () => {
  /**
   * 사용자 지시: "대출한도 부분 >> 부대비용 형식과 동일하게 표시" —
   * `CostBreakdown`처럼 summary에 제목+금액이 항상 보이고, 근거(네 가지
   * 한도 표)는 펼쳐야 보인다.
   */
  it("summary에 '대출 한도'와 금액이 항상 보이고, 표는 접힌 채로 시작한다", () => {
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} ltvBasis={LTV_BASIS} />);
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
    render(<BindingExplainer loanLimit={limit("LTV")} ltvBasis={LTV_BASIS} />);
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
    const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
    const policyRow = container.querySelector('[data-binding="POLICY"]');
    expect(policyRow).toHaveTextContent("2억원");
    expect(policyRow).not.toHaveTextContent("선택지 없음");
  });

  /**
   * 사용자 지시: "LTV기준에 대한 간단 언급. 작은글씨로 설명." LTV 행에만
   * 붙는다 — 다른 행에 힌트가 있더라도(2순위 안내 등) 이 기준 문구
   * 자체는 LTV 행에서만 나온다.
   */
  it("LTV 행에만 담보인정비율 기준에 대한 짧은 안내가 붙는다", () => {
    const { container } = render(
      <BindingExplainer loanLimit={limit("LTV")} ltvBasis={LTV_BASIS} />,
    );
    const ltvRow = container.querySelector('[data-binding="LTV"]');
    expect(ltvRow).toHaveTextContent(
      "규제지역 기준 LTV 40%를 적용했어요. (매매가 10억 5,000만원 기준)",
    );

    const dsrRow = container.querySelector('[data-binding="DSR"]');
    expect(dsrRow).not.toHaveTextContent("담보인정비율");
  });

  /**
   * 사용자 지시: "LTV의 기준이되는 금액이 얼마인지 알수가 없고 LTV %가
   * 없는데 설명에 기재해줘. 해당 지역에 맞는 LTV를 적용해줘." — 네
   * 조합(규제지역×생애최초) 모두 실제로 적용된 매매가·요율을 정확히
   * 말하는지 잠근다.
   */
  describe("LTV 안내 문구가 조합별로 정확한 기준을 말한다", () => {
    it("규제지역·생애최초가 아니면 '규제지역 기준'과 그 요율을 말한다", () => {
      render(
        <BindingExplainer
          loanLimit={limit("LTV")}
          ltvBasis={{
            price: 1_000_000_000,
            rate: 0.4,
            isRegulatedArea: true,
            isFirstTimeBuyer: false,
          }}
        />,
      );
      expect(
        screen.getByText(
          "규제지역 기준 LTV 40%를 적용했어요. (매매가 10억원 기준)",
        ),
      ).toBeInTheDocument();
    });

    it("규제지역·생애최초면 '규제지역 생애최초 기준'과 70%를 말한다", () => {
      render(
        <BindingExplainer
          loanLimit={limit("LTV")}
          ltvBasis={{
            price: 1_000_000_000,
            rate: 0.7,
            isRegulatedArea: true,
            isFirstTimeBuyer: true,
          }}
        />,
      );
      expect(
        screen.getByText(
          "규제지역 생애최초 기준 LTV 70%를 적용했어요. (매매가 10억원 기준)",
        ),
      ).toBeInTheDocument();
    });

    it("비규제지역이면 생애최초 여부와 무관하게 '비규제지역 기준'을 말한다", () => {
      render(
        <BindingExplainer
          loanLimit={limit("LTV")}
          ltvBasis={{
            price: 1_000_000_000,
            rate: 0.7,
            isRegulatedArea: false,
            isFirstTimeBuyer: false,
          }}
        />,
      );
      expect(
        screen.getByText(
          "비규제지역 기준 LTV 70%를 적용했어요. (매매가 10억원 기준)",
        ),
      ).toBeInTheDocument();
    });

    it("매매가와 요율이 바뀌면 문구도 그 값을 그대로 반영한다", () => {
      render(
        <BindingExplainer
          loanLimit={limit("LTV")}
          ltvBasis={{
            price: 1_820_600_000,
            rate: 0.4,
            isRegulatedArea: true,
            isFirstTimeBuyer: false,
          }}
        />,
      );
      expect(
        screen.getByText(
          "규제지역 기준 LTV 40%를 적용했어요. (매매가 18억 2,060만원 기준)",
        ),
      ).toBeInTheDocument();
    });
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
        <BindingExplainer loanLimit={limit(binding)} ltvBasis={LTV_BASIS} />,
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

  /**
   * 사용자 지시: "이건 dsr아래에 작은글씨로 설명으로 이동해줘" — 2순위
   * 제약 안내가 이제 표 위 독립된 상자가 아니라, 2순위가 된 그 행
   * 아래 작은 글씨(`.hint`)다. 문구도 함께 바뀌었다: 2순위 자신의
   * 이름을 되풀이하지 않고, **지금 결정된(binding) 쪽이 없었다면**
   * 얼마나 더 빌릴 수 있는지를 말한다("규제지역 상한이 없으면
   * 얼마더 대출이 가능해요" 형태).
   */
  describe("2순위 제약 안내 — 그 행 아래 작은 글씨", () => {
    /** 2순위 행 안의 여러 `.hint` 중 이 안내(구 runner-up)만 골라낸다 — LTV 행이면 자기 기준 힌트와 나란히 있을 수 있다. */
    function runnerUpHint(container: HTMLElement, key: string) {
      const row = container.querySelector(`[data-binding="${key}"]`);
      const hints = row ? [...row.querySelectorAll(".hint")] : [];
      return hints.find((h) => h.textContent?.includes("제약이")) ?? null;
    }

    it("DSR 제약일 때 LTV가 2순위이고, LTV 행 아래에 여유액을 말한다", () => {
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      // 여유액 = 350,000,000 - 172,290,000 = 177,710,000 = "1억 7,771만원"
      const hint = runnerUpHint(container, "LTV");
      expect(hint).toHaveTextContent("상환 능력(DSR)");
      expect(hint).toHaveTextContent("1억 7,771만원");
      expect(hint).toHaveTextContent("더 빌릴 수 있어요");
    });

    it("CAP이 2순위인 경우, CAP 행 아래에 안내가 붙는다", () => {
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      // 2순위는 CAP (150M) 이 DSR (200M) 보다 작음
      // 여유액 = 150,000,000 - 100,000,000 = 50,000,000 = "5,000만원"
      const hint = runnerUpHint(container, "CAP");
      expect(hint).toHaveTextContent("담보 가치(LTV)");
      expect(hint).toHaveTextContent("5,000만원");
      expect(runnerUpHint(container, "DSR")).toBeNull();
    });

    it("DSR이 2순위인 경우, DSR 행 아래에 안내가 붙는다", () => {
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      // 2순위는 DSR (120M) 이 CAP (150M) 보다 작음
      // 여유액 = 120,000,000 - 100,000,000 = 20,000,000 = "2,000만원"
      const hint = runnerUpHint(container, "DSR");
      expect(hint).toHaveTextContent("담보 가치(LTV)");
      expect(hint).toHaveTextContent("2,000만원");
    });

    it("여유액이 0이면 '더 빌릴 수 있다'는 대신 여유가 없다고 말한다", () => {
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      // 조언을 따라도(binding 제약이 없어져도) 같은 금액에서 다시
      // 걸려 한도가 늘지 않는다는 정보이므로 숨기면 안 된다.
      const hint = runnerUpHint(container, "LTV");
      expect(hint).toHaveTextContent("상환 능력(DSR)");
      expect(hint).toHaveTextContent("여유가 없어요");
      expect(hint).not.toHaveTextContent("더 빌릴 수 있어요");
    });

    it("문장 전체를 정확히 렌더링한다 — 라벨 뒤에 조사를 붙이지 않는다", () => {
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      // "상환 능력(DSR)" 뒤에 조사도 계사도 붙지 않고 고정 명사 "제약이"가
      // 오므로, 괄호로 끝나는 라벨이어도 항상 문법적으로 안전하다.
      const hint = runnerUpHint(container, "LTV");
      expect(hint?.textContent).toBe(
        "상환 능력(DSR) 제약이 없으면 1억 7,771만원 더 빌릴 수 있어요.",
      );
    });

    it("binding이 POLICY이면 2순위 안내가 어디에도 붙지 않는다", () => {
      // 엔진 불변식(src/lib/finance/loan-limit.ts): binding은 breakdown.POLICY가
      // min(LTV, DSR, CAP)보다 "엄격히 클" 때만 POLICY가 된다. 즉 2순위 탐색이
      // 찾는 값(=그 min)은 항상 amount(=breakdown.POLICY)보다 작으므로 여유는
      // 항상 음수다 — 이 상태에서 아무 안내도 뜨지 않는 것은 우연이 아니라
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      for (const key of ["LTV", "DSR", "CAP", "POLICY"]) {
        expect(runnerUpHint(container, key)).toBeNull();
      }
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      // 2순위는 LTV (150M) (POLICY는 0이므로 제외, DSR은 200M)
      // 여유액 = 150,000,000 - 100,000,000 = 50,000,000 = "5,000만원"
      const hint = runnerUpHint(container, "LTV");
      expect(hint).toHaveTextContent("규제지역 상한");
      expect(hint).toHaveTextContent("5,000만원");
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      const hint = runnerUpHint(container, "DSR");
      expect(hint).toHaveTextContent("담보 가치(LTV)");
      expect(hint).not.toHaveTextContent("정책대출");
      expect(hint).toHaveTextContent("1억 5,000만원");
      expect(runnerUpHint(container, "CAP")).toBeNull();
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      const hint = runnerUpHint(container, "DSR");
      expect(hint).not.toBeNull();
      expect(hint).not.toHaveTextContent("여유가 없어요");
      expect(hint).not.toHaveTextContent("정책대출");
      // 여유액 = 373,305,491 - 217,490,000 = 155,815,491 → 만원 단위로 반올림하면 1억 5,582만원
      expect(hint).toHaveTextContent("1억 5,582만원");
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      const hint = runnerUpHint(container, "DSR");
      expect(hint).toHaveTextContent("담보 가치(LTV)");
      expect(hint).toHaveTextContent("5,000만원");
    });

    it("결함 재현 (b): POLICY가 binding보다 작아도 실제 은행 2순위 여유가 사라지지 않는다", () => {
      // Group 1 결함 재현 (b): 무주택·소득 6,500만, 현금 2억 지점의 실제
      // calcAffordablePrice 출력. binding은 DSR이고 LTV에 2,058만원의
      // 진짜 여유가 있는데, 고친 전에는 POLICY(3.6억)가 DSR(3.733억)보다
      // 작아 음수 headroom으로 계산되어 2순위 안내 자체가 사라졌다.
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
      const { container } = render(<BindingExplainer loanLimit={loanLimit} ltvBasis={LTV_BASIS} />);
      const hint = runnerUpHint(container, "LTV");
      expect(hint).not.toBeNull();
      expect(hint).toHaveTextContent("상환 능력(DSR)");
      expect(hint).not.toHaveTextContent("정책대출");
      // 여유액 = 393,890,000 - 373,305,491 = 20,584,509 → 만원 단위로 반올림하면 2,058만원
      expect(hint).toHaveTextContent("2,058만원");
    });
  });

  /**
   * 결정된(binding) 한도 행에는 `data-active="true"`가 붙어, 표 안에서
   * 바로 어느 것이 결정됐는지 드러난다.
   */
  it("결정된 한도가 data-active로 표시된다", () => {
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} ltvBasis={LTV_BASIS} />);
    const table = container.querySelector(".binding-limit-table");

    const activeRow = table?.querySelector('[data-binding="LTV"]');
    expect(activeRow).toHaveAttribute("data-active", "true");
    const otherRow = table?.querySelector('[data-binding="DSR"]');
    expect(otherRow).not.toHaveAttribute("data-active");
  });
});
