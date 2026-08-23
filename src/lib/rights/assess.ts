import { calcEncumbrance, type EncumbranceResult } from "./encumbrance";
import type {
  RightsAnswers,
  RightsItem,
  RightsOption,
  RightsOverall,
  RightsRules,
  RightsVerdict,
} from "./types";

export interface RightsFinding {
  item: RightsItem;
  /** 사용자가 고른 선택지. 아직 답하지 않았으면 null */
  option: RightsOption | null;
  /** 아직 답하지 않았으면 null — **통과가 아니다** */
  verdict: RightsVerdict | null;
  /** 화면에 그대로 쓰는 등급 글자. 색이 아니라 이 글자가 등급을 말한다 */
  label: string;
  /** 왜 그 판정인지. 없으면 null */
  note: string | null;
}

export interface RightsAssessment {
  overall: RightsOverall;
  overallLabel: string;
  overallNote: string;
  findings: RightsFinding[];
  /** 아직 답하지 않은 항목 id들 */
  unansweredItemIds: string[];
  /** 매매 예정가를 아직 모르는가 */
  priceMissing: boolean;
  encumbrance: EncumbranceResult;
  /**
   * 합계 계산의 등급 글자.
   *
   * 항목별 {@link RightsFinding.label}과 같은 출처(룰셋의 `verdictLabels`)를
   * 쓴다 — 화면이 등급을 색이 아니라 글자로 말해야 하는데, 그 글자를
   * 컴포넌트가 스스로 지어내면 여기서만 다른 말이 나온다.
   */
  encumbranceLabel: string;
  /** 결론과 늘 함께 보여야 하는 문구 */
  disclaimer: readonly string[];
}

/**
 * 문진의 답을 판정으로 바꾼다.
 *
 * **이 함수가 낼 수 있는 가장 좋은 결론은 `clear`이고, 그것은 "안전하다"가
 * 아니라 "이 문진이 확인한 범위에서는 걸리는 게 없었다"이다.** 문구는
 * 전부 룰셋(`rules/rights-2026-08.json`)에서 오고, 이 파일에는 사용자에게
 * 보일 문자열이 하나도 없다.
 *
 * 결론을 고르는 순서에 담긴 판단:
 *
 * 1. `stop`이 하나라도 있으면 `stop`이다. 다른 항목이 아무리 깨끗해도
 *    상쇄되지 않는다 — 권리는 평균 내는 것이 아니다.
 * 2. 답하지 않은 항목(또는 매매 예정가 미입력)이 있으면 `incomplete`다.
 *    **빈칸은 통과가 아니다.**
 * 3. `expert`가 하나라도 있으면 `expert`다.
 * 4. 그 밖에만 `clear`다.
 *
 * 2번이 3번보다 앞에 있는 것은 화면 문구를 고르기 위해서다(먼저 채우라고
 * 말해야 한다). 어느 쪽이든 `clear`가 아니라는 결론은 같다.
 */
export function assessRights(
  rules: RightsRules,
  answers: RightsAnswers,
  price: number | null,
): RightsAssessment {
  const findings = rules.items.map((item) => toFinding(rules, item, answers));
  const unansweredItemIds = findings
    .filter((finding) => finding.verdict === null)
    .map((finding) => finding.item.id);

  const encumbrance = calcEncumbrance(rules, answers, price);
  const priceMissing = encumbrance.price === null;

  const overall = decideOverall({
    findings,
    encumbrance,
    unansweredCount: unansweredItemIds.length,
    priceMissing,
  });

  const copy = rules.overall[overall];

  return {
    overall,
    overallLabel: copy.label,
    overallNote: copy.note,
    findings,
    unansweredItemIds,
    priceMissing,
    encumbrance,
    encumbranceLabel: rules.verdictLabels[encumbrance.verdict],
    disclaimer: rules.disclaimer,
  };
}

function toFinding(
  rules: RightsRules,
  item: RightsItem,
  answers: RightsAnswers,
): RightsFinding {
  const answer = answers[item.id];
  const option =
    answer === undefined
      ? undefined
      : item.options.find((candidate) => candidate.id === answer.optionId);

  // 룰셋에 없는 선택지 id가 들어오면(옛 답이 남아 있거나 룰셋이 바뀐
  // 경우) 답하지 않은 것으로 본다. 모르는 값을 통과로 바꾸지 않는다.
  if (option === undefined) {
    return {
      item,
      option: null,
      verdict: null,
      label: rules.unansweredLabel,
      note: null,
    };
  }

  return {
    item,
    option,
    verdict: option.verdict,
    label: rules.verdictLabels[option.verdict],
    note: option.note ?? null,
  };
}

function decideOverall(input: {
  findings: RightsFinding[];
  encumbrance: EncumbranceResult;
  unansweredCount: number;
  priceMissing: boolean;
}): RightsOverall {
  const { findings, encumbrance, unansweredCount, priceMissing } = input;

  if (
    findings.some((finding) => finding.verdict === "stop") ||
    encumbrance.verdict === "stop"
  ) {
    return "stop";
  }
  if (unansweredCount > 0 || priceMissing) return "incomplete";
  if (
    findings.some((finding) => finding.verdict === "expert") ||
    encumbrance.verdict === "expert"
  ) {
    return "expert";
  }
  return "clear";
}
