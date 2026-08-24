import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FORM_STATE,
  type AssumableField,
  type ProfileFormState,
} from "../state/useProfileForm";
import { rules } from "../state/useAffordability";
import { isExplicitlyChecked, ProfileForm } from "./ProfileForm";

/**
 * 리뷰 수정(Important 4): 아래 "indeterminate" 테스트는 지금까지
 * `isExplicitlyChecked`를 직접 호출해서만 확인했다 — 실제 프로덕션
 * 콜사이트인 `ProfileForm.tsx`의
 * `onCheckedChange={(checked) => setField("isFirstTimeBuyer", isExplicitlyChecked(checked))}`
 * 그 줄을 지나가지 않았다. 그래서 그 줄을 `!!checked`로 되돌려도 아무
 * 테스트도 실패하지 않는다는 게 리뷰의 지적이었다.
 *
 * 이 프로젝트가 물고 있는 @seed-design/react-checkbox@2.0.1의
 * `onCheckedChange`는 boolean으로만 좁혀져 있어(useCheckbox.ts 소스
 * 확인), 렌더된 SEED 컴포넌트를 클릭하는 경로로는 "indeterminate"가
 * 애초에 만들어지지 않는다. 그래서 `seed-design/ui/checkbox` 모듈 자체를
 * 가짜로 바꿔, `ProfileForm.tsx`가 실제로 넘기는 `onCheckedChange` 함수
 * 참조를 붙잡아 뒀다가 "indeterminate"로 직접 호출한다 — 우회해서
 * `isExplicitlyChecked`를 부르는 게 아니라, `ProfileForm.tsx`의 그 줄이
 * 만드는 바로 그 클로저를 실행하는 것이다.
 */
const { capturedOnCheckedChange } = vi.hoisted(() => ({
  capturedOnCheckedChange: new Map<
    string,
    (checked: boolean | "indeterminate") => void
  >(),
}));

interface FakeCheckboxProps {
  inputProps?: { id?: string };
  label?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
}

vi.mock("seed-design/ui/checkbox", () => ({
  Checkbox: ({ inputProps, label, checked, onCheckedChange }: FakeCheckboxProps) => {
    const id = inputProps?.id;
    if (id) capturedOnCheckedChange.set(id, onCheckedChange);
    return (
      <label>
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        {label}
      </label>
    );
  },
}));

/**
 * 실제 useProfileForm 훅과 같은 모양의 setField를 로컬 state로 재현한다.
 * ProfileForm은 이 콜백의 구현을 모르므로, 훅 전체를 마운트하지 않고도
 * 실제와 같은 상태 갱신 흐름을 검증할 수 있다.
 *
 * setExistingHomeField는 더 이상 ProfileForm이 받지 않는다 — 리뷰 수정으로
 * status/existingHome 편집 UI가 되살아나지 않기로 결정하면서(ProfileForm.tsx
 * 주석 참고) 죽은 배선을 걷어냈다.
 */
function renderForm(
  overrides: {
    initial?: Partial<ProfileFormState>;
    openField?: AssumableField | null;
    areaOverridden?: boolean;
    onFirstTimeBuyerChange?: (value: boolean) => void;
    onExistingDebtChange?: (value: number | null) => void;
    onOwnedHomeCountChange?: (value: number | null) => void;
  } = {},
) {
  function Harness() {
    const [state, setState] = useState<ProfileFormState>({
      ...DEFAULT_FORM_STATE,
      ...overrides.initial,
    });

    function setField<K extends keyof ProfileFormState>(
      key: K,
      value: ProfileFormState[K],
    ) {
      setState((prev) => ({ ...prev, [key]: value }));
      if (key === "isFirstTimeBuyer") {
        overrides.onFirstTimeBuyerChange?.(value as boolean);
      }
      if (key === "existingDebtAnnualPayment") {
        overrides.onExistingDebtChange?.(value as number | null);
      }
      if (key === "ownedHomeCount") {
        overrides.onOwnedHomeCountChange?.(value as number | null);
      }
    }

    return (
      <ProfileForm
        state={state}
        setField={setField}
        openField={overrides.openField ?? null}
        areaOverridden={overrides.areaOverridden ?? false}
      />
    );
  }

  render(<Harness />);
}

describe("ProfileForm", () => {
  it("보유 현금과 연 소득을 입력할 수 있다", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "7000");
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
    expect(screen.getByLabelText("연 소득 (세전)")).toHaveValue("7000");
  });

  it("생애최초 체크박스를 토글할 수 있다", async () => {
    renderForm();
    const checkbox = screen.getByRole("checkbox", { name: /생애최초/ });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("첫 화면에는 입력이 넷뿐이다 — 현금·소득·주택 수·생애최초", () => {
    // 리뷰 수정: 예전 버전은 존재한 적 없는 라벨(/기존 부채/)을 조회해
    // "없다"만 확인했다 — 실제로는 어떤 조건에서도 그 문구가 없으므로
    // 이 단언은 공허했다(항상 통과했다). 이름과 달리 개수도 세지 않았다.
    // 지금은 실제 렌더된 입력 요소 개수(textbox 2개 + radio 2개 +
    // checkbox 1개)를 직접 세고, 사라져야 하는 요소는 실제로 열었을 때
    // 나타나는 라벨로 조회한다.
    renderForm();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    expect(screen.getByLabelText(/보유 현금/)).toBeInTheDocument();
    expect(screen.getByLabelText(/연 소득/)).toBeInTheDocument();
    expect(screen.getByLabelText("무주택")).toBeInTheDocument();
    expect(screen.getByLabelText("유주택")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /생애최초/ })).toBeInTheDocument();

    // 사라져야 하는 것들 — openField로 열었을 때만 나타나는 실제 라벨로 조회한다
    expect(
      screen.queryByLabelText(/매달 나가는 대출금/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/전용면적/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /규제지역/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/주택 보유 상황/)).not.toBeInTheDocument();
  });

  it('체크박스가 "indeterminate"를 줘도 생애최초가 참이 되지 않는다', () => {
    // SEED Checkbox의 onCheckedChange는(배포판에 따라) boolean | "indeterminate"를
    // 준다. "indeterminate"를 참으로 취급하면 규제지역 LTV가 40%에서 70%로
    // 뛰어 한도를 30%p 과대 계상한다 — 이 제품이 절대 하면 안 되는 방향이다.
    //
    // 실제로 확인해 보니 이 프로젝트가 물고 있는
    // @seed-design/react-checkbox@2.0.1의 onCheckedChange는 소스 레벨에서
    // boolean 하나로만 좁혀 두어(useCheckbox.ts), 렌더된 컴포넌트를 클릭하는
    // 경로로는 "indeterminate"가 애초에 만들어지지 않는다 — 그 값을 만들 수
    // 있는 유일한 통로가 없다. 그래서 이 테스트는 ProfileForm이 실제
    // onCheckedChange에 넘기는 바로 그 좁히기 함수(isExplicitlyChecked)를
    // 직접 호출해 "indeterminate"를 통과시킨다. true/false만 넣는 우회가
    // 아니라, 렌더 트리를 거치지 않을 뿐 프로덕션 코드가 실행하는 정확히
    // 그 좁히기 로직을 그 값으로 실행한다.
    expect(isExplicitlyChecked("indeterminate")).toBe(false);
    expect(isExplicitlyChecked(true)).toBe(true);
    expect(isExplicitlyChecked(false)).toBe(false);
  });

  it('리뷰 수정(Important 4): 실제 onCheckedChange 콜사이트가 "indeterminate"를 걸러낸다', () => {
    // 위 테스트는 isExplicitlyChecked를 직접 호출할 뿐, ProfileForm.tsx의
    // `onCheckedChange={(checked) => setField("isFirstTimeBuyer",
    // isExplicitlyChecked(checked))}` 그 줄 자체를 지나가지 않는다 — 그
    // 줄을 `!!checked`로 되돌려도 이전에는 어떤 테스트도 실패하지
    // 않았다. 이 테스트는 seed-design/ui/checkbox를 가짜로 바꿔 붙잡아 둔
    // 실제 onCheckedChange 클로저를 직접 "indeterminate"로 호출해 그
    // 줄을 실제로 태운다.
    renderForm();
    const checkbox = screen.getByRole("checkbox", { name: /생애최초/ });

    // 먼저 실제로 켠다(native boolean true) — 그래야 "indeterminate"가
    // true로 잘못 좁혀지는 경우(`!!checked`)와 원래부터 false인 경우를
    // 구별할 수 있다: 이미 true인 상태에서 "indeterminate"를 흘려보내
    // false로 떨어지는지 봐야 가드가 실제로 동작했다는 증거가 된다.
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const onCheckedChange = capturedOnCheckedChange.get("first-time");
    expect(onCheckedChange).toBeDefined();
    act(() => onCheckedChange?.("indeterminate"));

    // 가드가 살아 있으면(checked === true로 좁힘) "indeterminate"는 false로
    // 떨어져 체크가 풀린다. `!!checked`로 되돌리면 `!!"indeterminate"`가
    // true이므로 체크된 채로 남아 이 단언이 실패한다.
    expect(checkbox).not.toBeChecked();
  });

  describe("기존 부채 — 매달 나가는 대출금", () => {
    it("매달 나가는 대출금을 묻고 엔진에는 12배로 넘긴다", () => {
      const onChange = vi.fn();
      renderForm({ openField: "existingDebt", onExistingDebtChange: onChange });

      // 라벨이 "연간 원리금"이 아니라 월 기준이어야 한다
      const input = screen.getByLabelText(/매달 나가는 대출금/);
      fireEvent.change(input, { target: { value: "50" } }); // 50만원/월

      // 만원 단위 해석 → 500,000원/월 → 연 6,000,000원
      expect(onChange).toHaveBeenLastCalledWith(6_000_000);
    });

    it("월 금액을 다시 표시할 때도 월 기준으로 되돌린다", () => {
      renderForm({
        openField: "existingDebt",
        initial: { existingDebtAnnualPayment: 6_000_000 },
      });
      // 연 600만원이 월 50만원으로 보여야 한다 — 왕복이 일치하지 않으면
      // 사용자가 자기가 넣은 값을 다시 열었을 때 다른 숫자를 본다.
      expect(screen.getByLabelText(/매달 나가는 대출금/)).toHaveValue("50");
    });

    it("비워 두면 여전히 비어 있는 채로 보인다", () => {
      renderForm({ openField: "existingDebt" });
      expect(screen.getByLabelText(/매달 나가는 대출금/)).toHaveValue("");
    });

    it("openField가 아니면 열리지 않는다", () => {
      renderForm();
      expect(
        screen.queryByLabelText(/매달 나가는 대출금/),
      ).not.toBeInTheDocument();
    });
  });

  describe("규제지역 — 열었을 때만 보인다", () => {
    it("openField가 regulatedArea면 체크박스와 안내가 나타난다", () => {
      renderForm({ openField: "regulatedArea" });
      const checkbox = screen.getByRole("checkbox", { name: /규제지역/ });
      expect(checkbox).toBeChecked(); // 기본값(가정)은 true

      const regulatedPercent = Math.round(
        rules.ltv.regulated.default * 100,
      ).toString();
      const unregulatedPercent = Math.round(
        rules.ltv.unregulated.default * 100,
      ).toString();
      const hintText = screen.getByText(/무주택자 LTV가/);
      expect(hintText.textContent).toContain(`${regulatedPercent}%`);
      expect(hintText.textContent).toContain(`${unregulatedPercent}%`);
    });

    it("체크박스를 눌러 규제지역 여부를 바꿀 수 있다", async () => {
      renderForm({ openField: "regulatedArea" });
      const checkbox = screen.getByRole("checkbox", { name: /규제지역/ });
      await userEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe("리뷰 수정: 상세가 열려 있으면 전용면적을 묻지 않는다", () => {
    // 상세가 열려 있는 동안 화면 계산은 그 평형의 실제 면적을 쓴다.
    // 입력란을 남겨 두면 값을 넣어도 화면이 꿈쩍하지 않는다 — 입력이
    // 조용히 무시되는 상태다. 무시할 거라면 물어보지 않는다.
    it("areaOverridden이면 openField가 area여도 입력란을 내보내지 않는다", () => {
      renderForm({ openField: "area", areaOverridden: true });
      expect(screen.queryByLabelText("전용면적 (㎡)")).not.toBeInTheDocument();
    });

    it("areaOverridden이면 touched에 area가 있어도 입력란을 내보내지 않는다", () => {
      renderForm({ initial: { touched: ["area"] }, areaOverridden: true });
      expect(screen.queryByLabelText("전용면적 (㎡)")).not.toBeInTheDocument();
    });

    it("areaOverridden이 아니면 원래대로 보인다", () => {
      renderForm({ openField: "area", areaOverridden: false });
      expect(screen.getByLabelText("전용면적 (㎡)")).toBeInTheDocument();
    });
  });

  describe("전용면적 — 열었을 때만 보인다", () => {
    it("가정값을 보여준다 — 하드코딩된 84가 아니라 실제 기본값이다", () => {
      renderForm({ openField: "area" });
      expect(screen.getByLabelText("전용면적 (㎡)")).toHaveValue(
        DEFAULT_FORM_STATE.exclusiveAreaSqm,
      );
    });

    it("유효한 값을 입력하면 그대로 반영된다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      await userEvent.type(input, "59");
      expect(input).toHaveValue(59);
    });

    it("비운 채로 blur하면 마지막 유효값으로 되돌아간다 — 값이 없는 채로 남지 않는다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      fireEvent.blur(input);
      expect(input).toHaveValue(DEFAULT_FORM_STATE.exclusiveAreaSqm);
    });

    it("0을 입력하고 blur하면 마지막 유효값으로 되돌아간다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      await userEvent.type(input, "0");
      fireEvent.blur(input);
      expect(input).toHaveValue(DEFAULT_FORM_STATE.exclusiveAreaSqm);
    });

    it("입력 도중에는(포커스가 남아 있는 동안) 지운 화면 그대로를 보여준다", async () => {
      renderForm({ openField: "area" });
      const input = screen.getByLabelText("전용면적 (㎡)");
      await userEvent.clear(input);
      expect(input).toHaveValue(null);
    });
  });

  describe("리뷰 수정(Critical 1): 값을 정한 항목은 openField 없이도(재마운트해도) 보인다", () => {
    // AssumptionLine은 openField로 가는 유일한 입구다. 값을 한 번 정하고
    // 다른 항목을 열거나(같은 세션에서 openField가 바뀌거나) 새로고침하면
    // (재마운트, openField가 useState 초깃값 null로 리셋) 그 필드를 다시
    // 열 버튼 자체가 AssumptionLine 문구에서 사라진다 — 값은 localStorage에
    // 남아 엔진을 계속 움직이는데 화면에서는 확인도 수정도 할 수 없다.
    //
    // 고침: 각 필드를 openField === field일 때 "또는" 사용자가 이미 값을
    // 정했을 때(확정 조건은 필드마다 다르다) 렌더링한다.

    it("기존 부채: 값이 있으면(existingDebtAnnualPayment !== null) openField 없이도 보인다", () => {
      renderForm({ initial: { existingDebtAnnualPayment: 6_000_000 } });
      expect(screen.getByLabelText(/매달 나가는 대출금/)).toHaveValue("50");
    });

    it("규제지역: touched에 있으면 openField 없이도 보인다", () => {
      renderForm({
        initial: { isRegulatedArea: false, touched: ["regulatedArea"] },
      });
      const checkbox = screen.getByRole("checkbox", { name: /규제지역/ });
      expect(checkbox).not.toBeChecked();
    });

    it("전용면적: touched에 있으면 openField 없이도 보인다", () => {
      renderForm({ initial: { exclusiveAreaSqm: 59, touched: ["area"] } });
      expect(screen.getByLabelText("전용면적 (㎡)")).toHaveValue(59);
    });

    it("회귀 방지: 처음 온 사용자(아무 것도 안 정한 상태)는 여전히 입력이 셋뿐이다", () => {
      renderForm();
      expect(screen.getAllByRole("textbox")).toHaveLength(2);
      expect(screen.getAllByRole("checkbox")).toHaveLength(1);
      expect(
        screen.queryByLabelText(/매달 나가는 대출금/),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/전용면적/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /규제지역/ }),
      ).not.toBeInTheDocument();
    });
  });
});

/**
 * 주택 수 질문.
 *
 * **아무것도 미리 골라 두지 않는다.** 무주택을 기본 선택으로 두면
 * 고른 적 없는 사람이 무주택으로 계산되는데, 그건 디딤돌·보금자리론
 * 자격을 모두 열어 한도를 키우는 낙관 방향이다. 이 폼의 다른 기본값이
 * 전부 과대평가를 피하는 쪽으로 놓인 것과 같은 판단이고, 여기서는
 * 그 "안전한 쪽"이 사실을 지어내는 것(당신은 집이 있다)이 되므로 아예
 * 답을 받는다.
 */
describe("ProfileForm — 주택 수", () => {
  it("아무것도 미리 골라 두지 않는다", () => {
    renderForm();
    expect(screen.getByLabelText("무주택")).not.toBeChecked();
    expect(screen.getByLabelText("유주택")).not.toBeChecked();
    // 주택 수 입력란은 유주택을 고르기 전에는 없다.
    expect(
      screen.queryByLabelText("갖고 있는 주택 수 (채)"),
    ).not.toBeInTheDocument();
  });

  it("무주택을 고르면 0채가 되고 주택 수 입력란은 나오지 않는다", async () => {
    const seen: Array<number | null> = [];
    renderForm({ onOwnedHomeCountChange: (v) => seen.push(v) });

    await userEvent.click(screen.getByLabelText("무주택"));

    expect(seen).toEqual([0]);
    expect(screen.getByLabelText("무주택")).toBeChecked();
    expect(
      screen.queryByLabelText("갖고 있는 주택 수 (채)"),
    ).not.toBeInTheDocument();
  });

  it("유주택을 고르면 1채로 시작하고 주택 수를 적을 수 있다", async () => {
    const seen: Array<number | null> = [];
    renderForm({ onOwnedHomeCountChange: (v) => seen.push(v) });

    await userEvent.click(screen.getByLabelText("유주택"));

    // 유주택이라고 답한 사람이 가질 수 있는 가장 작은 수로 시작한다 —
    // 여기서 늘리는 방향은 자격이 좁아지는 쪽이라 시작값이 한도를
    // 부풀리지 않는다.
    expect(seen).toEqual([1]);
    const input = screen.getByLabelText("갖고 있는 주택 수 (채)");
    expect(input).toHaveValue(1);

    await userEvent.clear(input);
    await userEvent.type(input, "3");
    expect(seen.at(-1)).toBe(3);
  });

  it("이미 유주택이면 라디오를 다시 눌러도 적어 둔 수가 유지된다", async () => {
    renderForm({ initial: { ownedHomeCount: 4 } });
    expect(screen.getByLabelText("유주택")).toBeChecked();

    await userEvent.click(screen.getByLabelText("유주택"));
    expect(screen.getByLabelText("갖고 있는 주택 수 (채)")).toHaveValue(4);
  });

  it("0채 미만·소수는 상위 상태로 흘러가지 않는다", async () => {
    const seen: Array<number | null> = [];
    renderForm({
      initial: { ownedHomeCount: 2 },
      onOwnedHomeCountChange: (v) => seen.push(v),
    });

    const input = screen.getByLabelText("갖고 있는 주택 수 (채)");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    expect(seen).toEqual([]);

    // 포커스를 잃으면 마지막으로 유효했던 값으로 되돌아간다 — 화면과
    // 계산값이 어긋난 채로 남지 않는다.
    fireEvent.blur(input);
    expect(input).toHaveValue(2);
  });

  it("무주택으로 되돌리면 주택 수 입력란이 사라진다", async () => {
    renderForm({ initial: { ownedHomeCount: 2 } });
    expect(screen.getByLabelText("갖고 있는 주택 수 (채)")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("무주택"));
    expect(
      screen.queryByLabelText("갖고 있는 주택 수 (채)"),
    ).not.toBeInTheDocument();
  });
});
