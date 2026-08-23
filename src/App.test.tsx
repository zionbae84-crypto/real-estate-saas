import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ComplexUnit } from "./data/complexes";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { rules } from "./state/useAffordability";
import type * as UseAffordabilityModule from "./state/useAffordability";

// 룰셋의 effectiveFrom을 실제 값과 다르게 모의한다. App.tsx가 여전히
// "2026년 3월 규제 기준"을 리터럴로 박아 두고 있었다면 이 모의는 아무
// 효과가 없었을 것이다 — 아래 테스트는 화면 문구가 이 모의값을 그대로
// 따라간다는 사실로, 부제목이 실제로 rules.effectiveFrom에서 계산됨을
// 증명한다. (vi.mock은 파일 최상단에서 호출해야 정상적으로 호이스팅된다.)
vi.mock("./state/useAffordability", async () => {
  const actual =
    await vi.importActual<typeof UseAffordabilityModule>(
      "./state/useAffordability",
    );
  return {
    ...actual,
    rules: { ...actual.rules, effectiveFrom: "2027-11-05" },
  };
});

/**
 * 단지 상세(화면 4) 통합 테스트용 고정 단지 하나.
 *
 * 실제 번들 데이터(`data/complexes.json`)는 수십억 원대라 여기서 다루기
 * 번거롭다 — 이 describe 블록 전용으로 작고 예측 가능한 값 하나만
 * 모의한다. 위쪽 다른 테스트들은 현금·소득을 입력하지 않아 이 모의의
 * 영향을 받지 않는다(프로필이 null이면 이 데이터를 아예 쓰지 않는다).
 *
 * `vi.mock`은 파일 최상단으로 호이스팅되므로, 팩토리 안에서 쓰는 값도
 * `vi.hoisted`로 함께 끌어올려야 한다 — 그냥 top-level const로 두면
 * "초기화 전 접근" 에러가 난다.
 */
const { DETAIL_TEST_UNIT } = vi.hoisted(() => ({
  DETAIL_TEST_UNIT: {
    complexKey: "11680|테스트동|2015|테스트단지",
    complexName: "테스트단지",
    regionCode: "11680",
    legalDongName: "테스트동",
    builtYear: 2015,
    areaBucket: 59,
    medianPrice: 200_000_000,
    tradeCount: 3,
    minPrice: 190_000_000,
    maxPrice: 210_000_000,
    lowConfidence: false,
  } satisfies ComplexUnit,
}));

vi.mock("./data/complexes", () => ({
  COMPLEX_UNITS: [DETAIL_TEST_UNIT],
  DATA_AS_OF: "2026-08",
  REGIONS: [{ regionCode: "11680", complexCount: 1, unitCount: 1 }],
  REGION_NAMES: { "11680": "강남구" },
}));

describe("App", () => {
  it("서비스 제목을 표시한다", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /내 예산으로 살 수 있는 집/ }),
    ).toBeInTheDocument();
  });

  // 예전에는 "2026년 3월 규제 기준"이 App.tsx에 리터럴로 박혀 있어,
  // rules/2026-03.json을 다른 버전으로 갈아 끼워도 화면 문구가 따라가지
  // 않았다. 이 파일에서는 위 vi.mock으로 effectiveFrom을 "2027-11-05"로
  // 바꿔 둔 상태이므로, formatRuleVersionLabel(rules)로 독립적으로 다시
  // 계산한 값("2027년 11월 규제 기준")과 화면에 실제로 렌더링된 문구를
  // 비교한다.
  it("부제목의 규제 기준 문구는 실제 룰셋(effectiveFrom)에서 계산된다", () => {
    render(<App />);
    const expectedLabel = formatRuleVersionLabel(rules);

    expect(expectedLabel).toBe("2027년 11월 규제 기준");
    expect(screen.getByText(new RegExp(expectedLabel))).toBeInTheDocument();
  });

  // 리터럴이었다면 이 테스트가 실패한다 — 화면은 여전히 원래 룰셋 파일의
  // "2026년 3월"을 보여줬을 것이다.
  it("원래 룰셋 파일의 문구가 아니라 모의된 값을 보여준다", () => {
    render(<App />);
    expect(
      screen.queryByText(/2026년 3월 규제 기준/),
    ).not.toBeInTheDocument();
  });
});

describe("App - 단지 상세(화면 4)", () => {
  // useProfileForm은 localStorage에 저장·복원한다. App을 실제로
  // 렌더링하는 이 블록에서 지우지 않으면 이전 테스트가 입력한 값이
  // 다음 테스트로 새어 들어간다(ProfileForm.test.tsx는 훅을 안 쓰고
  // state를 직접 주입해서 이 문제가 없다).
  beforeEach(() => {
    window.localStorage.clear();
  });

  async function fillProfile() {
    // "150000"·"15000"은 단위 없이 쓴 만원 표기다(MoneyInput 기본
    // 해석) — 각각 15억, 1억 5천만원.
    await userEvent.type(screen.getByLabelText("보유 현금"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
  }

  it("단지 목록의 행을 누르면 그 평형의 상세가 열린다", async () => {
    render(<App />);
    await fillProfile();

    const row = screen.getByRole("button", { name: /테스트단지/ });
    await userEvent.click(row);

    expect(
      screen.getByRole("region", { name: "단지 상세" }),
    ).toBeInTheDocument();
    // 목록·지역 선택은 상세가 열리면 화면에서 빠진다 — 별개 화면이다.
    expect(
      screen.queryByRole("region", { name: "지역 선택" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("살 수 있는 단지")).not.toBeInTheDocument();
  });

  it("목록으로 버튼을 누르면 다시 목록이 보인다", async () => {
    render(<App />);
    await fillProfile();
    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

    await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));

    expect(screen.getByText("살 수 있는 단지")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "단지 상세" }),
    ).not.toBeInTheDocument();
  });

  it("평형을 고르면 그 평형의 전용면적이 화면 계산에 반영돼 가정 문구에서 빠진다", async () => {
    render(<App />);
    await fillProfile();

    // 아직 고르기 전에는 전용면적이 가정 중이라는 문구가 있다.
    expect(screen.getByText(/전용면적 86㎡로 가정하고 계산했어요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

    // 이 평형(전용 59㎡)을 반영했으므로 가정 문구 자체가 더 이상
    // 화면에 없다 — 상세가 열려 있는 동안 areaOverridden이 참이 되어
    // AssumptionLine이 전용면적 항목을 빼기 때문이다.
    expect(screen.queryByText(/전용면적 86㎡로 가정하고 계산했어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/전용면적.*로 가정하고 계산했어요/)).not.toBeInTheDocument();
  });

  it("상세가 열린 동안에는 실구매 가능 가격이 그 평형 기준으로 바뀌고, 목록으로 돌아가면 원래 값으로 되돌아간다", async () => {
    const { container } = render(<App />);
    await fillProfile();

    const priceBefore = container.querySelector(".affordable-price")?.textContent;

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
    const priceWhileOpen = container.querySelector(".affordable-price")?.textContent;
    // 상세가 열려 있는 동안에는 이 평형(전용 59㎡)의 실제 면적 기준으로
    // 다시 계산되므로 원래 가정(86㎡) 기준 가격과 달라야 한다.
    expect(priceWhileOpen).not.toBe(priceBefore);

    await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));
    const priceAfter = container.querySelector(".affordable-price")?.textContent;

    // 결함이었던 지점: 프로필에 영구히 저장하면 목록으로 돌아와도
    // priceAfter가 priceWhileOpen에 머물러 있어(원래 값으로 돌아오지
    // 않아) 실구매력이 실제보다 크게 보인다. 프로필에 저장하지 않았다면
    // 닫는 즉시 원래 가정 기준으로 되돌아가야 한다.
    expect(priceAfter).toBe(priceBefore);
  });

  it("상세를 열었다 목록으로 돌아오면 전용면적 가정 문구가 다시 나타나고, localStorage에는 상세에서 본 면적이 쓰이지 않는다", async () => {
    render(<App />);
    await fillProfile();

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
    expect(screen.queryByText(/전용면적.*로 가정하고 계산했어요/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));

    // 목록으로 돌아오면 다시 가정이므로 문구도 다시 나타나야 한다 —
    // 원래 가정 면적(86㎡) 그대로다.
    expect(screen.getByText(/전용면적 86㎡로 가정하고 계산했어요/)).toBeInTheDocument();

    // 프로필(및 localStorage)에는 상세에서 본 59㎡가 전혀 쓰이지
    // 않았어야 한다 — touched에도 "area"가 없고, 저장된 exclusiveAreaSqm도
    // 원래 가정값(86)이다.
    const stored = JSON.parse(window.localStorage.getItem("budget-profile-v1") ?? "{}");
    expect(stored.touched ?? []).not.toContain("area");
    expect(stored.exclusiveAreaSqm).not.toBe(59);
  });

  describe("리뷰 수정: 상세 화면의 배지 라벨·전용면적 입력·포커스", () => {
    it("상세가 열리면 배지가 둘이 되고, 각각 무엇에 답하는지 라벨이 보인다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      // 목록 화면에서는 배지가 하나뿐이라 라벨을 붙이지 않는다.
      expect(container.querySelectorAll(".safety-badge")).toHaveLength(1);
      expect(container.querySelector(".safety-badge-label")).toBeNull();

      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

      const badges = container.querySelectorAll(".safety-badge");
      expect(badges).toHaveLength(2);

      const labels = [...container.querySelectorAll(".safety-badge-label")].map(
        (el) => el.textContent ?? "",
      );
      // 둘 다 라벨이 있고, 서로 다른 질문에 답한다고 글자로 말한다.
      expect(labels).toHaveLength(2);
      expect(labels[0]).toMatch(/최대로 빌렸을 때/);
      expect(labels[1]).toMatch(/이 집을 샀을 때/);

      // 목록으로 돌아오면 배지가 다시 하나가 되고 라벨도 사라진다.
      await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));
      expect(container.querySelectorAll(".safety-badge")).toHaveLength(1);
      expect(container.querySelector(".safety-badge-label")).toBeNull();
    });

    it("상세가 열려 있는 동안에는 전용면적 입력란을 내보내지 않는다", async () => {
      // 상세가 열려 있으면 화면 계산이 그 평형의 면적을 쓰므로,
      // 입력란에 값을 넣어도 화면이 꿈쩍하지 않는다 — 입력이 조용히
      // 무시되는 상태다. 무시할 거라면 물어보지 않는다.
      render(<App />);
      await fillProfile();

      await userEvent.click(
        screen.getByRole("button", { name: /전용면적 86㎡로 가정하고 계산했어요/ }),
      );
      expect(screen.getByLabelText("전용면적 (㎡)")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
      expect(screen.queryByLabelText("전용면적 (㎡)")).not.toBeInTheDocument();

      // 상세를 닫으면 다시 물어볼 수 있어야 한다.
      await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));
      expect(screen.getByLabelText("전용면적 (㎡)")).toBeInTheDocument();
    });

    it("상세를 열면 포커스가 상세로 옮겨간다", async () => {
      render(<App />);
      await fillProfile();

      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

      expect(document.activeElement).toBe(
        screen.getByRole("region", { name: "단지 상세" }),
      );
    });
  });

  describe("리뷰 수정: 인쇄(화면 5)", () => {
    it("현금·소득을 입력하기 전에는 인쇄 버튼이 없다", () => {
      render(<App />);
      expect(
        screen.queryByRole("button", { name: "인쇄하기" }),
      ).not.toBeInTheDocument();
    });

    it("계산이 나오면 인쇄 버튼이 나타나고, 누르면 브라우저 인쇄 대화상자를 연다", async () => {
      const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
      render(<App />);
      await fillProfile();

      const button = screen.getByRole("button", { name: "인쇄하기" });
      await userEvent.click(button);

      expect(printSpy).toHaveBeenCalledTimes(1);
      printSpy.mockRestore();
    });

    it("입력한 전제(현금·소득·룰셋 기준)가 인쇄 전용 요약에 나온다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      const summary = container.querySelector(".print-summary");
      expect(summary).not.toBeNull();
      expect(summary?.textContent).toMatch(/15억/); // 보유 현금
      expect(summary?.textContent).toMatch(/1억 5,000만원/); // 연 소득
      expect(summary?.textContent).toMatch(/규제 기준/); // 룰셋 기준
      expect(summary?.textContent).toMatch(/인쇄일/);
    });

    it("리뷰 수정(인쇄 '함께 볼 것'): 부제의 개인정보 보호 문구만 별도 span으로 감싼다", () => {
      // "입력한 재무정보는 이 브라우저를 벗어나지 않아요"는 "이
      // 브라우저"라는 지시 대상이 종이 위에는 없어 인쇄에서 뜻이 서지
      // 않는다 — .subtitle-privacy-note만 인쇄에서 지운다
      // (styles.css). 룰셋 기준·수도권 범위는 종이에서도 뜻이 있어
      // 남긴다.
      const { container } = render(<App />);
      const subtitle = container.querySelector(".subtitle");
      const note = subtitle?.querySelector(".subtitle-privacy-note");

      expect(note).not.toBeNull();
      expect(note?.textContent).toBe(
        " · 입력한 재무정보는 이 브라우저를 벗어나지 않아요",
      );

      // 화면 문구는 인쇄 결함 수정 전과 정확히 같아야 한다.
      const expectedLabel = formatRuleVersionLabel(rules);
      expect(subtitle?.textContent).toBe(
        `${expectedLabel} · 수도권 · 입력한 재무정보는 이 브라우저를 벗어나지 않아요`,
      );
    });

    it("목록 화면에서는 전용면적이 가정값이라고 밝히고, 매물을 고르면 그 매물의 실제 면적이라고 밝힌다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      const summaryBefore = container.querySelector(".print-summary");
      expect(summaryBefore?.textContent).toMatch(/86㎡\s*\(가정값\)/);

      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

      const summaryAfter = container.querySelector(".print-summary");
      expect(summaryAfter?.textContent).toMatch(/59㎡\s*\(선택한 매물의 실제 면적\)/);
    });
  });
});
