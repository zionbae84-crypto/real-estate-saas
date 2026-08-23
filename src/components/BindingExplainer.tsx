import { formatWon } from "../format/won";
import { NO_POLICY_LIMIT, type BindingConstraint, type LoanLimit } from "../lib/finance";

export interface BindingExplainerProps {
  loanLimit: LoanLimit;
  /**
   * `<h3>` 제목 줄을 함께 그릴지. 기본값 `true`.
   *
   * `BudgetResult`는 같은 문구(`getBindingTitle`)를 결과 계단의 2단
   * ("무엇이 막았는지 한 줄")에서 먼저 보여준 뒤, 이 컴포넌트를 접힌
   * 4단(부대비용·정책대출·상세 설명) 안에 다시 배치한다. 그때
   * `showTitle={false}`로 넘겨 같은 문구가 화면에 두 번(한 번은 굵은
   * 한 줄로, 한 번은 접힌 details 안 제목으로) 찍히지 않게 한다.
   */
  showTitle?: boolean;
}

interface Explanation {
  title: string;
  advice: string;
}

const EXPLANATIONS: Record<BindingConstraint, Explanation> = {
  LTV: {
    title: "담보 가치(LTV)에 걸렸어요",
    advice:
      "집값의 일정 비율까지만 빌려줘요. 현금을 더 모으면 살 수 있는 가격이 올라가요.",
  },
  DSR: {
    title: "소득이 한도를 정했어요",
    advice:
      "소득 대비 연간 상환액 한도에 막혔어요. 기존 부채를 갚으면 한도가 늘어나요.",
  },
  CAP: {
    title: "수도권 대출 상한에 걸렸어요",
    advice:
      "수도권 주택구입 목적 주택담보대출은 금액 상한이 있어요. 대출로는 못 늘려요. 현금이 더 있어야 해요.",
  },
  POLICY: {
    title: "정책대출 한도가 최대치예요",
    advice:
      "정책대출을 택했을 때 받을 수 있는 금액이 은행 대출보다 커요. 금리 조건을 함께 비교해 보세요.",
  },
};

/**
 * 걸린 제약을 한 줄로 요약한 문구. `BudgetResult`가 결과 계단의 2단
 * ("무엇이 막았는지 한 줄")에서 쓴다 — 이 컴포넌트 자신의 `<h3>`와 같은
 * 문구를 별도로 하드코딩하지 않고 이 맵 하나에서 함께 가져오게 해,
 * 두 자리의 문구가 갈라질 일이 없게 한다.
 */
export function getBindingTitle(binding: BindingConstraint): string {
  return EXPLANATIONS[binding].title;
}

const LABELS: Record<BindingConstraint, string> = {
  LTV: "담보 가치(LTV)",
  DSR: "상환 능력(DSR)",
  CAP: "수도권 상한",
  POLICY: "정책대출",
};

const ORDER: BindingConstraint[] = ["LTV", "DSR", "CAP", "POLICY"];

/** 은행 주담대에 동시에 걸리는 제약. loan-limit.ts의 BANK_CONSTRAINTS와 동일한 개념이다 */
const BANK_CONSTRAINTS = ["LTV", "DSR", "CAP"] as const;

function findRunnerUp(
  binding: BindingConstraint,
  breakdown: Record<BindingConstraint, number>,
): { constraint: BindingConstraint; headroom: number } | null {
  // POLICY는 상한이 아니라 구매자가 택할 수 있는 대안 경로다
  // (loan-limit.ts: amount = max(min(LTV, DSR, CAP), POLICY)). binding이
  // POLICY라는 것은 "정책대출을 택하는 편이 최대치"라는 뜻일 뿐, 다음으로
  // 걸릴 은행 제약이라는 개념 자체가 없으므로 2순위를 찾지 않는다.
  if (binding === "POLICY") {
    return null;
  }

  // 2순위 후보는 은행 제약(LTV·DSR·CAP)뿐이다. POLICY를 후보에 넣으면 두 가지
  // 거짓 안내가 나온다: POLICY가 binding과 같은 값이면 "정책대출도 같은
  // 금액에서 다시 걸린다"는 동률 안내가 뜨지만 실제로는 정책 경로가 은행
  // 경로보다 못하다는 뜻일 뿐이고, POLICY가 binding보다 작으면 진짜
  // 여유(예: LTV)가 있는데도 음수 headroom으로 계산돼 2순위 라인 자체가
  // 사라진다. binding이 은행 제약일 때 breakdown.POLICY <= breakdown[binding]가
  // 항상 성립하므로(그렇지 않았다면 calcMaxLoan이 이미 binding을 POLICY로
  // 골랐을 것이다) POLICY는 애초에 "다음 순위"가 될 수 없다.
  const candidates = BANK_CONSTRAINTS.filter((key) => key !== binding);

  // binding이 은행 제약 하나이므로 후보는 항상 정확히 2개 남는다. 배열
  // 구조분해에서도 첫 요소는 noUncheckedIndexedAccess의 대상이라
  // BindingConstraint | undefined로 추론되므로, 비-null 단언 대신 실제
  // undefined 검사로 남겨 둔다(도달 불가능하지만 타입 체커를 만족시킨다).
  const [first, ...rest] = candidates;
  if (first === undefined) {
    return null;
  }

  let smallest: BindingConstraint = first;
  for (const key of rest) {
    if (breakdown[key] < breakdown[smallest]) {
      smallest = key;
    }
  }

  // amount(=breakdown[binding])는 세 은행 제약 중 최솟값이므로, 남은 둘의
  // 최솟값은 항상 그 이상이다 — headroom은 이 경로에서 결코 음수가 될 수 없다.
  const headroom = breakdown[smallest] - breakdown[binding];

  return { constraint: smallest, headroom };
}

export function BindingExplainer({
  loanLimit,
  showTitle = true,
}: BindingExplainerProps) {
  const explanation = EXPLANATIONS[loanLimit.binding];
  const runnerUp = findRunnerUp(loanLimit.binding, loanLimit.breakdown);

  return (
    <section className="binding-explainer">
      {showTitle && <h3>{explanation.title}</h3>}
      {/*
        리뷰 수정(Minor 5): 라벨 없이 숫자만 두면, 이 컴포넌트가 4단(접힌
        상세 설명)에 다시 배치될 때 바로 위 CostBreakdown의 부대비용
        숫자와 나란히 놓여 어느 금액인지 구분이 안 된다 — 순수 대출
        가능액(loanLimit.amount)이지 1단의 실구매 가능 가격이 아니다.
      */}
      <span className="binding-amount-label">대출 한도</span>
      <p className="binding-amount">{formatWon(loanLimit.amount)}</p>
      <p className="binding-advice">{explanation.advice}</p>

      {/*
        리뷰 수정(가드 사각지대 Minor 1): "라벨은 조사 없이 이어 붙인다"는
        원래 문법 장치가 "~입니다"라는 합니다체 계사에 기대고 있었다. 그걸
        "~이에요/예요"로 해요체 전환하려면 라벨 받침 유무에 따라 이에요/예요를
        분기해야 하는데, 그러면 LABELS 맵 자체를 두 벌로 늘려야 한다(리뷰어
        판단, 확인 완료). 계사를 통째로 빼고 줄표로 라벨을 붙이면 조사·계사
        분기 문제 자체가 사라지고, 뒤따르는 "여유가 있어요"와 같은 해요체로
        한 문단 안에서 목소리가 갈리지 않는다.
      */}
      {runnerUp && runnerUp.headroom === 0 && (
        <p className="runner-up-tied">
          {`다음으로 가까운 한도 — ${LABELS[runnerUp.constraint]}. 같은 금액에서 다시 걸리므로 한도가 늘어나지 않아요.`}
        </p>
      )}

      {runnerUp && runnerUp.headroom > 0 && (
        <p className="runner-up">
          {`다음으로 가까운 한도 — ${LABELS[runnerUp.constraint]}. ${formatWon(runnerUp.headroom)} 여유가 있어요.`}
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
              <dd>
                {key === "POLICY" && loanLimit.breakdown[key] === NO_POLICY_LIMIT
                  ? "선택지 없음"
                  : formatWon(loanLimit.breakdown[key])}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
