import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ZERO_BUDGET_HEADLINE } from "./components/BudgetResult";
import type { ComplexUnit } from "./data/complexes";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import * as loadNaverMaps from "./lib/loadNaverMaps";
import * as regionQuery from "./lib/regionQuery";
import { BODY_SCROLL_LOCK_CLASS } from "./print/bodyScrollLock";
import {
  MUST_SURVIVE_PRINT_CLASSES,
  PRINT_HIDDEN_SELECTORS,
} from "./print/hiddenInPrint";
import { rules } from "./state/useAffordability";
import { purchaseRules } from "./state/usePurchaseCheck";
import { PURCHASE_TYPE_STORAGE_KEY } from "./state/usePurchaseType";
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
 * 번거롭다 — 작고 예측 가능한 값 하나만 조회 결과로 돌려준다.
 *
 * **예전에는 `vi.mock("./data/complexes")`로 번들 데이터 자체를 갈아
 * 끼웠다.** 지금은 화면이 그 번들에서 목록을 만들지 않는다 — 사용자가
 * 고른 지역을 그때 조회한 결과로 만든다(App.tsx의 지역 선택 위자드).
 * 그래서 갈아 끼울 자리도 모듈이 아니라 그 조회 경계
 * (`lib/regionQuery`의 `fetchRegionComplexes`) 하나다.
 */
const DETAIL_TEST_UNIT: ComplexUnit = {
  complexKey: "11680|테스트동|2015|테스트단지",
  complexName: "테스트단지",
  regionCode: "11680",
  legalDongName: "테스트동",
  builtYear: 2015,
  // 85㎡ 초과로 둔다 — 가정 전용면적 기본값(85㎡, 농특세 미부과)과
  // 다른 세율 구간이어야 상세를 열었을 때 실구매 가능 가격이 실제로
  // 달라진다(아래 "상세가 열린 동안에는..." 테스트 참고). 85㎡
  // 이하였다면 둘 다 농특세 미부과 구간이라 같은 값이 나와 그 테스트가
  // 아무것도 증명하지 못한다.
  areaBucket: 90,
  maxExclusiveAreaSqm: 90,
  landLeasehold: "N",
  tradeCount: 3,
  minPrice: 190_000_000,
  maxPrice: 210_000_000,
  minFloor: 3,
  maxFloor: 18,
  unknownFloorCount: 0,
  lowConfidence: false,
};

/**
 * 지역을 고르고 그 결과로 {@link DETAIL_TEST_UNIT} 하나를 받는다.
 *
 * `isRegulatedArea`는 `null`("모르는 지역")로 둔다. 불리언을 주면 App이
 * 그 값을 폼에 반영하면서 규제지역이 **가정에서 확정으로** 바뀌는데,
 * 아래 테스트들은 전용면적 가정·상세 화면·인쇄 요약을 보는 것이라 그
 * 축과 무관하다 — 예전 흐름에서도 규제지역은 가정인 채였다.
 */
async function selectTestRegion() {
  vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
    units: [DETAIL_TEST_UNIT],
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

describe("App - 지역 선택 위자드", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("예산을 확정하기 전에는 지역 선택 단계가 보이지 않는다", () => {
    render(<App />);
    expect(screen.queryByRole("region", { name: "지역 선택" })).not.toBeInTheDocument();
  });

  it("현금·소득을 입력하면 지역 선택 단계가 나타난다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));
    expect(screen.getByRole("region", { name: "지역 선택" })).toBeInTheDocument();
  });

  /*
   * 브리프의 위 두 테스트만으로는 RED가 서지 않는다 — 옛 `RegionFilter`도
   * 같은 예산 게이트 **안**에 있었고 `aria-label`도 "지역 선택"으로 같았다.
   * 위자드가 실제로 바뀐 지점은 두 가지다: (1) 지역을 3개 고정 체크박스가
   * 아니라 전국 2단 선택으로 고른다, (2) 지역을 확정해 **조회하기 전에는
   * 단지 목록이 아예 없다**. 옛 흐름은 예산만 확정되면 번들에 실린 전체
   * 목록을 곧바로 보여줬다 — 사용자가 지역을 고르지 않았는데도.
   */
  it("지역 선택 단계는 전국 2단 선택이고, 조회 전에는 단지 목록이 없다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));

    expect(screen.getByLabelText("광역단체")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "살 수 있는 단지" }),
    ).not.toBeInTheDocument();
  });
});

/**
 * 조회의 네 상태(idle·loading·error·success)가 화면에서 **서로 다른
 * 말**을 하는지 잠근다.
 *
 * 이 블록에서 가장 중요한 것은 마지막 두 테스트다. "이 지역엔 실거래가
 * 자체가 없다"와 "이 예산으로 살 수 있는 단지가 없다"는 원인이 다르고
 * 사용자가 할 일도 다르다(지역을 바꾼다 / 예산을 바꾼다). 이 둘을 같은
 * 문구로 보여주면 우리가 모르는 것(그 지역 데이터)을 확인한 것(예산
 * 부족)처럼 말하게 된다 — 이 앱이 가장 경계하는 오류다.
 *
 * 실제로 이 계획의 초안이 그 결함을 품고 있었다. `ComplexList`의
 * `emptyBecauseOfFilter`에 이 구분을 맡기려 했는데, 그 값은
 * `shown.length === 0 && units.some(affordable)`이라 `regionCodes: []`를
 * 넘기는 순간 **구조적으로 항상 false**가 된다(`shown`이 곧
 * `units.filter(affordable)`이 되어 두 조건이 동시에 참일 수 없다).
 * 그래서 App이 `units.length === 0`을 `buildComplexList`에 넘기기
 * **전에** 직접 가른다. 아래 두 테스트가 그 배선을 화면 문구로 못박는다.
 */
describe("App - 지역 조회의 네 상태", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function fillProfile() {
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));
  }

  async function chooseRegion() {
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
  }

  it("조회하는 동안에는 조회 중이라고 말한다", async () => {
    // 끝나지 않는 약속 — loading 상태에 머문다.
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockReturnValue(
      new Promise(() => {}),
    );

    render(<App />);
    await fillProfile();
    await chooseRegion();

    expect(screen.getByText(/조회하고 있어요/)).toBeInTheDocument();
    // 아직 아무 답도 하지 않았으므로 목록도, 0건 안내도 없다.
    expect(
      screen.queryByRole("region", { name: "살 수 있는 단지" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/실거래가 자체가 없어요/)).not.toBeInTheDocument();
  });

  it("조회에 실패하면 실패했다고 말하고, 다시 시도할 수 있다", async () => {
    const spy = vi
      .spyOn(regionQuery, "fetchRegionComplexes")
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValueOnce({ units: [DETAIL_TEST_UNIT], isRegulatedArea: null, dataAsOf: null });
    // 재시도가 성공한 뒤 목록이 뜨면 지도용 좌표 조회가 이어서 돈다 —
    // 테스트가 실 네트워크로 나가지 않게 고정한다. 아래 단언은 목록
    // 조회 실패 문구를 **그대로** 찾으므로, 좌표 조회가 어떻게 끝나든
    // 문구가 겹치지는 않는다(셋 다 원인별로 다른 문구다).
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [],
      partialFailureCount: 0,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByText("지금 실거래가를 불러오지 못했어요.");
    // **실패를 "결과 0건"으로 보여주지 않는다.** 둘을 뭉치면 데이터가
    // 없는 지역이라고 잘못 말하게 된다.
    expect(screen.queryByText(/실거래가 자체가 없어요/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "살 수 있는 단지" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await screen.findByRole("region", { name: "살 수 있는 단지" });
    expect(
      screen.queryByText("지금 실거래가를 불러오지 못했어요."),
    ).not.toBeInTheDocument();
    // 재시도는 같은 지역 코드로 다시 묻는다.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(2, "11680", null);
  });

  it("그 지역에 실거래가가 0건이면 지역을 바꾸라고 말한다(예산 탓으로 돌리지 않는다)", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByText(/실거래가 자체가 없어요/);
    expect(screen.getByText(/다른 지역을 선택해 보세요/)).toBeInTheDocument();

    // 예산을 원인으로 지목하는 문구는 나오면 안 된다 — 우리는 이 지역의
    // 예산 적합성을 판단한 적이 없다.
    expect(
      screen.queryByText(/살 수 있는 단지가 이 데이터에는 없어요/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/지역을 넓혀 보세요/)).not.toBeInTheDocument();
  });

  it("거래는 있는데 예산이 안 맞으면 예산이 원인이라고 말한다(대조군)", async () => {
    // 500억짜리 평형 하나 — 15억 현금으로는 살 수 없다.
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [
        {
          ...DETAIL_TEST_UNIT,
          minPrice: 50_000_000_000,
          maxPrice: 50_000_000_000,
        },
      ],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByRole("region", { name: "살 수 있는 단지" });

    expect(
      screen.getByText(/살 수 있는 단지가 이 데이터에는 없어요/),
    ).toBeInTheDocument();
    // 데이터가 없다고 말하지 않는다 — 거래는 있었고, 예산이 안 맞았다.
    expect(screen.queryByText(/실거래가 자체가 없어요/)).not.toBeInTheDocument();
    // 지역을 이미 하나로 확정한 뒤라 "넓혀 보라"는 조언은 성립하지 않는다.
    expect(screen.queryByText(/지역을 넓혀 보세요/)).not.toBeInTheDocument();
  });
});

/**
 * 행정동으로 좁히는 `<select>`("행정동으로 좁히기")를 잠근다.
 *
 * 이 좁히기는 지역 조회 결과 **안**에서 한 번 더 거르는 필터라, 위
 * "지역 조회의 네 상태" 블록이 지키는 것과 원인이 같은 종류의 오류를
 * 한 단계 아래서 반복할 수 있다 — 동을 하나로 좁혔는데 그 동엔 예산이
 * 안 맞아 결과가 0개인 경우, 진짜 원인은 "이 동을 골라서"인데 화면이
 * `ComplexList`의 기본 문구("현금이 더 있으면 선택지가 생겨요")를
 * 그대로 보여주면 예산 탓으로 잘못 돌리게 된다. 세 번째 테스트가 바로
 * 그 결함을 잠근다.
 */
describe("App - 행정동으로 좁히기", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 두 행정동에 걸쳐 단지가 있는 조회 결과. 둘 다 예산 안에 든다 */
  const DONG_A_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|A동|2015|A동단지",
    complexName: "A동단지",
    legalDongName: "A동",
  };
  const DONG_B_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|B동|2015|B동단지",
    complexName: "B동단지",
    legalDongName: "B동",
  };
  /** B동에만 있는, 예산으로는 절대 못 사는 단지(B동을 고르면 0건이 된다) */
  const DONG_B_UNAFFORDABLE_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|B동|2015|B동비싼단지",
    complexName: "B동비싼단지",
    legalDongName: "B동",
    minPrice: 50_000_000_000,
    maxPrice: 50_000_000_000,
  };

  async function fillProfile() {
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));
  }

  async function chooseRegion() {
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
  }

  it("조회 결과에 행정동이 둘 이상이면 좁히기 select가 그 동들로 나타난다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    const select = screen.getByLabelText("행정동으로 좁히기");
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "전체" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "A동" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "B동" })).toBeInTheDocument();
  });

  it("행정동을 하나로 좁히면 그 동의 단지만 목록에 남는다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 좁히기 전에는 두 동의 단지가 모두 보인다.
    expect(screen.getByText("A동단지")).toBeInTheDocument();
    expect(screen.getByText("B동단지")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("행정동으로 좁히기"),
      "A동",
    );

    expect(screen.getByText("A동단지")).toBeInTheDocument();
    expect(screen.queryByText("B동단지")).not.toBeInTheDocument();
  });

  /**
   * 목록의 신선도 문구는 **이 조회가 실제로 반영한 계약월**이어야 한다.
   *
   * 예전에는 번들 매니페스트의 정적 상수(`DATA_AS_OF`)를 그대로 넘겼다.
   * 그 값은 옛 배치 파이프라인이 특정 3개 구를 돌린 시점의 것이라, 전국
   * 아무 지역이나 그때그때 조회하는 지금 목록에 대해서는 우리가 확인한
   * 적 없는 값이다 — 그런데 화면은 그것을 "{dataAsOf} 계약분까지
   * 반영했어요"라는 사실 서술로 그린다.
   */
  it("신선도 문구는 조회가 실제로 반영한 계약월을 말한다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2031-04",
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    expect(screen.getByText(/2031-04 계약분까지 반영했어요/)).toBeInTheDocument();
  });

  /**
   * 모르면 말하지 않는다. 조회에 거래가 한 건도 없었으면 기준월을 낼
   * 대상이 없는데, 그 자리를 오늘 날짜나 옛 상수로 메우면 근거를 실제보다
   * 튼튼해 보이게 하는 오표기가 된다.
   */
  it("조회가 기준월을 모르면(null) 신선도 문구를 아예 쓰지 않는다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    expect(screen.queryByText(/계약분까지 반영했어요/)).not.toBeInTheDocument();
  });

  /**
   * 이 fix가 고치는 바로 그 버그. 고쳐지기 전에는 이 상황에서
   * `ComplexList`의 기본 빈 문구("현금이 더 있으면 선택지가 생겨요")가
   * 그대로 나왔다 — 이 동을 골라서 0건이 된 것인데 예산 탓으로 잘못
   * 말한 것이다. 아래 단언 중 "지역 0건" 문구가 없다는 것과 "동 0건"
   * 문구가 있다는 것 둘 다, 고치기 전 코드에서는 후자가 실패한다
   * (그 문구 자체가 없었으므로) — 이 테스트가 그 결함을 잡아낸다.
   */
  it("좁힌 동에 예산이 맞는 단지가 없으면 동 탓이라고 말한다(지역 탓·예산 탓으로 돌리지 않는다)", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNAFFORDABLE_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 전제 확인: 좁히기 전에는 A동 단지가 실제로 보인다 — 이 단언이
    // 없으면 픽스처가 어긋나 목록이 통째로 비어도(즉 진짜 원인이 예산
    // 이어도) 아래 단언이 그대로 통과해 아무것도 증명하지 못한다.
    expect(screen.getByText("A동단지")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("행정동으로 좁히기"),
      "B동",
    );

    // 동 전용 안내가 나온다.
    expect(
      screen.getByText(/이 동엔 조건에 맞는 단지가 없어요/),
    ).toBeInTheDocument();
    expect(screen.getByText(/다른 동을 선택하거나 전체로 넓혀 보세요/)).toBeInTheDocument();

    // 지역 0건 문구(원인이 다르다)는 나오면 안 된다 — 지역 전체는
    // 결과가 있었고(A동), 이번엔 동을 좁혀서 0건이 됐을 뿐이다.
    expect(screen.queryByText(/실거래가 자체가 없어요/)).not.toBeInTheDocument();
    // ComplexList의 기본 예산 부족 문구(오귀속의 근원)도 나오면 안 된다.
    expect(
      screen.queryByText(/살 수 있는 단지가 이 데이터에는 없어요/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/현금이 더 있으면 선택지가 생겨요/)).not.toBeInTheDocument();
  });

  /**
   * 위 fix가 한 단계 덜 갔던 자리.
   *
   * "동 탓" 문구는 **넓히면 달라진다**는 조언을 담고 있다("다른 동을
   * 선택하거나 전체로 넓혀 보세요"). 그런데 지역 전체에도 예산에 맞는
   * 단지가 하나도 없으면 전체로 넓혀도 결과는 똑같은 0건이다 — 그
   * 조언은 사실이 아니고, 진짜 원인(예산)을 가린다. 앞서 고친 것과
   * **같은 종류의 오귀속**을 방향만 뒤집어 반복하는 셈이다.
   *
   * 그래서 동을 걸지 않은 목록도 함께 만들어, 그쪽에 뭔가 있을 때만
   * "동 탓"이라고 말한다. 지역 전체가 0건이면 `ComplexList`의 예산 기반
   * 문구가 그대로 나와야 한다.
   */
  it("지역 전체에도 예산에 맞는 단지가 없으면 동 탓으로 돌리지 않는다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [
        { ...DONG_A_UNIT, minPrice: 50_000_000_000, maxPrice: 50_000_000_000 },
        DONG_B_UNAFFORDABLE_UNIT,
      ],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 전제 확인: 동을 좁히기 전(전체)부터 이미 0건이다.
    expect(
      screen.getByText(/살 수 있는 단지가 이 데이터에는 없어요/),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("행정동으로 좁히기"),
      "A동",
    );

    // 동 탓 문구는 나오면 안 된다 — 전체로 넓혀도 결과가 같으므로
    // "전체로 넓혀 보세요"는 거짓 조언이다.
    expect(
      screen.queryByText(/이 동엔 조건에 맞는 단지가 없어요/),
    ).not.toBeInTheDocument();
    // 진짜 원인(예산)을 말하는 ComplexList의 기존 문구가 그대로 나온다.
    expect(
      screen.getByText(/살 수 있는 단지가 이 데이터에는 없어요/),
    ).toBeInTheDocument();
  });

  /**
   * 위 테스트의 특수한 경우 — 아무것도 못 사는 이유가 "현금이 부족해서"가
   * 아니라 "상환 능력(DSR)이 0이라서"인 경우다. `ComplexList`는 이미 그
   * 둘을 갈라 각각 다른 해법을 말하는데(`noRepaymentCapacity`), 동 탓
   * 문구가 앞에서 가로채면 그 구분이 통째로 사라진다. 지역 전체를 함께
   * 보는 위 수정이 이 경우까지 구조적으로 함께 처리한다.
   */
  it("상환 능력이 0이라 0건이면 동 탓이 아니라 DSR 문구가 나온다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [
        { ...DONG_A_UNIT, minPrice: 50_000_000_000, maxPrice: 50_000_000_000 },
        DONG_B_UNAFFORDABLE_UNIT,
      ],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    // 소득 0 → DSR 한도가 0이 된다(상환 능력 자체가 없다).
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "10000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "0");
    await userEvent.click(screen.getByLabelText("무주택"));
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    await userEvent.selectOptions(
      screen.getByLabelText("행정동으로 좁히기"),
      "A동",
    );

    expect(
      screen.queryByText(/이 동엔 조건에 맞는 단지가 없어요/),
    ).not.toBeInTheDocument();
    // 위 안전선 문구도 같은 말로 시작하므로, ComplexList가 내는 쪽
    // (기존 부채를 줄이라는 해법이 붙은 문장)만 집어 확인한다.
    expect(
      screen.getByText(/살 수 있는 단지가 없어요. 기존 부채를 줄이면 한도가 늘어나요/),
    ).toBeInTheDocument();
  });

  it("지역을 다시 고르면 동 좁히기가 전체로 되돌아간다", async () => {
    const spy = vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    await userEvent.selectOptions(
      screen.getByLabelText("행정동으로 좁히기"),
      "A동",
    );
    expect(screen.queryByText("B동단지")).not.toBeInTheDocument();

    // 같은 지역을 다시 조회한다(예: 다시 시도하거나 재확정하는 상황과
    // 같은 배선 — handleRegionSelect가 selectedDong을 되돌린다).
    //
    // 화면이 갈리면서(Task 3) `RegionSelect`는 이제 "입력" 화면
    // 전용이다 — 지역 조회가 한 번 성공하면 화면은 "결과"로 넘어가고
    // "입력" 화면은 시각적으로 숨는다(`EntryScreen`). 그래서 다시
    // 지역을 고르려면 먼저 "조건 다시 넣기"로 "입력" 화면으로 돌아가야
    // 한다 — 이 재조회 자체가 검사하는 사실(동 좁히기가 전체로
    // 되돌아간다)은 그대로이고, 거기 도달하는 경로만 한 단계 늘었다.
    spy.mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "조건 다시 넣기" }),
    );
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 좁히기가 "전체"로 되돌아갔으므로 두 동의 단지가 다시 모두 보인다.
    expect(screen.getByText("A동단지")).toBeInTheDocument();
    expect(screen.getByText("B동단지")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("행정동으로 좁히기") as HTMLSelectElement).value,
    ).toBe("");
  });
});

/**
 * 상세를 연 채 **다른 지역**을 다시 조회하는 경로.
 *
 * 기준 커밋에서는 이 상태에 도달할 수 없었다 — `RegionSelect`가
 * `detail === null` 가지 안에 있어서 상세가 열려 있는 동안에는 지역을
 * 다시 고를 방법 자체가 없었다. Task 3이 `RegionSelect`를
 * `EntryScreen`으로 옮기고 "조건 다시 넣기"를 만들면서 그 경로가 열렸고,
 * `handleRegionSelect`는 다시 검토되지 않았다.
 *
 * 남은 상세는 보기 흉한 잔상이 아니라 **숫자를 틀리게 한다**:
 * `effectiveProfile`이 남은 평형의 `maxExclusiveAreaSqm`를 화면 전체
 * (상단바 실구매 가능 가격·안전선·인쇄 요약)에 계속 대입하고 있어,
 * 사용자가 보고 있지 않은 지역의 단지를 전제로 취득 부대비용이 계산된다.
 * 앞 지역에서 59㎡를 골랐다면 그 오차는 실구매 가능 가격을 **올리는**
 * 쪽 — 이 저장소가 가장 피하는 낙관 편향 방향이다.
 */
describe("App - 상세를 연 채 지역을 다시 조회한다", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 강남구(11680)에서 돌아오는 단지. 90㎡ — 농특세 부과 구간. */
  const GANGNAM_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|강남동|2015|강남단지",
    complexName: "강남단지",
    legalDongName: "강남동",
  };

  /**
   * 서초구(11650)에서 돌아오는 단지. **전용면적이 다르다**(59㎡) —
   * 같으면 상세가 남았는지 여부가 화면 숫자에 드러나지 않아 아래
   * 인쇄 요약 단언이 공허해진다.
   */
  const SEOCHO_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11650|서초동|2015|서초단지",
    complexName: "서초단지",
    regionCode: "11650",
    legalDongName: "서초동",
    areaBucket: 59,
    maxExclusiveAreaSqm: 59,
  };

  async function fillProfile() {
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));
  }

  async function queryRegion(sigungu: string) {
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), sigungu);
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
  }

  it("앞 지역 단지의 상세가 남지 않고, 새 지역의 목록이 보인다", async () => {
    const spy = vi
      .spyOn(regionQuery, "fetchRegionComplexes")
      .mockResolvedValue({
        units: [GANGNAM_UNIT],
        isRegulatedArea: null,
        dataAsOf: null,
      });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [],
      partialFailureCount: 0,
    });

    render(<App />);
    await fillProfile();
    await queryRegion("강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 강남 단지의 상세를 연다.
    await userEvent.click(screen.getByRole("button", { name: /강남단지/ }));
    expect(screen.getByRole("region", { name: "단지 상세" })).toBeInTheDocument();

    // "조건 다시 넣기" → 서초구로 다시 조회한다.
    spy.mockResolvedValue({
      units: [SEOCHO_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "조건 다시 넣기" }));
    await queryRegion("서초구");
    // 조회가 끝난 신호로 **상단바의 지역 이름**을 기다린다 — 목록이
    // 아니라. 지금 코드에서는 사이드바가 상세를 그린 채라 목록이 아예
    // 없고, 목록을 기다리면 실패가 "타임아웃"으로만 보여 무엇이 잘못됐는지
    // 가려진다.
    await screen.findByText("서울특별시 서초구");

    // 상세는 닫혀 있어야 한다 — 앞 지역 단지를 가리키는 화면이다.
    expect(
      screen.queryByRole("region", { name: "단지 상세" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/강남단지/)).not.toBeInTheDocument();
    // 그리고 사용자가 실제로 달라고 한 것 — 서초구 목록 — 이 보인다.
    expect(screen.getByText("서초단지")).toBeInTheDocument();
  });

  it("화면 전체의 전용면적 전제가 앞 지역 단지에 묶여 있지 않다", async () => {
    const spy = vi
      .spyOn(regionQuery, "fetchRegionComplexes")
      .mockResolvedValue({
        units: [GANGNAM_UNIT],
        isRegulatedArea: null,
        dataAsOf: null,
      });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [],
      partialFailureCount: 0,
    });

    const { container } = render(<App />);
    await fillProfile();
    await queryRegion("강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    await userEvent.click(screen.getByRole("button", { name: /강남단지/ }));

    // 상세를 연 동안에는 인쇄 요약이 그 평형의 면적을 "선택한 매물의
    // 실제 면적"이라고 적는다 — 이것이 정상이다(전제).
    expect(
      container.querySelector(".print-summary")?.textContent,
    ).toMatch(/90㎡\s*\(선택한 매물의 실제 면적\)/);

    spy.mockResolvedValue({
      units: [SEOCHO_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "조건 다시 넣기" }));
    await queryRegion("서초구");
    await screen.findByText("서울특별시 서초구");

    // 서초구를 보고 있는데 종이에 강남 단지의 90㎡가 "선택한 매물의 실제
    // 면적"으로 남아 있으면 안 된다.
    const summary = container.querySelector(".print-summary")?.textContent;
    expect(summary).not.toMatch(/선택한 매물의 실제 면적/);
    expect(summary).not.toMatch(/90㎡/);
  });

  it("가정 칩으로 화면 1에 돌아가 다시 조회해도 마찬가지다", async () => {
    // handleOpenAssumption도 phase만 "입력"으로 되돌린다 — 같은 상태에
    // 같은 경로로 닿는다.
    const spy = vi
      .spyOn(regionQuery, "fetchRegionComplexes")
      .mockResolvedValue({
        units: [GANGNAM_UNIT],
        isRegulatedArea: null,
        dataAsOf: null,
      });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [],
      partialFailureCount: 0,
    });

    render(<App />);
    await fillProfile();
    await queryRegion("강남구");
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    await userEvent.click(screen.getByRole("button", { name: /강남단지/ }));
    expect(screen.getByRole("region", { name: "단지 상세" })).toBeInTheDocument();

    // 상단바의 "실구매 가능 가격"을 눌러 예산 상세 패널을 열고, 그 안의
    // 가정 칩으로 화면 1에 돌아간다.
    await userEvent.click(
      screen.getByRole("button", { name: /실구매 가능 가격/ }),
    );
    const chip = screen
      .getAllByRole("button")
      .find((b) => b.className.includes("assumption-item"));
    expect(chip).toBeDefined();
    await userEvent.click(chip!);

    spy.mockResolvedValue({
      units: [SEOCHO_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    await queryRegion("서초구");
    await screen.findByText("서울특별시 서초구");

    expect(
      screen.queryByRole("region", { name: "단지 상세" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("서초단지")).toBeInTheDocument();
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 예산을 확정하고 **지역까지 골라** 목록에 도달한다.
   *
   * 지역 선택은 이번에 새로 낀 단계다. 예전에는 현금·소득·주택 수만
   * 채우면 번들에 실린 목록이 곧바로 떴다 — 아래 테스트들이 보는 것(상세
   * 화면·전용면적 가정·인쇄 요약)은 그대로이고, 거기 도달하는 경로에
   * 한 단계가 늘었을 뿐이다.
   */
  async function fillProfile() {
    // "150000"·"15000"은 단위 없이 쓴 만원 표기다(MoneyInput 기본
    // 해석) — 각각 15억, 1억 5천만원.
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));
    await selectTestRegion();
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

  /**
   * 권리분석 축은 이 앱에서 **영구히** 값이 없다.
   *
   * 등기부 문진이 제거됐고 별도 도구로 다시 만들 예정이라, `App.tsx`는
   * `DiagnosisSummary`에 `rights={null}`만 넘긴다("아직 값이 없을 수도
   * 있다"가 아니라 "영구히 없다" — `src/lib/summary/types.ts` 참고).
   * 그 불변식을 붙잡아 두는 것이 아무것도 없어서, 언젠가 이 자리에
   * 다른 값이 흘러 들어가도 아무도 모른다. 여기서 그 자리를 못박는다:
   * **다른 축이 실제로 채워진 상태에서도** 권리 축만은 "확인 안 함"이다.
   */
  it("권리분석 축은 언제나 '확인 안 함'이다 — App은 rights={null}만 넘긴다", async () => {
    render(<App />);
    await fillProfile();
    // 평형을 골라 호가·입지 축이 실제로 채워진 상태로 만든다 — 그래야
    // "아무 축도 안 채워져서 통과한" 것이 아님이 드러난다.
    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

    const rightsLine = document.querySelector(
      '.diagnosis-summary-axis[data-axis="rights"]',
    );
    expect(rightsLine).not.toBeNull();
    expect(rightsLine?.getAttribute("data-status")).toBe("notLooked");

    const otherStatuses = [...document.querySelectorAll(".diagnosis-summary-axis")]
      .filter((el) => el.getAttribute("data-axis") !== "rights")
      .map((el) => el.getAttribute("data-status"));
    expect(otherStatuses).toHaveLength(3);
    expect(otherStatuses.some((status) => status !== "notLooked")).toBe(true);
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
    expect(screen.getByText(/전용면적 85㎡로 가정하고 계산했어요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

    // 이 평형(전용 90㎡)을 반영했으므로 가정 문구 자체가 더 이상
    // 화면에 없다 — 상세가 열려 있는 동안 areaOverridden이 참이 되어
    // AssumptionLine이 전용면적 항목을 빼기 때문이다.
    expect(screen.queryByText(/전용면적 85㎡로 가정하고 계산했어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/전용면적.*로 가정하고 계산했어요/)).not.toBeInTheDocument();
  });

  it("상세가 열린 동안에는 실구매 가능 가격이 그 평형 기준으로 바뀌고, 목록으로 돌아가면 원래 값으로 되돌아간다", async () => {
    const { container } = render(<App />);
    await fillProfile();

    const priceBefore = container.querySelector(".affordable-price")?.textContent;

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
    const priceWhileOpen = container.querySelector(".affordable-price")?.textContent;
    // 상세가 열려 있는 동안에는 이 평형(전용 90㎡)의 실제 면적 기준으로
    // 다시 계산되므로 원래 가정(85㎡) 기준 가격과 달라야 한다.
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
    // 원래 가정 면적(85㎡) 그대로다.
    expect(screen.getByText(/전용면적 85㎡로 가정하고 계산했어요/)).toBeInTheDocument();

    // 프로필(및 localStorage)에는 상세에서 본 90㎡가 전혀 쓰이지
    // 않았어야 한다 — touched에도 "area"가 없고, 저장된 exclusiveAreaSqm도
    // 원래 가정값(85)이다.
    const stored = JSON.parse(window.localStorage.getItem("budget-profile-v1") ?? "{}");
    expect(stored.touched ?? []).not.toContain("area");
    expect(stored.exclusiveAreaSqm).not.toBe(90);
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
        screen.getByRole("button", { name: /전용면적 85㎡로 가정하고 계산했어요/ }),
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

  /**
   * 리뷰 수정(Critical 2). `AssumptionLine`의 칩은 진짜 `<button>`이고,
   * 문구가 직접 누르라고 지시한다("눌러서 알려주세요"). 그런데 그 클릭이
   * 여는 `ProfileForm`은 이제 `EntryScreen` 안에 있고, `EntryScreen`은
   * `phase === "결과"` 내내 `display: none`이다 — 그리고 이 칩들이 보이는
   * 단계가 바로 그 "결과"뿐이었다. 눌러도 아무 일도 일어나지 않는 버튼이
   * 지시문을 달고 있던 셈이다.
   */
  /**
   * 리뷰 수정(Important 4). `phase === "입력"`일 때 결과 트리는 언마운트되지
   * 않고 불투명한 오버레이 **밑에** 그대로 깔려 있다 — `inert`로 포커스와
   * 접근성 트리 노출을 함께 끊는다. `display: none`이 아니어야 하는 이유는
   * 인쇄다(그 단계에서 인쇄해도 종이에는 나와야 한다).
   */
  /**
   * 리뷰 수정(Important 5). "현금·연소득·주택 수를 알려주면…" 안내는
   * 그 존재 이유인 모든 상태에서 100% 보이지 않는 자리에 있었다 —
   * 실거주 경로에서 그 조건은 사실상 `phase === "입력"`을 뜻하고, 그
   * 동안 결과 트리는 불투명한 오버레이 **밑에** 깔려 있기 때문이다.
   * 현금·소득만 넣고 주택 수를 답하지 않은 사람은 조회 버튼이 그냥
   * 나타나지 않는 것을 보고, 화면 어디에서도 무엇이 모자란지 듣지
   * 못했다.
   */
  describe("리뷰 수정: 무엇이 모자란지 화면 1에서 말한다", () => {
    it("주택 수를 답하지 않으면 그 안내가 입력 화면 안에 있다", async () => {
      const { container } = render(<App />);
      await userEvent.type(
        screen.getByLabelText("사용가능 현금 예산"),
        "150000",
      );
      await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");

      // 전제: 아직 조회 버튼이 없다(무엇이 모자란지 화면이 말해야 하는 상태).
      expect(
        screen.queryByRole("button", { name: "이 지역으로 조회하기" }),
      ).not.toBeInTheDocument();

      const prompt = screen.getByText(/현금·연소득·주택 수를 알려주면/);
      const entry = container.querySelector(".entry-screen");
      // 화면 1 안에 있다 — 오버레이에 가려지는 결과 트리 쪽이 아니다.
      expect(entry?.contains(prompt)).toBe(true);
      expect(container.querySelector(".results-screen")?.contains(prompt)).toBe(
        false,
      );
      // 그 화면 1은 지금 보이는 중이다.
      expect(entry).not.toHaveClass("entry-screen--hidden");
    });

    it("주택 수를 답하면 안내가 사라지고 지역 선택이 나타난다(대조군)", async () => {
      render(<App />);
      await userEvent.type(
        screen.getByLabelText("사용가능 현금 예산"),
        "150000",
      );
      await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
      await userEvent.click(screen.getByLabelText("무주택"));

      expect(
        screen.queryByText(/현금·연소득·주택 수를 알려주면/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "이 지역으로 조회하기" }),
      ).toBeInTheDocument();
    });
  });

  describe("리뷰 수정: 오버레이 뒤의 결과 트리는 조작할 수 없다", () => {
    it("입력 단계에서는 결과 화면 전체가 inert다", async () => {
      const { container } = render(<App />);
      const results = container.querySelector(".results-screen");
      expect(results).not.toBeNull();
      expect(results).toHaveAttribute("inert");

      // 결과 단계로 넘어가면 풀린다.
      await fillProfile();
      expect(container.querySelector(".results-screen")).not.toHaveAttribute(
        "inert",
      );
    });

    it("결과에서 화면 1로 돌아가면 다시 inert가 된다", async () => {
      const { container } = render(<App />);
      await fillProfile();
      await userEvent.click(
        screen.getByRole("button", { name: "조건 다시 넣기" }),
      );
      expect(container.querySelector(".results-screen")).toHaveAttribute(
        "inert",
      );
    });

    it("인쇄 버튼도 그 안에 있다 — 오버레이 뒤에서 키보드로 눌리지 않는다", async () => {
      const { container } = render(<App />);
      await fillProfile();
      await userEvent.click(
        screen.getByRole("button", { name: "조건 다시 넣기" }),
      );
      const results = container.querySelector(".results-screen");
      expect(
        results?.contains(screen.getByRole("button", { name: "인쇄하기" })),
      ).toBe(true);
    });
  });

  describe("리뷰 수정: 가정 칩을 누르면 입력 화면으로 돌아간다", () => {
    it("결과 화면에서 칩을 누르면 입력 화면이 다시 보이고 그 항목이 열린다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      // 전제: 지금은 결과 단계라 입력 화면이 시각적으로 숨어 있다.
      expect(container.querySelector(".entry-screen")).toHaveClass(
        "entry-screen--hidden",
      );
      // 전제: 그 항목의 입력란은 아직 폼에 없다.
      expect(
        screen.queryByLabelText("매달 나가는 대출금"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /기존 대출 없음으로 계산했어요/ }),
      );

      expect(container.querySelector(".entry-screen")).not.toHaveClass(
        "entry-screen--hidden",
      );
      expect(
        screen.getByLabelText("매달 나가는 대출금"),
      ).toBeInTheDocument();
    });

    it("화면 단계만 되돌린다 — 프로필도 지역 조회 결과도 그대로다", async () => {
      render(<App />);
      await fillProfile();
      const priceBefore =
        document.querySelector(".affordable-price")?.textContent;

      await userEvent.click(
        screen.getByRole("button", { name: /기존 대출 없음으로 계산했어요/ }),
      );

      // 입력값(현금)도, 그 값으로 낸 계산도 그대로다.
      expect(screen.getByLabelText("사용가능 현금 예산")).toHaveValue("150000");
      expect(document.querySelector(".affordable-price")?.textContent).toBe(
        priceBefore,
      );
      // 조회 결과도 남아 있어, 다시 조회하지 않아도 목록이 그대로다.
      expect(
        screen.getByRole("region", { name: "살 수 있는 단지" }),
      ).toBeInTheDocument();
    });
  });

  describe("리뷰 수정: 인쇄(화면 5)", () => {
    it("현금·소득을 입력하기 전에는 인쇄 버튼이 없다", () => {
      render(<App />);
      expect(
        screen.queryByRole("button", { name: "인쇄하기" }),
      ).not.toBeInTheDocument();
    });

    /**
     * 리뷰 수정(Critical 1). 화면 1(`.entry-screen`)은 불투명한 전체화면
     * 고정 레이어라 인쇄에서 통째로 지운다 — 그러면 그 **안에** 있던
     * 보호 대상 클래스도 조상과 함께 조용히 사라진다. 실제로
     * `.purchase-type-print`("구매 유형 — …")가 그 형태로 사라졌고,
     * `printCss.test.ts`는 선택자 **문자열**만 비교하므로 조상 관계를
     * 보지 못해 잡아내지 못했다. 그래서 렌더된 DOM에서 직접 확인한다.
     */
    it("인쇄에서 지우는 요소 안에 보호 대상 클래스가 들어 있지 않다", async () => {
      /*
       * Task 4에서 화면 상태가 늘었다 — 전체화면 셸(상단바·사이드바·
       * 지도)과 그 안의 목록·상세다. 지도까지 실제로 그려야
       * `.complex-map-frame`(이번에 새로 숨기게 된 조상)과 그 안의
       * 범례가 DOM에 생긴다 — 안 그리면 이 교차곱은 그 조상을 아예
       * 방문하지 않고 통과한다.
       */
      vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
        units: [
          { complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 },
        ],
        partialFailureCount: 0,
      });
      vi.spyOn(loadNaverMaps, "loadNaverMaps").mockResolvedValue(
        {
          maps: {
            Map: class {
              fitBounds() {}
              panTo() {}
              destroy() {}
            },
            LatLng: class {},
            LatLngBounds: class {},
            Point: class {},
            Marker: class {
              setMap() {}
            },
            InfoWindow: class {
              getMap() {
                return undefined;
              }
              open() {}
              close() {}
              setMap() {}
            },
            Event: { addListener: () => ({}), removeListener: () => {} },
          },
        } as unknown as typeof naver,
      );

      const { container } = render(<App />);

      function check(state: string) {
        for (const selector of PRINT_HIDDEN_SELECTORS) {
          for (const hidden of container.querySelectorAll(selector)) {
            for (const cls of MUST_SURVIVE_PRINT_CLASSES) {
              expect(
                hidden.querySelector(`.${cls}`),
                `${state}에서 ${selector} 안에 .${cls}가 있습니다 — ` +
                  "조상이 인쇄에서 지워지면 이 보호 대상도 함께 사라집니다.",
              ).toBeNull();
              /*
               * 재검토 수정(Important 3): 조상뿐 아니라 **자기 자신**도
               * 본다. 숨김 대상 요소가 보호 대상 클래스를 함께 달고 있으면
               * 그 요소는 자기 자신째로 종이에서 사라진다 —
               * `hidden.querySelector`는 후손만 보므로 그 형태를 놓친다.
               */
              expect(
                hidden.classList.contains(cls),
                `${state}에서 ${selector}가 보호 대상 클래스 .${cls}를 ` +
                  "함께 달고 있습니다 — 그 요소 자신이 인쇄에서 사라집니다.",
              ).toBe(false);
            }
          }
        }
      }

      check("빈 입력 화면(실거주)");

      // 이 블록의 fillProfile은 지역 조회까지 마친다 — 도착점이
      // 전체화면 셸(목록 + 지도)이다.
      await fillProfile();
      await screen.findByRole("region", { name: "단지 지도" });

      // 전제: 이 상태가 실제로 셸과 지도 액자를 그렸다. 없으면 아래
      // check()가 새 조상을 하나도 순회하지 않고 공허하게 통과한다.
      for (const selector of [
        ".result-shell",
        ".region-results-sidebar",
        ".complex-map-frame",
        ".complex-map-legend",
        ".back-to-entry-button",
      ]) {
        expect(
          container.querySelector(selector),
          `${selector}가 결과 화면에 없습니다 — 이 검사의 전제가 깨졌습니다.`,
        ).not.toBeNull();
      }
      check("지역 조회 결과가 뜬 전체화면 셸");

      /*
       * Task 5: 예산 상세 패널이 **열린** 상태도 지난다. 이 패널 안에는
       * 보호 대상 클래스가 열 개 들어 있고(no-budget·binding-explainer·
       * cost-breakdown·policy-loan-list·slider-price·slider-warning·
       * safe-line·assumption-line·assumption-item·assumption-notice),
       * 그 위에 새 조상(`.budget-panel`)과 새 숨김 대상
       * (`.budget-detail-close`)이 함께 생겼다 — 이 검사가 정확히 겨누는
       * 배치다.
       */
      await userEvent.click(
        screen.getByRole("button", { name: /실구매 가능 가격/ }),
      );
      for (const selector of [".budget-panel", ".budget-detail-close"]) {
        expect(
          container.querySelector(selector),
          `${selector}가 열린 패널에 없습니다 — 이 검사의 전제가 깨졌습니다.`,
        ).not.toBeNull();
      }
      check("예산 상세 패널이 열린 전체화면 셸");

      // 닫아도 내용은 DOM에 그대로 남는다(인쇄 계약) — 그 상태도 지난다.
      await userEvent.click(
        screen.getByRole("button", { name: /실구매 가능 가격/ }),
      );
      check("예산 상세 패널이 닫힌 전체화면 셸");

      // 사이드바가 목록에서 단지 상세로 바뀐 상태. 상세 안에는 보호 대상
      // 클래스가 몰려 있다(호가·입지·등급 근거).
      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
      expect(
        container.querySelector(".complex-detail-back"),
        "단지 상세가 열리지 않았습니다 — 이 검사의 전제가 깨졌습니다.",
      ).not.toBeNull();
      check("단지 상세가 열린 전체화면 셸");

      /*
       * 재검토 수정(Important 3): 투자 경로도 반드시 지난다.
       *
       * 이 검사는 형태로는 완전한 교차곱인데 실제로 방문한 상태는 둘 다
       * 실거주였다. 투자 경로에는 `PurchaseTypeSelect`
       * (`.purchase-type-form`, 인쇄에서 숨김)와 `PurchaseCheck`
       * (`.purchase-form`, 숨김 / `purchase-loan-note`·`purchase-verdict`·
       * `purchase-print-summary`가 그 바로 옆에 보호 대상으로) 라는,
       * 이 검사가 정확히 겨누는 조상-후손 배치가 있다 — 그리고 지난
       * 수정 물결이 재배치한 것이 바로 그 배치다.
       */
      await userEvent.click(
        screen.getByLabelText(new RegExp(purchaseRules.types.월세수익형.label)),
      );

      // 전제: 이 상태가 실제로 그 배치를 화면에 그렸다. 이게 없으면
      // 아래 check()가 아무것도 순회하지 않고 공허하게 통과할 수 있다.
      for (const selector of [
        ".purchase-type-form",
        ".purchase-form",
        ".purchase-loan-note",
        ".purchase-verdict",
        ".purchase-print-summary",
      ]) {
        expect(
          container.querySelector(selector),
          `${selector}가 투자 화면에 없습니다 — 이 검사의 전제가 깨졌습니다.`,
        ).not.toBeNull();
      }

      check("월세수익형 투자 화면");
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

    it("입력한 전제(현금·소득·주택 수·룰셋 기준)가 인쇄 전용 요약에 나온다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      const summary = container.querySelector(".print-summary");
      expect(summary).not.toBeNull();
      expect(summary?.textContent).toMatch(/15억/); // 사용가능 현금 예산
      expect(summary?.textContent).toMatch(/1억 5,000만원/); // 연 소득
      expect(summary?.textContent).toMatch(/규제 기준/); // 룰셋 기준
      expect(summary?.textContent).toMatch(/인쇄일/);
      // 주택 수는 계산의 전제(정책대출 자격을 가른다)라 종이에도 남아야
      // 한다. 화면에서는 .profile-form 안에만 있고 그 폼은 인쇄에서
      // 통째로 지워지므로, 종이를 건네받은 사람이 확인할 곳은 여기뿐이다.
      expect(summary?.textContent).toMatch(/주택 수/);
      expect(summary?.textContent).toMatch(/무주택/);
    });

    it("리뷰 수정(인쇄 '함께 볼 것'): 부제의 개인정보 보호 문구만 별도 span으로 감싼다", () => {
      // "입력한 재무정보는 이 브라우저를 벗어나지 않아요"는 "이
      // 브라우저"라는 지시 대상이 종이 위에는 없어 인쇄에서 뜻이 서지
      // 않는다 — .subtitle-privacy-note만 인쇄에서 지운다
      // (styles.css). 룰셋 기준은 종이에서도 뜻이 있어 남긴다.
      //
      // 지역 조회가 붙으면서 이 span에 한 문장이 늘었다. "고른 지역
      // 코드만 서버로 전송돼요"는 같은 약속(무엇이 이 브라우저를
      // 벗어나는가)의 단서라 같은 자리에 있어야 하고, "이 브라우저"와
      // 마찬가지로 종이 위에서는 뜻이 서지 않아 함께 지워져야 한다.
      //
      // "· 수도권"은 지웠다 — 지역이 전국으로 넓어져 더 이상 사실이
      // 아니다.
      const { container } = render(<App />);
      const subtitle = container.querySelector(".subtitle");
      const note = subtitle?.querySelector(".subtitle-privacy-note");

      expect(note).not.toBeNull();
      expect(note?.textContent).toBe(
        " · 입력한 재무정보는 이 브라우저를 벗어나지 않아요. 지역 실거래가 조회에는 고른 지역 코드만 서버로 전송돼요.",
      );

      const expectedLabel = formatRuleVersionLabel(rules);
      expect(subtitle?.textContent).toBe(
        `${expectedLabel} · 입력한 재무정보는 이 브라우저를 벗어나지 않아요. 지역 실거래가 조회에는 고른 지역 코드만 서버로 전송돼요.`,
      );
      expect(subtitle?.textContent).not.toContain("수도권");
    });

    it("목록 화면에서는 전용면적이 가정값이라고 밝히고, 매물을 고르면 그 매물의 실제 면적이라고 밝힌다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      const summaryBefore = container.querySelector(".print-summary");
      expect(summaryBefore?.textContent).toMatch(/85㎡\s*\(가정값\)/);

      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

      const summaryAfter = container.querySelector(".print-summary");
      expect(summaryAfter?.textContent).toMatch(/90㎡\s*\(선택한 매물의 실제 면적\)/);
    });
  });
});

describe("App - 지도", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function fillProfile() {
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), "150000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "15000");
    await userEvent.click(screen.getByLabelText("무주택"));
  }

  async function chooseRegion() {
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
  }

  it("목록이 뜬 뒤에 지도 영역이 나타난다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [{ complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 }],
      partialFailureCount: 0,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByRole("region", { name: "살 수 있는 단지" });
    await screen.findByRole("region", { name: "단지 지도" });
  });

  it("좌표 조회가 끝나기 전엔 로딩 문구를 보여주고, 끝나면 지도로 바뀐다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });

    let resolveCoords: (
      v: Awaited<ReturnType<typeof regionQuery.fetchComplexCoordinates>>,
    ) => void = () => {};
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCoords = resolve;
        }),
    );

    render(<App />);
    await fillProfile();
    await chooseRegion();

    // 목록은 이미 떠 있어야 한다 — 지도용 좌표 조회는 별도로, 더 늦게
    // 끝난다(부모 스펙 §3). 좌표 응답이 오기 전엔 지도 대신 로딩 문구다.
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    await screen.findByText("지도를 불러오고 있어요…");
    expect(
      screen.queryByRole("region", { name: "단지 지도" }),
    ).not.toBeInTheDocument();

    resolveCoords({
      units: [{ complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 }],
      partialFailureCount: 0,
    });

    await screen.findByRole("region", { name: "단지 지도" });
    expect(screen.queryByText("지도를 불러오고 있어요…")).not.toBeInTheDocument();
  });

  it("좌표 조회가 실패하면 '단지 없음'과 구분되는 실패 문구를 보여주고 지도를 그리지 않는다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockRejectedValue(
      new Error("네트워크 오류"),
    );

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // "단지 위치를 불러오지 못했어요"는 "좌표를 찾았는데 0건이었다"와는
    // 다른 문구여야 한다 — 실패("모른다")를 빈 성공("확인했더니 없다")과
    // 같은 화면으로 보여주면 안 된다는 것이 이 앱의 원칙이다. 목록 조회
    // 실패("지금 실거래가를…")·SDK 로드 실패("지도를 표시하지 못했어요")와도
    // 원인이 달라 문구가 다르다.
    await screen.findByText("단지 위치를 불러오지 못했어요.");
    expect(
      screen.queryByRole("region", { name: "단지 지도" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("지도를 불러오고 있어요…")).not.toBeInTheDocument();

    // 재시도 버튼이 있고, 다시 좌표 조회를 부른다.
    const retryButton = screen.getByRole("button", { name: "다시 시도" });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [{ complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 }],
      partialFailureCount: 0,
    });
    await userEvent.click(retryButton);

    await screen.findByRole("region", { name: "단지 지도" });
  });

  it("단지가 0건인 지역에서는 좌표를 묻지도, 지도 자리를 그리지도 않는다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [],
      isRegulatedArea: null,
      dataAsOf: null,
    });
    const fetchCoords = vi
      .spyOn(regionQuery, "fetchComplexCoordinates")
      .mockResolvedValue({ units: [], partialFailureCount: 0 });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    // 지역 조회는 끝났다(0건이라는 사실을 화면이 이미 말한다).
    await screen.findByText(/실거래가 자체가/);

    // 그릴 것이 없다는 걸 이미 아는데 국토부·네이버 호출량을 쓰면 안 된다.
    expect(fetchCoords).not.toHaveBeenCalled();
    // "데이터가 없어요" 옆에 지도 로딩/실패 안내가 나란히 뜨면 안 된다.
    expect(screen.queryByText("지도를 불러오고 있어요…")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "단지 지도" }),
    ).not.toBeInTheDocument();
  });

  it("일부 단지의 좌표를 확인하지 못했으면 지도 옆에 안내 문구를 보여준다", async () => {
    // partialFailureCount > 0 — 지오코딩이 일부 주소에서 던졌다는 신호다.
    // 새 로딩/에러/성공 3분기를 또 만들지 않고, 이미 뜬 지도 옆에 한
    // 줄만 덧붙여야 한다(찾은 단지는 그대로 지도에 남아 있다).
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [{ complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 }],
      partialFailureCount: 2,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    // 지도는 여전히 뜬다 — 확인에 성공한 단지는 그대로 보여준다.
    await screen.findByRole("region", { name: "단지 지도" });
    await screen.findByText("일부 단지의 위치를 확인하지 못했어요. 지도에 안 보이는 단지가 있을 수 있어요.");
  });

  it("좌표 조회가 깨끗하게 성공하면 부분 실패 안내 문구가 뜨지 않는다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [{ complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 }],
      partialFailureCount: 0,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByRole("region", { name: "단지 지도" });
    expect(
      screen.queryByText("일부 단지의 위치를 확인하지 못했어요. 지도에 안 보이는 단지가 있을 수 있어요."),
    ).not.toBeInTheDocument();
  });

  it("좌표를 하나도 못 찾았으면(주소 확인 실패) 부분 실패 문구를 덧붙이지 않는다", async () => {
    // 리뷰 수정(Minor 4): partialFailureCount > 0이면서 동시에 좌표를 하나도
    // 못 찾은 경우, ComplexMap이 이미 "주소로는 위치를 찾을 수 없었어요"를
    // 보여주고 있다. 그 아래 "**일부** 단지의 위치를 확인하지 못했어요"가
    // 또 뜨면 "일부"가 "전부"를 가리켜 두 문구가 서로 부딪힌다 — 여기서는
    // 뜨지 않아야 한다.
    //
    // ComplexMap이 noneLocated를 판단하는 effect는 loadNaverMaps가
    // resolve된 뒤에야 돈다(위 "지도에는 목록에 뜬 단지만…" 테스트와 같은
    // 이유) — withCoords가 이미 빈 배열이라 naverGlobal.maps를 실제로
    // 건드리기 전에 return하므로 빈 객체로도 충분하다.
    vi.spyOn(loadNaverMaps, "loadNaverMaps").mockResolvedValue(
      {} as unknown as typeof naver,
    );
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [], // 지오코딩 성공은 했지만 이 단지의 좌표는 못 찾았다.
      partialFailureCount: 2,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    // ComplexMap의 캐비앗은 "주소로는 위치를 찾을 수 없었어요. 목록은
    // 그대로 쓰실 수 있어요."로 한 <p> 안에 두 문장이 들어가 있어,
    // 첫 문장만으로 정확히 일치시키려면 정규식이 필요하다.
    await screen.findByText(/주소로는 위치를 찾을 수 없었어요\./);
    expect(
      screen.queryByText("일부 단지의 위치를 확인하지 못했어요. 지도에 안 보이는 단지가 있을 수 있어요."),
    ).not.toBeInTheDocument();
  });

  /**
   * 지도에 그려진 단지 = 목록에 뜬 단지.
   *
   * 예전에는 지도가 `dongFilteredUnits`(예산 필터 **전**)를 받아, 왼쪽
   * 목록엔 예산에 맞는 몇 개만 뜨는데 오른쪽 지도엔 구 전체가 색까지
   * 입혀 떴다. 지도 어디에도 "이건 예산으로 거른 게 아니에요"라고 적혀
   * 있지 않았고, 마커 색(옅다=싸다)은 **그려진 집합** 기준의 3분위라
   * 옅은 마커가 "내 예산에 맞는다"로 읽혔다.
   */
  it("지도에는 목록에 뜬 단지만 그린다 — 예산을 넘는 단지는 마커가 없다", async () => {
    const markerEls: HTMLElement[] = [];
    let mapContainer: HTMLElement | null = null;
    const naverGlobal = {
      maps: {
        Map: class {
          constructor(el: HTMLElement) {
            mapContainer = el;
          }
          fitBounds() {}
          destroy() {}
        },
        LatLng: class {
          constructor(
            public lat: number,
            public lng: number,
          ) {}
        },
        LatLngBounds: class {
          constructor(
            public sw: unknown,
            public ne: unknown,
          ) {}
        },
        Point: class {
          constructor(
            public x: number,
            public y: number,
          ) {}
        },
        Marker: class {
          constructor(opts: { icon?: { content?: string } }) {
            if (opts.icon?.content !== undefined && mapContainer !== null) {
              const el = document.createElement("div");
              el.innerHTML = opts.icon.content;
              mapContainer.appendChild(el);
              markerEls.push(el);
            }
          }
          setMap() {}
        },
        InfoWindow: class {
          constructor(public opts: unknown) {}
          getMap() {
            return undefined;
          }
          open() {}
          close() {}
          setMap() {}
        },
        Event: {
          addListener: () => ({}),
          removeListener: () => {},
        },
      },
    };
    vi.spyOn(loadNaverMaps, "loadNaverMaps").mockResolvedValue(
      naverGlobal as unknown as typeof naver,
    );

    // 예산(현금 15억·연소득 1.5억)으로는 도저히 살 수 없는 단지 하나를
    // 같은 지역 결과에 섞는다. 좌표는 **둘 다** 준다 — 지도에서 빠지는
    // 이유가 "좌표가 없어서"가 아니라 "예산 필터에 걸려서"여야 한다.
    const TOO_EXPENSIVE: ComplexUnit = {
      ...DETAIL_TEST_UNIT,
      complexKey: "11680|테스트동|2015|비싼단지",
      complexName: "비싼단지",
      areaBucket: 130,
      maxExclusiveAreaSqm: 130,
      minPrice: 50_000_000_000,
      maxPrice: 50_000_000_000,
    };

    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DETAIL_TEST_UNIT, TOO_EXPENSIVE],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [
        { complexKey: DETAIL_TEST_UNIT.complexKey, lat: 37.1, lon: 127.1 },
        { complexKey: TOO_EXPENSIVE.complexKey, lat: 37.2, lon: 127.2 },
      ],
      partialFailureCount: 0,
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() => expect(markerEls.length).toBeGreaterThan(0));

    const labels = markerEls.map((el) => el.textContent ?? "").join("|");
    expect(labels).toContain("90㎡"); // 목록에 뜨는 단지
    expect(labels).not.toContain("130㎡"); // 예산을 넘어 목록에 없는 단지
    expect(markerEls).toHaveLength(1);

    // 목록 쪽도 같은 집합인지 확인한다 — 한쪽만 보면 두 창이 어긋나도 통과한다.
    expect(screen.getByRole("button", { name: /테스트단지/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /비싼단지/ })).not.toBeInTheDocument();
  });

  it("예산에 맞는 단지가 없으면 좌표를 묻지 않고, 실패가 아니라는 것이 드러나는 문구를 보여준다", async () => {
    const TOO_EXPENSIVE: ComplexUnit = {
      ...DETAIL_TEST_UNIT,
      complexKey: "11680|테스트동|2015|비싼단지",
      complexName: "비싼단지",
      minPrice: 50_000_000_000,
      maxPrice: 50_000_000_000,
    };
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [TOO_EXPENSIVE],
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    const fetchCoords = vi
      .spyOn(regionQuery, "fetchComplexCoordinates")
      .mockResolvedValue({ units: [], partialFailureCount: 0 });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByText("조건에 맞는 단지가 없어 지도에 표시할 단지가 없어요.");

    // 그릴 것이 없다는 걸 이미 아는데 지오코딩 호출량을 쓰면 안 된다.
    expect(fetchCoords).not.toHaveBeenCalled();
    // 실패·로딩과 절대 같은 문구를 쓰지 않는다 — 여기서는 아무것도 실패하지 않았다.
    expect(screen.queryByText("지도를 불러오고 있어요…")).not.toBeInTheDocument();
    expect(screen.queryByText("단지 위치를 불러오지 못했어요.")).not.toBeInTheDocument();
    expect(screen.queryByText("지도를 표시하지 못했어요.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "단지 지도" }),
    ).not.toBeInTheDocument();
    // 지역에 데이터가 없다는 말과도 다르다 — 데이터는 있고, 예산이 안 맞았을 뿐이다.
    expect(screen.queryByText(/실거래가 자체가/)).not.toBeInTheDocument();
  });
});

/**
 * 재검토 수정(Critical 2): 화면 1의 문서 스크롤 잠금은 **인쇄에서 풀 수
 * 있는 형태**여야 한다.
 *
 * 인라인 스타일(`document.body.style.overflow = "hidden"`)로 걸면
 * `@media print`가 `!important` 없이는 손댈 수 없고, `<html>`의
 * `overflow` 기본값(`visible`) 때문에 `<body>`의 `hidden`이 뷰포트로
 * 전파돼 인쇄물이 첫 장에서 잘린다. 그 인쇄 CSS 쪽 계약은
 * `scripts/printCss.test.ts`가 잠그고, 여기서는 **컴포넌트가 실제로
 * 클래스를 쓰는지**를 잠근다 — 두 쪽 중 하나만 지켜지면 잠금은 다시
 * 인쇄를 깨뜨린다.
 */
describe("재검토 수정: 화면 1의 문서 스크롤 잠금", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("화면 1이 떠 있는 동안 body에 잠금 클래스가 붙는다", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".entry-screen")).not.toHaveClass(
      "entry-screen--hidden",
    );
    expect(document.body).toHaveClass(BODY_SCROLL_LOCK_CLASS);
  });

  it("잠금은 인라인 스타일을 건드리지 않는다 — 다른 곳이 쓴 값도 그대로다", () => {
    // 예전 구현은 잠글 때 값을 기억했다가 풀 때 그대로 되돌려, 그 사이
    // 다른 곳이 쓴 값을 조용히 지웠다.
    document.body.style.overflow = "auto";
    render(<App />);
    expect(document.body).toHaveClass(BODY_SCROLL_LOCK_CLASS);
    expect(document.body.style.overflow).toBe("auto");
  });

  it("화면 1이 걷히면 잠금이 떨어진다", async () => {
    const { container } = render(<App />);
    expect(document.body).toHaveClass(BODY_SCROLL_LOCK_CLASS);

    // 투자 유형을 고르면 화면 1이 걷히고 결과 화면이 선다.
    await userEvent.click(
      screen.getByLabelText(new RegExp(purchaseRules.types.월세수익형.label)),
    );

    expect(container.querySelector(".entry-screen")).toHaveClass(
      "entry-screen--hidden",
    );
    expect(document.body).not.toHaveClass(BODY_SCROLL_LOCK_CLASS);
  });

  it("저장된 투자 유형으로 새로 열면 처음부터 잠기지 않는다", () => {
    window.localStorage.setItem(PURCHASE_TYPE_STORAGE_KEY, "월세수익형");
    render(<App />);
    expect(document.body).not.toHaveClass(BODY_SCROLL_LOCK_CLASS);
  });
});

/**
 * 화면 2 — 전체화면 셸(design.md §4, Task 4).
 *
 * 여기서 확인하는 것은 **어디에 무엇이 그려지는가**다. 계산은
 * 건드리지 않았으므로 숫자 검증은 기존 테스트들이 그대로 맡는다.
 */
describe("전체화면 결과 셸", () => {
  /**
   * 마커를 실제 DOM에 그리고 클릭 리스너를 붙잡아 두는 최소 SDK 가짜.
   * `panTo`가 있어야 한다 — 고른 단지로 지도를 옮길 때 부른다.
   */
  function fakeNaver() {
    const markers: Array<{ listeners: Record<string, () => void> }> = [];
    const panToCalls: unknown[] = [];
    let mapContainer: HTMLElement | null = null;
    const naverGlobal = {
      maps: {
        Map: class {
          constructor(el: HTMLElement) {
            mapContainer = el;
          }
          fitBounds() {}
          panTo(coord: unknown) {
            panToCalls.push(coord);
          }
          destroy() {}
        },
        LatLng: class {
          constructor(
            public lat: number,
            public lng: number,
          ) {}
        },
        LatLngBounds: class {
          constructor(
            public sw: unknown,
            public ne: unknown,
          ) {}
        },
        Point: class {
          constructor(
            public x: number,
            public y: number,
          ) {}
        },
        Marker: class {
          listeners: Record<string, () => void> = {};
          constructor(opts: { icon?: { content?: string } }) {
            markers.push(this);
            if (opts.icon?.content !== undefined && mapContainer !== null) {
              const el = document.createElement("div");
              el.innerHTML = opts.icon.content;
              mapContainer.appendChild(el);
            }
          }
          setMap() {}
        },
        InfoWindow: class {
          constructor(public opts: unknown) {}
          getMap() {
            return undefined;
          }
          open() {}
          close() {}
          setMap() {}
        },
        Event: {
          addListener(
            marker: { listeners: Record<string, () => void> },
            event: string,
            fn: () => void,
          ) {
            marker.listeners[event] = fn;
            return { marker, event };
          },
          removeListener() {},
        },
      },
    };
    return { naverGlobal, markers, panToCalls };
  }

  /** 현금 15억으로 대출 없이 살 수 있는 단지 */
  const CASH_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|테스트동|2015|현금단지",
    complexName: "현금단지",
    areaBucket: 59,
    maxExclusiveAreaSqm: 59,
    minPrice: 200_000_000,
    maxPrice: 210_000_000,
  };

  /** 살 수는 있지만 대출이 필요한 단지 */
  const LOAN_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|테스트동|2015|대출단지",
    complexName: "대출단지",
    areaBucket: 84,
    maxExclusiveAreaSqm: 84,
    minPrice: 1_800_000_000,
    maxPrice: 1_800_000_000,
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.classList.remove(BODY_SCROLL_LOCK_CLASS);
  });

  /** 단위는 만원이다(150000 = 15억). */
  async function fillProfile(cash = "150000", income = "15000") {
    await userEvent.type(screen.getByLabelText("사용가능 현금 예산"), cash);
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), income);
    await userEvent.click(screen.getByLabelText("무주택"));
  }

  async function chooseRegion() {
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
  }

  /** 두 단지가 뜨는 결과 화면까지 간다. 지도까지 실제로 그린다. */
  async function renderResults(
    units: ComplexUnit[] = [CASH_UNIT, LOAN_UNIT],
    profile: { cash?: string; income?: string } = {},
  ) {
    const fake = fakeNaver();
    vi.spyOn(loadNaverMaps, "loadNaverMaps").mockResolvedValue(
      fake.naverGlobal as unknown as typeof naver,
    );
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units,
      isRegulatedArea: null,
      dataAsOf: "2026-01",
    });
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: units.map((u, i) => ({
        complexKey: u.complexKey,
        lat: 37.1 + i * 0.01,
        lon: 127.1 + i * 0.01,
      })),
      partialFailureCount: 0,
    });

    const rendered = render(<App />);
    await fillProfile(profile.cash, profile.income);
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    return { ...rendered, ...fake };
  }

  it("상단바 + 사이드바 + 지도 세 자리가 서고, 목록과 지도가 각자의 자리에 들어간다", async () => {
    const { container } = await renderResults();

    const shell = container.querySelector(".result-shell");
    expect(shell).not.toBeNull();
    const sidebar = container.querySelector(".region-results-sidebar");
    const mapColumn = container.querySelector(".region-results-map");
    expect(container.querySelector(".result-topbar")).not.toBeNull();
    expect(sidebar).not.toBeNull();
    expect(mapColumn).not.toBeNull();

    // 목록은 사이드바 안, 지도는 지도 칸 안.
    expect(
      sidebar?.contains(screen.getByRole("region", { name: "살 수 있는 단지" })),
    ).toBe(true);
    await screen.findByRole("region", { name: "단지 지도" });
    expect(
      mapColumn?.contains(screen.getByRole("region", { name: "단지 지도" })),
    ).toBe(true);
  });

  /**
   * 셸은 `position: fixed; inset: 0`이라 그 **밖에** 남은 것은 화면에서
   * 덮인다 — `phase === "입력"`일 때 결과 트리가 오버레이 뒤에 깔려
   * 있던 것과 같은 실패다(Task 3 리뷰 Important 4·5). jsdom은 레이아웃을
   * 계산하지 않으므로 "보이는가"를 물을 수 없다 — 대신 **셸 안에
   * 들어 있는가**를 구조로 확인한다.
   */
  it("진단 종합과 면책 문구가 셸 **안**에 있다 — 고정 레이어 뒤에 깔리지 않는다", async () => {
    const { container } = await renderResults();
    const shell = container.querySelector(".result-shell");

    const disclaimer = container.querySelector(".disclaimer");
    expect(disclaimer).not.toBeNull();
    expect(shell?.contains(disclaimer!)).toBe(true);
    // 화면에 한 벌만 있다 — 두 자리에 각각 적으면 갈라진다.
    expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);

    /*
     * Task 5: 진단 종합은 이제 **단지 상세 안**에 있다(design.md §5) —
     * 목록 상태에서는 네 축이 전부 `null`이라 "아무것도 못 봤다"만
     * 그리던 자리였다. 상세를 열면 같은 셸 안에서 나타난다.
     */
    expect(container.querySelector(".diagnosis-summary")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
    const diagnosis = container.querySelector(".diagnosis-summary");
    expect(diagnosis).not.toBeNull();
    expect(shell?.contains(diagnosis!)).toBe(true);
    expect(container.querySelectorAll(".diagnosis-summary")).toHaveLength(1);
  });

  /**
   * Task 5: 진단 종합이 상세 안으로 들어가면서 이 상태에서는 사라진다 —
   * 네 축이 전부 `null`이라 "아무것도 못 봤다"만 그리던 자리이므로 종이가
   * 잃는 사실이 없다. **면책은 그대로 남는다**(`disclaimer`는
   * MUST_SURVIVE_PRINT_CLASSES라 이 상태의 종이에서도 사라지면 안 된다).
   */
  it("프로필이 아직 안 끝났으면 셸을 세우지 않지만, 면책은 그대로 남는다", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".result-shell")).toBeNull();
    expect(container.querySelector(".disclaimer")).not.toBeNull();
    expect(container.querySelector(".diagnosis-summary")).toBeNull();
  });

  it("상단바가 전제와 결과를 요약하고, 인쇄·조건 다시 넣기가 그 안에 선다", async () => {
    const { container } = await renderResults();
    const topbar = container.querySelector(".result-topbar");

    expect(topbar?.textContent).toContain("사용가능 현금 예산");
    expect(topbar?.textContent).toContain("15억");
    expect(topbar?.textContent).toContain("연 소득(세전)");
    expect(topbar?.textContent).toContain("실구매 가능 가격");
    // 금액이 있는 프로필에서는 그 자리가 황동 강조다 — 아래 0원 테스트의 대조군.
    expect(
      topbar?.querySelector(".result-topbar-item-value--money"),
    ).not.toBeNull();
    // 지역은 코드가 아니라 이름으로 적는다.
    expect(topbar?.textContent).toContain("서울특별시 강남구");
    expect(topbar?.textContent).not.toContain("11680");

    expect(
      topbar?.contains(screen.getByRole("button", { name: "인쇄하기" })),
    ).toBe(true);
    expect(
      topbar?.contains(screen.getByRole("button", { name: "조건 다시 넣기" })),
    ).toBe(true);
  });

  it("셸이 서 있는 동안 문서 스크롤이 잠기고, 셸이 사라지면 풀린다", async () => {
    await renderResults();
    /*
     * 여기서 실제로 잡은 버그: 셸은 프로필을 채운 순간(아직
     * `phase === "입력"`) 마운트되며 잠금을 걸고, 지역 조회가 성공해
     * `phase`가 "결과"로 넘어가면 `EntryScreen`의 effect 정리가 그
     * 잠금을 떼어 버렸다 — 전체화면 셸이 떠 있는데 뒤로 페이지
     * 스크롤바가 남았다. 지금은 `lockBodyScroll()`이 잠글 이유를 센다.
     */
    expect(document.body).toHaveClass(BODY_SCROLL_LOCK_CLASS);

    // 화면 1로 돌아가면 두 레이어가 동시에 잠근다 — 그래도 잠금은 하나다.
    await userEvent.click(
      screen.getByRole("button", { name: "조건 다시 넣기" }),
    );
    expect(document.body).toHaveClass(BODY_SCROLL_LOCK_CLASS);
    // 다시 결과로 돌아와도 유지된다(유형 라디오를 거치지 않는 경로).
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
    expect(document.body).toHaveClass(BODY_SCROLL_LOCK_CLASS);

    // 투자 유형으로 가면 셸이 사라진다(그 화면은 세로로 흐르는 문서다).
    await userEvent.click(
      screen.getByLabelText(new RegExp(purchaseRules.types.월세수익형.label)),
    );
    expect(document.body).not.toHaveClass(BODY_SCROLL_LOCK_CLASS);
  });

  /**
   * 마커 색의 뜻이 부담 수준으로 바뀌었다(design.md §4). **지도가 그
   * 판정을 새로 하지 않는다**는 것을 여기서 확인한다 — 목록 행이 자기
   * 자리에서 말하는 것과 마커 색이 단지별로 일치하는지 대조한다.
   */
  it("마커 색(부담 수준)이 같은 단지의 목록 행이 말하는 것과 일치한다", async () => {
    const { container } = await renderResults();
    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() =>
      expect(container.querySelectorAll(".complex-map-marker")).toHaveLength(2),
    );

    const tierOf = (complexKey: string) => {
      const marker = [
        ...container.querySelectorAll<HTMLElement>(".complex-map-marker"),
      ].find((el) => el.dataset.complexKey === complexKey);
      expect(marker, `${complexKey} 마커가 없습니다`).toBeDefined();
      return marker!.classList.contains("complex-map-marker--no-loan")
        ? "no-loan"
        : "loan";
    };

    const rowText = (name: string) =>
      screen.getByRole("button", { name: new RegExp(name) }).textContent ?? "";

    // 전제: 두 색이 실제로 갈렸다. 안 갈리면 아래 대조가 공허해진다.
    expect(tierOf(CASH_UNIT.complexKey)).toBe("no-loan");
    expect(tierOf(LOAN_UNIT.complexKey)).toBe("loan");

    // 그리고 목록 행이 같은 말을 한다.
    expect(rowText("현금단지")).toContain("대출 없이 살 수 있어요");
    expect(rowText("대출단지")).toContain("부담률");
    expect(rowText("대출단지")).not.toContain("대출 없이 살 수 있어요");

    // 마커 라벨도 색에만 기대지 않고 글자로 말한다.
    const cashMarker = [
      ...container.querySelectorAll<HTMLElement>(".complex-map-marker"),
    ].find((el) => el.dataset.complexKey === CASH_UNIT.complexKey);
    expect(cashMarker?.textContent).toContain("대출 없이");
  });

  it("목록 행을 누르면 그 단지의 마커가 강조된다", async () => {
    const { container } = await renderResults();
    await vi.waitFor(() =>
      expect(container.querySelectorAll(".complex-map-marker")).toHaveLength(2),
    );
    expect(container.querySelectorAll(".complex-map-marker--focused")).toHaveLength(
      0,
    );

    await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));

    await vi.waitFor(() => {
      const focused = container.querySelectorAll<HTMLElement>(
        ".complex-map-marker--focused",
      );
      expect(focused).toHaveLength(1);
      expect(focused[0]!.dataset.complexKey).toBe(CASH_UNIT.complexKey);
    });
  });

  it("마커를 누르면 그 단지의 목록 행이 선택되고, 상세는 열리지 않는다", async () => {
    const { container, markers } = await renderResults();
    await vi.waitFor(() => expect(markers.length).toBe(2));

    // 마커 순서는 목록 순서를 따른다(부담이 낮은 것부터).
    markers[1]!.listeners.click!();

    await vi.waitFor(() =>
      expect(container.querySelectorAll(".complex-row--focused")).toHaveLength(1),
    );
    const row = container.querySelector(".complex-row--focused");
    expect(row?.textContent).toContain("대출단지");
    expect(row).toHaveAttribute("aria-current", "true");
    // 마커는 단지를 가리키지 상세(평형)를 고르지 않는다 — 목록은 그대로다.
    expect(
      screen.getByRole("region", { name: "살 수 있는 단지" }),
    ).toBeInTheDocument();
  });

  /**
   * 리뷰 수정 Important 1 — **상단바가 맨숫자 0을 내지 않는다.**
   *
   * `useAffordability`는 프로필이 완성되면 `null`을 내지 않으므로, 현금이
   * 고정 부대비용에도 못 미치는 사람도 이 셸에 도달한다. 그때 상단바는
   * 화면에서 가장 큰 글씨이자 종이의 첫 줄인데, 예전에는 거기에 황동으로
   * "실구매 가능 가격 / 0원"만 찍혔다.
   */
  it("실구매 가능 가격이 0원이면 상단바가 숫자 대신 원인을 말한다", async () => {
    // 현금 100만원 — 매매가 0원에서도 드는 고정 부대비용(법무비·이사비)에도
    // 못 미쳐 실구매 가능 가격이 0이 된다.
    const { container } = await renderResults([CASH_UNIT, LOAN_UNIT], {
      cash: "100",
    });

    // 전제: 실제로 0원 상태다(사이드바가 그 사실을 말하고 있다).
    expect(container.querySelector(".no-budget")).not.toBeNull();

    const topbar = container.querySelector(".result-topbar");
    expect(topbar?.textContent).toContain("실구매 가능 가격");
    expect(topbar?.textContent).not.toContain("0원");
    // 사이드바가 쓰는 것과 같은 문장이다(같은 상수).
    expect(topbar?.textContent).toContain(ZERO_BUDGET_HEADLINE);
    // 금액 강조(황동)를 입히지 않는다 — 없는 숫자를 있는 것처럼 광고하지 않는다.
    expect(
      topbar?.querySelector(".result-topbar-item-value--money"),
    ).toBeNull();
  });

  /**
   * 리뷰 수정 Important 2 — **상세 열림 × 마커 클릭.**
   *
   * 상세가 열려 있는 동안 `effectiveProfile`이 화면 전체의 계산을 그
   * 평형의 면적으로 바꿔치기한다. 그 상태에서 다른 단지의 마커를 눌렀는데
   * 상세가 그대로면, 사이드바는 A를 그리고 지도는 B를 강조하는 —
   * 이 저장소가 여섯 번 낸 바로 그 어긋남이 된다.
   */
  it("상세가 열린 채 다른 단지의 마커를 누르면 상세가 닫히고 그 단지로 옮겨 간다", async () => {
    const { container, markers } = await renderResults();
    await vi.waitFor(() => expect(markers.length).toBe(2));

    // A(현금단지)의 상세를 연다.
    await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
    expect(screen.getByRole("region", { name: "단지 상세" })).toBeInTheDocument();

    // B(대출단지)의 마커를 누른다. 마커 순서는 목록 순서를 따른다.
    markers[1]!.listeners.click!();

    await vi.waitFor(() => {
      // 상세가 닫히고 목록으로 돌아온다 — 두 창이 다시 같은 것을 본다.
      expect(
        screen.queryByRole("region", { name: "단지 상세" }),
      ).not.toBeInTheDocument();
      const focused = container.querySelector(".complex-row--focused");
      expect(focused?.textContent).toContain("대출단지");
    });
    // 지도 쪽 강조도 B 하나다.
    const focusedMarkers = container.querySelectorAll<HTMLElement>(
      ".complex-map-marker--focused",
    );
    expect(focusedMarkers).toHaveLength(1);
    expect(focusedMarkers[0]!.dataset.complexKey).toBe(LOAN_UNIT.complexKey);
  });

  it("상세가 열린 채 **그 단지의** 마커를 누르면 상세는 그대로다", async () => {
    const { markers } = await renderResults();
    await vi.waitFor(() => expect(markers.length).toBe(2));

    await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
    expect(screen.getByRole("region", { name: "단지 상세" })).toBeInTheDocument();

    // 같은 단지(현금단지)의 마커 — 두 창은 이미 같은 것을 가리키고 있다.
    markers[0]!.listeners.click!();

    expect(screen.getByRole("region", { name: "단지 상세" })).toBeInTheDocument();
  });

  /**
   * 지도는 30개까지 그리는데 목록은 덩어리마다 10개씩만 그린다. 그 너머의
   * 마커를 누르면 선택은 바뀌는데 화면엔 아무 변화가 없다 — 사용자에겐
   * 마커가 죽은 것으로 보인다.
   */
  it("'더 보기' 너머의 마커를 눌러도 그 행이 목록에 나타난다", async () => {
    // 같은 부담 덩어리(대출 없이)에 12개를 넣어 10개 상한을 넘긴다.
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...CASH_UNIT,
      complexKey: `11680|테스트동|2015|현금단지${i}`,
      complexName: `현금단지${i}`,
      // 부담률 오름차순 정렬이 예측 가능하도록 가격을 조금씩 올린다.
      minPrice: 200_000_000 + i * 1_000_000,
      maxPrice: 210_000_000 + i * 1_000_000,
    }));
    const { container, markers } = await renderResults(many);

    await vi.waitFor(() => expect(markers.length).toBe(12));
    // 전제: 12번째 단지는 아직 목록에 없다.
    expect(
      screen.queryByRole("button", { name: /현금단지11/ }),
    ).not.toBeInTheDocument();

    markers[11]!.listeners.click!();

    await vi.waitFor(() => {
      expect(
        screen.getByRole("button", { name: /현금단지11/ }),
      ).toBeInTheDocument();
    });
    const focused = container.querySelector(".complex-row--focused");
    expect(focused?.textContent).toContain("현금단지11");
  });

  /**
   * Task 5 — 예산 상세 패널(design.md §5).
   *
   * 상단바의 "실구매 가능 가격"을 누르면 예산 블록(가정 문구·BudgetResult·
   * 슬라이더·안전선)이 사이드바 위에 오버레이로 펼쳐진다.
   */
  describe("예산 상세 패널", () => {
    /** 트리거(상단바의 "실구매 가능 가격" 항목) */
    function trigger() {
      return screen.getByRole("button", { name: /실구매 가능 가격/ });
    }

    function panel(container: HTMLElement) {
      return container.querySelector(".budget-panel");
    }

    /**
     * 패널이 열려 있는 동안 그 **뒤에 완전히 가려지는** 사이드바가
     * 키보드 초점을 받지 않는지(리뷰 findings M2).
     *
     * `.budget-panel`은 372px 사이드바 열을 정확히 덮는 절대 배치
     * 오버레이인데(styles.css), DOM 순서는 패널 → 사이드바다. `inert`가
     * 없으면 패널을 지나 Tab을 계속 누를 때 보이지 않는 행정동
     * `<select>`와 `.complex-row` 버튼에 초점이 간다 — 그 상태에서
     * Enter를 누르면 평형이 선택되고 패널이 발밑에서 닫힌다
     * (WCAG 2.4.3 초점 순서 / 2.4.7 초점 표시).
     *
     * **"지도 조작을 막지 않는다"와 충돌하지 않는다.** 브리프가 지키려는
     * 것은 지도의 조작성이고, 지도는 사이드바 열 밖(`.region-results-map`)
     * 이라 `inert`가 닿지 않는다 — 마커는 그대로 눌린다. 아래 마지막
     * 테스트가 그 사실을 함께 못박는다.
     *
     * ⚠ **jsdom은 `inert`를 강제하지 않는다**(이 저장소가 이미 아는
     * 함정 — progress.md의 Task 3 항목). 그래서 이 테스트는 "Tab이 실제로
     * 건너뛰는가"를 확인할 수 없고, **속성이 붙는가**만 확인한다. 브라우저
     * 쪽 동작은 `inert` 명세에 맡긴다.
     */
    it("패널이 열려 있는 동안 사이드바가 inert다", async () => {
      const { container } = await renderResults();
      const sidebar = container.querySelector(".region-results-sidebar")!;

      // 닫혀 있는 동안에는 당연히 조작할 수 있어야 한다.
      expect(sidebar).not.toHaveAttribute("inert");

      await userEvent.click(trigger());
      expect(panel(container)).not.toHaveClass("budget-panel--closed");
      expect(sidebar).toHaveAttribute("inert");

      await userEvent.click(trigger());
      expect(sidebar).not.toHaveAttribute("inert");
    });

    it("패널이 열려도 지도 열은 inert가 아니다", async () => {
      const { container } = await renderResults();
      await userEvent.click(trigger());

      expect(container.querySelector(".region-results-map")).not.toHaveAttribute(
        "inert",
      );
      // 지도가 사이드바의 자손이 아니라는 것도 함께 못박는다 — 자손이면
      // 사이드바에 건 inert가 지도까지 끌고 들어간다.
      expect(
        container
          .querySelector(".region-results-sidebar")!
          .contains(container.querySelector(".region-results-map")),
      ).toBe(false);
    });

    it("패널이 열린 채 마커를 누르면 패널이 닫히고 그 단지가 강조된다", async () => {
      const { container, markers } = await renderResults();
      await vi.waitFor(() => expect(markers.length).toBe(2));

      await userEvent.click(trigger());
      expect(panel(container)).not.toHaveClass("budget-panel--closed");

      markers[1]!.listeners.click!();

      await vi.waitFor(() => {
        expect(panel(container)).toHaveClass("budget-panel--closed");
        expect(
          container.querySelector(".region-results-sidebar"),
        ).not.toHaveAttribute("inert");
      });
      const focused = container.querySelector(".complex-row--focused");
      expect(focused?.textContent).toContain("대출단지");
    });

    it("상단바의 '실구매 가능 가격'이 버튼이고, 누르면 예산 상세가 펼쳐진다", async () => {
      const { container } = await renderResults();

      const button = trigger();
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(panel(container)).toHaveClass("budget-panel--closed");

      await userEvent.click(button);

      expect(trigger()).toHaveAttribute("aria-expanded", "true");
      expect(panel(container)).not.toHaveClass("budget-panel--closed");

      // 브리프가 지정한 내용물이 그 안에 들어 있다 — 컴포넌트도 prop도
      // 그대로이고 자리만 옮겼다.
      const open = panel(container)!;
      expect(open.querySelector(".budget-result")).not.toBeNull();
      expect(open.querySelector(".assumption-line")).not.toBeNull();
      expect(open.querySelector(".price-slider")).not.toBeNull();
      expect(open.querySelector(".safe-line")).not.toBeNull();
    });

    it("다시 누르면 닫힌다", async () => {
      const { container } = await renderResults();
      await userEvent.click(trigger());
      await userEvent.click(trigger());
      expect(panel(container)).toHaveClass("budget-panel--closed");
    });

    it("Esc로 닫힌다", async () => {
      const { container } = await renderResults();
      await userEvent.click(trigger());
      expect(panel(container)).not.toHaveClass("budget-panel--closed");

      await userEvent.keyboard("{Escape}");

      expect(panel(container)).toHaveClass("budget-panel--closed");
      // 포커스는 열었던 자리로 돌아온다 — 안 그러면 키보드 사용자는
      // 사라진 요소 자리에 남아 문서 맨 앞으로 튕긴다.
      expect(trigger()).toHaveFocus();
    });

    it("닫기 버튼으로도 닫힌다", async () => {
      const { container } = await renderResults();
      await userEvent.click(trigger());

      await userEvent.click(screen.getByRole("button", { name: "닫기" }));

      expect(panel(container)).toHaveClass("budget-panel--closed");
    });

    /**
     * dispatch A — **0원일 때도 열린다.**
     *
     * 그때가 사용자가 "왜 0원인가"를 가장 알고 싶은 순간이고, 그 답
     * (`ZeroBudgetMessage`·`BindingExplainer`·`AssumptionLine`)이 바로
     * 이 패널 안에 있다. 0원일 때만 죽은 버튼으로 두면 Task 3이 리뷰에서
     * 잡힌 실패(누르라고 적어 놓고 아무 일도 안 하던 가정 칩)를 그대로
     * 재현한다.
     */
    it("실구매 가능 가격이 0원이어도 버튼이고, 열면 그 원인이 들어 있다", async () => {
      const { container } = await renderResults([CASH_UNIT, LOAN_UNIT], {
        cash: "100",
      });

      // 전제: 실제로 0원 상태다.
      expect(container.querySelector(".no-budget")).not.toBeNull();

      const button = trigger();
      expect(button.textContent).toContain(ZERO_BUDGET_HEADLINE);

      await userEvent.click(button);

      const open = panel(container)!;
      expect(open).not.toHaveClass("budget-panel--closed");
      // 0원 분기에서 `BudgetResult`가 그리는 것은 `ZeroBudgetMessage`다 —
      // 원인 갈래(현금 부족 / 상환능력 0)까지 여기서 갈린다.
      // (`binding-explainer`는 `affordablePrice > 0` 분기에만 있다.
      // `BudgetResult`의 구조는 이 태스크에서 손대지 않는다.)
      expect(open.querySelector(".no-budget")).not.toBeNull();
      // 그리고 그 원인을 고칠 수 있는 자리(가정 칩)가 같은 패널 안에 있다.
      expect(open.querySelector(".assumption-line")).not.toBeNull();
      expect(open.querySelector(".warning-list")).not.toBeNull();
    });

    /**
     * dispatch 1 — `phase === "입력"`(화면 1이 덮고 있을 때) 결과 트리는
     * 통째로 `inert`다. 그때 패널의 `Esc` 핸들러가 살아 있으면 안 된다 —
     * 화면 1에서 Esc를 눌렀는데 보이지도 않는 뒤쪽 패널이 닫히는 것은
     * 유령 동작이다. `inert`는 document 레벨 키 리스너를 막지 못하므로
     * 상태 쪽에서 막아야 한다.
     *
     * dispatch 2 — 그리고 돌아오면 어떤 상태인가: 열어 둔 그대로다.
     * "조건 다시 넣기"는 화면 전환일 뿐 리셋이 아니라는 기존 계약과
     * 같은 방향이다.
     */
    it("화면 1로 돌아가면 패널이 닫히고, 결과로 돌아오면 다시 열려 있다", async () => {
      const { container } = await renderResults();
      await userEvent.click(trigger());
      expect(panel(container)).not.toHaveClass("budget-panel--closed");

      await userEvent.click(
        screen.getByRole("button", { name: "조건 다시 넣기" }),
      );

      // 화면 1이 덮은 동안에는 닫힌 것으로 그린다.
      expect(panel(container)).toHaveClass("budget-panel--closed");
      expect(trigger()).toHaveAttribute("aria-expanded", "false");

      // 그리고 Esc는 아무 일도 하지 않는다 — 핸들러가 아예 붙어 있지 않다.
      await userEvent.keyboard("{Escape}");
      expect(panel(container)).toHaveClass("budget-panel--closed");

      await userEvent.click(
        screen.getByRole("button", { name: "이 지역으로 조회하기" }),
      );
      expect(panel(container)).not.toHaveClass("budget-panel--closed");
    });

    /**
     * dispatch 4 — 패널은 지도를 덮지 않으므로 마커는 계속 눌린다. 그런데
     * 마커가 바꾸는 것(목록의 선택 행)은 패널 **뒤**에 있다 — 닫지 않으면
     * 누른 사람에게는 아무 일도 일어나지 않은 것으로 보인다.
     */
    it("패널이 열린 채 지도 마커를 누르면 패널이 물러나고 그 행이 드러난다", async () => {
      const { container, markers } = await renderResults();
      await vi.waitFor(() => expect(markers.length).toBe(2));

      await userEvent.click(trigger());
      expect(panel(container)).not.toHaveClass("budget-panel--closed");

      markers[1]!.listeners.click!();

      await vi.waitFor(() => {
        expect(panel(container)).toHaveClass("budget-panel--closed");
        const focused = container.querySelector(".complex-row--focused");
        expect(focused?.textContent).toContain("대출단지");
      });
    });

    /**
     * dispatch 3 — 패널이 무엇을 덮는가. jsdom은 레이아웃을 계산하지
     * 않으므로 "덮는다"를 픽셀로 물을 수 없다 — 대신 **어느 칸에 붙어
     * 있는가**를 구조로 확인한다. 지도 칸(`.region-results-map`) 밖에
     * 있어야 지도 조작을 막지 않는다(실제 픽셀은 보고서 §6의 브라우저
     * 실측).
     */
    it("패널은 결과 그리드 안, 지도 칸 밖에 붙는다", async () => {
      const { container } = await renderResults();
      const el = panel(container)!;

      expect(container.querySelector(".region-results-grid")!.contains(el)).toBe(
        true,
      );
      expect(container.querySelector(".region-results-map")!.contains(el)).toBe(
        false,
      );
      expect(
        container.querySelector(".region-results-sidebar")!.contains(el),
      ).toBe(false);
    });

    /**
     * dispatch C — **이 태스크에서 가장 위험한 자리.**
     *
     * 패널 안에 든 것들은 `MUST_SURVIVE_PRINT_CLASSES`가 지키는 값·문구다.
     * 닫혀 있을 때 **언마운트하거나** 인쇄에도 닿는 `display: none`으로
     * 두면, 패널을 닫은 채 Cmd+P를 누른 사람의 종이에서 그것들이 통째로
     * 사라진다. Cmd+P는 어느 단계에서든 눌린다.
     *
     * 여기서는 리액트 쪽 절반(언마운트하지 않는다)을 잡는다 — CSS 쪽
     * 절반(그 숨김이 `@media print`에 닿지 않는다)은
     * `scripts/printCss.test.ts`가 구조로 잠근다.
     *
     * 목록을 열거하지 않고 **열었을 때 실제로 있던 것과 대조**한다 —
     * 프로필에 따라 조건부로 나타나는 클래스가 섞여 있어, 손으로 적으면
     * 그 목록이 화면과 조용히 어긋난다.
     */
    const PANEL_PRINT_CLASSES = [
      "no-budget",
      "binding-explainer",
      "cost-breakdown",
      "policy-loan-list",
      "slider-price",
      "slider-warning",
      "safe-line",
      "assumption-line",
      "assumption-item",
      "assumption-notice",
    ];

    function protectedPresent(container: HTMLElement): string[] {
      return PANEL_PRINT_CLASSES.filter(
        (cls) => container.querySelector(`.${cls}`) !== null,
      );
    }

    it("패널을 닫아도 보호 대상 클래스가 DOM에서 하나도 사라지지 않는다(양수 예산)", async () => {
      const { container } = await renderResults();

      await userEvent.click(trigger());
      const whileOpen = protectedPresent(container);
      // 전제: 실제로 여러 개가 있었다. 없으면 아래 대조가 공허하다.
      expect(whileOpen.length).toBeGreaterThanOrEqual(6);

      await userEvent.click(trigger());
      expect(panel(container)).toHaveClass("budget-panel--closed");
      expect(protectedPresent(container)).toEqual(whileOpen);
    });

    it("0원 프로필에서도, 단지 상세를 연 채로도 마찬가지다", async () => {
      const zero = await renderResults([CASH_UNIT, LOAN_UNIT], { cash: "100" });
      await userEvent.click(trigger());
      const zeroOpen = protectedPresent(zero.container);
      expect(zeroOpen).toContain("no-budget");
      await userEvent.click(trigger());
      expect(protectedPresent(zero.container)).toEqual(zeroOpen);
      zero.unmount();

      const { container } = await renderResults();
      await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
      expect(
        screen.getByRole("region", { name: "단지 상세" }),
      ).toBeInTheDocument();

      await userEvent.click(trigger());
      const whileOpen = protectedPresent(container);
      await userEvent.click(trigger());
      expect(protectedPresent(container)).toEqual(whileOpen);
      // 상세도 여전히 그 자리에 있다 — 패널은 덮을 뿐 걷어 가지 않는다.
      expect(
        screen.getByRole("region", { name: "단지 상세" }),
      ).toBeInTheDocument();
    });
  });

  /**
   * Task 5 Step 2·3 — 사이드바가 목록 ↔ 상세로 전환되고, 진단 종합은
   * 상세 안(뒤)으로 들어간다.
   */
  describe("사이드바 전환과 진단 종합의 자리", () => {
    it("목록 화면에는 진단 종합이 없고, 상세를 열면 상세 뒤에 붙는다", async () => {
      const { container } = await renderResults();
      const sidebar = container.querySelector(".region-results-sidebar")!;

      // 목록 상태에서는 네 축이 전부 null이라 "아무것도 못 봤다"만 그리는
      // 자리였다 — 그 자리를 상세 안으로 옮겼다(design.md §5).
      expect(container.querySelector(".diagnosis-summary")).toBeNull();
      // 면책은 그 자리에 그대로다.
      expect(sidebar.querySelector(".disclaimer")).not.toBeNull();

      await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));

      const diagnosis = container.querySelector(".diagnosis-summary");
      expect(diagnosis).not.toBeNull();
      expect(sidebar.contains(diagnosis!)).toBe(true);
      // 상세 **뒤**에 온다 — 사이드바의 같은 열이라 시각적으로 이어 붙는다.
      const detail = container.querySelector(".complex-detail")!;
      expect(
        detail.compareDocumentPosition(diagnosis!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(container.querySelectorAll(".diagnosis-summary")).toHaveLength(1);
    });

    it("목록으로 돌아가면 진단 종합은 사라지고 면책은 남는다", async () => {
      const { container } = await renderResults();
      await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
      expect(container.querySelector(".diagnosis-summary")).not.toBeNull();

      await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));

      expect(container.querySelector(".diagnosis-summary")).toBeNull();
      expect(container.querySelector(".disclaimer")).not.toBeNull();
      expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);
    });

    /**
     * dispatch B — **투자 경로의 `DiagnosisSummary`는 건드리지 않는다.**
     * 거기엔 실제 `purchase` 판정이 있고 `ComplexDetail`이 아예 없다.
     */
    it("투자 경로의 진단 종합과 면책은 그대로다", async () => {
      const { container } = await renderResults();
      await userEvent.click(
        screen.getByLabelText(new RegExp(purchaseRules.types.월세수익형.label)),
      );

      expect(container.querySelector(".diagnosis-summary")).not.toBeNull();
      expect(container.querySelector(".disclaimer")).not.toBeNull();
    });
  });
});
