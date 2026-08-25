/**
 * 진단 종합 엔진의 공개 표면.
 *
 * `src/lib/rights`·`src/lib/purchase`·`src/lib/price`·
 * `src/lib/location`과 나란한 자리이되, **이 모듈만은 판정을 새로
 * 내지 않는다.** 저 넷이 이미 낸 결과를 읽어서 한자리에 모을 뿐이다.
 */
export { buildDiagnosisSummary } from "./assess";
export { parseSummaryRules } from "./rules";
export { SUMMARY_AXIS_IDS } from "./types";
export type {
  DiagnosisSummary,
  DiagnosisSummaryInput,
  RightsAssessment,
  SummaryAxisId,
  SummaryAxisLine,
  SummaryAxisStatus,
  SummaryHeadline,
  SummaryRules,
} from "./types";
