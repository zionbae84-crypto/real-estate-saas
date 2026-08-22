import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SafetyScore } from "../lib/finance";
import { SafetyBadge } from "./SafetyBadge";

function score(overrides: Partial<SafetyScore> = {}): SafetyScore {
  return {
    monthlyPayment: 1_467_052,
    burdenRatio: 0.2934,
    stressedMonthlyPayment: 1_837_407,
    stressedBurdenRatio: 0.3675,
    level: "caution",
    ...overrides,
  };
}

describe("SafetyBadge", () => {
  it("월 상환액을 보여준다", () => {
    render(<SafetyBadge safety={score()} />);
    expect(screen.getByText("146만 7,052원")).toBeInTheDocument();
  });

  it("부담률을 퍼센트로 보여준다", () => {
    render(<SafetyBadge safety={score()} />);
    expect(screen.getByText("29.3%")).toBeInTheDocument();
  });

  it("등급별 라벨을 보여준다", () => {
    const { rerender } = render(<SafetyBadge safety={score({ level: "safe" })} />);
    expect(screen.getByText("안전")).toBeInTheDocument();

    rerender(<SafetyBadge safety={score({ level: "caution" })} />);
    expect(screen.getByText("주의")).toBeInTheDocument();

    rerender(<SafetyBadge safety={score({ level: "danger" })} />);
    expect(screen.getByText("위험")).toBeInTheDocument();
  });

  it("월 상환액과 부담률을 data-field로 구분해 노출한다", () => {
    // 통합 테스트가 이 속성으로 값을 집는다. 지우면 그쪽이 깨진다.
    const { container } = render(<SafetyBadge safety={score()} />);
    expect(container.querySelector('[data-field="payment"]')).not.toBeNull();
    expect(container.querySelector('[data-field="ratio"]')).not.toBeNull();
  });

  it("등급을 data 속성으로 노출해 스타일이 붙게 한다", () => {
    const { container } = render(<SafetyBadge safety={score({ level: "danger" })} />);
    expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
  });

  it("금리 스트레스 시나리오도 함께 보여준다", () => {
    render(<SafetyBadge safety={score()} />);
    expect(screen.getByText(/금리가 2%p 오르면/)).toBeInTheDocument();
    expect(screen.getByText("183만 7,407원")).toBeInTheDocument();
  });

  it("소득이 0이면 부담률 대신 안내를 보여준다", () => {
    render(
      <SafetyBadge
        safety={score({
          burdenRatio: Number.POSITIVE_INFINITY,
          stressedBurdenRatio: Number.POSITIVE_INFINITY,
        })}
      />,
    );
    expect(screen.getByText("소득 없음")).toBeInTheDocument();
  });

  it("소득이 0인 경우에도 금리 스트레스 시나리오의 월 상환액을 보여준다", () => {
    render(
      <SafetyBadge
        safety={score({
          burdenRatio: Number.POSITIVE_INFINITY,
          stressedBurdenRatio: Number.POSITIVE_INFINITY,
        })}
      />,
    );
    expect(screen.getByText("183만 7,407원")).toBeInTheDocument();
  });
});
