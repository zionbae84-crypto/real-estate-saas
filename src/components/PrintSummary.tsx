import { formatRuleVersionLabel } from "../format/ruleVersionLabel";
import { formatWon } from "../format/won";
import { describeAreaBands } from "../lib/area-band";
import type { Rules } from "../lib/finance";
import {
  ASSUMED_REMOVED_INPUTS,
  type ProfileFormState,
} from "../state/useProfileForm";

/**
 * 인쇄물에만 나오는 요약이다(화면에서는 `styles.css`가 `.print-summary`를
 * 숨긴다). 화면은 이 값들을 여러 자리(입력란·가정 문구)에 흩어 보여주지만,
 * 그 자리들은 대부분 인쇄에서 지운다(`.profile-form`,
 * `src/print/hiddenInPrint.ts` 참고).
 *
 * 그래서 이 컴포넌트가 계산의 전제를 화면 상태와 무관하게 항상 같은
 * 자리에서 평문으로 낸다.
 *
 * ⚠ **없앤 입력 넷의 가정값도 여기 남는다.** 종이를 건네받은 사람은
 * 화면을 보지 못했고, 그 사람에게 "무주택 기준"·"기존 대출 없음
 * 기준"이라는 전제가 빠지면 남은 숫자를 자기 사정에 그대로 적용해
 * 읽는다. 값은 `ASSUMED_REMOVED_INPUTS` 한 곳에서 온다 — 화면의 가정
 * 문구(`AssumptionLine`)와 같은 원본이라 종이와 화면이 두 말을 할 수
 * 없다.
 */

/**
 * 전용면적이 어디서 왔는지. 문구 방향을 가른다(App.tsx가 판단해 넘긴다).
 *
 * `"touched"`는 사라졌다 — 전용면적을 직접 입력하는 칸이 화면에서
 * 없어졌으므로, 이 값은 언제나 가정이거나(목록 화면) 고른 매물의 실제
 * 면적이다(상세 화면).
 */
export type AreaSource = "assumed" | "selectedUnit";

export interface PrintSummaryItem {
  label: string;
  value: string;
}

/** `Date` → "2026년 8월 23일". 인쇄일 표시에 쓴다. */
export function formatPrintDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}년 ${month}월 ${day}일`;
}

/**
 * 전제를 라벨·값 쌍으로 만든다. 순수 함수라 `PrintSummary`(JSX)와
 * 별도로 검증할 수 있다.
 *
 * `effectiveAreaSqm`·`areaSource`를 `state.exclusiveAreaSqm`에서
 * 다시 유도하지 않고 인자로 받는다 — App.tsx의 `effectiveProfile`이
 * 단지 상세를 여는 동안 실제 평형의 면적으로 화면 계산을 바꿔치기하므로,
 * "지금 계산에 실제로 쓰인 면적"은 `state`만 봐서는 알 수 없다.
 */
export function buildPrintSummaryItems(
  state: ProfileFormState,
  effectiveAreaSqm: number,
  areaSource: AreaSource,
  ruralTaxAreaThresholdSqm: number,
): PrintSummaryItem[] {
  return [
    {
      label: "얼마 있어요(현금)",
      value: state.cash === null ? "입력 안 함" : formatWon(state.cash),
    },
    {
      label: "연 소득(세전)",
      value:
        state.annualIncome === null ? "입력 안 함" : formatWon(state.annualIncome),
    },
    {
      // 네 번째 질문의 답. 이 종이의 목록에 어떤 평형이 실렸는지를
      // 정하는 값이라, 종이만 보는 사람에게 목록이 전부인지 걸러진
      // 일부인지를 알려주는 유일한 자리다.
      label: "찾는 평형대",
      value: describeAreaBands(state.areaBands, ruralTaxAreaThresholdSqm),
    },
    {
      // 아래 넷은 화면에서 **없앤 입력**의 가정값이다. 사용자가 답한
      // 것이 아니므로 전부 "(가정)"을 달아 사실과 가정을 가른다.
      label: "주택 수",
      value: `${describeOwnedHomeCount(ASSUMED_REMOVED_INPUTS.ownedHomeCount)} (가정)`,
    },
    {
      label: "생애최초 주택 구입",
      value: `${ASSUMED_REMOVED_INPUTS.isFirstTimeBuyer ? "예" : "아니오"} (가정)`,
    },
    {
      label: "기존 대출(연간 상환액)",
      value:
        ASSUMED_REMOVED_INPUTS.existingDebtAnnualPayment === 0
          ? "없음 (가정)"
          : `${formatWon(ASSUMED_REMOVED_INPUTS.existingDebtAnnualPayment)} (가정)`,
    },
    {
      // 규제지역만 출처가 둘이다 — 지역 조회가 판정했으면 확인된
      // 사실이고, 못 했으면 가정이다. 화면의 가정 문구와 같은 구분이다.
      label: "규제지역 여부",
      value:
        (state.isRegulatedArea ? "규제지역" : "비규제지역") +
        (state.touched.includes("regulatedArea") ? " (지역 판정)" : " (가정)"),
    },
    {
      label: "전용면적",
      value: `${effectiveAreaSqm}㎡${areaNoteFor(areaSource)}`,
    },
  ];
}

/**
 * 주택 수를 종이에 적을 문장으로 바꾼다.
 *
 * `0`을 그냥 "0채"로 적지 않는다 — 이 답이 뜻하는 것은 숫자가 아니라
 * 자격이고, 읽는 사람에게 "무주택"이 곧바로 뜻이 서는 말이다.
 */
function describeOwnedHomeCount(count: number): string {
  return count === 0 ? "무주택" : `유주택 ${count}채`;
}

function areaNoteFor(source: AreaSource): string {
  switch (source) {
    case "assumed":
      return " (가정값)";
    case "selectedUnit":
      return " (선택한 매물의 실제 면적)";
  }
}

export interface PrintSummaryProps {
  state: ProfileFormState;
  effectiveAreaSqm: number;
  areaSource: AreaSource;
  rules: Pick<Rules, "effectiveFrom"> & {
    acquisitionTax: Pick<Rules["acquisitionTax"], "ruralTaxAreaThresholdSqm">;
  };
  /** 테스트에서 날짜를 고정하기 위한 훅. 기본은 실제 현재 시각. */
  now?: () => Date;
}

export function PrintSummary({
  state,
  effectiveAreaSqm,
  areaSource,
  rules,
  now = () => new Date(),
}: PrintSummaryProps) {
  const items = buildPrintSummaryItems(
    state,
    effectiveAreaSqm,
    areaSource,
    rules.acquisitionTax.ruralTaxAreaThresholdSqm,
  );

  return (
    <section className="print-summary">
      <p className="print-summary-meta">
        {formatRuleVersionLabel(rules)} · 인쇄일 {formatPrintDate(now())}
      </p>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
