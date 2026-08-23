import {
  calcAcquisitionCosts,
  type BuyerProfile,
  type CostBreakdown,
  type Rules,
} from "../finance";
import type {
  CapRateResult,
  InvestmentType,
  DscrResult,
  GapInput,
  JeonseRatioResult,
  OwnFundsResult,
  PurchaseAssessment,
  PurchaseInput,
  PurchaseMetricId,
  PurchaseMetricResult,
  PurchaseOverall,
  PurchaseOverallCopy,
  PurchaseRules,
  PurchaseVerdict,
  RentalInput,
  RentalLoanAnswer,
  ReverseJeonseResult,
  ReverseJeonseStageResult,
  RtiResult,
} from "./types";

const MONTHS_PER_YEAR = 12;

/**
 * 구매 유형에 맞는 지표를 낸다.
 *
 * **실거주로는 이 함수를 부를 수 없다.** {@link PurchaseInput}이
 * 갭투자·월세 수익형만 담는 유니온이라 타입 검사에서 막힌다 — 부모
 * 스펙 14절이 말한 대로 DSCR은 임대수익이 0인 실거주에서 분자가
 * 성립하지 않고, 그래서 실거주에서 계산되는 경로 자체를 없앴다.
 *
 * **대출 한도는 여기서도 계산하지 않는다.** `calcMaxLoan`·
 * `calcAffordablePrice`·`calcSafePrice`는 전부 실거주 매수를 전제한
 * 룰셋(`rules/2026-08.json`) 위에 서 있다 — 임대사업자대출·다주택자
 * LTV는 그 룰셋에 없다. 그 함수들을 여기서 쓰면 실거주 기준 한도를
 * 투자 목적 매수에 적용해 빌릴 수 있는 돈을 과대 계상하게 된다.
 * 대신 룰셋의 `loanLimitNote`가 모른다고 말한다.
 *
 * ## 모르는 값을 0원으로 채우지 않는다
 *
 * 어느 방향으로 틀리는지가 항목마다 다르다.
 *
 * - 월세를 0으로 두면 수익이 **사라진다**(비관 방향이지만 거짓이다).
 * - 운영비용을 0으로 두면 수익이 **부풀어 오른다**(낙관 방향이라 더
 *   나쁘다).
 * - 연간 원리금을 0으로 두면 DSCR의 분모가 사라져 "갚을 게 없다"는
 *   가장 낙관적인 모습이 된다.
 *
 * 그래서 어느 쪽도 0으로 채우지 않는다. 값이 없으면 그 지표는
 * `unknown`("아직 낼 수 없어요")이 되고, 전체 결론은 `incomplete`로
 * 내려간다. 비어 있는 값은 통과가 아니다.
 */
export function assessPurchase(
  rules: PurchaseRules,
  financeRules: Rules,
  input: PurchaseInput,
): PurchaseAssessment {
  const typeRule =
    input.type === "갭투자" ? rules.types.갭투자 : rules.types.월세수익형;

  const metrics =
    input.type === "갭투자"
      ? gapMetrics(rules, financeRules, input, typeRule.metrics)
      : rentalMetrics(rules, financeRules, input, typeRule.metrics);

  const overall = decideOverall(metrics);
  const copy = rules.overall[overall];

  return {
    type: input.type,
    typeLabel: typeRule.label,
    overall,
    overallLabel: copy.label,
    overallNote: overallNoteFor(copy, overall, metrics),
    loanLimitNote: typeRule.loanLimitNote,
    metrics,
    disclaimer: rules.disclaimer,
  };
}

/**
 * 결론을 고르는 순서. 권리분석(`assessRights`)과 같은 판단이다.
 *
 * 1. `stop`이 하나라도 있으면 `stop`이다. 다른 지표가 아무리 좋아도
 *    상쇄되지 않는다.
 * 2. 낼 수 없는 지표가 있으면 `incomplete`다. **빈칸은 통과가 아니다.**
 * 3. `expert`가 하나라도 있으면 `expert`다.
 * 4. **대출 원금을 실제로 뺐으면(검증할 수 없는 값으로 필요 자기자금을
 *    줄였으면) `clear`로 내려가지 않는다.** {@link hasUnverifiedLoanPrincipal}
 *    참고.
 * 5. 그 밖에만 `clear`이고, 그것조차 "걸리는 게 없었다"이지
 *    "안전하다"가 아니다.
 */
function decideOverall(metrics: PurchaseMetricResult[]): PurchaseOverall {
  const has = (verdict: PurchaseVerdict) =>
    metrics.some((metric) => metric.verdict === verdict);

  if (has("stop")) return "stop";
  if (has("unknown")) return "incomplete";
  if (has("expert")) return "expert";
  if (hasUnverifiedLoanPrincipal(metrics)) return "expert";
  return "clear";
}

/**
 * 월세 수익형 필요 자기자금에서 대출 원금을 실제로 뺐는가.
 *
 * `ownFundsMetric`은 `loanPrincipal !== null && loanPrincipal > 0`일 때만
 * `loanAssumptionNote`를 채운다({@link ownFundsMetric} 참고) — 즉 이
 * 함수가 참이면 사용자가 적은 대출 원금이 필요 자기자금을 실제로
 * 줄였다는 뜻이다.
 *
 * **이 값이 참이면 전체 결론은 `clear`가 될 수 없다.** 이 화면은
 * 임대사업자대출·다주택자 한도를 계산하지 않는다고 스스로 선언한다
 * (`types.ts`의 "이 모듈이 하지 않는 것" 절, `loanLimitNote`) — 그래서
 * 사용자가 적은 대출 원금이 실제로 나오는 금액인지 이 계산은 검증할
 * 방법이 없다. 검증하지 못하는 값을 빼서 필요 자기자금을 줄여놓고
 * "걸리는 게 없었다"고 결론짓는 것은 이 제품이 절대 하면 안 되는
 * 일이다. 그래서 `decideOverall`은 `stop`·`incomplete`·`expert` 중
 * 어느 것도 아닐 때 이 조건을 마지막으로 한 번 더 확인해 `clear` 대신
 * `expert`로 내린다.
 *
 * 갭투자는 대출을 묻지 않는다({@link NO_LOAN}) — `loanPrincipal`이 언제나
 * 0이라 `loanAssumptionNote`도 언제나 `null`이고, 이 함수가 갭투자
 * 결론에 영향을 주는 일은 없다.
 */
function hasUnverifiedLoanPrincipal(metrics: PurchaseMetricResult[]): boolean {
  return metrics.some(
    (metric) => metric.id === "ownFunds" && metric.loanAssumptionNote !== null,
  );
}

/**
 * `incomplete`·`expert`에 조건부 덧말을 붙인다.
 *
 * - `incomplete`: 이미 확인이 필요한 지표가 있으면 그 사실을 덧붙인다.
 *   미입력 값 하나가 이미 걸린 지표를 회색 "아직 다 채우지 않았어요"
 *   뒤로 숨기면 실제보다 덜 위험해 보인다. 우선순위는 바꾸지 않는다 —
 *   먼저 채우라고 말하는 것이 여전히 맞는 안내다.
 * - `expert`: 대출 원금을 실제로 뺐으면({@link hasUnverifiedLoanPrincipal})
 *   왜 확인이 필요한지를 덧붙인다 — `decideOverall`이 이 조건 하나만으로
 *   `clear`를 `expert`로 내렸을 수도 있는데, 개별 지표의 `expert` 문구만
 *   봐서는 그 이유가 드러나지 않는다.
 *
 * 두 경우 모두 문구는 룰셋에서 온다.
 */
function overallNoteFor(
  copy: PurchaseOverallCopy,
  overall: PurchaseOverall,
  metrics: PurchaseMetricResult[],
): string {
  if (overall === "incomplete") {
    if (copy.pendingExpertNote === undefined) return copy.note;
    if (!metrics.some((metric) => metric.verdict === "expert")) return copy.note;
    return `${copy.note} ${copy.pendingExpertNote}`;
  }
  if (overall === "expert") {
    if (copy.loanFloorNote === undefined) return copy.note;
    if (!hasUnverifiedLoanPrincipal(metrics)) return copy.note;
    return `${copy.note} ${copy.loanFloorNote}`;
  }
  return copy.note;
}

/* ─────────────────────────── 공통 계산 ─────────────────────────── */

/**
 * 금액으로 성립하는 값만 통과시킨다. 아니면 `null`("모른다")이다.
 *
 * 음수·NaN·Infinity를 0으로 바꾸지 않는다 — 조용히 0이 되면 그 순간
 * 위험이 사라진다.
 */
function money(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** 분모가 될 금액. 0도 통과시키지 않는다 */
function positiveMoney(value: number | null): number | null {
  const won = money(value);
  return won === null || won <= 0 ? null : won;
}

/**
 * 부대비용 계산에 쓰는 프로필.
 *
 * `calcAcquisitionCosts`가 실제로 읽는 것은 `exclusiveAreaSqm`과
 * `isFirstTimeBuyer` 둘뿐이고, 그 둘은 룰셋의 `acquisition`에서 온다
 * (둘 다 비용이 커지는 쪽으로 골라 뒀다 — 룰셋의 `_acquisitionNote`
 * 참고). 나머지 필드는 그 함수가 읽지 않는 자리 채우기이며, 어떤
 * 판정에도 쓰이지 않는다. 그 함수를 고치지 않고 재사용하기 위한
 * 최소한의 형태다.
 *
 * **`status`도 그 읽히지 않는 자리 중 하나다.** 여기 "무주택"이 적혀
 * 있다고 해서 무주택 취득세로 계산되는 것이 아니라, 주택 수에 따른
 * 취득세 분기가 `rules/2026-08.json`에도 `calcAcquisitionCosts`에도
 * 아예 없다(5억 기준 무주택과 갈아타기의 취득세가 같은 값으로 나온다).
 * 2026년 8월의 중과율을 확인하지 못했으므로 그 숫자를 넣지 않는다 —
 * 대신 룰셋의 `acquisition.householdCountNote`가 묻지 않았다는 사실과
 * 부대비용이 이보다 커질 수 있다는 방향을 화면에서 말한다.
 */
function costProfile(rules: PurchaseRules): BuyerProfile {
  return {
    status: "무주택",
    cash: 0,
    annualIncome: 0,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: rules.acquisition.isFirstTimeBuyer,
    exclusiveAreaSqm: rules.acquisition.assumedExclusiveAreaSqm,
    isRegulatedArea: true,
  };
}

/**
 * 필요 자기자금 계산에 쓰는 대출 정보.
 *
 * `none`(대출을 끼지 않는다 — **확인한 0원**)과 `unknown`(원금을 모른다)이
 * 갈라져 있다. 합치면 모름이 0원으로 둔갑해 대출이 없는 것으로 계산된다.
 */
type LoanFunding =
  | { kind: "none" }
  | { kind: "known"; principal: number }
  | { kind: "unknown" };

interface FundsContext {
  price: number | null;
  deposit: number | null;
  cash: number | null;
  costs: CostBreakdown | null;
  /** 계산에서 뺀 대출 원금(원). 대출이 없으면 0, 모르면 null */
  loanPrincipal: number | null;
  /** max(0, 매매 예정가 − 보증금 − 대출 원금) + 부대비용(원) */
  required: number | null;
  /** 모자란 금액(원). 모자라지 않으면 0 */
  shortfall: number | null;
  /** 매수에 쓰고 남는 현금(원). 음수일 수 있다 */
  remainingCash: number | null;
}

/**
 * 대출 답을 필요 자기자금 계산에 쓸 수 있는 형태로 좁힌다.
 *
 * **원금을 역산하지 않는다.** 사용자가 알려주는 것은 연간 원리금과 연간
 * 이자이지 원금이 아니고, 금리·기간을 모르면 그 둘에서 원금이 나오지
 * 않는다. 모르면 `unknown`이고, 그때 필요 자기자금은 아예 내지 않는다 —
 * 0으로 두면 대출이 없는 것으로 계산돼 필요 자기자금이 과대, 남는 현금이
 * 과소로 나온다(반대로 화면이 스스로 물어서 받은 답을 무시하게 된다).
 */
function loanFundingOf(loan: RentalLoanAnswer): LoanFunding {
  if (loan.kind === "none") return { kind: "none" };
  if (loan.kind === "unknown") return { kind: "unknown" };
  const principal = money(loan.principal);
  return principal === null
    ? { kind: "unknown" }
    : { kind: "known", principal };
}

/** 대출을 묻지 않는 유형(갭투자)이 쓰는 값. **확인한 0원이 아니라 산식에서 빠진다** */
const NO_LOAN: LoanFunding = { kind: "none" };

function fundsContextOf(
  rules: PurchaseRules,
  financeRules: Rules,
  raw: { price: number | null; deposit: number | null; cash: number | null },
  loan: LoanFunding = NO_LOAN,
): FundsContext {
  const price = positiveMoney(raw.price);
  const deposit = money(raw.deposit);
  const cash = money(raw.cash);
  const loanPrincipal = loan.kind === "unknown" ? null : loan.kind === "none" ? 0 : loan.principal;

  const costs =
    price === null
      ? null
      : calcAcquisitionCosts(price, costProfile(rules), financeRules);

  /*
   * 보증금·대출이 매매가보다 큰 경우(이른바 무피·플피) `price - deposit
   * - loanPrincipal`이 음수가 된다. 그대로 두면 계약 때 돈을 돌려받는
   * 것으로 계산되어 남는 현금이 보유 현금보다 커지는데, 그건 낙관
   * 방향이다. 0에서 끊는다 — 그런 조건은 어차피 전세가율이 먼저 stop을
   * 낸다.
   *
   * **부대비용은 그 0에서 끊은 뒤에 더한다.** 취득세·중개보수는 대출이
   * 아무리 커도 계약 때 현금으로 나가는 돈이라, 큰 대출이 부대비용까지
   * 상쇄하는 것으로 계산하면 그게 낙관 방향이다.
   */
  const required =
    price === null || deposit === null || costs === null || loanPrincipal === null
      ? null
      : Math.max(0, price - deposit - loanPrincipal) + costs.total;

  const shortfall =
    required === null || cash === null ? null : Math.max(0, required - cash);
  const remainingCash =
    required === null || cash === null ? null : cash - required;

  return {
    price,
    deposit,
    cash,
    costs,
    loanPrincipal,
    required,
    shortfall,
    remainingCash,
  };
}

/**
 * 필요 자기자금.
 *
 * 문구는 유형별로 갈린다({@link OwnFundsRule}) — 월세 화면의 필드 라벨은
 * "보증금"인데 결과가 "전세보증금"이라고 말하면 사용자가 방금 적은 값과
 * 다른 것을 가리키는 말이 된다.
 *
 * 대출 원금을 모르면(`funds.loanPrincipal === null`) 판정은 `unknown`이고
 * 문구는 왜 낼 수 없는지를 말한다. **대출을 0원으로 두지 않는다.**
 */
function ownFundsMetric(
  rules: PurchaseRules,
  funds: FundsContext,
  copy: {
    stop: string;
    checked: string;
    unknown: string;
    /** 대출을 낀다는데 원금을 몰라 아예 내지 않는 경우(월세 수익형에만 있다) */
    loanUnknown?: string;
  },
): OwnFundsResult {
  const rule = rules.metrics.ownFunds;
  const loanUnknown = funds.loanPrincipal === null;
  const verdict: PurchaseVerdict =
    funds.required === null || funds.shortfall === null
      ? "unknown"
      : funds.shortfall > 0
        ? "stop"
        : "checked";

  const message =
    loanUnknown && copy.loanUnknown !== undefined
      ? copy.loanUnknown
      : copy[verdict === "unknown" ? "unknown" : verdict];

  return {
    id: "ownFunds",
    label: rule.label,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message,
    required: funds.required,
    loanPrincipal: funds.loanPrincipal,
    costs: funds.costs,
    cash: funds.cash,
    shortfall: funds.shortfall,
    remainingCash: funds.remainingCash,
    acquisitionNote: rules.acquisition.note,
    acquisitionHouseholdCountNote: rules.acquisition.householdCountNote,
    // 대출 원금을 실제로 뺐을 때만 붙인다. 뺀 적이 없으면 전제도 없다.
    loanAssumptionNote:
      funds.loanPrincipal !== null && funds.loanPrincipal > 0
        ? rule.loanAssumptionNote
        : null,
  };
}

/* ─────────────────────────── 갭투자 ─────────────────────────── */

function gapMetrics(
  rules: PurchaseRules,
  financeRules: Rules,
  input: GapInput,
  ids: readonly PurchaseMetricId[],
): PurchaseMetricResult[] {
  const funds = fundsContextOf(rules, financeRules, input);

  return ids.map((id) => {
    switch (id) {
      case "jeonseRatio":
        return jeonseRatioMetric(rules, funds);
      case "reverseJeonse":
        return reverseJeonseMetric(rules, funds);
      default:
        return ownFundsMetric(rules, funds, rules.metrics.ownFunds.messages.갭투자);
    }
  });
}

/** 전세가율 = 전세보증금 ÷ 매매 예정가. 높을수록 위험하다 */
function jeonseRatioMetric(
  rules: PurchaseRules,
  funds: FundsContext,
): JeonseRatioResult {
  const rule = rules.metrics.jeonseRatio;
  const ratio =
    funds.price === null || funds.deposit === null
      ? null
      : funds.deposit / funds.price;

  const verdict: PurchaseVerdict =
    ratio === null
      ? "unknown"
      : ratio >= rule.stopFrom
        ? "stop"
        : ratio >= rule.expertFrom
          ? "expert"
          : "checked";

  return {
    id: "jeonseRatio",
    label: rule.label,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message: rule.messages[verdict],
    ratio,
    price: funds.price,
    deposit: funds.deposit,
  };
}

/**
 * 역전세: 전세가가 내려가면 다음 세입자 보증금으로 기존 보증금을 다
 * 돌려주지 못한다. 그 차액을 현금으로 마련해야 한다.
 *
 * **재원은 보유 현금이 아니라 매수에 쓰고 남은 현금이다.** 매매가에
 * 이미 나간 돈을 다시 셀 수는 없다. 이 구분을 빼먹으면 반환 여력이
 * 통째로 과대 계상된다.
 *
 * 하락 폭과 각 단계의 판정은 룰셋(`metrics.reverseJeonse.stages`)이
 * 정한다. 판정은 못 막은 단계 중 **가장 무거운 것**을 쓴다 — 작은
 * 하락도 못 막으면 그게 결론이다.
 */
function reverseJeonseMetric(
  rules: PurchaseRules,
  funds: FundsContext,
): ReverseJeonseResult {
  const rule = rules.metrics.reverseJeonse;
  const { deposit, remainingCash } = funds;

  if (deposit === null || remainingCash === null) {
    return {
      id: "reverseJeonse",
      label: rule.label,
      verdict: "unknown",
      verdictLabel: rules.verdictLabels.unknown,
      message: rule.messages.unknown,
      stages: [],
      remainingCash,
      coverageRatio: null,
      depositIsNotDebtNote: rule.depositIsNotDebtNote,
    };
  }

  const stages: ReverseJeonseStageResult[] = rule.stages.map((stage) => {
    const nextDeposit = Math.round(deposit * (1 - stage.drop));
    const needed = deposit - nextDeposit;
    return {
      drop: stage.drop,
      nextDeposit,
      needed,
      // 마련할 돈이 없는 단계(보증금 자체가 0원)는 막을 것도 없다.
      covered: needed === 0 ? true : remainingCash >= needed,
    };
  });

  let verdict: "stop" | "expert" | "checked" = "checked";
  rule.stages.forEach((stage, index) => {
    if (stages[index]?.covered !== false) return;
    if (verdict === "stop") return;
    verdict = stage.uncoveredVerdict;
  });

  const maxNeeded = stages.reduce((max, stage) => Math.max(max, stage.needed), 0);

  return {
    id: "reverseJeonse",
    label: rule.label,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message: rule.messages[verdict],
    stages,
    remainingCash,
    coverageRatio: maxNeeded > 0 ? remainingCash / maxNeeded : null,
    depositIsNotDebtNote: rule.depositIsNotDebtNote,
  };
}

/* ─────────────────────────── 월세 수익형 ─────────────────────────── */

function rentalMetrics(
  rules: PurchaseRules,
  financeRules: Rules,
  input: RentalInput,
  ids: readonly PurchaseMetricId[],
): PurchaseMetricResult[] {
  const funds = fundsContextOf(
    rules,
    financeRules,
    input,
    loanFundingOf(input.loan),
  );

  const monthlyRent = money(input.monthlyRent);
  const annualRentIncome =
    monthlyRent === null ? null : monthlyRent * MONTHS_PER_YEAR;
  const operatingCost = money(input.annualOperatingCost);

  /*
   * 순영업소득 = 연 임대료 − 연 운영비용. **둘 다 알아야 낸다.**
   * 운영비용을 0으로 채우면 수익이 부풀고, 월세를 0으로 채우면 수익이
   * 사라진다. 어느 쪽도 하지 않는다.
   */
  const noi =
    annualRentIncome === null || operatingCost === null
      ? null
      : annualRentIncome - operatingCost;

  return ids.map((id) => {
    switch (id) {
      case "capRate":
        return capRateMetric(rules, funds.price, noi);
      case "dscr":
        return dscrMetric(rules, noi, input.loan);
      case "rti":
        return rtiMetric(rules, annualRentIncome, input.loan);
      default:
        return ownFundsMetric(
          rules,
          funds,
          rules.metrics.ownFunds.messages.월세수익형,
        );
    }
  });
}

/** Cap Rate = 순영업소득 ÷ 매매 예정가. 분모는 실투자금이 아니라 매매가다 */
function capRateMetric(
  rules: PurchaseRules,
  price: number | null,
  noi: number | null,
): CapRateResult {
  const rule = rules.metrics.capRate;
  const rate = price === null || noi === null ? null : noi / price;

  const verdict: PurchaseVerdict =
    rate === null
      ? "unknown"
      : rate < rule.stopBelow
        ? "stop"
        : rate < rule.expertBelow
          ? "expert"
          : "checked";

  return {
    id: "capRate",
    label: rule.label,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message: rule.messages[verdict],
    noi,
    rate,
  };
}

/**
 * DSCR = 순영업소득 ÷ 연간 원리금 상환액.
 *
 * **1.0 미만이면 임대료로 대출을 못 갚는다.** 경계는 미만(`<`)이라
 * 정확히 1.0은 stop이 아니지만, 여유가 0이라 expert로 남는다.
 *
 * 대출이 없으면 분모가 0이라 지표가 성립하지 않는다. 그때 "좋다"가
 * 아니라 "낼 수 없다"고 말한다 — 갚을 원리금이 없다는 사실이 이 집이
 * 좋다는 뜻은 아니다.
 */
function dscrMetric(
  rules: PurchaseRules,
  noi: number | null,
  loan: RentalLoanAnswer,
): DscrResult {
  const rule = rules.metrics.dscr;
  const base = { id: "dscr", label: rule.label } as const;
  const unknown = (message: string): DscrResult => ({
    ...base,
    verdict: "unknown",
    verdictLabel: rules.verdictLabels.unknown,
    message,
    noi,
    annualDebtService: null,
    ratio: null,
  });

  if (loan.kind === "none") return unknown(rule.messages.noLoan);
  if (loan.kind === "unknown") return unknown(rule.messages.unknown);

  const annualDebtService = money(loan.annualDebtService);
  if (annualDebtService === null) return unknown(rule.messages.unknown);
  if (annualDebtService === 0) return unknown(rule.messages.noLoan);
  if (noi === null) {
    return { ...unknown(rule.messages.unknown), annualDebtService };
  }

  const ratio = noi / annualDebtService;
  const verdict: PurchaseVerdict =
    ratio < rule.stopBelow
      ? "stop"
      : ratio < rule.expertBelow
        ? "expert"
        : "checked";

  return {
    ...base,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message: rule.messages[verdict],
    noi,
    annualDebtService,
    ratio,
  };
}

/**
 * RTI = 연간 임대소득 ÷ 연간 이자비용.
 *
 * **이 지표는 `checked`도 `stop`도 내지 않는다.** 임대업이자상환비율의
 * 규제 기준값이 2026년 8월 현재 얼마인지 확인하지 못했기 때문이다.
 * 확인되지 않은 참고선을 넘었다는 이유로 "확인했어요"라고 말하면 우리가
 * 모르는 것을 아는 척하는 것이 되고, 같은 이유로 그 숫자를 근거로
 * 거래를 멈추라고 말할 수도 없다. 참고선 위아래로 **문구만** 갈리고
 * 판정은 언제나 `expert`다 — 실제 기준은 금융기관·규제에서 확인해야
 * 한다는 말이 그 자리에 그대로 남는다.
 *
 * 분자는 연 임대료만 쓴다. 실제 규제 산식은 보증금 운용수익을 더하기도
 * 하는데 그 환산율을 확인하지 못했다 — 빼는 쪽이 RTI를 작게 만들어
 * 낙관 반대 방향이다.
 */
function rtiMetric(
  rules: PurchaseRules,
  annualRentIncome: number | null,
  loan: RentalLoanAnswer,
): RtiResult {
  const rule = rules.metrics.rti;
  const base = { id: "rti", label: rule.label } as const;
  const unknown = (message: string): RtiResult => ({
    ...base,
    verdict: "unknown",
    verdictLabel: rules.verdictLabels.unknown,
    message,
    annualRentIncome,
    annualInterest: null,
    ratio: null,
  });

  if (loan.kind === "none") return unknown(rule.messages.noLoan);
  if (loan.kind === "unknown") return unknown(rule.messages.unknown);

  const annualInterest = money(loan.annualInterest);
  if (annualInterest === null) return unknown(rule.messages.unknown);
  if (annualInterest === 0) return unknown(rule.messages.noLoan);
  if (annualRentIncome === null) {
    return { ...unknown(rule.messages.unknown), annualInterest };
  }

  const ratio = annualRentIncome / annualInterest;

  return {
    ...base,
    verdict: "expert",
    verdictLabel: rules.verdictLabels.expert,
    message:
      ratio < rule.expertBelow
        ? rule.messages.belowReference
        : rule.messages.aboveReference,
    annualRentIncome,
    annualInterest,
    ratio,
  };
}
