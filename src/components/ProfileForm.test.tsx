import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AREA_BANDS } from "../lib/area-band";
import {
  DEFAULT_FORM_STATE,
  type ProfileFormState,
} from "../state/useProfileForm";
import { ProfileForm } from "./ProfileForm";

/**
 * 실제 useProfileForm 훅과 같은 모양의 setField를 로컬 state로 재현한다.
 * ProfileForm은 이 콜백의 구현을 모르므로, 훅 전체를 마운트하지 않고도
 * 실제와 같은 상태 갱신 흐름을 검증할 수 있다.
 */
function renderForm(initial: Partial<ProfileFormState> = {}) {
  function Harness() {
    const [state, setState] = useState<ProfileFormState>({
      ...DEFAULT_FORM_STATE,
      ...initial,
    });
    return (
      <ProfileForm
        state={state}
        setField={(key, value) =>
          setState((prev) => ({ ...prev, [key]: value }))
        }
      />
    );
  }
  return render(<Harness />);
}

describe("ProfileForm — 화면 1이 묻는 것", () => {
  /**
   * ⚠ **이 테스트가 이 태스크의 핵심이다.** 스펙이 요구한 것은 새 화면이
   * 아니라 **덜어내는 것**이고, 무엇이 남았는지를 개수로 못박아야 다음에
   * 입력이 조용히 다시 늘어나는 것을 잡을 수 있다.
   *
   * 이 폼이 담는 것은 넷 중 셋이다 — ① 현금 ② 연 소득 ④ 평형대.
   * ③ 지역(`RegionSelect`)은 예산을 알기 전에 확정하게 두지 않으므로
   * 이 폼 바깥에서, 이 폼이 끝난 뒤에 나타난다(App.tsx).
   */
  it("입력이 셋뿐이다 — 현금·연 소득·평형대", () => {
    renderForm();

    // 금액 입력 둘. SEED TextField는 textbox로 노출된다.
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByLabelText(/얼마 있어요/)).toBeInTheDocument();
    expect(screen.getByLabelText(/연 소득은요/)).toBeInTheDocument();

    // 평형대 칩 넷. 이것이 유일한 체크박스 묶음이다.
    expect(screen.getAllByRole("checkbox")).toHaveLength(AREA_BANDS.length);
    expect(
      screen.getByRole("group", { name: "어느 평형대요?" }),
    ).toBeInTheDocument();

    // 라디오·숫자 입력은 하나도 없다.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  /**
   * 없앤 입력 넷이 **어떤 상태에서도** 돌아오지 않는다. 예전에는 이
   * 셋(기존 대출·규제지역·전용면적)이 `openField`/`touched`에 따라
   * 조건부로 나타났다 — 그 조건 자체가 사라졌으므로 조회할 라벨도
   * 사라져야 한다.
   */
  it("없앤 입력 넷은 어디에도 없다", () => {
    // touched를 채워도, 옛 조건이 참이 될 만한 상태를 만들어도 마찬가지다.
    renderForm({ touched: ["regulatedArea"] });

    expect(screen.queryByLabelText(/매달 나가는 대출금/)).toBeNull();
    expect(screen.queryByLabelText(/전용면적/)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /규제지역/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /생애최초/ })).toBeNull();
    expect(screen.queryByLabelText("무주택")).toBeNull();
    expect(screen.queryByLabelText("유주택")).toBeNull();
    expect(screen.queryByLabelText(/주택 수/)).toBeNull();
  });

  it("현금과 연 소득을 입력할 수 있다", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "7000");
    expect(screen.getByLabelText(/얼마 있어요/)).toHaveValue("20000");
    expect(screen.getByLabelText(/연 소득은요/)).toHaveValue("7000");
  });

  it("평형대는 기본으로 전부 켜져 있다 — 필터 없음이 시작 상태다", () => {
    renderForm();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeChecked();
    }
  });

  it("평형대 칩을 누르면 폼 상태가 바뀐다", async () => {
    renderForm();
    const 소형 = screen.getByRole("checkbox", { name: /^소형 / });
    await userEvent.click(소형);
    expect(소형).not.toBeChecked();
    // 나머지는 그대로다 — 복수 선택이다.
    expect(screen.getByRole("checkbox", { name: /^중소형 / })).toBeChecked();
  });

  /**
   * 85㎡는 농특세가 실제로 갈리는 지점이라 룰셋에서 온다. 화면이 그
   * 숫자를 직접 박으면 룰셋이 바뀐 날 구간 이름의 뜻과 취득세 계산이
   * 조용히 어긋난다.
   */
  it("평형대 경계는 룰셋의 농특세 임계값을 그대로 쓴다", () => {
    renderForm();
    expect(screen.getByText("60~85㎡")).toBeInTheDocument();
    expect(screen.getByText("85~102㎡")).toBeInTheDocument();
  });

  it("인쇄에서 통째로 지워지는 자리에 있다 — .profile-form", () => {
    const { container } = renderForm();
    expect(container.querySelector(".profile-form")).not.toBeNull();
    expect(
      container.querySelector(".profile-form .area-band-select"),
    ).not.toBeNull();
  });
});
