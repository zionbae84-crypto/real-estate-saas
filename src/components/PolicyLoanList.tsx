import { formatWon } from "../format/won";
import type { MatchedPolicyLoan } from "../lib/finance";

export interface PolicyLoanListProps {
  matched: MatchedPolicyLoan[];
}

/**
 * 자격이 되는 정책대출과 **실제 수령 가능액**.
 *
 * `loan.maxAmount`(상품 고시 한도)를 금액으로 표시하지 않는다. 정책대출도
 * 상환능력과 담보가치의 제약을 받으므로, 고시 한도를 보여주면 연소득 0원
 * 구매자에게 3.6억을 받을 수 있다고 말하게 된다.
 */
export function PolicyLoanList({ matched }: PolicyLoanListProps) {
  if (matched.length === 0) return null;

  return (
    <section className="policy-loan-list">
      <h3>받을 수 있는 정책대출</h3>
      <ul>
        {matched.map(({ loan, availableAmount }) => (
          <li key={loan.id}>
            <span className="policy-name">{loan.id}</span>
            <span className="policy-rate">
              연 {(loan.rate * 100).toFixed(1)}%
            </span>
            {availableAmount > 0 ? (
              <span className="policy-amount">{formatWon(availableAmount)}</span>
            ) : (
              <span className="policy-none">
                자격은 되지만 소득 기준으로는 받을 수 있는 금액이 없어요
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
