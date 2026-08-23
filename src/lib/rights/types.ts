/**
 * 권리분석 문진이 다루는 타입.
 *
 * 판정에 쓰이는 **값**(어떤 신호가 어느 등급인지, 임계값이 얼마인지)은
 * 여기 없다 — 전부 `rules/rights-2026-08.json`에 있다. 이 파일은 그
 * 데이터의 모양만 정한다.
 */

/**
 * 개별 항목 하나에 대해 말할 수 있는 것의 전부.
 *
 * - `stop`: 이 신호가 있으면 거래를 멈춰야 한다
 * - `expert`: 우리가 판단할 수 없다. 법무사·변호사가 봐야 한다
 * - `checked`: 이 항목에서는 걸리는 게 없었다
 *
 * **`checked`는 개별 항목 전용이다.** 전체 결론에는 {@link RightsOverall}만
 * 쓰며, 그중 어느 값도 "안전"을 뜻하지 않는다.
 */
export type RightsVerdict = "stop" | "expert" | "checked";

/**
 * 문진 전체의 결론.
 *
 * `clear`조차 "걸리는 게 없었다"이지 "안전하다"가 아니다. 라벨 문구는
 * 룰셋(`overall`)에서 온다.
 */
export type RightsOverall = "stop" | "incomplete" | "expert" | "clear";

/** 이 항목이 문서의 어느 축에서 오는가 */
export type RightsSection = "표제부" | "갑구" | "을구" | "등기부 밖";

/**
 * 선택지가 금액과 어떻게 이어지는가.
 *
 * - `zero`: 이 선택지는 "그런 권리가 없다"는 뜻이라 합계에 0원이 들어간다
 * - `input`: 사용자가 금액을 직접 넣는다
 * - `unknown`: 금액을 알 수 없다. **0원이 아니다** — 합계에서 빠지고
 *   계산 자체가 "확인 필요"가 된다
 */
export type RightsAmountRole = "zero" | "input" | "unknown";

export interface RightsOption {
  id: string;
  label: string;
  verdict: RightsVerdict;
  /** 왜 그 판정인지 한 줄. 없으면 라벨만으로 충분한 항목이다 */
  note?: string;
  /** 금액을 다루는 항목에서만 있다 */
  amount?: RightsAmountRole;
  /**
   * 이 선택지가 "모르겠어요"인가.
   *
   * 룰셋 검증이 이 표시를 보고 **모든 항목에 모름 선택지가 하나 이상
   * 있고, 그것이 절대 `checked`가 아니다**를 강제한다. 모름을 통과로
   * 처리하는 것이 이 제품에서 가장 하면 안 되는 일이다.
   */
  unknown?: boolean;
}

export interface RightsItem {
  id: string;
  section: RightsSection;
  /** 사용자에게 묻는 말 */
  question: string;
  /** 문서의 어디를 보라는 안내. 처음 보는 사람은 이게 없으면 답할 수 없다 */
  where: string;
  /** 왜 위험한가 */
  why: string;
  /**
   * 금액 입력란에 붙일 이름(예: "채권최고액 합계").
   *
   * `amount: "input"` 선택지가 있는 항목에는 **반드시** 있어야 한다 —
   * 없으면 입력란이 무슨 금액을 묻는지 화면에서 사라진다. 룰셋 검증이
   * 이 짝을 강제한다.
   */
  amountLabel?: string;
  options: RightsOption[];
}

export interface RightsOverallCopy {
  label: string;
  note: string;
  /**
   * `incomplete`에서만 쓰는 조건부 덧말.
   *
   * 미답 항목이 남아 있으면 결론은 `incomplete`가 되는데, 그 문구만으로는
   * **이미 전문가 확인이 필요한 항목이 있다는 사실이 통째로 가려진다** —
   * 회색 "아직 다 답하지 않았어요"가 실제보다 덜 위험해 보인다. 그래서
   * expert 항목이 하나라도 있으면 이 문장을 note 뒤에 덧붙인다.
   *
   * 우선순위 자체는 바꾸지 않는다. 먼저 채우라고 말하는 것이 여전히
   * 맞는 안내이고, 어느 쪽이든 `clear`가 아니라는 결론은 같다.
   */
  pendingExpertNote?: string;
}

/**
 * 금액이 필요한 선택지인데 금액이 비어 있을 때 그 **항목**에 내리는 판정.
 *
 * 합계 계산은 이미 그 금액을 unknown으로 세지만, 항목 줄이 "확인했어요"로
 * 남으면 인쇄물에서 그 줄만 본 사람은 확인이 끝난 것으로 읽는다. 판정을
 * 코드가 아니라 여기서 정하는 이유는 나머지 판정과 같다 — 등급은 전부
 * 룰셋에서 온다. `checked`는 허용하지 않는다(룰셋 검증이 막는다).
 */
export interface RightsAmountMissingRule {
  verdict: RightsVerdict;
  note: string;
}

export interface RightsEncumbranceRule {
  /** 화면에서 매매가를 부르는 이름 */
  priceLabel: string;
  /** 합계에 들어가는 항목 id들. 코드가 아니라 데이터가 정한다 */
  sourceItemIds: string[];
  /** 이 비율 이상이면 "전문가 확인이 꼭 필요해요" */
  expertRatio: number;
  /** 이 비율 이상이면 "사면 안 돼요" */
  stopRatio: number;
  messages: {
    /**
     * 비율을 낼 수 없을 때 화면의 '몫' 자리에 대신 넣는 글자.
     *
     * 모르는 금액이 하나라도 있으면 `knownTotal / price`는 실제 몫이
     * 아니라 **아래쪽 경계**일 뿐이다. 그 숫자를 그대로 띄우면(전부
     * 모를 때는 "0.0%"가 된다) 표에 박힌 숫자가 옆의 경고문보다 먼저
     * 읽힌다.
     */
    ratioUnknown: string;
    noPrice: string;
    unknown: string;
    stop: string;
    expert: string;
    checked: string;
  };
}

export interface RightsRules {
  version: string;
  effectiveFrom: string;
  verdictLabels: Record<RightsVerdict, string>;
  /** 아직 답하지 않은 항목에 붙이는 말 */
  unansweredLabel: string;
  overall: Record<RightsOverall, RightsOverallCopy>;
  /** 금액이 필요한데 비어 있는 항목에 내리는 판정 */
  amountMissing: RightsAmountMissingRule;
  /** 결과와 늘 함께 보여야 하는 문구(법률 자문 아님·재확인) */
  disclaimer: string[];
  encumbrance: RightsEncumbranceRule;
  items: RightsItem[];
}

/**
 * 한 항목에 대한 사용자의 답.
 *
 * `amountWon`이 `null`인 것은 **0원이 아니라 "모른다"**이다. 이 구분이
 * 사라지면 위험이 통째로 사라진다.
 */
export interface RightsAnswer {
  optionId: string;
  amountWon: number | null;
}

/** 항목 id → 답. 없는 키는 아직 답하지 않은 항목이다 */
export type RightsAnswers = Readonly<Record<string, RightsAnswer | undefined>>;
