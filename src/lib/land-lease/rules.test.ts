import { describe, expect, it } from "vitest";
import {
  BARGAIN_MUST_BE_ALLOWED,
  BARGAIN_MUST_BE_CAUGHT,
  bargainClaimsIn,
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawLandLeaseRules from "../../../rules/land-lease-2026-08.json";
import { parseLandLeaseRules } from "./rules";
import { LAND_LEASE_STATES } from "./types";

/**
 * 룰셋 JSON 안에서 **사용자에게 보이는 문자열**을 모두 모은다.
 * `src/lib/price/rules.test.ts`의 같은 함수와 같은 규칙이다 — 밑줄로
 * 시작하는 키는 내부 주석 자리라 뺀다.
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
  const draft = JSON.parse(JSON.stringify(rawLandLeaseRules)) as Record<
    string,
    unknown
  >;
  mutate(draft);
  return draft;
}

/** 상태 하나의 문구 덩어리를 꺼낸다(테스트가 직접 고칠 수 있게) */
function stateOf(
  draft: Record<string, unknown>,
  state: string,
): Record<string, unknown> {
  const states = draft.states as Record<string, Record<string, unknown>>;
  const copy = states[state];
  if (copy === undefined) throw new Error(`상태 없음: ${state}`);
  return copy;
}

describe("토지임대부 룰셋", () => {
  it("실제 룰셋이 통과한다", () => {
    expect(() => parseLandLeaseRules(rawLandLeaseRules)).not.toThrow();
  });

  it.each(LAND_LEASE_STATES)("%s 상태의 문구가 모두 있다", (state) => {
    const rules = parseLandLeaseRules(rawLandLeaseRules);
    expect(rules.states[state].badge.length).toBeGreaterThan(0);
    expect(rules.states[state].monthlyNote.length).toBeGreaterThan(0);
    expect(rules.states[state].checkNote.length).toBeGreaterThan(0);
  });

  /**
   * `unknown`이 빠지면 모름이 조용히 화면에서 사라진다 — "아님"으로
   * 접히는 것과 결과가 같다.
   */
  it("모름 상태가 빠지면 잡아낸다(변이 검사)", () => {
    expect(() =>
      parseLandLeaseRules(
        poisoned((draft) => {
          delete (draft.states as Record<string, unknown>).unknown;
        }),
      ),
    ).toThrow(/states\.unknown/);
  });

  it("월 상환액 문구가 그 이유를 말하지 않으면 잡아낸다(변이 검사)", () => {
    expect(() =>
      parseLandLeaseRules(
        poisoned((draft) => {
          stateOf(draft, "yes").monthlyNote = "토지임대부 주택이에요.";
        }),
      ),
    ).toThrow(/월 상환액/);
  });

  it.each(LAND_LEASE_STATES)(
    "%s 문구가 토지 사용료 금액을 추정하면 잡아낸다(변이 검사)",
    (state) => {
      expect(() =>
        parseLandLeaseRules(
          poisoned((draft) => {
            stateOf(draft, state).checkNote =
              "토지 사용료는 매달 20만원쯤 나가요.";
          }),
        ),
      ).toThrow(/추정/);
    },
  );

  /**
   * 등급을 붙드는 문구(`grade`)는 화면의 **판정**을 바꾼다. 이 블록이
   * 비면 화면은 등급을 내릴 글자를 잃고 "안전"으로 되돌아간다 — 이
   * 룰셋이 존재하는 이유가 통째로 사라지는 경로다.
   */
  describe("등급을 붙드는 문구", () => {
    it("네 필드가 모두 있다", () => {
      const rules = parseLandLeaseRules(rawLandLeaseRules);
      expect(rules.grade.label.length).toBeGreaterThan(0);
      expect(rules.grade.note.length).toBeGreaterThan(0);
      expect(rules.grade.noLoanNote.length).toBeGreaterThan(0);
      expect(rules.grade.groupHeading.length).toBeGreaterThan(0);
    });

    it("블록이 통째로 빠지면 잡아낸다(변이 검사)", () => {
      expect(() =>
        parseLandLeaseRules(poisoned((draft) => { delete draft.grade; })),
      ).toThrow(/grade/);
    });

    it.each(["label", "note", "noLoanNote", "groupHeading"] as const)(
      "grade.%s가 빠지면 잡아낸다(변이 검사)",
      (key) => {
        expect(() =>
          parseLandLeaseRules(
            poisoned((draft) => {
              delete (draft.grade as Record<string, unknown>)[key];
            }),
          ),
        ).toThrow(new RegExp(`grade\\.${key}`));
      },
    );

    it("이유를 말하지 않으면 잡아낸다(변이 검사)", () => {
      // "확인이 필요해요" 한 줄로 줄여도 필드는 채워져 있고 화면은
      // 등급을 내린다 — 그런데 왜 내렸는지가 한 글자도 없다.
      expect(() =>
        parseLandLeaseRules(
          poisoned((draft) => {
            (draft.grade as Record<string, unknown>).note = "확인이 필요해요.";
          }),
        ),
      ).toThrow(/grade\.note/);
    });

    it("등급 문구가 금액을 추정하면 잡아낸다(변이 검사)", () => {
      expect(() =>
        parseLandLeaseRules(
          poisoned((draft) => {
            (draft.grade as Record<string, unknown>).note =
              "매달 20만원쯤 더 나가서 등급이 멈췄어요.";
          }),
        ),
      ).toThrow(/추정/);
    });
  });

  describe("문구가 '안전하다'·'싸다'고 말하지 않는다", () => {
    const strings = ruleStrings(rawLandLeaseRules);

    it("검사할 문구가 실제로 있다(전제)", () => {
      expect(strings.length).toBeGreaterThan(3);
    });

    it.each(strings)("%s — 안전 주장이 없다", (text) => {
      expect(safetyClaimsIn(text)).toEqual([]);
    });

    it.each(strings)("%s — 값 주장이 없다", (text) => {
      expect(bargainClaimsIn(text)).toEqual([]);
    });

    it("탐지기가 살아 있다(대조군)", () => {
      for (const caught of MUST_BE_CAUGHT) {
        expect(safetyClaimsIn(caught).length).toBeGreaterThan(0);
      }
      for (const allowed of MUST_BE_ALLOWED) {
        expect(safetyClaimsIn(allowed)).toEqual([]);
      }
      for (const caught of BARGAIN_MUST_BE_CAUGHT) {
        expect(bargainClaimsIn(caught).length).toBeGreaterThan(0);
      }
      for (const allowed of BARGAIN_MUST_BE_ALLOWED) {
        expect(bargainClaimsIn(allowed)).toEqual([]);
      }
    });
  });
});
