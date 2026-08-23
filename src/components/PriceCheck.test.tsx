import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  BARGAIN_MUST_BE_ALLOWED,
  BARGAIN_MUST_BE_CAUGHT,
  bargainClaimsIn,
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  safetyClaimsIn,
} from "../../scripts/claims-safety";
import rawFinanceRules from "../../rules/2026-08.json";
import { COMPLEX_UNITS, type ComplexUnit } from "../data/complexes";
import { parseRules, type BuyerProfile } from "../lib/finance";
import type { PriceBudgetInput } from "../lib/price";
import { priceRules } from "../state/usePriceCheck";
import { PriceCheck } from "./PriceCheck";

const financeRules = parseRules(rawFinanceRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 600_000_000,
    annualIncome: 200_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 59,
    isRegulatedArea: true,
    ...overrides,
  };
}

const budget: PriceBudgetInput = { profile: profile(), financeRules };

/** 표본 조건을 넘는 평형(거래 10건, 10억~11억) */
function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  const areaBucket = overrides.areaBucket ?? 59;
  return {
    complexKey: "11680-9001",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket,
    maxExclusiveAreaSqm: areaBucket,
    landLeasehold: "N",
    tradeCount: 10,
    minPrice: 1_000_000_000,
    maxPrice: 1_100_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    lowConfidence: false,
    ...overrides,
  };
}

/** 만원 단위로 호가를 넣는다 — MoneyInput의 기본 해석이다 */
async function typeAsking(man: string) {
  await userEvent.type(
    screen.getByLabelText(priceRules.askingPrice.label),
    man,
  );
}

function overallText(): string {
  return document.querySelector(".price-overall")?.textContent ?? "";
}

function findingVerdicts(): string[] {
  return [...document.querySelectorAll(".price-finding-verdict")].map(
    (node) => node.textContent ?? "",
  );
}

describe("PriceCheck", () => {
  describe("무엇을 말하지 않는 화면인지 먼저 말한다", () => {
    it("입력란보다 앞에 '값을 매기지 않아요'가 있다", () => {
      const { container } = render(<PriceCheck unit={unit()} budget={null} />);
      const notice = container.querySelector(".price-no-estimate");
      const form = container.querySelector(".price-check-form");
      expect(notice?.textContent).toBe(
        priceRules.disclosure.noPointEstimateNote,
      );
      // 문서 순서상 안내가 폼보다 앞이다.
      expect(form).not.toBeNull();
      const order =
        notice === null || form === null
          ? 0
          : notice.compareDocumentPosition(form);
      expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("표본이 모자라면 화면도 말하지 않는다", () => {
    it("거래가 하한 미만이면 어떤 호가를 넣어도 위치 판정이 안 나온다", async () => {
      render(
        <PriceCheck
          unit={unit({ tradeCount: 1, minPrice: 1_000_000_000, maxPrice: 1_000_000_000 })}
          budget={null}
        />,
      );
      for (const man of ["50000", "100000", "300000"]) {
        await userEvent.clear(screen.getByLabelText(priceRules.askingPrice.label));
        await typeAsking(man);
        expect(findingVerdicts()).toContain(priceRules.verdictLabels.withheld);
        expect(findingVerdicts()).not.toContain(
          priceRules.verdictLabels.checked,
        );
      }
    });

    it("호가를 넣기 전에도 '넣어도 말하지 않을 거예요'라고 미리 말한다", () => {
      render(<PriceCheck unit={unit({ tradeCount: 1 })} budget={null} />);
      expect(
        screen.getByText(
          new RegExp(priceRules.overall.incomplete.pendingWithheldNote ?? "x"),
        ),
      ).toBeInTheDocument();
    });

    it("범위가 한 점이면 거래가 많아도 유보한다", async () => {
      // 번들 데이터의 51.7%가 이 경우다.
      render(
        <PriceCheck
          unit={unit({ tradeCount: 20, minPrice: 450_000_000, maxPrice: 450_000_000 })}
          budget={null}
        />,
      );
      await typeAsking("46000");
      expect(overallText()).toBe(priceRules.overall.withheld.label);
      expect(
        document.querySelector(".price-evidence-message")?.textContent,
      ).toBe(priceRules.evidence.messages.singlePoint);
    });
  });

  it("유보 이유를 두 번 읽히게 하지 않는다", async () => {
    render(<PriceCheck unit={unit({ tradeCount: 1 })} budget={null} />);
    await typeAsking("105000");
    const shown = [
      ...document.querySelectorAll(".price-evidence-message, .price-finding-message"),
    ].map((node) => node.textContent);
    expect(shown).toEqual([priceRules.evidence.messages.tooFewTrades]);
  });

  describe("이 판단이 몇 건에 근거하는지 숨기지 않는다", () => {
    it("판정을 유보할 때도 거래 건수와 범위를 적는다", async () => {
      render(<PriceCheck unit={unit({ tradeCount: 1 })} budget={null} />);
      await typeAsking("105000");
      expect(
        document.querySelector('[data-field="tradeCount"]')?.textContent,
      ).toBe("1건");
      expect(
        document.querySelector('[data-field="range"]')?.textContent,
      ).toContain("10억원");
    });

    it("판정이 났을 때도 같은 자리에 적는다", async () => {
      render(<PriceCheck unit={unit()} budget={null} />);
      await typeAsking("105000");
      expect(
        document.querySelector('[data-field="tradeCount"]')?.textContent,
      ).toBe("10건");
    });
  });

  describe("층·향 고지는 판정과 언제나 함께 나온다", () => {
    it.each([
      ["호가 없음", unit(), null],
      ["유보", unit({ tradeCount: 1 }), "105000"],
      ["범위 안", unit(), "105000"],
      ["범위 아래", unit(), "50000"],
      ["범위 조금 위", unit(), "120000"],
      ["범위 한참 위", unit(), "200000"],
    ])("%s일 때도 나온다", async (_label, u, man) => {
      const { unmount } = render(<PriceCheck unit={u} budget={budget} />);
      if (man !== null) await typeAsking(man);

      const disclosure =
        document.querySelector(".price-disclosure")?.textContent ?? "";
      expect(disclosure).toContain(priceRules.disclosure.floorNote);
      expect(disclosure).toContain(priceRules.disclosure.reportingLagNote);
      expect(disclosure).toContain(priceRules.disclosure.notAVerdictNote);
      // 층 범위 줄도 예외 없이 같은 자리에 있다 — 유보든 통과든.
      expect(
        document.querySelector('[data-field="floorRange"]')?.textContent,
      ).toMatch(/\d+층/);
      unmount();
    });

    it("층·향 고지가 층과 향을 실제로 말한다", () => {
      render(<PriceCheck unit={unit()} budget={null} />);
      const disclosure =
        document.querySelector(".price-disclosure")?.textContent ?? "";
      expect(disclosure).toMatch(/층/);
      expect(disclosure).toMatch(/향/);
    });
  });

  describe("층 고지는 막연한 사과가 아니라 구체적인 사실이다", () => {
    it("이 범위를 만든 거래가 몇 층부터 몇 층까지였는지 적는다", () => {
      render(
        <PriceCheck unit={unit({ minFloor: 2, maxFloor: 24 })} budget={null} />,
      );
      const line =
        document.querySelector('[data-field="floorRange"]')?.textContent ?? "";
      expect(line).toContain("2층");
      expect(line).toContain("24층");
    });

    it("층을 모르는 거래가 섞여 있으면 몇 건인지 함께 적는다", () => {
      render(
        <PriceCheck
          unit={unit({ minFloor: 2, maxFloor: 24, unknownFloorCount: 4 })}
          budget={null}
        />,
      );
      expect(
        document.querySelector('[data-field="floorPartialUnknown"]')?.textContent,
      ).toContain("4");
    });

    it("층을 다 아는 평형에는 그 덧말을 붙이지 않는다", () => {
      render(<PriceCheck unit={unit({ unknownFloorCount: 0 })} budget={null} />);
      expect(
        document.querySelector('[data-field="floorPartialUnknown"]'),
      ).toBeNull();
    });

    it("층을 하나도 모르면 모른다고 적는다 — 0층·1층을 지어내지 않는다", () => {
      render(
        <PriceCheck
          unit={unit({ minFloor: null, maxFloor: null, unknownFloorCount: 10 })}
          budget={null}
        />,
      );
      const line =
        document.querySelector('[data-field="floorRange"]')?.textContent ?? "";
      expect(line).toBe(priceRules.disclosure.floorUnknownNote);
      expect(line).not.toMatch(/0층|1층/);
    });

    it("층 고지에 자리표시자가 그대로 새어 나가지 않는다", () => {
      for (const u of [
        unit({ minFloor: 2, maxFloor: 24, unknownFloorCount: 4 }),
        unit({ minFloor: 9, maxFloor: 9 }),
        unit({ minFloor: null, maxFloor: null, unknownFloorCount: 10 }),
      ]) {
        const { container, unmount } = render(
          <PriceCheck unit={u} budget={null} />,
        );
        const text =
          container.querySelector(".price-disclosure")?.textContent ?? "";
        expect(text, text).not.toMatch(/[{}]/);
        unmount();
      }
    });

    it("보이는 층 고지가 룰셋 문구에서 온다(코드에 박혀 있지 않다)", () => {
      render(
        <PriceCheck unit={unit({ minFloor: 5, maxFloor: 12 })} budget={null} />,
      );
      expect(
        document.querySelector('[data-field="floorRange"]')?.textContent,
      ).toBe(
        priceRules.disclosure.floorRangeNote
          .replaceAll("{minFloor}", "5")
          .replaceAll("{maxFloor}", "12"),
      );
    });
  });

  describe("호가가 범위보다 한참 위일 때", () => {
    it("멈추라고 말하고, 바가지라고 단정하지는 않는다", async () => {
      render(<PriceCheck unit={unit()} budget={null} />);
      await typeAsking("200000"); // 20억 — 11억의 81% 초과

      expect(overallText()).toBe(priceRules.overall.stop.label);
      expect(findingVerdicts()).toContain(priceRules.verdictLabels.stop);
      expect(
        screen.getByText(priceRules.position.bands.aboveFar.message),
      ).toBeInTheDocument();
      // 초과분은 비율로만 말한다 — 적정가를 내지 않는다.
      expect(document.querySelector('[data-field="aboveMax"]')?.textContent).toBe(
        "81.8%",
      );
    });

    it("조금 위일 때는 멈추라고 하지 않는다(대조군)", async () => {
      render(<PriceCheck unit={unit()} budget={null} />);
      await typeAsking("120000"); // 12억 — 약 9.1% 초과
      expect(overallText()).toBe(priceRules.overall.expert.label);
    });
  });

  describe("등급은 색이 아니라 글자로 말한다", () => {
    it("모든 판정에서 룰셋의 판정 글자가 텍스트로 있다", async () => {
      render(<PriceCheck unit={unit()} budget={budget} />);
      await typeAsking("200000");
      for (const node of document.querySelectorAll(".price-finding")) {
        const verdict = node.getAttribute("data-verdict");
        const label = node.querySelector(".price-finding-verdict")?.textContent;
        expect(label, `${verdict ?? "?"} 줄에 등급 글자가 없다`).toBeTruthy();
      }
    });
  });

  describe("예산과의 연결", () => {
    it("예산이 없으면 실거주 기준 숫자를 하나도 내지 않는다", async () => {
      render(<PriceCheck unit={unit()} budget={null} />);
      await typeAsking("105000");
      for (const field of [
        "ownFunds",
        "neededLoan",
        "monthlyPayment",
        "burdenRatio",
        "availableCash",
      ]) {
        expect(document.querySelector(`[data-field="${field}"]`)).toBeNull();
      }
      expect(screen.getByText(priceRules.budget.absentNote)).toBeInTheDocument();
    });

    it("예산이 있으면 이 호가에서의 부담을 낸다", async () => {
      render(<PriceCheck unit={unit()} budget={budget} />);
      await typeAsking("105000");
      expect(document.querySelector('[data-field="neededLoan"]')).not.toBeNull();
      expect(
        document.querySelector('[data-field="monthlyPayment"]'),
      ).not.toBeNull();
      expect(screen.queryByText(priceRules.budget.absentNote)).toBeNull();
    });

    /**
     * `calcAcquisitionCosts`(acquisition-cost.ts)는 취득자의 주택 수를
     * 읽지 않고 언제나 무주택 기준 세율로 계산한다 — 이 호가의 부대비용
     * (`budgetCosts`)이 화면에 나오는 자리에는 그 사실과 방향(이미 집이
     * 있으면 부대비용이 이보다 커질 수 있다는 것)을 알리는 고지가
     * 반드시 함께 나가야 한다. 문구는 `rules/2026-08.json`의
     * `acquisitionTax.householdCountNote`에서 그대로 온다 — 코드에
     * 박은 문자열이 아니라는 것도 함께 확인한다.
     */
    it("부대비용 옆에 주택 수 고지가 룰셋 문구 그대로 나온다", async () => {
      render(<PriceCheck unit={unit()} budget={budget} />);
      await typeAsking("105000");
      expect(document.querySelector('[data-field="budgetCosts"]')).not.toBeNull();
      expect(
        screen.getByText(financeRules.acquisitionTax.householdCountNote),
      ).toBeInTheDocument();
    });

    it("예산이 없으면(부대비용 자체를 안 낸다) 주택 수 고지도 나오지 않는다", async () => {
      render(<PriceCheck unit={unit()} budget={null} />);
      await typeAsking("105000");
      expect(
        screen.queryByText(financeRules.acquisitionTax.householdCountNote),
      ).toBeNull();
    });

    it("대출이 0원이면 월 0원·부담률 0.0%를 표에 박지 않는다", async () => {
      // 현금만으로 덮이는 가격이다. ComplexList가 같은 경우에 숫자 대신
      // "대출 없이 살 수 있어요"라고 말하는 것과 같은 판단이다.
      render(<PriceCheck unit={unit()} budget={budget} />);
      await typeAsking("30000"); // 3억 — 보유 현금 6억으로 덮인다
      expect(document.querySelector('[data-field="neededLoan"]')?.textContent).toBe(
        "0원",
      );
      expect(document.querySelector('[data-field="monthlyPayment"]')).toBeNull();
      expect(document.querySelector('[data-field="burdenRatio"]')).toBeNull();
    });

    it("살 수 없는 호가에서는 월 상환액을 만들어 내지 않는다", async () => {
      const poor: PriceBudgetInput = {
        profile: profile({ cash: 10_000_000, annualIncome: 20_000_000 }),
        financeRules,
      };
      render(<PriceCheck unit={unit()} budget={poor} />);
      await typeAsking("105000");
      expect(document.querySelector('[data-field="monthlyPayment"]')).toBeNull();
      expect(document.querySelector('[data-field="shortfall"]')).not.toBeNull();
    });
  });

  describe("점 추정이 화면에 나오지 않는다", () => {
    /** 값을 단정하는 표현만 겨눈다(부정문은 이 제품이 지켜야 하는 말이다) */
    const POINT_ESTIMATE = /적정가|추정가|추정\s*시세|예상\s*(가격|시세)|시세는/;

    it("어떤 호가를 넣어도 적정가류 표현이 없다", async () => {
      const { container } = render(<PriceCheck unit={unit()} budget={budget} />);
      for (const man of ["50000", "100000", "105000", "120000", "200000"]) {
        await userEvent.clear(screen.getByLabelText(priceRules.askingPrice.label));
        await typeAsking(man);
        expect(POINT_ESTIMATE.test(container.textContent ?? "")).toBe(false);
      }
    });

    it("어떤 호가를 넣어도 범위 중간값이 화면에 없다", async () => {
      // 10억~11억의 중간값은 10억 5,000만원이다. 사용자가 그 값을 넣지
      // 않는 한 화면에 나올 이유가 없다.
      const { container } = render(<PriceCheck unit={unit()} budget={null} />);
      for (const man of ["50000", "100000", "120000", "200000"]) {
        await userEvent.clear(screen.getByLabelText(priceRules.askingPrice.label));
        await typeAsking(man);
        expect(container.textContent).not.toContain("10억 5,000만원");
      }
    });

    it("탐지기가 실제로 잡아낸다(변이 검사)", () => {
      expect(POINT_ESTIMATE.test("이 평형의 추정 시세는 10억이에요")).toBe(true);
      expect(POINT_ESTIMATE.test("앞으로의 시세를 전망하지 않아요")).toBe(false);
    });
  });

  describe("어떤 화면에서도 '안전·싸다'고 말하지 않는다", () => {
    it("두 탐지기가 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
      for (const caught of MUST_BE_CAUGHT) {
        expect(safetyClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of MUST_BE_ALLOWED) {
        expect(safetyClaimsIn(allowed), allowed).toEqual([]);
      }
      for (const caught of BARGAIN_MUST_BE_CAUGHT) {
        expect(bargainClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of BARGAIN_MUST_BE_ALLOWED) {
        expect(bargainClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it.each([
      ["표본 넉넉", unit()],
      ["거래 1건", unit({ tradeCount: 1, minPrice: 900_000_000, maxPrice: 900_000_000 })],
      ["한 점", unit({ tradeCount: 20, minPrice: 450_000_000, maxPrice: 450_000_000 })],
    ])("%s — 빈 화면과 호가를 넣은 화면 모두", async (_label, u) => {
      const { container, unmount } = render(
        <PriceCheck unit={u} budget={budget} />,
      );
      expect(safetyClaimsIn(container.textContent ?? "")).toEqual([]);
      expect(bargainClaimsIn(container.textContent ?? "")).toEqual([]);

      for (const man of ["40000", "105000", "200000"]) {
        await userEvent.clear(screen.getByLabelText(priceRules.askingPrice.label));
        await typeAsking(man);
        expect(safetyClaimsIn(container.textContent ?? "")).toEqual([]);
        expect(bargainClaimsIn(container.textContent ?? "")).toEqual([]);
      }
      unmount();
    });
  });

  describe("실제 번들 데이터", () => {
    it("표본이 모자란 평형에서 화면이 '확인했어요'를 내지 않는다", async () => {
      // 엔진 테스트가 전 평형을 훑으므로 여기서는 화면 배선만 확인한다 —
      // 렌더는 비싸서 표본을 몇 개만 고른다.
      const shortSampled = COMPLEX_UNITS.filter(
        (u) => u.tradeCount < priceRules.evidence.minTradeCount,
      ).slice(0, 5);
      expect(shortSampled.length).toBe(5);

      for (const u of shortSampled) {
        const { unmount } = render(<PriceCheck unit={u} budget={null} />);
        await typeAsking(String(Math.round(u.maxPrice / 10_000)));
        expect(findingVerdicts()).not.toContain(
          priceRules.verdictLabels.checked,
        );
        expect(findingVerdicts()).toContain(priceRules.verdictLabels.withheld);
        unmount();
      }
    });
  });
});
