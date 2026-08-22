import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";
import { CostBreakdown } from "./CostBreakdown";

function costs(overrides: Partial<CostBreakdownData> = {}): CostBreakdownData {
  return {
    acquisitionTax: 8_400_000,
    brokerageFee: 2_560_000,
    legalFee: 600_000,
    movingCost: 1_500_000,
    total: 13_060_000,
    ...overrides,
  };
}

describe("CostBreakdown", () => {
  it("접힌 요약에 합계를 보여준다", () => {
    render(<CostBreakdown costs={costs()} />);
    expect(screen.getByText("1,306만원")).toBeInTheDocument();
  });

  it("펼치면 네 항목을 각각 이름과 금액으로 보여준다", () => {
    render(<CostBreakdown costs={costs()} />);
    expect(
      screen.getByText("취득세 (지방교육세·농특세 포함)"),
    ).toBeInTheDocument();
    expect(screen.getByText("840만원")).toBeInTheDocument();

    expect(screen.getByText("중개보수")).toBeInTheDocument();
    expect(screen.getByText("256만원")).toBeInTheDocument();

    expect(screen.getByText("법무사 비용")).toBeInTheDocument();
    expect(screen.getByText("60만원")).toBeInTheDocument();

    expect(screen.getByText("이사 비용")).toBeInTheDocument();
    expect(screen.getByText("150만원")).toBeInTheDocument();
  });

  it("항목별 금액이 0이어도 표시된다", () => {
    const { container } = render(
      <CostBreakdown costs={costs({ brokerageFee: 0, total: 10_500_000 })} />,
    );
    expect(screen.getByText("중개보수")).toBeInTheDocument();
    // dl 안의 0원 표기를 특정하기 위해 dd 요소로 좁힌다.
    const dds = container.querySelectorAll("dd");
    const texts = Array.from(dds).map((dd) => dd.textContent);
    expect(texts).toContain("0원");
  });
});
