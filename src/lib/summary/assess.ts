import type { PriceOverall } from "../price";
import type { PurchaseOverall } from "../purchase";
import type { RightsOverall } from "../rights";
import type {
  DiagnosisSummary,
  DiagnosisSummaryInput,
  SummaryAxisLine,
  SummaryHeadline,
  SummaryRules,
} from "./types";

/**
 * 판정 세 축(권리·구매·호가)이 공유하는 overall 값 하나를 헤드라인
 * 갈래로 접는다.
 *
 * `incomplete`와 `withheld`를 같은 갈래(`unresolved`)로 묶는다 — 둘 다
 * "아직 모른다"이고 "괜찮다"가 아니라는 점에서 같다(부모 스펙 4번
 * 규칙). 어느 쪽이었는지는 이 함수가 지우지 않는다 —
 * {@link SummaryAxisLine.status}가 원래 값(`incomplete` 또는
 * `withheld`)을 그대로 들고 있다. 이 함수는 오직 "지금 가장 먼저
 * 읽어야 할 말이 무엇인가"를 고르기 위한 헤드라인 계산에만 쓰인다.
 */
function headlineTierOf(
  overall: RightsOverall | PurchaseOverall | PriceOverall,
): SummaryHeadline {
  switch (overall) {
    case "stop":
      return "stop";
    case "incomplete":
    case "withheld":
      return "unresolved";
    case "expert":
      return "expert";
    case "clear":
      return "clear";
  }
}

/** 헤드라인 갈래 사이의 순서. 낮을수록 급하다 */
const HEADLINE_RANK: Record<SummaryHeadline, number> = {
  stop: 0,
  unresolved: 1,
  expert: 2,
  clear: 3,
};

/**
 * 지금 화면에 있는 판정 세 축(권리·구매·호가)의 overall을 모은다.
 * 보지 않은 축(`null`)은 헤드라인 계산에 참여하지 않는다 — 헤드라인은
 * "본 것 중 가장 급한 말"이지, 못 본 것까지 판정에 넣을 수는 없다.
 * 못 봤다는 사실 자체는 {@link buildDiagnosisSummary}의 `axes` 줄이
 * 따로 말한다.
 */
function judgeableOveralls(
  input: DiagnosisSummaryInput,
): Array<RightsOverall | PurchaseOverall | PriceOverall> {
  const overalls: Array<RightsOverall | PurchaseOverall | PriceOverall> = [];
  if (input.rights !== null) overalls.push(input.rights.overall);
  if (input.purchase !== null) overalls.push(input.purchase.overall);
  if (input.price !== null) overalls.push(input.price.overall);
  return overalls;
}

/**
 * 헤드라인을 고른다.
 *
 * 우선순위는 `stop > unresolved > expert > clear`다. 이유는
 * `rules/summary-2026-08.json`의 `headline._headlinePriorityNote`에
 * 있다 — 요약하면 (1) stop은 다른 축이 아무리 깨끗해도 상쇄되지 않고
 * (권리는 평균 내는 것이 아니다, `rights/assess.ts`와 같은 원칙),
 * (2) 미완성·유보(`unresolved`)를 건너뛰고 결론으로 가면 "아직
 * 모른다"가 "괜찮다"로 접히고, (3) 우리가 판단 못 하는 신호(`expert`)가
 * 남아 있으면 "걸리는 게 없었다"(`clear`)고 부를 수 없다.
 *
 * 판정 가능한 축이 하나도 없으면(이론상으로만 — 권리분석 문진은 항상
 * 렌더되므로 실제로는 일어나지 않는다) `unresolved`로 방어적으로
 * 내린다. 확인한 것이 하나도 없는 상태를 `clear`로 부르는 것이 이
 * 함수가 낼 수 있는 가장 위험한 오답이기 때문이다.
 */
function decideHeadline(input: DiagnosisSummaryInput): SummaryHeadline {
  const overalls = judgeableOveralls(input);
  if (overalls.length === 0) return "unresolved";

  let worst: SummaryHeadline = "clear";
  for (const overall of overalls) {
    const tier = headlineTierOf(overall);
    if (HEADLINE_RANK[tier] < HEADLINE_RANK[worst]) worst = tier;
  }
  return worst;
}

/**
 * 헤드라인이 `expert`가 아닌데 판정 세 축 중 하나라도 `expert`가
 * 있는가.
 *
 * 있으면 {@link SummaryRules.expertPendingNote}를 헤드라인 note 뒤에
 * 덧붙인다. `src/lib/rights/assess.ts`의 `overallNoteFor`와 같은 이유 —
 * 미완성 하나가 헤드라인을 차지하면서 이미 걸린 전문가 확인 필요
 * 사실을 회색 문구 뒤로 숨기면 실제보다 덜 위험해 보인다. 이 저장소가
 * 한 번 겪은 문제다.
 */
function hasUnreportedExpert(
  input: DiagnosisSummaryInput,
  headline: SummaryHeadline,
): boolean {
  if (headline === "expert") return false;
  return judgeableOveralls(input).some((overall) => overall === "expert");
}

function rightsLine(
  rules: SummaryRules,
  rights: DiagnosisSummaryInput["rights"],
): SummaryAxisLine {
  const axisLabel = rules.axes.rights.label;
  if (rights === null) {
    const copy = rules.notLooked.rights;
    return { id: "rights", axisLabel, status: "notLooked", statusLabel: copy.label, note: copy.note };
  }
  return {
    id: "rights",
    axisLabel,
    status: rights.overall,
    statusLabel: rights.overallLabel,
    note: rights.overallNote,
  };
}

function purchaseLine(
  rules: SummaryRules,
  purchase: DiagnosisSummaryInput["purchase"],
): SummaryAxisLine {
  const axisLabel = rules.axes.purchase.label;
  if (purchase === null) {
    const copy = rules.notLooked.purchase;
    return { id: "purchase", axisLabel, status: "notLooked", statusLabel: copy.label, note: copy.note };
  }
  return {
    id: "purchase",
    axisLabel,
    status: purchase.overall,
    statusLabel: purchase.overallLabel,
    note: purchase.overallNote,
  };
}

function priceLine(
  rules: SummaryRules,
  price: DiagnosisSummaryInput["price"],
): SummaryAxisLine {
  const axisLabel = rules.axes.price.label;
  if (price === null) {
    const copy = rules.notLooked.price;
    return { id: "price", axisLabel, status: "notLooked", statusLabel: copy.label, note: copy.note };
  }
  return {
    id: "price",
    axisLabel,
    status: price.overall,
    statusLabel: price.overallLabel,
    note: price.overallNote,
  };
}

function locationLine(
  rules: SummaryRules,
  location: DiagnosisSummaryInput["location"],
): SummaryAxisLine {
  const axisLabel = rules.axes.location.label;
  if (location === null) {
    const copy = rules.notLooked.location;
    return { id: "location", axisLabel, status: "notLooked", statusLabel: copy.label, note: copy.note };
  }
  return {
    id: "location",
    axisLabel,
    // 입지는 판정이 아니라 상태(state)다 — clear·stop 같은 값으로
    // 바꿔치기하지 않는다(이 파일 상단 문서, types.ts 문서 참고).
    status: location.state,
    statusLabel: location.stateLabel,
    note: location.stateNote,
  };
}

/**
 * 네 축이 이미 낸 판정을 한자리에 모은다.
 *
 * **여기서 새로 판정하지 않는다.** 각 줄은 해당 엔진의 `overall`
 * (입지는 `state`)과 그 라벨·설명을 그대로 옮길 뿐이다 — 복제해서
 * 다시 계산하면 이 파일과 각 엔진이 언젠가 어긋난다.
 *
 * `axes`는 **항상 네 줄**이고, 항상 같은 순서(권리·구매·호가·입지 —
 * 이 제품의 방침 "사지 말아야 할 때를 말해주는 것"에서 무게가 무거운
 * 순서, `ComplexDetail.tsx`의 배치 이유와 같다)다. 보지 않은 축은
 * 목록에서 빠지는 대신 `status: "notLooked"`로 남는다.
 */
export function buildDiagnosisSummary(
  rules: SummaryRules,
  input: DiagnosisSummaryInput,
): DiagnosisSummary {
  const axes: SummaryAxisLine[] = [
    rightsLine(rules, input.rights),
    purchaseLine(rules, input.purchase),
    priceLine(rules, input.price),
    locationLine(rules, input.location),
  ];

  const headline = decideHeadline(input);
  const copy = rules.headline[headline];
  const headlineNote = hasUnreportedExpert(input, headline)
    ? `${copy.note} ${rules.expertPendingNote}`
    : copy.note;

  return {
    headline,
    headlineLabel: copy.label,
    headlineNote,
    axes,
    targetMismatchNote: rules.targetMismatchNote,
    disclaimer: rules.disclaimer,
  };
}
