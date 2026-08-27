import type { AffordableResult } from "../lib/finance";
import { brokerageFeeRateFor, ltvRateFor } from "../lib/finance";
import { rules } from "../state/useAffordability";
import { BindingExplainer } from "./BindingExplainer";
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
  /**
   * 대출 한도 카드의 LTV 행이 "어느 지역·어느 자격 기준으로 이 요율을
   * 적용했는지"를 밝히는 데 쓴다(사용자 지시: "해당 지역에 맞는 LTV를
   * 적용해줘"). `residentialProfile`에서 그대로 받는다 — 이 값이
   * `loanLimit.breakdown.LTV`를 낸 `calcLtvLimit`의 입력과 정확히
   * 같아야, 화면이 계산과 다른 지역·자격을 말하지 않는다.
   */
  isRegulatedArea: boolean;
  isFirstTimeBuyer: boolean;
}

/**
 * 결과를 **카드 셋**으로 나눈다(사용자 지시).
 *
 * 1. 대출 한도 카드 — `BindingExplainer`
 * 2. 부대비용 카드 — `CostBreakdown`
 * 3. 정책대출 카드 — `PolicyLoanList`(자격이 없으면 스스로 `null`)
 *
 * ⚠ **예전에는 헤드라인 카드("실구매 가능 가격" + 무엇이 막았는지 한
 * 줄)가 이 목록 맨 앞에 따로 있었다.** 사용자 지시로 없앴다 — 그 숫자는
 * 상단바(`ResultSummaryItem`, App.tsx)가 이미 같은 라벨·같은 값으로
 * 보여주는 값이고, 이 패널을 여는 트리거가 바로 그 상단바 칸이다
 * ("상단 사이드바와 동일 중복"). 실구매 가능 가격이 이제 이 패널
 * 안에서는 아무 데도 안 보인다고 걱정할 필요는 없다 — 패널을 여는
 * 손가락 바로 위에 그 숫자가 이미 있다.
 *
 * 각 카드는 자기 안에서 접는다: 부대비용의 항목별 표(`CostBreakdown`의
 * `<dl>`)와 대출 한도의 네 가지 한도 표(`BindingExplainer`의 `<dl>`)가
 * 그것이다. summary에는 제목+금액이 항상 보이고, 근거는 펼쳐야 보인다
 * (인쇄에서는 `<details>`가 전부 강제로 펼쳐진다).
 *
 * **경고(`WarningList`)는 이 컴포넌트가 그리지 않는다.** 이 계단 전체가
 * 접히는 예산 상세 패널 안으로 들어갔기 때문이다(Task 5) — 여기서 그리면
 * 경고까지 함께 접힌다. 지금은 호출부(`App.tsx`)가 패널 **밖**, 사이드바
 * 맨 위에서 직접 그린다. 그 자리에 이유를 적어 뒀다.
 *
 * 여기에 "경고를 숨기는 prop"을 두지 않는다 — 출처가 둘이 되고, 언젠가
 * 두 자리가 서로 다른 경고 집합을 말한다.
 */
export function BudgetResult({
  result,
  householdCountNote,
  isRegulatedArea,
  isFirstTimeBuyer,
}: BudgetResultProps) {
  return (
    <section className="budget-result">
      {result.affordablePrice === 0 ? (
        <ZeroBudgetMessage result={result} />
      ) : (
        <>
          <BindingExplainer
            loanLimit={result.loanLimit}
            ltvBasis={{
              price: result.affordablePrice,
              rate: ltvRateFor({ isRegulatedArea, isFirstTimeBuyer }, rules),
              isRegulatedArea,
              isFirstTimeBuyer,
            }}
          />
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
