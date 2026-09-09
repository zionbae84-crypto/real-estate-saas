import type { ReactNode } from "react";
import type { ProfileFormState } from "../state/useProfileForm";
import { MoneyInput } from "./MoneyInput";

/**
 * 화면 1이 묻는 것 — **다섯이다.**
 *
 * ① 얼마 있어요? ② 연 소득은요? ③ 어디에 살고 싶으세요?(지역) ④
 * 무주택이세요? ⑤ 생애최초 구입이에요?
 *
 * ⚠ **여섯 번째 질문(어느 평형대요?)은 사용자 지시로 사라졌다.** 면적은
 * 이제 결과 화면의 슬라이더 필터(`ComplexFilters.tsx`)가 맡고, 헤드라인
 * (실구매 가능 가격)은 항상 룰셋의 `ruralTaxAreaThresholdSqm`(85㎡)
 * 이하로 가정한다(`useProfileForm`의 `toProfile`).
 *
 * ⚠ **③(지역)은 이 컴포넌트 소유가 아니다.** `App.tsx`가
 * `regionSlot` prop으로 `<RegionSelect>`(+조회 로딩·실패 문구)를
 * 끼워 넣는다 — 지역 조회는 여러 상태(로딩·성공·실패)를 갖고 그
 * 상태에 따라 `App.tsx`가 화면 단계(`phase`)까지 옮기므로, 이 순수
 * 폼 컴포넌트가 직접 소유하기엔 책임이 다르다. 그래도 자리는 사용자
 * 지시로 여기(② 다음, ④ 앞)가 됐다 — 예산(현금·소득)을 모르는 채로
 * 지역부터 확정하게 두지 않는다는 원래 취지는 지역 카드 자체의 게이트
 * (`App.tsx`)가 그대로 지킨다.
 *
 * ④·⑤는 카드 모양이 같다 — 물음표로 끝나는 제목 + "맞아요/아니에요"류
 * 라디오 둘. ⑤는 원래 체크박스 하나였는데 ④와 통일했다(사용자 지시).
 *
 * ⚠ **③·④는 사용자 지시로 되살아났다.** 한때는 "없앤 입력 넷"(생애최초 ·
 * 기존 대출 · 주택 수 · 규제지역 체크박스)에 속해 값을
 * `ASSUMED_REMOVED_INPUTS`(useProfileForm.ts)로 고정하고 화면에는 그
 * 가정을 `AssumptionLine`이 문장으로만 알렸다. 대출·취득세 계산에 실제로
 * 반영해야 한다는 지시로 둘만 다시 실제 입력란이 됐다 — 값은 이제
 * `ProfileFormState.ownedHomeCount`·`isFirstTimeBuyer`에서 직접 온다.
 * 남은 것은 기존 대출·규제지역 체크박스 둘뿐이다.
 *
 * 규제지역만 방향이 다르다: 체크박스는 없앴지만 값은 **지역 조회가 자동
 * 판정**한다(`App.tsx`의 useEffect, `api/_data/regulated-regions.json`).
 * 그래서 그 문구는 "가정했어요"와 "판정했어요"로 갈린다.
 */
/**
 * 무주택·생애최초 도움말을 **여기서만** 적는다 — 상단바 설명 카드
 * (`App.tsx`의 `HoverTooltipCard`)가 그대로 가져다 쓴다. 두 화면이 같은
 * 필드를 다른 말로 설명하지 않기 위해서다(`App.tsx`의 같은 원칙 참고).
 *
 * 배열인 이유: 화면 1의 `<p className="hint">`는 이어 붙인 한 문단으로
 * 자연스럽게 줄바꿈되지만, 상단바 카드는 좁고 `white-space: nowrap`이라
 * 줄을 직접 나눠 줘야 한다(사용자 지시: "내용이 다르면 2줄로 정리해줘").
 * 무주택은 LTV(담보인정비율)와 무관해 한 줄, 생애최초는 규제지역에서
 * LTV가 40%→70%로 바뀐다는 사실이 더해져 두 줄이다 — 그 사실의 근거는
 * `src/lib/finance/loan-limit.ts`의 `ltvRateFor`.
 */
export const OWNED_HOME_HINT_LINES = [
  "이미 집이 있으면 받을 수 있는 정책대출과 취득세 계산이 달라져요.",
] as const;
export const FIRST_TIME_BUYER_HINT_LINES = [
  "생애최초로 집을 사면 취득세 감면과 정책대출 우대를 받을 수 있어요.",
  "규제지역에서는 대출 한도(LTV)도 40%에서 70%로 늘어나요.",
] as const;

export interface ProfileFormProps {
  state: ProfileFormState;
  setField: <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => void;
  /**
   * 지역 선택(+조회 상태 문구)이 들어갈 자리. `App.tsx`가 넘긴다 —
   * 위 파일 머리 주석 참고. `null`이면 그 자리에 아무것도 그리지
   * 않는다(예: 순수 렌더 검증에서 이 슬롯을 비워 두고 싶을 때).
   */
  regionSlot?: ReactNode;
  /**
   * 질문 카드가 **모두 끝난 자리**에 놓는 것(조회 버튼과 그 이유 문구).
   *
   * 사용자 지시로 조회 버튼이 지역 카드 안에서 이리로 나왔다 — 카드
   * 리듬의 끝에 서야 "질문이 끝났다"는 신호가 된다. 지역 카드
   * (`regionSlot`)는 3번째 자리라 그 아래에 두면 아직 답할 질문이 둘
   * 남는다.
   */
  actionSlot?: ReactNode;
}

export function ProfileForm({ state, setField, regionSlot, actionSlot }: ProfileFormProps) {
  return (
    <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
      <MoneyInput
        id="cash"
        label="얼마 있어요?"
        value={state.cash}
        onChange={(won) => setField("cash", won)}
        hint="대출을 빼고 지금 바로 쓸 수 있는 현금이에요. 단위를 안 쓰면
          만원으로 읽어요. '3억5000'처럼 써도 돼요."
      />

      <MoneyInput
        id="income"
        label="연 소득은요? (세전)"
        value={state.annualIncome}
        onChange={(won) => setField("annualIncome", won)}
        hint="DSR(총부채원리금상환비율)로 대출 한도를 정하는 데 써요 — 소득이
          낮으면 현금이 있어도 원리금을 감당할 수 있는 만큼만 빌릴 수 있어요."
      />

      {regionSlot}

      {/*
        보유 주택 수. 정확한 채수가 아니라 "무주택이냐 아니냐"만 묻는다 —
        정책대출 자격(디딤돌 0채·보금자리론 0~1채)이 실제로 가르는 지점이
        그 하나뿐이다(policy-loans.ts). 라디오라 값을 답하기 전에는 어느
        쪽도 선택돼 있지 않다 — `toProfile`이 null을 돌려주고 계산을
        막는다(useProfileForm.ts의 ownedHomeCount 주석 참고).

        선택(라디오 줄)을 설명보다 먼저 그린다 — 사용자 지시로 카드마다
        "고르는 줄이 위, 설명이 아래"로 통일했다. 그래도 스크린 리더에는
        legend가 항상 먼저 읽히므로 "무엇에 대한 선택인지" 맥락 자체가
        사라지지는 않는다.
      */}
      <fieldset className="field household-select">
        <legend>무주택이세요?</legend>
        <div className="household-options">
          <label className="household-option">
            <input
              type="radio"
              name="owned-home-count"
              checked={state.ownedHomeCount === 0}
              onChange={() => setField("ownedHomeCount", 0)}
            />
            무주택이에요
          </label>
          <label className="household-option">
            <input
              type="radio"
              name="owned-home-count"
              checked={
                state.ownedHomeCount !== null && state.ownedHomeCount > 0
              }
              onChange={() => setField("ownedHomeCount", 1)}
            />
            집이 있어요
          </label>
        </div>
        <p className="hint">{OWNED_HOME_HINT_LINES.join(" ")}</p>
      </fieldset>

      {/*
        생애최초 주택 구입 여부. 기본값(false)이 안전한 방향이라(우대를
        빼고 계산 — 실제 생애최초 구매자에게는 숫자가 이보다 올라간다)
        위 주택 수와 달리 답하지 않아도 계산을 막지 않는다 — 그래서 두
        라디오 중 하나가 항상 이미 선택돼 있다(무주택 질문과 달리 "아직
        아무것도 선택 안 됨" 상태가 없다).

        예전에는 체크박스 하나였다. 위 무주택 질문과 같은 라디오-둘 모양
        (제목 물음표 + "맞아요/아니에요")으로 통일했다 — 사용자 지시.
      */}
      <fieldset className="field first-time-buyer-select">
        <legend>생애최초 구입이에요?</legend>
        <div className="household-options">
          <label className="household-option">
            <input
              type="radio"
              name="first-time-buyer"
              checked={state.isFirstTimeBuyer}
              onChange={() => setField("isFirstTimeBuyer", true)}
            />
            맞아요
          </label>
          <label className="household-option">
            <input
              type="radio"
              name="first-time-buyer"
              checked={!state.isFirstTimeBuyer}
              onChange={() => setField("isFirstTimeBuyer", false)}
            />
            아니에요
          </label>
        </div>
        <p className="hint">{FIRST_TIME_BUYER_HINT_LINES.join(" ")}</p>
      </fieldset>

      {actionSlot}
    </form>
  );
}
