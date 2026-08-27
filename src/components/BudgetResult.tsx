import { Text } from "@seed-design/react";
import type { AffordableResult } from "../lib/finance";
import { brokerageFeeRateFor } from "../lib/finance";
import { formatWon } from "../format/won";
import { rules } from "../state/useAffordability";
import { BindingExplainer, getBindingTitle } from "./BindingExplainer";
import { CostBreakdown } from "./CostBreakdown";
import { PolicyLoanList } from "./PolicyLoanList";

/**
 * `affordablePrice === 0`일 때 이 앱이 숫자 대신 내는 **한 문장**.
 *
 * 아래 {@link ZeroBudgetMessage}의 제목이자, 상단바 요약
 * (`ResultSummaryItem`, App.tsx)이 "실구매 가능 가격" 자리에 넣는 값이다.
 * **두 자리가 같은 상수를 본다** — 상단바가 자기 문구를 따로 지으면
 * 같은 사실을 두 가지 말로 하게 되고, 그중 하나가 바뀌는 날 화면과
 * 종이가 서로 다른 이유를 댄다. 원인 갈래(현금 부족 / 상환능력 0)는
 * 이 문장 아래에서 갈린다 — 상단바는 한 줄뿐이라 그 갈래까지는 지고
 * 가지 않고, 사이드바의 {@link ZeroBudgetMessage}가 이어서 말한다.
 */
export const ZERO_BUDGET_HEADLINE = "현재 조건으로는 주택담보대출이 나오지 않아요";

export interface BudgetResultProps {
  result: AffordableResult;
  /**
   * 부대비용의 취득세 줄에 붙는 주택 수 고지. 호출부가
   * `householdCountNoteFor`로 골라 넘긴다({@link CostBreakdown} 참고).
   */
  householdCountNote: string;
}

/**
 * 결과를 **카드 넉 장**으로 나눈다(사용자 지시).
 *
 * 1. 헤드라인 카드 — 최대 가격(요약) + 무엇이 막았는지 한 줄(산정 내역,
 *    접힘)
 * 2. 대출 한도 카드 — `BindingExplainer`
 * 3. 부대비용 카드 — `CostBreakdown`
 * 4. 정책대출 카드 — `PolicyLoanList`(자격이 없으면 스스로 `null`)
 *
 * ⚠ **예전에는 2~4가 `<details>` 한 겹 안에 함께 접혀 있었다**
 * ("부대비용·정책대출·상세 설명 더 보기"). 사용자 지시로 그 겉껍질을
 * 걷어내 셋을 각자 카드로 세웠다 — 부대비용 합계와 대출 한도 금액이
 * 화면에서 **한 번에 보이는 요점**이 됐다.
 *
 * 대신 각 카드는 자기 안에서 다시 접는다: 부대비용의 항목별 표
 * (`CostBreakdown`의 `<dl>`), 대출 한도의 "네 가지 한도", 그리고
 * **헤드라인 카드 자신도**(사용자 지시: "부대비용 부분의 형식처럼" —
 * 제목+금액을 summary로, 무엇이 막았는지는 산정 내역으로 접는다).
 * 요점은 펼쳐 두고 근거는 접어 둔다 — 겉껍질 하나를 없앤 것이지 근거를
 * 없앤 것이 아니다(인쇄에서는 `<details>`가 전부 강제로 펼쳐진다).
 *
 * ⚠ **"무리 없는 선"(안전선) 비교는 이제 이 카드에 없다.** 사용자
 * 지시로 뺐다 — 최대 가격과 같을 때가 대부분이라 그 줄이 새 정보를
 * 주지 못했고("최대 가격과 같아요"), 최대 가격 자체도 바로 위 summary와
 * 중복이었다. 안전선의 **개념**은 사라지지 않았다 — `PriceSlider`의
 * "무리 없는 선" 눈금 마커와 `SafetyBadge`의 부담률 등급이 여전히
 * 그 정보를 낸다. 잃는 것은 종이에 남던 안전선 **금액** 한 줄뿐이다
 * (구 `SafeLine`, `safe-line`은 더 이상 `MUST_SURVIVE_PRINT_CLASSES`가
 * 아니다 — `hiddenInPrint.ts` 참고).
 *
 * **경고(`WarningList`)는 이 컴포넌트가 그리지 않는다.** 이 계단 전체가
 * 접히는 예산 상세 패널 안으로 들어갔기 때문이다(Task 5) — 여기서 그리면
 * 경고까지 함께 접힌다. 지금은 호출부(`App.tsx`)가 패널 **밖**, 사이드바
 * 맨 위에서 직접 그린다. 그 자리에 이유를 적어 뒀다.
 *
 * 여기에 "경고를 숨기는 prop"을 두지 않는다 — 출처가 둘이 되고, 언젠가
 * 두 자리가 서로 다른 경고 집합을 말한다.
 */
export function BudgetResult({ result, householdCountNote }: BudgetResultProps) {
  return (
    <section className="budget-result">
      {result.affordablePrice === 0 ? (
        <ZeroBudgetMessage result={result} />
      ) : (
        <>
          {/*
            `<details>`/`<summary>`는 CostBreakdown과 같은 이유로 그대로
            둔다 — 인쇄에서 내용을 강제로 펼치는 `::details-content`
            규칙이 그 태그에만 걸린다.
          */}
          <details className="budget-card budget-card--headline">
            <summary>
              {/*
                SEED `Text`는 공식 문서에 `as` prop이 없다 — 있어도 제목
                계층이 필요한 자리에는 쓰지 않는다. 라벨은 평범한
                `<span>`이 맡고, `Text`는(기본 `<span>`) 금액에만 SEED
                타이포 토큰을 입힌다. 문서 구조상 여기가 이 패널의 제목
                자리이므로 태그는 `<h2>`다 — 종이에서도 덩어리의 시작으로
                읽혀야 한다. `<summary>`는 phrasing content이거나 heading
                content 하나만 담을 수 있는데, 자식이 `<h2>` 하나뿐이라
                두 조건 모두를 만족한다.
              */}
              <h2>
                <span className="budget-card-label">실구매 가능 가격</span>{" "}
                <Text className="affordable-price">
                  {formatWon(result.affordablePrice)}
                </Text>
              </h2>
            </summary>
            {/*
              사용자 지시: "규제지역 대출 상한은 산정내역으로 보여줘" —
              무엇이 이 가격을 막았는지는 이제 펼쳐야 보인다. 문구
              자체는 `BindingExplainer`와 같은 원본(`getBindingTitle`)
              에서 온다 — 두 자리가 다른 말을 하지 않는다.
            */}
            <p className="result-step--binding">
              {getBindingTitle(result.loanLimit.binding)}
            </p>
          </details>

          <BindingExplainer loanLimit={result.loanLimit} showTitle={false} />
          <CostBreakdown
            costs={result.costs}
            householdCountNote={householdCountNote}
            brokerageFeeRate={brokerageFeeRateFor(result.affordablePrice, rules)}
          />
          <PolicyLoanList matched={result.matchedPolicyLoans} />
        </>
      )}
    </section>
  );
}

/**
 * affordablePrice === 0일 때의 안내. 원인을 하나로 단정하지 않는다.
 *
 * 0에 도달하는 흔한 경로는 두 가지다.
 *
 * 1. 현금이 매매가 0원에서도 발생하는 고정 부대비용(법무비·이사비)조차
 *    감당하지 못하는 경우 — LTV가 가격에 비례하므로 가격이 0에 가까우면
 *    대출도 0에 가까워, 소득·부채와 무관하게 이 벽에 부딪힌다. 이 경로는
 *    엔진이 이미 WarningList에 "고정 부대비용만으로도 사용가능 현금
 *    예산을 넘어요"라는 정확한 경고를 낸다.
 * 2. 상환능력(DSR) 자체가 0인 경우 — 소득이 없거나 기존 부채가 이미
 *    허용 한도를 다 채워서, breakdown.DSR이 0이 되고 대출 한도 전체가
 *    0으로 눌린다.
 *
 * 두 원인은 완전히 다른 조치를 요구하므로(현금을 더 모으기 vs 부채를
 * 줄이거나 소득을 확인하기) 하나로 뭉뚱그리면 소득 3억·부채 0인
 * 현금 부족 구매자에게 "소득이 없다"고 말하는 식의 오답이 나온다.
 * breakdown.DSR은 가격에 의존하지 않으므로(calcDsrLimit은 price를
 * 받지 않는다) affordablePrice가 0이어도 실제 상환능력 상태를
 * 그대로 반영한다 — 진단에 쓰기 안전한 근거다.
 */
function ZeroBudgetMessage({ result }: { result: AffordableResult }) {
  const incomeOrDebtBlocked = result.loanLimit.breakdown.DSR === 0;

  return (
    <div className="no-budget">
      <h2>{ZERO_BUDGET_HEADLINE}</h2>
      {incomeOrDebtBlocked ? (
        <p>
          소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어요.
          기존 부채를 줄이거나 소득을 다시 확인해 보세요.
        </p>
      ) : (
        <p>
          사용가능 현금 예산이 취득에 드는 최소 비용(법무비·이사비 등)에도
          못 미쳐요. 현금을 더 모으면 살 수 있는 가격이 생겨요.
        </p>
      )}
    </div>
  );
}
