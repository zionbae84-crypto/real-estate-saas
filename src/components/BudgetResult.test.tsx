import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AffordableResult } from "../lib/finance";
import { BudgetResult } from "./BudgetResult";

function result(overrides: Partial<AffordableResult> = {}): AffordableResult {
  return {
    affordablePrice: 640_000_000,
    loanLimit: {
      amount: 420_000_000,
      binding: "LTV",
      breakdown: { LTV: 420_000_000, DSR: 574_316_140, CAP: 600_000_000, POLICY: 0 },
    },
    costs: {
      acquisitionTax: 8_400_000,
      brokerageFee: 2_560_000,
      legalFee: 600_000,
      movingCost: 1_500_000,
      // Task 4로 CostBreakdown에 추가된 두 항목. 값은 실제 엔진
      // (calcAcquisitionCosts)이 가격 6억4천만원에서 산출하는 값과
      // 같게 맞췄다: brokerageVat = brokerageFee(2,560,000) * 10%.
      // housingBondCost = calcHousingBondCost(640_000_000, rules).
      brokerageVat: 256_000,
      housingBondCost: 931_840,
      // 위 두 항목이 늘어난 만큼 합계도 늘어난다.
      // 이전 값 13,060,000 → 새 값 14,247,840
      // (13,060,000 + 256,000 + 931,840).
      total: 14_247_840,
    },
    availableCash: 200_000_000,
    matchedPolicyLoans: [],
    warnings: [],
    ...overrides,
  };
}

/**
 * `safePrice`의 기본값을 `affordablePrice`와 같게 둔다(한 줄로 합쳐지는
 * 경로). safePrice와 관련 없는 테스트(실구매력 표시, 부대비용, 경고 등)가
 * `formatWon(affordablePrice)` 문자열이 SafeLine 안에 한 번 더 나타나
 * `getByText`가 "여러 개 발견"으로 실패하는 것을 피하기 위해서다. safePrice
 * 자체를 검증하는 테스트는 아래에서 명시적으로 다른 값을 넘긴다.
 */
interface RenderResultOverrides {
  result?: AffordableResult;
  safePrice?: number | null;
}

function renderResult(overrides: RenderResultOverrides = {}) {
  const r = overrides.result ?? result();
  // safePrice: null을 명시적으로 넘긴 테스트가 있으므로 `??`는 못 쓴다
  // (`??`는 null도 "값 없음"으로 취급해 기본값으로 되돌려 버린다 — 여기서
  // null은 유효한 실제 값이다). "제공 안 됨"만 undefined로 구분한다.
  const safePrice =
    overrides.safePrice === undefined ? r.affordablePrice : overrides.safePrice;
  render(<BudgetResult result={r} safePrice={safePrice} />);
}

describe("BudgetResult", () => {
  it("실구매력을 크게 보여준다", () => {
    renderResult();
    expect(screen.getByText("6억 4,000만원")).toBeInTheDocument();
  });

  it("부대비용 합계를 보여준다", () => {
    renderResult();
    // Task 4에서 costs.total에 brokerageVat·housingBondCost가 더해지며
    // 13,060,000 → 14,247,840으로 바뀌었다("1,306만원" → "1,424만 7,840원").
    expect(screen.getByText("1,424만 7,840원")).toBeInTheDocument();
  });

  it("무엇이 막았는지 한 줄로 보여준다", () => {
    renderResult();
    expect(
      screen.getByText("담보 가치(LTV)에 걸렸어요"),
    ).toBeInTheDocument();
  });

  it("걸린 제약의 상세 설명은 접힌 채로 들어 있다", () => {
    renderResult();
    // <details>는 열려 있지 않아도 텍스트가 DOM에 있다(jsdom은 CSS로
    // 접힌 콘텐츠의 렌더링을 계산하지 않는다) — 여기서는 "접혀 있다"는
    // 사실 자체(<details> 안에 있다)를 확인한다.
    const advice = screen.getByText(/현금을 더 모으면/);
    expect(advice.closest("details")).not.toBeNull();
  });

  it("실구매력이 0이면 숫자 대신 안내를 보여준다", () => {
    renderResult({ result: result({ affordablePrice: 0 }) });
    expect(
      screen.getByText(/현재 조건으로는 주택담보대출이 나오지 않아요/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
  });

  describe("실구매력 0원의 원인 안내", () => {
    // Group 3a 결함 재현: cash 0, income 3억, debt 0. 실제로는 매매가 0원에서도
    // 발생하는 고정 부대비용(법무비·이사비)조차 현금이 못 감당해서 0이 되는데,
    // breakdown.DSR이 nonzero인데도(소득이 3억이니 당연하다) 예전 문구는
    // 항상 "소득이 없거나 기존 부채가..."라고 잘못 말했다.
    it("DSR이 0이 아니면(소득·부채 문제가 아니면) 현금 부족을 원인으로 짚는다", () => {
      renderResult({
        result: result({
          affordablePrice: 0,
          loanLimit: {
            amount: 0,
            binding: "LTV",
            breakdown: { LTV: 0, DSR: 373_305_491, CAP: 600_000_000, POLICY: 0 },
          },
          warnings: ["고정 부대비용(법무비·이사비)만으로도 보유 현금을 넘어요."],
        }),
      });
      expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
      expect(
        screen.queryByText(/소득이 없거나 기존 부채가/),
      ).not.toBeInTheDocument();
    });

    it("DSR이 0이면 소득·부채 문제를 원인으로 짚는다", () => {
      renderResult({
        result: result({
          affordablePrice: 0,
          loanLimit: {
            amount: 0,
            binding: "LTV",
            breakdown: { LTV: 0, DSR: 0, CAP: 600_000_000, POLICY: 0 },
          },
        }),
      });
      expect(screen.getByText(/소득이 없거나 기존 부채가/)).toBeInTheDocument();
      expect(screen.queryByText(/현금을 더 모으면/)).not.toBeInTheDocument();
    });
  });

  it("경고가 있으면 결과 위에 보여준다", () => {
    renderResult({ result: result({ warnings: ["양도세가 반영되지 않았어요."] }) });
    expect(
      screen.getByText("양도세가 반영되지 않았어요."),
    ).toBeInTheDocument();
  });

  it("경고는 details 밖에 있다 — 접히지 않는다", () => {
    renderResult({ result: result({ warnings: ["양도세가 반영되지 않았어요."] }) });
    const warning = screen.getByText("양도세가 반영되지 않았어요.");
    expect(warning.closest("details")).toBeNull();
  });

  describe("안전선", () => {
    it("최대 가격과 다르면 안전선을 나란히 보여준다", () => {
      const r = result({ affordablePrice: 600_000_000 });
      renderResult({ result: r, safePrice: 480_000_000 });
      expect(screen.getByText(/4억 8,000만/)).toBeInTheDocument();
    });

    it("안전선이 null이면 문장으로 보여준다", () => {
      renderResult({ safePrice: null });
      expect(
        screen.getByText(/지금 조건으론 무리 없는 가격대가 없어요/),
      ).toBeInTheDocument();
    });

    it("안전선은 details 밖에 있다 — 접히지 않는다", () => {
      const r = result({ affordablePrice: 600_000_000 });
      renderResult({ result: r, safePrice: 480_000_000 });
      const safeLineText = screen.getByText("무리 없는 선");
      expect(safeLineText.closest("details")).toBeNull();
    });

    describe("리뷰 수정: 안전선이 없는 원인을 SafeLine에 그대로 전달한다 (Important 2)", () => {
      it("실구매력은 있지만(0 아님) DSR이 0이면 소득·부채를 원인으로 짚는다", () => {
        const r = result({
          affordablePrice: 600_000_000,
          loanLimit: {
            amount: 420_000_000,
            binding: "LTV",
            breakdown: { LTV: 420_000_000, DSR: 0, CAP: 600_000_000, POLICY: 0 },
          },
        });
        renderResult({ result: r, safePrice: null });
        expect(
          screen.getByText(/소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어/),
        ).toBeInTheDocument();
      });

      it("DSR이 0이 아니면 소득 탓으로 단정하지 않는다", () => {
        const r = result({ affordablePrice: 600_000_000 }); // 기본 DSR: 574_316_140
        renderResult({ result: r, safePrice: null });
        expect(screen.queryByText(/소득이 없거나 기존 부채가/)).not.toBeInTheDocument();
      });
    });
  });
});
