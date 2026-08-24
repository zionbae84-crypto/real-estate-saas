import { rules } from "../state/useAffordability";
import type { AssumableField, ProfileFormState } from "../state/useProfileForm";

export interface AssumptionLineProps {
  state: ProfileFormState;
  /** 사용자가 어떤 가정 항목을 눌렀는지 알려준다. 그 항목만 제자리에서 연다. */
  onOpen: (field: AssumableField) => void;
  /**
   * 지금 화면이 특정 평형의 상세를 보여주고 있어, 그 평형의 실제
   * 전용면적으로 계산 중인가.
   *
   * `state.touched`(사용자가 폼에서 직접 값을 정했는지)와는 별개다.
   * 상세를 열었다고 프로필에 값을 영구히 저장하지 않으므로(App.tsx),
   * `touched`는 그대로 비어 있다 — 하지만 화면은 이미 실제 면적을 쓰고
   * 있으므로 "가정 중"이라는 문구는 거짓말이 된다. 그래서 이 플래그로
   * 별도로 전용면적 항목만 감춘다. 상세를 닫으면(목록으로 돌아가면)
   * 다시 가정으로 돌아가므로 문구도 다시 나타나야 한다.
   */
  areaOverridden?: boolean;
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
  /**
   * 리뷰 수정(인쇄 결함 2): `text` 안에서 종이 위에서는 누를 수 없는
   * 조작 지시("눌러서 알려주세요"류)를 정확히 가리키는 부분 문자열.
   * `renderAssumptionText`가 이 문자열을 `text`에서 찾아 별도 span으로
   * 감싸 인쇄에서만 숨긴다(hiddenInPrint.ts의 .assumption-action) —
   * 가정 사실과 방향 경고(고치면 숫자가 어느 쪽으로 움직이는지)는 이
   * 지시문의 앞뒤에 남아 인쇄에서도 살아남는다.
   *
   * `text`를 화면·인쇄용으로 두 벌 만드는 대신 하나의 문자열에서 잘라
   * 쓰는 이유: 두 벌을 만들면 나중에 한쪽만 고쳐져 어긋날 수 있다.
   */
  printHiddenPhrase?: string;
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
 *
 * **주택 수는 여기 나오지 않는다.** 가정할 수 있는 항목이 아니기
 * 때문이다 — 답을 듣기 전에는 계산 자체를 시작하지 않으므로
 * (`toProfile`), 이 문구가 그려지는 시점에는 사용자가 이미 답한
 * 상태다. 가정하지 않은 것을 "가정 중"이라고 말하면 그것도 거짓말이다.
 *
 * `areaOverridden`이 참이면 전용면적 항목을 아예 넣지 않는다 — 단지
 * 상세를 열어 실제 평형의 면적으로 계산 중일 때다(App.tsx가 프로필에는
 * 저장하지 않고 화면 계산에만 반영한다). `state.touched`와는 독립적인
 * 판단이다: touched는 사용자가 폼에서 직접 값을 정했는지를 기록하고,
 * `areaOverridden`은 "지금 화면이 실제 평형을 보고 있는지"를 뜻한다 —
 * 상세를 닫으면 이 플래그가 꺼지고 항목이 다시 나타나야 한다.
 */
export function buildAssumptionItems(
  state: ProfileFormState,
  ruralTaxAreaThresholdSqm: number,
  areaOverridden = false,
): AssumptionItem[] {
  const items: AssumptionItem[] = [];

  if (state.existingDebtAnnualPayment === null) {
    items.push({
      field: "existingDebt",
      text:
        "기존 대출 없음으로 계산했어요. 매달 갚는 돈이 있다면 눌러서 " +
        "알려주세요 — 반영하면 살 수 있는 가격이 낮아질 수 있어요.",
      printHiddenPhrase: "매달 갚는 돈이 있다면 눌러서 알려주세요 — ",
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
      printHiddenPhrase: "눌러서 바꾸세요 — ",
    });
  }

  if (!state.touched.includes("area") && !areaOverridden) {
    // 리뷰 수정(Important 1): 임계값을 룰셋에서 유도하는 것만으로는
    // 부족하다 — 방향 주장도 가정 면적이 임계값의 어느 쪽에 있는지에
    // 따라 갈려야 한다. 가정 면적이 이미 임계값 이하(농특세 미부과)로
    // 계산 중이면 실제 면적을 알려줘도 부대비용이 "줄어들" 수는 없다
    // (이미 유리한 쪽으로 가정했으므로). 오히려 실제 면적이 임계값을
    // 넘으면 농특세가 붙어 부대비용이 늘어 가격이 "낮아질" 수 있다는
    // 반대 방향이 진실이다. regulatedArea 항목과 같은 양방향 분기 방식을
    // 따른다.
    const overThreshold = state.exclusiveAreaSqm > ruralTaxAreaThresholdSqm;
    items.push({
      field: "area",
      text: overThreshold
        ? `전용면적 ${state.exclusiveAreaSqm}㎡로 가정하고 계산했어요. ` +
          "실제 면적을 눌러서 알려주세요 — " +
          `${ruralTaxAreaThresholdSqm}㎡ 이하면 부대비용이 줄어 살 ` +
          "수 있는 가격이 늘어날 수 있어요."
        : `전용면적 ${state.exclusiveAreaSqm}㎡로 가정하고 계산했어요. ` +
          "이미 농특세가 붙지 않는 면적으로 계산했어요 — 실제 면적을 " +
          "눌러서 알려주세요, " +
          `${ruralTaxAreaThresholdSqm}㎡를 넘으면 부대비용이 늘어 살 ` +
          "수 있는 가격이 낮아질 수 있어요.",
      printHiddenPhrase: overThreshold
        ? "실제 면적을 눌러서 알려주세요 — "
        : "실제 면적을 눌러서 알려주세요, ",
    });
  }

  // status/existingHome(갈아타기 매도 정보) 편집 UI는 ProfileForm에서
  // 완전히 빠졌다. loadStoredState가 옛 저장본의 status를 항상
  // "무주택"으로 되돌리므로(useProfileForm.ts 참고) 여기 도달하는
  // state.status는 사실상 항상 "무주택"이지만, 방어적으로 조건에 넣어
  // 둔다 — 실제로 갈아타기가 적용 중이면(status === "갈아타기") 이미
  // 반영된 것이므로 "반영 안 됐다"고 말하면 그게 거짓말이 된다.
  //
  // ⚠ **`status`와 `ownedHomeCount`는 다른 축이다.** 화면이 주택 수를
  // 묻게 되면서 `state.ownedHomeCount`는 1 이상일 수 있다 — 그래도
  // `status`는 여전히 "무주택"이다. 여기서 말하는 것은 "집이 없다"가
  // 아니라 "기존 주택을 팔아 그 돈을 보태는 계산을 하지 않았다"이므로,
  // 아래 문구는 주택 수를 언급하지 않는다. 언급하면 유주택이라고 답한
  // 사람에게 그 답을 못 들은 것처럼 말하게 된다.
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
        "화면은 기존 주택을 팔아 보태는 계산을 지원하지 않아요. " +
        "매도 자금은 반영되지 않았어요.",
    });
  }

  return items;
}

/**
 * 리뷰 수정(인쇄 결함 2): `item.text` 안에서 `item.printHiddenPhrase`가
 * 가리키는 조작 지시 부분만 별도 span(`.assumption-action`)으로 감싼다.
 * `styles.css`의 `@media print`가 그 클래스만 숨긴다 — 화면에서는 이
 * span도 그냥 인라인으로 이어져 렌더링 결과가 기존과 똑같다(스타일도,
 * 텍스트도 바뀌지 않는다).
 *
 * `text`를 인쇄용으로 다시 쓰지 않고 부분 문자열 하나(`indexOf`)로
 * 찾아 쓰는 이유: 문장을 두 벌 관리하면 나중에 한쪽만 고쳐져 화면과
 * 인쇄물이 어긋난다. 못 찾으면(오타 등으로 `printHiddenPhrase`가
 * `text`의 부분 문자열이 아니게 되면) 안전하게 원문 전체를 그대로
 * 보여준다 — 인쇄에서 조작 지시가 남는 쪽이, 가정 사실이 통째로
 * 사라지는 쪽보다 낫다.
 */
function renderAssumptionText(item: AssumptionItem) {
  if (item.printHiddenPhrase === undefined) return item.text;

  const start = item.text.indexOf(item.printHiddenPhrase);
  if (start === -1) return item.text;

  const end = start + item.printHiddenPhrase.length;
  return (
    <>
      {item.text.slice(0, start)}
      <span className="assumption-action">{item.text.slice(start, end)}</span>
      {item.text.slice(end)}
    </>
  );
}

export function AssumptionLine({
  state,
  onOpen,
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
      {items.map((item, index) => {
        const field = item.field;
        return (
          <li key={field ?? `notice-${index}`}>
            {field ? (
              <button
                type="button"
                className="assumption-item"
                // data-field는 styles.css의 CSS 선택자(`[data-field="existingDebt"]`)와
                // 짝을 이루는 순수 스타일 훅이다. onClick은 이 값을 읽지
                // 않고 클로저의 `field`를 그대로 쓴다 — data-field를 다른
                // 필드에도 붙이면 아무 기능도 얻지 못한 채 "이 속성이
                // 어디에 왜 붙는지"만 흐려진다. 그래서 CSS가 실제로
                // 걸어 쓰는 값(existingDebt)에만 한정한다.
                data-field={field === "existingDebt" ? field : undefined}
                onClick={() => onOpen(field)}
              >
                {renderAssumptionText(item)}
              </button>
            ) : (
              <p className="assumption-notice">{renderAssumptionText(item)}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
