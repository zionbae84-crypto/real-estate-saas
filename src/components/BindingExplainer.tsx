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

function findRunnerUp(
  binding: BindingConstraint,
  breakdown: Record<BindingConstraint, number>,
): { constraint: BindingConstraint; headroom: number } | null {
  // BindingConstraint는 LTV/DSR/CAP/POLICY 4개 고정 멤버 유니온이다. binding
  // 하나를 제외하고, POLICY가 0(선택지 없음)이라 추가로 빠지더라도 최소 2개가
  // 남으므로 candidates가 빈 배열이 되는 경우는 없다.
  const candidates = ORDER.filter((key) => key !== binding).filter(
    (key) => !(key === "POLICY" && breakdown[key] === 0),
  );

  // 배열 구조분해에서도 첫 요소는 noUncheckedIndexedAccess의 대상이라
  // BindingConstraint | undefined로 추론된다 (rest는 배열이라 그대로 무관).
  // 위 주석대로 candidates.length는 항상 2 이상이므로 이 분기는 도달
  // 불가능하지만, 타입 체커를 만족시키는 유일한 방법이므로 비-null 단언
  // 대신 실제 undefined 검사로 남겨 둔다.
  const [first, ...rest] = candidates;
  if (first === undefined) {
    return null;
  }

  let smallest = first;
  for (const key of rest) {
    if (breakdown[key] < breakdown[smallest]) {
      smallest = key;
    }
  }

  const headroom = breakdown[smallest] - breakdown[binding];

  // POLICY가 binding일 때는 엔진 불변식(src/lib/finance/loan-limit.ts)상
  // breakdown.POLICY가 min(LTV, DSR, CAP)보다 엄격히 클 때만 그렇게 되므로,
  // 2순위 탐색이 찾아낸 최솟값은 항상 amount보다 작다 — headroom은 이 경로에서
  // 반드시 음수이며, 이는 방어 코드가 아니라 그 불변식을 반영한 분기다.
  if (headroom < 0) {
    return null;
  }

  return { constraint: smallest, headroom };
}

export function BindingExplainer({ loanLimit }: BindingExplainerProps) {
  const explanation = EXPLANATIONS[loanLimit.binding];
  const runnerUp = findRunnerUp(loanLimit.binding, loanLimit.breakdown);

  return (
    <section className="binding-explainer">
      <h3>{explanation.title}</h3>
      <p className="binding-amount">{formatWon(loanLimit.amount)}</p>
      <p className="binding-advice">{explanation.advice}</p>

      {runnerUp && runnerUp.headroom === 0 && (
        <p className="runner-up-tied">
          {`다음으로 가까운 한도는 ${LABELS[runnerUp.constraint]}입니다. 같은 금액에서 다시 걸리므로 한도가 늘어나지 않습니다.`}
        </p>
      )}

      {runnerUp && runnerUp.headroom > 0 && (
        <p className="runner-up">
          {`다음으로 가까운 한도는 ${LABELS[runnerUp.constraint]}입니다. ${formatWon(runnerUp.headroom)} 여유가 있습니다.`}
        </p>
      )}

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
