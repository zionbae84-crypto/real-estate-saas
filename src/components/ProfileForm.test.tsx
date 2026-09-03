import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
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
   * ⚠ **이 테스트가 이 태스크의 핵심이다.** 무엇이 남았는지를 개수로
   * 못박아야 다음에 입력이 조용히 늘거나 주는 것을 잡을 수 있다.
   *
   * 이 폼이 담는 것은 넷이다 — ① 현금 ② 연 소득 ③ 무주택 여부 ④
   * 생애최초 여부. 지역(`RegionSelect`)은 예산을 알기 전에 확정하게
   * 두지 않으므로 이 폼 바깥에서, 이 폼이 끝난 뒤에 나타난다(App.tsx).
   *
   * **다섯 번째였던 평형대 질문은 사용자 지시로 사라졌다** — 면적은
   * 이제 결과 화면의 슬라이더 필터(`ComplexFilters.tsx`)가 맡는다.
   *
   * 주택 수·생애최초는 사용자 지시로 되살아났고, 둘 다 라디오 둘짜리
   * 카드다(사용자 지시로 생애최초도 체크박스에서 라디오로 바뀌어
   * 모양이 통일됐다).
   */
  it("입력이 넷이다 — 현금·연 소득·주택 수·생애최초", () => {
    renderForm();

    // 금액 입력 둘. SEED TextField는 textbox로 노출된다.
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByLabelText(/얼마 있어요/)).toBeInTheDocument();
    expect(screen.getByLabelText(/연 소득은요/)).toBeInTheDocument();

    // 체크박스는 이제 하나도 없다 — 평형대 칩이 마지막 체크박스였다.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    // 무주택 여부 라디오 둘 + 생애최초 라디오 둘 = 넷.
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(
      screen.getByRole("group", { name: "무주택이세요?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "생애최초 구입이에요?" }),
    ).toBeInTheDocument();
  });

  /**
   * 없앤 입력 셋(기존 대출·규제지역 체크박스·평형대)은 **어떤 상태에서도**
   * 돌아오지 않는다.
   */
  it("없앤 입력들은 어디에도 없다", () => {
    // touched를 채워도, 옛 조건이 참이 될 만한 상태를 만들어도 마찬가지다.
    renderForm({ touched: ["regulatedArea"] });

    expect(screen.queryByLabelText(/매달 나가는 대출금/)).toBeNull();
    expect(screen.queryByLabelText(/전용면적/)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /규제지역/ })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "어느 평형대요?" }),
    ).toBeNull();
  });

  it("현금과 연 소득을 입력할 수 있다", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "20000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "7000");
    expect(screen.getByLabelText(/얼마 있어요/)).toHaveValue("20000");
    expect(screen.getByLabelText(/연 소득은요/)).toHaveValue("7000");
  });

  /**
   * 생애최초는 값 자체(`isFirstTimeBuyer`)가 항상 true/false라 라디오
   * 둘 중 하나는 언제나 선택돼 있다 — 무주택 질문과 달리 "아직 아무것도
   * 선택 안 됨" 상태가 없다(안전한 기본값이라 답을 강제하지 않는다).
   */
  it("생애최초는 기본으로 '아니에요'가 선택돼 있다 — 안전한 기본값이다", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "아니에요" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "맞아요" })).not.toBeChecked();
  });

  it("무주택이세요 질문은 기본으로 어느 쪽도 선택돼 있지 않다", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "무주택이에요" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "집이 있어요" })).not.toBeChecked();
  });

  it("주택 수·생애최초를 고르면 폼 상태가 바뀐다", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("radio", { name: "집이 있어요" }));
    expect(screen.getByRole("radio", { name: "집이 있어요" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "무주택이에요" }),
    ).not.toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "맞아요" }));
    expect(screen.getByRole("radio", { name: "맞아요" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "아니에요" })).not.toBeChecked();
  });

  it("인쇄에서 통째로 지워지는 자리에 있다 — .profile-form", () => {
    const { container } = renderForm();
    expect(container.querySelector(".profile-form")).not.toBeNull();
  });
});
