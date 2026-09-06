import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  // 85㎡ 초과다. 사용자 지시로 평형대 질문이 사라진 뒤, 헤드라인은
  // 언제나 룰셋 임계값(85㎡) 이하를 가정하므로 이 평형(90㎡)의 상세를
  // 열면 그 가정을 넘어서 부대비용이 달라진다 — 그 차이를 직접 보는
  // 테스트는 아래 WIDE_DETAIL_UNIT(전용 100㎡, 같은 이유로 다르다는
  // 것을 한 번 더 확인한다)을 쓴다.
  areaBucket: 90,
  maxExclusiveAreaSqm: 90,
  landLeasehold: "N",
  tradeCount: 3,
  minPrice: 190_000_000,
  maxPrice: 210_000_000,
  minFloor: 3,
  maxFloor: 18,
  unknownFloorCount: 0,
  address: null,
  householdCount: null,
  trades: [],
  lowConfidence: false,
};

/**
 * 지역을 고르고 그 결과로 단지 목록을 받는다(기본값은
 * {@link DETAIL_TEST_UNIT} 하나).
 *
 * `isRegulatedArea`는 `null`("모르는 지역")로 둔다. 불리언을 주면 App이
 * 그 값을 폼에 반영하면서 규제지역이 **가정에서 확정으로** 바뀌는데,
 * 아래 테스트들은 전용면적 가정·상세 화면·인쇄 요약을 보는 것이라 그
 * 축과 무관하다 — 예전 흐름에서도 규제지역은 가정인 채였다.
 */
async function selectTestRegion(units: ComplexUnit[] = [DETAIL_TEST_UNIT]) {
  vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
    units,
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

  /*
   * 지역 선택 카드는 이제 화면 1의 3번째 자리(연 소득 다음)에 사용자
   * 지시로 항상 그려진다 — 예산을 확정하기 전에 숨기는 대신, 조회
   * 버튼만 잠근다(`RegionSelect.tsx`의 disabled prop). 예산 없이 조회가
   * 성공하면 화면이 빈 결과 셸로 넘어가는 사고(이 저장소가 여섯 번
   * 반복한 실패의 형태, 커밋 `c90babf`)를 이 잠금이 막는다.
   */
  it("예산을 확정하기 전에도 지역 선택 카드는 보이지만, 구를 골라도 조회 버튼은 비활성화돼 있다", async () => {
    render(<App />);
    expect(screen.getByLabelText("광역단체")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    expect(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    ).toBeDisabled();
  });

  it("현금·소득·주택 수·평형대를 모두 정하면 조회 버튼이 활성화된다", async () => {
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
    expect(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    ).not.toBeDisabled();
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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
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
 * ⚠ **평형대 필터가 만든 새 빈 상태를 잠근다.**
 *
 * 0건의 원인이 하나 늘었다. "이 지역엔 거래가 없어요"·"그 평형대엔
 * 매물이 없어요"·"이 동엔 조건에 맞는 단지가 없어요"·"예산으로는 못
 * 사요"는 **서로 다른 말**이고, 사용자가 넓혀야 할 축이 각각 지역·
 * 평형대·동·예산으로 다르다. 섞으면 틀린 해법을 준다 — 이 저장소가 여섯
 * 번 반복한 실패의 정확한 형태다.
 */
describe("App - 매매가·면적·입주년차 슬라이더 필터", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // 슬라이더는 지도의 "필터" 버튼 팝오버 안에 있다(사용자 지시로
    // 사이드바에서 옮겼다) — 지도는 좌표 조회(complexCoordinates)가
    // success여야 뜬다. 실 네트워크로 나가지 않게 고정한다.
    vi.spyOn(regionQuery, "fetchComplexCoordinates").mockResolvedValue({
      units: [
        { complexKey: "11680|테스트동|2015|테스트단지", lat: 37.1, lon: 127.1 },
        { complexKey: "11680|테스트동|2015|소형단지", lat: 37.2, lon: 127.2 },
      ],
      partialFailureCount: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 전용 90㎡ */
  const LARGE_UNIT = DETAIL_TEST_UNIT;
  /** 전용 45㎡ — 나머지는 LARGE_UNIT과 같다(면적만 다르다) */
  const SMALL_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|테스트동|2015|소형단지",
    complexName: "소형단지",
    areaBucket: 45,
    maxExclusiveAreaSqm: 45,
  };

  async function fillMoney() {
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
  }

  async function chooseRegion() {
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
  }

  it("면적 슬라이더로 좁히면 그 범위 밖 매물이 목록에서 빠진다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [SMALL_UNIT, LARGE_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillMoney();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });
    expect(screen.getByText("소형단지")).toBeInTheDocument();
    expect(screen.getByText("테스트단지")).toBeInTheDocument();

    // 면적 최대를 한 스텝 내려 90㎡(LARGE_UNIT)를 범위 밖으로 민다.
    // 슬라이더는 지도의 "필터" 버튼 팝오버 안에 있다(사용자 지시로
    // 사이드바에서 옮겼다 — ComplexMap.tsx의 filterBounds 문서 참고).
    // SEED 슬라이더는 화살표 키가 움직일 손잡이를 focus로 기억한다 —
    // keyDown 전에 반드시 그 손잡이로 focus를 먼저 보낸다
    // (RangeSlider.test.tsx의 같은 주석 참고).
    fireEvent.click(await screen.findByRole("button", { name: "필터" }));
    const areaMax = screen.getByRole("slider", { name: "면적 (전용) 최대" });
    fireEvent.focus(areaMax);
    fireEvent.keyDown(areaMax, { key: "ArrowLeft" });

    await screen.findByText("소형단지");
    expect(screen.queryByText("테스트단지")).not.toBeInTheDocument();
  });

  /**
   * 거래는 있었고 예산도 넉넉하다 — 원인은 오직 필터다. 그 사실을
   * 말하고, 지역·예산·동 탓으로 돌리지 않는다.
   */
  it("필터 범위 밖이라 0건이면 그 축(면적) 탓이라고 말한다", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [SMALL_UNIT, LARGE_UNIT],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillMoney();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    // 면적을 [55, 80]으로 좁힌다 — 45(소형)도 90(테스트단지)도 이 범위
    // 밖이다. 매매가·입주년차는 둘 다 그대로라(SMALL_UNIT이 LARGE_UNIT과
    // 면적만 다르다) 도움이 되는 축은 면적 하나뿐이다. 각 키다운 전에
    // focus를 먼저 보낸다(위 "면적 슬라이더로 좁히면" 테스트와 같은
    // 이유). 슬라이더는 "필터" 버튼 팝오버 안에 있다.
    fireEvent.click(await screen.findByRole("button", { name: "필터" }));
    const areaMin = screen.getByRole("slider", { name: "면적 (전용) 최소" });
    fireEvent.focus(areaMin);
    fireEvent.keyDown(areaMin, { key: "PageUp" });
    const areaMax = screen.getByRole("slider", { name: "면적 (전용) 최대" });
    fireEvent.focus(areaMax);
    fireEvent.keyDown(areaMax, { key: "PageDown" });

    await screen.findByText(/면적 범위에 해당하는 매물이/);
    expect(screen.getByText(/면적 범위를 넓혀 보세요/)).toBeInTheDocument();
    // 다른 세 원인은 말하지 않는다.
    expect(screen.queryByText(/실거래가 자체가 없어요/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/살 수 있는 단지가 이 데이터에는 없어요/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/이 동엔 조건에 맞는 단지가 없어요/)).toBeNull();
  });

  /**
   * 거래가 아예 없는 지역에서는 필터를 탓하지 않는다 — 필터를 넓혀도
   * 결과가 달라지지 않으므로 그 조언은 거짓이다.
   */
  it("지역에 거래가 아예 없으면 지역 탓이라고 말한다(대조군)", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    await fillMoney();
    await chooseRegion();
    await screen.findByText(/실거래가 자체가 없어요/);

    expect(screen.queryByText(/범위에 해당하는 매물이/)).toBeNull();
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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "10000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "0");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
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
    // 아니라. 이 버그가 살아 있으면 사이드바가 상세를 그린 채라 목록이
    // 아예 없고, 목록을 기다리면 실패가 "타임아웃"으로만 보여 무엇이
    // 잘못됐는지 가려진다(실제로 처음 이 테스트를 쓸 때 그랬다).
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

  /**
   * 예전에는 이 자리가 "가정 칩으로 화면 1에 돌아가는" 경로였다. 화면 1이
   * 네 질문으로 줄면서 고칠 입력란이 사라졌고, 칩도 함께 사라졌다(가정
   * 문구는 이제 전부 순수 정보다). 남은 경로는 **예산 상세 패널을 연 채
   * "조건 다시 넣기"로 돌아가는 것**이고, 그 경로도 같은 상태에 닿는지
   * 여기서 잠근다 — 패널이 열려 있어도 상세 리셋이 빠지지 않아야 한다.
   */
  it("예산 패널을 연 채 화면 1에 돌아가 다시 조회해도 마찬가지다", async () => {
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

    // 상단바의 "실구매 가능 가격"을 눌러 예산 상세 패널을 연다.
    await userEvent.click(
      screen.getByRole("button", { name: /실구매 가능 가격/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "조건 다시 넣기" }));

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
  async function fillProfile(units?: ComplexUnit[]) {
    // "150000"·"15000"은 단위 없이 쓴 만원 표기다(MoneyInput 기본
    // 해석) — 각각 15억, 1억 5천만원.
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
    await selectTestRegion(units);
  }

  /**
   * 전용 59㎡ — **임계값 이하**다.
   *
   * 헤드라인은 기본 선택(전체)에서 85㎡ 초과를 가정하므로, 이 평형의
   * 상세를 열면 계산이 농특세 미부과 구간으로 넘어가 숫자가 실제로
   * 달라진다. 90㎡짜리 기본 픽스처로는 그 차이가 나지 않는다 — 둘 다
   * 85㎡ 초과 구간이라 같은 값이 나오고, 그러면 그 테스트가 아무것도
   * 증명하지 못한다.
   */
  const WIDE_DETAIL_UNIT: ComplexUnit = {
    ...DETAIL_TEST_UNIT,
    complexKey: "11680|테스트동|2015|넓은단지",
    complexName: "넓은단지",
    areaBucket: 100,
    maxExclusiveAreaSqm: 100,
  };

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
      screen.queryByRole("group", { name: "어느 지역에 살고 싶으세요?" }),
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

  it("상세가 열린 동안에는 실구매 가능 가격이 그 평형 기준으로 바뀌고, 목록으로 돌아가면 원래 값으로 되돌아간다", async () => {
    const { container } = render(<App />);
    await fillProfile([WIDE_DETAIL_UNIT]);

    const priceBefore = container.querySelector(".result-topbar-item-value--money")?.textContent;

    await userEvent.click(screen.getByRole("button", { name: /넓은단지/ }));
    const priceWhileOpen = container.querySelector(".result-topbar-item-value--money")?.textContent;
    // 상세가 열려 있는 동안에는 이 평형(전용 100㎡)의 실제 면적 기준으로
    // 다시 계산된다 — 헤드라인은 언제나 룰셋 임계값(85㎡) 이하를
    // 가정하므로(사용자 지시로 평형대 질문이 사라졌다), 85㎡를 넘는 이
    // 평형을 열면 농특세가 붙는 쪽으로 계산이 넘어가 값이 달라야 한다.
    expect(priceWhileOpen).not.toBe(priceBefore);

    await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));
    const priceAfter = container.querySelector(".result-topbar-item-value--money")?.textContent;

    // 결함이었던 지점: 프로필에 영구히 저장하면 목록으로 돌아와도
    // priceAfter가 priceWhileOpen에 머물러 있어(원래 값으로 돌아오지
    // 않아) 실구매력이 실제보다 크게 보인다. 프로필에 저장하지 않았다면
    // 닫는 즉시 원래 가정 기준으로 되돌아가야 한다.
    expect(priceAfter).toBe(priceBefore);
  });

  it("상세를 열었다 목록으로 돌아오면 localStorage에는 상세에서 본 면적이 쓰이지 않는다", async () => {
    render(<App />);
    await fillProfile();

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
    await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));

    // 프로필(및 localStorage)에는 상세에서 본 90㎡가 전혀 쓰이지
    // 않았어야 한다 — touched에도 "area"가 없고, 전용면적은 아예 폼
    // 상태가 아니라 저장 대상 자체가 아니다.
    const stored = JSON.parse(window.localStorage.getItem("budget-profile-v1") ?? "{}");
    expect(stored.touched ?? []).not.toContain("area");
    expect(stored.exclusiveAreaSqm).toBeUndefined();
  });

  describe("리뷰 수정: 상세 화면의 배지 라벨·전용면적 입력·포커스", () => {
    /**
     * 이 화면에서 등급이 나오는 자리가 두 번 옮겨졌다. 예산 상세의
     * "최대로 빌린다면" 표는 `PriceSlider`(`.price-slider-burden`)로
     * 합쳐졌고, 단지 상세의 배지는 대출 계산기 표의 한 줄
     * (`[data-field="grade"]`)로 들어갔다 — 둘 다 사용자 지시다.
     *
     * **지켜야 하는 것은 그대로다**: 두 자리가 서로 다른 질문에 답하고,
     * 어느 쪽도 상대의 답을 덮어쓰지 않는다. 예산 상세 쪽 라벨은 단지
     * 상세를 열어도 그대로 남는다.
     */
    it("단지 상세를 열어도 예산 상세의 라벨은 그대로다 — 서로 다른 질문에 각자 답한다", async () => {
      render(<App />);
      await fillProfile();

      expect(
        screen.getByText("이 가격으로 샀을 때 최대로 빌린다면"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));

      // 단지 상세가 열려도 예산 상세 쪽 라벨은 그대로다.
      expect(
        screen.getByText("이 가격으로 샀을 때 최대로 빌린다면"),
      ).toBeInTheDocument();
      // 그리고 단지 상세는 자기 질문(이 단지, 이 평형)을 연다.
      expect(screen.getByLabelText("예상 매수금액")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));
      expect(screen.queryByLabelText("예상 매수금액")).not.toBeInTheDocument();
    });

    /** 전용면적 입력란은 화면 1이 네 질문으로 줄면서 사라졌다. */
    it("전용면적 입력란은 어떤 상태에서도 없다", async () => {
      render(<App />);
      await fillProfile();
      expect(screen.queryByLabelText("전용면적 (㎡)")).not.toBeInTheDocument();
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
   * 리뷰 수정(Important 5). "무엇이 모자란지" 안내는 그 존재 이유인 모든
   * 상태에서 100% 보이지 않는 자리에 있었다 — 실거주 경로에서 그 조건은
   * 사실상 `phase === "입력"`을 뜻하고, 그 동안 결과 트리는 불투명한
   * 오버레이 **밑에** 깔려 있기 때문이다.
   *
   * ⚠ **모자랄 수 있는 축이 둘이고, 둘은 서로 다른 말이다.** 돈(현금·연
   * 소득)이 없으면 예산 자체를 계산할 수 없고, 평형대를 하나도 고르지
   * 않았으면 계산은 되지만 보여줄 매물을 고를 수 없다 — 해야 할 일이
   * 다르므로 문구도 달라야 한다. 한 문구로 뭉치면 평형대만 비운 사용자가
   * 현금을 다시 들여다보게 된다. 이 저장소가 여섯 번 반복한 실패의
   * 형태다.
   */
  describe("리뷰 수정: 무엇이 모자란지 화면 1에서 말한다", () => {
    it("돈을 안 넣었으면 그 안내가 입력 화면 안에 있다", async () => {
      const { container } = render(<App />);

      // 전제: 구를 골라도 조회 버튼이 잠겨 있다(무엇이 모자란지 화면이
      // 말해야 하는 상태) — 버튼 자체는 이제 항상 화면에 있다(사용자
      // 지시로 지역 카드가 3번째 자리에 항상 그려지므로).
      await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
      expect(
        screen.getByRole("button", { name: "이 지역으로 조회하기" }),
      ).toBeDisabled();

      const prompt = screen.getByText(/현금·연 소득·주택 수를 알려주면/);
      const entry = container.querySelector(".entry-screen");
      // 화면 1 안에 있다 — 오버레이에 가려지는 결과 트리 쪽이 아니다.
      expect(entry?.contains(prompt)).toBe(true);
      expect(container.querySelector(".results-screen")?.contains(prompt)).toBe(
        false,
      );
      // 그 화면 1은 지금 보이는 중이다.
      expect(entry).not.toHaveClass("entry-screen--hidden");
    });

    it("돈·주택 수를 넣으면 안내가 사라지고 조회 버튼이 풀린다(대조군)", async () => {
      render(<App />);
      await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
      await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
      await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
      await userEvent.click(
        screen.getByRole("radio", { name: "무주택이에요" }),
      );

      expect(
        screen.queryByText(/현금·연 소득·주택 수를 알려주면/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "이 지역으로 조회하기" }),
      ).not.toBeDisabled();
    });

    /**
     * 돈만 넣고 주택 수를 아직 안 답했으면, 원인은 평형대가 아니라
     * 주택 수다 — 같은 안내(현금·연 소득·주택 수)가 그대로 남아야 한다.
     */
    it("돈만 넣고 주택 수를 안 답했으면 여전히 같은 안내다", async () => {
      render(<App />);
      await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
      await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
      await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");

      expect(
        screen.getByText(/현금·연 소득·주택 수를 알려주면/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "이 지역으로 조회하기" }),
      ).toBeDisabled();
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

    it("상단바 버튼도 그 안에 있다 — 오버레이 뒤에서 키보드로 눌리지 않는다", async () => {
      const { container } = render(<App />);
      await fillProfile();
      await userEvent.click(
        screen.getByRole("button", { name: "조건 다시 넣기" }),
      );
      const results = container.querySelector(".results-screen");
      expect(
        results?.contains(
          screen.getByRole("button", { name: /실구매 가능 가격/ }),
        ),
      ).toBe(true);
    });
  });

  describe("리뷰 수정: 인쇄(화면 5)", () => {
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
            // 실제 SDK의 컨트롤 위치 열거형 — ComplexMap이 로고·저작권 표기를
            // 지도 위쪽으로 옮기며 읽는다. 없으면 지도 옵션을 만들다 던진다.
            Position: { TOP_LEFT: "TOP_LEFT", TOP_RIGHT: "TOP_RIGHT" },
            Map: class {
              // 지도에도 리스너가 붙는다(zoom_changed) — 이 필드가 없으면
              // Event.addListener가 undefined에 쓰려다 던진다.
              listeners: Record<string, () => void> = {};
              // 마커 상세도가 줌으로 갈리므로 ComplexMap이 getZoom()을 읽는다.
              getZoom() {
                return 14;
              }
              // 지도 유형 토글이 부른다(ComplexMap.tsx).
              setMapTypeId() {}
              fitBounds() {}
              panTo() {}
              destroy() {}
            },
            // 지도 유형 토글이 지도를 만들 때 읽는다(`naverMapTypeId`).
            MapTypeId: { NORMAL: "normal", HYBRID: "hybrid" },
            LatLng: class {},
            LatLngBounds: class {},
            Point: class {},
            Marker: class {
              setMap() {}
            },
            // 통학구역 경계(ComplexMap의 학교 패널)가 쓰는 폴리곤.
            Polygon: class {
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
       * 보호 대상 클래스가 여럿 들어 있고(no-budget·binding-explainer·
       * cost-breakdown·policy-loan-list·slider-price·slider-warning —
       * 예전에 함께 있던 `assumption-line`·`assumption-notice`는 "계산
       * 전제" 덩어리가, `safe-line`은 헤드라인의 안전선 비교 줄이 사용자
       * 지시로 각각 삭제되며 함께 없어졌다), 그 위에 새 조상
       * (`.budget-panel`)과 새 숨김 대상(`.budget-detail-close`)이 함께
       * 생겼다 — 이 검사가 정확히 겨누는 배치다.
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
       * 예전에는 여기서 투자 경로(월세수익형)도 지났다 — 거기엔
       * `PurchaseCheck`(`.purchase-form`, 인쇄에서 숨김)와 그 바로
       * 옆의 보호 대상(`purchase-loan-note`·`purchase-verdict`·
       * `purchase-print-summary`)이라는, 이 검사가 정확히 겨누는
       * 조상-후손 배치가 있었기 때문이다. 구매 유형 선택이 제거되면서
       * 이 화면에서 그 경로에 도달할 방법이 없어졌다(컴포넌트 자체는
       * 남아 있다 — App.tsx의 결과 트리 주석 참고).
       *
       * 그 배치의 교차곱 검사는 그래서 여기서 빠졌다. 다시 붙이는
       * 날에는 이 자리에 그 상태를 되살려야 한다.
       */
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

    /**
     * 사용자 지시로 부제의 개인정보 보호 문구("입력한 재무정보는 이
     * 브라우저를 벗어나지 않아요…")를 통째로 지웠다 — .subtitle-privacy-note
     * span 자체가 이제 없다(App.tsx). 인쇄 숨김 목록(hiddenInPrint.ts)·
     * @media print 규칙에서도 이 선택자를 함께 뺐다.
     */
    it("부제에는 룰셋 기준만 남고, 개인정보 보호 문구는 없다", () => {
      const { container } = render(<App />);
      const subtitle = container.querySelector(".subtitle");

      expect(subtitle?.querySelector(".subtitle-privacy-note")).toBeNull();
      expect(subtitle?.textContent).not.toMatch(/이 브라우저를 벗어나지 않아요/);

      const expectedLabel = formatRuleVersionLabel(rules);
      expect(subtitle?.textContent).toBe(expectedLabel);
      expect(subtitle?.textContent).not.toContain("수도권");
    });

    it("목록 화면에서는 항상 룰셋 임계값 이하를 가정한다고 적고, 매물을 고르면 그 매물의 실제 면적이라고 밝힌다", async () => {
      const { container } = render(<App />);
      await fillProfile();

      // 종이에도 대표값 하나를 지어내 적지 않는다 — 헤드라인은 언제나
      // 룰셋 임계값(85㎡) 이하를 가정하고, 초과 시 고지(농특세·
      // 디딤돌대출)를 함께 적는다.
      const summaryBefore = container.querySelector(".print-summary");
      expect(summaryBefore?.textContent).toMatch(/85㎡ 이하로 가정/);
      expect(summaryBefore?.textContent).toMatch(/농어촌특별세/);
      expect(summaryBefore?.textContent).toMatch(/디딤돌대출/);

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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "150000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "15000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
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
        // 실제 SDK의 컨트롤 위치 열거형 — ComplexMap이 로고·저작권 표기를
        // 지도 위쪽으로 옮기며 읽는다. 없으면 지도 옵션을 만들다 던진다.
        Position: { TOP_LEFT: "TOP_LEFT", TOP_RIGHT: "TOP_RIGHT" },
        Map: class {
          constructor(el: HTMLElement) {
            mapContainer = el;
          }
          listeners: Record<string, () => void> = {};
          getZoom() {
            return 14;
          }
          // 지도 유형 토글이 부른다(ComplexMap.tsx).
          setMapTypeId() {}
          fitBounds() {}
          destroy() {}
        },
        // 지도 유형 토글이 지도를 만들 때 읽는다(`naverMapTypeId`).
        MapTypeId: { NORMAL: "normal", HYBRID: "hybrid" },
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
        // 통학구역 경계(ComplexMap의 학교 패널)가 쓰는 폴리곤.
        Polygon: class {
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

    // 라벨은 단지명 + 가격 범위다(면적은 더 이상 적지 않는다).
    const labels = markerEls.map((el) => el.textContent ?? "").join("|");
    expect(labels).toContain("테스트단지"); // 목록에 뜨는 단지
    expect(labels).not.toContain("비싼단지"); // 예산을 넘어 목록에 없는 단지
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

  /*
   * 예전에는 여기에 두 가지가 더 있었다 — "투자 유형을 고르면 화면 1이
   * 걷히고 잠금이 떨어진다"와 "저장된 투자 유형으로 새로 열면 처음부터
   * 잠기지 않는다". 구매 유형 선택이 제거되면서 화면 1이 걷히는 경로가
   * 지역 조회 성공 하나로 줄었고, 그 경로의 잠금·해제는 아래 전체화면
   * 셸 블록의 "셸이 서 있는 동안 문서 스크롤이 잠기고, 셸이 사라지면
   * 풀린다"가 그대로 잠근다.
   */
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
        // 실제 SDK의 컨트롤 위치 열거형 — ComplexMap이 로고·저작권 표기를
        // 지도 위쪽으로 옮기며 읽는다. 없으면 지도 옵션을 만들다 던진다.
        Position: { TOP_LEFT: "TOP_LEFT", TOP_RIGHT: "TOP_RIGHT" },
        Map: class {
          constructor(el: HTMLElement) {
            mapContainer = el;
          }
          listeners: Record<string, () => void> = {};
          getZoom() {
            return 14;
          }
          // 지도 유형 토글이 부른다(ComplexMap.tsx).
          setMapTypeId() {}
          fitBounds() {}
          panTo(coord: unknown) {
            panToCalls.push(coord);
          }
          destroy() {}
        },
        // 지도 유형 토글이 지도를 만들 때 읽는다(`naverMapTypeId`).
        MapTypeId: { NORMAL: "normal", HYBRID: "hybrid" },
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
        // 통학구역 경계(ComplexMap의 학교 패널)가 쓰는 폴리곤.
        Polygon: class {
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
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), cash);
    await userEvent.type(screen.getByLabelText(/연 소득은요/), income);
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));
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
  it("면책 문구가 셸 **안**에 있다 — 고정 레이어 뒤에 깔리지 않는다", async () => {
    const { container } = await renderResults();
    const shell = container.querySelector(".result-shell");

    const disclaimer = container.querySelector(".disclaimer");
    expect(disclaimer).not.toBeNull();
    expect(shell?.contains(disclaimer!)).toBe(true);
    // 화면에 한 벌만 있다 — 두 자리에 각각 적으면 갈라진다.
    expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);

    // 상세를 열어도 같은 자리에 그대로 한 벌이다.
    await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
    expect(shell?.contains(container.querySelector(".disclaimer")!)).toBe(true);
    expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);
  });

  /**
   * **면책은 그대로 남는다**(`disclaimer`는 MUST_SURVIVE_PRINT_CLASSES라
   * 이 상태의 종이에서도 사라지면 안 된다).
   */
  it("프로필이 아직 안 끝났으면 셸을 세우지 않지만, 면책은 그대로 남는다", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".result-shell")).toBeNull();
    expect(container.querySelector(".disclaimer")).not.toBeNull();
  });

  it("상단바가 전제와 결과를 요약하고, 조건 다시 넣기가 그 안에 선다", async () => {
    const { container } = await renderResults();
    const topbar = container.querySelector(".result-topbar");

    expect(topbar?.textContent).toContain("사용가능 현금 예산");
    expect(topbar?.textContent).toContain("연 소득(세전)");
    expect(topbar?.textContent).toContain("실구매 가능 가격");
    /*
     * 현금·소득은 **고칠 수 있는 입력란**이라(사용자 지시로 상단바에서
     * 직접 바꾼다) 값이 textContent가 아니라 `input.value`에 있다.
     * `commitOn="blur"`의 계약대로 확정 표기(`formatWon`)로 적혀 있다 —
     * 사용자에게 보이는 글자는 예전과 같다.
     */
    expect(screen.getByLabelText("사용가능 현금 예산")).toHaveValue("15억원");
    expect(screen.getByLabelText("연 소득(세전)")).toHaveValue("1억 5,000만원");
    // 금액이 있는 프로필에서는 그 자리가 황동 강조다 — 아래 0원 테스트의 대조군.
    expect(
      topbar?.querySelector(".result-topbar-item-value--money"),
    ).not.toBeNull();
    // 지역은 코드가 아니라 이름으로 적는다.
    expect(topbar?.textContent).toContain("서울특별시 강남구");
    expect(topbar?.textContent).not.toContain("11680");

    expect(
      topbar?.contains(screen.getByRole("button", { name: "조건 다시 넣기" })),
    ).toBe(true);
  });

  /*
   * 사용자 지시: "지도페이지 들어온 후 조건변경은 상단 사이드 바에서
   * 직접하고싶어, 사용가능 현금예산, 연소득, 지역을 직접 변경할 수 있도록
   * 해줘." — 아래 셋이 그 세 자리다.
   */
  describe("상단바에서 조건을 그 자리에서 바꾼다", () => {
    it("현금을 고쳐 벗어나면 실구매 가능 가격이 다시 계산된다", async () => {
      const { container } = await renderResults();
      const topbar = () => container.querySelector(".result-topbar")!;
      const before = topbar().textContent ?? "";

      const cash = screen.getByLabelText("사용가능 현금 예산");
      await userEvent.clear(cash);
      await userEvent.type(cash, "50000"); // 5억
      /*
       * `commitOn="blur"`라 **벗어나야** 확정된다 — 타이핑 중간값마다
       * 아래 계산 전부가 다시 도는 것을 막는 계약이다.
       */
      expect(topbar().textContent).toBe(before);

      await userEvent.tab();
      // 확정되면 입력란 자신이 사람이 읽는 표기로 바뀐다.
      expect(cash).toHaveValue("5억원");
      expect(topbar().textContent).not.toBe(before);
    });

    it("소득을 고쳐 벗어나면 그 값이 확정 표기로 남는다", async () => {
      await renderResults();
      const income = screen.getByLabelText("연 소득(세전)");
      await userEvent.clear(income);
      await userEvent.type(income, "9000");
      await userEvent.tab();
      expect(income).toHaveValue("9,000만원");
    });

    /**
     * 지역은 고르는 순간 조회가 나간다 — 결과를 이미 보고 있는 중이라
     * 버튼을 한 번 더 누르게 하면 "직접 변경"이 아니다
     * (`RegionQuickSelect` 주석 참고).
     *
     * **입력 화면의 지역 select와 라벨이 달라야 한다** — 두 화면이 함께
     * 마운트돼 있어서, 같은 라벨이면 이 질의가 어느 화면인지 못 고른다.
     */
    it("상단바에서 자치구를 고르면 그 지역으로 곧바로 다시 조회한다", async () => {
      await renderResults();
      const spy = vi.spyOn(regionQuery, "fetchRegionComplexes");
      spy.mockClear();

      await userEvent.selectOptions(screen.getByLabelText("시·군·구 바꾸기"), "11650");

      await vi.waitFor(() => expect(spy).toHaveBeenCalledWith("11650", null));
      // 입력 화면의 라벨은 그대로 하나뿐이다(문서에 두 벌이 생기지 않았다).
      expect(screen.getByLabelText("자치구")).toBeInTheDocument();
    });

    it("조회 중에는 지역 select가 잠기고, 진행을 말한다", async () => {
      await renderResults();
      // 응답을 붙잡아 두어 loading 상태를 관찰한다.
      let release: (() => void) | undefined;
      vi.spyOn(regionQuery, "fetchRegionComplexes").mockImplementation(
        () => new Promise((resolve) => {
          release = () =>
            resolve({ units: [], isRegulatedArea: null, dataAsOf: "2026-01" });
        }),
      );

      await userEvent.selectOptions(screen.getByLabelText("시·군·구 바꾸기"), "11650");

      await screen.findByText("새 지역을 불러오는 중이에요…");
      expect(screen.getByLabelText("시·군·구 바꾸기")).toBeDisabled();
      expect(screen.getByLabelText("시·도 바꾸기")).toBeDisabled();
      release?.();
    });

    /**
     * 사용자 지시: "맵에서 지역을 바꾸면 지도가 없어진 상태에서 호출이
     * 되는데... 렌더링 되는 동안에는 맵을 그대로 둔 상태에서 호출되도록
     * 보완해줘." 옛 지도(마커·목록)를 그대로 둔 채 새 지역 조회가
     * 끝나기를 기다리는지, 그 사이 지도가 통째로 사라지지 않는지를
     * 확인한다(App.tsx의 `mapDisplayData`/`mapSnapshot` 참고).
     */
    it("지역을 바꾸는 동안 지도가 사라지지 않고, 옛 데이터를 보여주다 새 데이터로 자연스럽게 바뀐다", async () => {
      await renderResults();
      await screen.findByRole("region", { name: "단지 지도" });

      let release: (() => void) | undefined;
      const NEW_REGION_UNIT: ComplexUnit = {
        ...DETAIL_TEST_UNIT,
        complexKey: "11650|새동|2015|새지역단지",
        complexName: "새지역단지",
        areaBucket: 59,
        maxExclusiveAreaSqm: 59,
        minPrice: 300_000_000,
        maxPrice: 300_000_000,
      };
      vi.spyOn(regionQuery, "fetchRegionComplexes").mockImplementation(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                units: [NEW_REGION_UNIT],
                isRegulatedArea: null,
                dataAsOf: "2026-02",
              });
          }),
      );

      await userEvent.selectOptions(screen.getByLabelText("시·군·구 바꾸기"), "11650");

      // 새 지역 응답이 오기 전이다 — 그래도 지도는 그대로 하나 서 있다
      // (unmount로 사라지지도, 두 벌로 겹치지도 않는다).
      expect(screen.getAllByRole("region", { name: "단지 지도" })).toHaveLength(1);
      // "지금 보고 있는 게 옛 지역"이라는 단서가 함께 뜬다.
      expect(screen.getByText("새 지역을 불러오는 중…")).toBeInTheDocument();

      release?.();

      // 새 지역 데이터가 자리 잡으면 배지가 걷히고, 지도는 여전히 하나뿐이다.
      await vi.waitFor(() =>
        expect(screen.queryByText("새 지역을 불러오는 중…")).not.toBeInTheDocument(),
      );
      expect(screen.getAllByRole("region", { name: "단지 지도" })).toHaveLength(1);
    });

    /**
     * 실패 안내가 **이 화면에도** 있어야 한다. 입력 화면에도 같은 성격의
     * 안내가 있지만 그쪽은 `phase === "결과"` 동안 감춰져 있어, 상단바에서
     * 지역을 바꿨다가 실패하면 아무 일도 안 일어난 것처럼 보였다.
     */
    it("조회가 실패하면 상단바가 그 사실을 말하고 다시 시도할 수 있다", async () => {
      await renderResults();
      vi.spyOn(regionQuery, "fetchRegionComplexes").mockRejectedValue(
        new Error("네트워크 오류"),
      );

      await userEvent.selectOptions(screen.getByLabelText("시·군·구 바꾸기"), "11650");

      await screen.findByText(/새 지역 조회에 실패했어요/);
      // 입력 화면의 "다시 시도"와 **다른 이름**이라야 둘을 가려낼 수 있다.
      expect(
        screen.getByRole("button", { name: "실거래가 다시 불러오기" }),
      ).toBeInTheDocument();
    });

    /**
     * 사용자 지시: "위 상단에 생애최초/무주택도 같이 표시해주고, 토글로
     * 선택을 바꿀수 있게도 만들어줘." `fillProfile`이 입력 화면에서
     * "무주택이에요"를 고르므로, 상단바 토글도 처음부터 "무주택"이
     * 골라져 있어야 한다.
     *
     * 계산이 실제로 다시 도는지는 여기서 값(실구매 가능 가격 등)으로
     * 확인하지 않는다 — 이 프로필(현금 15억·소득 1억5천)에서는 정책대출
     * 가격 상한을 이미 넘어서 무주택이든 유주택이든 결과가 같을 수 있고,
     * 그 값은 프로필마다 달라져 여기서 못 박기엔 부서지기 쉽다. `state`가
     * 실제로 `useAffordability`에 그대로 흘러간다는 것은
     * `useProfileForm.test.ts`·`useAffordability.test.ts`가 이미 본다 —
     * 여기서는 **토글 자체가 그 값을 바꾸는지**만 본다.
     */
    it("무주택→유주택으로 상단바에서 바로 바꿀 수 있다", async () => {
      await renderResults();

      expect(screen.getByRole("radio", { name: "무주택" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByRole("radio", { name: "유주택" })).toHaveAttribute(
        "aria-checked",
        "false",
      );

      await userEvent.click(screen.getByRole("radio", { name: "유주택" }));

      expect(screen.getByRole("radio", { name: "유주택" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByRole("radio", { name: "무주택" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    /**
     * 생애최초 여부는 기본값이 `false`(비해당)다(useProfileForm.ts의
     * `DEFAULT_FORM_STATE` 참고) — `fillProfile`이 이 값을 건드리지
     * 않으므로 상단바도 "비해당"으로 시작해야 한다.
     */
    it("생애최초 여부를 상단바에서 바로 바꿀 수 있다", async () => {
      await renderResults();

      expect(screen.getByRole("radio", { name: "비해당" })).toHaveAttribute(
        "aria-checked",
        "true",
      );

      await userEvent.click(screen.getByRole("radio", { name: "해당" }));

      expect(screen.getByRole("radio", { name: "해당" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByRole("radio", { name: "비해당" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    /**
     * 사용자 지시: "무주택, 생애최초구입, 규제지역에 마우스를 올리면
     * 간략하게 어떤차이를 반영하는지 설명하는 내용을 볼수있도록" →
     * "딜레이를 최대한 빠르게", "흰색바탕(검정글씨)의 카드형식으로".
     * 입력 화면(`ProfileForm.tsx`)의 같은 필드 도움말을 그대로 옮겼는지
     * 확인한다 — 두 화면이 같은 필드를 다른 말로 설명하면 안 된다.
     * `title` 속성이 아니라 카드(`.result-topbar-tooltip`)로 낸다 —
     * 그 속성은 뜨기까지 1~1.5초 걸리고 배경·글자색을 못 바꾼다. 카드는
     * 마우스를 올리기 전에는 DOM에 아예 없다(조건부 렌더링) — 그래서
     * 여기서 `fireEvent.mouseEnter`로 직접 올려 본다.
     *
     * 생애최초 쪽은 두 줄이다(사용자 지시: "생애최초 구입시 ltv 한도가
     * 바뀌는것도 추가해줘" — "내용이 다르면 2줄로 정리해줘") — 그 둘째
     * 줄이 `ProfileForm.tsx`의 `<p className="hint">`와 같은 상수
     * (`FIRST_TIME_BUYER_HINT_LINES`)에서 온다. 무주택은 LTV와 무관해
     * 한 줄 그대로다.
     */
    it("무주택·생애최초 토글에 마우스를 올리면 입력 화면과 같은 설명이 카드로 뜬다", async () => {
      await renderResults();

      const ownedHomeItem = screen
        .getByRole("radiogroup", { name: "무주택 여부" })
        .closest(".result-topbar-item");
      expect(ownedHomeItem).not.toHaveAttribute("title");
      expect(ownedHomeItem?.querySelector('[role="tooltip"]')).toBeNull();

      fireEvent.mouseEnter(ownedHomeItem!);

      expect(
        [...ownedHomeItem!.querySelectorAll(".result-topbar-tooltip-line")].map(
          (el) => el.textContent,
        ),
      ).toEqual(["이미 집이 있으면 받을 수 있는 정책대출과 취득세 계산이 달라져요."]);

      const firstTimeBuyerItem = screen
        .getByRole("radiogroup", { name: "생애최초 구입" })
        .closest(".result-topbar-item");
      expect(firstTimeBuyerItem).not.toHaveAttribute("title");

      fireEvent.mouseEnter(firstTimeBuyerItem!);

      expect(
        [...firstTimeBuyerItem!.querySelectorAll(".result-topbar-tooltip-line")].map(
          (el) => el.textContent,
        ),
      ).toEqual([
        "생애최초로 집을 사면 취득세 감면과 정책대출 우대를 받을 수 있어요.",
        "규제지역에서는 대출 한도(LTV)도 40%에서 70%로 늘어나요.",
      ]);
    });
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

    // 셸이 언마운트되면 잠금도 함께 풀린다.
    cleanup();
    expect(document.body).not.toHaveClass(BODY_SCROLL_LOCK_CLASS);
  });

  /**
   * 사용자 지시로 마커에서 면적·거래 건수·부담 수준 색 구분이 빠지고
   * **단지명과 가격 범위만** 남았다. 두 창이 어긋나지 않는지를 여기서
   * 확인한다 — 예전에는 마커 **색**이 목록 행의 부담 문구와 맞는지를
   * 봤고, 지금은 마커 **이름**이 목록 행의 이름과 맞는지를 본다.
   *
   * **목록 쪽 부담 배지는 그대로다.** `burdenTierOf`(단수)는 살아 있고
   * `ComplexList`가 계속 쓴다 — 이번 변경은 지도만의 일이다. 그 사실을
   * 아래에서 함께 못박는다(목록에서도 사라지면 이 검사가 깨진다).
   */
  it("마커 라벨이 단지명·가격 범위를 내고, 목록 행과 같은 단지를 가리킨다", async () => {
    const { container } = await renderResults();
    await screen.findByRole("region", { name: "단지 지도" });
    await vi.waitFor(() =>
      expect(container.querySelectorAll(".complex-map-marker")).toHaveLength(2),
    );

    const markerOf = (complexKey: string) => {
      const marker = [
        ...container.querySelectorAll<HTMLElement>(".complex-map-marker"),
      ].find((el) => el.dataset.complexKey === complexKey);
      expect(marker, `${complexKey} 마커가 없습니다`).toBeDefined();
      return marker!;
    };

    const cash = markerOf(CASH_UNIT.complexKey);
    const loan = markerOf(LOAN_UNIT.complexKey);

    // 마커가 자기 단지를 이름으로 가리킨다.
    expect(cash.textContent).toContain("현금단지");
    expect(loan.textContent).toContain("대출단지");

    // 면적·거래건수는 여전히 뺀 채다.
    for (const marker of [cash, loan]) {
      expect(marker.textContent).not.toContain("㎡");
      expect(marker.textContent).not.toContain("거래");
    }
    // 부담 수준 글자는 마커가 아니라 지도 범례가 낸다 — 색만으로 말하지 않는다.
    const legend = screen.getByRole("list", { name: "마커 색 안내" });
    expect(legend.textContent).toContain("대출 없이");
    expect(legend.textContent).toContain("대출 필요");
    // 색 구분도 살아 있다 — 감싸는 핀(.complex-map-pin)의 티어 클래스가 서로 다르다.
    expect(cash.parentElement?.className).not.toBe(loan.parentElement?.className);
    expect(cash.parentElement?.className).toContain("complex-map-pin--no-loan");
    expect(loan.parentElement?.className).toContain("complex-map-pin--loan");

    // **목록 행의 부담 배지는 그대로다** — `burdenTierOf`는 지도가 아니라
    // 목록의 함수다. 지도에서 뺀 것을 목록에서까지 빼지 않았다.
    const rowText = (name: string) =>
      screen.getByRole("button", { name: new RegExp(name) }).textContent ?? "";
    expect(rowText("현금단지")).toContain("대출 없이 살 수 있어요");
    expect(rowText("대출단지")).toContain("부담률");
    expect(rowText("대출단지")).not.toContain("대출 없이 살 수 있어요");
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
   * 지도는 30개까지 그리는데 목록은 덩어리마다 한 쪽에 5개씩만 그린다.
   * 그 너머(다음 쪽)의 마커를 누르면 선택은 바뀌는데 화면엔 아무 변화가
   * 없다 — 사용자에겐 마커가 죽은 것으로 보인다.
   */
  it("'더 보기' 너머의 마커를 눌러도 그 행이 목록에 나타난다", async () => {
    // 같은 부담 덩어리(대출 없이)에 12개를 넣어 한 쪽(5개) 상한을 넘긴다.
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
     * 건너뛰는가"를 확인할 수 없고, **속성이 붙는가**만 확인한다.
     *
     * 실제 차단은 브라우저에서 따로 확인했다(dev 4173, 실데이터):
     * 패널이 열린 상태에서 가려진 `.complex-row-button`에 `.focus()`를
     * 불러도 `document.activeElement`가 그 행으로 가지 않고
     * `section.budget-panel`에 머물렀고, 패널을 닫으면 같은 행이 다시
     * 초점을 받았다.
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
      expect(open.querySelector(".price-slider")).not.toBeNull();
      expect(open.querySelector(".binding-explainer")).not.toBeNull();
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
     * (`ZeroBudgetMessage`·`BindingExplainer`)이 바로 이 패널 안에 있다.
     * 0원일 때만 죽은 버튼으로 두면 Task 3이 리뷰에서 잡힌 실패(누르라고
     * 적어 놓고 아무 일도 안 하던 가정 칩)를 그대로 재현한다.
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
      /*
       * **경고는 이제 이 패널 안이 아니다**(followup-warnings-out).
       * 접히는 자리에 두면 상단바의 헤드라인 숫자만 보이고 그 숫자를
       * 한정하는 문장은 눌러야 보인다 — 이 검사는 지운 것이 아니라
       * 아래 "엔진 경고의 자리"로 **옮겼다**. 여기서는 옮겨 간 뒤에도
       * 이 프로필에 경고가 실제로 있다는 것과, 그 한 벌이 패널 밖에
       * 있다는 것만 확인한다.
       */
      expect(open.querySelector(".warning-list")).toBeNull();
      const warning = container.querySelector(".warning-list");
      expect(warning).not.toBeNull();
      expect(open.contains(warning!)).toBe(false);
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
     * **모집합은 `MUST_SURVIVE_PRINT_CLASSES` 그대로다**(리뷰 findings m3).
     * 예전에는 "패널 안에 있는 열 개"를 손으로 적어 뒀는데, 그 목록이
     * 화면과 어긋나도 아무것도 깨지지 않았다 — 패널이 새 값을 품게 되면
     * 그 값은 검사 대상에서 조용히 빠진다. 보호 대상 목록 전체를 훑으면
     * 그럴 자리가 없다(패널 밖의 보호 대상도 함께 지켜지므로 검사가 더
     * 넓어질 뿐 약해지지 않는다).
     *
     * **파생되는 것은 기준선이지 모집합이 아니다.** 어느 클래스가 실제로
     * 화면에 있는지는 프로필에 따라 다르므로, 열었을 때 있던 것을 기준선
     * 으로 잡고 닫은 뒤와 대조한다.
     */
    function protectedPresent(container: HTMLElement): string[] {
      return MUST_SURVIVE_PRINT_CLASSES.filter(
        (cls) => container.querySelector(`.${cls}`) !== null,
      );
    }

    it("패널을 닫아도 보호 대상 클래스가 DOM에서 하나도 사라지지 않는다(양수 예산)", async () => {
      const { container } = await renderResults();

      await userEvent.click(trigger());
      const whileOpen = protectedPresent(container);
      // 전제: 실제로 여러 개가 있었다. 없으면 아래 대조가 공허하다.
      expect(whileOpen.length).toBeGreaterThanOrEqual(6);
      // 그중 패널 **안**에 있는 것들이 실제로 잡혔는지도 확인한다 —
      // 모집합을 넓히면서 정작 이 테스트가 지켜야 할 자리가 빠지면
      // 대조는 통과해도 아무것도 지키지 못한다.
      const panelElement = panel(container)!;
      const insidePanel = whileOpen.filter(
        (cls) => panelElement.querySelector(`.${cls}`) !== null,
      );
      expect(insidePanel.length).toBeGreaterThanOrEqual(6);

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
   * 후속 수정 — **엔진 경고는 접히는 패널 밖에 산다**
   * (`.superpowers/sdd/followup-warnings-out.md`, 전체 리뷰 I3).
   *
   * Task 5가 `BudgetResult`를 예산 상세 패널 안으로 옮기면서, 그 안에
   * 있던 `WarningList`도 함께 접혔다. 결과 화면에는 굵은 "실구매 가능
   * 가격"만 뜨고 그 숫자를 **한정하는** 문장은 "자세히"를 눌러야
   * 보였다 — `BudgetResult.tsx`가 스스로 적어 둔 원칙("접으면 안 되는
   * 종류의 정보다")이 조용히 무력화된 상태다.
   *
   * `BudgetResult`에 "경고를 숨기는 prop"을 더하지 않는다 — 출처가
   * 둘이 된다. 컴포넌트에서 들어내고 호출부(`App.tsx`)가 그린다.
   *
   * **이 앱에서 화면으로 도달할 수 있는 경고는 0원 프로필의
   * "고정 부대비용…" 하나다.** 나머지 경고(양도세·기존 주택 매도 대금)는
   * `status === "갈아타기"`에서만 나는데 `ProfileForm`에 그 입력 화면이
   * 없다(ProfileForm.tsx의 주석 — 죽은 배선이라 화면을 지웠다). 그래서
   * 이 검사는 0원 프로필을 쓴다. 하필 그 상태가 경고가 가장 필요한
   * 자리이기도 하다.
   */
  describe("엔진 경고의 자리", () => {
    function trigger() {
      return screen.getByRole("button", { name: /실구매 가능 가격/ });
    }

    function budgetPanel(container: HTMLElement) {
      return container.querySelector(".budget-panel")!;
    }

    /** 경고가 실제로 나는 유일한 화면 경로 — 0원 프로필 */
    function renderWithWarning() {
      return renderResults([CASH_UNIT, LOAN_UNIT], { cash: "100" });
    }

    it("패널이 닫힌 채로도 경고가 사이드바 맨 위에 보인다", async () => {
      const { container } = await renderWithWarning();

      // 전제: 패널의 기본 상태는 닫힘이다. 결과 화면을 처음 만나는
      // 사람이 보는 화면이 이 상태다.
      expect(budgetPanel(container)).toHaveClass("budget-panel--closed");

      const warning = container.querySelector(".warning-list");
      expect(warning).not.toBeNull();
      expect(warning!.textContent).toContain(
        "고정 부대비용(법무비·이사비)만으로도 사용가능 현금 예산을 넘어요.",
      );

      // 접히는 자리 어디에도 들어 있지 않다 — 패널도, <details>도.
      expect(budgetPanel(container).contains(warning!)).toBe(false);
      expect(warning!.closest("details")).toBeNull();

      // 사이드바 **맨 위**다: 상단바(트리거) 아래, 목록/상세보다 위.
      const sidebar = container.querySelector(".region-results-sidebar")!;
      expect(sidebar.contains(warning!)).toBe(true);
      expect(sidebar.firstElementChild).toBe(warning);

      // 출처가 하나다. `BudgetResult`에도 남겨 두면 같은 문장이 화면과
      // 종이에 두 번 뜬다 — 인쇄에서는 패널이 닫혀 있어도 그대로 나온다.
      expect(container.querySelectorAll(".warning-list")).toHaveLength(1);

      /*
       * 그리고 그 한 벌이 **종이에서 사라지지도** 않는다.
       * `warning-list`는 `MUST_SURVIVE_PRINT_CLASSES`인데, 옮긴 자리가
       * 인쇄에서 지워지는 조상 밑이면 개수만 맞고 종이에서는 0번이 된다.
       * 위 개수 단언과 이 순회가 함께 "종이에 정확히 한 번"을 만든다.
       */
      expect(MUST_SURVIVE_PRINT_CLASSES).toContain("warning-list");
      for (const selector of PRINT_HIDDEN_SELECTORS) {
        for (const hidden of container.querySelectorAll(selector)) {
          expect(
            hidden.contains(warning!),
            `경고가 인쇄에서 지워지는 ${selector} 안에 있습니다.`,
          ).toBe(false);
        }
      }
    });

    it("패널을 열어도 경고는 한 벌뿐이고, 닫으면 다시 드러난다", async () => {
      const { container } = await renderWithWarning();

      await userEvent.click(trigger());
      expect(budgetPanel(container)).not.toHaveClass("budget-panel--closed");
      /*
       * 패널이 열려 있는 동안 사이드바는 그 뒤에 가려지고 `inert`다
       * (리뷰 findings M2) — 경고도 함께 가려진다. **그래도 사이드바에
       * 둔다**: 패널이 담는 것이 바로 그 숫자의 근거
       * (`ZeroBudgetMessage`·`BindingExplainer`·`CostBreakdown`)라,
       * 패널이 열린 순간은 사용자가 한정 조건을 **읽고 있는** 상태다.
       * 고쳐야 할 것은 기본 상태(닫힘)에서 숫자만 보이던 것이었고, 그
       * 상태는 위 테스트가 잠근다. 패널을 경고 **아래**에서 시작하게
       * 하려면 경고 높이를 런타임에 재야 하는데(패널은
       * `.region-results-grid` 기준 `top: 0` 절대 배치다), 그 기계장치가
       * 얻는 것보다 크다.
       *
       * 여기서 잠그는 것은 **개수**다 — 옮기면서 패널 안에 한 벌을 남겨
       * 두면 종이에 같은 경고가 두 번 나온다.
       */
      expect(container.querySelectorAll(".warning-list")).toHaveLength(1);
      expect(budgetPanel(container).querySelector(".warning-list")).toBeNull();

      await userEvent.click(trigger());
      expect(budgetPanel(container)).toHaveClass("budget-panel--closed");
      expect(container.querySelectorAll(".warning-list")).toHaveLength(1);
    });

    /**
     * 경고가 0건이면 사이드바 맨 위에 **아무것도** 생기지 않는다 —
     * 빈 상자도, 빈 여백도. `WarningList`가 빈 배열에서 `null`을
     * 돌려주는 것에 기대는 자리라, 그 계약이 깨지면 여기서 잡힌다.
     */
    it("경고가 0건이면 사이드바 맨 위에 빈 자리를 만들지 않는다", async () => {
      const { container } = await renderResults();

      expect(container.querySelector(".warning-list")).toBeNull();
      const sidebar = container.querySelector(".region-results-sidebar")!;
      // 맨 위는 옮기기 전과 같은 요소다(목록 쪽 첫 요소).
      expect(sidebar.firstElementChild).not.toBeNull();
      expect(sidebar.firstElementChild!.className).not.toContain("warning");
    });

    /**
     * 옮긴 뒤에도 경고가 나오는 **경로 집합이 그대로**여야 한다 — 늘어도
     * 줄어도 안 된다. 그 자리는 여전히
     * `affordability !== null && residentialProfile !== null` 게이트
     * 안이므로, 프로필이 아직 안 끝났으면 경고도 없다.
     *
     * (예전에는 이 자리에서 투자 경로로 넘어가 경고가 사라지는지도
     * 확인했다. 구매 유형 선택이 제거되면서 그 경로에 도달할 방법이
     * 없어졌다.)
     */
    it("프로필이 안 끝났으면 경고도 없다 — 옮기기 전과 같은 게이트다", () => {
      const { container } = render(<App />);
      expect(container.querySelector(".result-shell")).toBeNull();
      expect(container.querySelector(".warning-list")).toBeNull();
    });
  });

  /**
   * 사이드바가 목록 ↔ 상세로 전환되는 동안 면책이 어디에 서는가.
   *
   * 진단 종합이 제거되기 전에는 이 describe가 그 자리(상세 안)까지 함께
   * 잠갔다. 남은 것은 면책이고, 그쪽이 원래 더 무거운 계약이다 —
   * `disclaimer`는 MUST_SURVIVE_PRINT_CLASSES라 어느 화면에서 인쇄해도
   * 정확히 한 벌이 종이에 남아야 한다.
   */
  describe("사이드바 전환과 면책의 자리", () => {
    it("목록 화면에서도 면책은 사이드바 끝에 있다", async () => {
      const { container } = await renderResults();
      const sidebar = container.querySelector(".region-results-sidebar")!;

      expect(sidebar.querySelector(".disclaimer")).not.toBeNull();
      expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);
    });

    it("상세를 열고 목록으로 돌아가도 면책은 한 벌 그대로다", async () => {
      const { container } = await renderResults();
      await userEvent.click(screen.getByRole("button", { name: /현금단지/ }));
      expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);

      await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));

      expect(container.querySelector(".disclaimer")).not.toBeNull();
      expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);
    });

    it("프로필이 안 끝난 폴백에도 면책은 그대로다", () => {
      const { container } = render(<App />);
      expect(container.querySelector(".result-shell")).toBeNull();
      expect(container.querySelectorAll(".disclaimer")).toHaveLength(1);
    });
  });
});
