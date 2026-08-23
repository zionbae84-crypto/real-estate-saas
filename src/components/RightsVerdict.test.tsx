import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import rawRightsRules from "../../rules/rights-2026-08.json";
import { assessRights, parseRightsRules, type RightsAnswers } from "../lib/rights";
import { RightsVerdict } from "./RightsVerdict";

const rules = parseRightsRules(rawRightsRules);
const priceLabel = rules.encumbrance.priceLabel;

function bestCase(): RightsAnswers {
  const out: Record<string, { optionId: string; amountWon: number | null }> = {};
  for (const item of rules.items) {
    const option = item.options.find((o) => o.verdict === "checked");
    if (option === undefined) throw new Error(`checked 선택지가 없어요: ${item.id}`);
    out[item.id] = {
      optionId: option.id,
      amountWon: option.amount === "input" ? 10_000_000 : null,
    };
  }
  return out;
}

function renderVerdict(answers: RightsAnswers, price: number | null) {
  const assessment = assessRights(rules, answers, price);
  return render(
    <RightsVerdict assessment={assessment} priceLabel={priceLabel} />,
  );
}

describe("RightsVerdict", () => {
  describe("등급은 색이 아니라 글자로 말한다", () => {
    it("모든 항목의 판정이 텍스트로 나온다", () => {
      const { container } = renderVerdict(bestCase(), 1_000_000_000);
      const verdicts = [
        ...container.querySelectorAll(".rights-finding-verdict"),
      ].map((el) => el.textContent);
      expect(verdicts).toHaveLength(rules.items.length);
      expect(new Set(verdicts)).toEqual(new Set([rules.verdictLabels.checked]));
    });

    it("data-verdict를 전부 지워도 판정 글자가 남는다", () => {
      // 색 고리(data-verdict)가 없는 환경 — 흑백 인쇄·색각 이상 —
      // 에서도 경고가 사라지면 안 된다.
      const { container } = renderVerdict(
        { ...bestCase(), seizure: { optionId: "present", amountWon: null } },
        1_000_000_000,
      );
      for (const el of container.querySelectorAll("[data-verdict]")) {
        el.removeAttribute("data-verdict");
      }
      expect(container.textContent).toContain(rules.verdictLabels.stop);
      expect(container.textContent).toContain(rules.overall.stop.label);
    });

    it("답하지 않은 항목에는 미답변 문구가 글자로 붙는다", () => {
      const { container } = renderVerdict({}, null);
      const verdicts = [
        ...container.querySelectorAll(".rights-finding-verdict"),
      ].map((el) => el.textContent);
      expect(new Set(verdicts)).toEqual(new Set([rules.unansweredLabel]));
    });
  });

  describe("결론", () => {
    it("어떤 상태에서도 '안전'하다고 말하지 않는다", () => {
      for (const [answers, price] of [
        [bestCase(), 1_000_000_000],
        [{}, null],
        [
          { ...bestCase(), auction: { optionId: "present", amountWon: null } },
          1_000_000_000,
        ],
      ] as const) {
        const { container, unmount } = renderVerdict(answers, price);
        const text = container.textContent ?? "";
        const claims = text
          .split(/(?<=[.!?)]|요|다)\s+/)
          .filter(
            (sentence) =>
              /안전|사도 (돼|되)|괜찮|문제없/.test(sentence) &&
              !/아니|않|없어|말아|마세|아닌/.test(sentence),
          );
        expect(claims).toEqual([]);
        unmount();
      }
    });

    it("다 통과해도 결론은 '확인했어요'가 아니다", () => {
      const { container } = renderVerdict(bestCase(), 1_000_000_000);
      const overall = container.querySelector(".rights-overall");
      expect(overall?.textContent).toBe(rules.overall.clear.label);
      expect(overall?.textContent).not.toBe(rules.verdictLabels.checked);
    });

    it("면책 문구가 언제나 함께 나온다", () => {
      renderVerdict(bestCase(), 1_000_000_000);
      for (const line of rules.disclaimer) {
        expect(screen.getByText(line)).toBeInTheDocument();
      }
    });
  });

  describe("기존 권리 합계", () => {
    it("확인한 합계·매매 예정가·비율을 함께 보여준다", () => {
      const { container } = renderVerdict(
        {
          ...bestCase(),
          mortgage: { optionId: "known", amountWon: 300_000_000 },
        },
        1_000_000_000,
      );
      expect(
        container.querySelector('[data-field="knownTotal"]')?.textContent,
      ).toBe("3억원");
      expect(container.querySelector('[data-field="price"]')?.textContent).toBe(
        "10억원",
      );
      expect(container.querySelector('[data-field="ratio"]')?.textContent).toBe(
        "30.0%",
      );
    });

    it("모르는 금액이 있으면 어떤 항목인지 적고, 합계가 끝난 숫자가 아니라고 말한다", () => {
      const { container } = renderVerdict(
        {
          ...bestCase(),
          mortgage: { optionId: "unknown", amountWon: null },
        },
        1_000_000_000,
      );
      const unknownNote = container.querySelector(
        ".rights-encumbrance-unknown",
      )?.textContent;
      const mortgageQuestion = rules.items.find((i) => i.id === "mortgage")
        ?.question;
      expect(unknownNote).toContain(mortgageQuestion);
      expect(unknownNote).toContain("0원으로 두지 않아서");
    });

    /**
     * 리뷰 수정(Important 7): 13항목을 전부 "모르겠어요"로 답해도 확인한
     * 합계가 0원이라 비율이 0으로 나왔고, 화면에 "0.0%"가 그대로 박혔다.
     * 아래에 경고가 붙지만 표에 박힌 숫자가 경고문보다 먼저 읽힌다.
     */
    describe("모르는 금액이 있으면 비율 대신 못 낸다고 말한다", () => {
      /** 모든 항목을 그 항목의 모름 선택지로 답한다 */
      function allUnknown(): RightsAnswers {
        const out: Record<string, { optionId: string; amountWon: number | null }> = {};
        for (const item of rules.items) {
          const option = item.options.find((o) => o.unknown === true);
          if (option === undefined) throw new Error(`모름 선택지가 없어요: ${item.id}`);
          out[item.id] = { optionId: option.id, amountWon: null };
        }
        return out;
      }

      it("전부 모르겠어요면 '0.0%'가 화면에 나오지 않는다", () => {
        const { container } = renderVerdict(allUnknown(), 500_000_000);
        const ratio = container.querySelector('[data-field="ratio"]');
        expect(ratio?.textContent).not.toContain("%");
        expect(ratio?.textContent).toBe(
          rules.encumbrance.messages.ratioUnknown,
        );
      });

      it("한 항목만 모름이어도 비율을 내지 않는다", () => {
        const { container } = renderVerdict(
          {
            ...bestCase(),
            mortgage: { optionId: "unknown", amountWon: null },
          },
          1_000_000_000,
        );
        expect(
          container.querySelector('[data-field="ratio"]')?.textContent,
        ).toBe(rules.encumbrance.messages.ratioUnknown);
      });

      it("금액을 다 알면 비율을 숫자로 낸다", () => {
        const { container } = renderVerdict(
          {
            ...bestCase(),
            mortgage: { optionId: "known", amountWon: 300_000_000 },
          },
          1_000_000_000,
        );
        expect(
          container.querySelector('[data-field="ratio"]')?.textContent,
        ).toBe("30.0%");
      });
    });

    it("매매 예정가를 모르면 비율을 아예 내지 않는다", () => {
      const { container } = renderVerdict(bestCase(), null);
      expect(container.querySelector('[data-field="ratio"]')).toBeNull();
      expect(container.querySelector('[data-field="price"]')?.textContent).toBe(
        "아직 몰라요",
      );
    });
  });

  it("항목의 질문과 고른 답을 함께 남긴다(인쇄물에서 이게 근거가 된다)", () => {
    const { container } = renderVerdict(
      { ...bestCase(), ownerMatch: { optionId: "different", amountWon: null } },
      1_000_000_000,
    );
    const item = rules.items.find((i) => i.id === "ownerMatch");
    const option = item?.options.find((o) => o.id === "different");
    expect(container.textContent).toContain(item?.question);
    expect(container.textContent).toContain(option?.label);
    expect(container.textContent).toContain(option?.note);
  });
});
