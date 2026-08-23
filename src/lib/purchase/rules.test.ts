import { describe, expect, it } from "vitest";
import rawPurchaseRules from "../../../rules/purchase-2026-08.json";
import { parsePurchaseRules } from "./rules";
import { PURCHASE_METRIC_IDS } from "./types";

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
      ).toThrow(/한 단계 이상/);
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
