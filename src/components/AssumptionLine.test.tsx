import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rules } from "../state/useAffordability";
import {
  ASSUMED_REMOVED_INPUTS,
  DEFAULT_FORM_STATE,
  type ProfileFormState,
} from "../state/useProfileForm";
import {
  AssumptionLine,
  buildAssumptionItems,
  removedInputNotices,
} from "./AssumptionLine";

const THRESHOLD = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

function state(overrides: Partial<ProfileFormState> = {}): ProfileFormState {
  return { ...DEFAULT_FORM_STATE, ...overrides };
}

const texts = (s: ProfileFormState, areaOverridden = false) =>
  buildAssumptionItems(s, THRESHOLD, areaOverridden).map((i) => i.text);

const joined = (s: ProfileFormState, areaOverridden = false) =>
  texts(s, areaOverridden).join("\n");

describe("없앤 입력 넷은 조용한 기본값이 아니라 문장으로 남는다", () => {
  /**
   * ⚠ **이 저장소가 여섯 번 반복한 사고를 겨누는 테스트다.**
   *
   * 화면 1에서 입력란 넷을 지우는 것과 여기서 문장 넷을 남기는 것은 한
   * 쌍이다. 한쪽만 하면 사용자가 확인한 적 없는 값이 조용히 계산을
   * 움직이게 된다.
   */
  it("생애최초·기존 대출·주택 수·규제지역이 각각 자기 문장을 남긴다", () => {
    const all = joined(state());
    expect(all).toMatch(/생애최초/);
    expect(all).toMatch(/기존 대출/);
    expect(all).toMatch(/무주택/);
    expect(all).toMatch(/규제지역/);
  });

  /**
   * `ASSUMED_REMOVED_INPUTS`에 항목을 하나 더 넣으면서 문장을 빠뜨릴 수
   * 없어야 한다. 타입(`Record<keyof AssumedRemovedInputs, string>`)이 이미
   * 강제하지만, 그 강제가 실제로 서 있는지 여기서 한 번 더 센다 — 타입만
   * 믿으면 언젠가 `Partial`이나 인덱스 시그니처로 느슨해진 것을 아무도
   * 눈치채지 못한다.
   */
  it("가정값 하나하나가 빠짐없이 문장을 갖는다", () => {
    const notices = removedInputNotices(ASSUMED_REMOVED_INPUTS);
    expect(Object.keys(notices).sort()).toEqual(
      Object.keys(ASSUMED_REMOVED_INPUTS).sort(),
    );
    for (const [key, text] of Object.entries(notices)) {
      expect(text.length, `${key}의 문장이 비어 있다`).toBeGreaterThan(10);
    }
  });

  /**
   * 문장을 하드코딩하면 가정값을 바꾼 날 화면이 거짓말을 한다.
   */
  it("문장은 실제 가정값에서 만든다 — 값을 바꾸면 문장도 바뀐다", () => {
    const flipped = removedInputNotices({
      isFirstTimeBuyer: true,
      existingDebtAnnualPayment: 1_200_000,
      ownedHomeCount: 2,
    });
    expect(flipped.isFirstTimeBuyer).toMatch(/생애최초 우대를 받는 것으로/);
    expect(flipped.existingDebtAnnualPayment).toMatch(/120만원/);
    expect(flipped.ownedHomeCount).toMatch(/유주택 2채/);
  });

  /**
   * 셋 중 둘은 **낙관 방향**의 가정이다 — 진실이 다르면 살 수 있는 가격이
   * 지금 화면보다 **낮다**. 이 제품이 가장 경계하는 방향이라 그 사실이
   * 문장에 있어야 한다. 생애최초만 반대다.
   */
  it("진실이 다르면 숫자가 어느 쪽으로 움직이는지 말한다", () => {
    const notices = removedInputNotices(ASSUMED_REMOVED_INPUTS);
    expect(notices.existingDebtAnnualPayment).toMatch(/낮아요/);
    expect(notices.ownedHomeCount).toMatch(/낮아요/);
    expect(notices.isFirstTimeBuyer).toMatch(/높아질 수 있어요/);
  });

  it("사용자가 무엇을 하든 이 넷은 사라지지 않는다", () => {
    // 옛 화면에서는 값을 정하면 그 문구가 사라졌다. 이제 정할 방법이
    // 없으므로 사라질 경로도 없어야 한다.
    for (const s of [
      state(),
      state({ touched: ["regulatedArea"] }),
      state({ cash: 300_000_000, annualIncome: 70_000_000 }),
      state({ areaBands: ["대형"] }),
    ]) {
      const all = joined(s);
      expect(all).toMatch(/생애최초/);
      expect(all).toMatch(/기존 대출/);
      expect(all).toMatch(/무주택/);
    }
  });
});

describe("규제지역 — 값의 출처가 둘이라 문장도 둘이다", () => {
  it("지역 조회가 판정했으면 '판정했어요'라고 적는다", () => {
    expect(
      joined(state({ touched: ["regulatedArea"], isRegulatedArea: true })),
    ).toMatch(/규제지역으로 판정했어요/);
    expect(
      joined(state({ touched: ["regulatedArea"], isRegulatedArea: false })),
    ).toMatch(/비규제지역으로 판정했어요/);
  });

  /**
   * 판정이 오지 않은 지역까지 "판정했어요"라고 적으면, 우리가 아무것도
   * 확인하지 못한 지역에 대해 화면이 단정하게 된다 — 모르는 것과 확인한
   * 것을 같은 문구로 보여주는, 이 앱이 가장 경계하는 오류다.
   */
  it("판정이 없으면 '확인하지 못해'라고 적고 방향까지 말한다", () => {
    const unknown = joined(state({ isRegulatedArea: true }));
    expect(unknown).toMatch(/확인하지 못해/);
    expect(unknown).toMatch(/늘어날 수 있어요/);
    expect(unknown).not.toMatch(/판정했어요/);
  });

  it("비규제로 가정 중이면 반대 방향을 말한다", () => {
    const s = joined(state({ isRegulatedArea: false }));
    expect(s).toMatch(/비규제지역으로 보고 계산했어요/);
    expect(s).toMatch(/줄어들어요/);
  });
});

describe("전용면적 — 헤드라인과 목록이 다른 면적 위에 서 있다는 사실", () => {
  /**
   * ⚠ 평형대 질문(④)은 **범위**를 고르는 축이고, 헤드라인은 **한 값**이
   * 필요하다. 범위에서 한 값을 뽑는 규칙을 새로 만들면 그 규칙이 화면
   * 어디에도 적히지 않은 채 헤드라인을 움직인다 — 그래서 헤드라인은
   * 룰셋의 가정을 그대로 쓰고, 이 문구가 그 사실을 말한다.
   */
  it("헤드라인이 가정한 면적과, 각 줄이 실제 면적을 쓴다는 사실을 함께 말한다", () => {
    const s = joined(state());
    expect(s).toMatch(new RegExp(`전용 ${DEFAULT_FORM_STATE.exclusiveAreaSqm}㎡`));
    expect(s).toMatch(/각 줄은 그 평형의 실제/);
    expect(s).toMatch(new RegExp(`${THRESHOLD}㎡를 넘는`));
  });

  it("임계값은 인자로 받는다 — 룰셋이 바뀌면 문구도 따라간다", () => {
    const s = buildAssumptionItems(state(), 100)
      .map((i) => i.text)
      .join("\n");
    expect(s).toMatch(/100㎡를 넘는/);
  });

  /**
   * 단지 상세를 열면 화면 전체가 그 평형의 실제 면적으로 계산된다
   * (App.tsx의 `effectiveProfile`). 그동안 "85㎡로 가정했다"는 문구는
   * 거짓말이 된다.
   */
  it("상세를 열어 실제 면적으로 계산 중이면 이 문구를 빼고, 나머지는 남긴다", () => {
    const s = joined(state(), true);
    expect(s).not.toMatch(/가정해/);
    expect(s).toMatch(/무주택/);
    expect(s).toMatch(/규제지역/);
  });
});

describe("옛 갈아타기 정보", () => {
  it("남아 있는데 반영되지 않았으면 그 사실을 말한다", () => {
    const s = joined(
      state({
        existingHome: {
          expectedSalePrice: 500_000_000,
          remainingLoan: null,
          capitalGainsTax: null,
        },
      }),
    );
    expect(s).toMatch(/매도 자금은 반영되지 않았어요/);
  });

  it("남은 값이 없으면 말하지 않는다", () => {
    expect(joined(state())).not.toMatch(/갈아타기/);
  });
});

describe("렌더 — 전부 순수 정보 문구다", () => {
  /**
   * 예전에는 항목마다 버튼이 있어 누르면 그 입력란이 폼에서 열렸다.
   * 입력란이 사라졌으니 누를 곳도 사라졌다 — 버튼 모양만 남기면 눌러도
   * 아무 일도 일어나지 않는 죽은 컨트롤이 되고, 그건 이 저장소가 이미
   * 두 번 낸 실패다.
   */
  it("버튼이 하나도 없다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll(".assumption-item")).toHaveLength(0);
  });

  it("모든 항목이 .assumption-notice다 — 인쇄에서 살아남는 클래스다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    const items = buildAssumptionItems(state(), THRESHOLD);
    expect(container.querySelectorAll(".assumption-notice")).toHaveLength(
      items.length,
    );
  });

  /**
   * 조작 지시("눌러서 알려주세요")가 남아 있으면 종이 위에서 누를 수 없는
   * 지시문이 되고, 화면에서는 누를 곳 없는 지시가 된다. 이제 어느 문구도
   * 조작을 지시하지 않으므로 인쇄용 부분 숨김(.assumption-action)도 함께
   * 사라졌다.
   */
  it("조작을 지시하는 문구가 하나도 없다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    expect(container.textContent).not.toMatch(/눌러서/);
    expect(container.querySelectorAll(".assumption-action")).toHaveLength(0);
  });

  it("목록 자체는 .assumption-line이다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    expect(container.querySelector("ul.assumption-line")).not.toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
  });
});
