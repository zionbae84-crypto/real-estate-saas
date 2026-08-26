import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rules } from "../state/useAffordability";
import {
  ASSUMED_REMOVED_INPUTS,
  DEFAULT_FORM_STATE,
  type ProfileFormState,
} from "../state/useProfileForm";
import {
  buildPrintSummaryItems,
  formatPrintDate,
  PrintSummary,
  type AreaBasis,
} from "./PrintSummary";

const THRESHOLD = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

const FIXED_STATE: ProfileFormState = {
  ...DEFAULT_FORM_STATE,
  cash: 300_000_000,
  annualIncome: 80_000_000,
  isRegulatedArea: false,
  touched: ["regulatedArea"],
};

const items = (
  state: ProfileFormState = FIXED_STATE,
  basis: AreaBasis = { source: "assumed" },
) => buildPrintSummaryItems(state, basis, THRESHOLD);

const valueOf = (label: string, ...args: Parameters<typeof items>) =>
  items(...args).find((i) => i.label === label)?.value;

describe("formatPrintDate", () => {
  it("Date를 '몇년 몇월 며칠' 문구로 바꾼다", () => {
    expect(formatPrintDate(new Date(2026, 7, 23))).toBe("2026년 8월 23일");
  });

  it("한 자리 월·일도 앞에 0을 붙이지 않는다", () => {
    expect(formatPrintDate(new Date(2027, 0, 5))).toBe("2027년 1월 5일");
  });
});

describe("buildPrintSummaryItems", () => {
  it("여덟 전제를 모두 낸다 — 물어본 셋과 가정한 넷, 그리고 전용면적", () => {
    expect(items().map((i) => i.label)).toEqual([
      "얼마 있어요(현금)",
      "연 소득(세전)",
      "찾는 평형대",
      "주택 수",
      "생애최초 주택 구입",
      "기존 대출(연간 상환액)",
      "규제지역 여부",
      "전용면적",
    ]);
  });

  it("금액은 formatWon과 같은 표기로 나온다", () => {
    expect(valueOf("얼마 있어요(현금)")).toContain("3억");
  });

  /**
   * ⚠ **없앤 입력 넷은 종이에서도 가정임이 드러나야 한다.** 종이를
   * 건네받은 사람은 화면을 보지 못했고, "(가정)"이 빠지면 그 사람은
   * 이 숫자를 자기 사정이 반영된 값으로 읽는다.
   */
  describe("없앤 입력의 가정값", () => {
    it("주택 수·생애최초·기존 대출이 전부 '(가정)'을 달고 나온다", () => {
      expect(valueOf("주택 수")).toBe("무주택 (가정)");
      expect(valueOf("생애최초 주택 구입")).toBe("아니오 (가정)");
      expect(valueOf("기존 대출(연간 상환액)")).toBe("없음 (가정)");
    });

    /**
     * 값은 화면의 가정 문구(`AssumptionLine`)와 **같은 원본**에서 온다 —
     * 종이와 화면이 두 말을 할 수 없어야 한다.
     */
    it("값은 폼 상태가 아니라 ASSUMED_REMOVED_INPUTS에서 온다", () => {
      // 폼 상태에는 이 키들이 아예 없다. 있었다면 여기서 흘러들었을 것이다.
      expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain("ownedHomeCount");
      expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain("isFirstTimeBuyer");
      expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain(
        "existingDebtAnnualPayment",
      );
      expect(ASSUMED_REMOVED_INPUTS.ownedHomeCount).toBe(0);
    });
  });

  describe("찾는 평형대 — 이 종이의 목록이 전부인지 일부인지 말한다", () => {
    it("전부 고르면 '전체'다", () => {
      expect(valueOf("찾는 평형대")).toBe("전체");
    });

    it("일부만 고르면 구간과 범위를 함께 적는다", () => {
      expect(
        valueOf("찾는 평형대", { ...FIXED_STATE, areaBands: ["중소형"] }),
      ).toBe("중소형(60~85㎡)");
    });
  });

  describe("규제지역 — 판정과 가정을 가른다", () => {
    it("지역 조회가 판정했으면 '(지역 판정)'이다", () => {
      expect(valueOf("규제지역 여부")).toBe("비규제지역 (지역 판정)");
    });

    it("판정이 없으면 '(가정)'이다", () => {
      expect(
        valueOf("규제지역 여부", { ...FIXED_STATE, touched: [] }),
      ).toMatch(/\(가정\)$/);
    });
  });

  describe("전용면적은 고른 평형대가 정한다 — 숫자를 지어내지 않는다", () => {
    /**
     * ⚠ **종이에 대표값 하나를 적지 않는다.** 헤드라인이 쓴 것은 면적
     * 값이 아니라 "85㎡ 초과가 섞였는가"라는 전제 하나이고, 종이도 그
     * 전제를 적어야 화면과 두 말을 하지 않는다.
     */
    it("85㎡ 초과가 섞였으면 '초과 기준 (가정)'이라고 적는다", () => {
      const area = valueOf("전용면적", {
        ...FIXED_STATE,
        areaBands: ["중대형"],
      });
      expect(area).toMatch(new RegExp(`${THRESHOLD}㎡ 초과`));
      expect(area).toMatch(/가정/);
    });

    /**
     * 고른 구간이 전부 85㎡ 이하이면 그건 가정이 아니라 **사실**이다 —
     * 종이에 "(가정)"을 달면 읽는 사람이 확인된 것을 못 미더워하게 된다.
     */
    it("85㎡ 초과가 안 섞였으면 '이하'라고 적고 가정이라 하지 않는다", () => {
      const area = valueOf("전용면적", {
        ...FIXED_STATE,
        areaBands: ["소형", "중소형"],
      });
      expect(area).toMatch(new RegExp(`${THRESHOLD}㎡ 이하`));
      expect(area).not.toMatch(/가정/);
    });

    it("매물을 골랐으면 그 평형의 실제 면적을 적고, 가정이라 하지 않는다", () => {
      const area = valueOf("전용면적", FIXED_STATE, {
        source: "selectedUnit",
        sqm: 72,
      });
      expect(area).toContain("72");
      expect(area).toMatch(/매물/);
      expect(area).not.toMatch(/가정/);
    });
  });
});

describe("PrintSummary", () => {
  const renderIt = () =>
    render(
      <PrintSummary
        state={FIXED_STATE}
        areaBasis={{ source: "assumed" }}
        rules={rules}
        now={() => new Date(2026, 7, 23)}
      />,
    );

  it("룰셋 기준(연·월)과 인쇄일을 함께 보여준다", () => {
    renderIt();
    expect(screen.getByText(/2026년 8월 규제 기준/)).toBeInTheDocument();
    expect(screen.getByText(/2026년 8월 23일/)).toBeInTheDocument();
  });

  it("여덟 전제를 모두 DOM에 낸다", () => {
    renderIt();
    for (const label of [
      "얼마 있어요(현금)",
      "연 소득(세전)",
      "찾는 평형대",
      "주택 수",
      "생애최초 주택 구입",
      "기존 대출(연간 상환액)",
      "규제지역 여부",
      "전용면적",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("루트 요소가 print-summary 클래스를 갖는다(인쇄 CSS와 연결점)", () => {
    const { container } = renderIt();
    expect(container.querySelector(".print-summary")).not.toBeNull();
  });
});
