import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rules } from "../state/useAffordability";
import { DEFAULT_FORM_STATE, type ProfileFormState } from "../state/useProfileForm";
import {
  buildPrintSummaryItems,
  formatPrintDate,
  PrintSummary,
} from "./PrintSummary";

const FIXED_STATE: ProfileFormState = {
  ...DEFAULT_FORM_STATE,
  cash: 300_000_000,
  annualIncome: 80_000_000,
  isFirstTimeBuyer: true,
  existingDebtAnnualPayment: 3_600_000,
  isRegulatedArea: false,
  exclusiveAreaSqm: 59,
  touched: ["existingDebt", "regulatedArea", "area"],
};

describe("formatPrintDate", () => {
  it("Date를 '몇년 몇월 며칠' 문구로 바꾼다", () => {
    expect(formatPrintDate(new Date(2026, 7, 23))).toBe("2026년 8월 23일");
  });

  it("한 자리 월·일도 앞에 0을 붙이지 않는다", () => {
    expect(formatPrintDate(new Date(2027, 0, 5))).toBe("2027년 1월 5일");
  });
});

describe("buildPrintSummaryItems", () => {
  it("일곱 전제(현금·소득·주택 수·생애최초·기존대출·규제지역·전용면적)를 모두 낸다", () => {
    const items = buildPrintSummaryItems(FIXED_STATE, 59, "touched");
    const labels = items.map((i) => i.label);
    expect(labels).toEqual([
      "보유 현금",
      "연 소득(세전)",
      "주택 수",
      "생애최초 주택 구입",
      "기존 대출(연간 상환액)",
      "규제지역 여부",
      "전용면적",
    ]);
  });

  /**
   * 주택 수는 정책대출 자격을 가르는 전제다. 화면에서는 그 답이
   * `.profile-form` 안에만 있고 그 폼은 인쇄에서 통째로 지워지므로,
   * 종이를 건네받은 사람이 전제를 확인할 곳은 여기뿐이다.
   */
  describe("주택 수", () => {
    function ownedHomeValue(state: typeof FIXED_STATE): string | undefined {
      return buildPrintSummaryItems(state, 59, "touched").find(
        (i) => i.label === "주택 수",
      )?.value;
    }

    it("0채는 '무주택'이라고 적는다 — 숫자가 아니라 뜻으로 적는다", () => {
      expect(ownedHomeValue({ ...FIXED_STATE, ownedHomeCount: 0 })).toBe(
        "무주택",
      );
    });

    it("1채 이상은 몇 채인지 함께 적는다", () => {
      expect(ownedHomeValue({ ...FIXED_STATE, ownedHomeCount: 1 })).toBe(
        "유주택 1채",
      );
      expect(ownedHomeValue({ ...FIXED_STATE, ownedHomeCount: 3 })).toBe(
        "유주택 3채",
      );
    });

    it("답하지 않았으면 값을 지어내지 않는다", () => {
      // 실제로는 이 상태에서 계산이 시작되지 않아 인쇄물이 나올 수 없다.
      // 그래도 무주택으로 대신 채우지 않는다 — 종이에 적힌 전제가
      // 사용자가 답한 적 없는 값이면 그 종이 전체가 거짓말이 된다.
      expect(ownedHomeValue({ ...FIXED_STATE, ownedHomeCount: null })).toBe(
        "입력 안 함",
      );
    });
  });

  it("금액은 formatWon과 같은 표기로 나온다", () => {
    const items = buildPrintSummaryItems(FIXED_STATE, 59, "touched");
    const cash = items.find((i) => i.label === "보유 현금");
    expect(cash?.value).toContain("3억");
  });

  it("생애최초 여부는 예/아니오로 나온다", () => {
    const trueItems = buildPrintSummaryItems(FIXED_STATE, 59, "touched");
    expect(
      trueItems.find((i) => i.label === "생애최초 주택 구입")?.value,
    ).toBe("예");

    const falseItems = buildPrintSummaryItems(
      { ...FIXED_STATE, isFirstTimeBuyer: false },
      59,
      "touched",
    );
    expect(
      falseItems.find((i) => i.label === "생애최초 주택 구입")?.value,
    ).toBe("아니오");
  });

  it("기존 대출이 없으면(null) 가정임을 밝힌다", () => {
    const items = buildPrintSummaryItems(
      { ...FIXED_STATE, existingDebtAnnualPayment: null },
      59,
      "touched",
    );
    expect(items.find((i) => i.label === "기존 대출(연간 상환액)")?.value).toMatch(
      /가정/,
    );
  });

  it("기존 대출을 사용자가 입력했으면 금액과 함께 직접 입력이라고 밝힌다", () => {
    const items = buildPrintSummaryItems(FIXED_STATE, 59, "touched");
    const debt = items.find((i) => i.label === "기존 대출(연간 상환액)")?.value;
    expect(debt).toMatch(/직접 입력/);
    expect(debt).toContain("360");
  });

  it("규제지역을 사용자가 정했으면 '(가정)' 표시가 없다", () => {
    const items = buildPrintSummaryItems(FIXED_STATE, 59, "touched");
    expect(items.find((i) => i.label === "규제지역 여부")?.value).not.toMatch(
      /가정/,
    );
  });

  it("규제지역이 가정 중이면 '(가정)' 표시가 있다", () => {
    const items = buildPrintSummaryItems(
      { ...FIXED_STATE, touched: [] },
      59,
      "assumed",
    );
    expect(items.find((i) => i.label === "규제지역 여부")?.value).toMatch(
      /가정/,
    );
  });

  describe("전용면적 표시는 areaSource에 따라 갈린다", () => {
    it("assumed면 가정값이라고 밝힌다", () => {
      const items = buildPrintSummaryItems(FIXED_STATE, 85, "assumed");
      const area = items.find((i) => i.label === "전용면적")?.value;
      expect(area).toContain("85");
      expect(area).toMatch(/가정/);
    });

    it("touched면 직접 입력이라고 밝힌다", () => {
      const items = buildPrintSummaryItems(FIXED_STATE, 59, "touched");
      const area = items.find((i) => i.label === "전용면적")?.value;
      expect(area).toMatch(/직접 입력/);
    });

    it("selectedUnit이면 매물 기준이라고 밝히고, 가정·직접입력이라 하지 않는다", () => {
      const items = buildPrintSummaryItems(FIXED_STATE, 72, "selectedUnit");
      const area = items.find((i) => i.label === "전용면적")?.value;
      expect(area).toContain("72");
      expect(area).toMatch(/매물/);
      expect(area).not.toMatch(/가정/);
      expect(area).not.toMatch(/직접 입력/);
    });
  });
});

describe("PrintSummary", () => {
  it("룰셋 기준(연·월)과 인쇄일을 함께 보여준다", () => {
    render(
      <PrintSummary
        state={FIXED_STATE}
        effectiveAreaSqm={59}
        areaSource="touched"
        rules={rules}
        now={() => new Date(2026, 7, 23)}
      />,
    );
    expect(screen.getByText(/2026년 8월 규제 기준/)).toBeInTheDocument();
    expect(screen.getByText(/2026년 8월 23일/)).toBeInTheDocument();
  });

  it("여섯 전제를 모두 화면(DOM)에 낸다", () => {
    render(
      <PrintSummary
        state={FIXED_STATE}
        effectiveAreaSqm={59}
        areaSource="touched"
        rules={rules}
        now={() => new Date(2026, 7, 23)}
      />,
    );
    expect(screen.getByText("보유 현금")).toBeInTheDocument();
    expect(screen.getByText("연 소득(세전)")).toBeInTheDocument();
    expect(screen.getByText("생애최초 주택 구입")).toBeInTheDocument();
    expect(screen.getByText("기존 대출(연간 상환액)")).toBeInTheDocument();
    expect(screen.getByText("규제지역 여부")).toBeInTheDocument();
    expect(screen.getByText("전용면적")).toBeInTheDocument();
  });

  it("루트 요소가 print-summary 클래스를 갖는다(인쇄 CSS와 연결점)", () => {
    const { container } = render(
      <PrintSummary
        state={FIXED_STATE}
        effectiveAreaSqm={59}
        areaSource="touched"
        rules={rules}
        now={() => new Date(2026, 7, 23)}
      />,
    );
    expect(container.querySelector(".print-summary")).not.toBeNull();
  });
});
