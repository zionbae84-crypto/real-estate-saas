import { describe, expect, it } from "vitest";
import {
  BARGAIN_MUST_BE_ALLOWED,
  BARGAIN_MUST_BE_CAUGHT,
  bargainClaimsIn,
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  RATING_MUST_BE_ALLOWED,
  RATING_MUST_BE_CAUGHT,
  ratingClaimsIn,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawSummaryRules from "../../../rules/summary-2026-08.json";
import { parseSummaryRules } from "./rules";
import { SUMMARY_AXIS_IDS } from "./types";

/**
 * 룰셋 JSON 안에서 사용자에게 보이는 문자열을 모두 모은다.
 * `src/lib/location/rules.test.ts`와 같은 규칙 — 밑줄로 시작하는 키는
 * 내부 주석 자리라 파서도 보지 않으므로 뺀다.
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
  const draft = JSON.parse(JSON.stringify(rawSummaryRules)) as Record<
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

describe("진단 종합 룰셋", () => {
  it("실제 파일이 통과한다", () => {
    const rules = parseSummaryRules(rawSummaryRules);
    expect(rules.version).toBe("summary-2026-08");
  });

  it("네 축 모두 axes·notLooked에 있어야 한다", () => {
    for (const id of SUMMARY_AXIS_IDS) {
      expect(() =>
        parseSummaryRules(
          poisoned((draft) => {
            delete section(draft, "axes")[id];
          }),
        ),
      ).toThrow(`axes.${id}`);

      expect(() =>
        parseSummaryRules(
          poisoned((draft) => {
            delete section(draft, "notLooked")[id];
          }),
        ),
      ).toThrow(`notLooked.${id}`);
    }
  });

  it("헤드라인 네 값이 모두 있어야 한다", () => {
    for (const key of ["stop", "unresolved", "expert", "clear"] as const) {
      expect(() =>
        parseSummaryRules(
          poisoned((draft) => {
            delete section(draft, "headline")[key];
          }),
        ),
      ).toThrow(`headline.${key}`);
    }
  });

  it("clear 헤드라인의 note가 '뜻이 아니'를 품지 않으면 거부한다", () => {
    expect(() =>
      parseSummaryRules(
        poisoned((draft) => {
          section(draft, "headline").clear = {
            label: "걸리는 게 없었어요",
            note: "안심하고 진행하세요.",
          };
        }),
      ),
    ).toThrow("뜻이 아니");
  });

  it("expertPendingNote·targetMismatchNote·disclaimer가 없으면 거부한다", () => {
    expect(() =>
      parseSummaryRules(
        poisoned((draft) => {
          delete draft.expertPendingNote;
        }),
      ),
    ).toThrow("expertPendingNote");

    expect(() =>
      parseSummaryRules(
        poisoned((draft) => {
          delete draft.targetMismatchNote;
        }),
      ),
    ).toThrow("targetMismatchNote");

    expect(() =>
      parseSummaryRules(
        poisoned((draft) => {
          draft.disclaimer = [];
        }),
      ),
    ).toThrow("disclaimer");
  });

  describe("안전·바가지·등급 주장 탐지기", () => {
    it("탐지기 자체가 표준 문구를 실제로 잡고 놓아준다(전제)", () => {
      for (const caught of MUST_BE_CAUGHT) {
        expect(safetyClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of MUST_BE_ALLOWED) {
        expect(safetyClaimsIn(allowed), allowed).toEqual([]);
      }
      for (const caught of BARGAIN_MUST_BE_CAUGHT) {
        expect(bargainClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of BARGAIN_MUST_BE_ALLOWED) {
        expect(bargainClaimsIn(allowed), allowed).toEqual([]);
      }
      for (const caught of RATING_MUST_BE_CAUGHT) {
        expect(ratingClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of RATING_MUST_BE_ALLOWED) {
        expect(ratingClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it("실제 룰셋 문구 전체가 안전 주장 탐지기를 통과한다", () => {
      expect(ruleStrings(rawSummaryRules).flatMap(safetyClaimsIn)).toEqual([]);
    });

    it("실제 룰셋 문구 전체가 바가지 주장 탐지기를 통과한다", () => {
      expect(ruleStrings(rawSummaryRules).flatMap(bargainClaimsIn)).toEqual([]);
    });

    it("실제 룰셋 문구 전체가 점수·등급 주장 탐지기를 통과한다", () => {
      expect(ruleStrings(rawSummaryRules).flatMap(ratingClaimsIn)).toEqual([]);
    });

    it("탐지기가 실제로 오염된 룰셋을 잡아낸다(변이 검사)", () => {
      const poisonedSafety = poisoned((draft) => {
        section(draft, "headline").clear = {
          label: "안심하고 진행하세요.",
          note: "'안전하다'는 뜻이 아니에요.",
        };
      });
      expect(
        ruleStrings(poisonedSafety).flatMap(safetyClaimsIn),
      ).not.toEqual([]);

      const poisonedBargain = poisoned((draft) => {
        section(section(draft, "headline"), "clear").note =
          "시세보다 싸요. '안전하다'는 뜻이 아니에요.";
      });
      expect(
        ruleStrings(poisonedBargain).flatMap(bargainClaimsIn),
      ).not.toEqual([]);

      const poisonedRating = poisoned((draft) => {
        section(draft, "axes").location = { label: "역세권이에요" };
      });
      expect(
        ruleStrings(poisonedRating).flatMap(ratingClaimsIn),
      ).not.toEqual([]);
    });
  });
});
