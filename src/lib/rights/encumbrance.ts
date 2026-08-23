import type {
  RightsAnswer,
  RightsAnswers,
  RightsOption,
  RightsRules,
  RightsVerdict,
} from "./types";

export interface EncumbranceResult {
  verdict: RightsVerdict;
  /**
   * 확인된 금액만 더한 합계(원, 정수).
   *
   * **모르는 금액은 여기 들어가지 않는다.** 0으로 넣으면 위험이 통째로
   * 사라지므로, 빠진 항목은 {@link unknownItemIds}로 따로 센다.
   */
  knownTotal: number;
  /** 금액을 알 수 없어 합계에서 빠진 항목 id들 */
  unknownItemIds: string[];
  /** `knownTotal / price`. 매매가를 모르면 null */
  ratio: number | null;
  /** 계산에 쓴 매매 예정가(원). 모르면 null */
  price: number | null;
  /** 룰셋이 정한 설명 문구 */
  message: string;
}

/**
 * 채권최고액 합계 + 선순위 임차보증금을 매매 예정가와 견준다.
 *
 * 이 합이 매매가에 육박하거나 넘으면, 잔금으로 기존 권리를 지울 수
 * 없다는 뜻이다.
 *
 * **어떤 항목을 더할지도, 어느 비율부터 위험인지도 코드가 정하지
 * 않는다** — `rules/rights-2026-08.json`의 `encumbrance.sourceItemIds`와
 * `expertRatio`·`stopRatio`가 정한다.
 *
 * 판정 순서에 담긴 판단:
 *
 * 1. 매매가를 모르면 아무 비율도 내지 않는다. 분모가 없다.
 * 2. **아는 금액만으로 이미 `stopRatio`를 넘었으면 `stop`이다.** 모르는
 *    값은 합계를 더 키울 뿐 줄이지 못하므로, 확인을 기다릴 이유가 없다.
 * 3. 그 다음에야 모름을 본다. 하나라도 모르면 `expert`다 — 이 계산은
 *    아직 끝나지 않았다.
 * 4. 전부 알고 있을 때만 `expertRatio`·`checked`로 내려간다.
 *
 * 3번이 4번보다 먼저인 것이 이 함수의 핵심이다. 순서를 바꾸면 "모르는
 * 값이 0원인 셈 치고 낮은 비율이 나와 통과"하는, 정확히 낙관 방향의
 * 결함이 된다.
 */
export function calcEncumbrance(
  rules: RightsRules,
  answers: RightsAnswers,
  price: number | null,
): EncumbranceResult {
  const { sourceItemIds, expertRatio, stopRatio, messages } = rules.encumbrance;

  let knownTotal = 0;
  const unknownItemIds: string[] = [];

  for (const itemId of sourceItemIds) {
    const amount = amountFor(rules, answers, itemId);
    if (amount === null) unknownItemIds.push(itemId);
    else knownTotal += amount;
  }

  if (price === null || !Number.isFinite(price) || price <= 0) {
    return {
      verdict: "expert",
      knownTotal,
      unknownItemIds,
      ratio: null,
      price: null,
      message: messages.noPrice,
    };
  }

  const ratio = knownTotal / price;
  const base = { knownTotal, unknownItemIds, ratio, price };

  if (ratio >= stopRatio) {
    return { ...base, verdict: "stop", message: messages.stop };
  }
  if (unknownItemIds.length > 0) {
    return { ...base, verdict: "expert", message: messages.unknown };
  }
  if (ratio >= expertRatio) {
    return { ...base, verdict: "expert", message: messages.expert };
  }
  return { ...base, verdict: "checked", message: messages.checked };
}

/**
 * 한 항목이 합계에 넣을 금액(원). 알 수 없으면 `null`.
 *
 * `null`을 돌려주는 모든 경로가 "모른다"이지 "0원"이 아니다 — 아직 답하지
 * 않았거나, 룰셋에 없는 선택지이거나, 금액을 넣기로 해 놓고 비워 뒀거나,
 * 모름을 골랐거나, 값이 금액으로 성립하지 않는(음수·NaN) 경우다.
 */
function amountFor(
  rules: RightsRules,
  answers: RightsAnswers,
  itemId: string,
): number | null {
  const item = rules.items.find((candidate) => candidate.id === itemId);
  const answer = answers[itemId];
  if (item === undefined || answer === undefined) return null;

  const option = item.options.find(
    (candidate) => candidate.id === answer.optionId,
  );
  if (option === undefined) return null;

  return amountOf(option, answer);
}

/**
 * 고른 선택지와 답에서 합계에 넣을 금액(원)을 꺼낸다. 알 수 없으면 `null`.
 *
 * `assess.ts`도 이 함수를 쓴다 — 합계 계산은 빈 금액을 unknown으로 세는데
 * 항목 판정만 "확인했어요"로 남는 어긋남이 실제로 있었기 때문에, 두 쪽이
 * **같은 판단**을 쓰도록 여기 하나로 모았다. 각자 따로 판단하면 언젠가
 * 다시 어긋난다.
 */
export function amountOf(
  option: RightsOption,
  answer: RightsAnswer,
): number | null {
  if (option.amount === "zero") return 0;
  if (option.amount !== "input") return null;

  const won = answer.amountWon;
  if (won === null || !Number.isFinite(won) || won < 0) return null;
  return Math.round(won);
}
