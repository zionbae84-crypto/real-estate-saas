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
import rawLocationRules from "../../../rules/location-2026-08.json";
import { parseLocationRules } from "./rules";

/**
 * 룰셋 JSON 안에서 **사용자에게 보이는 문자열**을 모두 모은다.
 *
 * `scripts/tone-guard.test.ts`·`lib/price/rules.test.ts`의 같은 함수와
 * 같은 규칙이다 — 밑줄로 시작하는 키는 내부 주석 자리라 파서도 보지
 * 않으므로 뺀다. 나머지는 전부 검사한다. 뺄 것을 적게 두는 쪽이 그물을
 * 크게 한다.
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
  const draft = JSON.parse(JSON.stringify(rawLocationRules)) as Record<
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

function schoolMessages(draft: Record<string, unknown>): Record<string, unknown> {
  return section(section(draft, "elementarySchool"), "messages");
}

describe("입지 룰셋", () => {
  it("실제 파일이 통과한다", () => {
    const rules = parseLocationRules(rawLocationRules);
    expect(rules.version).toBe("location-2026-08");
  });

  describe("반경은 룰셋이 정하고, 아무 값이나 될 수 없다", () => {
    it("실제 반경이 허용 범위 안이다(전제)", () => {
      const rules = parseLocationRules(rawLocationRules);
      expect(rules.elementarySchool.radiusMeters).toBeGreaterThanOrEqual(500);
      expect(rules.elementarySchool.radiusMeters).toBeLessThanOrEqual(2000);
    });

    it("500m 미만으로 좁히면 거부한다", () => {
      // 좁히면 대개 학교가 한 곳만 남고, 화면에 하나만 뜨면 사용자는
      // "이 단지는 저기로 배정된다"고 읽는다. 배정은 거리순이 아니다.
      for (const value of [0, 100, 300, 499]) {
        expect(() =>
          parseLocationRules(
            poisoned((draft) => {
              section(draft, "elementarySchool").radiusMeters = value;
            }),
          ),
        ).toThrow(/radiusMeters/);
      }
    });

    it("2,000m를 넘게 넓히면 거부한다", () => {
      for (const value of [2001, 5000, 50_000]) {
        expect(() =>
          parseLocationRules(
            poisoned((draft) => {
              section(draft, "elementarySchool").radiusMeters = value;
            }),
          ),
        ).toThrow(/radiusMeters/);
      }
    });

    it("숫자가 아니거나 유한하지 않으면 거부한다", () => {
      for (const value of ["1000", null, Infinity, NaN]) {
        expect(() =>
          parseLocationRules(
            poisoned((draft) => {
              section(draft, "elementarySchool").radiusMeters = value;
            }),
          ),
        ).toThrow(/radiusMeters/);
      }
    });
  });

  describe("학교 문구는 어느 범위를 센 것인지 반드시 말한다", () => {
    it("실제 문구 셋이 모두 자리표시자를 품는다(전제)", () => {
      const rules = parseLocationRules(rawLocationRules);
      for (const message of Object.values(rules.elementarySchool.messages)) {
        expect(message).toContain("{radius}");
      }
    });

    it.each(["unknown", "none", "some"])(
      "%s 문구에서 자리표시자를 빼면 거부한다",
      (key) => {
        expect(() =>
          parseLocationRules(
            poisoned((draft) => {
              const messages = schoolMessages(draft);
              messages[key] = String(messages[key]).split("{radius}").join("");
            }),
          ),
        ).toThrow(/\{radius\}/);
      },
    );
  });

  describe("고지가 실제로 그 사실을 말한다", () => {
    it("직선거리 고지가 '직선'과 '걸어'를 모두 말한다", () => {
      const rules = parseLocationRules(rawLocationRules);
      expect(rules.disclosure.straightLineNote).toContain("직선");
      expect(rules.disclosure.straightLineNote).toContain("걸어");
    });

    it("학구도 고지가 '배정'과 '학구도'를 모두 말한다", () => {
      const rules = parseLocationRules(rawLocationRules);
      expect(rules.disclosure.schoolZoneNote).toContain("배정");
      expect(rules.disclosure.schoolZoneNote).toContain("학구도");
    });

    it.each([
      ["straightLineNote", "직선"],
      ["straightLineNote", "걸어"],
      ["schoolZoneNote", "배정"],
      ["schoolZoneNote", "학구도"],
      ["notARatingNote", "점수"],
      ["notARatingNote", "등급"],
      ["notARatingNote", "순위"],
    ])("%s에서 '%s'를 지우면 거부한다", (key, word) => {
      expect(() =>
        parseLocationRules(
          poisoned((draft) => {
            const disclosure = section(draft, "disclosure");
            disclosure[key] = String(disclosure[key]).split(word).join("");
          }),
        ),
      ).toThrow(new RegExp(`disclosure\\.${key}`));
    });

    it("고지가 통째로 비면 거부한다", () => {
      for (const key of [
        "straightLineNote",
        "schoolZoneNote",
        "missingFactorsNote",
        "notARatingNote",
      ]) {
        expect(() =>
          parseLocationRules(
            poisoned((draft) => {
              section(draft, "disclosure")[key] = "";
            }),
          ),
        ).toThrow(new RegExp(`disclosure\\.${key}`));
      }
    });
  });

  it("면책 문구가 비면 거부한다", () => {
    expect(() =>
      parseLocationRules(
        poisoned((draft) => {
          draft.disclaimer = [];
        }),
      ),
    ).toThrow(/disclaimer/);
  });

  it("상태 문구가 빠지면 거부한다", () => {
    for (const key of ["unlocated", "located"]) {
      expect(() =>
        parseLocationRules(
          poisoned((draft) => {
            section(section(draft, "states"), key).note = "";
          }),
        ),
      ).toThrow(new RegExp(`states\\.${key}\\.note`));
    }
  });

  describe("어떤 문구도 '안전'하다고 말하지 않는다", () => {
    it("안전 주장 탐지기가 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
      for (const caught of MUST_BE_CAUGHT) {
        expect(safetyClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of MUST_BE_ALLOWED) {
        expect(safetyClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it("검사 대상 문구를 실제로 모은다(전제)", () => {
      // 문구를 못 모으면 아래 검사가 공허하게 통과한다.
      expect(ruleStrings(rawLocationRules).length).toBeGreaterThan(15);
    });

    it("실제 룰셋의 어떤 문구도 '안전'하다고 말하지 않는다", () => {
      expect(ruleStrings(rawLocationRules).flatMap(safetyClaimsIn)).toEqual([]);
    });

    it("룰셋에 안심 문구를 심으면 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        section(section(draft, "states"), "located").note =
          "주변이 잘 갖춰져 있으니 안심하고 진행하세요.";
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
      expect(ruleStrings(rawLocationRules).flatMap(bargainClaimsIn)).toEqual([]);
    });

    it("룰셋에 '역까지 가까워서 시세보다 싸요'를 심으면 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        section(section(draft, "subway"), "messages").measured =
          "역이 가까워서 이 단지는 시세보다 싸요.";
      });
      expect(ruleStrings(poisonedRules).flatMap(bargainClaimsIn)).not.toEqual([]);
    });
  });

  describe("어떤 문구도 점수·등급·순위를 매기지 않는다", () => {
    /**
     * 이 축이 입지 화면에서 가장 미끄러지기 쉬운 자리다. "학군 90점"은
     * 안전 주장 그물에도 값 주장 그물에도 하나도 걸리지 않으면서 이
     * 제품이 절대 하면 안 되는 말이다.
     */
    it("등급 주장 탐지기가 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
      for (const caught of RATING_MUST_BE_CAUGHT) {
        expect(ratingClaimsIn(caught), caught).not.toEqual([]);
      }
      for (const allowed of RATING_MUST_BE_ALLOWED) {
        expect(ratingClaimsIn(allowed), allowed).toEqual([]);
      }
    });

    it("실제 룰셋의 어떤 문구도 점수·등급·순위를 말하지 않는다", () => {
      expect(ruleStrings(rawLocationRules).flatMap(ratingClaimsIn)).toEqual([]);
    });

    it.each([
      ["학군 점수", "이 단지의 학군 점수는 90점이에요."],
      ["교통 등급", "교통 등급은 A예요."],
      ["역세권 딱지", "역이 가까워서 역세권이에요."],
      ["좋다는 결론", "주변 환경이 좋아요."],
      ["순위", "이 지역 초등학교 순위는 3위예요."],
    ])("룰셋에 '%s'를 심으면 잡아낸다(변이 검사)", (_label, text) => {
      const poisonedRules = poisoned((draft) => {
        section(section(draft, "states"), "located").note = text;
      });
      expect(ruleStrings(poisonedRules).flatMap(ratingClaimsIn)).not.toEqual([]);
    });
  });

  describe("도보 시간을 지어내지 않는다", () => {
    /**
     * 직선거리에서 도보 시간을 환산하는 것(예: "80m = 1분")은 이 화면이
     * 가장 하기 쉬운 거짓말이다. 경로를 모르는 채로 분 단위를 적으면
     * 사용자는 그것을 우리가 아는 사실로 읽는다. 룰셋 문구가 도보 시간을
     * 약속하지 않는지 본다 — 다만 고지가 "직선 500m가 걸어서 15분일
     * 수도 있어요"라고 **반대 방향으로** 말하는 것은 지켜야 하는 말이라
     * 부정어·가정 표현을 놓아준다.
     */
    const PROMISED_WALK_TIME = /도보\s*\d+\s*분|걸어서\s*\d+\s*분(?!일)/;

    it("실제 룰셋에 약속된 도보 시간이 없다", () => {
      const offenders = ruleStrings(rawLocationRules).filter((text) =>
        PROMISED_WALK_TIME.test(text),
      );
      expect(offenders).toEqual([]);
    });

    it("탐지기가 실제로 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        section(section(draft, "subway"), "messages").measured =
          "가장 가까운 역까지 도보 7분이에요.";
      });
      expect(
        ruleStrings(poisonedRules).filter((text) => PROMISED_WALK_TIME.test(text)),
      ).not.toEqual([]);
    });

    it("고지의 '걸어서 15분일 수도 있어요'는 놓아준다(오탐 방지 확인)", () => {
      expect(
        PROMISED_WALK_TIME.test("직선 500m가 걸어서 15분일 수도 있어요."),
      ).toBe(false);
    });
  });
});
