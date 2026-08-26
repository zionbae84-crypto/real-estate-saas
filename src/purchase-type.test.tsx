import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ComplexUnit } from "./data/complexes";
import * as regionQuery from "./lib/regionQuery";
import { formatWon } from "./format/won";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { calcAffordablePrice, type BuyerProfile } from "./lib/finance";
import { rules } from "./state/useAffordability";
import { purchaseRules } from "./state/usePurchaseCheck";
import { PURCHASE_TYPE_STORAGE_KEY } from "./state/usePurchaseType";

/**
 * 구매 유형을 고르는 자리와, 유형에 따라 화면이 갈리는 흐름.
 *
 * **이 파일이 지키는 가장 중요한 것은 "실거주 경로가 그대로다"이다.**
 * 유형 선택이 붙었다고 해서 지금까지 쓰던 사람의 숫자가 달라지면 안 된다.
 * 아래 첫 블록이 화면의 실구매 가능 가격을 재무 엔진이 직접 낸 값과
 * 맞춰 본다 — 화면과 엔진 사이에 유형 분기가 끼어들지 않았다는 뜻이다.
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
  await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
  await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
  await userEvent.click(screen.getByLabelText("무주택"));
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

async function choose(type: "실거주" | "갭투자" | "월세수익형") {
  await userEvent.click(
    screen.getByLabelText(new RegExp(purchaseRules.types[type].label)),
  );
}

describe("구매 유형 선택", () => {
  it("처음에는 실거주가 골라져 있다", () => {
    render(<App />);
    expect(
      screen.getByLabelText(new RegExp(purchaseRules.types.실거주.label)),
    ).toBeChecked();
  });

  it("고를 수 있는 유형은 실거주·월세수익형뿐이다 — 갭투자는 전세자금대출 규제로 뺐다", () => {
    render(<App />);
    for (const type of ["실거주", "월세수익형"] as const) {
      expect(
        screen.getByLabelText(new RegExp(purchaseRules.types[type].label)),
      ).toBeInTheDocument();
    }
    // 엔진(PurchaseCheck)은 갭투자를 여전히 계산할 수 있다 — 여기서
    // 확인하는 것은 이 라디오 목록에서만 뺐다는 사실이다.
    expect(
      screen.queryByLabelText(new RegExp(purchaseRules.types.갭투자.label)),
    ).not.toBeInTheDocument();
  });
});

/**
 * 리뷰 밖에서 찾은 결함(P1): 새로고침하면 유형이 사라지고 실거주 숫자가
 * 되돌아왔다. 나머지 프로필은 전부 저장되는데 유형만 저장되지 않아서다.
 */
describe("구매 유형을 기억한다", () => {
  it("고른 유형이 저장된다", async () => {
    render(<App />);
    await choose("월세수익형");
    expect(window.localStorage.getItem(PURCHASE_TYPE_STORAGE_KEY)).toBe(
      "월세수익형",
    );
  });

  it("새로 그려도 고른 유형이 남는다 — 실거주 예산 화면이 되돌아오지 않는다", async () => {
    render(<App />);
    await fillProfile();
    await choose("월세수익형");
    // unmount만으로는 컨테이너가 body에 남아 다음 render와 겹친다.
    cleanup();

    // 새로고침과 같은 상태: 저장된 프로필과 저장된 유형만 남아 있다.
    render(<App />);
    // 라디오로 좁힌다 — 월세수익형 화면이 떠 있으면 그 섹션의 aria-label
    // ("월세수익형 재무 지표")도 같은 글자를 갖는다.
    expect(
      screen.getByRole("radio", {
        name: new RegExp(purchaseRules.types.월세수익형.label),
      }),
    ).toBeChecked();
    // 저장된 현금·소득으로 계산한 실거주 한도가 다시 뜨지 않는다.
    expect(document.querySelector(".affordable-price")).toBeNull();
    expect(
      screen.getByText(purchaseRules.types.월세수익형.loanLimitNote),
    ).toBeInTheDocument();
  });

  it("저장된 값이 모르는 값이면 실거주로 떨어지고 그 사실을 말한다", () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "전세");
    render(<App />);
    expect(
      screen.getByLabelText(new RegExp(purchaseRules.types.실거주.label)),
    ).toBeChecked();
    expect(
      document.querySelector(".purchase-type-restore-notice")?.textContent,
    ).toMatch(/읽지 못해서 실거주로 시작했어요/);
  });

  /**
   * 갭투자는 라디오에서 뺐지만 `PurchaseType` 유니온에는 여전히 있어서
   * `loadStoredPurchaseType`이 "형식은 맞는 값"으로 착각할 수 있다.
   * 저장해 둔 사람이 새로고침했을 때 고를 수 없는 화면이 조용히
   * 되살아나면 안 되므로, "모르는 값"과 같은 경로(실거주 폴백 + 안내)를
   * 타야 한다. `usePurchaseType.test.ts`가 단위 수준에서 이미 잠갔고,
   * 여기서는 App 전체가 그 안내를 실제로 보여주는지 확인한다.
   */
  it("저장된 값이 (지금은 못 고르는) 갭투자면 실거주로 떨어지고 그 사실을 말한다", () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "갭투자");
    render(<App />);
    expect(
      screen.getByLabelText(new RegExp(purchaseRules.types.실거주.label)),
    ).toBeChecked();
    expect(
      document.querySelector(".purchase-type-restore-notice")?.textContent,
    ).toMatch(/읽지 못해서 실거주로 시작했어요/);
  });

  it("사용자가 다시 고르면 그 안내는 사라진다", async () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "전세");
    render(<App />);
    await choose("월세수익형");
    expect(document.querySelector(".purchase-type-restore-notice")).toBeNull();
  });

  it("정상적으로 복원됐을 때는 안내가 뜨지 않는다(오탐 방지 확인)", () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "월세수익형");
    render(<App />);
    expect(document.querySelector(".purchase-type-restore-notice")).toBeNull();
  });
});

describe("실거주 경로는 그대로다", () => {
  it("실구매 가능 가격이 재무 엔진이 낸 값과 정확히 같다", async () => {
    render(<App />);
    await fillProfile();

    const expected = calcAffordablePrice(PROFILE, rules).affordablePrice;
    expect(expected).toBeGreaterThan(0);
    expect(
      document.querySelector(".affordable-price")?.textContent,
    ).toBe(formatWon(expected));
  });

  it("유형을 바꿨다 돌아와도 같은 숫자가 그대로다", async () => {
    render(<App />);
    await fillProfile();
    const before = document.querySelector(".affordable-price")?.textContent;

    await choose("월세수익형");
    expect(document.querySelector(".affordable-price")).toBeNull();

    await choose("실거주");
    expect(document.querySelector(".affordable-price")?.textContent).toBe(
      before,
    );
  });

  it("실거주에서는 투자 지표가 하나도 나오지 않는다", async () => {
    render(<App />);
    await fillProfile();
    expect(document.querySelectorAll(".purchase-metric")).toHaveLength(0);
    for (const field of ["dscr", "capRate", "rti", "jeonseRatio"]) {
      expect(document.querySelector(`[data-field="${field}"]`)).toBeNull();
    }
  });
});

describe("투자 목적 유형", () => {
  // 갭투자는 지금 라디오에서 뺐다(위 "구매 유형 선택" 참고) — 아래는
  // 지금 UI로 고를 수 있는 유일한 투자 유형인 월세수익형으로 확인한다.
  // 갭투자를 골랐을 때도 같은 동작이 나오는지는 PurchaseCheck.test.tsx가
  // `<PurchaseCheck type="갭투자" />`를 직접 렌더링해 컴포넌트 수준에서
  // 계속 잠근다 — 라디오가 사라져도 엔진·화면 로직 자체는 그대로다.
  it("월세수익형을 고르면 실거주 예산 화면이 통째로 사라진다", async () => {
    render(<App />);
    await choose("월세수익형");

    // 프로필 입력(현금·소득)도, 예산 결과도, 단지 목록도 없다.
    expect(screen.queryByLabelText("연 소득 (세전)")).not.toBeInTheDocument();
    expect(document.querySelector(".budget-result")).toBeNull();
    expect(document.querySelector(".complex-list")).toBeNull();
    expect(
      screen.queryByText(/현금과 연소득을 입력하면/),
    ).not.toBeInTheDocument();
  });

  it("대신 한도를 계산하지 않는다고 말한다", async () => {
    render(<App />);
    await choose("월세수익형");
    expect(
      screen.getByText(purchaseRules.types.월세수익형.loanLimitNote),
    ).toBeInTheDocument();
  });

  it("월세 수익형은 월세 지표를 낸다(전세 지표는 나오지 않는다)", async () => {
    render(<App />);
    await choose("월세수익형");
    expect(screen.getByLabelText("월세")).toBeInTheDocument();
    expect(screen.queryByLabelText("전세보증금")).not.toBeInTheDocument();
  });

  it("인쇄 버튼은 유형과 무관하게 있다", async () => {
    render(<App />);
    await choose("월세수익형");
    expect(screen.getByRole("button", { name: "인쇄하기" })).toBeInTheDocument();
  });
});

/**
 * 리뷰 수정(Important 3·Minor 5): 화면 부제와 푸터는 **실거주 룰셋**을
 * 전제한 문장이었다. 투자 경로는 바로 그 기준으로 한도를 계산하지
 * 않는다고 말하는 화면이라, 그 위아래에 그대로 남으면 뜻이 어긋난다.
 */
describe("어느 기준인지·무엇을 계산하지 않는지가 유형에 따라 갈린다", () => {
  it("실거주에서는 실거주 룰셋 기준이 부제에 남는다", () => {
    render(<App />);
    expect(document.querySelector(".subtitle")?.textContent).toContain(
      formatRuleVersionLabel(rules),
    );
  });

  // 갭투자는 라디오에서 뺐다 — 지금 UI로 고를 수 있는 투자 유형은
  // 월세수익형뿐이라 each 목록도 그것 하나로 좁힌다.
  it.each(["월세수익형"] as const)(
    "%s에서는 실거주 룰셋 기준 대신 구매 유형 룰셋을 적는다",
    async (type) => {
      render(<App />);
      await choose(type);
      const subtitle = document.querySelector(".subtitle")?.textContent ?? "";
      expect(subtitle).not.toContain(formatRuleVersionLabel(rules));
      expect(subtitle).toContain(purchaseRules.version);
    },
  );

  it("실거주 푸터는 그대로다", () => {
    render(<App />);
    expect(document.querySelector(".disclaimer")?.textContent).toContain(
      "실제 대출한도는 금융기관 심사 결과에 따릅니다",
    );
  });

  it.each(["월세수익형"] as const)(
    "%s 푸터는 대출한도 추정치가 있는 것처럼 말하지 않는다",
    async (type) => {
      render(<App />);
      await choose(type);
      const footer = document.querySelector(".disclaimer")?.textContent ?? "";
      expect(footer).not.toContain("대출한도는 금융기관 심사 결과");
      expect(footer).toContain("대출한도를 계산하지 않아요");
    },
  );
});

/**
 * 리뷰 수정(Minor 6): 유형을 오갈 때 앞 유형의 금액이 다른 뜻으로
 * 되살아나면 안 된다. `usePurchaseCheck` 문서가 명시적으로 경계하는
 * 자리인데 이를 잠그는 테스트가 없었다.
 */
describe("유형을 오갈 때의 입력 보존", () => {
  // 갭투자는 라디오에서 뺐다. 갭투자↔월세수익형처럼 **서로 다른 두
  // 투자 유형**을 오가는 값 격리(리뷰 수정 Minor 6이 고친 바로 그 결함)는
  // 지금 이 화면에서 재현할 방법이 없다 — 이 App에서 UI로 도달 가능한
  // 투자 유형이 월세수익형 하나뿐이기 때문이다. 그 회귀는
  // `usePurchaseCheck.test.ts`가 훅을 직접 렌더링해 UI 도달 가능 여부와
  // 무관하게 계속 잠근다. 아래는 이 화면에서 여전히 확인할 수 있는
  // 것(투자 유형 하나를 오갈 때 실거주를 거치면 비워지는지)만 남긴다.
  it("실거주를 거치면 투자 입력은 비워진다 — 되살아나는 것보다 안전하다", async () => {
    render(<App />);
    await choose("월세수익형");
    await userEvent.type(screen.getByLabelText("월세"), "200");

    await choose("실거주");
    await choose("월세수익형");
    expect(screen.getByLabelText("월세")).toHaveValue("");
  });

  it("실거주 프로필은 투자 유형을 거쳐도 그대로다(대조군)", async () => {
    render(<App />);
    await fillProfile();
    const before = document.querySelector(".affordable-price")?.textContent;

    await choose("월세수익형");
    await choose("실거주");
    expect(document.querySelector(".affordable-price")?.textContent).toBe(before);
  });
});

/**
 * 리뷰 수정(Important 3·Minor 6): 투자 경로에서 화면 1(`EntryScreen`)은
 * 항상 숨어 있다 — `handlePurchaseTypeChange`가 유형을 고르는 순간
 * phase를 "결과"로 넘기기 때문이다. 유형 라디오가 그 숨은 화면에만
 * 있으면 투자 결과 화면에서는 유형을 바꿀 자리가 화면 어디에도 없고,
 * 유일한 통로였던 "조건 다시 넣기"는 라디오 하나뿐인 막다른 길로
 * 데려갔다(고를 수 있는 투자 유형이 하나뿐이라, 이미 선택된 라디오를
 * 다시 눌러도 `onChange`가 불리지 않는다 — 실질적인 탈출구는 입력값을
 * 지우는 실거주뿐이었다).
 */
describe("리뷰 수정: 투자 화면에서 나가는 길", () => {
  /** 조회 성공 하나. 값은 이 파일의 프로필(현금 15억)로 충분히 살 수 있다. */
  const UNIT: ComplexUnit = {
    complexKey: "11680|테스트동|2015|테스트단지",
    complexName: "테스트단지",
    regionCode: "11680",
    legalDongName: "테스트동",
    builtYear: 2015,
    areaBucket: 84,
    maxExclusiveAreaSqm: 84,
    landLeasehold: "N",
    tradeCount: 3,
    minPrice: 190_000_000,
    maxPrice: 210_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    lowConfidence: false,
  };

  async function selectRegion() {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
    await screen.findByRole("region", { name: "살 수 있는 단지" });
  }

  afterEach(() => vi.restoreAllMocks());

  it("투자 화면에서도 유형을 바꿀 수 있다 — 라디오가 숨은 화면 1 밖에 있다", async () => {
    const { container } = render(<App />);
    await choose("월세수익형");

    const entry = container.querySelector(".entry-screen");
    // 전제: 투자 유형을 고른 순간 화면 1은 시각적으로 사라진다.
    expect(entry).toHaveClass("entry-screen--hidden");

    const radio = screen.getByRole("radio", {
      name: new RegExp(purchaseRules.types.실거주.label),
    });
    expect(entry?.contains(radio)).toBe(false);
  });

  it("투자 화면에는 '조건 다시 넣기'가 없다 — 되돌릴 조건이 화면 1에 없다", async () => {
    render(<App />);
    await choose("월세수익형");
    expect(
      screen.queryByRole("button", { name: "조건 다시 넣기" }),
    ).not.toBeInTheDocument();
  });

  it("실거주 결과 화면에는 그대로 있다(대조군) — 거기엔 되돌릴 입력이 있다", async () => {
    render(<App />);
    await fillProfile();
    await selectRegion();
    expect(
      screen.getByRole("button", { name: "조건 다시 넣기" }),
    ).toBeInTheDocument();
  });

  it("이미 조회한 결과가 있으면 실거주로 돌아올 때 다시 조회하지 않아도 보인다", async () => {
    const { container } = render(<App />);
    await fillProfile();
    await selectRegion();
    const price = document.querySelector(".affordable-price")?.textContent;

    await choose("월세수익형");
    await choose("실거주");

    // 조회 결과도, 그 위의 예산 계산도 곧바로 다시 보인다 —
    // 데이터는 내내 `regionComplexes`에 있었고 화면 게이트만 막고 있었다.
    expect(container.querySelector(".entry-screen")).toHaveClass(
      "entry-screen--hidden",
    );
    expect(
      screen.getByRole("region", { name: "살 수 있는 단지" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".affordable-price")?.textContent).toBe(price);
  });

  it("조회한 적이 없으면 실거주로 돌아올 때 화면 1로 간다(대조군)", async () => {
    const { container } = render(<App />);
    await fillProfile();

    await choose("월세수익형");
    await choose("실거주");

    expect(container.querySelector(".entry-screen")).not.toHaveClass(
      "entry-screen--hidden",
    );
  });
});
