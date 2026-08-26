import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ComplexUnit } from "./data/complexes";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import * as loadNaverMaps from "./lib/loadNaverMaps";
import * as regionQuery from "./lib/regionQuery";
import {
  MUST_SURVIVE_PRINT_CLASSES,
  PRINT_HIDDEN_SELECTORS,
} from "./print/hiddenInPrint";
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
      const { container } = render(<App />);

      function check(phase: string) {
        for (const selector of PRINT_HIDDEN_SELECTORS) {
          for (const hidden of container.querySelectorAll(selector)) {
            for (const cls of MUST_SURVIVE_PRINT_CLASSES) {
              expect(
                hidden.querySelector(`.${cls}`),
                `${phase} 단계에서 ${selector} 안에 .${cls}가 있습니다 — ` +
                  "조상이 인쇄에서 지워지면 이 보호 대상도 함께 사라집니다.",
              ).toBeNull();
            }
          }
        }
      }

      check("입력");
      await fillProfile();
      check("결과");
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
