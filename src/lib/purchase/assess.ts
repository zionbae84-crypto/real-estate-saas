import {
  calcAcquisitionCosts,
  type BuyerProfile,
  type CostBreakdown,
  type Rules,
} from "../finance";
import type {
  CapRateResult,
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
    hasUnknownMetric: metrics.some((metric) => metric.verdict === "unknown"),
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
 * 4. 그 밖에만 `clear`이고, 그것조차 "걸리는 게 없었다"이지
 *    "안전하다"가 아니다.
 */
function decideOverall(metrics: PurchaseMetricResult[]): PurchaseOverall {
  const has = (verdict: PurchaseVerdict) =>
    metrics.some((metric) => metric.verdict === verdict);

  if (has("stop")) return "stop";
  if (has("unknown")) return "incomplete";
  if (has("expert")) return "expert";
  return "clear";
}

/**
 * `incomplete`일 때 이미 확인이 필요한 지표가 있으면 그 사실을 덧붙인다.
 *
 * 미입력 값 하나가 이미 걸린 지표를 회색 "아직 다 채우지 않았어요" 뒤로
 * 숨기면 실제보다 덜 위험해 보인다. 우선순위는 바꾸지 않는다 — 먼저
 * 채우라고 말하는 것이 여전히 맞는 안내다. 문구는 룰셋에서 온다.
 */
function overallNoteFor(
  copy: PurchaseOverallCopy,
  overall: PurchaseOverall,
  metrics: PurchaseMetricResult[],
): string {
  if (overall !== "incomplete") return copy.note;
  if (copy.pendingExpertNote === undefined) return copy.note;
  if (!metrics.some((metric) => metric.verdict === "expert")) return copy.note;
  return `${copy.note} ${copy.pendingExpertNote}`;
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

interface FundsContext {
  price: number | null;
  deposit: number | null;
  cash: number | null;
  costs: CostBreakdown | null;
  /** 매매 예정가 − 보증금 + 부대비용(원) */
  required: number | null;
  /** 모자란 금액(원). 모자라지 않으면 0 */
  shortfall: number | null;
  /** 매수에 쓰고 남는 현금(원). 음수일 수 있다 */
  remainingCash: number | null;
}

function fundsContextOf(
  rules: PurchaseRules,
  financeRules: Rules,
  raw: { price: number | null; deposit: number | null; cash: number | null },
): FundsContext {
  const price = positiveMoney(raw.price);
  const deposit = money(raw.deposit);
  const cash = money(raw.cash);

  const costs =
    price === null
      ? null
      : calcAcquisitionCosts(price, costProfile(rules), financeRules);

  /*
   * 보증금이 매매가보다 큰 경우(이른바 무피·플피) `price - deposit`이
   * 음수가 된다. 그대로 두면 계약 때 돈을 돌려받는 것으로 계산되어
   * 남는 현금이 보유 현금보다 커지는데, 그건 낙관 방향이다. 0에서
   * 끊는다 — 그런 조건은 어차피 전세가율이 먼저 stop을 낸다.
   */
  const required =
    price === null || deposit === null || costs === null
      ? null
      : Math.max(0, price - deposit + costs.total);

  const shortfall =
    required === null || cash === null ? null : Math.max(0, required - cash);
  const remainingCash =
    required === null || cash === null ? null : cash - required;

  return { price, deposit, cash, costs, required, shortfall, remainingCash };
}

function ownFundsMetric(
  rules: PurchaseRules,
  funds: FundsContext,
): OwnFundsResult {
  const rule = rules.metrics.ownFunds;
  const verdict: PurchaseVerdict =
    funds.required === null || funds.shortfall === null
      ? "unknown"
      : funds.shortfall > 0
        ? "stop"
        : "checked";

  const messageKey = verdict === "unknown" ? "unknown" : verdict;

  return {
    id: "ownFunds",
    label: rule.label,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message: rule.messages[messageKey],
    required: funds.required,
    costs: funds.costs,
    cash: funds.cash,
    shortfall: funds.shortfall,
    remainingCash: funds.remainingCash,
    acquisitionNote: rules.acquisition.note,
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
        return ownFundsMetric(rules, funds);
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
  const funds = fundsContextOf(rules, financeRules, input);

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
        return ownFundsMetric(rules, funds);
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
