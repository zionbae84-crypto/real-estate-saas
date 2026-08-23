import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import rawRightsRules from "../../rules/rights-2026-08.json";
import { parseRightsRules, type RightsItem } from "../lib/rights";
import { RightsCheck } from "./RightsCheck";

const rules = parseRightsRules(rawRightsRules);

/** 항목의 fieldset을 legend(질문)로 찾는다 */
function fieldsetFor(item: RightsItem): HTMLElement {
  return screen.getByRole("group", { name: item.question });
}

/** 항목의 한 선택지를 고른다 */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  item: RightsItem,
  optionId: string,
): Promise<void> {
  const option = item.options.find((o) => o.id === optionId);
  if (option === undefined) throw new Error(`없는 선택지: ${item.id}.${optionId}`);
  await user.click(
    within(fieldsetFor(item)).getByRole("radio", { name: option.label }),
  );
}

function itemById(id: string): RightsItem {
  const item = rules.items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`없는 항목: ${id}`);
  return item;
}

/** 통과 가능한 답을 전부 채운다(각 항목의 첫 checked 선택지) */
async function answerEverything(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  for (const item of rules.items) {
    const option = item.options.find((o) => o.verdict === "checked");
    if (option === undefined) throw new Error(`checked 선택지가 없어요: ${item.id}`);
    await choose(user, item, option.id);
  }
}

describe("RightsCheck", () => {
  it("모든 항목의 질문·어디를 보는지·왜 중요한지를 함께 보여준다", () => {
    const { container } = render(<RightsCheck />);
    const text = container.textContent ?? "";
    for (const item of rules.items) {
      expect(text, item.id).toContain(item.question);
      expect(text, `${item.id}.where`).toContain(item.where);
      expect(text, `${item.id}.why`).toContain(item.why);
    }
  });

  it("문서의 네 축을 모두 덮는다", () => {
    render(<RightsCheck />);
    for (const section of ["표제부", "갑구", "을구", "등기부 밖"]) {
      expect(screen.getByRole("heading", { name: section })).toBeInTheDocument();
    }
  });

  it("항목마다 선택지가 라디오로 나오고, 처음에는 아무것도 골라져 있지 않다", () => {
    render(<RightsCheck />);
    for (const item of rules.items) {
      const radios = within(fieldsetFor(item)).getAllByRole("radio");
      expect(radios, item.id).toHaveLength(item.options.length);
      expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(
        true,
      );
    }
  });

  describe("금액 입력란", () => {
    it("'금액을 알아요'를 고르기 전에는 나오지 않는다", () => {
      render(<RightsCheck />);
      const mortgage = itemById("mortgage");
      expect(
        within(fieldsetFor(mortgage)).queryByLabelText(
          mortgage.amountLabel ?? "",
        ),
      ).toBeNull();
    });

    it("'없어요'·'모르겠어요'를 골라도 금액을 적을 자리를 주지 않는다", async () => {
      // 자리를 주면 거기 적은 0이 "확인한 0원"과 구별되지 않는다.
      const user = userEvent.setup();
      render(<RightsCheck />);
      const mortgage = itemById("mortgage");

      for (const optionId of ["none", "unknown"]) {
        await choose(user, mortgage, optionId);
        expect(
          within(fieldsetFor(mortgage)).queryByLabelText(
            mortgage.amountLabel ?? "",
          ),
          optionId,
        ).toBeNull();
      }
    });

    it("'금액을 알아요'를 고르면 룰셋이 정한 이름의 입력란이 나온다", async () => {
      const user = userEvent.setup();
      render(<RightsCheck />);
      const mortgage = itemById("mortgage");
      await choose(user, mortgage, "known");
      expect(
        within(fieldsetFor(mortgage)).getByLabelText(
          mortgage.amountLabel ?? "",
        ),
      ).toBeInTheDocument();
    });

    it("선택지를 바꿨다 되돌리면 예전 금액이 따라오지 않는다", async () => {
      const user = userEvent.setup();
      render(<RightsCheck />);
      const mortgage = itemById("mortgage");

      await choose(user, mortgage, "known");
      await user.type(
        within(fieldsetFor(mortgage)).getByLabelText(mortgage.amountLabel ?? ""),
        "30000",
      );
      // 입력란의 되비추기와 합계 계산 양쪽에 같은 금액이 뜬다.
      expect(screen.getAllByText("3억원").length).toBeGreaterThanOrEqual(2);

      await choose(user, mortgage, "none");
      await choose(user, mortgage, "known");

      const input = within(fieldsetFor(mortgage)).getByLabelText(
        mortgage.amountLabel ?? "",
      );
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  describe("모름은 통과가 아니다", () => {
    it("다 답해도 한 항목이 모름이면 결론이 '걸리는 게 없었어요'가 아니다", async () => {
      const user = userEvent.setup();
      const { container } = render(<RightsCheck />);

      await user.type(screen.getByLabelText(rules.encumbrance.priceLabel), "100000");
      await answerEverything(user);
      expect(container.querySelector(".rights-overall")?.textContent).toBe(
        rules.overall.clear.label,
      );

      await choose(user, itemById("seizure"), "unknown");
      expect(container.querySelector(".rights-overall")?.textContent).toBe(
        rules.overall.expert.label,
      );
    });
  });

  describe("사면 안 되는 신호", () => {
    it("stop 신호 하나면 다른 항목이 다 통과여도 결론이 '사면 안 돼요'다", async () => {
      const user = userEvent.setup();
      const { container } = render(<RightsCheck />);

      await user.type(screen.getByLabelText(rules.encumbrance.priceLabel), "100000");
      await answerEverything(user);
      await choose(user, itemById("auction"), "present");

      expect(container.querySelector(".rights-overall")?.textContent).toBe(
        rules.overall.stop.label,
      );
    });

    it("채권최고액이 매매가에 육박하면 항목이 다 통과여도 멈춘다", async () => {
      const user = userEvent.setup();
      const { container } = render(<RightsCheck />);

      // 매매 예정가 5억, 채권최고액 4.8억 → 96%
      await user.type(screen.getByLabelText(rules.encumbrance.priceLabel), "50000");
      await answerEverything(user);

      const mortgage = itemById("mortgage");
      await choose(user, mortgage, "known");
      await user.type(
        within(fieldsetFor(mortgage)).getByLabelText(mortgage.amountLabel ?? ""),
        "48000",
      );

      expect(container.querySelector(".rights-overall")?.textContent).toBe(
        rules.overall.stop.label,
      );
    });
  });

  it("아무 조작 없이도 화면 어디에서도 '안전'하다고 말하지 않는다", () => {
    const { container } = render(<RightsCheck />);
    const claims = (container.textContent ?? "")
      .split(/(?<=[.!?)]|요|다)\s+/)
      .filter(
        (sentence) =>
          /안전|사도 (돼|되)|괜찮|문제없/.test(sentence) &&
          !/아니|않|없어|말아|마세|아닌/.test(sentence),
      );
    expect(claims).toEqual([]);
  });
});
