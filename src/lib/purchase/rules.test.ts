import { describe, expect, it } from "vitest";
import {
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawPurchaseRules from "../../../rules/purchase-2026-08.json";
import { parsePurchaseRules } from "./rules";
import { PURCHASE_METRIC_IDS } from "./types";

/**
 * 룰셋 JSON 안에서 **사용자에게 보이는 문자열**을 모두 모은다.
 *
 * `scripts/tone-guard.test.ts`의 같은 함수와 같은 규칙이다 — 밑줄로
 * 시작하는 키는 내부 주석 자리라 파서도 보지 않으므로 뺀다. 나머지는
 * 전부 검사한다. 뺄 것을 적게 두는 쪽이 그물을 크게 한다.
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

const acquisition = (draft: Record<string, unknown>) =>
  draft.acquisition as Record<string, unknown>;

const ownFundsMessages = (
  draft: Record<string, unknown>,
  type: "갭투자" | "월세수익형",
) =>
  (metrics(draft, "ownFunds").messages as Record<
    string,
    Record<string, unknown>
  >)[type] as Record<string, unknown>;

/** 실제 룰셋을 복제해 한 군데만 망가뜨린다 */
function poisoned(mutate: (draft: Record<string, unknown>) => void): unknown {
  const draft = JSON.parse(JSON.stringify(rawPurchaseRules)) as Record<
    string,
    unknown
  >;
  mutate(draft);
  return draft;
}

/** 복제본 안의 한 갈래를 꺼낸다. 실제 룰셋에 있는 키만 넘기므로 존재를 전제한다 */
function branch(
  container: Record<string, unknown>,
  section: string,
  key: string,
): Record<string, unknown> {
  const group = container[section] as Record<string, Record<string, unknown>>;
  return group[key] as Record<string, unknown>;
}

function types(draft: Record<string, unknown>, name: string): Record<string, unknown> {
  return branch(draft, "types", name);
}

function metrics(draft: Record<string, unknown>, name: string): Record<string, unknown> {
  return branch(draft, "metrics", name);
}

describe("구매 유형 룰셋", () => {
  it("실제 파일이 통과한다", () => {
    const rules = parsePurchaseRules(rawPurchaseRules);
    expect(rules.version).toBe("purchase-2026-08");
  });

  it("정의된 지표가 실제로 여섯 개 다 붙어 있다(전제)", () => {
    // 이 전제가 깨지면 아래 검사들이 공허하게 통과한다.
    const rules = parsePurchaseRules(rawPurchaseRules);
    const used = new Set([
      ...rules.types.갭투자.metrics,
      ...rules.types.월세수익형.metrics,
    ]);
    expect([...used].sort()).toEqual([...PURCHASE_METRIC_IDS].sort());
  });

  describe("실거주에 투자 지표를 붙일 수 없다", () => {
    // 부모 스펙 14절: DSCR은 임대수익이 0이라 실거주에서 분자가
    // 성립하지 않는다. 코드가 아니라 데이터 수준에서 막는다.
    for (const id of ["dscr", "capRate", "rti", "jeonseRatio"] as const) {
      it(`실거주.metrics에 ${id}를 넣으면 거부한다`, () => {
        expect(() =>
          parsePurchaseRules(
            poisoned((draft) => {
              types(draft, "실거주").metrics = [id];
            }),
          ),
        ).toThrow(/실거주.metrics는 빈 배열/);
      });
    }
  });

  it("투자 유형이 대출 한도를 계산한다고 선언하면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          types(draft, "갭투자").computesLoanLimit = true;
        }),
      ),
    ).toThrow(/과대 계상/);
  });

  it("한도를 계산하지 않는다면서 이유를 말하지 않으면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          delete types(draft, "월세수익형").loanLimitNote;
        }),
      ),
    ).toThrow(/loanLimitNote/);
  });

  it("어느 유형에도 붙지 않은 지표를 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          types(draft, "월세수익형").metrics = ["ownFunds", "capRate", "dscr"];
        }),
      ),
    ).toThrow(/metrics.rti가 정의돼 있는데/);
  });

  it("전세가율 임계값이 뒤집히면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          metrics(draft, "jeonseRatio").expertFrom = 0.95;
        }),
      ),
    ).toThrow(/expertFrom은 stopFrom 이하/);
  });

  it("DSCR·Cap Rate 임계값이 뒤집히면 거부한다", () => {
    for (const id of ["dscr", "capRate"] as const) {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            metrics(draft, id).stopBelow = 99;
          }),
        ),
      ).toThrow(/stopBelow는 expertBelow 이하/);
    }
  });

  it("RTI에 stop 임계값을 두면 거부한다", () => {
    // 기준값의 출처를 확인하지 못했다. 확인되지 않은 숫자로 거래를
    // 멈추라고 말할 수는 없다.
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          metrics(draft, "rti").stopBelow = 1;
        }),
      ),
    ).toThrow(/stopBelow를 둘 수 없어요/);
  });

  describe("역전세 단계", () => {
    it("단계가 하나도 없으면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            metrics(draft, "reverseJeonse").stages = [];
          }),
        ),
      ).toThrow(/두 단계 이상/);
    });

    /*
     * 리뷰 수정(Minor 1): 예전 파서는 단계가 **하나만** 있어도 통과시켰다.
     * 그런데 같은 자리의 오류 문구와 룰셋 `_note`는 "단일 시나리오는 '그
     * 숫자만 피하면 된다'로 읽힌다"고 말한다 — 강제하는 불변식과 적어 둔
     * 이유가 어긋나 있었다. 이 검사가 그 어긋남을 잠근다.
     */
    it("단계가 하나뿐이어도 거부한다 — 단일 시나리오는 '그 숫자만 피하면 된다'로 읽힌다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            metrics(draft, "reverseJeonse").stages = [
              { drop: 0.2, uncoveredVerdict: "stop" },
            ];
          }),
        ),
      ).toThrow(/두 단계 이상/);
    });

    it("두 단계면 통과한다(오탐 방지 확인)", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            metrics(draft, "reverseJeonse").stages = [
              { drop: 0.1, uncoveredVerdict: "stop" },
              { drop: 0.2, uncoveredVerdict: "expert" },
            ];
          }),
        ),
      ).not.toThrow();
    });

    it("하락 폭이 오름차순이 아니면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            metrics(draft, "reverseJeonse").stages = [
              { drop: 0.3, uncoveredVerdict: "stop" },
              { drop: 0.1, uncoveredVerdict: "stop" },
            ];
          }),
        ),
      ).toThrow(/앞 단계보다 커야/);
    });

    it("작은 하락이 더 약한 판정을 받으면 거부한다", () => {
      // 5% 하락도 못 막는 쪽이 30% 하락을 못 막는 쪽보다 위험하다.
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            metrics(draft, "reverseJeonse").stages = [
              { drop: 0.05, uncoveredVerdict: "expert" },
              { drop: 0.3, uncoveredVerdict: "stop" },
            ];
          }),
        ),
      ).toThrow(/앞 단계보다 무거워요/);
    });

    it("하락 폭이 0이나 100%면 거부한다", () => {
      for (const drop of [0, 1, -0.1]) {
        expect(() =>
          parsePurchaseRules(
            poisoned((draft) => {
              metrics(draft, "reverseJeonse").stages = [
                { drop, uncoveredVerdict: "stop" },
                { drop: 0.5, uncoveredVerdict: "expert" },
              ];
            }),
          ),
        ).toThrow(/0과 1 사이/);
      }
    });
  });

  it("미입력 결론의 덧말이 없으면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          delete branch(draft, "overall", "incomplete").pendingExpertNote;
        }),
      ),
    ).toThrow(/pendingExpertNote/);
  });

  it("부대비용 전제 문구가 없으면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          delete (draft.acquisition as Record<string, unknown>).note;
        }),
      ),
    ).toThrow(/acquisition.note/);
  });

  /**
   * 리뷰 수정(Critical 1): 부대비용 계산에는 **취득자의 주택 수가 들어
   * 있지 않다.** `calcAcquisitionCosts`는 `profile.status`를 읽지 않고,
   * `rules/2026-08.json`에도 다주택 취득세 중과 분기가 없다. 2026년 8월의
   * 중과율을 확인하지 못했으므로 그 숫자를 넣지 않는다 — 대신 화면이 그
   * 한계를 **반대 방향으로 말하지 못하게** 파서가 막는다.
   *
   * 예전 문구는 "실제 조건이 다르면 부대비용은 이보다 작아질 수 있어요"로
   * 한 방향으로 단언했다. 그 문장은 이름 붙인 두 전제(면적·생애최초)에
   * 대해서만 참이고, 이름 붙이지 않은 세 번째 전제(주택 수)에 대해서는
   * 정확히 반대다. 아래 검사들이 그 문구로 되돌아가는 편집을 잡는다.
   */
  describe("부대비용 전제 — 주택 수를 묻지 않았다는 사실", () => {
    it("householdCountNote가 없으면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            delete acquisition(draft).householdCountNote;
          }),
        ),
      ).toThrow(/acquisition.householdCountNote/);
    });

    it("주택 수를 말하지 않으면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            acquisition(draft).householdCountNote =
              "실제 조건이 다르면 부대비용은 이보다 커질 수 있어요.";
          }),
        ),
      ).toThrow(/주택 수/);
    });

    it("커질 수 있다는 방향을 말하지 않으면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            acquisition(draft).householdCountNote =
              "주택 수는 이 계산에 들어 있지 않아요.";
          }),
        ),
      ).toThrow(/커질 수 있다는 방향/);
    });

    it("옛 문구(한 방향 단언)로 되돌리면 거부한다", () => {
      // 이 커밋 직전에 화면에 실제로 나가던 문장 그대로다. 앞쪽에서
      // "둘 다 비용이 커지는 쪽"이라고 덧붙여도 독자가 가져가는 결론은
      // 뒤쪽의 "이보다 작아질 수 있어요"라, 그 모양도 함께 거부한다.
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            acquisition(draft).note =
              "부대비용은 전용면적 86㎡·생애최초 감면 없음으로 계산했어요. 둘 다 비용이 커지는 쪽이라, 실제 조건이 다르면 부대비용은 이보다 작아질 수 있어요.";
          }),
        ),
      ).toThrow(/acquisition.note가 부대비용이 이보다 작아질 수 있다고/);
    });

    it("주택 수를 이름 붙이지 않은 채 작아진다고 말하면 거부한다", () => {
      // 커지는 방향을 함께 말해도, 주택 수를 이름 붙이지 않으면 거부한다 —
      // 옛 문구가 정확히 그 모양이었다.
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            acquisition(draft).note =
              "전제는 비용이 커지는 쪽으로 잡았어요. 조건이 다르면 부대비용은 이보다 작아질 수 있어요.";
          }),
        ),
      ).toThrow(/작아질 수 있다고/);
    });

    it("주택 수와 커지는 방향을 함께 말하면 작아지는 쪽도 쓸 수 있다(오탐 방지 확인)", () => {
      // 양쪽을 다 말하는 것은 단언이 아니다 — 막을 이유가 없다.
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            acquisition(draft).note =
              "주택 수는 묻지 않아서 이 계산에 들어 있지 않아요. 이미 집이 있으면 부대비용은 이보다 커질 수 있고, 전용면적이 작으면 작아질 수도 있어요.";
          }),
        ),
      ).not.toThrow();
    });

    it("실제 룰셋이 두 가지를 다 말한다", () => {
      const rules = parsePurchaseRules(rawPurchaseRules);
      expect(rules.acquisition.householdCountNote).toContain("주택 수");
      expect(rules.acquisition.householdCountNote).toMatch(/커질 수 있어요/);
      // 한 방향 단언은 어디에도 남아 있지 않다.
      for (const text of [
        rules.acquisition.note,
        rules.acquisition.householdCountNote,
      ]) {
        expect(text).not.toMatch(/작아질 수 있어요/);
      }
    });
  });

  /**
   * 리뷰 수정(Important 2): 월세 수익형 화면의 필드 라벨은 "보증금"인데
   * 결과 문구가 "전세보증금"이라고 말하면, 사용자가 방금 적은 값과 다른
   * 것을 가리키는 말이 된다. 두 유형이 문구를 다시 공유하면 여기서
   * 거부된다.
   */
  describe("필요 자기자금 문구는 유형별로 갈린다", () => {
    it("월세 수익형 문구가 '전세보증금'이라고 말하면 거부한다", () => {
      for (const key of ["stop", "checked", "unknown", "loanUnknown"] as const) {
        expect(() =>
          parsePurchaseRules(
            poisoned((draft) => {
              ownFundsMessages(draft, "월세수익형")[key] =
                "매매가에서 전세보증금을 뺀 돈이에요.";
            }),
          ),
        ).toThrow(/전세보증금/);
      }
    });

    it("유형별 갈래가 통째로 빠지면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            delete (metrics(draft, "ownFunds").messages as Record<string, unknown>)[
              "월세수익형"
            ];
          }),
        ),
      ).toThrow(/metrics.ownFunds.messages.월세수익형/);
    });

    it("대출 원금을 몰라 못 낸다는 문구가 없으면 거부한다", () => {
      expect(() =>
        parsePurchaseRules(
          poisoned((draft) => {
            delete ownFundsMessages(draft, "월세수익형").loanUnknown;
          }),
        ),
      ).toThrow(/loanUnknown/);
    });

    it("실제 룰셋에서 월세 문구는 '보증금'이라고만 말한다", () => {
      const rules = parsePurchaseRules(rawPurchaseRules);
      for (const text of Object.values(rules.metrics.ownFunds.messages.월세수익형)) {
        expect(text, text).not.toContain("전세보증금");
      }
      // 대조군: 갭투자 문구는 여전히 전세보증금이라고 말한다.
      expect(rules.metrics.ownFunds.messages.갭투자.stop).toContain("전세보증금");
    });
  });

  /**
   * 리뷰 수정(Important 4): 권리분석 룰셋과 같은 그물을 여기에도 건다.
   * 룰셋 문구는 사람이 손으로 고치는 자리인데, "안전해요"가 들어와도
   * 실패하는 테스트가 없었다.
   */
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
      // 수집기가 빈 배열을 내면 아래 검사가 공허하게 통과한다.
      const phrases = ruleStrings(rawPurchaseRules);
      expect(phrases.length).toBeGreaterThan(50);
      expect(phrases).toContain(
        parsePurchaseRules(rawPurchaseRules).acquisition.householdCountNote,
      );
    });

    it("실제 룰셋의 어떤 문구도 '안전'하다고 말하지 않는다", () => {
      const offenders = ruleStrings(rawPurchaseRules).flatMap(safetyClaimsIn);
      expect(offenders).toEqual([]);
    });

    it("룰셋에 안심 문구를 심으면 잡아낸다(변이 검사)", () => {
      const poisonedRules = poisoned((draft) => {
        branch(draft, "overall", "clear").note = "안심하고 진행하세요.";
      });
      expect(ruleStrings(poisonedRules).flatMap(safetyClaimsIn)).not.toEqual([]);
    });
  });

  it("판정 라벨이 빠지면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          delete (draft.verdictLabels as Record<string, unknown>).unknown;
        }),
      ),
    ).toThrow(/verdictLabels.unknown/);
  });

  it("지표 문구가 빠지면 거부한다", () => {
    expect(() =>
      parsePurchaseRules(
        poisoned((draft) => {
          delete (metrics(draft, "capRate").messages as Record<string, unknown>).stop;
        }),
      ),
    ).toThrow(/metrics.capRate.messages.stop/);
  });
});
