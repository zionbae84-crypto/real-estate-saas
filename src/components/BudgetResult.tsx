import type { AffordableResult } from "../lib/finance";
import { formatWon } from "../format/won";
import { BindingExplainer } from "./BindingExplainer";
import { CostBreakdown } from "./CostBreakdown";
import { PolicyLoanList } from "./PolicyLoanList";
import { WarningList } from "./WarningList";

export interface BudgetResultProps {
  result: AffordableResult;
}

export function BudgetResult({ result }: BudgetResultProps) {
  return (
    <section className="budget-result">
      <WarningList warnings={result.warnings} />

      {result.affordablePrice === 0 ? (
        <ZeroBudgetMessage result={result} />
      ) : (
        <>
          <h2>실구매 가능 가격</h2>
          <p className="affordable-price">{formatWon(result.affordablePrice)}</p>
          <BindingExplainer loanLimit={result.loanLimit} />
          <CostBreakdown costs={result.costs} />
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
 *    엔진이 이미 WarningList에 "고정 부대비용만으로도 보유 현금을
 *    초과합니다"라는 정확한 경고를 낸다.
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
      <h2>현재 조건으로는 주택담보대출이 나오지 않습니다</h2>
      {incomeOrDebtBlocked ? (
        <p>
          소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있습니다.
          기존 부채를 줄이거나 소득을 다시 확인해 보세요.
        </p>
      ) : (
        <p>
          보유 현금이 취득에 드는 최소 비용(법무비·이사비 등)에도 못
          미칩니다. 현금을 더 모으면 살 수 있는 가격이 생깁니다.
        </p>
      )}
    </div>
  );
}
