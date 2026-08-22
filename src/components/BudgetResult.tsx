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
        <div className="no-budget">
          <h2>현재 조건으로는 주택담보대출이 나오지 않습니다</h2>
          <p>
            소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있습니다.
            기존 부채를 줄이거나 소득을 다시 확인해 보세요.
          </p>
        </div>
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
