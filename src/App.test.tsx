import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ComplexUnit } from "./data/complexes";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import * as regionQuery from "./lib/regionQuery";
import { rules } from "./state/useAffordability";
import { rightsRules } from "./state/useRightsCheck";
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
      .mockResolvedValueOnce({ units: [DETAIL_TEST_UNIT], isRegulatedArea: null });

    render(<App />);
    await fillProfile();
    await chooseRegion();

    await screen.findByText(/불러오지 못했어요/);
    // **실패를 "결과 0건"으로 보여주지 않는다.** 둘을 뭉치면 데이터가
    // 없는 지역이라고 잘못 말하게 된다.
    expect(screen.queryByText(/실거래가 자체가 없어요/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "살 수 있는 단지" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await screen.findByRole("region", { name: "살 수 있는 단지" });
    expect(screen.queryByText(/불러오지 못했어요/)).not.toBeInTheDocument();
    // 재시도는 같은 지역 코드로 다시 묻는다.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(2, "11680", null);
  });

  it("그 지역에 실거래가가 0건이면 지역을 바꾸라고 말한다(예산 탓으로 돌리지 않는다)", async () => {
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [],
      isRegulatedArea: null,
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
    });

    render(<App />);
    await fillProfile();
    await chooseRegion();
    await screen.findByRole("region", { name: "살 수 있는 단지" });

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

  it("지역을 다시 고르면 동 좁히기가 전체로 되돌아간다", async () => {
    const spy = vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNIT],
      isRegulatedArea: null,
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
    spy.mockResolvedValue({
      units: [DONG_A_UNIT, DONG_B_UNIT],
      isRegulatedArea: null,
    });
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

/**
 * 권리분석 문진(진단 제품의 첫 조각)이 예산 흐름과 **독립된 자리**에
 * 있다는 것을 잠근다. 그 배선의 이유는 App.tsx의 호출부 주석에 적었다 —
 * 계약을 앞두고 등기부만 들고 온 사람이 현금·소득을 먼저 입력해야만
 * 도달할 수 있게 되면, 가장 급한 사람이 가장 늦게 도달한다.
 */
describe("App - 권리분석 문진", () => {
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

  it("현금·소득을 입력하기 전에도 문진에 도달할 수 있다", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".rights-check")).not.toBeNull();
    expect(
      screen.getByText("등기부등본으로 권리 확인하기", { exact: false }),
    ).toBeInTheDocument();
  });

  it("예산 계산이 나온 뒤에도, 지역을 고른 뒤에도, 단지 상세를 연 뒤에도 그대로 남는다", async () => {
    const { container } = render(<App />);
    await fillProfile();
    expect(container.querySelector(".rights-check")).not.toBeNull();

    // 지역 선택 단계가 새로 끼었다 — 문진은 이 단계와도 무관해야 한다.
    await selectTestRegion();
    expect(container.querySelector(".rights-check")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /테스트단지/ }));
    expect(container.querySelector(".rights-check")).not.toBeNull();
  });

  it("아무것도 답하지 않은 상태의 결론은 통과가 아니다", () => {
    const { container } = render(<App />);
    const overall = container.querySelector(".rights-overall");
    expect(overall?.textContent).toBe(rightsRules.overall.incomplete.label);
    expect(overall?.textContent).not.toBe(rightsRules.overall.clear.label);
  });

  it("예산 흐름을 망가뜨리지 않는다 — 실구매 가능 가격이 그대로 나온다", async () => {
    const { container } = render(<App />);
    await fillProfile();
    expect(container.querySelector(".affordable-price")?.textContent).toMatch(
      /억/,
    );
  });
});
