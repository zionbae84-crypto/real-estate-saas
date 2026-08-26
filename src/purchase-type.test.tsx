import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { formatWon } from "./format/won";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { calcAffordablePrice, type BuyerProfile } from "./lib/finance";
import { rules } from "./state/useAffordability";
import { purchaseRules } from "./state/usePurchaseCheck";
import { PURCHASE_TYPE_STORAGE_KEY } from "./state/usePurchaseType";

/**
 * 이 앱은 **실거주 전용**이다.
 *
 * 구매 유형(실거주 / 월세수익형) 선택은 사용자 지시로 제거됐다. 예전에
 * 이 파일이 지키던 것은 "유형에 따라 화면이 갈린다"였고, 지금 지키는
 * 것은 그 반대다: **갈릴 자리가 남아 있지 않다.**
 *
 * 그중에서도 가장 중요한 것은 예전과 같다 — **실거주 경로의 숫자가
 * 그대로다.** 아래 첫 블록이 화면의 실구매 가능 가격을 재무 엔진이
 * 직접 낸 값과 맞춰 본다.
 *
 * 투자 경로 컴포넌트(`PurchaseCheck`·`PurchaseVerdict`·
 * `PurchasePrintSummary`)와 그 엔진은 지우지 않고 남겼다(App.tsx의
 * 결과 트리 주석 참고) — 이 화면에서 도달할 수 없을 뿐이고, 컴포넌트
 * 수준 테스트(`PurchaseCheck.test.tsx` 등)가 그 동작을 계속 잠근다.
 */

// useProfileForm은 localStorage에 저장·복원한다. 지우지 않으면 앞
// 테스트의 입력이 다음 테스트로 새어 들어간다(App.test.tsx와 같은 이유).
beforeEach(() => {
  window.localStorage.clear();
});

/** "150000"·"15000"은 단위 없이 쓴 만원 표기다 — 15억, 1억 5천만원 */
const CASH = 1_500_000_000;
const INCOME = 150_000_000;

async function fillProfile() {
  await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
  await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
}

/**
 * 폼의 기본값 그대로인 프로필.
 *
 * `useProfileForm.DEFAULT_FORM_STATE`가 정한 것과 같아야 한다 — 규제지역
 * true, 생애최초 false, 전용면적은 농특세 임계값 + 1.
 */
const PROFILE: BuyerProfile = {
  status: "무주택",
  ownedHomeCount: 0,
  cash: CASH,
  annualIncome: INCOME,
  existingDebtAnnualPayment: 0,
  isFirstTimeBuyer: false,
  isRegulatedArea: true,
  exclusiveAreaSqm: rules.acquisitionTax.ruralTaxAreaThresholdSqm,
};

describe("구매 유형을 고르는 자리가 없다", () => {
  it("유형 라디오가 화면 어디에도 없다", () => {
    render(<App />);
    for (const type of ["실거주", "갭투자", "월세수익형"] as const) {
      expect(
        screen.queryByRole("radio", {
          name: new RegExp(purchaseRules.types[type].label),
        }),
        `${type} 라디오가 아직 화면에 있습니다.`,
      ).not.toBeInTheDocument();
    }
  });

  it("투자 경로 화면도 나오지 않는다", async () => {
    render(<App />);
    await fillProfile();
    expect(document.querySelector(".purchase-check")).toBeNull();
    expect(document.querySelectorAll(".purchase-metric")).toHaveLength(0);
    for (const field of ["dscr", "capRate", "rti", "jeonseRatio"]) {
      expect(document.querySelector(`[data-field="${field}"]`)).toBeNull();
    }
  });
});

/**
 * 재검토 수정(Critical 1)이 고쳤던 사고: **저장된 투자 유형으로 새로
 * 열면 아무것도 누를 수 없는 화면이 됐다.** 저장소에는 그때 "월세수익형"을
 * 남긴 사용자가 아직 있다.
 *
 * 지금은 그 값을 읽지 않고 `usePurchaseType`이 실거주로 덮으므로 그
 * 화면에 이르는 경로 자체가 없다. 그 사실을 여기서 못박는다 — jsdom은
 * `inert`도 `display`도 적용하지 않으므로 `getByRole`만으로는 "덮여
 * 있는 화면"과 "멀쩡한 화면"이 구분되지 않는다. 그래서 조작 가능한
 * 컨트롤을 직접 센다.
 */
describe("저장소에 남은 옛 투자 유형", () => {
  /**
   * 사용자가 실제로 누를 수 있는가. 조상 중에 `inert`가 걸렸거나
   * 시각적으로 걷힌 화면 1(`.entry-screen--hidden`)이 하나라도 있으면
   * 아니다.
   */
  function reachable(element: Element | null): boolean {
    if (element === null) return false;
    // 변수 이름을 `cursor`로 둔다 — `no-network.test.ts`가 `src/`
    // 전체에서 노드 내장 모듈 임포트 접두사를 문자열로 금지하는데,
    // 타입 표기가 붙은 `node` 변수가 그 패턴에 그대로 걸린다.
    let cursor: Element | null = element;
    while (cursor !== null) {
      if (cursor.hasAttribute("inert")) return false;
      if (cursor.classList.contains("entry-screen--hidden")) return false;
      cursor = cursor.parentElement;
    }
    return true;
  }

  /** 지금 화면에서 사용자가 실제로 조작할 수 있는 컨트롤들 */
  function operableControls(container: HTMLElement): Element[] {
    return [
      ...container.querySelectorAll("button, input, select, textarea, a[href]"),
    ].filter(
      (el) =>
        reachable(el) && !(el as HTMLInputElement | HTMLButtonElement).disabled,
    );
  }

  it("reachable()이 실제로 무언가를 걸러낸다(전제)", async () => {
    const { container } = render(<App />);
    // 프로필만 채우고 지역은 조회하지 않은 상태 — 실거주 결과 트리의
    // 상단바가 그려지지만 phase는 아직 "입력"이라 화면 1이 그 위를
    // 덮고 있다(리뷰 수정 Important 4가 `inert`로 끊은 바로 그 상태).
    await fillProfile();
    expect(container.querySelector(".entry-screen")).not.toHaveClass(
      "entry-screen--hidden",
    );
    expect(container.querySelector(".results-screen")).toHaveAttribute("inert");

    // 그 inert 트리 안의 컨트롤은 닿지 않는 것으로 판정돼야 한다.
    const budgetTrigger = screen.getByRole("button", {
      name: /실구매 가능 가격/,
    });
    expect(reachable(budgetTrigger)).toBe(false);
    // 화면 1 안의 입력은 닿는다 — 이 헬퍼가 전부 false를 내는 것이
    // 아님을 함께 확인한다.
    expect(reachable(screen.getByLabelText(/얼마 있어요/))).toBe(true);
  });

  it.each(["실거주", "월세수익형", "갭투자", "전세", ""] as const)(
    "저장소에 %s가 남아 있어도 화면 1이 그대로 뜨고 그 안의 입력에 닿는다",
    (stored) => {
      window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, stored);
      const { container } = render(<App />);

      expect(container.querySelector(".entry-screen")).not.toHaveClass(
        "entry-screen--hidden",
      );
      expect(reachable(screen.getByLabelText(/얼마 있어요/))).toBe(true);
      expect(
        operableControls(container).length,
        "새로 연 화면에서 사용자가 조작할 수 있는 컨트롤이 하나도 " +
          "없습니다 — localStorage를 지우는 것 말고 빠져나올 길이 없는 상태입니다.",
      ).toBeGreaterThan(0);
    },
  );

  it("남아 있던 투자 유형은 실거주로 덮인다 — 유형이 다시 늘어나도 되살아나지 않는다", () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "월세수익형");
    render(<App />);
    expect(window.localStorage.getItem(PURCHASE_TYPE_STORAGE_KEY)).toBe(
      "실거주",
    );
  });

  it("새로 그려도 실거주 화면 그대로다 — 투자 화면이 되돌아오지 않는다", async () => {
    render(<App />);
    await fillProfile();
    // unmount만으로는 컨테이너가 body에 남아 다음 render와 겹친다.
    cleanup();

    // 새로고침과 같은 상태: 저장된 프로필만 남아 있다.
    render(<App />);
    expect(document.querySelector(".purchase-check")).toBeNull();
    expect(document.querySelector(".affordable-price")).not.toBeNull();
  });
});

describe("실거주 경로는 그대로다", () => {
  it("실구매 가능 가격이 재무 엔진이 낸 값과 정확히 같다", async () => {
    render(<App />);
    await fillProfile();

    const expected = calcAffordablePrice(PROFILE, rules).affordablePrice;
    expect(expected).toBeGreaterThan(0);
    expect(document.querySelector(".affordable-price")?.textContent).toBe(
      formatWon(expected),
    );
  });

  it("실거주 룰셋 기준이 부제에 남는다", () => {
    render(<App />);
    expect(document.querySelector(".subtitle")?.textContent).toContain(
      formatRuleVersionLabel(rules),
    );
  });

  it("실거주 푸터는 그대로다", () => {
    render(<App />);
    expect(document.querySelector(".disclaimer")?.textContent).toContain(
      "실제 대출한도는 금융기관 심사 결과에 따릅니다",
    );
  });

  /**
   * 종이에는 이 계산이 무엇을 전제하는지가 남아야 한다. 유형이 하나뿐이
   * 됐다고 해서 전제가 사라진 것이 아니다 — LTV·DSR·정책대출은 전부
   * "내가 들어가 사는 집"을 전제로 고시된 값이고, 그 사실을 종이에
   * 적는 자리가 이 한 줄뿐이다(hiddenInPrint.ts 참고).
   */
  it("종이에 남는 구매 유형 한 줄은 그대로다", () => {
    const { container } = render(<App />);
    const line = container.querySelector(".purchase-type-print");
    expect(line).not.toBeNull();
    expect(line?.textContent).toContain(purchaseRules.types.실거주.label);
  });
});
