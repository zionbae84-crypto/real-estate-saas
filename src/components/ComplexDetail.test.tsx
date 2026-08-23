import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import type { BurdenAtPrice, CostBreakdown as CostBreakdownData } from "../lib/finance";
import { ComplexDetail } from "./ComplexDetail";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket: 59,
    medianPrice: 300_000_000,
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
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} onClose={vi.fn()} />,
    );
    const title = container.querySelector(".complex-detail-title")?.textContent ?? "";
    expect(title).toMatch(/테스트아파트/);
    expect(title).toMatch(/59㎡/);
    expect(title).toMatch(/대치동/);
    expect(screen.getByText(/2억 8,000만원 ~ 3억 2,000만원/)).toBeInTheDocument();
    expect(screen.getByText(/거래 5건/)).toBeInTheDocument();
  });

  it("medianPrice를 화면에 내지 않는다", () => {
    // 부모 스펙 §12. medianPrice(3억)는 min(2.8억)·max(3.2억) 어느
    // 쪽과도 겹치지 않는다.
    const { container } = render(
      <ComplexDetail
        unit={unit({ medianPrice: 300_000_000 })}
        burden={burden()}
        costs={costs()}
        onClose={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/(^|[^,\d])3억원/);
  });

  it("변동률을 화면에 내지 않는다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} onClose={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/상승|하락|변동률|수익률/);
  });

  it("어느 가격 기준인지 문구로 드러낸다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} onClose={vi.fn()} />,
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
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/취득세/)).toBeInTheDocument();
    expect(screen.getByText(/320만원/)).toBeInTheDocument();
  });

  it("전용면적을 반영했다는 사실과 실구매력이 함께 바뀔 수 있다는 사실을 알려준다", () => {
    render(
      <ComplexDetail unit={unit({ areaBucket: 59 })} burden={burden()} costs={costs()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/59㎡.*반영해서 계산했어요/)).toBeInTheDocument();
    expect(screen.getByText(/실구매 가능 가격도 함께 바뀌었을 수 있어요/)).toBeInTheDocument();
  });

  it("목록으로 버튼을 누르면 닫는다", () => {
    const onClose = vi.fn();
    render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()} onClose={onClose} />,
    );
    screen.getByRole("button", { name: /목록으로/ }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
