import { rules } from "../state/useAffordability";
import type { ProfileFormState } from "../state/useProfileForm";
import { AreaBandSelect } from "./AreaBandSelect";
import { MoneyInput } from "./MoneyInput";

/**
 * 화면 1이 묻는 것 — **다섯이다.**
 *
 * ① 얼마 있어요? ② 연 소득은요? ③ 무주택이세요? ④ 생애최초 구입이에요?
 * ⑤ 어느 평형대요? (지역은 `RegionSelect`가 바로 아래에서 담당한다 —
 * 예산을 알기 전에 확정하게 두지 않으므로 이 폼이 끝난 뒤에 나타난다.)
 *
 * ③·④는 카드 모양이 같다 — 물음표로 끝나는 제목 + "맞아요/아니에요"류
 * 라디오 둘. ④는 원래 체크박스 하나였는데 ③과 통일했다(사용자 지시).
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
export interface ProfileFormProps {
  state: ProfileFormState;
  setField: <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => void;
}

export function ProfileForm({ state, setField }: ProfileFormProps) {
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
        <p className="hint">
          이미 집이 있으면 받을 수 있는 정책대출과 취득세 계산이 달라져요.
        </p>
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
        <p className="hint">
          생애최초로 집을 사면 취득세 감면과 정책대출 우대를 받을 수 있어요.
        </p>
      </fieldset>

      <AreaBandSelect
        value={state.areaBands}
        onChange={(bands) => setField("areaBands", bands)}
        // 85㎡ 경계는 농특세가 실제로 갈리는 지점이라 룰셋에서 온다 —
        // 숫자를 화면에 박아 두면 룰셋이 바뀐 날 구간 이름의 뜻과
        // 취득세 계산이 조용히 어긋난다.
        ruralTaxAreaThresholdSqm={rules.acquisitionTax.ruralTaxAreaThresholdSqm}
      />
    </form>
  );
}
