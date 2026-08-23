import { describe, expect, it } from "vitest";
import {
  bargainClaimsIn,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawFinanceRules from "../../../rules/2026-08.json";
import rawPriceRules from "../../../rules/price-2026-08.json";
import { COMPLEX_UNITS } from "../../data/complexes";
import { parseRules, type BuyerProfile } from "../finance";
import { assessPrice } from "./assess";
import { parsePriceRules } from "./rules";
import type { PriceAssessment, PriceEvidence, PriceRules } from "./types";

const rules = parsePriceRules(rawPriceRules);
const financeRules = parseRules(rawFinanceRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

/**
 * 아래 근거 픽스처(10억~11억)를 실제로 감당할 수 있는 프로필.
 *
 * 기본 프로필로는 그 가격대가 애초에 예산 밖이라 예산 줄이 늘
 * "못 사요"로만 나온다 — 그러면 예산 줄이 실제로 부담을 재는지
 * 확인할 수 없다.
 */
const budget = {
  profile: profile({ cash: 600_000_000, annualIncome: 200_000_000 }),
  financeRules,
};

/**
 * 표본 조건을 넉넉히 넘는 근거.
 *
 * 거래 10건, 범위 10억~11억(폭 9.1%)이라 룰셋의 두 조건을 모두 넘는다 —
 * 이 픽스처로 내는 판정은 "표본이 모자라서 유보"가 아니다.
 */
function evidence(overrides: Partial<PriceEvidence> = {}): PriceEvidence {
  return {
    tradeCount: 10,
    minPrice: 1_000_000_000,
    maxPrice: 1_100_000_000,
    ...overrides,
  };
}

/** 실제 룰셋을 복제해 한 군데만 바꾼다 */
function withRules(mutate: (draft: Record<string, unknown>) => void): PriceRules {
  const draft = JSON.parse(JSON.stringify(rawPriceRules)) as Record<
    string,
    unknown
  >;
  mutate(draft);
  return parsePriceRules(draft);
}

function positionOf(assessment: PriceAssessment) {
  const finding = assessment.findings.find((f) => f.id === "position");
  if (finding === undefined || finding.id !== "position") {
    throw new Error("위치 줄이 없다");
  }
  return finding;
}

function budgetOf(assessment: PriceAssessment) {
  const finding = assessment.findings.find((f) => f.id === "budget");
  if (finding !== undefined && finding.id !== "budget") {
    throw new Error("예산 줄이 아니다");
  }
  return finding;
}

/** 판정 결과에 실린 **사람이 읽는 문자열**을 전부 모은다 */
function assessmentStrings(assessment: PriceAssessment): string[] {
  return [
    assessment.overallLabel,
    assessment.overallNote,
    assessment.evidenceLabel,
    assessment.evidenceMessage,
    assessment.budgetAbsentNote ?? "",
    ...Object.values(assessment.disclosure),
    ...assessment.disclaimer,
    ...assessment.findings.flatMap((f) => [f.label, f.verdictLabel, f.message]),
  ];
}

/** 판정 결과에 실린 **숫자**를 전부 모은다 */
function assessmentNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(assessmentNumbers);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(assessmentNumbers);
  }
  return [];
}

describe("호가 위치", () => {
  describe("표본이 모자라면 말하지 않는다", () => {
    it("거래 건수 하한 미만이면 어떤 호가를 넣어도 위치가 나오지 않는다(번들 데이터 전 평형)", () => {
      const shortSampled = COMPLEX_UNITS.filter(
        (u) => u.tradeCount < rules.evidence.minTradeCount,
      );
      // 전제: 그런 평형이 실제로 존재하고, 데이터의 큰 몫이다.
      expect(shortSampled.length).toBeGreaterThan(1_000);

      const offenders: string[] = [];
      for (const unit of shortSampled) {
        const ev = {
          tradeCount: unit.tradeCount,
          minPrice: unit.minPrice,
          maxPrice: unit.maxPrice,
        };
        // 범위 안쪽·아래·위·한참 위까지 훑는다. 어느 자리에서도
        // 위치 판정이 나오면 안 된다.
        for (const asking of [
          1,
          Math.floor(unit.minPrice / 2),
          unit.minPrice,
          Math.floor((unit.minPrice + unit.maxPrice) / 2),
          unit.maxPrice,
          unit.maxPrice + 1,
          Math.floor(unit.maxPrice * 1.5),
          unit.maxPrice * 10,
        ]) {
          const position = positionOf(assessPrice(rules, ev, asking, null));
          if (position.verdict !== "withheld" || position.band !== null) {
            offenders.push(`${unit.complexKey}|${unit.areaBucket} @ ${asking}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("유보는 통과가 아니다 — 전체 결론이 clear가 되지 않는다", () => {
      const assessment = assessPrice(
        rules,
        evidence({ tradeCount: rules.evidence.minTradeCount - 1 }),
        1_050_000_000,
        null,
      );
      expect(assessment.overall).toBe("withheld");
      expect(assessment.overall).not.toBe("clear");
    });

    it("왜 유보하는지 말한다", () => {
      const assessment = assessPrice(
        rules,
        evidence({ tradeCount: 1, minPrice: 1_000_000_000, maxPrice: 1_000_000_000 }),
        1_050_000_000,
        null,
      );
      expect(positionOf(assessment).message).toBe(
        rules.evidence.messages.tooFewTrades,
      );
    });

    it("호가를 넣기 전에도 '넣어도 말하지 않을 거예요'라고 미리 말한다", () => {
      const assessment = assessPrice(
        rules,
        evidence({ tradeCount: 1 }),
        null,
        null,
      );
      expect(assessment.overall).toBe("incomplete");
      expect(assessment.evidenceSufficient).toBe(false);
      expect(assessment.overallNote).toContain(
        rules.overall.incomplete.pendingWithheldNote ?? "###없음###",
      );
    });

    it("표본이 넉넉하면 그 덧말은 붙지 않는다(대조군)", () => {
      const assessment = assessPrice(rules, evidence(), null, null);
      expect(assessment.overall).toBe("incomplete");
      expect(assessment.evidenceSufficient).toBe(true);
      expect(assessment.overallNote).toBe(rules.overall.incomplete.note);
    });
  });

  it("실제 룰셋 값이 번들 데이터의 대부분을 유보로 만든다(그게 이 데이터의 실상이다)", () => {
    /*
     * 이 숫자를 여기 못박는 이유: 누군가 "유보가 너무 많다"며 임계값을
     * 낮추면, 줄어드는 것은 위험이 아니라 **우리가 틀리는 것을 알아챌
     * 기회**다. 그때 이 테스트가 먼저 빨갛게 죽어서, 그 결정이 조용히
     * 지나가지 않게 한다.
     */
    const withheld = COMPLEX_UNITS.filter(
      (unit) =>
        !assessPrice(
          rules,
          {
            tradeCount: unit.tradeCount,
            minPrice: unit.minPrice,
            maxPrice: unit.maxPrice,
          },
          unit.maxPrice,
          null,
        ).evidenceSufficient,
    );
    expect(COMPLEX_UNITS.length).toBe(1_692);
    expect(withheld.length).toBe(1_468);
    expect(withheld.length / COMPLEX_UNITS.length).toBeCloseTo(0.868, 3);
  });

  describe("범위가 한 점인 평형", () => {
    it("거래가 아무리 많아도 위치를 말하지 않는다", () => {
      // 번들 데이터의 51.7%가 이 경우다. 거래 20건이 전부 같은 값인
      // 평형이 실제로 있다(호반써밋양재 24㎡).
      const assessment = assessPrice(
        rules,
        evidence({ tradeCount: 20, minPrice: 450_000_000, maxPrice: 450_000_000 }),
        460_000_000,
        null,
      );
      const position = positionOf(assessment);
      expect(position.verdict).toBe("withheld");
      expect(position.band).toBeNull();
      expect(position.message).toBe(rules.evidence.messages.singlePoint);
    });

    it("번들 데이터의 한 점 평형 전부에서 위치가 나오지 않는다", () => {
      const points = COMPLEX_UNITS.filter((u) => u.minPrice === u.maxPrice);
      expect(points.length).toBeGreaterThan(800);

      const offenders = points.filter((unit) => {
        const ev = {
          tradeCount: unit.tradeCount,
          minPrice: unit.minPrice,
          maxPrice: unit.maxPrice,
        };
        return [unit.minPrice, unit.minPrice + 1, unit.maxPrice * 2].some(
          (asking) =>
            positionOf(assessPrice(rules, ev, asking, null)).verdict !==
            "withheld",
        );
      });
      expect(offenders.map((u) => u.complexKey)).toEqual([]);
    });

    it("호가가 그 한 점과 정확히 같아도 '확인했어요'가 되지 않는다", () => {
      const assessment = assessPrice(
        rules,
        evidence({ tradeCount: 20, minPrice: 450_000_000, maxPrice: 450_000_000 }),
        450_000_000,
        null,
      );
      expect(positionOf(assessment).verdict).toBe("withheld");
    });
  });

  it("범위가 너무 좁으면 거래가 많아도 유보한다", () => {
    // 폭 1%(룰셋 하한 2% 미만).
    const assessment = assessPrice(
      rules,
      evidence({ tradeCount: 30, minPrice: 990_000_000, maxPrice: 1_000_000_000 }),
      1_050_000_000,
      null,
    );
    expect(positionOf(assessment).verdict).toBe("withheld");
    expect(positionOf(assessment).message).toBe(
      rules.evidence.messages.narrowRange,
    );
  });

  describe("표본이 넉넉할 때의 위치", () => {
    it.each([
      [999_999_999, "below"],
      [1_000_000_000, "within"],
      [1_050_000_000, "within"],
      [1_100_000_000, "within"],
      [1_100_000_001, "aboveNear"],
      [1_300_000_000, "aboveNear"],
      // 11억의 20% 초과 = 13억 2천만원부터 aboveFar
      [1_320_000_000, "aboveFar"],
      [2_000_000_000, "aboveFar"],
    ])("호가 %i은 %s이다", (asking, band) => {
      expect(positionOf(assessPrice(rules, evidence(), asking, null)).band).toBe(
        band,
      );
    });

    it("범위 위일 때 얼마나 위인지를 초과분으로만 말한다", () => {
      const position = positionOf(
        assessPrice(rules, evidence(), 1_320_000_000, null),
      );
      expect(position.aboveMaxRatio).toBeCloseTo(0.2, 10);
      expect(position.verdict).toBe("stop");
      expect(position.message).toBe(rules.position.bands.aboveFar.message);
    });

    it("범위 안이면 초과분이 없다", () => {
      expect(
        positionOf(assessPrice(rules, evidence(), 1_050_000_000, null))
          .aboveMaxRatio,
      ).toBeNull();
    });

    it("범위 안이라도 결론은 '싸다'가 아니라 '걸리는 게 없었다'이다", () => {
      const assessment = assessPrice(rules, evidence(), 1_050_000_000, null);
      expect(assessment.overall).toBe("clear");
      expect(assessment.overallLabel).toBe(rules.overall.clear.label);
      expect(bargainClaimsIn(assessmentStrings(assessment).join(" "))).toEqual(
        [],
      );
    });
  });

  describe("임계값은 코드가 아니라 룰셋에서 온다", () => {
    it("거래 건수 하한을 내리면 판정이 따라 나온다", () => {
      const ev = evidence({ tradeCount: 3 });
      expect(positionOf(assessPrice(rules, ev, 1_050_000_000, null)).verdict).toBe(
        "withheld",
      );

      const looser = withRules((draft) => {
        (draft.evidence as Record<string, unknown>).minTradeCount = 3;
      });
      expect(
        positionOf(assessPrice(looser, ev, 1_050_000_000, null)).band,
      ).toBe("within");
    });

    it("거래 건수 하한을 올리면 판정이 사라진다", () => {
      const stricter = withRules((draft) => {
        (draft.evidence as Record<string, unknown>).minTradeCount = 30;
      });
      expect(
        positionOf(assessPrice(stricter, evidence(), 1_050_000_000, null))
          .verdict,
      ).toBe("withheld");
    });

    it("초과 임계값을 내리면 같은 호가가 더 무거운 판정을 받는다", () => {
      const asking = 1_200_000_000; // 약 9.1% 초과
      expect(positionOf(assessPrice(rules, evidence(), asking, null)).band).toBe(
        "aboveNear",
      );

      const stricter = withRules((draft) => {
        (draft.position as Record<string, unknown>).aboveFarFrom = 0.05;
      });
      expect(
        positionOf(assessPrice(stricter, evidence(), asking, null)).band,
      ).toBe("aboveFar");
    });

    it("범위 폭 하한을 올리면 넓은 범위도 유보가 된다", () => {
      const stricter = withRules((draft) => {
        (draft.evidence as Record<string, unknown>).minRangeWidthRatio = 0.5;
      });
      expect(
        positionOf(assessPrice(stricter, evidence(), 1_050_000_000, null))
          .verdict,
      ).toBe("withheld");
    });
  });

  describe("점 추정을 만들지 않는다", () => {
    it("번들 데이터 전 평형에서 산출물에 범위 중간값이 없다", () => {
      // 호가로는 중간값과 멀리 떨어진 값을 넣는다 — 사용자가 넣은
      // 호가는 당연히 산출물에 있으므로, 그 값이 중간값과 같으면
      // 이 검사가 자기 자신을 잡는다.
      const offenders: string[] = [];
      for (const unit of COMPLEX_UNITS) {
        const midpoint = (unit.minPrice + unit.maxPrice) / 2;
        if (midpoint === unit.minPrice || midpoint === unit.maxPrice) continue;

        const assessment = assessPrice(
          rules,
          {
            tradeCount: unit.tradeCount,
            minPrice: unit.minPrice,
            maxPrice: unit.maxPrice,
          },
          unit.maxPrice * 3,
          null,
        );
        if (assessmentNumbers(assessment).includes(midpoint)) {
          offenders.push(unit.complexKey);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("검사기가 실제로 중간값을 잡아낸다(변이 검사)", () => {
      // 산출물에 중간값이 섞이면 위 검사가 잡는다는 것을 여기서 고정한다.
      const midpoint = (1_000_000_000 + 1_100_000_000) / 2;
      expect(assessmentNumbers({ a: 1, b: { c: midpoint } })).toContain(
        midpoint,
      );
    });
  });

  describe("예산과의 연결", () => {
    it("실거주 프로필이 없으면 예산 줄을 아예 만들지 않는다", () => {
      const assessment = assessPrice(rules, evidence(), 1_050_000_000, null);
      expect(budgetOf(assessment)).toBeUndefined();
      expect(assessment.budgetAbsentNote).toBe(rules.budget.absentNote);
    });

    it("실거주 프로필이 없으면 산출물 어디에도 대출·월 상환액이 없다", () => {
      const assessment = assessPrice(rules, evidence(), 1_050_000_000, null);
      const numbers = assessmentNumbers(assessment);
      // 남는 숫자는 호가·거래 건수·범위·초과분뿐이다.
      expect(numbers.sort((a, b) => a - b)).toEqual([
        10, 1_000_000_000, 1_050_000_000, 1_100_000_000,
      ]);
    });

    it("프로필이 있으면 기존 엔진으로 부담을 낸다", () => {
      const assessment = assessPrice(rules, evidence(), 1_050_000_000, budget);
      const line = budgetOf(assessment);
      expect(line?.id).toBe("budget");
      expect(line?.costs.total).toBeGreaterThan(0);
      expect(line?.neededLoan).toBeGreaterThan(0);
    });

    it("살 수 없는 호가에서는 대출·월 상환액을 비운다", () => {
      const poor = {
        profile: profile({ cash: 10_000_000, annualIncome: 20_000_000 }),
        financeRules,
      };
      const line = budgetOf(assessPrice(rules, evidence(), 1_050_000_000, poor));
      expect(line?.id === "budget" && line.situation).toBe("unaffordable");
      expect(line?.id === "budget" && line.neededLoan).toBeNull();
      expect(line?.id === "budget" && line.monthlyPayment).toBeNull();
      expect(line?.id === "budget" && line.burdenRatio).toBeNull();
      expect(line?.id === "budget" && line.shortfall).toBeGreaterThan(0);
    });

    it("예산이 걸리면 위치가 깨끗해도 전체 결론이 clear가 아니다", () => {
      const poor = {
        profile: profile({ cash: 10_000_000, annualIncome: 20_000_000 }),
        financeRules,
      };
      const assessment = assessPrice(rules, evidence(), 1_050_000_000, poor);
      expect(positionOf(assessment).band).toBe("within");
      expect(assessment.overall).toBe("stop");
    });

    it("예산 줄이 '안전' 등급 글자를 화면 문구로 내보내지 않는다", () => {
      const assessment = assessPrice(rules, evidence(), 1_050_000_000, budget);
      const line = budgetOf(assessment);
      expect(line?.id === "budget" && line.safetyLevel).toBe("safe");
      // 등급 자체는 계산에 남지만, 사람이 읽는 문구에는 나가지 않는다.
      expect(safetyClaimsIn(assessmentStrings(assessment).join(" "))).toEqual(
        [],
      );
    });
  });

  describe("층·향 고지는 언제나 판정과 함께 나간다", () => {
    it.each([
      ["유보", evidence({ tradeCount: 1 }), 1_050_000_000],
      ["한 점", evidence({ maxPrice: 1_000_000_000 }), 1_050_000_000],
      ["범위 안", evidence(), 1_050_000_000],
      ["범위 아래", evidence(), 500_000_000],
      ["범위 조금 위", evidence(), 1_200_000_000],
      ["범위 한참 위", evidence(), 2_000_000_000],
      ["호가 없음", evidence(), null],
    ])("%s일 때도 실려 나간다", (_label, ev, asking) => {
      const assessment = assessPrice(rules, ev, asking, budget);
      expect(assessment.disclosure.floorNote).toBe(rules.disclosure.floorNote);
      expect(assessment.disclosure.reportingLagNote).toBe(
        rules.disclosure.reportingLagNote,
      );
      expect(assessment.disclosure.notAVerdictNote).toBe(
        rules.disclosure.notAVerdictNote,
      );
      expect(assessment.disclosure.noPointEstimateNote).toBe(
        rules.disclosure.noPointEstimateNote,
      );
    });
  });

  describe("어떤 입력으로도 '안전·싸다'는 결론이 나오지 않는다", () => {
    it("입력 공간을 훑어도 두 탐지기에 하나도 걸리지 않는다", () => {
      const offenders: string[] = [];
      const budgets = [null, budget, {
        profile: profile({ cash: 10_000_000, annualIncome: 20_000_000 }),
        financeRules,
      }];

      for (const unit of COMPLEX_UNITS.slice(0, 120)) {
        const ev = {
          tradeCount: unit.tradeCount,
          minPrice: unit.minPrice,
          maxPrice: unit.maxPrice,
        };
        for (const asking of [
          null,
          Math.max(1, Math.floor(unit.minPrice * 0.5)),
          unit.minPrice,
          unit.maxPrice,
          Math.floor(unit.maxPrice * 1.1),
          Math.floor(unit.maxPrice * 3),
        ]) {
          for (const b of budgets) {
            const text = assessmentStrings(
              assessPrice(rules, ev, asking, b),
            ).join(" ");
            offenders.push(...safetyClaimsIn(text), ...bargainClaimsIn(text));
          }
        }
      }
      expect([...new Set(offenders)]).toEqual([]);
    });

    it("두 탐지기가 실제로 살아 있다(변이 검사)", () => {
      const poisonedRules = withRules((draft) => {
        (
          (draft.overall as Record<string, Record<string, unknown>>)
            .clear as Record<string, unknown>
        ).label = "잘 샀어요. 안심하셔도 돼요.";
      });
      const text = assessmentStrings(
        assessPrice(poisonedRules, evidence(), 1_050_000_000, null),
      ).join(" ");
      expect(bargainClaimsIn(text)).not.toEqual([]);
      expect(safetyClaimsIn(text)).not.toEqual([]);
    });
  });

  describe("전체 결론의 순서", () => {
    it("stop이 하나라도 있으면 stop이다", () => {
      expect(assessPrice(rules, evidence(), 2_000_000_000, budget).overall).toBe(
        "stop",
      );
    });

    it("호가가 없으면 incomplete다", () => {
      expect(assessPrice(rules, evidence(), null, budget).overall).toBe(
        "incomplete",
      );
    });

    it("범위 아래는 expert다", () => {
      expect(assessPrice(rules, evidence(), 500_000_000, null).overall).toBe(
        "expert",
      );
    });

    it("범위 조금 위는 expert다", () => {
      expect(assessPrice(rules, evidence(), 1_200_000_000, null).overall).toBe(
        "expert",
      );
    });
  });
});
