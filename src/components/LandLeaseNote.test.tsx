import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import rawFinanceRules from "../../rules/2026-08.json";
import {
  MUST_SURVIVE_PRINT_CLASSES,
  PRINT_HIDDEN_SELECTORS,
} from "../print/hiddenInPrint";
import { COMPLEX_UNITS, type ComplexUnit } from "../data/complexes";
import type {
  BurdenAtPrice,
  CostBreakdown as CostBreakdownData,
  LoanLimit,
} from "../lib/finance";
import { parseRules, type BuyerProfile } from "../lib/finance";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import type { PriceBudgetInput } from "../lib/price";
import { landLeaseRules } from "../state/landLeaseRules";
import { ComplexDetail } from "./ComplexDetail";
import { ComplexList } from "./ComplexList";
import { PriceCheck } from "./PriceCheck";

/**
 * 토지임대부 표시가 세 화면(목록·상세·호가)에 빠짐없이 나오는지 잠근다.
 *
 * 이 파일이 지키는 것은 문구의 예쁨이 아니라 **없는 안전을 만들지 않는
 * 것**이다. 토지임대부 주택은 건물만 사고 토지는 빌려 쓰므로 토지
 * 사용료가 매달 따로 나가는데, 그 금액이 우리 데이터에 없어 우리가
 * 계산한 월 상환액·부담률에는 들어 있지 않다. 표시가 없으면 이 평형은
 * "무리 없이 살 수 있어요" 덩어리에 아무 표시 없이 들어앉는다 — 이
 * 제품이 가장 피해야 하는 방향의 오답이다.
 */

const financeRules = parseRules(rawFinanceRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 600_000_000,
    annualIncome: 200_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 59,
    isRegulatedArea: true,
    ...overrides,
  };
}

const priceBudget: PriceBudgetInput = { profile: profile(), financeRules };
/** 취득세 줄에 붙는 주택 수 고지. 호출부가 골라 넘기는 값이다 */
const 주택수고지 = financeRules.acquisitionTax.householdCountNoteNoHome;

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  const areaBucket = overrides.areaBucket ?? 84;
  return {
    complexKey: "11680-9001",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket,
    maxExclusiveAreaSqm: areaBucket,
    landLeasehold: "N",
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    address: null,
    trades: [],
    lowConfidence: false,
    ...overrides,
  };
}

function entry(u: ComplexUnit, neededLoan = 200_000_000): ComplexListEntry {
  return {
    unit: u,
    needsBuiltYear: false,
    burden: {
      neededLoan,
      safety: {
        monthlyPayment: neededLoan === 0 ? 0 : 1_200_000,
        burdenRatio: neededLoan === 0 ? 0 : 0.22,
        stressedMonthlyPayment: neededLoan === 0 ? 0 : 1_500_000,
        stressedBurdenRatio: neededLoan === 0 ? 0 : 0.29,
        level: "safe",
      },
    },
  };
}

function burden(): BurdenAtPrice {
  return {
    neededLoan: 200_000_000,
    safety: {
      monthlyPayment: 1_200_000,
      burdenRatio: 0.22,
      stressedMonthlyPayment: 1_500_000,
      stressedBurdenRatio: 0.29,
      level: "safe",
    },
  };
}

function costs(): CostBreakdownData {
  return {
    acquisitionTax: 3_200_000,
    brokerageFee: 1_600_000,
    brokerageVat: 160_000,
    legalFee: 300_000,
    movingCost: 1_500_000,
    housingBondCost: 400_000,
    total: 7_160_000,
  };
}

function renderList(entries: ComplexListEntry[], onSelect?: () => void) {
  const result: ComplexListResult = {
    withinSafe: entries,
    unverified: [],
    beyondSafe: [],
    affordablePrice: 1_000_000_000,
    safePrice: 900_000_000,
    emptyBecauseOfFilter: false,
  };
  return render(
    <ComplexList
      result={result}
      dataAsOf="2026-07"
      hasRegionFilter={false}
      noRepaymentCapacity={false}
      onSelect={onSelect}
    />,
  );
}

/**
 * "매달 나가는 돈" 계산기의 입력 상한. 이 파일이 보는 것은 토지임대부
 * 표시라 한도 값 자체는 상관이 없다 — 계산기가 그려질 만큼만 크게 둔다
 * (0이면 입력란 대신 "받을 수 있는 대출이 없어요"가 뜬다).
 */
const maxLoan: LoanLimit = {
  amount: 400_000_000,
  binding: "LTV",
  breakdown: {
    LTV: 400_000_000,
    DSR: 400_000_000,
    CAP: 400_000_000,
    POLICY: 0,
  },
};

function renderDetail(u: ComplexUnit) {
  return render(
    <ComplexDetail
      unit={u}
      units={[u]}
      onSelectUnit={vi.fn()}
      householdCountNote={주택수고지}
      priceBudget={priceBudget}
      profile={priceBudget.profile}
      onClose={vi.fn()}
    />,
  );
}

function renderPrice(u: ComplexUnit) {
  return render(<PriceCheck unit={u} budget={priceBudget} />);
}

/**
 * 세 화면을 같은 평형으로 각각 렌더링한다.
 *
 * `variants`는 그 화면에 **반드시** 있어야 하는 표시의 갈래다. 단지
 * 상세는 호가 화면을 품고 있어서 둘 다 나온다 — 그래서 문구도 두
 * 벌이다(같은 문장을 두 번 쓰면 둘 다 잡음으로 읽힌다).
 */
const SCREENS = [
  {
    name: "목록",
    render: (u: ComplexUnit) => renderList([entry(u)]),
    variants: ["monthly"],
    checkNotes: 1,
  },
  {
    name: "상세",
    render: renderDetail,
    variants: ["monthly", "price"],
    // 두 갈래를 함께 그리는데도 "어디서 확인하라"는 줄은 한 번만
    // 나온다 — 월 갈래에만 붙기 때문이다.
    checkNotes: 1,
  },
  {
    name: "호가",
    render: renderPrice,
    variants: ["price"],
    // 이 화면은 앱에서 **단독으로 뜨지 않는다**(PriceCheck를 그리는 곳은
    // ComplexDetail 하나뿐이고, 아래 "호가 화면은 혼자 뜨지 않는다"가
    // 그것을 소스에서 잠근다). 그래서 여기서만 0이다.
    checkNotes: 0,
  },
] as const;

const YES = landLeaseRules.states.yes;
const UNKNOWN = landLeaseRules.states.unknown;

function notes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".land-lease-note")];
}

/** 그 화면에 실제로 나온 표시의 갈래들 */
function variantsIn(container: HTMLElement): string[] {
  return notes(container).map((n) => n.dataset.variant ?? "");
}

/** 갈래별로 룰셋이 정한 본문 문장 */
function bodyOf(state: "yes" | "unknown", variant: string): string {
  const copy = landLeaseRules.states[state];
  return variant === "price" ? copy.priceNote : copy.monthlyNote;
}

describe("토지임대부 표시", () => {
  describe.each(SCREENS)(
    "$name 화면",
    ({ render: renderScreen, variants, checkNotes }) => {
    it('"Y"면 표시가 나온다', () => {
      const { container } = renderScreen(unit({ landLeasehold: "Y" }));
      expect(variantsIn(container)).toEqual([...variants]);
      for (const note of notes(container)) {
        expect(note.textContent).toContain(YES.badge);
        expect(note.textContent).toContain(
          bodyOf("yes", note.dataset.variant ?? ""),
        );
      }
    });

    /**
     * 이 저장소에서 가장 중요한 검사다. `null`은 "모른다"이지 "아니다"가
     * 아니다 — 아무것도 그리지 않으면 화면이 "토지 소유권이 있는 집"이라는,
     * 우리가 확인한 적 없는 사실을 말하게 된다.
     */
    it('`null`(모름)이 "아님"으로 그려지지 않는다', () => {
      const { container } = renderScreen(unit({ landLeasehold: null }));
      expect(variantsIn(container)).toEqual([...variants]);
      for (const note of notes(container)) {
        expect(note.textContent).toContain(UNKNOWN.badge);
        expect(note.dataset.state).toBe("unknown");
        // "아님"과 같은 화면이 되면 안 된다.
        expect(note.textContent).not.toBe("");
      }
    });

    it('"N"일 때만 표시가 없다', () => {
      const { container } = renderScreen(unit({ landLeasehold: "N" }));
      expect(notes(container)).toHaveLength(0);
    });

    it("표시가 색이 아니라 글자로 존재한다", () => {
      const { container } = renderScreen(unit({ landLeasehold: "Y" }));
      const badge = container.querySelector(".land-lease-badge");
      // data-state는 색을 입히는 고리일 뿐이다 — 그것을 지워도 글자가 남는다.
      expect(badge?.textContent?.trim()).toBe(YES.badge);
      expect((badge?.textContent ?? "").length).toBeGreaterThan(0);
    });

    it("문구가 코드가 아니라 룰셋에서 온다", () => {
      const { container } = renderScreen(unit({ landLeasehold: "Y" }));
      for (const note of notes(container)) {
        const text = note.textContent ?? "";
        expect(text).toContain(YES.badge);
        expect(text).toContain(bodyOf("yes", note.dataset.variant ?? ""));
      }
    });

    /**
     * "우리가 대신 계산해 주지 못하니 어디서 확인하라"는 줄은 금액을
     * 지어내지 않는 대신 반드시 해야 하는 말이라 **화면마다 한 번은**
     * 있어야 한다. 다만 **두 번 있으면 안 된다** — 단지 상세는 월
     * 갈래와 호가 갈래를 함께 그리는데, 똑같은 문장이 한 화면에 두 번
     * 뜨면 둘 다 잡음으로 읽혀서 정작 읽혀야 할 때 넘겨진다.
     */
    it("어디서 확인하라는 줄이 두 번 나오지 않는다", () => {
      const { container } = renderScreen(unit({ landLeasehold: "Y" }));
      const checks = [
        ...container.querySelectorAll(".land-lease-check"),
      ].map((n) => n.textContent);
      expect(checks).toEqual(Array.from({ length: checkNotes }, () => YES.checkNote));
    });

    it("토지 사용료 금액을 지어내지 않는다", () => {
      const { container } = renderScreen(unit({ landLeasehold: "Y" }));
      for (const note of notes(container)) {
        expect(note.textContent ?? "").not.toMatch(/\d\s*(원|만원|억)/);
      }
    });
    },
  );

  describe("월 상환액을 읽는 자리에 붙는다", () => {
    it("목록 행에서는 부담(월 상환액·부담률) 안에 있다", () => {
      const { container } = renderList([entry(unit({ landLeasehold: "Y" }))]);
      const burdenEl = container.querySelector(".complex-burden");
      expect(burdenEl?.textContent).toMatch(/월 120만원/);
      expect(burdenEl?.querySelector(".land-lease-note")).not.toBeNull();
    });

    it("대출이 0원인 행에도 붙는다", () => {
      // 대출이 없다고 매달 나가는 돈이 없는 것이 아니다 — 오히려 이쪽이
      // 더 낙관적으로 읽히는 자리다.
      const { container } = renderList([entry(unit({ landLeasehold: "Y" }), 0)]);
      const burdenEl = container.querySelector(".complex-burden");
      expect(burdenEl?.textContent).toContain("대출 없이 살 수 있어요");
      expect(burdenEl?.querySelector(".land-lease-note")).not.toBeNull();
    });

    it("행이 버튼이 돼도 표시가 그 안에 남는다", () => {
      const { container } = renderList(
        [entry(unit({ landLeasehold: "Y" }))],
        vi.fn(),
      );
      const button = container.querySelector(".complex-row-button");
      expect(button).not.toBeNull();
      expect(button?.querySelector(".land-lease-note")).not.toBeNull();
      // <button> 안에는 phrasing content만 올 수 있다 — <p>를 넣으면 안 된다.
      expect(button?.querySelectorAll("p")).toHaveLength(0);
    });

    /**
     * ⚠ **"등급 배지 바로 다음"이라는 절은 사라졌다.** 사용자 지시로 이
     * 화면을 다시 짜면서 별도 등급 배지(`SafetyBadge`)가 없어지고, 등급은
     * 대출 계산기 표의 한 줄로 들어갔다.
     *
     * **지켜야 하는 것은 그대로다**: 이 표시가 **금액보다 앞**에 있어야
     * 한다. 그래야 그 금액에 토지 사용료가 빠져 있다는 사실이 금액을
     * 읽기 전에 도착한다. 지금은 예상 매수금액 입력란보다도 앞이라,
     * 사용자가 값을 넣기 전에 이미 읽는다 — 더 이른 자리다.
     */
    it("상세에서는 가격 입력란보다도, 금액 블록보다도 앞이다", async () => {
      const { container } = renderDetail(unit({ landLeasehold: "Y" }));
      // 금액 블록은 이미 이 평형 기준값으로 채워져 있다(ComplexDetail의
      // 프리필) — 그대로도 아래 검사가 성립하지만, 명시적으로 값을
      // 다시 넣어 이 시나리오("사용자가 방금 값을 넣었다")를 재현한다.
      // `commitOn="blur"`라 벗어나야 확정된다.
      const priceInput = screen.getByLabelText("예상 매수금액");
      await userEvent.clear(priceInput);
      await userEvent.type(priceInput, "120000");
      await userEvent.tab();

      const note = container.querySelector(
        '.land-lease-note[data-variant="monthly"]',
      );
      const form = container.querySelector(".complex-detail-price-form");
      const monthly = container.querySelector(".detail-block--monthly");
      expect(note).not.toBeNull();
      expect(form).not.toBeNull();
      expect(monthly).not.toBeNull();
      if (note === null || form === null || monthly === null) return;

      // 값을 넣는 자리보다 앞이다.
      expect(
        note.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // 그리고 금액 블록보다도 앞이다.
      expect(
        note.compareDocumentPosition(monthly) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("호가 화면에서는 호가를 적기 전에 먼저 나온다", () => {
      const { container } = renderPrice(unit({ landLeasehold: "Y" }));
      const note = container.querySelector(".land-lease-note");
      expect(note?.getAttribute("data-variant")).toBe("price");
      const form = container.querySelector(".price-check-form");
      expect(note).not.toBeNull();
      expect(form).not.toBeNull();
      if (note === null || form === null) return;
      expect(
        note.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe("한 화면이 같은 경고를 두 번 하지 않는다", () => {
    /**
     * 단지 상세는 호가 화면을 품고 있다. 두 자리가 같은 문장을 쓰면
     * 똑같은 경고가 한 화면에 두 번 뜨고, 그러면 둘 다 잡음으로 읽힌다 —
     * 정작 읽혀야 할 때 넘겨진다.
     */
    it("상세의 두 표시가 서로 다른 것을 말한다", () => {
      const { container } = renderDetail(unit({ landLeasehold: "Y" }));
      const bodies = [
        ...container.querySelectorAll(".land-lease-body"),
      ].map((n) => n.textContent ?? "");
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).not.toBe(bodies[1]);
      expect(bodies).toContain(YES.monthlyNote);
      expect(bodies).toContain(YES.priceNote);
    });

    it("두 표시 모두 같은 배지 글자를 쓴다", () => {
      const { container } = renderDetail(unit({ landLeasehold: null }));
      const badges = [
        ...container.querySelectorAll(".land-lease-badge"),
      ].map((n) => n.textContent ?? "");
      expect(badges).toEqual([UNKNOWN.badge, UNKNOWN.badge]);
    });
  });

  describe("인쇄에서 살아남는다", () => {
    it("보호 목록에 올라 있다", () => {
      expect(MUST_SURVIVE_PRINT_CLASSES).toContain("land-lease-note");
      expect(MUST_SURVIVE_PRINT_CLASSES).toContain("land-lease-badge");
    });

    it("어떤 인쇄 숨김 선택자에도 걸리지 않는다", () => {
      for (const selector of PRINT_HIDDEN_SELECTORS) {
        expect(selector).not.toContain("land-lease");
      }
    });

    it("인쇄에서 지워지는 자리 안에 들어가 있지 않다", () => {
      // 호가 화면의 입력란(.price-check-form)은 인쇄에서 사라진다. 표시가
      // 그 안에 있었다면 종이에서 통째로 없어진다.
      const { container } = renderPrice(unit({ landLeasehold: "Y" }));
      for (const selector of PRINT_HIDDEN_SELECTORS) {
        const hidden = container.querySelector(selector);
        expect(hidden?.querySelector(".land-lease-note") ?? null).toBeNull();
      }
    });
  });

  describe("실제 번들 데이터", () => {
    const leaseholdUnits = COMPLEX_UNITS.filter((u) => u.landLeasehold === "Y");

    it("토지임대부 평형이 실제로 실려 있다(전제)", () => {
      expect(leaseholdUnits.length).toBe(5);
    });

    it("모든 토지임대부 평형이 세 화면에서 표시와 함께 나온다", () => {
      for (const u of leaseholdUnits) {
        for (const screenSpec of SCREENS) {
          const { container, unmount } = screenSpec.render(u);
          expect(
            variantsIn(container),
            `${screenSpec.name} / ${u.complexName} ${u.areaBucket}㎡`,
          ).toEqual([...screenSpec.variants]);
          unmount();
        }
      }
    });

    it("표시 없이 렌더되는 토지임대부 행이 하나도 없다", () => {
      const { container } = renderList(leaseholdUnits.map((u) => entry(u)));
      const rows = [...container.querySelectorAll(".complex-row")];
      expect(rows).toHaveLength(leaseholdUnits.length);
      for (const row of rows) {
        expect(row.querySelector(".land-lease-note"), row.textContent ?? "").not.toBeNull();
      }
    });

    /**
     * 합성 데이터로 `null` 경로를 확인한다. 지금 번들에는 `null`이 0건이라
     * 실제 데이터로는 이 경로를 밟을 수 없는데, 지역을 넓히면 반드시
     * 생긴다 — 그때 조용히 "아님"이 되지 않도록 지금 잠근다.
     */
    it("모름 평형이 섞여 들어와도 목록에서 표시 없이 지나가지 않는다", () => {
      const mixed = [
        entry(unit({ complexKey: "a", landLeasehold: "Y" })),
        entry(unit({ complexKey: "b", landLeasehold: null })),
        entry(unit({ complexKey: "c", landLeasehold: "N" })),
      ];
      const { container } = renderList(mixed);
      const rows = [...container.querySelectorAll(".complex-row")];
      expect(rows).toHaveLength(3);
      expect(rows[0]?.querySelector(".land-lease-note")).not.toBeNull();
      expect(rows[1]?.querySelector(".land-lease-note")).not.toBeNull();
      expect(rows[2]?.querySelector(".land-lease-note")).toBeNull();
      // 모름과 아님이 같은 화면이면 안 된다.
      expect(rows[1]?.textContent).not.toBe(rows[2]?.textContent);
    });
  });

  describe("표시가 다른 화면 약속을 깨지 않는다", () => {
    it("목록에서 변동률·중위값을 내지 않는다", () => {
      const { container } = renderList([entry(unit({ landLeasehold: "Y" }))]);
      expect(container.textContent).not.toMatch(/중위|변동률|median/i);
    });

    it("호가 화면의 고지가 그대로 남는다", () => {
      renderPrice(unit({ landLeasehold: "Y" }));
      expect(
        screen.getByText(/이 화면은 적절한 값이 얼마인지 매기지 않아요/),
      ).toBeTruthy();
    });
  });
});
