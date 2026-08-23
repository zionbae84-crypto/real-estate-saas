import { describe, expect, it } from "vitest";
import rawFinanceRules from "../../../rules/2026-08.json";
import rawPurchaseRules from "../../../rules/purchase-2026-08.json";
import { calcAcquisitionCosts, parseRules, type Rules } from "../finance";
import { assessPurchase } from "./assess";
import { parsePurchaseRules } from "./rules";
import type {
  GapInput,
  PurchaseMetricId,
  PurchaseMetricResult,
  PurchaseRules,
  RentalInput,
} from "./types";

const rules: PurchaseRules = parsePurchaseRules(rawPurchaseRules);
const financeRules: Rules = parseRules(rawFinanceRules);

const 억 = 100_000_000;
const 만 = 10_000;

/** 룰셋을 복제해 임계값만 바꾼다. 판정이 코드가 아니라 데이터에서 오는지 확인하는 데 쓴다 */
function withRules(mutate: (draft: Record<string, unknown>) => void): PurchaseRules {
  const draft = JSON.parse(JSON.stringify(rawPurchaseRules)) as Record<
    string,
    unknown
  >;
  mutate(draft);
  return parsePurchaseRules(draft);
}

function metricOf(
  metrics: PurchaseMetricResult[],
  id: PurchaseMetricId,
): PurchaseMetricResult {
  const found = metrics.find((metric) => metric.id === id);
  if (found === undefined) throw new Error(`지표를 찾지 못했다: ${id}`);
  return found;
}

function gap(input: Partial<GapInput>) {
  return assessPurchase(rules, financeRules, {
    type: "갭투자",
    price: null,
    deposit: null,
    cash: null,
    ...input,
  });
}

function rental(input: Partial<RentalInput>) {
  return assessPurchase(rules, financeRules, {
    type: "월세수익형",
    price: null,
    deposit: null,
    cash: null,
    monthlyRent: null,
    annualOperatingCost: null,
    loan: { kind: "unknown" },
    ...input,
  });
}

/** 룰셋이 부대비용에 쓰기로 한 전제 그대로 계산한 부대비용 */
function costsAt(price: number): number {
  return calcAcquisitionCosts(
    price,
    {
      status: "무주택",
      cash: 0,
      annualIncome: 0,
      existingDebtAnnualPayment: 0,
      isFirstTimeBuyer: rules.acquisition.isFirstTimeBuyer,
      exclusiveAreaSqm: rules.acquisition.assumedExclusiveAreaSqm,
      isRegulatedArea: true,
    },
    financeRules,
  ).total;
}

describe("유형에 맞는 지표만 낸다", () => {
  it("실거주로는 지표를 낼 수 없다 — 타입 수준에서 막힌다", () => {
    /*
     * 이 함수는 실행되지 않는다. 잠그는 것은 `tsc --noEmit`이다 —
     * 실거주가 PurchaseInput에 들어오는 순간 아래 @ts-expect-error가
     * "쓸모없는 무시"가 되어 타입 검사가 실패한다. 부모 스펙 14절:
     * DSCR은 임대수익이 0이라 실거주에서 분자가 성립하지 않는다.
     */
    function 실거주로_부르기() {
      assessPurchase(rules, financeRules, {
        // @ts-expect-error 실거주는 PurchaseInput 유니온에 없다
        type: "실거주",
        price: 5 * 억,
        deposit: 3 * 억,
        cash: 2 * 억,
      });
    }
    expect(typeof 실거주로_부르기).toBe("function");
  });

  it("룰셋에서 실거주는 지표를 하나도 갖지 않는다", () => {
    expect(rules.types.실거주.metrics).toEqual([]);
  });

  it("갭투자는 DSCR·Cap Rate·RTI를 내지 않는다", () => {
    const ids = gap({ price: 5 * 억, deposit: 3 * 억, cash: 2 * 억 }).metrics.map(
      (metric) => metric.id,
    );
    expect(ids).not.toContain("dscr");
    expect(ids).not.toContain("capRate");
    expect(ids).not.toContain("rti");
    expect(ids).toEqual(["jeonseRatio", "ownFunds", "reverseJeonse"]);
  });

  it("월세 수익형은 전세가율·역전세를 내지 않는다", () => {
    const ids = rental({ price: 5 * 억 }).metrics.map((metric) => metric.id);
    expect(ids).not.toContain("jeonseRatio");
    expect(ids).not.toContain("reverseJeonse");
    expect(ids).toEqual(["ownFunds", "capRate", "dscr", "rti"]);
  });

  it("어느 유형이든 대출 한도 대신 모른다고 말한다", () => {
    for (const assessment of [gap({ price: 5 * 억 }), rental({ price: 5 * 억 })]) {
      expect(assessment.loanLimitNote).toContain("계산하지 않아요");
      expect(assessment.loanLimitNote).toContain("금융기관에 직접 확인");
    }
  });
});

describe("갭투자 — 전세가율", () => {
  const price = 5 * 억;

  it("전세보증금 ÷ 매매가로 낸다", () => {
    const metric = metricOf(
      gap({ price, deposit: 3 * 억 }).metrics,
      "jeonseRatio",
    );
    expect(metric.id === "jeonseRatio" && metric.ratio).toBeCloseTo(0.6, 10);
  });

  it("expertFrom 경계는 포함이다(정확히 70%면 확인 필요)", () => {
    expect(
      metricOf(gap({ price, deposit: 3.5 * 억 }).metrics, "jeonseRatio").verdict,
    ).toBe("expert");
    expect(
      metricOf(gap({ price, deposit: 3.5 * 억 - 1 }).metrics, "jeonseRatio")
        .verdict,
    ).toBe("checked");
  });

  it("stopFrom 경계도 포함이다(정확히 80%면 사면 안 된다)", () => {
    expect(
      metricOf(gap({ price, deposit: 4 * 억 }).metrics, "jeonseRatio").verdict,
    ).toBe("stop");
    expect(
      metricOf(gap({ price, deposit: 4 * 억 - 1 }).metrics, "jeonseRatio")
        .verdict,
    ).toBe("expert");
  });

  it("임계값은 코드가 아니라 룰셋에서 온다", () => {
    const stricter = withRules((draft) => {
      const metrics = draft.metrics as Record<string, Record<string, unknown>>;
      const jeonse = metrics.jeonseRatio as Record<string, unknown>;
      jeonse.expertFrom = 0.5;
      jeonse.stopFrom = 0.55;
    });
    const assessment = assessPurchase(stricter, financeRules, {
      type: "갭투자",
      price,
      deposit: 3 * 억,
      cash: 2 * 억,
    });
    // 같은 60%가 기본 룰셋에서는 checked였다.
    expect(metricOf(assessment.metrics, "jeonseRatio").verdict).toBe("stop");
  });

  it("매매가나 보증금을 모르면 비율을 내지 않는다 — 0으로 채우지 않는다", () => {
    const metric = metricOf(gap({ price }).metrics, "jeonseRatio");
    expect(metric.verdict).toBe("unknown");
    expect(metric.id === "jeonseRatio" && metric.ratio).toBeNull();
  });
});

describe("갭투자 — 필요 자기자금", () => {
  const price = 5 * 억;
  const deposit = 3 * 억;

  it("매매가 − 보증금에 부대비용을 반드시 더한다", () => {
    const metric = metricOf(gap({ price, deposit, cash: 2 * 억 }).metrics, "ownFunds");
    if (metric.id !== "ownFunds") throw new Error("지표가 뒤바뀌었다");
    expect(costsAt(price)).toBeGreaterThan(0);
    expect(metric.required).toBe(price - deposit + costsAt(price));
    // 부대비용을 빼먹으면 필요 자기자금이 작게 나온다 — 낙관 방향이다.
    expect(metric.required).toBeGreaterThan(price - deposit);
  });

  it("현금이 모자라면 사면 안 된다고 말한다", () => {
    const metric = metricOf(
      gap({ price, deposit, cash: 1.5 * 억 }).metrics,
      "ownFunds",
    );
    expect(metric.verdict).toBe("stop");
    expect(metric.id === "ownFunds" && metric.shortfall).toBeGreaterThan(0);
  });

  it("현금이 넉넉하면 남는 현금을 함께 낸다", () => {
    const cash = 2.5 * 억;
    const metric = metricOf(gap({ price, deposit, cash }).metrics, "ownFunds");
    if (metric.id !== "ownFunds") throw new Error("지표가 뒤바뀌었다");
    expect(metric.verdict).toBe("checked");
    expect(metric.shortfall).toBe(0);
    expect(metric.remainingCash).toBe(cash - (price - deposit + costsAt(price)));
  });

  it("부대비용 때문에 딱 모자라는 경우를 놓치지 않는다", () => {
    // 매매가 − 보증금(2억)만 보면 보유 현금 2억으로 살 수 있어 보이지만,
    // 부대비용을 더하면 모자란다. 이 한 줄이 낙관 방향 결함의 자리다.
    const metric = metricOf(gap({ price, deposit, cash: 2 * 억 }).metrics, "ownFunds");
    expect(metric.verdict).toBe("stop");
  });

  it("현금을 모르면 통과시키지 않는다", () => {
    expect(metricOf(gap({ price, deposit }).metrics, "ownFunds").verdict).toBe(
      "unknown",
    );
  });
});

describe("갭투자 — 역전세", () => {
  const price = 5 * 억;
  const deposit = 3.5 * 억;
  const required = price - deposit + costsAt(price);

  it("단계마다 마련해야 할 돈을 낸다 — 하락 폭은 룰셋에서 온다", () => {
    const metric = metricOf(
      gap({ price, deposit, cash: 2 * 억 }).metrics,
      "reverseJeonse",
    );
    if (metric.id !== "reverseJeonse") throw new Error("지표가 뒤바뀌었다");
    expect(metric.stages.map((stage) => stage.drop)).toEqual([
      0.05, 0.1, 0.2, 0.3,
    ]);
    expect(metric.stages[0]?.needed).toBe(deposit - Math.round(deposit * 0.95));
    expect(metric.stages[3]?.needed).toBe(deposit - Math.round(deposit * 0.7));
  });

  it("재원은 보유 현금이 아니라 매수에 쓰고 남은 현금이다", () => {
    const cash = 2 * 억;
    const metric = metricOf(
      gap({ price, deposit, cash }).metrics,
      "reverseJeonse",
    );
    if (metric.id !== "reverseJeonse") throw new Error("지표가 뒤바뀌었다");
    expect(metric.remainingCash).toBe(cash - required);
    // 보유 현금(2억)이었다면 20% 하락(7,000만원)도 막을 수 있었겠지만,
    // 매수에 쓰고 남은 돈으로는 못 막는다.
    expect(cash).toBeGreaterThan(deposit - Math.round(deposit * 0.8));
    expect(metric.stages[2]?.covered).toBe(false);
  });

  it("작은 하락도 못 막으면 사면 안 된다고 말한다", () => {
    const smallDrop = deposit - Math.round(deposit * 0.95);
    // 5% 단계를 딱 1원 못 막는 현금
    const cash = required + smallDrop - 1;
    const metric = metricOf(gap({ price, deposit, cash }).metrics, "reverseJeonse");
    expect(metric.verdict).toBe("stop");
  });

  it("경계는 포함이다 — 딱 맞으면 막은 것으로 본다", () => {
    const smallDrop = deposit - Math.round(deposit * 0.95);
    const just = metricOf(
      gap({ price, deposit, cash: required + smallDrop }).metrics,
      "reverseJeonse",
    );
    const oneShort = metricOf(
      gap({ price, deposit, cash: required + smallDrop - 1 }).metrics,
      "reverseJeonse",
    );
    if (just.id !== "reverseJeonse" || oneShort.id !== "reverseJeonse") {
      throw new Error("지표가 뒤바뀌었다");
    }
    expect(just.stages[0]?.covered).toBe(true);
    expect(oneShort.stages[0]?.covered).toBe(false);
  });

  it("큰 하락만 못 막으면 확인 필요로 남는다", () => {
    const cash = required + (deposit - Math.round(deposit * 0.9));
    const metric = metricOf(gap({ price, deposit, cash }).metrics, "reverseJeonse");
    expect(metric.verdict).toBe("expert");
  });

  it("모든 단계를 막으면 그 사실만 말하고 안전하다고 하지 않는다", () => {
    const cash = required + deposit;
    const metric = metricOf(gap({ price, deposit, cash }).metrics, "reverseJeonse");
    expect(metric.verdict).toBe("checked");
    expect(metric.message).not.toMatch(/안전/);
  });

  it("보증금 반환 여력은 가장 큰 단계 기준이다", () => {
    const cash = 2 * 억;
    const metric = metricOf(gap({ price, deposit, cash }).metrics, "reverseJeonse");
    if (metric.id !== "reverseJeonse") throw new Error("지표가 뒤바뀌었다");
    const biggest = deposit - Math.round(deposit * 0.7);
    expect(metric.coverageRatio).toBeCloseTo((cash - required) / biggest, 10);
  });

  it("보증금이 부채로 안 잡힌다는 사실을 반드시 말한다", () => {
    const metric = metricOf(
      gap({ price, deposit, cash: 2 * 억 }).metrics,
      "reverseJeonse",
    );
    if (metric.id !== "reverseJeonse") throw new Error("지표가 뒤바뀌었다");
    expect(metric.depositIsNotDebtNote).toContain("DSR");
    expect(metric.depositIsNotDebtNote).toContain("돌려줘야");
  });

  it("하락 단계를 룰셋에서 바꾸면 계산이 따라 바뀐다", () => {
    const oneStage = withRules((draft) => {
      const metrics = draft.metrics as Record<string, Record<string, unknown>>;
      (metrics.reverseJeonse as Record<string, unknown>).stages = [
        { drop: 0.5, uncoveredVerdict: "stop" },
      ];
    });
    const assessment = assessPurchase(oneStage, financeRules, {
      type: "갭투자",
      price,
      deposit,
      cash: 2 * 억,
    });
    const metric = metricOf(assessment.metrics, "reverseJeonse");
    if (metric.id !== "reverseJeonse") throw new Error("지표가 뒤바뀌었다");
    expect(metric.stages).toHaveLength(1);
    expect(metric.stages[0]?.needed).toBe(deposit - Math.round(deposit * 0.5));
  });
});

describe("월세 수익형 — Cap Rate", () => {
  const price = 5 * 억;
  const base = { price, deposit: 3000 * 만, cash: 2 * 억 };

  it("순영업소득 ÷ 매매가로 낸다", () => {
    const metric = metricOf(
      rental({ ...base, monthlyRent: 200 * 만, annualOperatingCost: 600 * 만 })
        .metrics,
      "capRate",
    );
    if (metric.id !== "capRate") throw new Error("지표가 뒤바뀌었다");
    expect(metric.noi).toBe(200 * 만 * 12 - 600 * 만);
    expect(metric.rate).toBeCloseTo(1800 * 만 / price, 10);
  });

  it("운영비용을 모르면 0원으로 채우지 않는다 — 수익이 부풀지 않는다", () => {
    const unknown = metricOf(
      rental({ ...base, monthlyRent: 200 * 만 }).metrics,
      "capRate",
    );
    expect(unknown.verdict).toBe("unknown");
    expect(unknown.id === "capRate" && unknown.rate).toBeNull();

    // 0원이라고 **직접 적으면** 계산은 된다. 모름과 0원은 다른 답이다.
    const zero = metricOf(
      rental({ ...base, monthlyRent: 200 * 만, annualOperatingCost: 0 }).metrics,
      "capRate",
    );
    expect(zero.id === "capRate" && zero.rate).toBeCloseTo(2400 * 만 / price, 10);
  });

  it("월세를 모르면 0원으로 채우지 않는다 — 수익이 사라지지 않는다", () => {
    const unknown = metricOf(
      rental({ ...base, annualOperatingCost: 600 * 만 }).metrics,
      "capRate",
    );
    expect(unknown.verdict).toBe("unknown");
    expect(unknown.id === "capRate" && unknown.noi).toBeNull();
  });

  it("순영업소득이 마이너스면 사면 안 된다고 말한다", () => {
    const metric = metricOf(
      rental({ ...base, monthlyRent: 40 * 만, annualOperatingCost: 600 * 만 })
        .metrics,
      "capRate",
    );
    expect(metric.verdict).toBe("stop");
  });

  it("참고선 아래면 확인 필요, 위면 확인했어요다", () => {
    expect(
      metricOf(
        rental({ ...base, monthlyRent: 200 * 만, annualOperatingCost: 600 * 만 })
          .metrics,
        "capRate",
      ).verdict,
    ).toBe("expert");
    expect(
      metricOf(
        rental({ ...base, monthlyRent: 250 * 만, annualOperatingCost: 600 * 만 })
          .metrics,
        "capRate",
      ).verdict,
    ).toBe("checked");
  });

  it("참고선은 코드가 아니라 룰셋에서 온다", () => {
    const strict = withRules((draft) => {
      const metrics = draft.metrics as Record<string, Record<string, unknown>>;
      (metrics.capRate as Record<string, unknown>).expertBelow = 0.06;
    });
    const assessment = assessPurchase(strict, financeRules, {
      type: "월세수익형",
      ...base,
      monthlyRent: 250 * 만,
      annualOperatingCost: 600 * 만,
      loan: { kind: "none" },
    });
    expect(metricOf(assessment.metrics, "capRate").verdict).toBe("expert");
  });
});

describe("월세 수익형 — DSCR", () => {
  const price = 5 * 억;
  const base = {
    price,
    deposit: 3000 * 만,
    cash: 2 * 억,
    monthlyRent: 200 * 만,
    annualOperatingCost: 600 * 만,
  };
  const noi = 1800 * 만;

  it("1.0 미만이면 임대료로 대출을 못 갚는다고 말한다", () => {
    const metric = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: 2000 * 만, annualInterest: null },
      }).metrics,
      "dscr",
    );
    expect(metric.verdict).toBe("stop");
    expect(metric.message).toContain("못 갚아요");
  });

  it("정확히 1.0은 stop이 아니다(경계는 미만)", () => {
    const metric = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: noi, annualInterest: null },
      }).metrics,
      "dscr",
    );
    if (metric.id !== "dscr") throw new Error("지표가 뒤바뀌었다");
    expect(metric.ratio).toBe(1);
    expect(metric.verdict).toBe("expert");
  });

  it("1.0에서 1원만 모자라면 stop이다", () => {
    const metric = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: noi + 1, annualInterest: null },
      }).metrics,
      "dscr",
    );
    expect(metric.verdict).toBe("stop");
  });

  it("연간 원리금을 모르면 0원으로 채우지 않는다", () => {
    const metric = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: null, annualInterest: null },
      }).metrics,
      "dscr",
    );
    expect(metric.verdict).toBe("unknown");
    expect(metric.id === "dscr" && metric.ratio).toBeNull();
  });

  it("대출이 없으면 '좋다'가 아니라 '낼 수 없다'고 말한다", () => {
    const metric = metricOf(rental({ ...base, loan: { kind: "none" } }).metrics, "dscr");
    expect(metric.verdict).toBe("unknown");
    expect(metric.message).toContain("좋다는 뜻이 아니에요");
  });

  it("임계값은 코드가 아니라 룰셋에서 온다", () => {
    const lenient = withRules((draft) => {
      const metrics = draft.metrics as Record<string, Record<string, unknown>>;
      const dscr = metrics.dscr as Record<string, unknown>;
      dscr.stopBelow = 0.5;
      dscr.expertBelow = 0.6;
    });
    const assessment = assessPurchase(lenient, financeRules, {
      type: "월세수익형",
      ...base,
      loan: { kind: "known", annualDebtService: 2000 * 만, annualInterest: null },
    });
    // 기본 룰셋에서는 stop이던 0.9가 여기서는 checked다.
    expect(metricOf(assessment.metrics, "dscr").verdict).toBe("checked");
  });
});

describe("월세 수익형 — RTI", () => {
  const base = {
    price: 5 * 억,
    deposit: 3000 * 만,
    cash: 2 * 억,
    monthlyRent: 200 * 만,
    annualOperatingCost: 600 * 만,
  };

  it("연간 임대소득 ÷ 연간 이자비용으로 낸다", () => {
    const metric = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: null, annualInterest: 2000 * 만 },
      }).metrics,
      "rti",
    );
    if (metric.id !== "rti") throw new Error("지표가 뒤바뀌었다");
    expect(metric.annualRentIncome).toBe(2400 * 만);
    expect(metric.ratio).toBeCloseTo(1.2, 10);
  });

  it("참고선을 넘어도 '확인했어요'라고 말하지 않는다", () => {
    // 기준값의 출처를 확인하지 못했다. 확인되지 않은 숫자로 통과를
    // 선언하지 않는다.
    for (const interest of [2000 * 만, 1000 * 만]) {
      const metric = metricOf(
        rental({
          ...base,
          loan: { kind: "known", annualDebtService: null, annualInterest: interest },
        }).metrics,
        "rti",
      );
      expect(metric.verdict).toBe("expert");
      expect(metric.message).toContain("금융기관");
    }
  });

  it("참고선 위아래로 문구가 갈린다", () => {
    const below = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: null, annualInterest: 2000 * 만 },
      }).metrics,
      "rti",
    ).message;
    const above = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: null, annualInterest: 1000 * 만 },
      }).metrics,
      "rti",
    ).message;
    expect(below).not.toBe(above);
    expect(below).toBe(rules.metrics.rti.messages.belowReference);
    expect(above).toBe(rules.metrics.rti.messages.aboveReference);
  });

  it("참고선은 코드가 아니라 룰셋에서 온다", () => {
    const lower = withRules((draft) => {
      const metrics = draft.metrics as Record<string, Record<string, unknown>>;
      (metrics.rti as Record<string, unknown>).expertBelow = 1.1;
    });
    const assessment = assessPurchase(lower, financeRules, {
      type: "월세수익형",
      ...base,
      loan: { kind: "known", annualDebtService: null, annualInterest: 2000 * 만 },
    });
    // 기본 룰셋(1.25)에서는 belowReference였던 1.2가 여기서는 위쪽이다.
    expect(metricOf(assessment.metrics, "rti").message).toBe(
      lower.metrics.rti.messages.aboveReference,
    );
  });

  it("이자를 모르면 0원으로 채우지 않는다", () => {
    const metric = metricOf(
      rental({
        ...base,
        loan: { kind: "known", annualDebtService: null, annualInterest: null },
      }).metrics,
      "rti",
    );
    expect(metric.verdict).toBe("unknown");
  });

  it("대출이 있는데 금액을 모르는 것과 대출이 없는 것을 가른다", () => {
    const unknownLoan = metricOf(rental({ ...base, loan: { kind: "unknown" } }).metrics, "rti");
    const noLoan = metricOf(rental({ ...base, loan: { kind: "none" } }).metrics, "rti");
    expect(unknownLoan.message).not.toBe(noLoan.message);
    expect(unknownLoan.verdict).toBe("unknown");
    expect(noLoan.verdict).toBe("unknown");
  });
});

describe("전체 결론", () => {
  it("stop이 하나라도 있으면 stop이다", () => {
    const assessment = gap({ price: 5 * 억, deposit: 4.5 * 억, cash: 3 * 억 });
    expect(assessment.overall).toBe("stop");
  });

  it("빈칸이 있으면 통과가 아니라 incomplete다", () => {
    expect(gap({ price: 5 * 억 }).overall).toBe("incomplete");
  });

  it("빈칸과 확인 필요가 함께 있으면 그 사실을 덧붙인다", () => {
    // 전세가율은 낼 수 있지만(expert) 현금이 없어 나머지는 못 낸다.
    const assessment = gap({ price: 5 * 억, deposit: 3.6 * 억 });
    expect(assessment.overall).toBe("incomplete");
    expect(assessment.overallNote).toContain(
      rules.overall.incomplete.pendingExpertNote ?? "###",
    );
  });

  it("가장 좋은 결론조차 '안전하다'고 말하지 않는다", () => {
    const price = 5 * 억;
    const deposit = 2 * 억;
    const cash = price - deposit + costsAt(price) + deposit;
    const assessment = gap({ price, deposit, cash });
    expect(assessment.overall).toBe("clear");
    expect(assessment.overallLabel).not.toMatch(/안전/);
    expect(assessment.overallNote).toContain("'안전하다'는 뜻이 아니에요");
  });

  it("결론 문구는 코드가 아니라 룰셋에서 온다", () => {
    const renamed = withRules((draft) => {
      const overall = draft.overall as Record<string, Record<string, unknown>>;
      (overall.stop as Record<string, unknown>).label = "여기서 멈춰요";
    });
    const assessment = assessPurchase(renamed, financeRules, {
      type: "갭투자",
      price: 5 * 억,
      deposit: 4.5 * 억,
      cash: 3 * 억,
    });
    expect(assessment.overallLabel).toBe("여기서 멈춰요");
  });
});
