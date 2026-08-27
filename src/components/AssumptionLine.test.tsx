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

describe("여전히 없앤 입력(기존 대출)·규제지역은 조용한 기본값이 아니라 문장으로 남는다", () => {
  /**
   * ⚠ **이 저장소가 여섯 번 반복한 사고를 겨누는 테스트다.**
   *
   * 화면 1에서 입력란을 지우는 것과 여기서 문장을 남기는 것은 한 쌍이다.
   * 한쪽만 하면 사용자가 확인한 적 없는 값이 조용히 계산을 움직이게 된다.
   *
   * 생애최초·주택 수는 더 이상 여기 없다 — 사용자 지시로 화면 1의 실제
   * 질문이 됐으므로(`ProfileForm.tsx`), 그 답은 폼 자체에 보이지 이
   * "가정 알림" 목록에는 나오지 않는다.
   */
  it("기존 대출·규제지역이 각각 자기 문장을 남긴다", () => {
    const all = joined(state());
    expect(all).toMatch(/기존 대출/);
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
      existingDebtAnnualPayment: 1_200_000,
    });
    expect(flipped.existingDebtAnnualPayment).toMatch(/120만원/);
  });

  /**
   * 기존 대출 없음은 **낙관 방향**의 가정이다 — 진실이 다르면 살 수 있는
   * 가격이 지금 화면보다 **낮다**. 이 제품이 가장 경계하는 방향이라 그
   * 사실이 문장에 있어야 한다.
   */
  it("진실이 다르면 숫자가 어느 쪽으로 움직이는지 말한다", () => {
    const notices = removedInputNotices(ASSUMED_REMOVED_INPUTS);
    expect(notices.existingDebtAnnualPayment).toMatch(/낮아요/);
  });

  it("사용자가 무엇을 하든 이 둘은 사라지지 않는다", () => {
    // 옛 화면에서는 값을 정하면 그 문구가 사라졌다. 이제 정할 방법이
    // 없으므로(기존 대출) 또는 값 자체가 이 목록에 없으므로(규제지역은
    // 값이 아니라 출처가 갈릴 뿐) 사라질 경로가 없어야 한다.
    for (const s of [
      state(),
      state({ touched: ["regulatedArea"] }),
      state({ cash: 300_000_000, annualIncome: 70_000_000 }),
      state({ areaBands: ["중대형"] }),
    ]) {
      const all = joined(s);
      expect(all).toMatch(/기존 대출/);
      expect(all).toMatch(/규제지역/);
    }
  });

  /**
   * 생애최초·주택 수는 답을 뭐라고 넣어도 이 목록에 나타나지 않는다 —
   * 화면 1의 폼이 그 답을 직접 보여준다(`ProfileForm.tsx`).
   */
  it("생애최초·주택 수는 어디에도 없다", () => {
    for (const s of [
      state(),
      state({ ownedHomeCount: 0, isFirstTimeBuyer: false }),
      state({ ownedHomeCount: 1, isFirstTimeBuyer: true }),
    ]) {
      const all = joined(s);
      expect(all).not.toMatch(/생애최초/);
      expect(all).not.toMatch(/무주택/);
      expect(all).not.toMatch(/유주택/);
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

describe("전용면적 — 고른 평형대에 85㎡ 초과가 섞였는가", () => {
  /**
   * ⚠ **85㎡ 초과가 섞이지 않았으면 해명할 것이 없다.**
   *
   * 고른 구간이 전부 85㎡ 이하이므로 헤드라인이 쓴 전제는 **가정이 아니라
   * 사실**이다 — 그런데도 "가정한 면적 기준이라…"라고 적으면 사실과 다른
   * 겸양이고, 그건 노이즈다. 사용자는 진짜 가정(기존 대출·규제지역)을
   * 읽어야 하는데 그 사이에 가짜 가정이 섞인다.
   */
  it("85㎡ 초과가 안 섞였으면 면적 문구를 아예 내지 않는다", () => {
    const s = joined(state({ areaBands: ["소형", "중소형"] }));
    expect(s).not.toMatch(/전용/);
    expect(s).not.toMatch(/농특세/);
    // 진짜 가정은 그대로 남는다.
    expect(s).toMatch(/기존 대출/);
    expect(s).toMatch(/규제지역/);
  });

  /**
   * 섞였으면 **보수적인 쪽**(농특세가 붙고 정책대출 면적 제한이 걸리는
   * 쪽)으로 계산했다는 사실을 말한다. 값이 아니라 전제를 말한다 — 범위에서
   * 대표값 하나를 뽑지 않았으므로 적을 숫자가 없다.
   */
  it("85㎡ 초과가 섞였으면 농특세가 붙는 기준으로 계산했다고 말한다", () => {
    const s = joined(state({ areaBands: ["중대형"] }));
    expect(s).toMatch(new RegExp(`${THRESHOLD}㎡ 초과`));
    expect(s).toMatch(/농특세/);
  });

  /**
   * ⚠ **없는 줄을 약속하지 않는다.** 목록은 고른 평형대로 걸러진
   * 뒤이므로(App.tsx의 `areaFilteredUnits`) 중대형만 고른 사용자에게
   * "85㎡ 이하인 줄"은 하나도 나올 수 없다. 방향은 무해하지만(경고가 더
   * 붙을 뿐 숫자를 부풀리지 않는다) 이 저장소가 가장 공들여 노이즈를
   * 없애는 자리에서 노이즈다.
   *
   * 앞 문장(농특세 기준으로 계산했다)은 그대로 남는다 — 그건 헤드라인이
   * 실제로 쓴 전제라 여전히 참이다.
   */
  it("중대형만 골랐으면 '85㎡ 이하인 줄' 약속을 빼고, 전제는 남긴다", () => {
    const s = joined(state({ areaBands: ["중대형"] }));
    expect(s).toMatch(/농특세/);
    expect(s).not.toMatch(/이하인 줄/);
  });

  it("이하 구간을 함께 골랐으면 그 줄이 실제로 나오므로 약속을 남긴다", () => {
    const s = joined(state({ areaBands: ["소형", "중대형"] }));
    expect(s).toMatch(new RegExp(`${THRESHOLD}㎡ 이하인 줄`));
  });

  it("임계값은 인자로 받는다 — 룰셋이 바뀌면 문구도 따라간다", () => {
    const s = buildAssumptionItems(state({ areaBands: ["중대형"] }), 100)
      .map((i) => i.text)
      .join("\n");
    expect(s).toMatch(/100㎡ 초과/);
    expect(s).not.toMatch(/85㎡ 초과/);
  });

  /**
   * 단지 상세를 열면 화면 전체가 그 평형의 실제 면적으로 계산된다
   * (App.tsx의 `effectiveProfile`). 그동안 평형대에서 유도한 전제를
   * 말하면 거짓말이 된다.
   */
  it("상세를 열어 실제 면적으로 계산 중이면 이 문구를 빼고, 나머지는 남긴다", () => {
    const s = joined(state({ areaBands: ["중대형"] }), true);
    expect(s).not.toMatch(/농특세/);
    expect(s).toMatch(/기존 대출/);
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
    // 기본값(state())은 전체 평형대 선택이라 85㎡ 초과가 섞여 면적 문구가
    // 하나 더 붙는다 — 기존 대출·규제지역·면적 셋이 최소치다.
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  /**
   * 사용자 지시로 이 덩어리를 화면에서 **접었다**("크게 필요없는
   * 부분이라서, 축약정리 하거나 제외해도 될것같아").
   *
   * ⚠ **둘 중 축약을 골랐고 제외는 고르지 않았다.** 이 목록이 존재하는
   * 이유가 정확히 "조용히 깔린 기본값을 만들지 않는다"이고, 문구를
   * 지우면 이 저장소가 여섯 번 반복한 그 사고를 우리가 다시 만드는 것이
   * 된다. 아래 두 테스트가 **접혔다**와 **그대로 남아 있다**를 함께
   * 잠근다 — 하나만 잠그면 다음 사람이 "접는다"를 "지운다"로 읽는다.
   */
  it("화면에서는 접힌다 — 요약 한 줄이 개수를 말한다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    const fold = container.querySelector("details.assumption-fold");
    expect(fold).not.toBeNull();
    // 기본 상태는 접힘이다.
    expect(fold).not.toHaveAttribute("open");

    const items = buildAssumptionItems(state(), THRESHOLD);
    expect(fold?.querySelector("summary")?.textContent).toBe(
      `계산 전제 ${items.length}가지 펼쳐 보기`,
    );
  });

  it("접혀도 문구는 DOM에 그대로 남는다 — 인쇄에서 강제로 펼쳐지는 자리다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    const items = buildAssumptionItems(state(), THRESHOLD);

    // 접힘은 CSS가 하는 일이고, 종이에서는 @media print가 모든 details를
    // 강제로 펼친다(styles.css의 ::details-content). 그래서 문구 수는
    // 접기 전과 똑같아야 한다.
    const notices = container.querySelectorAll(".assumption-notice");
    expect(notices).toHaveLength(items.length);
    for (const item of items) {
      expect(container.textContent).toContain(item.text);
    }

    // 목록은 접기 안쪽에 있다 — 바깥으로 새어 나가면 접어도 화면에 남는다.
    expect(
      container.querySelector("details.assumption-fold ul.assumption-line"),
    ).not.toBeNull();
  });

  /**
   * "펼쳐 보기"는 인쇄에서 이미 펼쳐진 내용 위에 붙는 죽은 지시문이라
   * `.fold-more-hint`로 감싸 종이에서만 지운다(hiddenInPrint.ts).
   * 제목("계산 전제 N가지")은 펼쳐진 내용의 머리글로 뜻이 남아 그대로
   * 나간다.
   */
  it("요약의 '펼쳐 보기'만 .fold-more-hint로 감싼다", () => {
    const { container } = render(<AssumptionLine state={state()} />);
    const hint = container.querySelector(
      ".assumption-fold > summary > .fold-more-hint",
    );
    expect(hint?.textContent).toBe(" 펼쳐 보기");
  });
});
