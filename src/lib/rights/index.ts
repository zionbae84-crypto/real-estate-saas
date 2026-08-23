/**
 * 권리분석 문진 엔진의 공개 표면.
 *
 * `src/lib/finance`와 나란한 자리이되 **서로 손대지 않는다** — 재무
 * 계산은 예산이 어긋나는 문제이고, 여기는 소유권을 잃는 문제라 판정
 * 규칙도 룰셋 파일도 따로 둔다.
 */
export { assessRights } from "./assess";
export type { RightsAssessment, RightsFinding } from "./assess";
export { calcEncumbrance } from "./encumbrance";
export type { EncumbranceResult } from "./encumbrance";
export { parseRightsRules } from "./rules";
export type {
  RightsAmountRole,
  RightsAnswer,
  RightsAnswers,
  RightsItem,
  RightsOption,
  RightsOverall,
  RightsRules,
  RightsSection,
  RightsVerdict,
} from "./types";
