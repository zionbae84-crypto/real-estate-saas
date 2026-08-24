import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  bargainClaimsIn,
  ratingClaimsIn,
  safetyClaimsIn,
} from "../../scripts/claims-safety";
import rawFinanceRules from "../../rules/2026-08.json";
import rawLocationRules from "../../rules/location-2026-08.json";
import rawPriceRules from "../../rules/price-2026-08.json";
import rawPurchaseRules from "../../rules/purchase-2026-08.json";
import rawRightsRules from "../../rules/rights-2026-08.json";
import { type BuyerProfile, parseRules } from "../lib/finance";
import { assessLocation, parseLocationRules } from "../lib/location";
import { assessPrice, parsePriceRules } from "../lib/price";
import { assessPurchase, parsePurchaseRules } from "../lib/purchase";
import { assessRights, parseRightsRules } from "../lib/rights";
import { PRINT_HIDDEN_SELECTORS } from "../print/hiddenInPrint";
import { summaryRules } from "../state/useDiagnosisSummary";
import { DiagnosisSummary } from "./DiagnosisSummary";

const rightsRules = parseRightsRules(rawRightsRules);
const purchaseRules = parsePurchaseRules(rawPurchaseRules);
const priceRules = parsePriceRules(rawPriceRules);
const locationRules = parseLocationRules(rawLocationRules);
const financeRules = parseRules(rawFinanceRules);

/** 항목마다 첫 checked 선택지를 골라 이 문진이 낼 수 있는 최선을 만든다 */
function bestCaseRights() {
  const answers: Record<string, { optionId: string; amountWon: number | null }> = {};
  for (const item of rightsRules.items) {
    const option = item.options.find((o) => o.verdict === "checked");
    if (option === undefined) throw new Error(`checked 선택지가 없는 항목: ${item.id}`);
    answers[item.id] = {
      optionId: option.id,
      amountWon: option.amount === "input" ? 10_000_000 : null,
    };
  }
  return assessRights(rightsRules, answers, 1_000_000_000);
}

function stopRights() {
  const item = rightsRules.items.find((i) => i.options.some((o) => o.verdict === "stop"));
  if (item === undefined) throw new Error("stop 항목을 찾지 못했다");
  const option = item.options.find((o) => o.verdict === "stop");
  if (option === undefined) throw new Error("stop 선택지를 찾지 못했다");
  return assessRights(rightsRules, { [item.id]: { optionId: option.id, amountWon: null } }, 1_000_000_000);
}

function clearPurchase() {
  return assessPurchase(purchaseRules, financeRules, {
    type: "갭투자",
    price: 1_000_000_000,
    deposit: 200_000_000,
    cash: 2_000_000_000,
  });
}

function richProfile(): BuyerProfile {
  return {
    status: "무주택",
    cash: 600_000_000,
    annualIncome: 200_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
  };
}

function clearPrice() {
  return assessPrice(
    priceRules,
    {
      tradeCount: 10,
      minPrice: 1_000_000_000,
      maxPrice: 1_100_000_000,
      minFloor: 3,
      maxFloor: 18,
      unknownFloorCount: 0,
    },
    1_050_000_000,
    { profile: richProfile(), financeRules },
  );
}

function locatedLocation() {
  return assessLocation(locationRules, {
    coordinate: { lat: 37.5, lon: 127.0 },
    subwayStations: [
      { id: "fixture-station", name: "픽스처역", lineName: "픽스처선", coordinate: { lat: 37.501, lon: 127.0 } },
    ],
    elementarySchools: [],
  });
}

/**
 * jsdom은 `@media print`를 흉내내지 못한다 — `PRINT_HIDDEN_SELECTORS`
 * (인쇄에서 지우는 선택자의 유일한 출처)에 걸리는 요소를 직접 걷어내
 * 종이에 남는 텍스트를 흉내낸다. `PurchasePrintSummary.test.tsx`와
 * 같은 패턴이다.
 */
function printText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const selector of PRINT_HIDDEN_SELECTORS) {
    for (const node of clone.querySelectorAll(selector)) node.remove();
  }
  return clone.textContent ?? "";
}

describe("DiagnosisSummary", () => {
  it("네 축이 모두 못 봤을 때도 네 줄이 나온다", () => {
    const { container } = render(
      <DiagnosisSummary rights={null} purchase={null} price={null} location={null} />,
    );
    const axisEls = container.querySelectorAll(".diagnosis-summary-axis");
    expect(axisEls).toHaveLength(4);
    for (const el of axisEls) {
      expect(el.getAttribute("data-status")).toBe("notLooked");
    }
  });

  it("권리분석이 stop이면 헤드라인이 stop이다", () => {
    const { container } = render(
      <DiagnosisSummary rights={stopRights()} purchase={null} price={null} location={null} />,
    );
    const headline = container.querySelector(".diagnosis-summary-headline");
    expect(headline?.getAttribute("data-headline")).toBe("stop");
    expect(headline?.textContent).toBe(summaryRules.headline.stop.label);
  });

  it("실거주 경로(호가·입지 있음, 구매 유형별 금융은 못 봄)에서도 네 줄이 다 나온다", () => {
    const { container } = render(
      <DiagnosisSummary
        rights={bestCaseRights()}
        purchase={null}
        price={clearPrice()}
        location={locatedLocation()}
      />,
    );
    const purchaseLine = container.querySelector('[data-axis="purchase"]');
    expect(purchaseLine?.getAttribute("data-status")).toBe("notLooked");
    expect(purchaseLine?.textContent).toContain(summaryRules.notLooked.purchase.note);

    const locationLine = container.querySelector('[data-axis="location"]');
    // 입지는 판정 값이 아니라 상태(located)를 그대로 보여준다.
    expect(locationLine?.getAttribute("data-status")).toBe("located");
  });

  it("투자 경로(구매 유형별 금융 있음, 호가·입지는 못 봄)에서도 네 줄이 다 나온다", () => {
    const { container } = render(
      <DiagnosisSummary
        rights={bestCaseRights()}
        purchase={clearPurchase()}
        price={null}
        location={null}
      />,
    );
    const priceLine = container.querySelector('[data-axis="price"]');
    expect(priceLine?.getAttribute("data-status")).toBe("notLooked");
    const locationLine = container.querySelector('[data-axis="location"]');
    expect(locationLine?.getAttribute("data-status")).toBe("notLooked");
  });

  it("대상이 다를 수 있다는 고지가 항상 나온다", () => {
    const { container } = render(
      <DiagnosisSummary
        rights={bestCaseRights()}
        purchase={null}
        price={clearPrice()}
        location={locatedLocation()}
      />,
    );
    expect(container.textContent).toContain(summaryRules.targetMismatchNote);
  });

  it("면책 문구가 항상 나온다", () => {
    const { container } = render(
      <DiagnosisSummary rights={null} purchase={null} price={null} location={null} />,
    );
    for (const line of summaryRules.disclaimer) {
      expect(container.textContent).toContain(line);
    }
  });

  it("어느 조합에서도 안전·바가지·등급 주장이 화면에 나오지 않는다", () => {
    const scenarios = [
      { rights: null, purchase: null, price: null, location: null },
      { rights: bestCaseRights(), purchase: null, price: clearPrice(), location: locatedLocation() },
      { rights: stopRights(), purchase: clearPurchase(), price: null, location: null },
    ];
    for (const scenario of scenarios) {
      const { container } = render(<DiagnosisSummary {...scenario} />);
      const text = container.textContent ?? "";
      expect(safetyClaimsIn(text)).toEqual([]);
      expect(bargainClaimsIn(text)).toEqual([]);
      expect(ratingClaimsIn(text)).toEqual([]);
    }
  });

  describe("인쇄에서 살아남는다", () => {
    it("헤드라인·축별 상태·대상 고지·면책이 모두 종이 텍스트에 남는다", () => {
      const { container } = render(
        <DiagnosisSummary
          rights={bestCaseRights()}
          purchase={null}
          price={clearPrice()}
          location={locatedLocation()}
        />,
      );
      const text = printText(container);
      expect(text).toContain(summaryRules.title);
      expect(text).toContain(summaryRules.notLooked.purchase.note);
      expect(text).toContain(summaryRules.targetMismatchNote);
      for (const line of summaryRules.disclaimer) {
        expect(text).toContain(line);
      }
    });

    // 변이 검사: printText 헬퍼 자체가 실제로 무언가를 지우는지 확인한다.
    // 이게 없으면 위 "살아남는다" 검사가 애초에 아무것도 지우지 않아
    // 공허하게 통과할 수 있다.
    it("PRINT_HIDDEN_SELECTORS에 걸리는 요소는 실제로 지워진다(전제)", () => {
      const probe = document.createElement("div");
      probe.innerHTML = '<div class="profile-form">지워져야 함</div><div>남아야 함</div>';
      document.body.appendChild(probe);
      const text = printText(probe);
      expect(text).not.toContain("지워져야 함");
      expect(text).toContain("남아야 함");
      probe.remove();
    });
  });
});
