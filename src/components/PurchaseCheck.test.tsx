import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  safetyClaimsIn,
} from "../../scripts/claims-safety";
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

  /**
   * 리뷰 수정(Critical 1): 부대비용 계산에는 취득자의 주택 수가 들어 있지
   * 않다. 예전 화면은 "실제 조건이 다르면 부대비용은 이보다 작아질 수
   * 있어요"라고 한 방향으로만 단언했는데, 그 문장은 이름 붙이지 않은 세
   * 번째 전제(주택 수)에 대해서는 정확히 반대다.
   */
  describe("부대비용 전제 — 주택 수", () => {
    it.each(["갭투자", "월세수익형"] as const)(
      "%s 화면이 주택 수를 묻지 않았다는 사실을 말한다",
      (type) => {
        setup(type);
        expect(
          screen.getByText(purchaseRules.acquisition.householdCountNote),
        ).toBeInTheDocument();
      },
    );

    it("부대비용이 이보다 작아질 수 있다고 단언하지 않는다", () => {
      setup("갭투자");
      expect(document.body.textContent).not.toMatch(/작아질 수 있어요/);
      expect(document.body.textContent).toMatch(/커질 수 있어요/);
    });
  });

  /**
   * 리뷰 수정(Important 2): 월세 화면의 필드 라벨은 "보증금"인데 결과
   * 문구가 "전세보증금"이라고 말하면 사용자가 방금 적은 값과 다른 것을
   * 가리키는 말이 된다.
   */
  describe("필요 자기자금 문구는 유형별로 갈린다", () => {
    it("월세 화면 어디에도 '전세보증금'이 나오지 않는다", () => {
      setup("월세수익형");
      expect(document.body.textContent).not.toContain("전세보증금");
    });

    it("갭투자 화면은 여전히 전세보증금이라고 말한다(대조군)", () => {
      setup("갭투자");
      expect(document.body.textContent).toContain("전세보증금");
    });
  });

  /**
   * 리뷰 수정(Important 1): 화면이 스스로 물어서 받은 대출 답을 필요
   * 자기자금에서 무시하고 있었다.
   */
  describe("월세 수익형 — 대출과 필요 자기자금", () => {
    it("대출이 있다고만 답하면 필요 자기자금을 내지 않는다", async () => {
      setup("월세수익형");
      await fill("매매 예정가", "50000");
      await fill("보증금", "5000");
      await fill("보유 현금", "20000");

      expect(verdictOf("필요 자기자금")).toBe(
        purchaseRules.verdictLabels.unknown,
      );
      expect(
        document.querySelector('[data-field="ownFundsRequired"]'),
      ).toBeNull();
      expect(
        screen.getByText(
          purchaseRules.metrics.ownFunds.messages.월세수익형.loanUnknown,
        ),
      ).toBeInTheDocument();
    });

    it("대출 원금 칸은 '금액을 알아요'를 고른 뒤에 나온다", async () => {
      setup("월세수익형");
      expect(screen.queryByLabelText("대출 원금")).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.known),
      );
      expect(screen.getByLabelText("대출 원금")).toBeInTheDocument();
    });

    it("원금을 넣으면 그만큼 뺀 필요 자기자금이 나오고, 그 전제를 함께 말한다", async () => {
      setup("월세수익형");
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.known),
      );
      await fill("매매 예정가", "50000");
      await fill("보증금", "5000");
      await fill("보유 현금", "20000");
      await fill("대출 원금", "20000");

      const required = document.querySelector(
        '[data-field="ownFundsRequired"]',
      )?.textContent;
      expect(required).not.toBeUndefined();
      expect(
        document.querySelector('[data-field="ownFundsLoanPrincipal"]')
          ?.textContent,
      ).toBe("2억원");
      expect(
        screen.getByText(purchaseRules.metrics.ownFunds.loanAssumptionNote),
      ).toBeInTheDocument();
    });

    it("대출을 끼지 않는다고 답하면 그 전제 문구는 붙지 않는다", async () => {
      setup("월세수익형");
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.none),
      );
      await fill("매매 예정가", "50000");
      await fill("보증금", "5000");
      await fill("보유 현금", "20000");
      expect(
        screen.queryByText(purchaseRules.metrics.ownFunds.loanAssumptionNote),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * 리뷰 수정(Minor 4): 분자를 감추고 비율만 내지 않는다. 남는 현금이
   * 음수면 "역전세에 쓸 수 있는 현금" 줄은 사라지는데, 그때 "보증금 반환
   * 여력"만 음수 배수로 남으면 무엇을 무엇으로 나눈 숫자인지가 사라진다.
   */
  describe("갭투자 — 현금이 모자랄 때의 역전세 줄", () => {
    async function fillShort() {
      await fill("매매 예정가", "50000");
      await fill("전세보증금", "20000");
      await fill("보유 현금", "10000");
    }

    it("남는 현금이 음수면 반환 여력도 함께 감춘다", async () => {
      setup("갭투자");
      await fillShort();
      expect(document.querySelector('[data-field="reverseRemaining"]')).toBeNull();
      expect(document.querySelector('[data-field="reverseCoverage"]')).toBeNull();
      // 못 막는다는 사실은 단계별 글자가 그대로 말한다.
      expect(
        screen.getAllByText("남는 현금으로 못 막아요").length,
      ).toBeGreaterThan(0);
    });

    it("남는 현금이 있으면 둘 다 나온다(대조군)", async () => {
      setup("갭투자");
      await fill("매매 예정가", "50000");
      await fill("전세보증금", "20000");
      await fill("보유 현금", "40000");
      expect(
        document.querySelector('[data-field="reverseRemaining"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-field="reverseCoverage"]'),
      ).not.toBeNull();
    });
  });

  /**
   * 리뷰 수정(Important 4): 권리분석 화면과 같은 그물을 여기에도 건다.
   * 렌더 결과 **전체**를 탐지기에 통과시킨다 — 특정 단어 하나를
   * queryByText로 찾는 것으로는 "안심하고 진행하세요" 같은 문장을 놓친다.
   */
  describe("어떤 화면에서도 '안전'하다고 말하지 않는다", () => {
    it("안전 주장 탐지기가 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
      for (const caught of MUST_BE_CAUGHT) {
        expect(safetyClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of MUST_BE_ALLOWED) {
        expect(safetyClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it("갭투자 — 빈 화면과 다 채운 화면 모두", async () => {
      const { container, unmount } = render(<PurchaseCheck type="갭투자" />);
      expect(safetyClaimsIn(container.textContent ?? "")).toEqual([]);
      await fill("매매 예정가", "50000");
      await fill("전세보증금", "20000");
      await fill("보유 현금", "40000");
      expect(safetyClaimsIn(container.textContent ?? "")).toEqual([]);
      unmount();
    });

    it("월세 수익형 — 빈 화면과 다 채운 화면 모두", async () => {
      const { container, unmount } = render(
        <PurchaseCheck type="월세수익형" />,
      );
      expect(safetyClaimsIn(container.textContent ?? "")).toEqual([]);
      await userEvent.click(
        screen.getByLabelText(purchaseRules.types.월세수익형.loanChoice.known),
      );
      for (const [label, man] of [
        ["매매 예정가", "50000"],
        ["보증금", "5000"],
        ["보유 현금", "40000"],
        ["월세", "300"],
        ["연간 운영비용", "300"],
        ["대출 원금", "10000"],
        ["연간 원리금 상환액", "500"],
        ["연간 이자비용", "300"],
      ] as const) {
        await fill(label, man);
      }
      expect(safetyClaimsIn(container.textContent ?? "")).toEqual([]);
      unmount();
    });
  });
});
