import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { COMPLEX_UNITS, type ComplexUnit } from "./data/complexes";
import * as regionQuery from "./lib/regionQuery";
import { rules as financeRules } from "./state/useAffordability";
import { STORAGE_KEY } from "./state/useProfileForm";

/**
 * 지역 실거래가 조회를 모의한다.
 *
 * 목록의 출처가 번들 데이터에서 "고른 지역을 그때 조회한 결과"로
 * 바뀌었으므로(App.tsx의 지역 선택 위자드), 지역을 전제하는 테스트는
 * 이 경계를 붙들어야 한다 — 실제 네트워크는 `src/no-network.test.ts`가
 * 금지한다.
 */
function mockRegionQuery(
  units: readonly ComplexUnit[],
  isRegulatedArea: boolean | null,
) {
  return vi
    .spyOn(regionQuery, "fetchRegionComplexes")
    .mockResolvedValue({ units: [...units], isRegulatedArea, dataAsOf: null });
}

/** 지역 선택 위자드에서 시도·시군구를 고르고 조회를 누른다 */
async function selectRegion(sido: string, sigungu: string) {
  await userEvent.selectOptions(screen.getByLabelText("광역단체"), sido);
  await userEvent.selectOptions(screen.getByLabelText("자치구"), sigungu);
  await userEvent.click(
    screen.getByRole("button", { name: "이 지역으로 조회하기" }),
  );
}

/**
 * 화면 1(입력)로 돌아간다.
 *
 * Task 3에서 화면이 갈리며 `RegionSelect`는 "입력" 화면 전용이 됐다 —
 * 지역 조회가 한 번 성공하면 화면은 "결과"로 넘어가고 "입력" 화면은
 * 시각적으로 숨는다(`EntryScreen`). 이미 지역을 한 번 조회한 뒤 **다른
 * 지역을 다시 조회**하려면 먼저 이 버튼으로 "입력" 화면에 돌아와야
 * `selectRegion`이 다시 그 select들을 찾을 수 있다.
 */
async function backToEntry() {
  await userEvent.click(
    screen.getByRole("button", { name: "조건 다시 넣기" }),
  );
}

/** 그 지역에서 가장 싼 평형 몇 개 — 2억 예산으로도 목록에 뜨는 것들 */
function cheapestIn(regionCode: string, count: number): ComplexUnit[] {
  return COMPLEX_UNITS.filter((u) => u.regionCode === regionCode)
    .slice()
    .sort((a, b) => a.maxPrice - b.maxPrice)
    .slice(0, count);
}

/** 화면에 그려진 부담률(%)을 숫자로 읽는다. */
function readRatio(): number {
  const text =
    document.querySelector('[data-field="ratio"]')?.textContent ?? "";
  return Number(text.replace("%", ""));
}

/**
 * formatWon이 그리는 "6억 4,000만원"·"65만 434원" 같은 한국식 표기를
 * 원 단위 숫자로 되돌린다.
 *
 * 단순히 숫자만 남기고 이어 붙이면("만"·"억" 단위 앞뒤 숫자를 그냥
 * 문자열로 합치면) 두 가지 방식으로 자릿수가 틀어진다.
 *
 * 1. "6억 4,000만원"에서 "6"과 "4000"을 이어 붙이면 "64000"이 되어
 *    6억4000만이 아니라 6만4000처럼 읽힌다.
 * 2. "65만 434원"에서 "65"와 "434"를 그냥 이어 붙이면 "65434"가 되는데,
 *    실제 값은 65×10,000+434=650,434다 — "만" 아래 나머지가 1,000원
 *    미만이라 자리수가 짧게 찍힐 때(예: 434원, 4자리를 못 채움) 앞자리가
 *    씹힌다. 이 버그는 실제로 한 번 재현됐다: 월 상환액이 마침 이 모양이
 *    되는 조건(전용면적 기본값을 84→86으로 고치며 affordablePrice가
 *    바뀐 결과)에서 "슬라이더를 내리면 월 상환액이 줄어든다" 테스트가
 *    650,434를 65,434로 잘못 읽어 실패했다 — 계산이 아니라 이 파서가
 *    틀렸었다.
 *
 * 그래서 억·만·원 단위별로 정규식을 따로 매치해 자릿값을 곱해 더한다.
 */
function parseFormattedWon(text: string): number {
  if (text.trim() === "" || text.trim() === "0원") return 0;

  let total = 0;
  const eok = text.match(/([\d,]+)억/)?.[1];
  if (eok !== undefined) total += Number(eok.replace(/,/g, "")) * 100_000_000;
  const man = text.match(/([\d,]+)만/)?.[1];
  if (man !== undefined) total += Number(man.replace(/,/g, "")) * 10_000;
  // "원" 바로 앞에 숫자가 있고, 그 앞이 "만"이 아닌 경우만 나머지(1만원
  // 미만) 단위다. "…만원"처럼 "만"에 "원"이 곧바로 붙은 경우는 제외한다.
  const rest = text.match(/(?:^|\s)([\d,]+)원$/)?.[1];
  if (rest !== undefined) total += Number(rest.replace(/,/g, ""));

  return total;
}

/** 화면에 그려진 월 상환액을 원 단위 숫자로 읽는다. */
function readPayment(): number {
  const text =
    document.querySelector('[data-field="payment"]')?.textContent ?? "";
  return parseFormattedWon(text);
}

/**
 * 화면에 그려진 실구매 가능 가격을 원 단위 숫자로 읽는다.
 *
 * 예전엔 예산 상세 패널 안의 헤드라인 카드(`.affordable-price`)를
 * 읽었다 — 사용자 지시로 그 카드가 없어졌다(상단바와 중복이었다).
 * 이제 이 값을 보여주는 유일한 자리는 상단바다
 * (`.result-topbar-item-value--money`, 이 앱에서 `emphasis`를 쓰는
 * 유일한 요약 항목이라 선택자가 겹칠 일이 없다).
 */
function readAffordablePrice(): number {
  const text =
    document.querySelector(".result-topbar-item-value--money")?.textContent ??
    "";
  return parseFormattedWon(text);
}

/**
 * 인쇄 요약(`PrintSummary`, 화면에서는 숨어 있고 DOM에는 있다)의 한 줄을
 * 읽는다.
 *
 * 사용자 지시로 화면의 "계산 전제" 문구 덩어리(구 `AssumptionLine`)가
 * 삭제된 뒤로, 기존 대출·규제지역 판정 여부 같은 가정 사실을 확인할 수
 * 있는 자리는 이 요약 하나뿐이다 — `PrintSummary`는 같은 원본(`state`)에서
 * 읽으므로 지금도 사실 그대로다.
 */
function printValueOf(label: string): string | null {
  const rows = document.querySelectorAll(".print-summary dl > div");
  for (const row of rows) {
    if (row.querySelector("dt")?.textContent === label) {
      return row.querySelector("dd")?.textContent ?? null;
    }
  }
  return null;
}

describe("예산 계산기 통합", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("필수값을 채우기 전에는 결과를 그리지 않는다", () => {
    render(<App />);
    expect(screen.queryByText("실구매 가능 가격")).not.toBeInTheDocument();
    expect(
      screen.getByText(/현금·연 소득·주택 수를 알려주면/),
    ).toBeInTheDocument();
  });

  /**
   * 주택 수(무주택이세요?)·생애최초는 사용자 지시로 다시 화면 1의 실제
   * 질문이 됐다 — cash·annualIncome과 같은 자리에 서므로 답하지 않으면
   * 결과가 뜨지 않는다(`ProfileFormState.ownedHomeCount` 참고).
   *
   * 남은 진짜 가정은 기존 대출뿐이다. 그 가정은 낙관 방향이므로(기존
   * 대출이 없으면 DSR 여력이 그대로 남아 한도가 커진다) 그 사실이
   * 반드시 어딘가에 남아 있어야 한다 — 화면의 "계산 전제" 문구 덩어리
   * (구 `AssumptionLine`)는 사용자 지시로 삭제됐지만, 같은 사실이
   * `PrintSummary`(인쇄 요약, DOM에는 항상 있다)에 그대로 남는다.
   */
  it("현금·소득·주택 수를 넣으면 결과가 나오고, 기존 대출 가정이 인쇄 요약에 남는다", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "10000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    expect(
      screen.queryByText(/현금·연 소득·주택 수를 알려주면/),
    ).not.toBeInTheDocument();

    // 상단바의 트리거 버튼으로 찾는다 — 예산 상세 패널을 여는 그
    // 자리가 "실구매 가능 가격"의 유일한 출처다(헤드라인 카드는
    // 사용자 지시로 없앴다 — 상단바와 중복이었다).
    expect(
      screen.getByRole("button", { name: /실구매 가능 가격/ }),
    ).toBeInTheDocument();

    expect(printValueOf("기존 대출(연간 상환액)")).toBe("없음 (가정)");
  });

  /**
   * 무주택 가정이 **실제 계산에도** 그대로 들어간다 — 문구만 적고 다른
   * 값을 넘기면 화면이 두 말을 하게 된다. 무주택이면 보금자리론 자격이
   * 열린다는 사실로 확인한다.
   */
  it("무주택 가정이 정책대출 자격에 실제로 반영된다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "5000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
    expect(screen.getByText("보금자리론")).toBeInTheDocument();
  });

  /**
   * 취득세는 주택 수를 반영하지 못한다 — `calcAcquisitionCosts`는
   * 항상 무주택 기준 세율로 계산한다(acquisition-cost.ts). 사용자 지시로
   * 부대비용 카드의 취득세 고지를 "무주택 기준, 다주택인 경우 달라질
   * 수 있음" 정도로 짧게 요약했다 — 실제 계산이 답과 무관하게 항상
   * 같으므로, 문구도 답에 따라 갈리지 않는 **고정 문구**가 됐다(예전의
   * 두 긴 문구는 `PriceCheck`가 여전히 쓴다).
   */
  it("부대비용 카드의 취득세 고지는 짧은 계산 기준 문구다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "5000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    expect(
      screen.getByText(/무주택 기준으로 계산했어요\. 다주택이면 세율이 달라질 수 있어요/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(financeRules.acquisitionTax.householdCountNote),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(financeRules.acquisitionTax.householdCountNoteNoHome),
    ).not.toBeInTheDocument();
  });

  it("현금과 소득을 넣으면 결과와 슬라이더가 나타난다", async () => {
    const { container } = render(<App />);

    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "10000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    // 위와 같은 이유로 트리거 버튼으로 찾는다(상단바 요약이 같은 라벨을 쓴다).
    expect(
      screen.getByRole("button", { name: /실구매 가능 가격/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
    // 대출 한도 카드의 네 가지 한도 표에 "무엇이 결정됐는지"가
    // `data-active`로 표시된다 — 제약별 제목 문장(구 "…걸렸어요")은
    // 사용자 지시로 없앴다.
    expect(
      container.querySelector('.binding-limit-table [data-active="true"]'),
    ).not.toBeNull();
  });

  it("슬라이더를 내리면 월 상환액과 부담률이 줄어든다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "10000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    const slider = screen.getByRole("slider");
    // SEED 썸은 <div role="slider">라 네이티브 max 속성이 없다 —
    // aria-valuemax로 범위를 읽는다.
    const max = Number(slider.getAttribute("aria-valuemax"));
    expect(max).toBeGreaterThan(0);

    const ratioAtMax = readRatio();
    const paymentAtMax = readPayment();

    // SEED Slider는 값이 배열인 커스텀 위젯이라 네이티브 <input type=range>처럼
    // fireEvent.change로 값을 바꿀 수 없다 — 키보드 상호작용(Home = 최솟값으로)이
    // 실제 사용자가 슬라이더를 내리는 것과 같은 경로(useSlider의 onKeyDown)를 태운다.
    fireEvent.keyDown(slider, { key: "Home" });

    expect(readRatio()).toBeLessThan(ratioAtMax);
    expect(readPayment()).toBeLessThan(paymentAtMax);
  });

  it("최대치에서는 그것이 한계라는 경고가 뜬다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "10000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    expect(
      screen.getByText(/빌릴 수 있는 한계예요\. 무리 없는 선은 따로 있어요/),
    ).toBeInTheDocument();
  });

  it("입력이 localStorage에 남아 새로고침 후 복원된다", async () => {
    const { unmount } = render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    unmount();

    render(<App />);
    // 입력란 표시는 만원 단위에 셋째 자리마다 쉼표다(사용자 지시,
    // `MoneyInput`의 `toText`) — 저장된 값은 여전히 원 단위 2억이다.
    expect(screen.getByLabelText(/얼마 있어요/)).toHaveValue("20,000");
  });

  /**
   * 폼에서 엔진을 거쳐 화면 숫자까지 이어지는 유일한 종단 검증.
   *
   * ⚠ **규제지역 체크박스는 사라졌다**(스펙 §2) — 이제 그 값을 정하는
   * 것은 **지역 조회의 자동 판정**이다. 그래서 검증 경로도 바뀌었다:
   * 비규제로 판정된 지역을 조회하면 LTV 한도가 40% → 70%로 올라
   * 실구매력이 오른다. 체크박스를 없앤 대신 그 축이 죽지 않았다는 것을
   * 화면 숫자로 직접 확인하는 자리다.
   */
  it("지역이 비규제로 판정되면 실구매력이 올라간다", async () => {
    mockRegionQuery(cheapestIn("11680", 3), true);

    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "10000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    const priceBefore = readAffordablePrice();
    expect(priceBefore).toBeGreaterThan(0);

    const spy = mockRegionQuery(cheapestIn("11680", 3), false);
    await selectRegion("서울특별시", "강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    expect(spy).toHaveBeenCalled();

    expect(printValueOf("규제지역 여부")).toBe("비규제지역 (지역 판정)");
    expect(readAffordablePrice()).toBeGreaterThan(priceBefore);
  });

  /**
   * 규제지역 여부의 **근거**가 바뀌었다. 예전에는 화면이 고른 지역 코드를
   * 번들의 `rules.regulatedRegionCodes`와 대조했고, 지금은 조회 응답이
   * 그 사실을 함께 실어 온다. 어느 쪽이든 이 테스트가 지키는 것은 같다 —
   * 근거가 "모르니까 안전하게 규제지역"에서 "당신이 고른 지역이라서
   * 규제지역"으로 바뀌는 순간, 그것은 더 이상 가정이 아니다.
   */
  it("지역을 고르면 인쇄 요약이 '가정'에서 '지역 판정'으로 바뀐다", async () => {
    mockRegionQuery(cheapestIn("11680", 3), true);

    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "6000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");

    await selectRegion("서울특별시", "강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    expect(printValueOf("규제지역 여부")).toBe("규제지역 (지역 판정)");
  });

  /**
   * 위 테스트의 대조군(symmetric case) — 응답의 `isRegulatedArea`가
   * `true`가 아니라 `null`이면 조회 전부터 있던 규제지역 가정이 조회가
   * 끝난 뒤에도 **가정인 채로 남아야** 한다. null을 false로 오인해
   * 프로필을 덮어쓰면 안 된다.
   *
   * 지금 백엔드(`resolveIsRegulated`)는 성공 응답에서 이 null을 내지
   * 않는다 — `regulated` 목록에 없으면 확정 `false`(비규제)를 낸다.
   * 그래도 `RegionComplexesResult.isRegulatedArea`의 타입은 여전히
   * `boolean | null`이다(`regionQuery.ts`) — 이 테스트는 그 계약이
   * 실제로 null을 보내는 경우(오래된 배포판 등) 화면이 함부로 확정
   * 짓지 않는지를 지키는 방어 테스트다.
   */
  it("API가 규제지역 여부로 null을 보내면 규제지역 가정이 가정으로 남는다", async () => {
    mockRegionQuery(cheapestIn("11680", 3), null);

    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "6000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");

    await selectRegion("서울특별시", "강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // null이었으므로 프로필의 isRegulatedArea는 확정되지 않았다 —
    // 인쇄 요약이 여전히 "(가정)"이다.
    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");
  });

  /**
   * 위 두 테스트를 **이어 붙였을 때** 드러나는 결함.
   *
   * 한 지역을 먼저 조회하면 규제지역 값이 확정되어 가정 문구에서
   * 빠진다. 그 다음 API가 null을 보내는 지역을 조회했을 때 값을 손대지
   * 않고 두면, 새 지역의 화면이 앞 지역의 값을 **확정 지위까지**
   * 물려받는다 — 이번 응답이 아무것도 확인해 주지 않았는데 화면은 더
   * 이상 그것을 가정이라고 말하지 않는다.
   */
  it("확정된 지역 다음에 API가 null을 보내는 지역을 조회하면 규제지역이 다시 가정으로 돌아간다", async () => {
    const spy = mockRegionQuery(cheapestIn("11680", 3), true);

    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "6000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    // 아는 지역: 규제지역으로 확정되어 인쇄 요약이 "(지역 판정)"이 된다.
    await selectRegion("서울특별시", "강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    expect(printValueOf("규제지역 여부")).toBe("규제지역 (지역 판정)");

    // 모르는 지역: 확정할 근거가 없다.
    spy.mockResolvedValue({
      units: [...cheapestIn("11650", 3)],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    await backToEntry();
    await selectRegion("서울특별시", "서초구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 가정으로 되살아나야 한다 — 앞 지역의 확정이 이 지역까지 따라오면
    // 안 된다.
    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");
  });

  /**
   * 위 두 테스트의 또 다른 변주 — 이번엔 뒤 지역이 "모르는 지역(null)"이
   * 아니라 **조회 자체가 실패**(status: "error")하는 경우다.
   *
   * 아는 지역을 먼저 조회하면 규제지역 값이 확정되어 가정 문구에서
   * 빠진다. 그 다음 지역 조회가 실패하면, 이번 조회는 이 지역에 대해
   * 아무것도 확인해 주지 못했다 — 그런데도 앞 지역의 확정값이 화면에
   * 남으면 "새 지역도 규제지역"이라는 확정 사실을 실제로는 아무도
   * 검증하지 않은 채 말하는 셈이 된다.
   */
  it("아는 지역 다음에 조회가 실패하면 규제지역이 다시 가정으로 돌아간다", async () => {
    const spy = mockRegionQuery(cheapestIn("11680", 3), true);

    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "6000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    // 아는 지역: 규제지역으로 확정되어 인쇄 요약이 "(지역 판정)"이 된다.
    await selectRegion("서울특별시", "강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    expect(printValueOf("규제지역 여부")).toBe("규제지역 (지역 판정)");

    // 다음 지역 조회는 실패한다 — 이 지역에 대해 아무것도 알아내지 못했다.
    spy.mockRejectedValueOnce(new Error("네트워크 오류"));
    await backToEntry();
    await selectRegion("서울특별시", "서초구");
    await screen.findByText(/불러오지 못했어요/);

    // 가정으로 되살아나야 한다 — 앞 지역의 확정이 실패한 조회까지 그대로
    // 따라오면 안 된다.
    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");
  });

  /**
   * 예전에는 번들에 실린 전체 목록을 클라이언트에서 걸러 "그 지역만"
   * 남겼다. 지금은 목록 자체가 그 지역을 조회한 결과다 — 그래서 검사도
   * "줄었는가"(옛 필터의 부수효과)가 아니라 **"고른 지역의 결과만
   * 나오는가"**를 직접 본다.
   */
  it("목록은 고른 지역을 조회한 결과만 보여 준다", async () => {
    const 강남 = cheapestIn("11680", 3);
    const 서초 = cheapestIn("11650", 3);
    expect(강남.length).toBe(3);
    expect(서초.length).toBe(3);

    const spy = mockRegionQuery(강남, true);

    render(<App />);
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "6000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    await selectRegion("서울특별시", "강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 고른 지역 코드만 서버로 간다(부제가 약속하는 바로 그것이다).
    expect(spy).toHaveBeenCalledWith("11680", null);

    const 강남단지 = 강남[0]?.complexName ?? "";
    const 서초단지 = 서초[0]?.complexName ?? "";
    expect(강남단지).not.toBe(서초단지);

    expect(screen.getByText(강남단지)).toBeInTheDocument();
    expect(screen.queryByText(서초단지)).not.toBeInTheDocument();

    // 대조군: 서초구를 조회하면 그 단지가 실제로 목록에 뜬다 — 위에서
    // 빠진 이유가 예산이 아니라 "그 지역 조회 결과가 아니어서"임을
    // 못박는다.
    spy.mockResolvedValue({ units: [...서초], isRegulatedArea: true, dataAsOf: null });
    await backToEntry();
    await selectRegion("서울특별시", "서초구");
    await screen.findByText(서초단지);

    expect(screen.queryByText(강남단지)).not.toBeInTheDocument();
  });
});

/**
 * ⚠ **저장된 상태를 실제로 심고 시작하는 유일한 스위트다.**
 *
 * 나머지 스위트는 전부 `beforeEach`에서 localStorage를 지우고 빈
 * 저장소로 시작한다. 그래서 "저장본이 이번 세션에 무엇을 되살리는가"는
 * 전체 스위트 중 어느 것도 보지 않는 축이었고, 리뷰가 실제 브라우저에서
 * 잡은 결함(저장된 규제지역 **판정**이 지역을 고르지도 않은 세션에서
 * 사실로 다시 주장됨)이 그 틈으로 통과했다.
 *
 * 여기서만 `setItem`으로 저장본을 심는다. 심는 값은 리뷰가 브라우저에서
 * 재현한 그것과 같다.
 */
describe("저장본에서 시작하는 세션", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  /** 리뷰가 브라우저에서 재현한 저장본을 그대로 심는다. */
  function seedStoredState(overrides: Record<string, unknown> = {}) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cash: 200_000_000,
        annualIncome: 100_000_000,
        // 주택 수는 사용자 지시로 다시 필수값이 됐다 — 빠지면
        // toProfile이 null을 돌려주고 이 블록의 렌더 전제(결과 화면이
        // 바로 뜬다) 자체가 깨진다.
        ownedHomeCount: 0,
        isRegulatedArea: true,
        touched: ["regulatedArea"],
        ...overrides,
      }),
    );
  }

  /**
   * 마운트 시점에는 **불러온 지역이 없다**(상단바에 지역 줄조차 없다).
   * 판정은 불러온 지역에 매인 사실이므로, 지역이 없는 세션에서 그 판정을
   * 되살리면 화면이 이름도 대지 못하는 지역에 대해 단정하게 된다.
   */
  it("저장된 판정을 화면이 사실로 다시 주장하지 않는다", () => {
    seedStoredState();
    render(<App />);

    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");
  });

  it("종이도 저장된 판정을 '(지역 판정)'으로 찍지 않는다", () => {
    seedStoredState();
    render(<App />);

    expect(printValueOf("규제지역 여부")).toBe("규제지역 (가정)");
  });

  /**
   * 방향까지 잠근다. 저장된 `false`(비규제)가 살아남으면 LTV가 40%가
   * 아니라 70%로 계산돼 헤드라인이 **부풀려진다** — 사용자가 이번 세션에
   * 지역을 고르지도 않았고, 그 값을 볼 입력란도 없다.
   */
  it("저장된 비규제 판정이 헤드라인을 부풀리지 않는다", () => {
    seedStoredState({ isRegulatedArea: false });
    const { unmount } = render(<App />);
    const priceFromStored = readAffordablePrice();
    unmount();

    window.localStorage.clear();
    seedStoredState({ isRegulatedArea: true, touched: [] });
    render(<App />);

    expect(priceFromStored).toBeGreaterThan(0);
    expect(priceFromStored).toBe(readAffordablePrice());
  });
});
