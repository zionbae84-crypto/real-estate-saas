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

/** 실제 룰셋에서 항목 하나를 꺼낸다. 없으면 그 자리에서 실패한다 */
function realItem(id: string): RightsItem {
  const rules = parseRightsRules(rawRightsRules);
  const item = rules.items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`룰셋에 없는 항목: ${id}`);
  return item;
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

  /**
   * 리뷰 수정(Critical 1): 예전 `priorDeposit`은 "전입신고와 확정일자를
   * 함께 갖춘 임차인"을 앞선 임차인으로 정의했다. 매수인 기준으로 틀린
   * 정의다 — 매수인이 보증금을 인수하는지는 **대항력**(주택의 인도 +
   * 주민등록)으로 갈리고, 대항력을 갖춘 임차인이 있으면 주택임대차보호법
   * 제3조 제4항에 따라 양수인이 임대인의 지위를 승계한다. 확정일자는
   * 우선변제권(같은 법 제3조의2)의 요건이라 경매·공매의 배당순위를
   * 다투는 문제이지, 매매로 사는 사람의 인수 여부와는 다른 축이다.
   *
   * 그 정의 때문에 "전입은 했는데 확정일자는 없는 임차인"이 "앞선
   * 임차인이 없어요"로 새어 나가 합계에 0원으로 들어갔고, 나머지가
   * 깨끗하면 전체 결론이 clear가 됐다. 실제로는 그 보증금 전액을
   * 매수인이 인수한다.
   */
  describe("앞선 임차인은 대항력으로 가른다 — 확정일자가 아니다", () => {
    const item = realItem("priorDeposit");

    it("답을 가르는 문구 어디에도 확정일자가 조건으로 들어가지 않는다", () => {
      // 질문과 선택지 라벨이 사용자가 실제로 답을 고를 때 읽는 전부다.
      // 여기에 확정일자가 조건으로 섞이는 순간 위 손실 경로가 되살아난다.
      const decisive = [item.question, ...item.options.map((o) => o.label)];
      for (const text of decisive) {
        expect(text, text).not.toContain("확정일자");
      }
    });

    it("판단 기준이 전입세대확인서의 전입 여부다", () => {
      expect(item.question).toContain("전입");
      expect(item.where).toContain("전입세대확인서");
      const noneOption = item.options.find((o) => o.amount === "zero");
      expect(noneOption?.label).toContain("전입");
    });

    it("확정일자를 언급한다면 '기준이 아니다'라는 뜻으로만 쓴다", () => {
      // 아예 안 쓰는 것도 괜찮지만, 쓴다면 반드시 부정문이어야 한다 —
      // 확정일자 부여현황을 함께 떼라고만 적으면 사용자는 그것을 조건으로
      // 읽는다(예전 문구가 정확히 그랬다).
      for (const text of [item.where, item.why]) {
        if (!text.includes("확정일자")) continue;
        expect(text, text).toMatch(/확정일자[^.]*(않아요|없어도|아니에요)/);
      }
    });

    it("왜 위험한지가 대항력과 임대인 지위 승계로 설명된다", () => {
      expect(item.why).toContain("대항력");
      expect(item.why).toMatch(/제3조 제4항/);
      expect(item.why).toMatch(/넘겨받|승계/);
    });

    it("'순위'가 아니라 '떠안는다'로 말한다", () => {
      // 매수인에게 이건 배당순위 문제가 아니라 채무 인수 문제다.
      expect(item.why).toMatch(/떠안|돌려줄 사람이 내가/);
      expect(item.why).not.toContain("내 권리보다 앞서");
    });

    it("먼저 전입한 세대가 있다는 답은 '확인했어요'로 끝나지 않는다", () => {
      const withTenant = item.options.filter((o) => o.amount !== "zero");
      expect(withTenant.length).toBeGreaterThan(0);
      for (const option of withTenant) {
        expect(option.verdict, option.id).not.toBe("checked");
      }
    });
  });

  /**
   * 리뷰 수정(Important 3): 오피스텔은 건축법상 업무시설이지만 오피스텔
   * 건축기준에 따라 주거로 쓰는 것이 적법하다. 무단 용도변경이 아니고
   * 원상복구 명령·이행강제금 대상도 아니다. 예전 룰셋은 근생빌라
   * (제2종근생을 주거로 개조)에 대한 서술을 업무시설까지 늘리면서
   * 오피스텔에 없는 법적 효과를 단정하고 stop으로 보냈다.
   */
  describe("오피스텔을 근생빌라와 갈라낸다", () => {
    const item = realItem("mainUse");
    const officetel = item.options.find((o) => o.label.includes("오피스텔") && o.verdict !== "stop");

    it("오피스텔 선택지가 따로 있고, stop이 아니라 expert다", () => {
      // 주택 수 산입·대출 조건이 달라질 수 있어 확인은 필요하지만,
      // "사면 안 돼요"라고 말할 근거는 없다.
      expect(officetel).toBeDefined();
      expect(officetel?.verdict).toBe("expert");
    });

    it("오피스텔의 주거 사용을 무단 용도변경이라고 말하지 않는다", () => {
      expect(officetel?.note).toContain("무단 용도변경이 아니에요");
    });

    it("stop 선택지가 업무시설을 끌어들이지 않는다", () => {
      const stop = item.options.find((o) => o.verdict === "stop");
      expect(stop?.label).not.toContain("업무시설");
      expect(stop?.label).toContain("근린생활시설");
    });

    it("어떤 문구도 업무시설 전체를 무단 용도변경이라고 단정하지 않는다", () => {
      const everyPhrase = [
        item.question,
        item.where,
        item.why,
        ...item.options.flatMap((o) => [o.label, o.note ?? ""]),
      ].join(" ");
      expect(everyPhrase).not.toMatch(/업무시설[^.]*무단 용도변경(?!이 아니)/);
    });
  });

  /**
   * 리뷰 수정(Important 4): 집합건축물대장은 표제부의 '주용도'와 전유부의
   * 호실별 '용도'가 따로다. 근생빌라는 표제부가 '공동주택'이면서 문제
   * 호실만 전유부에서 근생인 경우가 흔해, 표제부만 본 사용자는 "주택으로
   * 되어 있어요"를 고르게 된다.
   */
  it("건축물대장 항목이 전유부의 호실 용도를 보라고 말한다", () => {
    const item = realItem("mainUse");
    expect(item.where).toContain("표제부");
    expect(item.where).toContain("전유부");
    expect(item.where).toContain("호실");
  });

  /**
   * 리뷰 수정(Minor 6): '현재 유효사항'만 발급하면 말소사항이 아예
   * 표시되지 않는다. "빨간 줄이 그어진 것은 빼세요"만 적으면 그 발급본을
   * 든 사용자는 무엇을 빼라는 말인지 알 수 없다.
   */
  it("말소사항을 말하는 항목은 어느 쪽을 떼야 하는지 함께 알려준다", () => {
    const rules = parseRightsRules(rawRightsRules);
    for (const item of rules.items) {
      if (!item.where.includes("말소")) continue;
      expect(item.where, item.id).toContain("말소사항 포함");
    }
  });

  /**
   * 리뷰 수정(Minor 3): "한 사람 지분만 사면 그 집을 혼자 쓸 수 없어요"는
   * 과단정이다 — 과반수 지분권자는 민법 제265조의 관리행위로 사용방법을
   * 정할 수 있다.
   */
  it("공유 지분 설명이 과단정하지 않다", () => {
    const item = realItem("coOwnership");
    expect(item.why).not.toContain("혼자 쓸 수 없어요");
    expect(item.why).toContain("민법 제265조");
  });

  /**
   * 위반건축물을 stop으로 두는 이유는 계약이 무효라서가 아니라 대출이
   * 막히고 이행강제금이 붙기 때문이다. 등급은 그대로 두되(내리는 건
   * 낙관 방향이다) 그 이유가 note에 적혀 있어야 한다.
   */
  it("위반건축물 note가 stop의 이유를 대출·이행강제금으로 말한다", () => {
    const stop = realItem("illegalBuilding").options.find(
      (o) => o.verdict === "stop",
    );
    expect(stop?.note).toMatch(/대출/);
    expect(stop?.note).toContain("이행강제금");
    // 위반 내용의 폭이 넓다는 사실도 함께 말한다.
    expect(stop?.note).toMatch(/폭이 넓|다양|제각/);
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
