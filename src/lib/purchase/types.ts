/**
 * 구매 유형별 재무 지표가 다루는 타입.
 *
 * 부모 스펙 14절이 요구한 분기다 — **DSCR은 주거용 실거주에 적용되지
 * 않는다. 임대수익이 0이라 분자가 성립하지 않는다.** 그래서 유형이
 * 먼저 정해지고, 유형에 맞는 지표만 나온다.
 *
 * 판정에 쓰이는 **값**(임계값·하락 단계·문구)은 여기 없다 — 전부
 * `rules/purchase-2026-08.json`에 있다. 이 파일은 그 데이터의 모양만
 * 정한다. `src/lib/rights/types.ts`와 같은 태도다.
 *
 * ## 이 모듈이 하지 않는 것 — 대출 한도
 *
 * `rules/2026-08.json`의 LTV·DSR·절대상한은 전부 **실거주 매수를
 * 전제로** 고시된 값이다. 임대사업자대출·다주택자 LTV·전세 낀 매수의
 * 한도는 그 룰셋에 없다. 그러므로 갭투자·월세 수익형에서
 * `calcMaxLoan`·`calcAffordablePrice`·`calcSafePrice`를 부르면 실거주
 * 기준 한도를 투자 목적 매수에 적용하는 것이 되고, **빌릴 수 있는 돈을
 * 과대 계상하는** 정확히 최악의 결함이 된다. 이 디렉터리의 어떤 파일도
 * 그 세 함수를 부르지 않으며, `scripts/purchase-structure.test.ts`가
 * 소스를 직접 훑어 그 사실을 잠근다. 대신 룰셋의 `loanLimitNote`가
 * 모른다고 말한다.
 */
import type { CostBreakdown } from "../finance";

/** 구매 유형 */
export type PurchaseType = "실거주" | "갭투자" | "월세수익형";

/**
 * 이 모듈이 지표를 내는 유형.
 *
 * **실거주가 빠져 있는 것이 이 타입의 요점이다.** 아래
 * {@link PurchaseInput}도 이 유니온 위에 서 있어서, 실거주로
 * `assessPurchase`를 부르는 코드는 타입 검사에서 막힌다 — DSCR·Cap
 * Rate·RTI가 실거주에서 계산되는 경로가 아예 존재하지 않는다.
 */
export type InvestmentType = "갭투자" | "월세수익형";

export const PURCHASE_TYPES: readonly PurchaseType[] = [
  "실거주",
  "갭투자",
  "월세수익형",
];

/**
 * 지금 화면에서 고를 수 있는 구매 유형.
 *
 * 갭투자를 뺐다 — 전세자금대출 규제로 지금은 갭투자로 살 수 있는
 * 환경이 아니다. **엔진은 그대로 둔다**: `assessPurchase`·룰셋 검증은
 * 여전히 갭투자를 다룬다(위 `PURCHASE_TYPES`도 안 줄인다) — 규제가
 * 풀리면 이 목록에만 다시 넣으면 되고, 지표 로직을 다시 만들 필요가
 * 없다. `PurchaseTypeSelect`(선택 화면)와 `usePurchaseType`(저장된 값
 * 복원)이 이 목록을 함께 쓴다 — 하나만 고치면 예전에 갭투자를 저장해
 * 둔 사용자가 고를 수 없는 유형이 선택된 채로 화면에 남는다.
 */
export const SELECTABLE_PURCHASE_TYPES: readonly PurchaseType[] =
  PURCHASE_TYPES.filter((type) => type !== "갭투자");

export const INVESTMENT_TYPES: readonly InvestmentType[] = [
  "갭투자",
  "월세수익형",
];

/**
 * 지표 하나에 내리는 판정.
 *
 * - `stop`: 이대로면 사면 안 된다
 * - `expert`: 우리가 판단할 수 없다. 금융기관·세무 확인이 필요하다
 * - `checked`: 이 지표에서는 걸리는 게 없었다
 * - `unknown`: **낼 수 없었다.** 모르는 값을 0으로 채우지 않기 때문에
 *   생기는 판정이고, "문제없다"가 아니다
 *
 * `checked`는 개별 지표 전용이다. 전체 결론에는 {@link PurchaseOverall}만
 * 쓰며 그중 어느 값도 "안전"을 뜻하지 않는다.
 */
export type PurchaseVerdict = "stop" | "expert" | "checked" | "unknown";

/** 한 유형 전체의 결론. `clear`조차 "걸리는 게 없었다"이지 "안전하다"가 아니다 */
export type PurchaseOverall = "stop" | "incomplete" | "expert" | "clear";

/** 지표 식별자. 전부 투자 목적 매수에서만 쓰인다 */
export type PurchaseMetricId =
  | "jeonseRatio"
  | "ownFunds"
  | "reverseJeonse"
  | "capRate"
  | "dscr"
  | "rti";

export const PURCHASE_METRIC_IDS: readonly PurchaseMetricId[] = [
  "jeonseRatio",
  "ownFunds",
  "reverseJeonse",
  "capRate",
  "dscr",
  "rti",
];

/* ─────────────────────────── 룰셋의 모양 ─────────────────────────── */

export interface FieldCopy {
  label: string;
  hint: string;
}

export interface PurchaseTypeRuleBase {
  label: string;
  summary: string;
  /**
   * 이 유형에서 대출 한도를 계산하는가.
   *
   * 실거주만 `true`다 — 그리고 그 계산은 이 모듈이 아니라 기존
   * `src/lib/finance`가 한다. 나머지 유형에서는 `false`이고
   * {@link loanLimitNote}가 왜 계산하지 않는지 말한다.
   */
  computesLoanLimit: boolean;
  metrics: PurchaseMetricId[];
}

export interface ResidentialTypeRule extends PurchaseTypeRuleBase {
  computesLoanLimit: true;
  /** 실거주는 투자 지표를 하나도 갖지 않는다. 파서가 강제한다 */
  metrics: [];
}

export interface InvestmentTypeRuleBase extends PurchaseTypeRuleBase {
  computesLoanLimit: false;
  /** "이 유형의 대출 한도는 우리가 계산하지 않아요" — 화면에 그대로 나간다 */
  loanLimitNote: string;
}

export type GapFieldId = "price" | "deposit" | "cash";

export interface GapTypeRule extends InvestmentTypeRuleBase {
  fields: Record<GapFieldId, FieldCopy>;
}

export type RentalFieldId =
  | "price"
  | "deposit"
  | "cash"
  | "monthlyRent"
  | "annualOperatingCost"
  | "loanPrincipal"
  | "annualDebtService"
  | "annualInterest";

export interface LoanChoiceCopy {
  label: string;
  /** 대출을 끼지 않는다 — **확인한 0원**이다 */
  none: string;
  /** 대출이 있고 금액을 안다 */
  known: string;
  /** 대출이 있는데 금액을 모른다 — 0원이 아니다 */
  unknown: string;
}

export interface RentalTypeRule extends InvestmentTypeRuleBase {
  fields: Record<RentalFieldId, FieldCopy>;
  loanChoice: LoanChoiceCopy;
}

export interface PurchaseOverallCopy {
  label: string;
  note: string;
  /** `incomplete`에서만 쓰는 조건부 덧말(권리분석 룰셋의 같은 자리와 같은 이유) */
  pendingExpertNote?: string;
  /**
   * `expert`에서만 쓰는 조건부 덧말.
   *
   * 월세 수익형에서 대출 원금을 실제로 뺐으면(`OwnFundsResult.loanAssumptionNote
   * !== null`) 결론은 `clear`로 내려가지 않고 최소 `expert`에 머문다
   * ({@link PurchaseOverall} 문서, `assessPurchase`의
   * `hasUnverifiedLoanPrincipal` 참고) — 이 화면은 임대사업자대출·다주택자
   * 한도를 계산하지 않는다고 스스로 선언해서, 사용자가 적은 대출 원금이
   * 실제로 나오는 금액인지 검증할 방법이 없기 때문이다. 그 하한이 왜
   * 걸렸는지를 이 문구가 말한다.
   */
  loanFloorNote?: string;
}

/**
 * 부대비용 계산에 쓰는 전제.
 *
 * 부대비용 자체는 실거주 경로와 **같은 함수**(`calcAcquisitionCosts`)로
 * 낸다 — 취득세·중개보수는 구매 유형과 무관하다. 다만 그 함수가
 * 프로필에서 읽는 두 값은 유형 때문에 달라져서 여기서 고정한다. 둘 다
 * 비용이 커지는 쪽(=낙관 반대 방향)으로 골랐고, 이유는 룰셋의
 * `_acquisitionNote`에 적혀 있다.
 */
export interface AcquisitionAssumption {
  isFirstTimeBuyer: boolean;
  assumedExclusiveAreaSqm: number;
  /** 이름 붙인 두 전제(면적·생애최초)를 화면에 밝히는 문구 */
  note: string;
  /**
   * **이름 붙이지 않은 세 번째 전제** — 취득자의 주택 수.
   *
   * `calcAcquisitionCosts`는 `profile.status`를 읽지 않고,
   * `rules/2026-08.json`에는 다주택 취득세 중과 분기가 없다. 그 중과율을
   * 확인하지 못했으므로 숫자를 넣지 않고, 대신 **묻지 않았다는 사실과
   * 부대비용이 이보다 커질 수 있다는 방향**을 이 문구가 말한다.
   * 파서가 방향을 강제한다(작아진다고만 말하는 문구는 거부된다).
   */
  householdCountNote: string;
}

export interface JeonseRatioRule {
  label: string;
  /** 이 비율 이상이면 expert */
  expertFrom: number;
  /** 이 비율 이상이면 stop. `expertFrom <= stopFrom`이어야 한다 */
  stopFrom: number;
  messages: Record<"stop" | "expert" | "checked" | "unknown", string>;
}

/**
 * 필요 자기자금 규칙.
 *
 * **문구가 유형별로 갈린다.** 산식은 같아도 화면에 적히는 이름이 다르다 —
 * 월세 화면의 필드 라벨은 "보증금"인데 결과가 "전세보증금"이라고 말하면
 * 사용자가 방금 적은 값과 다른 것을 가리키는 말이 된다. 파서가
 * 월세수익형 문구에 "전세보증금"이 들어오는 것을 거부한다.
 */
export interface OwnFundsRule {
  label: string;
  /** 대출 원금을 뺀 계산이 그 대출을 전제한다는 사실을 밝히는 문구 */
  loanAssumptionNote: string;
  messages: {
    갭투자: Record<"stop" | "checked" | "unknown", string>;
    /** `loanUnknown`: 대출을 낀다는데 원금을 몰라 아예 내지 않는 경우 */
    월세수익형: Record<"stop" | "checked" | "unknown" | "loanUnknown", string>;
  };
}

export interface ReverseJeonseStageRule {
  /** 전세보증금 하락 폭 (0.05 = 5%) */
  drop: number;
  /** 이 단계를 남은 현금으로 못 막았을 때 내리는 판정 */
  uncoveredVerdict: "stop" | "expert";
}

export interface ReverseJeonseRule {
  label: string;
  /** drop 오름차순. 판정은 stop → expert 순서여야 한다(파서가 강제) */
  stages: ReverseJeonseStageRule[];
  /** 보증금이 DSR에 안 잡힌다는 사실과 그래도 반환 의무라는 사실 */
  depositIsNotDebtNote: string;
  messages: Record<"stop" | "expert" | "checked" | "unknown", string>;
}

export interface CapRateRule {
  label: string;
  /** 이 값 **미만**이면 stop */
  stopBelow: number;
  /** 이 값 미만이면 expert. `stopBelow <= expertBelow`여야 한다 */
  expertBelow: number;
  messages: Record<"stop" | "expert" | "checked" | "unknown", string>;
}

export interface DscrRule {
  label: string;
  /** 이 값 미만이면 stop. 1.0이면 "임대료로 대출을 못 갚는다"는 뜻이다 */
  stopBelow: number;
  expertBelow: number;
  messages: Record<"stop" | "expert" | "checked" | "unknown" | "noLoan", string>;
}

/**
 * RTI 규칙.
 *
 * **다른 지표와 모양이 다른 이유가 있다.** 임대업이자상환비율의 규제
 * 기준값(주택/비주택)이 2026년 8월 현재 얼마인지 이 작업에서 확인하지
 * 못했다. 그래서 `expertBelow`는 "우리가 둔 참고선"일 뿐이고, 이 지표는
 * `checked`도 `stop`도 내지 않는다 — 확인되지 않은 숫자로 통과를
 * 선언할 수도, 거래를 멈추라고 말할 수도 없다. 참고선 위아래로
 * 메시지만 갈린다. 자세한 이유는 룰셋의 `metrics.rti._note`에 있다.
 */
export interface RtiRule {
  label: string;
  /** 출처를 확인하지 못한 참고선 */
  expertBelow: number;
  messages: Record<
    "belowReference" | "aboveReference" | "noLoan" | "unknown",
    string
  >;
}

export interface PurchaseMetricRules {
  jeonseRatio: JeonseRatioRule;
  ownFunds: OwnFundsRule;
  reverseJeonse: ReverseJeonseRule;
  capRate: CapRateRule;
  dscr: DscrRule;
  rti: RtiRule;
}

export interface PurchaseRules {
  version: string;
  effectiveFrom: string;
  verdictLabels: Record<PurchaseVerdict, string>;
  overall: Record<PurchaseOverall, PurchaseOverallCopy>;
  disclaimer: string[];
  acquisition: AcquisitionAssumption;
  types: {
    실거주: ResidentialTypeRule;
    갭투자: GapTypeRule;
    월세수익형: RentalTypeRule;
  };
  metrics: PurchaseMetricRules;
}

/* ─────────────────────────── 사용자의 입력 ─────────────────────────── */

/**
 * 대출에 대한 답.
 *
 * `none`(대출을 끼지 않는다 — **확인한 0원**)과 `unknown`(금액을 모른다)이
 * 갈라져 있는 것이 핵심이다. 하나로 합치면 모름이 0원으로 둔갑해 DSCR과
 * RTI가 "갚을 게 없다"는 낙관적인 모습이 된다. 권리분석 문진의
 * `amount: "zero" | "input" | "unknown"`과 같은 구분이다.
 */
export type RentalLoanAnswer =
  | { kind: "none" }
  | {
      kind: "known";
      /**
       * 대출 원금(원). `null`은 0원이 아니라 모름이다.
       *
       * **아래 두 값에서 역산하지 않는다.** 금리와 기간을 모르면 연간
       * 원리금·이자에서 원금이 나오지 않는다. 모르면 필요 자기자금을
       * 아예 내지 않는다 — 0으로 두면 대출이 없는 것으로 계산된다.
       */
      principal: number | null;
      /** 연간 원리금 상환액(원). `null`은 0원이 아니라 모름이다 */
      annualDebtService: number | null;
      /** 연간 이자비용(원). `null`은 0원이 아니라 모름이다 */
      annualInterest: number | null;
    }
  | { kind: "unknown" };

/** 갭투자 입력. `null`은 모두 "아직 모른다"이지 0원이 아니다 */
export interface GapInput {
  price: number | null;
  deposit: number | null;
  cash: number | null;
}

/** 월세 수익형 입력. `null`은 모두 "아직 모른다"이지 0원이 아니다 */
export interface RentalInput {
  price: number | null;
  deposit: number | null;
  cash: number | null;
  monthlyRent: number | null;
  annualOperatingCost: number | null;
  loan: RentalLoanAnswer;
}

/**
 * 지표를 낼 수 있는 입력.
 *
 * **실거주가 없다.** 실거주로는 이 유니온을 만들 수 없으므로
 * `assessPurchase`를 부를 수도 없다 — 타입 수준에서 막힌 경로다.
 */
export type PurchaseInput =
  | ({ type: "갭투자" } & GapInput)
  | ({ type: "월세수익형" } & RentalInput);

/* ─────────────────────────── 계산 결과 ─────────────────────────── */

interface MetricResultBase {
  label: string;
  verdict: PurchaseVerdict;
  /** 화면에 그대로 쓰는 등급 글자. 색이 아니라 이 글자가 등급을 말한다 */
  verdictLabel: string;
  message: string;
}

export interface JeonseRatioResult extends MetricResultBase {
  id: "jeonseRatio";
  /** 전세보증금 ÷ 매매 예정가. 낼 수 없으면 null */
  ratio: number | null;
  price: number | null;
  deposit: number | null;
}

export interface OwnFundsResult extends MetricResultBase {
  id: "ownFunds";
  /** 매매 예정가 − 보증금 − 대출 원금 + 부대비용(원). 낼 수 없으면 null */
  required: number | null;
  /**
   * 이 계산에서 뺀 대출 원금(원). 대출을 끼지 않으면 0, 모르면 null.
   *
   * `null`이면 필요 자기자금도 내지 않는다 — 0으로 대신 두지 않는다.
   */
  loanPrincipal: number | null;
  costs: CostBreakdown | null;
  cash: number | null;
  /** 모자란 금액(원). 모자라지 않으면 0, 낼 수 없으면 null */
  shortfall: number | null;
  /** 매수에 쓰고 남는 현금(원). 음수일 수 있다. 낼 수 없으면 null */
  remainingCash: number | null;
  /** 부대비용 전제(면적·생애최초)를 밝히는 문구 */
  acquisitionNote: string;
  /** 주택 수를 묻지 않았고 부대비용이 이보다 커질 수 있다는 문구 */
  acquisitionHouseholdCountNote: string;
  /** 대출 원금을 뺐을 때만 붙는, 그 대출을 전제한다는 문구. 아니면 null */
  loanAssumptionNote: string | null;
}

export interface ReverseJeonseStageResult {
  drop: number;
  /** 하락 후 다음 세입자에게 받는 보증금(원) */
  nextDeposit: number;
  /** 그때 현금으로 마련해야 하는 금액(원) */
  needed: number;
  /** 남은 현금으로 막을 수 있는가 */
  covered: boolean;
}

export interface ReverseJeonseResult extends MetricResultBase {
  id: "reverseJeonse";
  stages: ReverseJeonseStageResult[];
  /** 매수에 쓰고 남는 현금(원). 음수일 수 있다 */
  remainingCash: number | null;
  /**
   * 보증금 반환 여력 = 남은 현금 ÷ 가장 큰 하락 단계에서 마련해야 할 돈.
   * 1보다 작으면 그 단계를 못 막는다. 낼 수 없으면 null
   */
  coverageRatio: number | null;
  depositIsNotDebtNote: string;
}

export interface CapRateResult extends MetricResultBase {
  id: "capRate";
  /** 순영업소득(연 임대료 − 연 운영비용, 원). 낼 수 없으면 null */
  noi: number | null;
  /** 순영업소득 ÷ 매매 예정가. 낼 수 없으면 null */
  rate: number | null;
}

export interface DscrResult extends MetricResultBase {
  id: "dscr";
  noi: number | null;
  annualDebtService: number | null;
  /** 순영업소득 ÷ 연간 원리금. 낼 수 없으면 null */
  ratio: number | null;
}

export interface RtiResult extends MetricResultBase {
  id: "rti";
  annualRentIncome: number | null;
  annualInterest: number | null;
  /** 연간 임대소득 ÷ 연간 이자비용. 낼 수 없으면 null */
  ratio: number | null;
}

export type PurchaseMetricResult =
  | JeonseRatioResult
  | OwnFundsResult
  | ReverseJeonseResult
  | CapRateResult
  | DscrResult
  | RtiResult;

export interface PurchaseAssessment {
  type: InvestmentType;
  typeLabel: string;
  overall: PurchaseOverall;
  overallLabel: string;
  overallNote: string;
  /** "이 유형의 대출 한도는 우리가 계산하지 않아요 …" */
  loanLimitNote: string;
  metrics: PurchaseMetricResult[];
  disclaimer: readonly string[];
}
