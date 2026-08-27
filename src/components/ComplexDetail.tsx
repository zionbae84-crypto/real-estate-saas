import { useEffect, useRef } from "react";
import { AGGREGATION_WINDOW_LABEL } from "../data/complexes";
import type { ComplexUnit } from "../data/complexes";
import { formatWon, formatWonRoundedToMan } from "../format/won";
import type { BurdenAtPrice, CostBreakdown as CostBreakdownData } from "../lib/finance";
import type { PriceBudgetInput } from "../lib/price";
import { rules } from "../state/useAffordability";
import { locationRules } from "../state/useLocationFacts";
import { priceRules } from "../state/usePriceCheck";
import { formatRange } from "./ComplexList";
import { CostBreakdown } from "./CostBreakdown";
import { LandLeaseNote } from "./LandLeaseNote";
import { LocationFacts } from "./LocationFacts";
import { NoLoanLine } from "./NoLoanLine";
import { PriceCheck } from "./PriceCheck";
import { formatRatio, SafetyBadge, StressFigures } from "./SafetyBadge";

export interface ComplexDetailProps {
  unit: ComplexUnit;
  /** `unit.maxPrice`에서의 부담. ComplexList와 같은 기준(범위 위쪽)이다 */
  burden: BurdenAtPrice;
  /** `unit.maxPrice`에서의 부대비용 내역 */
  costs: CostBreakdownData;
  /**
   * 부대비용의 취득세 줄에 붙는 주택 수 고지. 호출부가
   * `householdCountNoteFor`로 골라 넘긴다({@link CostBreakdown} 참고) —
   * 위쪽 `BudgetResult`와 같은 값이라 한 화면이 두 말을 하지 않는다.
   */
  householdCountNote: string;
  /**
   * 호가 위치 확인의 예산 줄에 쓸 실거주 프로필. 없으면 그 줄을
   * 만들지 않는다({@link PriceCheck} 참고).
   */
  priceBudget: PriceBudgetInput | null;
  onClose: () => void;
}

/**
 * 대출 기간 표기. 룰셋의 `loanTermMonths`에서 만든다 — 화면에 "30년"을
 * 하드코딩하면 룰셋이 바뀐 날 화면만 옛 숫자를 계속 말한다.
 *
 * 12로 나누어떨어지지 않으면 개월로 적는다. 반올림해서 "30년"이라고
 * 말해 버리면 화면이 계산에 쓰이지 않은 값을 적게 된다.
 */
function loanTermLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}

/**
 * 금리 표기. 4.53% / 4.2%처럼 의미 없는 뒤 0은 떼고 적는다.
 * 값은 언제나 룰셋(`rules.baseRate`)에서 온다.
 */
function ratePercentLabel(rate: number): string {
  return `${+(rate * 100).toFixed(2)}%`;
}

/**
 * 단지 상세: 고른 평형을 **두 블록**으로 줄인 화면(design.md §6).
 *
 * ```
 * ┌───────────────────────────────┐  ← 카드(목록 행 `.complex-row`와
 * │ 취득시 부대비용                │     같은 바탕·테두리·반경·그림자)
 * │ 851만원                    ⌄  │  ← 값(크게) + 내역 아이콘(접힘 트리거)
 * └───────────────────────────────┘
 * ┌───────────────────────────────┐
 * │ 매달 나가는 돈                 │
 * │ 120만원                        │
 * │ 대출 2억원 · 30년 · 연 4.53% 가정│
 * │ 소득 대비 22.0%                │
 * │   ▶ 금리가 2%p 오르면          │  ← 접힘
 * └───────────────────────────────┘
 * ```
 *
 * **큰 숫자 둘은 만원 단위로 반올림해 보여준다**(사용자 지시:
 * "살때드는비용, 매달나가는 비용은 반올림해서 만원단위로 보여줘").
 * 반올림은 `formatWonRoundedToMan`이 **표시할 때만** 하고, 같은 값을
 * 쓰는 다른 자리(내역의 항목별 금액·가정 줄의 대출액·`PrintSummary`·
 * 목록 행의 가격)는 그대로 정확한 원 단위다 — 계산은 어디서도 바뀌지
 * 않는다.
 *
 * 사용자가 "지금은 너무 복잡해졌어"라고 했다. **이 화면은 빼는
 * 작업이었다** — 계산(`src/lib/finance/`)도 팔레트도 영상도 그대로 두고,
 * 배치와 분량만 줄였다. 그래서 아래 세 가지가 이 컴포넌트의 계약이다.
 *
 * 1. **접는 것과 지우는 것은 다르다.** 사용자가 "더 필요한 부분은 계속
 *    추가해갈께"라고 했으므로 `PriceCheck`·`LocationFacts`는 지우지 않고
 *    `<details>`(기본 닫힘)로 접는다. 두 영역의 고지 문구는 대부분
 *    `MUST_SURVIVE_PRINT_CLASSES`라 **인쇄에서는 펼쳐져야 한다** —
 *    `styles.css`의 `@media print`에 있는 `::details-content` 규칙이 그
 *    일을 하고, 이 화면이 진짜 `<details>`를 쓰는 한 그 규칙이 그대로
 *    걸린다(`ComplexDetail.test.tsx`가 그 형태를, `printCss.test.ts`가
 *    CSS 쪽을 각각 잠근다). 직접 만든 상자로 접으면 그 규칙이 닿지 않아
 *    종이에서 내용이 통째로 사라진다 — `.budget-panel`이 이미 한 번
 *    막은 사고다.
 * 2. **맨숫자 0은 답의 모양을 한 거짓말이다.** 대출이 필요 없으면 "월
 *    상환액 0원 / 부담률 0.0%"를 크게 찍는 대신 "대출 없이 살 수
 *    있어요"를 낸다(`NoLoanLine` — 목록 행과 같은 컴포넌트다).
 * 3. **가정은 화면에 적는다.** 금리·기간은 룰셋 값이고, 숨기지 않고 값
 *    바로 아래 한 줄로 적는다.
 *
 * **모든 계산은 `unit.maxPrice` 기준이다** — ComplexList와 같은 규칙(범위
 * 위쪽으로 재야 부담이 표시보다 커지지 않는 방향으로만 틀린다).
 *
 * `medianPrice`·변동률은 여기서도 내지 않는다. 부모 스펙 §12는 화면
 * 전체에 걸리는 제약이지 목록에만 걸리는 것이 아니다.
 *
 * 이 화면이 열려 있는 동안 호출부(App.tsx)가 이 평형의
 * `maxExclusiveAreaSqm`(실제 최대 전용면적, 반올림한 `areaBucket`이
 * 아니다)을 반영해 화면 전체(위쪽 실구매 가능 가격 포함)를 계산한다 —
 * 그래서 이 화면을 여는 동안 위쪽 숫자도 함께 움직일 수 있다. **프로필에는
 * 저장하지 않는다** — 이 화면을 닫으면 원래 가정 면적으로 곧바로
 * 되돌아간다. 그 사실을 `.complex-detail-basis` 한 줄이 말한다(예전에는
 * 세 문장이었다 — 뜻은 그대로 두고 길이만 줄였다).
 */
export function ComplexDetail({
  unit,
  burden,
  costs,
  householdCountNote,
  priceBudget,
  onClose,
}: ComplexDetailProps) {
  /**
   * 상세가 열리면 포커스를 이 화면으로 옮긴다.
   *
   * 목록이 통째로 사라지고 이 화면이 그 자리에 나타나는데, 포커스는
   * 방금 사라진 행 버튼 자리에 남는다 — 스크린리더 사용자에게는 아무
   * 일도 일어나지 않은 것처럼 들린다. 화면이 바뀌었다는 사실 자체가
   * 전달되지 않으면 그 뒤의 숫자도 읽히지 않는다.
   *
   * 첫 요소(← 목록으로)가 아니라 섹션 자체에 포커스를 준다. 섹션의
   * 접근 가능한 이름("단지 상세")과 그 안의 제목·본문이 순서대로
   * 읽히므로, 사용자가 "무엇이 열렸는지"부터 듣는다.
   *
   * `unit`이 바뀌면 다시 옮긴다 — 다른 평형의 상세로 갈아탈 때도
   * 같은 전환이다.
   */
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus();
  }, [unit]);

  /**
   * 이 평형에 농어촌특별세가 붙었는가.
   *
   * **`calcAcquisitionTax`와 정확히 같은 조건·같은 값을 본다** —
   * 호출부가 넘긴 `costs`는 이 평형의 실제 최대 전용면적
   * (`maxExclusiveAreaSqm`)으로 계산됐고(App.tsx의 `effectiveProfile`),
   * 임계값도 룰셋에서 그대로 읽는다. 반올림한 `areaBucket`이나 하드코딩한
   * 85로 재면 경계 평형에서 화면이 합계와 다른 말을 한다.
   */
  const ruralTaxApplies =
    unit.maxExclusiveAreaSqm > rules.acquisitionTax.ruralTaxAreaThresholdSqm;

  return (
    <section
      className="complex-detail"
      aria-label="단지 상세"
      ref={sectionRef}
      tabIndex={-1}
    >
      <button type="button" className="complex-detail-back" onClick={onClose}>
        ← 목록으로
      </button>

      <h2 className="complex-detail-title">
        {unit.complexName} {unit.areaBucket}㎡ · {unit.legalDongName}
      </h2>
      <p className="complex-detail-built">{unit.builtYear}년 준공</p>

      <p className="complex-detail-range">
        {formatRange(unit.minPrice, unit.maxPrice)}
        <span className="complex-trades"> · {AGGREGATION_WINDOW_LABEL} 거래 {unit.tradeCount}건</span>
      </p>

      {/*
        예전에는 세 문장이었다("전용면적을 반영해서 계산했어요 / 위쪽
        실구매 가능 가격도 바뀌었을 수 있어요 / 프로필에 저장하지는
        않아요"). 화면 대부분이 이런 설명 문단이라는 것이 사용자가
        지적한 문제라, **뜻은 그대로 두고 한 문장으로 줄였다** — 아래
        숫자들이 어느 가격·어느 면적을 전제로 하는지, 그리고 그
        면적이 이 화면에서만 쓰이는 임시값이라는 것.

        가격 전제를 여기 한 번만 적는다. 두 블록이 **같은** 전제를
        쓰므로 블록마다 되풀이하면 같은 말이 세 번 나온다.
      */}
      <p className="complex-detail-basis">
        아래 숫자는 범위 위쪽인 {formatWon(unit.maxPrice)}과 이 평형의 전용{" "}
        {unit.areaBucket}㎡ 기준이고, 이 면적은 목록으로 돌아가면 고른
        평형대 기준으로 되돌아가요.
      </p>

      {/*
        `landLeasehold`를 넘긴다 — 이 배지는 **이 평형**에 대한 답이라,
        우리 월 상환액이 이 집의 매달 부담을 다 담는지가 등급에 걸린다.
        목록의 행 배지와 같은 함수에서 나오므로 두 화면이 같은 집을 두고
        다른 등급을 말할 수 없다(`lib/burden-grade.ts`).

        **`showFigures={false}`** — 월 상환액·부담률·금리 시나리오는 아래
        ② 블록이 낸다. 배지가 같은 값을 세로 `<dl>`로 한 번 더 내던 것이
        사용자가 스크린샷으로 지적한 바로 그 자리다(라벨과 값이 세로로
        흩어지고 값이 어정쩡하게 들여쓰기된 모양). 등급 글자와 등급이 왜
        거기서 멈췄는지는 그대로 남는다.
      */}
      <SafetyBadge
        safety={burden.safety}
        label="이 집을 샀을 때예요"
        landLeasehold={unit.landLeasehold}
        showFigures={false}
      />

      {/*
        토지임대부 표시는 배지 **바로 아래**에 붙는다. 아래 두 블록이
        내는 금액에 토지 사용료가 빠져 있다는 사실이, 그 숫자를 읽기
        직전에 와야 한다. 화면 끝으로 밀면 숫자와 떨어져 읽히지 않는다.

        금액을 채워 넣지는 않는다 — 토지 사용료는 우리 데이터에 없다.
        `CostBreakdown`에도 넣지 않는 이유가 같다: 없는 값을 0으로 두면
        부대비용 합계가 실제보다 작아지고, 지어낸 값을 두면 화면이 없는
        근거로 계산한다.
      */}
      <LandLeaseNote landLeasehold={unit.landLeasehold} />

      {/*
        ① 취득시 부대비용(예전 이름: "살 때 드는 비용" — 사용자 지시로
        바꿨다). **계산은 그대로다**(`CostBreakdown`이 받는 `costs`는
        호출부가 `calcAcquisitionCosts`로 낸 값 그대로) — 바뀐 것은
        합계를 크게 앞으로 꺼내고 항목별 내역을 접은 배치, 그리고 그
        합계를 만원 단위로 반올림해 **보여주는** 것뿐이다.
      */}
      <section className="detail-block detail-block--costs">
        <h3 className="detail-stat-label">취득시 부대비용</h3>
        {/*
          값과 내역 트리거를 **한 줄**에 둔다. 사용자 지시가 "살때드는
          비용 의 옆에 상세보기 아이콘"이라 트리거는 큰 금액 옆에 붙어야
          하고, `<summary>`는 `<details>` 안에서만 살 수 있으므로 이
          래퍼가 둘을 같은 줄에 앉힌다(배치는 styles.css의
          `.detail-stat-line` — 두 요소를 같은 그리드 행에 겹쳐 두고,
          펼친 표는 그 아래로 전체 폭을 쓴다).

          ⚠ **`<details>` 자체를 옮기거나 갈아엎지 않는다** — 인쇄에서
          내역을 펼치는 규칙이 그 태그에 걸린다(CostBreakdown 주석).
        */}
        <div className="detail-stat-line">
          {/*
            ⚠ **표시만 반올림한다.** 사용자 지시 ④("반올림해서 만원단위로
            보여줘")는 이 화면의 큰 숫자 둘에만 걸린다 — 아래 내역의
            항목별 금액도, `PrintSummary`도, 목록 행의 가격도 계속
            `formatWon`의 정확한 원 단위를 쓴다. 두 표기가 같은
            `costs.total` 하나에서 나온다는 것은 변하지 않는다.
          */}
          <p className="detail-stat-value">{formatWonRoundedToMan(costs.total)}</p>
          <CostBreakdown
            costs={costs}
            householdCountNote={householdCountNote}
            repeatTotal={false}
          />
        </div>
        {ruralTaxApplies && (
          /*
            85㎡ 초과분에 붙는 농어촌특별세는 위 합계에 **이미 들어
            있다**(`calcAcquisitionTax`). 그런데 그 사실은 합계만 봐서는
            보이지 않고, 같은 가격의 작은 평형과 견줄 때 이 평형만 더
            비싼 이유가 된다 — 한 줄로 말한다. 해당하지 않는 평형에서는
            줄 자체를 만들지 않는다(늘 떠 있는 고지는 같은 자리의 진짜
            고지까지 함께 닳게 만든다).
          */
          <p className="detail-stat-note">
            전용 {rules.acquisitionTax.ruralTaxAreaThresholdSqm}㎡를 넘는
            평형이라 농어촌특별세가 붙어 있어요.
          </p>
        )}
      </section>

      {/*
        ② 매달 나가는 돈.

        ⚠ **대출이 필요 없으면 0원을 크게 찍지 않는다.** 현금만으로
        덮이는 가격이라 값 자체는 정확히 0이지만, 크게 박힌 0은 계산이
        안 된 것처럼도 읽히고 언제나 가장 낙관적으로 읽힌다 — 이 저장소가
        `no-budget`을 보호 대상으로 두고 상단바가 0원일 때 문장을 내는
        것과 같은 규칙이다. 대신 목록 행과 **같은 컴포넌트**(`NoLoanLine`)로
        "대출 없이 살 수 있어요"를 내므로, 두 화면이 이 말을 다르게 할 수
        없다. 토지임대부 단서도 그 컴포넌트가 같은 자리에서 함께 낸다.
      */}
      <section className="detail-block detail-block--monthly">
        <h3 className="detail-stat-label">매달 나가는 돈</h3>
        {burden.neededLoan === 0 ? (
          <p className="detail-stat-value detail-stat-value--sentence">
            <NoLoanLine landLeasehold={unit.landLeasehold} />
          </p>
        ) : (
          <>
            {/*
              여기도 **표시만** 만원 단위로 반올림한다(사용자 지시 ④).
              바로 아래 가정 줄의 대출액은 그대로 정확한 원 단위다 —
              그 줄은 이 숫자가 무엇을 전제로 나왔는지 말하는 자리라
              계산에 들어간 값 그대로여야 한다.
            */}
            <p className="detail-stat-value">
              {formatWonRoundedToMan(burden.safety.monthlyPayment)}
            </p>
            {/*
              금리·기간은 **가정이고 화면에 적는다.** 값은 룰셋에서
              오므로, 룰셋이 바뀌면 이 줄도 함께 바뀐다.
            */}
            <p className="detail-stat-note">
              대출 {formatWon(burden.neededLoan)} ·{" "}
              {loanTermLabel(rules.loanTermMonths)} · 연{" "}
              {ratePercentLabel(rules.baseRate)} 가정
            </p>
            {/*
              상환부담률은 **한 줄로만.** 별도 지표 블록으로 키우면 이
              화면이 다시 지표판이 된다. 소득이 없으면 0%가 아니라 그
              사실을 말한다 — 여기서도 맨숫자 0은 쓰지 않는다.
            */}
            <p className="detail-burden-ratio">
              {Number.isFinite(burden.safety.burdenRatio)
                ? `소득 대비 ${formatRatio(burden.safety.burdenRatio)}`
                : "연 소득이 0이라 소득 대비 부담률은 계산하지 못했어요"}
            </p>
            <details className="detail-fold detail-fold--stress">
              <summary>
                금리가 2%p 오르면<span className="fold-more-hint"> 보기</span>
              </summary>
              <p className="safety-stress">
                <StressFigures safety={burden.safety} />
              </p>
            </details>
          </>
        )}
      </section>

      {/*
        호가 위치 확인은 **여기**에 붙는다. 위 계산은 전부 이 평형의
        범위 위쪽(`unit.maxPrice`)을 전제로 한 것이고, 사용자가 실제로
        들은 가격은 그와 다르다 — 그 가격이 이 평형의 최근 6개월 실거래
        범위 어디에 있는지는 그 평형이 정해진 이 화면에서만 물을 수
        있는 질문이다(목록의 행 하나는 아직 어떤 매물도 아니고, 권리분석
        문진처럼 독립된 자리에 두면 어느 평형의 범위와 견줄지가 없다).

        **평형별 `key`를 준다.** 다른 평형의 상세로 갈아탈 때 이
        컴포넌트가 다시 마운트되면서 앞 매물의 호가가 비워진다. 없으면
        화면은 멀쩡한 판정을 내는데 그 판정이 통째로 다른 집에 대한 것이
        된다 — 이 제품이 절대 만들면 안 되는 종류의 조용한 오답이다.

        **접었지만 지우지 않았다**(design.md §6). 사용자가 "더 필요한
        부분은 계속 추가해갈께"라고 했다. `<details>` 안의 것은 DOM에
        그대로 있고, 인쇄에서는 `::details-content` 규칙이 강제로 펼친다 —
        `price-no-estimate`("적절한 값이 얼마인지 매기지 않아요")·
        `price-disclosure`(층·향 미반영, 신고 지연)가 종이에서 사라지면
        종이를 건네받은 사람이 남은 판정을 "적정가 판정"으로 읽는다.
      */}
      <details className="detail-fold detail-fold--price">
        <summary>
          {priceRules.position.label}
          <span className="fold-more-hint"> 더 보기</span>
        </summary>
        <PriceCheck
          key={`${unit.complexKey}|${unit.areaBucket}`}
          unit={unit}
          budget={priceBudget}
          // 제목은 바로 위 summary가 같은 문구로 이미 적었다.
          showTitle={false}
        />
      </details>

      {/*
        입지 사실은 **여기, 맨 뒤**에 붙는다. 이유가 셋이다.

        1. 이건 평형이 아니라 **단지**의 성질이다. 같은 단지의 59㎡와
           84㎡는 같은 자리에 있으므로 `complexKey` 하나로 묻는다. 위의
           모든 계산이 평형별인 것과 결이 다르니 그 덩어리 안에 끼우지
           않는다.
        2. 이 앱의 방침은 "사지 말아야 할 때를 말해주는 것"이라 화면의
           무게 순서가 곧 위험 순서다. 부담·호가 같은 "멈춰야 할 이유"가
           앞이고, 거리라는 사실은 그 자체로 판단이 아니므로 뒤다.
        3. 그 결과 이 화면이 **마지막으로 하는 말**이 "우리가 재지 못하는
           것"(직선거리는 도보거리가 아니라는 것, 배정은 거리순이 아니라는
           것)이 된다. 종이로 인쇄해도 그 순서가 그대로 남는다.

        목록의 행이 아니라 상세에 두는 이유는 `PriceCheck`와 같다 — 목록
        행에 거리를 붙이면 그 숫자가 곧바로 행끼리 견주는 눈금이 되고,
        그건 우리가 매기지 않기로 한 순위를 사용자가 대신 매기게 만든다.

        `key`를 주지 않는 이유: 이 컴포넌트에는 사용자가 넣는 값이 없어
        다른 단지로 갈아탈 때 남을 상태가 없다. `complexKey`가 바뀌면
        그대로 다시 계산된다.

        **여기도 접었지만 지우지 않았다.** 접힌 안에는 지금 모든 단지가
        걸려 있는 상태 문구("아직 위치를 몰라요" + 왜 그런지)가 들어
        있다 — 그 문장이 사라지면 빈 자리가 "반경 안에 아무것도 없다"로
        읽힌다. 한 축의 모름이 다른 축의 기본값으로 흡수되는 것이 이
        저장소가 여섯 번 반복한 실패다.
      */}
      <details className="detail-fold detail-fold--location">
        <summary>
          {locationRules.label}
          <span className="fold-more-hint"> 더 보기</span>
        </summary>
        <LocationFacts
          complexKey={unit.complexKey}
          // 제목은 바로 위 summary가 같은 문구로 이미 적었다.
          showTitle={false}
        />
      </details>
    </section>
  );
}
