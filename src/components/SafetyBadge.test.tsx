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

  describe("Group 3b: 대출 없이(월 상환액 0원) 전액 현금으로 사는 경우", () => {
    // 재현: cash 3억, income 0. safety.ts는 소득 0일 때 burdenRatio를
    // Infinity로 돌려주고 그것이 danger 임계값을 넘어 level이 "위험"이
    // 된다 — 엔진의 올바른 판단이며 이 테스트는 그 level을 바꾸라고
    // 요구하지 않는다. 다만 "월 상환액 0원" 옆에 "위험" 배지만 있으면
    // 모순처럼 보이므로, 그 이유를 설명하는 문구가 함께 있어야 한다.
    it("월 상환액이 0원이고 소득 정보가 없으면 등급이 상환 부담이 아니라 소득 부재를 반영한다고 설명한다", () => {
      render(
        <SafetyBadge
          safety={score({
            monthlyPayment: 0,
            burdenRatio: Number.POSITIVE_INFINITY,
            stressedMonthlyPayment: 0,
            stressedBurdenRatio: Number.POSITIVE_INFINITY,
            level: "danger",
          })}
        />,
      );
      expect(screen.getByText("위험")).toBeInTheDocument();
      expect(screen.getByText(/대출 없이 전액 현금으로/)).toBeInTheDocument();
      expect(
        screen.getByText(/소득 정보가 없다는 사실을 반영해요/),
      ).toBeInTheDocument();
    });

    it("월 상환액이 0원이지만 실제 소득이 있으면(부담률이 유한하면) 소득 부재 설명 없이 대출 없음만 짚는다", () => {
      render(
        <SafetyBadge
          safety={score({
            monthlyPayment: 0,
            burdenRatio: 0,
            stressedMonthlyPayment: 0,
            stressedBurdenRatio: 0,
            level: "safe",
          })}
        />,
      );
      expect(screen.getByText(/대출 없이 전액 현금으로/)).toBeInTheDocument();
      expect(
        screen.queryByText(/소득 정보가 없다는 사실을 반영해요/),
      ).not.toBeInTheDocument();
    });

    it("월 상환액이 0원이 아니면 대출 없음 설명을 보여주지 않는다", () => {
      render(<SafetyBadge safety={score()} />);
      expect(
        screen.queryByText(/대출 없이 전액 현금으로/),
      ).not.toBeInTheDocument();
    });
  });
});
