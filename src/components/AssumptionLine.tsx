import type { AssumableField, ProfileFormState } from "../state/useProfileForm";

export interface AssumptionLineProps {
  state: ProfileFormState;
  /** 사용자가 어떤 가정 항목을 눌렀는지 알려준다. 그 항목만 제자리에서 연다. */
  onOpen: (field: AssumableField) => void;
}

interface AssumptionItem {
  field: AssumableField;
  /** 버튼에 그대로 표시되는 문장. 실제 기본값에서 만든다 — 하드코딩하지 않는다. */
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
 */
function buildAssumptionItems(state: ProfileFormState): AssumptionItem[] {
  const items: AssumptionItem[] = [];

  if (!state.touched.includes("existingDebt")) {
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
    items.push({
      field: "area",
      text:
        `전용면적 ${state.exclusiveAreaSqm}㎡로 가정하고 계산했어요. ` +
        "실제 면적을 눌러서 알려주세요 — 85㎡ 이하면 부대비용이 줄어 살 " +
        "수 있는 가격이 늘어날 수 있어요.",
    });
  }

  return items;
}

export function AssumptionLine({ state, onOpen }: AssumptionLineProps) {
  const items = buildAssumptionItems(state);

  if (items.length === 0) return null;

  return (
    <ul className="assumption-line">
      {items.map((item) => (
        <li key={item.field}>
          <button
            type="button"
            className="assumption-item"
            onClick={() => onOpen(item.field)}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
