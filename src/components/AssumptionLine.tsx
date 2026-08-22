import { rules } from "../state/useAffordability";
import type { AssumableField, ProfileFormState } from "../state/useProfileForm";

export interface AssumptionLineProps {
  state: ProfileFormState;
  /** 사용자가 어떤 가정 항목을 눌렀는지 알려준다. 그 항목만 제자리에서 연다. */
  onOpen: (field: AssumableField) => void;
}

interface AssumptionItem {
  /**
   * 있으면 버튼으로 렌더링해 눌러서 그 필드를 연다. 없으면 순수 정보
   * 문구다 — 고칠 수 있는 화면이 아직 없는 경우(예: 옛 갈아타기 정보)에
   * 쓴다. 누를 곳이 없는데 버튼처럼 보이면 그 자체가 거짓말이다.
   */
  field?: AssumableField;
  /** 그대로 표시되는 문장. 실제 기본값에서 만든다 — 하드코딩하지 않는다. */
  text: string;
}

/**
 * 지금 가정 중인 항목을 문장으로 드러낸다. 숨긴 가정을 조용히 깔지
 * 않고, 결과 옆에 두어 눌러서 고칠 수 있게 한다.
 *
 * 가정은 기존 부채를 빼고 전부 사용자에게 불리한 쪽이다(규제지역으로
 * 계산, 농특세가 붙는 면적으로 계산) — 고치면 숫자가 올라간다. 추가
 * 입력이 벌점이 아니라 보상이 되게 하기 위해서다. 기존 부채만 방향이
 * 반대다: 없는 빚을 지어낼 수 없으니 0으로 가정하고, 고치면(실제 부채를
 * 알려주면) 숫자가 내려간다. 그 사실이 문구에 드러나야 한다.
 *
 * 문장은 각 필드의 실제 상태값에서 만든다 — 예를 들어 규제지역 문구는
 * `state.isRegulatedArea`가 참인지 거짓인지에 따라 달라진다. 문자열을
 * 하드코딩하면 기본값(또는 사용자가 뒤집어 둔 값)이 바뀌었을 때 문구가
 * 거짓말을 하게 된다.
 *
 * 기존 부채 항목은 `touched` 대신 실제 값(`existingDebtAnnualPayment`)의
 * null 여부로 가정 중인지 판단한다. `touched`만 보면 두 가지 경로에서
 * 문구가 거짓말을 한다: (1) 옛 저장본을 복원하면 `touched`는 빈
 * 배열이지만 부채 금액 자체는 그대로 복원되어 계산에 반영되는데, 그때도
 * "없음으로 계산"이라고 말하면 실제 계산과 문구가 어긋난다. (2) 입력란에
 * 못 읽는 값을 넣어 `onChange(null)`이 불리면(파싱 실패) `touched`가
 * 영구히 채워져, 계산은 여전히 0을 가정하는데 문구만 사라진다. 실제
 * 값이 null인지만 보면 두 경우 모두 계산과 문구가 항상 일치한다.
 *
 * 전용면적 임계값(농특세 85㎡)은 인자로 받는다 — 컴포넌트가 직접
 * import해 하드코딩하면 룰셋이 바뀌었을 때(예: 85 → 100) 기본값은
 * 따라가는데 문구만 옛 숫자를 계속 말하게 된다.
 *
 * 전용면적 문구도 규제지역과 마찬가지로 방향을 분기한다(리뷰 수정
 * Important 1). 가정 면적이 임계값을 넘으면(농특세 부과) 실제 면적을
 * 알려줄 때 부대비용이 줄 수 있다고 말하지만, 가정 면적이 이미 임계값
 * 이하(농특세 미부과)면 반대다 — 이미 유리한 쪽으로 가정했으므로 실제
 * 면적이 임계값을 넘을 때만 부대비용이 늘어 가격이 낮아질 수 있다. 방향을
 * 고정해 두면(항상 "이하면 늘어난다"만 말하면) 가정 면적이 이미 임계값
 * 이하인 프로필에서 진실을 말해도 부대비용이 줄어들 수 없는데 그럴 수
 * 있다고 거짓말하게 된다.
 */
export function buildAssumptionItems(
  state: ProfileFormState,
  ruralTaxAreaThresholdSqm: number,
): AssumptionItem[] {
  const items: AssumptionItem[] = [];

  if (state.existingDebtAnnualPayment === null) {
    items.push({
      field: "existingDebt",
      text:
        "기존 대출 없음으로 계산했어요. 매달 갚는 돈이 있다면 눌러서 " +
        "알려주세요 — 반영하면 살 수 있는 가격이 낮아질 수 있어요.",
    });
  }

  if (!state.touched.includes("regulatedArea")) {
    items.push({
      field: "regulatedArea",
      text: state.isRegulatedArea
        ? "규제지역으로 계산했어요. 비규제지역(수도권)이면 눌러서 바꾸세요 " +
          "— 한도가 늘어날 수 있어요."
        : "비규제지역으로 가정하고 계산했어요. 규제지역이면 눌러서 " +
          "바꾸세요 — 한도가 줄어들 수 있어요.",
    });
  }

  if (!state.touched.includes("area")) {
    // 리뷰 수정(Important 1): 임계값을 룰셋에서 유도하는 것만으로는
    // 부족하다 — 방향 주장도 가정 면적이 임계값의 어느 쪽에 있는지에
    // 따라 갈려야 한다. 가정 면적이 이미 임계값 이하(농특세 미부과)로
    // 계산 중이면 실제 면적을 알려줘도 부대비용이 "줄어들" 수는 없다
    // (이미 유리한 쪽으로 가정했으므로). 오히려 실제 면적이 임계값을
    // 넘으면 농특세가 붙어 부대비용이 늘어 가격이 "낮아질" 수 있다는
    // 반대 방향이 진실이다. regulatedArea 항목과 같은 양방향 분기 방식을
    // 따른다.
    items.push({
      field: "area",
      text:
        state.exclusiveAreaSqm > ruralTaxAreaThresholdSqm
          ? `전용면적 ${state.exclusiveAreaSqm}㎡로 가정하고 계산했어요. ` +
            "실제 면적을 눌러서 알려주세요 — " +
            `${ruralTaxAreaThresholdSqm}㎡ 이하면 부대비용이 줄어 살 ` +
            "수 있는 가격이 늘어날 수 있어요."
          : `전용면적 ${state.exclusiveAreaSqm}㎡로 가정하고 계산했어요. ` +
            "이미 농특세가 붙지 않는 면적으로 계산했어요 — 실제 면적을 " +
            "눌러서 알려주세요, " +
            `${ruralTaxAreaThresholdSqm}㎡를 넘으면 부대비용이 늘어 살 ` +
            "수 있는 가격이 낮아질 수 있어요.",
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
  // 최소한 그 사실은 알려야 한다 — 그래서 field 없는(버튼이 아닌)
  // 정보 문구로 남긴다.
  const home = state.existingHome;
  const hasStaleExistingHomeData =
    home.expectedSalePrice !== null ||
    home.remainingLoan !== null ||
    home.capitalGainsTax !== null;

  if (state.status !== "갈아타기" && hasStaleExistingHomeData) {
    items.push({
      text:
        "이전에 입력했던 갈아타기(기존 주택 매도) 정보가 있지만, 지금 " +
        "화면은 이 정보를 지원하지 않아 무주택 기준으로 계산했어요. " +
        "매도 자금은 반영되지 않았습니다.",
    });
  }

  return items;
}

export function AssumptionLine({ state, onOpen }: AssumptionLineProps) {
  const items = buildAssumptionItems(
    state,
    rules.acquisitionTax.ruralTaxAreaThresholdSqm,
  );

  if (items.length === 0) return null;

  return (
    <ul className="assumption-line">
      {items.map((item, index) => {
        const field = item.field;
        return (
          <li key={field ?? `notice-${index}`}>
            {field ? (
              <button
                type="button"
                className="assumption-item"
                onClick={() => onOpen(field)}
              >
                {item.text}
              </button>
            ) : (
              <p className="assumption-notice">{item.text}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
