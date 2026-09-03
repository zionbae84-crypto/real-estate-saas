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
  // 화면 1의 실제 질문이라(사용자 지시) 이제 명시적으로 답해 둔다 —
  // DEFAULT_FORM_STATE의 null(미답변)을 그대로 두면 "입력 안 함"이라는
  // 별도 분기로 떨어져, 아래 대부분의 테스트가 표적으로 삼는 정상 경로를
  // 가리지 못한다.
  ownedHomeCount: 0,
  isFirstTimeBuyer: false,
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
  it("일곱 전제를 모두 낸다 — 물어본 셋과 가정한 셋, 그리고 전용면적", () => {
    expect(items().map((i) => i.label)).toEqual([
      "얼마 있어요(현금)",
      "연 소득(세전)",
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
   * ⚠ **아직 없앤 입력(기존 대출)은 종이에서도 가정임이 드러나야 한다.**
   * 종이를 건네받은 사람은 화면을 보지 못했고, "(가정)"이 빠지면 그
   * 사람은 이 숫자를 자기 사정이 반영된 값으로 읽는다.
   */
  describe("남은 가정값(기존 대출)", () => {
    it("기존 대출이 '(가정)'을 달고 나온다", () => {
      expect(valueOf("기존 대출(연간 상환액)")).toBe("없음 (가정)");
    });

    /**
     * 값은 화면의 가정 문구(`AssumptionLine`)와 **같은 원본**에서 온다 —
     * 종이와 화면이 두 말을 할 수 없어야 한다.
     */
    it("값은 폼 상태가 아니라 ASSUMED_REMOVED_INPUTS에서 온다", () => {
      // 폼 상태에는 이 키가 아예 없다. 있었다면 여기서 흘러들었을 것이다.
      expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain(
        "existingDebtAnnualPayment",
      );
      expect(ASSUMED_REMOVED_INPUTS.existingDebtAnnualPayment).toBe(0);
    });
  });

  /**
   * ⚠ **주택 수·생애최초는 더 이상 가정이 아니다.** 사용자 지시로
   * 화면 1의 실제 질문이 됐으므로, "(가정)"을 달지 않고 폼 상태의 답을
   * 그대로 적는다 — 값은 `ASSUMED_REMOVED_INPUTS`가 아니라
   * `ProfileFormState`에서 온다.
   */
  describe("주택 수·생애최초 — 이제 사용자가 답한 값이다", () => {
    it("무주택으로 답하면 '무주택'이라고만 적는다 — '(가정)'을 달지 않는다", () => {
      expect(valueOf("주택 수", { ...FIXED_STATE, ownedHomeCount: 0 })).toBe(
        "무주택",
      );
    });

    it("유주택으로 답하면 채수를 적는다", () => {
      expect(valueOf("주택 수", { ...FIXED_STATE, ownedHomeCount: 1 })).toBe(
        "유주택 1채",
      );
    });

    it("주택 수를 아직 안 답했으면(null) '입력 안 함'이다", () => {
      expect(
        valueOf("주택 수", { ...FIXED_STATE, ownedHomeCount: null }),
      ).toBe("입력 안 함");
    });

    it("생애최초로 답하면 '예'라고만 적는다", () => {
      expect(
        valueOf("생애최초 주택 구입", {
          ...FIXED_STATE,
          isFirstTimeBuyer: true,
        }),
      ).toBe("예");
    });

    it("생애최초가 아니라고 답하면 '아니오'라고만 적는다", () => {
      expect(
        valueOf("생애최초 주택 구입", {
          ...FIXED_STATE,
          isFirstTimeBuyer: false,
        }),
      ).toBe("아니오");
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

  describe("전용면적 — 매물을 고르기 전엔 언제나 룰셋 임계값이다", () => {
    /**
     * ⚠ **평형대 질문이 사라진 뒤(사용자 지시), 이 값은 조건 분기가
     * 없다.** 언제나 룰셋의 `ruralTaxAreaThresholdSqm`(85㎡) 이하를
     * 가정하고, 그 가정이 실제 매물과 어긋날 수 있다는 사실(농특세·
     * 디딤돌대출)을 같은 줄에서 함께 고지한다.
     */
    it("매물을 고르기 전엔 임계값 이하 가정과 초과 시 고지를 함께 적는다", () => {
      const area = valueOf("전용면적");
      expect(area).toMatch(new RegExp(`${THRESHOLD}㎡ 이하`));
      expect(area).toMatch(/농어촌특별세/);
      expect(area).toMatch(/디딤돌대출/);
    });

    it("매물을 골랐으면 그 평형의 실제 면적을 적고, 가정이라 하지 않는다", () => {
      const area = valueOf("전용면적", FIXED_STATE, {
        source: "selectedUnit",
        sqm: 72,
      });
      expect(area).toContain("72");
      expect(area).toMatch(/매물/);
      expect(area).not.toMatch(/이하로 가정/);
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

  it("일곱 전제를 모두 DOM에 낸다", () => {
    renderIt();
    for (const label of [
      "얼마 있어요(현금)",
      "연 소득(세전)",
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
