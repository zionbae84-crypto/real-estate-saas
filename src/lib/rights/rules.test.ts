import { describe, expect, it } from "vitest";
import rawRightsRules from "../../../rules/rights-2026-08.json";
import { parseRightsRules } from "./rules";
import type { RightsItem, RightsOption } from "./types";

/** 검증을 통과하는 최소 룰셋. 각 테스트가 여기서 한 군데만 망가뜨린다. */
function minimalRules(): Record<string, unknown> {
  return {
    version: "test",
    effectiveFrom: "2026-01-01",
    verdictLabels: {
      stop: "사면 안 돼요",
      expert: "전문가 확인이 꼭 필요해요",
      checked: "확인했어요",
    },
    unansweredLabel: "아직 답하지 않았어요",
    overall: {
      stop: { label: "멈춰요", note: "n" },
      incomplete: { label: "덜 답했어요", note: "n" },
      expert: { label: "전문가에게요", note: "n" },
      clear: { label: "걸리는 게 없었어요", note: "n" },
    },
    disclaimer: ["법률 자문이 아니에요"],
    encumbrance: {
      priceLabel: "매매 예정가",
      sourceItemIds: ["money"],
      expertRatio: 0.7,
      stopRatio: 0.9,
      messages: {
        noPrice: "a",
        unknown: "b",
        stop: "c",
        expert: "d",
        checked: "e",
      },
    },
    items: [
      {
        id: "money",
        section: "을구",
        question: "q",
        where: "w",
        why: "y",
        amountLabel: "채권최고액 합계",
        options: [
          { id: "none", label: "없어요", verdict: "checked", amount: "zero" },
          { id: "known", label: "알아요", verdict: "checked", amount: "input" },
          {
            id: "unknown",
            label: "모르겠어요",
            verdict: "expert",
            amount: "unknown",
            unknown: true,
          },
        ],
      },
    ],
  };
}

/** minimalRules를 받아 한 군데를 망가뜨린 뒤 parse가 던지는지 확인한다 */
function expectRejected(mutate: (rules: Record<string, unknown>) => void): void {
  const broken = minimalRules();
  mutate(broken);
  expect(() => parseRightsRules(broken)).toThrow();
}

describe("권리분석 룰셋 파싱", () => {
  it("실제 룰셋 파일이 검증을 통과한다", () => {
    expect(() => parseRightsRules(rawRightsRules)).not.toThrow();
  });

  it("최소 룰셋이 통과한다(전제)", () => {
    // 아래 거부 테스트들이 "원래부터 실패하는 입력"을 쓰고 있지 않다는
    // 전제를 고정한다.
    expect(() => parseRightsRules(minimalRules())).not.toThrow();
  });

  it("객체가 아니면 거부한다", () => {
    expect(() => parseRightsRules(null)).toThrow();
    expect(() => parseRightsRules("문진")).toThrow();
  });

  describe("모름은 통과가 아니다 — 데이터 수준에서 잠근다", () => {
    it("모든 항목에 모름 선택지가 하나 이상 있다", () => {
      const rules = parseRightsRules(rawRightsRules);
      const without = rules.items
        .filter((item) => !item.options.some((o) => o.unknown === true))
        .map((item) => item.id);
      expect(without).toEqual([]);
    });

    it("모름 선택지의 판정이 checked인 항목이 없다", () => {
      const rules = parseRightsRules(rawRightsRules);
      const offenders: string[] = [];
      for (const item of rules.items) {
        for (const option of item.options) {
          if (option.unknown === true && option.verdict === "checked") {
            offenders.push(`${item.id}.${option.id}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("모름 선택지가 없는 항목을 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        for (const option of items[0]?.options ?? []) {
          delete (option as RightsOption).unknown;
        }
      });
    });

    it("모름 선택지를 checked로 만들면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const unknown = items[0]?.options.find((o) => o.unknown === true);
        if (unknown) unknown.verdict = "checked";
      });
    });
  });

  describe("항목·선택지의 모양", () => {
    it("항목 id가 중복되면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const first = items[0];
        if (first) items.push({ ...first });
      });
    });

    it("선택지 id가 항목 안에서 중복되면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const options = items[0]?.options;
        const first = options?.[0];
        if (options && first) options.push({ ...first });
      });
    });

    it("모르는 판정 값을 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const option = items[0]?.options[0];
        if (option) (option as { verdict: string }).verdict = "safe";
      });
    });

    it("모르는 구역(section)을 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const item = items[0];
        if (item) (item as { section: string }).section = "부록";
      });
    });

    it("어디를 보는지(where)가 비면 거부한다", () => {
      // 등기부를 처음 보는 사람은 이게 없으면 답할 수 없다.
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const item = items[0];
        if (item) item.where = "   ";
      });
    });

    it("왜 위험한지(why)가 비면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const item = items[0];
        if (item) item.why = "";
      });
    });

    it("선택지가 하나뿐이면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const item = items[0];
        if (item) item.options = [item.options[0] as RightsOption];
      });
    });
  });

  describe("채권 합계 계산 규칙", () => {
    it("sourceItemIds가 없는 항목을 가리키면 거부한다", () => {
      expectRejected((r) => {
        const e = r.encumbrance as { sourceItemIds: string[] };
        e.sourceItemIds = ["없는항목"];
      });
    });

    it("sourceItemIds가 가리키는 항목에 금액 입력 선택지가 없으면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const input = items[0]?.options.find((o) => o.amount === "input");
        if (input) input.amount = "zero";
      });
    });

    it("sourceItemIds가 가리키는 항목에 모름 금액 선택지가 없으면 거부한다", () => {
      // 모름이 없으면 그 항목은 "0원 아니면 입력"뿐이라, 모르는 사용자가
      // 0원을 고르게 된다 — 위험이 통째로 사라지는 바로 그 경로다.
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const unknown = items[0]?.options.find((o) => o.amount === "unknown");
        if (unknown) unknown.amount = "zero";
      });
    });

    it("금액 입력 선택지가 있는데 amountLabel이 없으면 거부한다", () => {
      expectRejected((r) => {
        const items = r.items as RightsItem[];
        const item = items[0];
        if (item) delete item.amountLabel;
      });
    });

    it("실제 룰셋에서 금액을 넣는 항목마다 amountLabel이 있다", () => {
      const rules = parseRightsRules(rawRightsRules);
      for (const id of rules.encumbrance.sourceItemIds) {
        const item = rules.items.find((candidate) => candidate.id === id);
        expect(item?.amountLabel, id).toBeTruthy();
      }
    });

    it("expertRatio가 stopRatio보다 크면 거부한다", () => {
      expectRejected((r) => {
        const e = r.encumbrance as { expertRatio: number; stopRatio: number };
        e.expertRatio = 0.95;
      });
    });

    it("임계값이 0 이하이면 거부한다", () => {
      expectRejected((r) => {
        (r.encumbrance as { expertRatio: number }).expertRatio = 0;
      });
    });

    it("임계값이 숫자가 아니면 거부한다", () => {
      expectRejected((r) => {
        (r.encumbrance as { stopRatio: unknown }).stopRatio = "0.9";
      });
    });
  });

  describe("결론 문구", () => {
    it("네 가지 전체 결론 문구가 모두 있어야 한다", () => {
      expectRejected((r) => {
        delete (r.overall as Record<string, unknown>).clear;
      });
    });

    it("면책 문구가 비면 거부한다", () => {
      expectRejected((r) => {
        r.disclaimer = [];
      });
    });

    /**
     * "안전"을 **긍정으로** 주장하는 문장만 골라낸다.
     *
     * 단순히 "안전"이라는 글자를 금지하면 이 제품이 가장 하고 싶은 말인
     * "'안전하다'는 뜻이 아니에요"까지 걸린다 — 부정문은 오히려 지켜야
     * 하는 문장이다. 그래서 문장 단위로 자른 뒤, 안전을 뜻하는 표현이
     * 있으면서 그것을 부정·경고하는 말이 함께 있지 않은 문장만 잡는다.
     */
    function claimsSafety(phrase: string): string[] {
      return phrase
        .split(/(?<=[.!?)]|요|다)\s+/)
        .filter(
          (sentence) =>
            /안전|사도 (돼|되)|사도 좋|괜찮|문제없|이상 없/.test(sentence) &&
            !/아니|않|없어|말아|마세|아닌/.test(sentence),
        );
    }

    it("안전 주장 탐지기가 실제로 뭔가를 잡는다(전제)", () => {
      // 아래 검사가 공허하게 통과하지 않도록, 탐지기가 긍정문은 잡고
      // 부정문은 놓아주는지 여기서 고정한다.
      expect(claimsSafety("이 집은 안전해요")).toHaveLength(1);
      expect(claimsSafety("사도 돼요")).toHaveLength(1);
      expect(claimsSafety("'안전하다'는 뜻이 아니에요")).toEqual([]);
    });

    it("실제 룰셋의 어떤 문구도 '안전'하다고 말하지 않는다", () => {
      const rules = parseRightsRules(rawRightsRules);
      const everyPhrase = [
        ...Object.values(rules.verdictLabels),
        rules.unansweredLabel,
        ...Object.values(rules.overall).flatMap((o) => [o.label, o.note]),
        ...rules.disclaimer,
        ...Object.values(rules.encumbrance.messages),
        ...rules.items.flatMap((item) => [
          item.question,
          item.where,
          item.why,
          ...item.options.flatMap((o) => [o.label, o.note ?? ""]),
        ]),
      ];
      const offenders = everyPhrase.flatMap(claimsSafety);
      expect(offenders).toEqual([]);
    });
  });
});
