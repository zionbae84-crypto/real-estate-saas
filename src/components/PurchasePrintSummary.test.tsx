import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatWon } from "../format/won";
import type { InvestmentType } from "../lib/purchase";
import { PRINT_HIDDEN_SELECTORS } from "../print/hiddenInPrint";
import { purchaseRules } from "../state/usePurchaseCheck";
import { PurchaseCheck } from "./PurchaseCheck";
import {
  buildPurchasePrintItems,
  PurchasePrintSummary,
} from "./PurchasePrintSummary";

/**
 * 리뷰 수정(Important 3): 투자 경로 인쇄물에 입력 전제가 하나도 남지
 * 않았다.
 *
 * 값 입력란은 인쇄에서 지운다(`.purchase-form`) — 종이에서는 채울 수
 * 없기 때문이다. 그 대신 "결과가 다시 적으므로 잃는 정보가 없다"고 적어
 * 두었지만 실제로는 그렇지 않았다: 갭투자는 전세가율 지표가 매매가·
 * 전세보증금을 다시 적어 살아남지만, **월세 수익형 인쇄물에는 매매
 * 예정가·보증금·월세·연간 운영비용이 한 번도 나오지 않았다.**
 */

/**
 * 인쇄에서 살아남는 글자만 남긴다.
 *
 * jsdom은 `@media print`를 적용하지 못하므로, `PRINT_HIDDEN_SELECTORS`
 * (인쇄에서 지우는 선택자의 유일한 출처)에 걸리는 요소를 직접 걷어내
 * 종이에 남는 텍스트를 흉내낸다.
 */
function printText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const selector of PRINT_HIDDEN_SELECTORS) {
    for (const node of clone.querySelectorAll(selector)) node.remove();
  }
  return clone.textContent ?? "";
}

function renderCheck(type: InvestmentType) {
  return render(<PurchaseCheck type={type} />);
}

/** 만원 단위로 입력한다 — MoneyInput의 기본 해석이다 */
async function fill(label: string, man: string) {
  await userEvent.type(screen.getByLabelText(label), man);
}

const FIXED_NOW = () => new Date(2026, 7, 23);

describe("buildPurchasePrintItems", () => {
  it("갭투자는 세 입력을 그대로 적는다", () => {
    const items = buildPurchasePrintItems(purchaseRules, "갭투자", {
      price: 500_000_000,
      deposit: 400_000_000,
      cash: 200_000_000,
    });
    expect(items).toEqual([
      { label: "매매 예정가", value: formatWon(500_000_000) },
      { label: "전세보증금", value: formatWon(400_000_000) },
      { label: "보유 현금", value: formatWon(200_000_000) },
    ]);
  });

  it("월세 수익형은 월세·운영비용까지 적는다", () => {
    const items = buildPurchasePrintItems(purchaseRules, "월세수익형", {
      price: 500_000_000,
      deposit: 50_000_000,
      cash: 200_000_000,
      monthlyRent: 2_000_000,
      annualOperatingCost: 4_000_000,
      loan: { kind: "unknown" },
    });
    expect(items.map((item) => item.label)).toEqual([
      "매매 예정가",
      "보증금",
      "보유 현금",
      "월세",
      "연간 운영비용",
      purchaseRules.types.월세수익형.loanChoice.label,
    ]);
    expect(items[3]?.value).toBe(formatWon(2_000_000));
  });

  it("비어 있는 값은 0원이 아니라 '입력 안 함'이다", () => {
    // 종이에 박힌 0원은 언제나 가장 낙관적으로 읽힌다.
    const items = buildPurchasePrintItems(purchaseRules, "갭투자", {
      price: null,
      deposit: null,
      cash: null,
    });
    for (const item of items) expect(item.value).toBe("입력 안 함");
  });

  it("대출 금액은 '금액을 알아요'를 골랐을 때만 적는다", () => {
    const labels = (kind: "none" | "unknown") =>
      buildPurchasePrintItems(purchaseRules, "월세수익형", {
        price: null,
        deposit: null,
        cash: null,
        monthlyRent: null,
        annualOperatingCost: null,
        loan: { kind },
      }).map((item) => item.label);

    for (const kind of ["none", "unknown"] as const) {
      expect(labels(kind)).not.toContain("대출 원금");
    }

    const known = buildPurchasePrintItems(purchaseRules, "월세수익형", {
      price: null,
      deposit: null,
      cash: null,
      monthlyRent: null,
      annualOperatingCost: null,
      loan: {
        kind: "known",
        principal: 200_000_000,
        annualDebtService: 15_000_000,
        annualInterest: 12_000_000,
      },
    });
    expect(known.map((item) => item.label)).toContain("대출 원금");
    expect(known.map((item) => item.value)).toContain(formatWon(15_000_000));
  });

  it("대출 답 자체는 언제나 적는다 — '모르겠어요'도 사실이다", () => {
    const items = buildPurchasePrintItems(purchaseRules, "월세수익형", {
      price: null,
      deposit: null,
      cash: null,
      monthlyRent: null,
      annualOperatingCost: null,
      loan: { kind: "unknown" },
    });
    expect(items.map((item) => item.value)).toContain(
      purchaseRules.types.월세수익형.loanChoice.unknown,
    );
  });
});

describe("투자 경로 인쇄물", () => {
  it("월세 수익형 입력값이 종이에 남는다", async () => {
    const { container } = renderCheck("월세수익형");
    await fill("매매 예정가", "50000");
    await fill("보증금", "5000");
    await fill("보유 현금", "20000");
    await fill("월세", "200");
    // 550만원으로 둔다 — 400만원은 "2,400만원"(연간 임대소득)의 부분
    // 문자열이라 포함 검사가 공허하게 통과한다.
    await fill("연간 운영비용", "550");

    const paper = printText(container);
    for (const won of [500_000_000, 50_000_000, 200_000_000, 2_000_000, 5_500_000]) {
      expect(paper, formatWon(won)).toContain(formatWon(won));
    }
  });

  it("그 값들이 남는 자리는 인쇄물 요약뿐이다(이 컴포넌트가 필요한 이유)", async () => {
    // 요약을 걷어내면 월세·연간 운영비용이 종이에서 통째로 사라진다 —
    // 이 커밋 직전의 실제 상태다.
    const { container } = renderCheck("월세수익형");
    await fill("월세", "200");
    await fill("연간 운영비용", "550");

    const clone = container.cloneNode(true) as HTMLElement;
    for (const selector of [...PRINT_HIDDEN_SELECTORS, ".purchase-print-summary"]) {
      for (const node of clone.querySelectorAll(selector)) node.remove();
    }
    expect(clone.textContent).not.toContain(formatWon(2_000_000));
    expect(clone.textContent).not.toContain(formatWon(5_500_000));
  });

  it("인쇄일이 남는다", () => {
    const { container } = renderCheck("갭투자");
    // 컴포넌트 기본값은 실제 현재 시각이라, 날짜 글자 자체가 있는지만 본다.
    expect(printText(container)).toMatch(/인쇄일 \d{4}년 \d{1,2}월 \d{1,2}일/);
  });

  it("넘긴 날짜를 그대로 적는다", () => {
    const { container } = render(
      <PurchasePrintSummary
        rules={purchaseRules}
        type="갭투자"
        input={{ price: null, deposit: null, cash: null }}
        now={FIXED_NOW}
      />,
    );
    expect(container.querySelector(".purchase-print-summary-meta")?.textContent)
      .toBe(`구매 유형 기준 ${purchaseRules.version} · 인쇄일 2026년 8월 23일`);
  });

  it("어느 룰셋 기준인지가 남는다 — 실거주 룰셋 버전이 아니다", () => {
    const { container } = renderCheck("갭투자");
    const paper = printText(container);
    expect(paper).toContain(purchaseRules.version);
    // 실거주 룰셋의 문구("2026년 8월 규제 기준")는 이 화면 것이 아니다.
    expect(container.querySelector(".purchase-print-summary")?.textContent)
      .not.toMatch(/규제 기준/);
  });

  it("화면에서는 숨는다 — 입력란이 이미 같은 값을 되비춘다", () => {
    // 화면/인쇄 갈림은 styles.css가 하고, 여기서는 그 클래스가 붙어
    // 있는지만 본다(jsdom은 @media print를 적용하지 못한다).
    const { container } = renderCheck("갭투자");
    expect(container.querySelector(".purchase-print-summary")).not.toBeNull();
  });
});
