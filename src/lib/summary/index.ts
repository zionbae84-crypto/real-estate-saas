/**
 * 진단 종합 엔진의 공개 표면.
 *
 * `src/lib/purchase`·`src/lib/price`·`src/lib/location`과 나란한
 * 자리이되, **이 모듈만은 판정을 새로 내지 않는다.** 저 셋이 이미 낸
 * 결과를 읽어서 한자리에 모을 뿐이다(네 번째 축인 권리분석은 이 앱에서
 * 제거돼 언제나 `null`이다 — `./types.ts`의 `RightsAssessment` 문서 참고).
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
