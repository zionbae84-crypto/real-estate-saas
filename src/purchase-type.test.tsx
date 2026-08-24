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
  await userEvent.type(screen.getByLabelText("보유 현금"), "150000");
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
  exclusiveAreaSqm: rules.acquisitionTax.ruralTaxAreaThresholdSqm + 1,
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

  it("세 유형을 모두 고를 수 있다", () => {
    render(<App />);
    for (const type of ["실거주", "갭투자", "월세수익형"] as const) {
      expect(
        screen.getByLabelText(new RegExp(purchaseRules.types[type].label)),
      ).toBeInTheDocument();
    }
  });
});

/**
 * 리뷰 밖에서 찾은 결함(P1): 새로고침하면 유형이 사라지고 실거주 숫자가
 * 되돌아왔다. 나머지 프로필은 전부 저장되는데 유형만 저장되지 않아서다.
 */
describe("구매 유형을 기억한다", () => {
  it("고른 유형이 저장된다", async () => {
    render(<App />);
    await choose("갭투자");
    expect(window.localStorage.getItem(PURCHASE_TYPE_STORAGE_KEY)).toBe("갭투자");
  });

  it("새로 그려도 고른 유형이 남는다 — 실거주 예산 화면이 되돌아오지 않는다", async () => {
    render(<App />);
    await fillProfile();
    await choose("갭투자");
    // unmount만으로는 컨테이너가 body에 남아 다음 render와 겹친다.
    cleanup();

    // 새로고침과 같은 상태: 저장된 프로필과 저장된 유형만 남아 있다.
    render(<App />);
    // 라디오로 좁힌다 — 갭투자 화면이 떠 있으면 그 섹션의 aria-label
    // ("갭투자 재무 지표")도 같은 글자를 갖는다.
    expect(
      screen.getByRole("radio", {
        name: new RegExp(purchaseRules.types.갭투자.label),
      }),
    ).toBeChecked();
    // 저장된 현금·소득으로 계산한 실거주 한도가 다시 뜨지 않는다.
    expect(document.querySelector(".affordable-price")).toBeNull();
    expect(
      screen.getByText(purchaseRules.types.갭투자.loanLimitNote),
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

  it("사용자가 다시 고르면 그 안내는 사라진다", async () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "전세");
    render(<App />);
    await choose("월세수익형");
    expect(document.querySelector(".purchase-type-restore-notice")).toBeNull();
  });

  it("정상적으로 복원됐을 때는 안내가 뜨지 않는다(오탐 방지 확인)", () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "갭투자");
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

    await choose("갭투자");
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
  it("갭투자를 고르면 실거주 예산 화면이 통째로 사라진다", async () => {
    render(<App />);
    await choose("갭투자");

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
    await choose("갭투자");
    expect(
      screen.getByText(purchaseRules.types.갭투자.loanLimitNote),
    ).toBeInTheDocument();
  });

  it("월세 수익형은 월세 지표를, 갭투자는 전세 지표를 낸다", async () => {
    render(<App />);
    await choose("월세수익형");
    expect(screen.getByLabelText("월세")).toBeInTheDocument();
    expect(screen.queryByLabelText("전세보증금")).not.toBeInTheDocument();

    await choose("갭투자");
    expect(screen.getByLabelText("전세보증금")).toBeInTheDocument();
    expect(screen.queryByLabelText("월세")).not.toBeInTheDocument();
  });

  it("인쇄 버튼은 유형과 무관하게 있다", async () => {
    render(<App />);
    await choose("갭투자");
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

  it.each(["갭투자", "월세수익형"] as const)(
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

  it.each(["갭투자", "월세수익형"] as const)(
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
  it("갭투자 → 월세로 가면 전세보증금이 월세 보증금으로 되살아나지 않는다", async () => {
    render(<App />);
    await choose("갭투자");
    await userEvent.type(screen.getByLabelText("전세보증금"), "40000");

    await choose("월세수익형");
    expect(screen.getByLabelText("보증금")).toHaveValue("");
  });

  it("갭↔월세를 오가도 각 유형의 값은 자기 자리에 남는다", async () => {
    render(<App />);
    await choose("갭투자");
    await userEvent.type(screen.getByLabelText("전세보증금"), "40000");
    await choose("월세수익형");
    await userEvent.type(screen.getByLabelText("월세"), "200");

    await choose("갭투자");
    // MoneyInput은 포커스를 잃기 전까지 입력 원문을 그대로 들고 있다.
    expect(screen.getByLabelText("전세보증금")).toHaveValue("40000");
    await choose("월세수익형");
    expect(screen.getByLabelText("월세")).toHaveValue("200");
  });

  it("실거주를 거치면 투자 입력은 비워진다 — 되살아나는 것보다 안전하다", async () => {
    render(<App />);
    await choose("갭투자");
    await userEvent.type(screen.getByLabelText("전세보증금"), "40000");

    await choose("실거주");
    await choose("갭투자");
    expect(screen.getByLabelText("전세보증금")).toHaveValue("");
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

describe("권리분석 문진은 유형과 무관하다", () => {
  // 등기부는 어떤 목적으로 사든 같은 서류다.
  it.each(["실거주", "갭투자", "월세수익형"] as const)(
    "%s에서도 문진이 남아 있다",
    async (type) => {
      render(<App />);
      await choose(type);
      expect(
        screen.getByText(/등기부등본으로 권리 확인하기/),
      ).toBeInTheDocument();
    },
  );
});
