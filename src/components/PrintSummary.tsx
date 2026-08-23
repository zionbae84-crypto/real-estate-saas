import { formatRuleVersionLabel } from "../format/ruleVersionLabel";
import { formatWon } from "../format/won";
import type { Rules } from "../lib/finance";
import type { ProfileFormState } from "../state/useProfileForm";

/**
 * 인쇄물에만 나오는 요약이다(화면에서는 `styles.css`가 `.print-summary`를
 * 숨긴다). 화면은 이미 이 여섯 값을 여러 자리(입력란 되비추기·가정
 * 문구)에 흩어 보여주지만, 그 자리들은 대부분 인쇄에서 지운다
 * (`.profile-form`, `src/print/hiddenInPrint.ts` 참고) — SEED
 * TextField·Checkbox의 라벨·힌트·입력란이 한 덩어리라 "입력란만" 골라
 * 지우려면 벤더 컴포넌트의 내부 DOM 구조에 기대야 하는데, 그 구조는
 * 우리가 보장할 수 있는 계약이 아니다.
 *
 * 그래서 이 컴포넌트가 여섯 전제(보유 현금·연 소득·생애최초 여부·기존
 * 대출·규제지역 여부·전용면적)를 화면 상태와 무관하게 항상 같은
 * 자리에서 평문으로 낸다. 부모 스펙 2번 항목("전제가 숫자와 함께
 * 인쇄돼야 한다")과 4번 항목("언제 기준인지 남아야 한다")을 함께 만족한다.
 */

/** 전용면적이 어디서 왔는지. 문구 방향을 가른다(App.tsx가 판단해 넘긴다). */
export type AreaSource = "assumed" | "touched" | "selectedUnit";

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
 * 여섯 전제를 라벨·값 쌍으로 만든다. 순수 함수라 `PrintSummary`(JSX)와
 * 별도로 검증할 수 있다.
 *
 * `effectiveAreaSqm`·`areaSource`를 `state.exclusiveAreaSqm`에서
 * 다시 유도하지 않고 인자로 받는다 — App.tsx의 `effectiveProfile`이
 * 단지 상세를 여는 동안 실제 평형의 면적으로 화면 계산을 바꿔치기하므로
 * (App.tsx 주석 참고), "지금 계산에 실제로 쓰인 면적"은 `state`만 봐서는
 * 알 수 없다. 호출부가 판단해 넘긴다.
 */
export function buildPrintSummaryItems(
  state: ProfileFormState,
  effectiveAreaSqm: number,
  areaSource: AreaSource,
): PrintSummaryItem[] {
  return [
    {
      label: "보유 현금",
      value: state.cash === null ? "입력 안 함" : formatWon(state.cash),
    },
    {
      label: "연 소득(세전)",
      value:
        state.annualIncome === null ? "입력 안 함" : formatWon(state.annualIncome),
    },
    {
      label: "생애최초 주택 구입",
      value: state.isFirstTimeBuyer ? "예" : "아니오",
    },
    {
      label: "기존 대출(연간 상환액)",
      value:
        state.existingDebtAnnualPayment === null
          ? "없음(가정)"
          : `${formatWon(state.existingDebtAnnualPayment)} (연간, 직접 입력)`,
    },
    {
      label: "규제지역 여부",
      value:
        (state.isRegulatedArea ? "규제지역" : "비규제지역") +
        (state.touched.includes("regulatedArea") ? "" : " (가정)"),
    },
    {
      label: "전용면적",
      value: `${effectiveAreaSqm}㎡${areaNoteFor(areaSource)}`,
    },
  ];
}

function areaNoteFor(source: AreaSource): string {
  switch (source) {
    case "assumed":
      return " (가정값)";
    case "touched":
      return " (직접 입력)";
    case "selectedUnit":
      return " (선택한 매물의 실제 면적)";
  }
}

export interface PrintSummaryProps {
  state: ProfileFormState;
  effectiveAreaSqm: number;
  areaSource: AreaSource;
  rules: Pick<Rules, "effectiveFrom">;
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
  const items = buildPrintSummaryItems(state, effectiveAreaSqm, areaSource);

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
