/**
 * 구매 유형별 재무 지표 엔진의 공개 표면.
 *
 * `src/lib/finance`·`src/lib/price`와 나란한 자리이되 **재무 엔진의
 * 대출 한도 계산은 손대지도 부르지도 않는다.** 실거주 경로는 지금
 * 그대로 `src/lib/finance`가 계산하고, 이 모듈은 갭투자·월세 수익형만
 * 다룬다 — 그 두 유형의 대출 한도는 우리가 모르므로 계산하지 않고
 * 모른다고 말한다(룰셋의 `loanLimitNote`).
 */
export { assessPurchase } from "./assess";
export { parsePurchaseRules } from "./rules";
export {
  INVESTMENT_TYPES,
  PURCHASE_METRIC_IDS,
  PURCHASE_TYPES,
  SELECTABLE_PURCHASE_TYPES,
} from "./types";
export type {
  CapRateResult,
  DscrResult,
  GapInput,
  GapTypeRule,
  InvestmentType,
  JeonseRatioResult,
  OwnFundsResult,
  PurchaseAssessment,
  PurchaseInput,
  PurchaseMetricId,
  PurchaseMetricResult,
  PurchaseOverall,
  PurchaseRules,
  PurchaseType,
  PurchaseVerdict,
  RentalInput,
  RentalLoanAnswer,
  RentalTypeRule,
  ReverseJeonseResult,
  ReverseJeonseStageResult,
  RtiResult,
} from "./types";
