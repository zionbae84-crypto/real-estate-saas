import type { LocationAssessment } from "../lib/location";
import type { PriceAssessment } from "../lib/price";
import type { PurchaseAssessment } from "../lib/purchase";
import type {
  DiagnosisSummary as DiagnosisSummaryResult,
  RightsAssessment,
  SummaryRules,
} from "../lib/summary";
import { useDiagnosisSummary } from "../state/useDiagnosisSummary";

export interface DiagnosisSummaryProps {
  /**
   * 권리분석 결과. 등기부등본 문진(`RightsCheck`)이 이 앱에서 제거됐고
   * 별도 도구로 나중에 다시 만들 예정이라, `App.tsx`는 지금 항상
   * `null`만 넘긴다 — "아직 값이 없을 수도 있다"가 아니라 "영구히
   * 값이 없다"다. 그런데도 이 타입이 남아 있는 이유는
   * `src/lib/summary/types.ts`의 `RightsAssessment` 문서에 있다.
   */
  rights: RightsAssessment | null;
  /** 구매 유형별 금융 결과. 실거주거나 아직 값을 안 넣었으면 `null` — "못 봤다" */
  purchase: PurchaseAssessment | null;
  /** 호가 위치 결과. 평형을 고르지 않았거나 실거주가 아니면 `null` — "못 봤다" */
  price: PriceAssessment | null;
  /** 입지 사실. `price`와 같은 이유로 `null`일 수 있다 */
  location: LocationAssessment | null;
}

/**
 * "이 집에 대해 우리가 무엇을 확인했고, 무엇이 걸렸고, 무엇을 아예
 * 못 봤는지"를 한자리에서 말한다.
 *
 * **여기서 새로 판정하지 않는다.** 권리분석·구매 유형별 금융·호가
 * 위치·입지 사실, 네 축이 이미 낸 결과를 그대로 읽어서 나란히 놓을
 * 뿐이다(`src/lib/summary/assess.ts`).
 *
 * ## `<details>`로 접지 않는다
 *
 * 이 저장소에서 예전에 있던 큰 섹션(등기부등본 문진 `RightsCheck` —
 * 지금은 제거됐다)은 접힌 채로 시작했다. 이 화면은 그렇게 두지
 * 않는다 — 이 화면의 존재 이유가 "못 본 축을 숨기지 않는 것"인데,
 * 화면 전체를 접어 두면 그 못 본 축조차 클릭하지 않은 사람에게는
 * 보이지 않는다. 항상 펼쳐 둔다.
 *
 * ## 어디 있는가
 *
 * `App.tsx`에서 화면의 맨 끝(면책 문구 바로 위)에 둔다. 권리분석은
 * 이 앱에서 제거돼 `App.tsx`가 항상 `null`만 넘기고, 구매 유형별
 * 금융(투자 경로)과 호가·입지(실거주에서 평형을 고른 경우)는 서로
 * 배타적이라 실제로 세 축이 동시에 채워지는 일은 없다 — 그래서 이
 * 요약을 "그 화면들 위 대시보드"로 앞세우는 대신, 지금까지 본 것
 * 전부를 다시 한번 모아 보여주는 **마무리**로 둔다. 이 저장소가
 * 무거운 고지를 화면 마지막에 두는 관행(`ComplexDetail`의
 * `LocationFacts` 배치 이유)과 같은 판단이다.
 *
 * ## 대상이 다를 수 있다
 *
 * 권리분석은 사용자가 답한 등기부에 대한 것이고, 호가·입지는 목록에서
 * 고른 평형에 대한 것이다 — 같은 집이라는 보장이 없다. 이 화면은 그
 * 둘을 하나로 엮어 말하지 않는다({@link SummaryRules.targetMismatchNote}가
 * 그 사실을 언제나 고지한다) — **결합하지 않는 것도 이 화면의 답이다.**
 */
export function DiagnosisSummary({
  rights,
  purchase,
  price,
  location,
}: DiagnosisSummaryProps) {
  const { rules, summary } = useDiagnosisSummary(rights, purchase, price, location);
  return <DiagnosisSummaryView rules={rules} summary={summary} />;
}

/**
 * 위 컴포넌트가 그리는 것 전부. 데이터를 어디서 얻는지만 갈라 뒀다 —
 * `LocationFacts`·`LocationFactsView`와 같은 패턴이다. 테스트가 엔진
 * 산출물을 직접 먹여 화면을 확인할 수 있게 한다.
 */
export function DiagnosisSummaryView({
  rules,
  summary,
}: {
  rules: SummaryRules;
  summary: DiagnosisSummaryResult;
}) {
  return (
    <section className="diagnosis-summary" aria-label="진단 종합">
      <h2 className="diagnosis-summary-title">{rules.title}</h2>

      {/*
        헤드라인은 언제나 **글자**로 말한다. `data-headline`은 색을
        입히는 고리일 뿐이고, 색이 하나도 적용되지 않아도(흑백 인쇄·
        색각 이상) 지금이 "사면 안 되는 신호가 있어요"인지 "이 진단이
        확인한 범위에서는 걸리는 게 없었어요"인지 읽을 수 있어야 한다.
        `RightsVerdict`·`PurchaseVerdict`·`PriceCheck`·`LocationFacts`와
        같은 규칙이다.
      */}
      <p className="diagnosis-summary-headline" data-headline={summary.headline}>
        {summary.headlineLabel}
      </p>
      <p className="diagnosis-summary-headline-note">{summary.headlineNote}</p>

      {/*
        네 축은 언제나 네 줄이다. 못 본 축(`status === "notLooked"`)도
        똑같이 한 줄을 차지한다 — 빠진 축은 "문제없음"으로 읽히기
        때문이다(`src/lib/summary/types.ts` 문서 참고).
      */}
      <ol className="diagnosis-summary-axes">
        {summary.axes.map((axis) => (
          <li
            key={axis.id}
            className="diagnosis-summary-axis"
            data-axis={axis.id}
            data-status={axis.status}
          >
            <p className="diagnosis-summary-axis-head">
              <span className="diagnosis-summary-axis-label">{axis.axisLabel}</span>
              <span className="diagnosis-summary-axis-status">{axis.statusLabel}</span>
            </p>
            <p className="diagnosis-summary-axis-note">{axis.note}</p>
          </li>
        ))}
      </ol>

      <p className="diagnosis-summary-target-mismatch">{summary.targetMismatchNote}</p>

      <ul className="diagnosis-summary-disclaimer">
        {summary.disclaimer.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
