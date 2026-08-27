import { formatWonRoundedToMan } from "../format/won";
import {
  NO_ABSOLUTE_CAP,
  NO_POLICY_LIMIT,
  type BindingConstraint,
  type LoanLimit,
} from "../lib/finance";

export interface BindingExplainerProps {
  loanLimit: LoanLimit;
  /**
   * LTV 산정 기준. LTV 행의 짧은 안내에 실제로 적용된 매매가·요율을
   * 밝히는 데 쓴다(사용자 지시: "LTV의 기준이되는 금액이 얼마인지
   * 알수가 없고 LTV %가 없는데 설명에 기재해줘. 해당 지역에 맞는
   * LTV를 적용해줘").
   *
   * `rate`는 `lib/finance`의 `ltvRateFor(profile, rules)`가 고른 값을
   * 그대로 받는다 — `calcLtvLimit`(loan-limit.ts)이 이 breakdown.LTV를
   * 낼 때 쓴 것과 **같은 함수**라, 화면이 계산과 다른 요율을 말할 수
   * 없다. `breakdown.LTV / price`로 거꾸로 계산하지 않는 이유이기도
   * 하다 — `breakdown.LTV`는 이미 `Math.floor`를 거친 정수라 나눗셈이
   * 40.0000003% 같은 잡음을 낼 수 있다.
   */
  ltvBasis: {
    /** LTV 계산에 쓰인 매매가(원) — 이 loanLimit을 낸 바로 그 가격이다. */
    price: number;
    /** 적용된 담보인정비율(예: 0.4 = 40%). */
    rate: number;
    isRegulatedArea: boolean;
    isFirstTimeBuyer: boolean;
  };
}

const LABELS: Record<BindingConstraint, string> = {
  LTV: "담보 가치(LTV)",
  DSR: "상환 능력(DSR)",
  CAP: "규제지역 상한",
  POLICY: "정책대출",
};

const ORDER: BindingConstraint[] = ["LTV", "DSR", "CAP", "POLICY"];

/** 은행 주담대에 동시에 걸리는 제약. loan-limit.ts의 BANK_CONSTRAINTS와 동일한 개념이다 */
const BANK_CONSTRAINTS = ["LTV", "DSR", "CAP"] as const;

/**
 * 비규제지역이면 `breakdown.CAP`이 `NO_ABSOLUTE_CAP`(Infinity)일 수
 * 있다(loan-limit.ts 참고) — 이 함수는 그 값을 특별 취급하지 않아도
 * 된다. `<` 비교에서 Infinity는 결코 이기지 못하므로 `smallest`로도,
 * `binding`으로도 뽑히지 않는다. 즉 비규제지역 구매자에게는 CAP이
 * runner-up으로도, "여기에 걸림"으로도 절대 나타나지 않는다 — 코드를
 * 더 만지지 않아도 자연히 옳은 동작이다.
 */
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

/** 특수값(선택지 없음/적용 안 됨)을 가려 표시용 문자열을 만든다. 정상값은 만원 단위로 반올림한다(사용자 지시). */
function formatLimitAmount(key: BindingConstraint, amount: number): string {
  if (key === "POLICY" && amount === NO_POLICY_LIMIT) return "선택지 없음";
  if (key === "CAP" && amount === NO_ABSOLUTE_CAP) return "적용 안 됨";
  return formatWonRoundedToMan(amount);
}

/** 0.4 → "40%". 지금 룰셋 값(40%/70%)은 소수점이 없지만, 나중에 바뀌어도 안전하게 남는 만큼만 보여준다. */
function formatPercent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/**
 * LTV 행에 붙는 짧은 안내. 어떤 표(규제지역/비규제지역 × 생애최초
 * 여부)를 썼는지와 그 결과 요율, 그리고 그 요율이 곱해진 매매가를
 * 한 문장으로 말한다 — "12억 7,442만원이 왜 그 숫자인지"에 답한다.
 */
function describeLtvBasis(basis: BindingExplainerProps["ltvBasis"]): string {
  const areaLabel = basis.isRegulatedArea ? "규제지역" : "비규제지역";
  const firstTimeLabel = basis.isFirstTimeBuyer ? " 생애최초" : "";
  return (
    `${areaLabel}${firstTimeLabel} 기준 LTV ${formatPercent(basis.rate)}를 ` +
    `적용했어요. (매매가 ${formatWonRoundedToMan(basis.price)} 기준)`
  );
}

/**
 * 대출 한도 카드. 사용자 지시로 `CostBreakdown`과 같은 summary/토글
 * 형식이다 — summary에는 "대출 한도 [금액]"이 항상 보이고, 무엇이
 * 결정됐는지는 표를 펼쳐야 보인다.
 *
 * ⚠ **예전에는 여기 제약별 제목("담보 가치(LTV)에 걸렸어요")과 조언
 * 문단이 따로 있었다.** 사용자 지시로 둘 다 걷어냈다 — 제목은
 * `BudgetResult`의 헤드라인 카드(상단바와 중복이라 통째로 삭제됐다)
 * 와 함께 설 자리를 잃었고, 조언 문단("규제지역 주택구입 목적…")은
 * "멘트는 삭제"로 명시됐다. 남은 것은 네 가지 한도 표뿐이다 — 어느
 * 것이 결정됐는지는 그 행의 `data-active`·"← 결정" 표시가 말한다.
 *
 * 대신 **LTV 기준**만 간단히 남긴다(사용자 지시: "LTV기준에 대한
 * 간단 언급. 작은글씨로 설명" — 이어서 "LTV의 기준이되는 금액이
 * 얼마인지 알수가 없고 LTV %가 없는데 설명에 기재해줘. 해당 지역에
 * 맞는 LTV를 적용해줘") — LTV가 대부분의 실거주 구매자를 실제로
 * 묶는 제약이라, 그 표의 숫자가 어떤 매매가·어떤 요율에서 나왔는지
 * 밝힌다(`ltvBasis` prop, `describeLtvBasis` 참고). 요율은
 * `ltvRateFor(profile, rules)`가 고른 값을 호출부가 그대로 넘긴다 —
 * `calcLtvLimit`이 breakdown.LTV를 낼 때 쓴 것과 같은 함수라 계산과
 * 다른 숫자를 말할 수 없다.
 *
 * 금액은 전부 **만원 단위로 반올림**해 보여준다(사용자 지시) —
 * `CostBreakdown`의 항목별 표는 계산 검증용이라 정확한 원 단위를
 * 지키지만, 이 표는 네 한도를 서로 견주어 읽는 자리라 원 단위
 * 잔돈이 오히려 비교를 방해한다(`formatWonRoundedToMan` 참고,
 * "화면 표시 전용" — 실제 계산은 그대로 원 단위 정수를 쓴다).
 */
export function BindingExplainer({
  loanLimit,
  ltvBasis,
}: BindingExplainerProps) {
  const runnerUp = findRunnerUp(loanLimit.binding, loanLimit.breakdown);

  return (
    <details className="binding-explainer">
      <summary>
        대출 한도{" "}
        <span className="binding-total">
          {formatWonRoundedToMan(loanLimit.amount)}
        </span>
      </summary>

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
          {`다음으로 가까운 한도 — ${LABELS[runnerUp.constraint]}. ${formatWonRoundedToMan(runnerUp.headroom)} 여유가 있어요.`}
        </p>
      )}

      <dl className="binding-limit-table">
        {ORDER.map((key) => (
          <div
            key={key}
            data-binding={key}
            data-active={key === loanLimit.binding ? "true" : undefined}
          >
            <dt>
              {LABELS[key]}
              {key === loanLimit.binding && " ← 결정"}
              {key === "LTV" && (
                <p className="hint">{describeLtvBasis(ltvBasis)}</p>
              )}
            </dt>
            <dd>{formatLimitAmount(key, loanLimit.breakdown[key])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
