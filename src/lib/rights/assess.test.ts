import { describe, expect, it } from "vitest";
import rawRightsRules from "../../../rules/rights-2026-08.json";
import { assessRights } from "./assess";
import { parseRightsRules } from "./rules";
import type {
  RightsAnswer,
  RightsAnswers,
  RightsItem,
  RightsOption,
  RightsRules,
} from "./types";

const rules = parseRightsRules(rawRightsRules);

/** 이 문진이 통째로 통과할 때 쓰는 매매가·금액(비율 0.02 — 임계값 한참 아래) */
const PRICE = 1_000_000_000;
const SMALL_AMOUNT = 10_000_000;

/** 선택지 하나를 답으로 만든다. 금액 입력 선택지에는 작은 금액을 채운다 */
function answerFor(option: RightsOption): RightsAnswer {
  return {
    optionId: option.id,
    amountWon: option.amount === "input" ? SMALL_AMOUNT : null,
  };
}

/** 항목마다 첫 번째 checked 선택지를 고른 답 — 이 문진이 낼 수 있는 최선 */
function bestCaseAnswers(source: RightsRules = rules): RightsAnswers {
  const out: Record<string, RightsAnswer> = {};
  for (const item of source.items) {
    const option = item.options.find((o) => o.verdict === "checked");
    if (option === undefined) throw new Error(`checked 선택지가 없는 항목: ${item.id}`);
    out[item.id] = answerFor(option);
  }
  return out;
}

/**
 * 판정에 영향을 주는 축만 남긴 대표 선택지들.
 *
 * 같은 항목 안에서 판정(verdict)과 금액 역할(amount)이 모두 같은
 * 선택지는 결론에 대해 구별되지 않으므로 하나만 남긴다. 전수 조사를
 * 실제로 돌릴 수 있는 크기(약 21만 조합)로 줄이면서, 결론이 달라질 수
 * 있는 조합은 하나도 빠뜨리지 않는다.
 */
function representativeOptions(item: RightsItem): RightsOption[] {
  const seen = new Set<string>();
  return item.options.filter((option) => {
    const key = `${option.verdict}|${option.amount ?? "none"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 대표 선택지들의 데카르트 곱을 훑는다 */
function forEachCombination(
  items: RightsItem[],
  visit: (answers: RightsAnswers) => void,
): number {
  const axes = items.map(representativeOptions);
  const picked: Record<string, RightsAnswer> = {};
  let visited = 0;

  function walk(depth: number): void {
    const item = items[depth];
    if (item === undefined) {
      visited += 1;
      visit({ ...picked });
      return;
    }
    for (const option of axes[depth] ?? []) {
      picked[item.id] = answerFor(option);
      walk(depth + 1);
    }
  }

  walk(0);
  return visited;
}

/** 결론 문구가 "안전"을 긍정으로 주장하는가 */
function claimsSafety(phrase: string): boolean {
  return phrase
    .split(/(?<=[.!?)]|요|다)\s+/)
    .some(
      (sentence) =>
        /안전|사도 (돼|되)|사도 좋|괜찮|문제없|이상 없/.test(sentence) &&
        !/아니|않|없어|말아|마세|아닌/.test(sentence),
    );
}

describe("권리분석 판정", () => {
  describe("전체 답변 공간 — 어떤 조합으로도 '안전'하다고 말하지 않는다", () => {
    it("모든 조합의 결론 문구가 안전을 주장하지 않고, 룰셋의 문구 그대로다", () => {
      const allowedLabels = new Set(
        Object.values(rules.overall).map((copy) => copy.label),
      );
      const offenders: string[] = [];
      let combinations = 0;

      combinations = forEachCombination(rules.items, (answers) => {
        const result = assessRights(rules, answers, PRICE);
        if (!allowedLabels.has(result.overallLabel)) {
          offenders.push(`룰셋 밖 문구: ${result.overallLabel}`);
        }
        if (claimsSafety(result.overallLabel) || claimsSafety(result.overallNote)) {
          offenders.push(`안전 주장: ${result.overallLabel} / ${result.overallNote}`);
        }
      });

      // 전수 조사가 실제로 돌았다는 전제를 고정한다 — 축이 하나라도
      // 비면 위 검사가 공허하게 통과한다.
      expect(combinations).toBeGreaterThan(100_000);
      expect([...new Set(offenders)]).toEqual([]);
    });

    it("clear는 모든 항목이 checked이고 합계 계산도 checked일 때만 나온다", () => {
      const wrong: string[] = [];

      forEachCombination(rules.items, (answers) => {
        const result = assessRights(rules, answers, PRICE);
        const everyItemChecked = result.findings.every(
          (finding) => finding.verdict === "checked",
        );
        const shouldBeClear =
          everyItemChecked && result.encumbrance.verdict === "checked";
        if ((result.overall === "clear") !== shouldBeClear) {
          wrong.push(JSON.stringify(answers));
        }
      });

      expect(wrong.slice(0, 3)).toEqual([]);
    });

    it("stop 신호가 하나라도 있으면 어떤 조합에서도 결론이 stop이다", () => {
      const wrong: string[] = [];

      forEachCombination(rules.items, (answers) => {
        const result = assessRights(rules, answers, PRICE);
        const hasStop =
          result.findings.some((finding) => finding.verdict === "stop") ||
          result.encumbrance.verdict === "stop";
        if (hasStop && result.overall !== "stop") {
          wrong.push(JSON.stringify(answers));
        }
      });

      expect(wrong.slice(0, 3)).toEqual([]);
    });
  });

  describe("'모르겠어요'는 통과가 아니다 — 모든 항목에 대해", () => {
    it("어느 항목에서든 모름을 고르면 결론이 clear가 되지 않는다", () => {
      const leaked: string[] = [];

      for (const item of rules.items) {
        for (const option of item.options) {
          if (option.unknown !== true) continue;
          const answers = {
            ...bestCaseAnswers(),
            [item.id]: answerFor(option),
          };
          const result = assessRights(rules, answers, PRICE);
          if (result.overall === "clear") {
            leaked.push(`${item.id}.${option.id}`);
          }
          const finding = result.findings.find((f) => f.item.id === item.id);
          if (finding?.verdict === "checked") {
            leaked.push(`${item.id}.${option.id} (항목 판정이 checked)`);
          }
        }
      }

      expect(leaked).toEqual([]);
    });

    it("검사할 모름 선택지가 실제로 있다(전제)", () => {
      const count = rules.items.flatMap((item) =>
        item.options.filter((o) => o.unknown === true),
      ).length;
      expect(count).toBeGreaterThanOrEqual(rules.items.length);
    });
  });

  describe("답하지 않은 항목은 통과가 아니다", () => {
    it("아무것도 답하지 않으면 incomplete이고 clear가 아니다", () => {
      const result = assessRights(rules, {}, PRICE);
      expect(result.overall).toBe("incomplete");
      expect(result.unansweredItemIds).toEqual(rules.items.map((i) => i.id));
    });

    it("한 항목만 비워도 clear가 되지 않는다", () => {
      for (const item of rules.items) {
        const answers: Record<string, RightsAnswer | undefined> = {
          ...bestCaseAnswers(),
        };
        delete answers[item.id];
        const result = assessRights(rules, answers, PRICE);
        expect(result.overall, item.id).toBe("incomplete");
      }
    });

    it("답하지 않은 항목의 판정은 null이고 라벨은 룰셋의 미답변 문구다", () => {
      const result = assessRights(rules, {}, PRICE);
      for (const finding of result.findings) {
        expect(finding.verdict).toBeNull();
        expect(finding.option).toBeNull();
        expect(finding.label).toBe(rules.unansweredLabel);
      }
    });

    it("빠뜨린 항목이 있어도 stop 신호가 있으면 stop이 이긴다", () => {
      const stopItem = rules.items.find((item) =>
        item.options.some((o) => o.verdict === "stop"),
      );
      expect(stopItem).toBeDefined();
      const stopOption = stopItem?.options.find((o) => o.verdict === "stop");
      const answers =
        stopItem && stopOption ? { [stopItem.id]: answerFor(stopOption) } : {};
      expect(assessRights(rules, answers, PRICE).overall).toBe("stop");
    });
  });

  describe("매매 예정가", () => {
    it("매매가를 모르면 다 답해도 clear가 아니다", () => {
      const result = assessRights(rules, bestCaseAnswers(), null);
      expect(result.overall).not.toBe("clear");
      expect(result.overall).toBe("incomplete");
    });
  });

  describe("최선의 결과", () => {
    it("모두 통과하면 clear이고, 그 문구는 '확인했어요'가 아니다", () => {
      const result = assessRights(rules, bestCaseAnswers(), PRICE);
      expect(result.overall).toBe("clear");
      expect(result.overallLabel).toBe(rules.overall.clear.label);
      // checked 라벨("확인했어요")은 개별 항목 전용이다.
      expect(result.overallLabel).not.toBe(rules.verdictLabels.checked);
    });

    it("결론에는 언제나 면책 문구가 함께 온다", () => {
      const result = assessRights(rules, bestCaseAnswers(), PRICE);
      expect(result.disclaimer).toEqual(rules.disclaimer);
      expect(result.disclaimer.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("판정은 코드가 아니라 룰 파일에서 온다", () => {
    /** 항목 하나의 한 선택지 판정만 바꾼 룰셋 사본 */
    function withVerdict(
      itemId: string,
      optionId: string,
      verdict: RightsOption["verdict"],
    ): RightsRules {
      return {
        ...rules,
        items: rules.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                options: item.options.map((option) =>
                  option.id === optionId ? { ...option, verdict } : option,
                ),
              }
            : item,
        ),
      };
    }

    it("룰 파일에서 판정을 바꾸면 같은 답의 결론이 따라 바뀐다", () => {
      const answers = bestCaseAnswers();
      expect(assessRights(rules, answers, PRICE).overall).toBe("clear");

      const stricter = withVerdict("auction", "none", "stop");
      expect(assessRights(stricter, answers, PRICE).overall).toBe("stop");

      const softer = withVerdict("auction", "none", "expert");
      expect(assessRights(softer, answers, PRICE).overall).toBe("expert");
    });

    it("결론 문구를 룰 파일에서 바꾸면 화면에 나갈 문구도 바뀐다", () => {
      const renamed: RightsRules = {
        ...rules,
        overall: {
          ...rules.overall,
          clear: { label: "다시 지은 문구", note: "다시 지은 설명" },
        },
      };
      const result = assessRights(renamed, bestCaseAnswers(), PRICE);
      expect(result.overallLabel).toBe("다시 지은 문구");
      expect(result.overallNote).toBe("다시 지은 설명");
    });
  });

  describe("항목별 결과", () => {
    it("모든 항목이 결과에 나오고, 순서와 개수가 룰셋과 같다", () => {
      const result = assessRights(rules, bestCaseAnswers(), PRICE);
      expect(result.findings.map((f) => f.item.id)).toEqual(
        rules.items.map((i) => i.id),
      );
    });

    it("각 판정 라벨은 룰셋의 verdictLabels에서 온다", () => {
      const result = assessRights(rules, bestCaseAnswers(), PRICE);
      for (const finding of result.findings) {
        expect(finding.label).toBe(rules.verdictLabels.checked);
      }
    });

    it("고른 선택지의 설명(note)을 그대로 전한다", () => {
      const item = rules.items.find((i) => i.id === "ownerMatch");
      const option = item?.options.find((o) => o.id === "different");
      expect(option?.note).toBeDefined();
      const result = assessRights(
        rules,
        { ownerMatch: { optionId: "different", amountWon: null } },
        PRICE,
      );
      const finding = result.findings.find((f) => f.item.id === "ownerMatch");
      expect(finding?.note).toBe(option?.note);
      expect(finding?.verdict).toBe("stop");
    });

    it("룰셋에 없는 선택지 id는 답하지 않은 것으로 본다", () => {
      const result = assessRights(
        rules,
        { ownerMatch: { optionId: "없는선택지", amountWon: null } },
        PRICE,
      );
      const finding = result.findings.find((f) => f.item.id === "ownerMatch");
      expect(finding?.verdict).toBeNull();
      expect(result.unansweredItemIds).toContain("ownerMatch");
    });
  });
});
