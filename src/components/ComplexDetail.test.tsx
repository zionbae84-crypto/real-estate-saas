import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import type { BurdenAtPrice, CostBreakdown as CostBreakdownData } from "../lib/finance";
import { ComplexDetail } from "./ComplexDetail";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  const areaBucket = overrides.areaBucket ?? 59;
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket,
    maxExclusiveAreaSqm: areaBucket,
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    lowConfidence: false,
    ...overrides,
  };
}

function burden(overrides: Partial<BurdenAtPrice> = {}): BurdenAtPrice {
  return {
    neededLoan: 200_000_000,
    safety: {
      monthlyPayment: 1_200_000,
      burdenRatio: 0.22,
      stressedMonthlyPayment: 1_500_000,
      stressedBurdenRatio: 0.29,
      level: "safe",
    },
    ...overrides,
  };
}

function costs(overrides: Partial<CostBreakdownData> = {}): CostBreakdownData {
  return {
    acquisitionTax: 3_200_000,
    brokerageFee: 1_600_000,
    brokerageVat: 160_000,
    legalFee: 300_000,
    movingCost: 1_500_000,
    housingBondCost: 400_000,
    total: 7_160_000,
    ...overrides,
  };
}

describe("ComplexDetail", () => {
  it("단지명·평형·법정동·가격범위·거래 건수를 목록과 같은 규칙으로 보여준다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
    );
    const title = container.querySelector(".complex-detail-title")?.textContent ?? "";
    expect(title).toMatch(/테스트아파트/);
    expect(title).toMatch(/59㎡/);
    expect(title).toMatch(/대치동/);
    /*
     * 범위·거래 건수는 이제 화면에 두 번 나온다 — 여기 머리말과, 아래
     * 호가 위치 확인이 "이 판단이 몇 건에 근거하는가"로 다시 적는
     * 자리다(PriceCheck 참고). 그 자리는 판정 바로 옆에 있어야 뜻이
     * 서므로 지우지 않고, 이 검사만 머리말로 좁힌다.
     */
    const range = container.querySelector(".complex-detail-range")?.textContent ?? "";
    expect(range).toMatch(/2억 8,000만원 ~ 3억 2,000만원/);
    expect(range).toMatch(/거래 5건/);
  });

  it("변동률을 화면에 내지 않는다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/상승|하락|변동률|수익률/);
  });

  it("어느 가격 기준인지 문구로 드러낸다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
    );
    const basis = container.querySelector(".complex-detail-loan")?.textContent ?? "";
    expect(basis).toMatch(/범위 위쪽인/);
    expect(basis).toMatch(/3억 2,000만원/);
  });

  it("필요 대출액을 보여준다", () => {
    render(
      <ComplexDetail
        unit={unit()}
        burden={burden({ neededLoan: 250_000_000 })}
        costs={costs()}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/필요 대출액은/)).toBeInTheDocument();
    expect(screen.getByText(/2억 5,000만원/)).toBeInTheDocument();
  });

  it("대출이 필요 없으면 그 사실을 말한다", () => {
    render(
      <ComplexDetail
        unit={unit()}
        burden={burden({
          neededLoan: 0,
          safety: {
            monthlyPayment: 0,
            burdenRatio: 0,
            stressedMonthlyPayment: 0,
            stressedBurdenRatio: 0,
            level: "safe",
          },
        })}
        costs={costs()}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/대출 없이 살 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/필요 대출액은/)).not.toBeInTheDocument();
  });

  it("월 상환액·부담률·안전 등급·금리 스트레스 시나리오를 보여준다", () => {
    const { container } = render(
      <ComplexDetail
        unit={unit()}
        burden={burden({
          safety: {
            monthlyPayment: 1_200_000,
            burdenRatio: 0.22,
            stressedMonthlyPayment: 1_500_000,
            stressedBurdenRatio: 0.29,
            level: "safe",
          },
        })}
        costs={costs()}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("안전")).toBeInTheDocument();
    expect(screen.getByText(/120만원/)).toBeInTheDocument();
    expect(screen.getByText(/22\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/금리가 2%p 오르면/)).toBeInTheDocument();
    expect(container.querySelector(".stressed-payment")?.textContent).toMatch(/150만원/);
  });

  it("부담 등급을 색과 함께 글자로도 말한다", () => {
    const { container } = render(
      <ComplexDetail
        unit={unit()}
        burden={burden({
          safety: {
            monthlyPayment: 2_000_000,
            burdenRatio: 0.45,
            stressedMonthlyPayment: 2_500_000,
            stressedBurdenRatio: 0.5,
            level: "danger",
          },
        })}
        costs={costs()}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
    expect(screen.getByText("위험")).toBeInTheDocument();
  });

  it("부대비용 내역을 항목별로 보여준다", () => {
    render(
      <ComplexDetail
        unit={unit()}
        burden={burden()}
        costs={costs({ acquisitionTax: 3_200_000, total: 7_160_000 })}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/취득세/)).toBeInTheDocument();
    expect(screen.getByText(/320만원/)).toBeInTheDocument();
  });

  it("전용면적을 반영했다는 사실과 실구매력이 함께 바뀔 수 있다는 사실을 알려준다", () => {
    render(
      <ComplexDetail unit={unit({ areaBucket: 59 })} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/59㎡.*반영해서 계산했어요/)).toBeInTheDocument();
    expect(screen.getByText(/실구매 가능 가격도 함께 바뀌었을 수 있어요/)).toBeInTheDocument();
  });

  describe("리뷰 수정: 상세 화면의 배지·마크업·포커스", () => {
    it("이 배지가 '이 집을 샀을 때'의 답이라고 글자로 말한다", () => {
      // 상세 화면에는 헤드라인 배지(최대로 빌렸을 때)와 이 배지가 함께
      // 뜬다. 라벨이 없으면 어느 쪽이 이 매물의 답인지 알 수 없다.
      const { container } = render(
        <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
      );
      expect(container.querySelector(".safety-badge-label")?.textContent).toMatch(
        /이 집을 샀을 때/,
      );
    });

    it("필요 대출액 문단에 죽은 data-level을 붙이지 않는다", () => {
      // .complex-detail-loan[data-level=…]에 대응하는 CSS도 없고
      // .complex-level 자식도 없었다 — 아무것도 하지 않는 속성이다.
      const { container } = render(
        <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
      );
      const loan = container.querySelector(".complex-detail-loan");
      expect(loan).not.toBeNull();
      expect(loan?.hasAttribute("data-level")).toBe(false);
    });

    it("열리면 포커스가 상세로 옮겨간다", () => {
      // 목록이 사라지고 이 화면이 그 자리에 나타난다. 포커스가 사라진
      // 버튼 자리에 남으면 스크린리더 사용자는 화면이 바뀐 것을 모른다.
      render(
        <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={vi.fn()} />,
      );
      expect(document.activeElement).toBe(
        screen.getByRole("region", { name: "단지 상세" }),
      );
    });
  });

  it("목록으로 버튼을 누르면 닫는다", () => {
    const onClose = vi.fn();
    render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} priceBudget={null} onClose={onClose} />,
    );
    screen.getByRole("button", { name: /목록으로/ }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
