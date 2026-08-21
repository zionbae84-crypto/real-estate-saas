import { formatWon } from "../format/won";
import type { BindingConstraint, LoanLimit } from "../lib/finance";

export interface BindingExplainerProps {
  loanLimit: LoanLimit;
}

interface Explanation {
  title: string;
  advice: string;
}

const EXPLANATIONS: Record<BindingConstraint, Explanation> = {
  LTV: {
    title: "담보 가치(LTV)에 걸렸습니다",
    advice:
      "집값의 일정 비율까지만 빌려줍니다. 현금을 더 모으면 살 수 있는 가격이 올라갑니다.",
  },
  DSR: {
    title: "상환 능력(DSR)에 걸렸습니다",
    advice:
      "소득 대비 연간 상환액 한도에 막혔습니다. 기존 부채를 갚으면 한도가 늘어납니다.",
  },
  CAP: {
    title: "수도권 대출 상한에 걸렸습니다",
    advice:
      "수도권 주택구입 목적 주택담보대출은 금액 상한이 있습니다. 대출로는 늘릴 수 없습니다 — 현금이 더 필요합니다.",
  },
  POLICY: {
    title: "정책대출 한도가 최대치입니다",
    advice:
      "정책대출을 택했을 때 받을 수 있는 금액이 은행 대출보다 큽니다. 금리 조건을 함께 비교해 보세요.",
  },
};

const LABELS: Record<BindingConstraint, string> = {
  LTV: "담보 가치(LTV)",
  DSR: "상환 능력(DSR)",
  CAP: "수도권 상한",
  POLICY: "정책대출",
};

const ORDER: BindingConstraint[] = ["LTV", "DSR", "CAP", "POLICY"];

export function BindingExplainer({ loanLimit }: BindingExplainerProps) {
  const explanation = EXPLANATIONS[loanLimit.binding];

  return (
    <section className="binding-explainer">
      <h3>{explanation.title}</h3>
      <p className="binding-amount">{formatWon(loanLimit.amount)}</p>
      <p className="binding-advice">{explanation.advice}</p>

      <details>
        <summary>네 가지 한도 모두 보기</summary>
        <dl>
          {ORDER.map((key) => (
            <div key={key} data-binding={key}>
              <dt>
                {LABELS[key]}
                {key === loanLimit.binding && " ← 여기에 걸림"}
              </dt>
              <dd>{formatWon(loanLimit.breakdown[key])}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
