import { rules } from "../state/useAffordability";
import type { ProfileFormState } from "../state/useProfileForm";
import { AreaBandSelect } from "./AreaBandSelect";
import { MoneyInput } from "./MoneyInput";

/**
 * 화면 1이 묻는 것 — **딱 넷이다**(스펙 §4).
 *
 * ① 얼마 있어요? ② 연 소득은요? ③ 어디서 찾을까요? ④ 어느 평형대요?
 *
 * 이 폼은 그중 셋을 담고, ③ 지역은 `RegionSelect`가 바로 아래에서
 * 담당한다(`App.tsx`) — 지역은 예산을 알기 전에 확정하게 두지 않으므로
 * 이 폼이 끝난 뒤에 나타난다.
 *
 * ⚠ **없앤 입력 넷**(생애최초 · 기존 대출 · 주택 수 · 규제지역 체크박스)
 * **은 "모르는 값"이 아니라 "가정한 값"이 됐다.** 값 자체는
 * `ASSUMED_REMOVED_INPUTS`(useProfileForm.ts) 한 곳에 있고, 그 각각이
 * `AssumptionLine`에 **자기 문장으로** 남는다. 여기서 입력란을 지우는
 * 것과 그쪽에서 문장을 남기는 것은 한 쌍이다 — 한쪽만 하면 조용히 깔린
 * 기본값이 되고, 그게 이 저장소가 여섯 번 반복한 사고의 시작점이다.
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
