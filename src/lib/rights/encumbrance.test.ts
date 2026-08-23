import { describe, expect, it } from "vitest";
import rawRightsRules from "../../../rules/rights-2026-08.json";
import { calcEncumbrance } from "./encumbrance";
import { parseRightsRules } from "./rules";
import type { RightsAnswers, RightsRules } from "./types";

const rules = parseRightsRules(rawRightsRules);

/** 룰셋의 임계값만 바꾼 사본. 판정이 데이터에서 온다는 것을 확인할 때 쓴다 */
function withRatios(expertRatio: number, stopRatio: number): RightsRules {
  return {
    ...rules,
    encumbrance: { ...rules.encumbrance, expertRatio, stopRatio },
  };
}

type Answer = { optionId: string; amountWon: number | null };

const NONE: Answer = { optionId: "none", amountWon: null };
const UNKNOWN: Answer = { optionId: "unknown", amountWon: null };
const known = (won: number): Answer => ({ optionId: "known", amountWon: won });

/**
 * 합계에 들어가는 세 항목의 답을 만든다.
 *
 * `leaseRight`(전세권·임차권등기)는 리뷰 수정(Important 2)으로 합계에
 * 새로 들어왔다. 기본값을 "없어요"로 두어 기존 검사들이 근저당·전입
 * 세대만 다루던 뜻을 그대로 유지한다 — 기본값을 모름으로 두면 모든
 * 검사가 unknown 경로로 쏠려 원래 보려던 것을 못 보게 된다.
 *
 * `leaseRight`에 `null`을 넘기면 "아직 답하지 않았다"는 뜻이다 —
 * `undefined`는 기본값(없어요)을 부르므로 미답변을 표현하지 못한다.
 */
function answers(
  mortgage: Answer | undefined,
  priorDeposit: Answer | undefined,
  leaseRight: Answer | null | undefined = NONE,
): RightsAnswers {
  const out: Record<string, Answer> = {};
  if (mortgage) out.mortgage = mortgage;
  if (priorDeposit) out.priorDeposit = priorDeposit;
  if (leaseRight) out.leaseRight = leaseRight;
  return out;
}

describe("기존 권리 합계 계산", () => {
  it("금액 항목들을 더해 매매가와 견준다", () => {
    const result = calcEncumbrance(
      rules,
      answers(known(100_000_000), known(50_000_000)),
      1_000_000_000,
    );
    expect(result.knownTotal).toBe(150_000_000);
    expect(result.ratio).toBeCloseTo(0.15, 10);
    expect(result.unknownItemIds).toEqual([]);
    expect(result.verdict).toBe("checked");
  });

  /**
   * 리뷰 수정(Important 2): 전세권·임차권등기 보증금이 합계에서 통째로
   * 빠져 있었다. 전세권 5억이 등기된 5억짜리 집이 "확인한 합계 0원 ·
   * 몫 0.0% · 확인했어요"로 나왔다 — 잔금으로 기존 권리를 지울 수 있는지
   * 답하는 유일한 계산이 위험을 아예 보지 못했다.
   */
  describe("전세권·임차권등기 보증금도 합계에 들어간다", () => {
    it("합계 계산의 출처에 leaseRight가 있다", () => {
      expect(rules.encumbrance.sourceItemIds).toContain("leaseRight");
    });

    it("전세권 5억이 등기된 5억짜리 집은 0원·확인했어요가 아니다", () => {
      const result = calcEncumbrance(
        rules,
        answers(NONE, NONE, known(500_000_000)),
        500_000_000,
      );
      expect(result.knownTotal).toBe(500_000_000);
      expect(result.ratio).toBeCloseTo(1, 10);
      expect(result.verdict).toBe("stop");
      expect(result.verdict).not.toBe("checked");
    });

    it("금액을 모르면 0원이 아니라 모름으로 센다", () => {
      const result = calcEncumbrance(
        rules,
        answers(NONE, NONE, UNKNOWN),
        500_000_000,
      );
      expect(result.knownTotal).toBe(0);
      expect(result.unknownItemIds).toEqual(["leaseRight"]);
      expect(result.verdict).toBe("expert");
    });

    it("아직 답하지 않아도 모름으로 센다", () => {
      const result = calcEncumbrance(
        rules,
        answers(NONE, NONE, null),
        500_000_000,
      );
      expect(result.unknownItemIds).toEqual(["leaseRight"]);
      expect(result.verdict).toBe("expert");
    });
  });

  it("'없어요'는 0원으로 더한다", () => {
    const result = calcEncumbrance(rules, answers(NONE, NONE), 500_000_000);
    expect(result.knownTotal).toBe(0);
    expect(result.unknownItemIds).toEqual([]);
    expect(result.verdict).toBe("checked");
  });

  describe("모르는 값을 0으로 두지 않는다", () => {
    it("금액 모름 선택지는 합계에서 빠지고 확인 필요로 남는다", () => {
      const result = calcEncumbrance(
        rules,
        answers(UNKNOWN, NONE),
        1_000_000_000,
      );
      expect(result.knownTotal).toBe(0);
      expect(result.unknownItemIds).toEqual(["mortgage"]);
      expect(result.verdict).toBe("expert");
      expect(result.verdict).not.toBe("checked");
    });

    it("'알아요'를 골랐는데 금액을 비워 두면 0원이 아니라 모름이다", () => {
      const result = calcEncumbrance(
        rules,
        answers({ optionId: "known", amountWon: null }, NONE),
        1_000_000_000,
      );
      expect(result.knownTotal).toBe(0);
      expect(result.unknownItemIds).toEqual(["mortgage"]);
      expect(result.verdict).toBe("expert");
    });

    it("아직 답하지 않은 항목도 모름으로 센다", () => {
      const result = calcEncumbrance(
        rules,
        answers(undefined, undefined),
        1_000_000_000,
      );
      expect(result.knownTotal).toBe(0);
      expect(result.unknownItemIds).toEqual(["mortgage", "priorDeposit"]);
      expect(result.verdict).toBe("expert");
    });

    it("룰셋에 없는 선택지 id가 들어와도 모름으로 센다", () => {
      const result = calcEncumbrance(
        rules,
        answers({ optionId: "없는선택지", amountWon: 0 }, NONE),
        1_000_000_000,
      );
      expect(result.unknownItemIds).toEqual(["mortgage"]);
      expect(result.verdict).toBe("expert");
    });

    it("음수·NaN 금액도 모름으로 센다", () => {
      for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = calcEncumbrance(
          rules,
          answers({ optionId: "known", amountWon: bad }, NONE),
          1_000_000_000,
        );
        expect(result.unknownItemIds, String(bad)).toEqual(["mortgage"]);
      }
    });
  });

  describe("모르는 값이 있어도 아는 값만으로 이미 넘으면 멈춘다", () => {
    it("아는 금액만으로 stopRatio를 넘으면 나머지가 모름이어도 stop이다", () => {
      // 모르는 값은 합계를 더 키울 뿐 줄이지 못한다 — 이미 넘었으면
      // 그 사실은 확인을 기다릴 필요가 없다.
      const result = calcEncumbrance(
        rules,
        answers(known(950_000_000), UNKNOWN),
        1_000_000_000,
      );
      expect(result.verdict).toBe("stop");
    });

    it("아는 금액이 stopRatio에 못 미치면 모름이 expert로 이긴다", () => {
      const result = calcEncumbrance(
        rules,
        answers(known(800_000_000), UNKNOWN),
        1_000_000_000,
      );
      // 0.8은 expertRatio(0.7) 이상이지만 stopRatio(0.9) 미만이다.
      expect(result.verdict).toBe("expert");
    });
  });

  describe("매매 예정가가 없으면 계산하지 않는다", () => {
    it("매매가가 null이면 확인 필요이고 비율을 내지 않는다", () => {
      const result = calcEncumbrance(rules, answers(NONE, NONE), null);
      expect(result.verdict).toBe("expert");
      expect(result.ratio).toBeNull();
      expect(result.message).toBe(rules.encumbrance.messages.noPrice);
    });

    it("매매가가 0이어도 나누지 않는다", () => {
      const result = calcEncumbrance(rules, answers(NONE, NONE), 0);
      expect(result.verdict).toBe("expert");
      expect(result.ratio).toBeNull();
    });
  });

  describe("임계값은 룰셋에서 온다", () => {
    it("경계값은 '이상'이다 — 정확히 stopRatio면 stop", () => {
      const result = calcEncumbrance(
        rules,
        answers(known(900_000_000), NONE),
        1_000_000_000,
      );
      expect(result.verdict).toBe("stop");
    });

    it("같은 답이라도 룰 파일의 임계값을 낮추면 판정이 따라 바뀐다", () => {
      const given = answers(known(300_000_000), NONE);
      const price = 1_000_000_000; // 비율 0.3

      expect(calcEncumbrance(rules, given, price).verdict).toBe("checked");
      expect(calcEncumbrance(withRatios(0.2, 0.9), given, price).verdict).toBe(
        "expert",
      );
      expect(calcEncumbrance(withRatios(0.1, 0.25), given, price).verdict).toBe(
        "stop",
      );
    });
  });

  it("판정마다 룰셋의 문구를 그대로 쓴다", () => {
    const { messages } = rules.encumbrance;
    expect(
      calcEncumbrance(rules, answers(NONE, NONE), 1_000_000_000).message,
    ).toBe(messages.checked);
    expect(
      calcEncumbrance(rules, answers(UNKNOWN, NONE), 1_000_000_000).message,
    ).toBe(messages.unknown);
    expect(
      calcEncumbrance(rules, answers(known(750_000_000), NONE), 1_000_000_000)
        .message,
    ).toBe(messages.expert);
    expect(
      calcEncumbrance(rules, answers(known(950_000_000), NONE), 1_000_000_000)
        .message,
    ).toBe(messages.stop);
  });

  it("합계는 원 단위 정수로 남는다", () => {
    const result = calcEncumbrance(
      rules,
      answers(known(123_456_789), known(1)),
      1_000_000_000,
    );
    expect(Number.isInteger(result.knownTotal)).toBe(true);
    expect(result.knownTotal).toBe(123_456_790);
  });
});
