import { describe, expect, it } from "vitest";
import {
  BARGAIN_MUST_BE_ALLOWED,
  BARGAIN_MUST_BE_CAUGHT,
  bargainClaimsIn,
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawPriceRules from "../../../rules/price-2026-08.json";
import { parsePriceRules } from "./rules";
import { PRICE_BANDS } from "./types";

/**
 * 룰셋 JSON 안에서 **사용자에게 보이는 문자열**을 모두 모은다.
 *
 * `scripts/tone-guard.test.ts`·`lib/purchase/rules.test.ts`의 같은
 * 함수와 같은 규칙이다 — 밑줄로 시작하는 키는 내부 주석 자리라 파서도
 * 보지 않으므로 뺀다. 나머지는 전부 검사한다. 뺄 것을 적게 두는 쪽이
 * 그물을 크게 한다.
 */
function ruleStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(ruleStrings);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      key.startsWith("_") ? [] : ruleStrings(entry),
    );
  }
  return [];
}

/** 실제 룰셋을 복제해 한 군데만 망가뜨린다 */
function poisoned(mutate: (draft: Record<string, unknown>) => void): unknown {
  const draft = JSON.parse(JSON.stringify(rawPriceRules)) as Record<
    string,
    unknown
  >;
  mutate(draft);
  return draft;
}

function section(
  draft: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return draft[key] as Record<string, unknown>;
}

function band(
  draft: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const bands = section(section(draft, "position"), "bands") as Record<
    string,
    Record<string, unknown>
  >;
  return bands[name] as Record<string, unknown>;
}

describe("호가 위치 룰셋", () => {
  it("실제 파일이 통과한다", () => {
    const rules = parsePriceRules(rawPriceRules);
    expect(rules.version).toBe("price-2026-08");
  });

  describe("표본 조건 — 이 기능의 심장", () => {
    it("거래 건수 하한을 1이나 2로 내릴 수 없다", () => {
      for (const value of [1, 2]) {
        expect(() =>
          parsePriceRules(
            poisoned((draft) => {
              section(draft, "evidence").minTradeCount = value;
            }),
          ),
        ).toThrow(/minTradeCount/);
      }
    });

    it("거래 건수 하한이 정수가 아니면 거부한다", () => {
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            section(draft, "evidence").minTradeCount = 4.5;
          }),
        ),
      ).toThrow(/minTradeCount/);
    });

    it("범위 폭 하한을 0으로 두면 거부한다", () => {
      // 0이면 범위가 한 점인 평형(번들 데이터의 51.7%)에서도 위치
      // 판정이 나온다 — 호가가 1원만 높아도 "범위 위"가 된다.
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            section(draft, "evidence").minRangeWidthRatio = 0;
          }),
        ),
      ).toThrow(/minRangeWidthRatio/);
    });

    it("실제 값이 그 하한들을 실제로 넘는다(전제)", () => {
      const rules = parsePriceRules(rawPriceRules);
      expect(rules.evidence.minTradeCount).toBeGreaterThanOrEqual(3);
      expect(rules.evidence.minRangeWidthRatio).toBeGreaterThan(0);
    });
  });

  describe("밴드 판정", () => {
    it("범위 안이 아닌 밴드를 checked로 둘 수 없다", () => {
      for (const name of ["below", "aboveNear", "aboveFar"]) {
        expect(() =>
          parsePriceRules(
            poisoned((draft) => {
              band(draft, name).verdict = "checked";
            }),
          ),
        ).toThrow(/checked일 수 없어요/);
      }
    });

    it("범위 안을 checked가 아닌 것으로 둘 수 없다", () => {
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            band(draft, "within").verdict = "expert";
          }),
        ),
      ).toThrow(/within.verdict는 checked여야/);
    });

    it("어느 밴드도 withheld일 수 없다", () => {
      for (const name of PRICE_BANDS) {
        expect(() =>
          parsePriceRules(
            poisoned((draft) => {
              band(draft, name).verdict = "withheld";
            }),
          ),
        ).toThrow(/withheld/);
      }
    });

    it("더 많이 벗어난 밴드가 더 약한 판정을 받으면 거부한다", () => {
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            band(draft, "aboveNear").verdict = "stop";
            band(draft, "aboveFar").verdict = "expert";
          }),
        ),
      ).toThrow(/aboveFar는 aboveNear보다 가벼울 수 없어요/);
    });

    it("초과 임계값이 0 이하면 거부한다", () => {
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            section(draft, "position").aboveFarFrom = 0;
          }),
        ),
      ).toThrow(/aboveFarFrom/);
    });
  });

  describe("예산 줄 판정", () => {
    it("현금이 모자라거나 선을 넘은 경우를 checked로 둘 수 없다", () => {
      for (const situation of ["unaffordable", "danger", "caution"]) {
        expect(() =>
          parsePriceRules(
            poisoned((draft) => {
              (section(section(draft, "budget"), "verdicts") as Record<
                string,
                unknown
              >)[situation] = "checked";
            }),
          ),
        ).toThrow(/checked일 수 없어요/);
      }
    });
  });

  describe("판정과 함께 나가야 하는 문구", () => {
    it.each([
      "floorNote",
      "floorRangeNote",
      "floorSameNote",
      "floorUnknownNote",
      "floorPartialUnknownNote",
      "reportingLagNote",
      "notAVerdictNote",
      "noPointEstimateNote",
    ])("%s가 빠지면 거부한다", (key) => {
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            delete section(draft, "disclosure")[key];
          }),
        ),
      ).toThrow(new RegExp(`disclosure.${key}`));
    });

    it("향·수리 상태는 여전히 반영되지 않았다는 사실을 실제로 말한다", () => {
      // 집계가 층을 내보내게 됐다고 이 문장까지 지우면, 화면이 설명하지
      // 못하는 남은 차이(향·수리 상태)를 사용자가 모르게 된다.
      const rules = parsePriceRules(rawPriceRules);
      expect(rules.disclosure.floorNote).toContain("향");
      expect(rules.disclosure.floorNote).toContain("수리");
    });

    it.each([
      ["floorRangeNote", "{minFloor}"],
      ["floorRangeNote", "{maxFloor}"],
      ["floorSameNote", "{floor}"],
      ["floorPartialUnknownNote", "{unknownFloorCount}"],
    ])("%s에서 %s 자리표시자가 빠지면 거부한다", (key, token) => {
      // 자리표시자가 빠져도 문장은 멀쩡해 보이는데 층수만 조용히 사라진다.
      // 화면은 여전히 한 줄을 그리고 사용자는 고지를 읽었다고 믿는다.
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            const disclosure = section(draft, "disclosure");
            disclosure[key] = String(disclosure[key]).split(token).join("");
          }),
        ),
      ).toThrow(new RegExp(`disclosure.${key}`));
    });

    it("층을 모를 때 쓰는 문장에 자리표시자를 넣으면 거부한다", () => {
      // 끼워 넣을 층수가 없는 갈래라 "{minFloor}층"이 그대로 화면에 나간다.
      expect(() =>
        parsePriceRules(
          poisoned((draft) => {
            section(draft, "disclosure").floorUnknownNote =
              "이 범위를 만든 거래는 {minFloor}층부터였어요.";
          }),
        ),
      ).toThrow(/floorUnknownNote/);
    });

    it("층 고지가 실제로 층을 말한다", () => {
      const rules = parsePriceRules(rawPriceRules);
      for (const note of [
        rules.disclosure.floorRangeNote,
        rules.disclosure.floorSameNote,
        rules.disclosure.floorUnknownNote,
      ]) {
        expect(note, note).toContain("층");
      }
    });

    it("실거래 신고가 늦는다는 사실을 실제로 말한다", () => {
      const rules = parsePriceRules(rawPriceRules);
      expect(rules.disclosure.reportingLagNote).toContain("신고");
    });
  });

  it("빈칸이 이미 유보라는 사실을 미리 말하는 덧말이 빠지면 거부한다", () => {
    expect(() =>
      parsePriceRules(
        poisoned((draft) => {
          delete (
            section(section(draft, "overall"), "incomplete") as Record<
              string,
              unknown
            >
          ).pendingWithheldNote;
        }),
      ),
    ).toThrow(/pendingWithheldNote/);
  });

  it("판정 라벨이 빠지면 거부한다", () => {
    expect(() =>
      parsePriceRules(
        poisoned((draft) => {
          delete section(draft, "verdictLabels").withheld;
        }),
      ),
    ).toThrow(/verdictLabels.withheld/);
  });

  it("면책 문구가 비면 거부한다", () => {
    expect(() =>
      parsePriceRules(
        poisoned((draft) => {
          draft.disclaimer = [];
        }),
      ),
    ).toThrow(/disclaimer/);
  });

  describe("어떤 문구도 '안전'하다고 말하지 않는다", () => {
    it("안전 주장 탐지기가 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
      // 아래 검사가 공허하게 통과하지 않도록 그물 자체를 여기서 고정한다.
      for (const caught of MUST_BE_CAUGHT) {
        expect(safetyClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of MUST_BE_ALLOWED) {
        expect(safetyClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it("검사 대상 문구를 실제로 모은다(전제)", () => {
      const phrases = ruleStrings(rawPriceRules);
      expect(phrases.length).toBeGreaterThan(30);
      expect(phrases).toContain(
        parsePriceRules(rawPriceRules).disclosure.floorNote,
      );
    });

    it("실제 룰셋의 어떤 문구도 '안전'하다고 말하지 않는다", () => {
      expect(ruleStrings(rawPriceRules).flatMap(safetyClaimsIn)).toEqual([]);
    });

    it("룰셋에 안심 문구를 심으면 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        (
          section(section(draft, "overall"), "clear") as Record<string, unknown>
        ).note = "안심하고 진행하세요.";
      });
      expect(ruleStrings(poisonedRules).flatMap(safetyClaimsIn)).not.toEqual([]);
    });
  });

  describe("어떤 문구도 '싸다·적정하다'고 말하지 않는다", () => {
    it("값 주장 탐지기가 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
      for (const caught of BARGAIN_MUST_BE_CAUGHT) {
        expect(bargainClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of BARGAIN_MUST_BE_ALLOWED) {
        expect(bargainClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it("실제 룰셋의 어떤 문구도 값을 매기지 않는다", () => {
      expect(ruleStrings(rawPriceRules).flatMap(bargainClaimsIn)).toEqual([]);
    });

    it("룰셋에 '적정해요'를 심으면 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        band(draft, "within").message = "이 호가는 적정해요.";
      });
      expect(ruleStrings(poisonedRules).flatMap(bargainClaimsIn)).not.toEqual([]);
    });

    it("룰셋에 '잘 샀어요'를 심으면 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        (
          section(section(draft, "overall"), "clear") as Record<string, unknown>
        ).label = "잘 샀어요";
      });
      expect(ruleStrings(poisonedRules).flatMap(bargainClaimsIn)).not.toEqual([]);
    });
  });

  describe("점 추정이 룰셋에 없다", () => {
    /**
     * 값을 단정하는 표현만 겨눈다. "앞으로의 시세를 전망하지 않아요"
     * 같은 **부정문**은 이 제품이 지켜야 하는 말이라 걸리면 안 되므로,
     * 단어 하나가 아니라 "얼마다"라고 말하는 꼴을 본다.
     */
    const POINT_ESTIMATE = /적정가|추정가|추정\s*시세|예상\s*(가격|시세)|시세는/;

    it("실제 룰셋에 점 추정 표현이 없다", () => {
      const offenders = ruleStrings(rawPriceRules).filter((text) =>
        POINT_ESTIMATE.test(text),
      );
      expect(offenders).toEqual([]);
    });

    it("탐지기가 실제로 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        band(draft, "within").message = "이 평형의 추정 시세는 8억이에요.";
      });
      expect(
        ruleStrings(poisonedRules).filter((text) => POINT_ESTIMATE.test(text)),
      ).not.toEqual([]);
    });

    it("'시세를 전망하지 않아요'는 놓아준다(오탐 방지 확인)", () => {
      expect(POINT_ESTIMATE.test("앞으로의 시세를 전망하지 않아요.")).toBe(false);
    });
  });
});
