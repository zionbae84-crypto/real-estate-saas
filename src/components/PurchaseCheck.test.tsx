import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { InvestmentType } from "../lib/purchase";
import { purchaseRules } from "../state/usePurchaseCheck";
import { PurchaseCheck } from "./PurchaseCheck";

/** 만원 단위로 입력한다 — MoneyInput의 기본 해석이다 */
async function fill(label: string, man: string) {
  await userEvent.type(screen.getByLabelText(label), man);
}

function setup(type: InvestmentType) {
  render(<PurchaseCheck type={type} />);
}

/**
 * 화면에 뜬 지표 이름들.
 *
 * `.purchase-metric-name`으로 좁힌다 — 같은 글자(예: "전세가율")가 값
 * 줄의 `<dt>`에도 나오기 때문에 텍스트만으로는 지표 줄을 가릴 수 없다.
 */
function metricNames(): string[] {
  return [...document.querySelectorAll(".purchase-metric-name")].map(
    (node) => node.textContent ?? "",
  );
}

/** 그 지표 줄의 등급 글자 */
function verdictOf(name: string): string {
  const heading = [...document.querySelectorAll(".purchase-metric-name")].find(
    (node) => node.textContent === name,
  );
  const metric = heading?.closest(".purchase-metric");
  if (metric === null || metric === undefined) {
    throw new Error(`지표 줄을 찾지 못했다: ${name}`);
  }
  return metric.querySelector(".purchase-metric-verdict")?.textContent ?? "";
}

describe("PurchaseCheck", () => {
  describe("대출 한도", () => {
    it.each(["갭투자", "월세수익형"] as const)(
      "%s에서는 한도를 계산하지 않는다고 먼저 말한다",
      (type) => {
        setup(type);
        expect(
          screen.getAllByText(purchaseRules.types[type].loanLimitNote).length,
        ).toBeGreaterThan(0);
      },
    );

    it("실거주 예산 화면의 말(살 수 있는 가격·대출 한도)이 나오지 않는다", () => {
      setup("갭투자");
      expect(screen.queryByText(/살 수 있는 가격/)).not.toBeInTheDocument();
      expect(screen.queryByText(/대출 가능액/)).not.toBeInTheDocument();
    });
  });

  describe("갭투자", () => {
    it("전세가율·필요 자기자금·역전세만 낸다", () => {
      setup("갭투자");
      expect(metricNames()).toEqual([
        "전세가율",
        "필요 자기자금",
        "역전세 시나리오",
      ]);
    });

    it("아무것도 안 넣으면 통과가 아니라 '아직 다 채우지 않았어요'다", () => {
      setup("갭투자");
      expect(
        screen.getByText(purchaseRules.overall.incomplete.label),
      ).toBeInTheDocument();
      // 낼 수 없는 값 자리에 0원·0.0%가 박히지 않는다.
      expect(document.querySelector('[data-field="jeonseRatio"]')).toBeNull();
    });

    it("값을 채우면 전세가율과 역전세 단계를 낸다", async () => {
      setup("갭투자");
      await fill("매매 예정가", "50000");
      await fill("전세보증금", "40000");
      await fill("보유 현금", "20000");

      expect(
        document.querySelector('[data-field="jeonseRatio"]')?.textContent,
      ).toBe("80.0%");
      // 전세가율 80%는 룰셋의 stopFrom이다.
      expect(verdictOf("전세가율")).toBe(
        purchaseRules.verdictLabels.stop,
      );
      expect(screen.getByText(/전세가 5% 하락/)).toBeInTheDocument();
      expect(screen.getByText(/전세가 30% 하락/)).toBeInTheDocument();
    });

    it("세입자 보증금이 부채로 안 잡힌다는 사실을 화면에 남긴다", () => {
      setup("갭투자");
      expect(
        screen.getByText(purchaseRules.metrics.reverseJeonse.depositIsNotDebtNote),
      ).toBeInTheDocument();
    });

    it("등급은 색이 아니라 글자로 말한다", async () => {
      setup("갭투자");
      await fill("매매 예정가", "50000");
      await fill("전세보증금", "40000");
      await fill("보유 현금", "20000");
      // 룰셋의 판정 라벨이 텍스트로 그대로 있어야 한다.
      expect(
        screen.getAllByText(purchaseRules.verdictLabels.stop).length,
      ).toBeGreaterThan(0);
    });
  });

  describe("월세 수익형", () => {
    it("Cap Rate·DSCR·RTI만 낸다", () => {
      setup("월세수익형");
      expect(metricNames()).toEqual([
        "필요 자기자금",
        "Cap Rate",
        "DSCR",
        "RTI",
      ]);
    });

    it("처음에는 대출 답이 '모르겠어요'다 — 없는 것으로 두지 않는다", () => {
      setup("월세수익형");
      const unknown = screen.getByLabelText(
        purchaseRules.types.월세수익형.loanChoice.unknown,
      );
      expect(unknown).toBeChecked();
      // 금액 입력란은 "알아요"를 고르기 전에는 나오지 않는다.
      expect(screen.queryByLabelText("연간 원리금 상환액")).not.toBeInTheDocument();
    });

    it("운영비용을 비워 두면 Cap Rate를 내지 않는다", async () => {
      setup("월세수익형");
      await fill("매매 예정가", "50000");
      await fill("월세", "200");

      expect(verdictOf("Cap Rate")).toBe(
        purchaseRules.verdictLabels.unknown,
      );
      expect(document.querySelector('[data-field="capRate"]')).toBeNull();
    });

    it("운영비용을 넣어야 Cap Rate가 나온다", async () => {
      setup("월세수익형");
      await fill("매매 예정가", "50000");
      await fill("월세", "200");
      await fill("연간 운영비용", "600");

      // 순영업소득 1,800만원 ÷ 5억 = 3.6%
      expect(document.querySelector('[data-field="capRate"]')?.textContent).toBe(
        "3.6%",
      );
    });

    it("대출을 안 낀다고 하면 DSCR을 '좋다'가 아니라 '낼 수 없다'로 낸다", async () => {
      setup("월세수익형");
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.none),
      );
      expect(verdictOf("DSCR")).toBe(
        purchaseRules.verdictLabels.unknown,
      );
      expect(
        screen.getByText(purchaseRules.metrics.dscr.messages.noLoan),
      ).toBeInTheDocument();
    });

    it("원리금을 넣으면 DSCR을 내고, 1.0 미만이면 못 갚는다고 말한다", async () => {
      setup("월세수익형");
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.known),
      );
      await fill("매매 예정가", "50000");
      await fill("월세", "200");
      await fill("연간 운영비용", "600");
      await fill("연간 원리금 상환액", "2000");

      expect(document.querySelector('[data-field="dscr"]')?.textContent).toBe(
        "0.90배",
      );
      expect(verdictOf("DSCR")).toBe(purchaseRules.verdictLabels.stop);
      expect(
        screen.getByText(purchaseRules.metrics.dscr.messages.stop),
      ).toBeInTheDocument();
    });

    it("RTI는 참고선을 넘어도 '확인했어요'라고 말하지 않는다", async () => {
      setup("월세수익형");
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.known),
      );
      await fill("월세", "200");
      await fill("연간 이자비용", "1000");

      // 2,400만 ÷ 1,000만 = 2.4배로 참고선(1.25)을 훌쩍 넘는다.
      expect(document.querySelector('[data-field="rti"]')?.textContent).toBe(
        "2.40배",
      );
      expect(verdictOf("RTI")).toBe(
        purchaseRules.verdictLabels.expert,
      );
      expect(
        screen.getByText(purchaseRules.metrics.rti.messages.aboveReference),
      ).toBeInTheDocument();
    });
  });

  it("어떤 화면에서도 안전하다고 말하지 않는다", () => {
    setup("갭투자");
    expect(screen.queryByText(/안심/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^사도 돼요$/)).not.toBeInTheDocument();
  });
});
