import { describe, expect, it } from "vitest";
import {
  bargainClaimsIn,
  ratingClaimsIn,
  safetyClaimsIn,
} from "../../../scripts/claims-safety";
import rawFinanceRules from "../../../rules/2026-08.json";
import rawLocationRules from "../../../rules/location-2026-08.json";
import rawPriceRules from "../../../rules/price-2026-08.json";
import rawPurchaseRules from "../../../rules/purchase-2026-08.json";
import rawRightsRules from "../../../rules/rights-2026-08.json";
import rawSummaryRules from "../../../rules/summary-2026-08.json";
import { type BuyerProfile, parseRules } from "../finance";
import { assessLocation, parseLocationRules } from "../location";
import type { LocationAssessment } from "../location";
import { assessPrice, parsePriceRules } from "../price";
import type { PriceAssessment, PriceEvidence } from "../price";
import { assessPurchase, parsePurchaseRules } from "../purchase";
import type { PurchaseAssessment } from "../purchase";
import { assessRights, parseRightsRules } from "../rights";
import type { RightsAnswer, RightsAnswers, RightsAssessment, RightsOption } from "../rights";
import { buildDiagnosisSummary } from "./assess";
import { parseSummaryRules } from "./rules";
import type { DiagnosisSummaryInput, SummaryAxisId, SummaryRules } from "./types";
import { SUMMARY_AXIS_IDS } from "./types";

const summaryRules: SummaryRules = parseSummaryRules(rawSummaryRules);
const rightsRules = parseRightsRules(rawRightsRules);
const purchaseRules = parsePurchaseRules(rawPurchaseRules);
const priceRules = parsePriceRules(rawPriceRules);
const locationRules = parseLocationRules(rawLocationRules);
const financeRules = parseRules(rawFinanceRules);

/* ─────────────────────────── 권리분석 픽스처 ─────────────────────────── */

const RIGHTS_PRICE = 1_000_000_000;
const SMALL_AMOUNT = 10_000_000;

function answerFor(option: RightsOption): RightsAnswer {
  return {
    optionId: option.id,
    amountWon: option.amount === "input" ? SMALL_AMOUNT : null,
  };
}

function bestCaseAnswers(): RightsAnswers {
  const out: Record<string, RightsAnswer> = {};
  for (const item of rightsRules.items) {
    const option = item.options.find((o) => o.verdict === "checked");
    if (option === undefined) throw new Error(`checked 선택지가 없는 항목: ${item.id}`);
    out[item.id] = answerFor(option);
  }
  return out;
}

type RightsFixtureOverall = "stop" | "incomplete" | "expert" | "clear";

/**
 * 권리분석 축이 각 overall을 실제로 내도록 만든 답 조합.
 *
 * `src/lib/rights/assess.test.ts`의 `bestCaseAnswers`·"빠뜨린 항목이
 * 있어도 stop이 이긴다" 테스트와 같은 방식이다 — 실제 엔진을 불러서
 * 만들었으므로, 이 테스트가 확인하는 것은 진짜 `RightsAssessment`다.
 */
function rightsFixture(overall: RightsFixtureOverall): RightsAssessment {
  if (overall === "incomplete") {
    return assessRights(rightsRules, {}, null);
  }
  if (overall === "clear") {
    return assessRights(rightsRules, bestCaseAnswers(), RIGHTS_PRICE);
  }
  if (overall === "expert") {
    const item = rightsRules.items.find(
      (i) =>
        i.options.some((o) => o.verdict === "expert") &&
        !i.options.some((o) => o.verdict === "stop"),
    );
    if (item === undefined) throw new Error("expert 전용 항목을 찾지 못했다");
    const option = item.options.find((o) => o.verdict === "expert");
    if (option === undefined) throw new Error("expert 선택지를 찾지 못했다");
    const answers = { ...bestCaseAnswers(), [item.id]: answerFor(option) };
    return assessRights(rightsRules, answers, RIGHTS_PRICE);
  }
  // stop
  const item = rightsRules.items.find((i) => i.options.some((o) => o.verdict === "stop"));
  if (item === undefined) throw new Error("stop 항목을 찾지 못했다");
  const option = item.options.find((o) => o.verdict === "stop");
  if (option === undefined) throw new Error("stop 선택지를 찾지 못했다");
  const answers = { ...bestCaseAnswers(), [item.id]: answerFor(option) };
  return assessRights(rightsRules, answers, RIGHTS_PRICE);
}

/* ─────────────────────────── 구매 유형별 금융 픽스처 ─────────────────────────── */

const 억 = 100_000_000;

type PurchaseFixtureOverall = "stop" | "incomplete" | "expert" | "clear";

function purchaseFixture(overall: PurchaseFixtureOverall): PurchaseAssessment {
  if (overall === "incomplete") {
    return assessPurchase(purchaseRules, financeRules, {
      type: "갭투자",
      price: null,
      deposit: null,
      cash: null,
    });
  }
  // 전세가율(70%/80%)만 건드리고 나머지는 넉넉한 현금으로 checked를 유지한다.
  const price = 10 * 억;
  const cash = 20 * 억;
  const depositByOverall: Record<"stop" | "expert" | "clear", number> = {
    stop: Math.round(price * 0.85),
    expert: Math.round(price * 0.75),
    clear: Math.round(price * 0.2),
  };
  return assessPurchase(purchaseRules, financeRules, {
    type: "갭투자",
    price,
    deposit: depositByOverall[overall],
    cash,
  });
}

/* ─────────────────────────── 호가 위치 픽스처 ─────────────────────────── */

function priceEvidence(overrides: Partial<PriceEvidence> = {}): PriceEvidence {
  return {
    tradeCount: 10,
    minPrice: 1_000_000_000,
    maxPrice: 1_100_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    ...overrides,
  };
}

function richProfile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 600_000_000,
    annualIncome: 200_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

const richBudget = { profile: richProfile(), financeRules };

type PriceFixtureOverall = "stop" | "incomplete" | "withheld" | "expert" | "clear";

function priceFixture(overall: PriceFixtureOverall): PriceAssessment {
  if (overall === "incomplete") {
    return assessPrice(priceRules, priceEvidence(), null, richBudget);
  }
  if (overall === "withheld") {
    return assessPrice(
      priceRules,
      priceEvidence({ tradeCount: 1, minPrice: 1_000_000_000, maxPrice: 1_000_000_000 }),
      1_000_000_000,
      richBudget,
    );
  }
  const askingPriceByOverall: Record<"stop" | "expert" | "clear", number> = {
    clear: 1_050_000_000,
    expert: 1_150_000_000,
    stop: 1_500_000_000,
  };
  return assessPrice(priceRules, priceEvidence(), askingPriceByOverall[overall], richBudget);
}

/* ─────────────────────────── 입지 사실 픽스처 ─────────────────────────── */

type LocationFixtureState = "unlocated" | "located";

function locationFixture(state: LocationFixtureState): LocationAssessment {
  if (state === "unlocated") {
    return assessLocation(locationRules, {
      coordinate: null,
      subwayStations: null,
      elementarySchools: null,
    });
  }
  return assessLocation(locationRules, {
    coordinate: { lat: 37.5, lon: 127.0 },
    subwayStations: [
      { id: "fixture-station", name: "픽스처역", lineName: "픽스처선", coordinate: { lat: 37.501, lon: 127.0 } },
    ],
    elementarySchools: [],
  });
}

/* ─────────────────────────── 조합 헬퍼 ─────────────────────────── */

const RIGHTS_STATUSES = ["notLooked", "stop", "incomplete", "expert", "clear"] as const;
const PURCHASE_STATUSES = RIGHTS_STATUSES;
const PRICE_STATUSES = [
  "notLooked",
  "stop",
  "incomplete",
  "withheld",
  "expert",
  "clear",
] as const;
const LOCATION_STATUSES = ["notLooked", "unlocated", "located"] as const;

function inputFor(
  rightsStatus: (typeof RIGHTS_STATUSES)[number],
  purchaseStatus: (typeof PURCHASE_STATUSES)[number],
  priceStatus: (typeof PRICE_STATUSES)[number],
  locationStatus: (typeof LOCATION_STATUSES)[number],
): DiagnosisSummaryInput {
  return {
    rights: rightsStatus === "notLooked" ? null : rightsFixture(rightsStatus),
    purchase: purchaseStatus === "notLooked" ? null : purchaseFixture(purchaseStatus),
    price: priceStatus === "notLooked" ? null : priceFixture(priceStatus),
    location: locationStatus === "notLooked" ? null : locationFixture(locationStatus),
  };
}

/** 요약이 화면에 실제로 낼 사람이 읽는 문자열 전부 */
function summaryStrings(summary: ReturnType<typeof buildDiagnosisSummary>): string[] {
  return [
    summary.headlineLabel,
    summary.headlineNote,
    summary.targetMismatchNote,
    ...summary.disclaimer,
    ...summary.axes.flatMap((axis) => [axis.axisLabel, axis.statusLabel, axis.note]),
  ];
}

describe("진단 종합", () => {
  it("실제 룰셋으로 값을 낼 수 있다(전제)", () => {
    const summary = buildDiagnosisSummary(summaryRules, {
      rights: rightsFixture("clear"),
      purchase: null,
      price: null,
      location: null,
    });
    expect(summary.axes).toHaveLength(4);
  });

  describe("어떤 조합에서도 안전·바가지·등급 주장이 나오지 않는다", () => {
    it("네 축 상태의 모든 조합을 훑는다", () => {
      let combinations = 0;
      for (const rightsStatus of RIGHTS_STATUSES) {
        for (const purchaseStatus of PURCHASE_STATUSES) {
          for (const priceStatus of PRICE_STATUSES) {
            for (const locationStatus of LOCATION_STATUSES) {
              combinations += 1;
              const summary = buildDiagnosisSummary(
                summaryRules,
                inputFor(rightsStatus, purchaseStatus, priceStatus, locationStatus),
              );
              const strings = summaryStrings(summary);

              expect(
                strings.flatMap(safetyClaimsIn),
                `안전 주장: ${rightsStatus}/${purchaseStatus}/${priceStatus}/${locationStatus}`,
              ).toEqual([]);
              expect(
                strings.flatMap(bargainClaimsIn),
                `바가지 주장: ${rightsStatus}/${purchaseStatus}/${priceStatus}/${locationStatus}`,
              ).toEqual([]);
              expect(
                strings.flatMap(ratingClaimsIn),
                `등급 주장: ${rightsStatus}/${purchaseStatus}/${priceStatus}/${locationStatus}`,
              ).toEqual([]);
            }
          }
        }
      }
      // 훑은 조합이 실제로 많다는 것을 확인한다 — 그래야 위 검사가 공허하지 않다.
      expect(combinations).toBe(
        RIGHTS_STATUSES.length *
          PURCHASE_STATUSES.length *
          PRICE_STATUSES.length *
          LOCATION_STATUSES.length,
      );
      expect(combinations).toBeGreaterThan(400);
    });
  });

  describe("stop이 하나라도 있으면 헤드라인이 stop이다", () => {
    it("권리분석이 stop이면", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("stop", "clear", "clear", "located"),
      );
      expect(summary.headline).toBe("stop");
      expect(summary.headlineLabel).toBe(summaryRules.headline.stop.label);
    });

    it("구매 유형별 금융이 stop이면", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("clear", "stop", "clear", "located"),
      );
      expect(summary.headline).toBe("stop");
    });

    it("호가 위치가 stop이면", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("clear", "clear", "stop", "located"),
      );
      expect(summary.headline).toBe("stop");
    });

    it("나머지 축이 못 봤거나 유보여도 stop이 이긴다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("stop", "notLooked", "withheld", "notLooked"),
      );
      expect(summary.headline).toBe("stop");
    });
  });

  function baseInput(): DiagnosisSummaryInput {
    return {
      rights: rightsFixture("clear"),
      purchase: purchaseFixture("clear"),
      price: priceFixture("clear"),
      location: locationFixture("located"),
    };
  }

  function withAxisNotLooked(axisId: SummaryAxisId): DiagnosisSummaryInput {
    const input = baseInput();
    switch (axisId) {
      case "rights":
        return { ...input, rights: null };
      case "purchase":
        return { ...input, purchase: null };
      case "price":
        return { ...input, price: null };
      case "location":
        return { ...input, location: null };
    }
  }

  describe("못 본 축이 종합에서 사라지지 않는다", () => {
    for (const axisId of SUMMARY_AXIS_IDS) {
      it(`${axisId} 축만 못 봤을 때도 목록에 남는다`, () => {
        const summary = buildDiagnosisSummary(summaryRules, withAxisNotLooked(axisId));

        expect(summary.axes).toHaveLength(4);
        const ids = summary.axes.map((a) => a.id);
        expect(ids).toEqual(["rights", "purchase", "price", "location"]);

        const line = summary.axes.find((a) => a.id === axisId);
        expect(line).toBeDefined();
        expect(line?.status).toBe("notLooked");
        expect(line?.statusLabel).toBe(summaryRules.notLooked[axisId].label);
        expect(line?.note).toBe(summaryRules.notLooked[axisId].note);
      });
    }

    it("네 축 모두 못 봤어도 네 줄이 그대로 남는다", () => {
      const summary = buildDiagnosisSummary(summaryRules, {
        rights: null,
        purchase: null,
        price: null,
        location: null,
      });
      expect(summary.axes).toHaveLength(4);
      expect(summary.axes.every((a) => a.status === "notLooked")).toBe(true);
      // 판정 가능한 축이 하나도 없으므로 clear로 내리지 않는다.
      expect(summary.headline).not.toBe("clear");
    });
  });

  describe("미답변·유보가 통과로 접히지 않는다", () => {
    it("권리분석이 incomplete면 헤드라인이 clear가 될 수 없다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("incomplete", "notLooked", "notLooked", "notLooked"),
      );
      expect(summary.headline).not.toBe("clear");
      expect(summary.headline).toBe("unresolved");
    });

    it("호가 위치가 withheld면 헤드라인이 clear가 될 수 없다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("notLooked", "notLooked", "withheld", "notLooked"),
      );
      expect(summary.headline).not.toBe("clear");
      expect(summary.headline).toBe("unresolved");
    });

    it("구매 유형별 금융이 incomplete면 헤드라인이 clear가 될 수 없다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("notLooked", "incomplete", "notLooked", "notLooked"),
      );
      expect(summary.headline).not.toBe("clear");
    });
  });

  describe("expert가 헤드라인 뒤로 가려지지 않는다", () => {
    it("권리분석이 incomplete인데 구매 유형별 금융이 expert면 그 사실이 note에 남는다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("incomplete", "expert", "notLooked", "notLooked"),
      );
      expect(summary.headline).toBe("unresolved");
      expect(summary.headlineNote).toContain(summaryRules.headline.unresolved.note);
      expect(summary.headlineNote).toContain(summaryRules.expertPendingNote);
    });

    it("expert 축이 없으면 덧말을 붙이지 않는다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("incomplete", "notLooked", "notLooked", "notLooked"),
      );
      expect(summary.headlineNote).toBe(summaryRules.headline.unresolved.note);
      expect(summary.headlineNote).not.toContain(summaryRules.expertPendingNote);
    });

    it("헤드라인 자신이 expert면 덧말을 다시 붙이지 않는다", () => {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor("expert", "notLooked", "notLooked", "notLooked"),
      );
      expect(summary.headline).toBe("expert");
      expect(summary.headlineNote).toBe(summaryRules.headline.expert.note);
    });
  });

  describe("판정을 다시 계산하지 않는다 — 각 축 엔진의 값을 그대로 옮긴다", () => {
    it("권리·구매·호가의 라벨·설명이 엔진 산출물과 글자 그대로 같다", () => {
      const rights = rightsFixture("expert");
      const purchase = purchaseFixture("stop");
      const price = priceFixture("withheld");
      const location = locationFixture("located");

      const summary = buildDiagnosisSummary(summaryRules, {
        rights,
        purchase,
        price,
        location,
      });

      const rightsLine = summary.axes.find((a) => a.id === "rights");
      const purchaseLine = summary.axes.find((a) => a.id === "purchase");
      const priceLine = summary.axes.find((a) => a.id === "price");
      const locationLine = summary.axes.find((a) => a.id === "location");

      expect(rightsLine?.status).toBe(rights.overall);
      expect(rightsLine?.statusLabel).toBe(rights.overallLabel);
      expect(rightsLine?.note).toBe(rights.overallNote);

      expect(purchaseLine?.status).toBe(purchase.overall);
      expect(purchaseLine?.statusLabel).toBe(purchase.overallLabel);
      expect(purchaseLine?.note).toBe(purchase.overallNote);

      expect(priceLine?.status).toBe(price.overall);
      expect(priceLine?.statusLabel).toBe(price.overallLabel);
      expect(priceLine?.note).toBe(price.overallNote);

      // 입지는 판정이 아니라 상태다 — clear/stop 같은 판정 값으로
      // 바뀌지 않고 state를 그대로 옮긴다.
      expect(locationLine?.status).toBe(location.state);
      expect(locationLine?.statusLabel).toBe(location.stateLabel);
      expect(locationLine?.note).toBe(location.stateNote);
      expect(["stop", "incomplete", "expert", "clear", "withheld"]).not.toContain(
        locationLine?.status,
      );
    });
  });

  describe("문구·우선순위가 코드가 아니라 룰셋에서 온다", () => {
    it("헤드라인 라벨을 룰셋에서 바꾸면 결과도 바뀐다", () => {
      const draft = JSON.parse(JSON.stringify(rawSummaryRules)) as Record<
        string,
        unknown
      >;
      (draft.headline as Record<string, unknown>).clear = {
        label: "픽스처 전용 문구입니다",
        note: "'안전하다'는 뜻이 아니에요.",
      };
      const customRules = parseSummaryRules(draft);

      const summary = buildDiagnosisSummary(
        customRules,
        inputFor("clear", "clear", "clear", "located"),
      );
      expect(summary.headlineLabel).toBe("픽스처 전용 문구입니다");
    });

    it("notLooked 문구를 룰셋에서 바꾸면 결과도 바뀐다", () => {
      const draft = JSON.parse(JSON.stringify(rawSummaryRules)) as Record<
        string,
        unknown
      >;
      (draft.notLooked as Record<string, unknown>).location = {
        label: "픽스처 라벨",
        note: "픽스처 설명",
      };
      const customRules = parseSummaryRules(draft);

      const summary = buildDiagnosisSummary(customRules, {
        rights: rightsFixture("clear"),
        purchase: null,
        price: null,
        location: null,
      });
      const locationLine = summary.axes.find((a) => a.id === "location");
      expect(locationLine?.statusLabel).toBe("픽스처 라벨");
      expect(locationLine?.note).toBe("픽스처 설명");
    });
  });

  it("대상이 다를 수 있다는 고지가 언제나 나온다", () => {
    for (const [rightsStatus, purchaseStatus, priceStatus, locationStatus] of [
      ["clear", "notLooked", "notLooked", "notLooked"],
      ["notLooked", "clear", "notLooked", "notLooked"],
      ["notLooked", "notLooked", "clear", "located"],
      ["stop", "notLooked", "notLooked", "notLooked"],
    ] as const) {
      const summary = buildDiagnosisSummary(
        summaryRules,
        inputFor(rightsStatus, purchaseStatus, priceStatus, locationStatus),
      );
      expect(summary.targetMismatchNote).toBe(summaryRules.targetMismatchNote);
    }
  });
});

// 타입만 쓰는 참조(미사용 경고 방지 및 타입 회귀 확인용)
const _typeCheck: SummaryAxisId[] = [...SUMMARY_AXIS_IDS];
void _typeCheck;
