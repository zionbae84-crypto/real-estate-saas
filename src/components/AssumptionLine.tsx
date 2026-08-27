import { formatWon } from "../format/won";
import {
  includesAreaAboveThreshold,
  mixesAreaAcrossThreshold,
} from "../lib/area-band";
import { rules } from "../state/useAffordability";
import {
  ASSUMED_REMOVED_INPUTS,
  type AssumedRemovedInputs,
  type ProfileFormState,
} from "../state/useProfileForm";

export interface AssumptionLineProps {
  state: ProfileFormState;
  /**
   * 지금 화면이 특정 평형의 상세를 보여주고 있어, 그 평형의 실제
   * 전용면적으로 계산 중인가.
   *
   * 상세를 열었다고 프로필에 값을 영구히 저장하지 않으므로(App.tsx),
   * 폼 상태만 봐서는 이 사실을 알 수 없다 — 하지만 화면은 이미 실제
   * 면적을 쓰고 있으므로 "85㎡로 가정했다"는 문구는 그동안 거짓말이
   * 된다. 그래서 이 플래그로 전용면적 항목만 감춘다. 상세를 닫으면
   * 다시 가정으로 돌아가므로 문구도 다시 나타나야 한다.
   */
  areaOverridden?: boolean;
}

interface AssumptionItem {
  /** 그대로 표시되는 문장. 실제 가정값에서 만든다 — 하드코딩하지 않는다 */
  text: string;
}

/**
 * ⚠ **이 저장소가 여섯 번 반복한 사고를 막는 자리다.**
 *
 * 화면 1에서 아직 없앤 채로 남은 입력(기존 대출)이 계산에 넘기는 값은
 * {@link ASSUMED_REMOVED_INPUTS} 한 곳에 있다. 이 함수의 반환 타입이
 * **그 객체의 키 전체를 요구하는 `Record`**라, 가정을 하나 더 늘리면
 * 문장을 쓰지 않는 한 타입이 통과하지 않는다 — 조용히 깔린 기본값이 생길
 * 자리가 구조적으로 없다.
 *
 * ⚠ **생애최초·주택 수는 여기서 빠졌다.** 사용자 지시로 화면 1의 실제
 * 질문이 됐기 때문이다(`ProfileForm.tsx`) — 이제 그 값들은 "가정"이
 * 아니라 사용자가 고른 답이라, 이 자리(가정을 드러내는 알림)가 아니라
 * 폼 자체에 답으로 보인다. `ownedHomeCount`가 아직 `null`(미답변)인
 * 동안은 계산 자체가 멈추므로(`toProfile`) 여기서 "무주택으로 계산했어요"
 * 같은 문구를 낼 필요도, 낼 수도 없다.
 *
 * 문장은 **실제 가정값에서 만든다.** 하드코딩하면 값이 바뀐 날 화면이
 * 거짓말을 한다. 기존 대출 없음은 낙관 방향의 가정이라(실제로는 살 수
 * 있는 가격이 이보다 낮다) 그 사실이 분명해야 한다.
 *
 * **고칠 수 있는 칩이 아니라 순수 정보 문구(notice)다.** 입력란이
 * 사라졌으니 누를 곳도 사라졌다 — 눌러도 아무 일도 없는 죽은 칩은 이
 * 저장소가 이미 두 번 낸 실패다.
 */
export function removedInputNotices(
  assumed: AssumedRemovedInputs,
): Record<keyof AssumedRemovedInputs, string> {
  return {
    existingDebtAnnualPayment:
      assumed.existingDebtAnnualPayment === 0
        ? "기존 대출이 없다고 보고 계산했어요. 매달 갚는 돈이 있다면 " +
          "DSR에서 먼저 빠지므로 살 수 있는 가격이 이보다 낮아요."
        : `기존 대출을 연 ${formatWon(assumed.existingDebtAnnualPayment)} ` +
          "상환으로 보고 계산했어요.",
  };
}

/**
 * 규제지역 문구. **이 항목만 값의 출처가 둘이다.**
 *
 * 체크박스는 없앴지만 값은 지역 조회가 자동 판정한다(`App.tsx`의
 * useEffect). 판정이 온 지역(`touched`)에서는 **확인된 사실**이므로
 * "판정했어요"라고 적고, 판정이 오지 않은 지역에서는 여전히 **가정**
 * 이므로 "가정했어요"와 함께 방향까지 적는다.
 *
 * 둘을 같은 문장으로 뭉치면, 우리가 아무것도 확인하지 못한 지역에
 * 대해서도 화면이 단정하게 된다 — 모르는 것과 확인한 것을 같은 문구로
 * 보여주는, 이 앱이 가장 경계하는 오류다.
 */
function regulatedAreaNotice(state: ProfileFormState): string {
  const determined = state.touched.includes("regulatedArea");
  if (determined) {
    return state.isRegulatedArea
      ? "고른 지역은 규제지역으로 판정했어요. LTV 한도를 그 기준으로 계산했어요."
      : "고른 지역은 비규제지역으로 판정했어요. LTV 한도를 그 기준으로 계산했어요.";
  }
  return state.isRegulatedArea
    ? "이 지역이 규제지역인지 확인하지 못해 규제지역으로 보고 계산했어요. " +
        "비규제지역이면 한도가 이보다 늘어날 수 있어요."
    : "이 지역이 규제지역인지 확인하지 못해 비규제지역으로 보고 계산했어요. " +
        "규제지역이면 한도가 이보다 줄어들어요.";
}

/**
 * 지금 가정 중인 것을 문장으로 드러낸다. 숨긴 가정을 조용히 깔지 않고,
 * 결과 옆에 둔다.
 *
 * 전용면적 임계값(농특세 85㎡)은 인자로 받는다 — 컴포넌트가 직접
 * import해 하드코딩하면 룰셋이 바뀌었을 때(예: 85 → 100) 가정값은
 * 따라가는데 문구만 옛 숫자를 계속 말하게 된다.
 *
 * ⚠ **전용면적 문구는 "고른 평형대에 85㎡ 초과가 섞였을 때만" 나온다.**
 * 섞이지 않았으면 헤드라인이 쓴 전제(85㎡ 이하)는 가정이 아니라
 * **사실**이라 해명할 것이 없다 — 그런데도 "가정한 면적 기준이라…"고
 * 적으면 사실과 다른 겸양이고, 진짜 가정 넷을 읽어야 할 자리에 가짜
 * 가정이 하나 섞인다.
 *
 * 섞였을 때 적는 것도 **값이 아니라 전제**다. 범위에서 대표값 하나를
 * 뽑지 않았으므로(`useProfileForm`의 `assumedExclusiveAreaSqm`) 적을
 * 숫자가 없다.
 */
export function buildAssumptionItems(
  state: ProfileFormState,
  ruralTaxAreaThresholdSqm: number,
  areaOverridden = false,
): AssumptionItem[] {
  const items: AssumptionItem[] = [];
  const notices = removedInputNotices(ASSUMED_REMOVED_INPUTS);

  // 여전히 없앤 입력(기존 대출). **조건 없이 언제나 나온다** — 사용자가
  // 이 값을 정할 방법이 없으므로 "정했으니 문구를 감춘다"는 경로 자체가
  // 없다.
  items.push({ text: notices.existingDebtAnnualPayment });
  // 값의 출처가 지역 조회라 문구가 갈린다.
  items.push({ text: regulatedAreaNotice(state) });

  /*
   * 상세를 열면 화면 전체가 그 평형의 **실제** 면적으로 계산되므로
   * (App.tsx의 `effectiveProfile`) 평형대에서 유도한 전제를 말하면
   * 그동안 거짓말이 된다.
   */
  const headlineAssumedAboveThreshold = includesAreaAboveThreshold(
    state.areaBands,
    ruralTaxAreaThresholdSqm,
  );
  if (!areaOverridden && headlineAssumedAboveThreshold) {
    /*
     * ⚠ **뒷문장은 그런 줄이 실제로 나올 수 있을 때만 붙인다.** 목록은
     * 고른 평형대로 걸러진 뒤라(App.tsx의 `areaFilteredUnits`) 중대형만
     * 고른 사용자에게 "85㎡ 이하인 줄"은 하나도 나올 수 없다 — 그때 이
     * 약속은 존재할 수 없는 줄을 가리킨다. 앞문장(헤드라인이 쓴 전제)은
     * 그 경우에도 참이므로 그대로 둔다.
     */
    const listMayShowCheaperRows = mixesAreaAcrossThreshold(
      state.areaBands,
      ruralTaxAreaThresholdSqm,
    );
    items.push({
      text:
        `고른 평형대에 ${ruralTaxAreaThresholdSqm}㎡ 초과가 있어, 위 실구매 ` +
        "가능 가격은 농특세가 붙고 정책대출 면적 제한이 걸리는 기준으로 " +
        "계산했어요." +
        (listMayShowCheaperRows
          ? " 목록의 각 줄은 그 평형의 실제 전용면적으로 계산하니, " +
            `${ruralTaxAreaThresholdSqm}㎡ 이하인 줄은 부담이 이보다 적어요.`
          : ""),
    });
  }

  // status/existingHome(갈아타기 매도 정보) 편집 UI는 ProfileForm에서
  // 완전히 빠졌다. loadStoredState가 옛 저장본의 status를 항상
  // "무주택"으로 되돌리므로(useProfileForm.ts 참고) 여기 도달하는
  // state.status는 사실상 항상 "무주택"이지만, 방어적으로 조건에 넣어
  // 둔다 — 실제로 갈아타기가 적용 중이면(status === "갈아타기") 이미
  // 반영된 것이므로 "반영 안 됐다"고 말하면 그게 거짓말이 된다.
  //
  // 매도가·상환할 대출·양도세 중 하나라도 값이 남아 있으면, 사용자가
  // 예전에 갈아타기 정보를 입력했었다는 뜻이다(현재 UI로는 이 필드들을
  // 새로 채울 방법이 없다). 그 데이터가 조용히 버려진(계산에 반영되지
  // 않는) 채로 있으면 사용자는 알 길이 없으므로, 고칠 수는 없어도
  // 최소한 그 사실은 알려야 한다.
  const home = state.existingHome;
  const hasStaleExistingHomeData =
    home.expectedSalePrice !== null ||
    home.remainingLoan !== null ||
    home.capitalGainsTax !== null;

  if (state.status !== "갈아타기" && hasStaleExistingHomeData) {
    items.push({
      text:
        "이전에 입력했던 갈아타기(기존 주택 매도) 정보가 있지만, 지금 " +
        "화면은 기존 주택을 팔아 보태는 계산을 지원하지 않아요. " +
        "매도 자금은 반영되지 않았어요.",
    });
  }

  return items;
}

/**
 * **전부 순수 정보 문구(`assumption-notice`)다.**
 *
 * 예전에는 항목마다 버튼(`assumption-item`)이 있어 누르면 그 입력란이
 * 폼에서 열렸다. 화면 1이 네 질문으로 줄면서 그 입력란들이 전부
 * 사라졌으므로 누를 곳도 사라졌다 — 버튼 모양만 남기면 눌러도 아무 일도
 * 일어나지 않는 죽은 컨트롤이 되고, 그건 이 저장소가 이미 두 번 낸
 * 실패다. 그래서 버튼 갈래를 통째로 지웠다.
 *
 * 같은 이유로 인쇄용 부분 숨김(`.assumption-action`)도 사라졌다. 그
 * 장치는 문구 안의 "눌러서 알려주세요"류 **조작 지시**만 종이에서
 * 지우려고 있던 것인데, 이제 어느 문구에도 조작 지시가 없다 — 전부
 * 사실과 방향뿐이라 종이에 그대로 나가는 것이 맞다.
 */
export function AssumptionLine({
  state,
  areaOverridden = false,
}: AssumptionLineProps) {
  const items = buildAssumptionItems(
    state,
    rules.acquisitionTax.ruralTaxAreaThresholdSqm,
    areaOverridden,
  );

  if (items.length === 0) return null;

  return (
    <ul className="assumption-line">
      {items.map((item) => (
        <li key={item.text}>
          <p className="assumption-notice">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}
