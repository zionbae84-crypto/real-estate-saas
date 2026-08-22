import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";
import { rules } from "../state/useAffordability";
import { CostBreakdown } from "./CostBreakdown";

function costs(overrides: Partial<CostBreakdownData> = {}): CostBreakdownData {
  return {
    acquisitionTax: 8_400_000,
    brokerageFee: 2_560_000,
    brokerageVat: 256_000,
    legalFee: 600_000,
    movingCost: 1_500_000,
    housingBondCost: 931_840,
    total: 14_247_840,
    ...overrides,
  };
}

describe("CostBreakdown", () => {
  it("접힌 요약에 합계를 보여준다", () => {
    render(<CostBreakdown costs={costs()} />);
    expect(screen.getByText("1,424만 7,840원")).toBeInTheDocument();
  });

  it("여섯 항목을 모두 표시한다", () => {
    render(<CostBreakdown costs={costs()} />);

    expect(
      screen.getByText("취득세 (지방교육세·농특세 포함)"),
    ).toBeInTheDocument();
    expect(screen.getByText("840만원")).toBeInTheDocument();

    expect(screen.getByText("중개보수")).toBeInTheDocument();
    expect(screen.getByText("256만원")).toBeInTheDocument();

    expect(screen.getByText(/중개보수 부가세/)).toBeInTheDocument();
    expect(screen.getByText("25만 6,000원")).toBeInTheDocument();

    expect(screen.getByText("법무사 비용")).toBeInTheDocument();
    expect(screen.getByText("60만원")).toBeInTheDocument();

    expect(screen.getByText("이사 비용")).toBeInTheDocument();
    expect(screen.getByText("150만원")).toBeInTheDocument();

    expect(screen.getByText(/국민주택채권/)).toBeInTheDocument();
    expect(screen.getByText("93만 1,840원")).toBeInTheDocument();
  });

  it("국민주택채권 항목에 추정치임을 밝힌다", () => {
    render(<CostBreakdown costs={costs()} />);
    // 라벨뿐 아니라 전체 추정치 취지의 문장이 나와야 한다 — 시가표준액
    // 비율과 할인율이 모두 검증되지 않은 가정치이기 때문에, 취득세처럼
    // 확정된 숫자와 같은 확신으로 보여주면 안 된다.
    expect(
      screen.getByText(
        /시가표준액 비율·할인율이 확정 값이 아니라 실제와 다를 수 있는 추정치/,
      ),
    ).toBeInTheDocument();
  });

  it("항목별 금액이 0이어도 표시된다", () => {
    const { container } = render(
      <CostBreakdown
        costs={costs({
          brokerageFee: 0,
          brokerageVat: 0,
          total: 11_431_840,
        })}
      />,
    );
    expect(screen.getByText("중개보수")).toBeInTheDocument();
    // dl 안의 0원 표기를 특정하기 위해 dd 요소로 좁힌다.
    const dds = container.querySelectorAll("dd");
    const texts = Array.from(dds).map((dd) => dd.textContent);
    expect(texts).toContain("0원");
  });

  it("합계는 total을 그대로 쓴다 — 항목을 다시 더하지 않는다", () => {
    // 각 항목의 실제 합과 다른 total을 일부러 넣는다. 화면에 그 다른
    // 값이 그대로 나오면 컴포넌트가 재계산하지 않는다는 뜻이다.
    render(<CostBreakdown costs={costs({ total: 99_999_999 })} />);
    expect(screen.getByText("9,999만 9,999원")).toBeInTheDocument();
  });

  it("중개보수 부가세 비율이 규칙셋과 일치한다", () => {
    render(<CostBreakdown costs={costs()} />);

    const vatPercent = Math.round(
      rules.brokerageVatRate * 100,
    ).toString();

    expect(screen.getByText(`중개보수 부가세 (${vatPercent}%)`)).toBeInTheDocument();
  });
});
