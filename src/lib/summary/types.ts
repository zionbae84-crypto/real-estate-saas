/**
 * 진단 종합이 다루는 타입.
 *
 * 권리분석·구매 유형별 금융·호가 위치·입지 사실, 네 축이 각각 판정을
 * 이미 냈다. 이 모듈은 그 네 값을 **다시 계산하지 않고 그대로 읽어서**
 * 한자리에 모을 뿐이다 — `src/lib/rights/types.ts`·
 * `src/lib/purchase/types.ts`·`src/lib/price/types.ts`·
 * `src/lib/location/types.ts`와 같은 태도이되, 여기는 판정을 새로 내는
 * 자리가 아니라 **이미 나온 판정을 어떻게 나란히 읽을지**를 정하는
 * 자리라는 점이 다르다.
 *
 * ## 이 파일이 하지 않는 것 — 점수·등급·순위
 *
 * 네 축의 판정을 숫자 하나로 뭉치지 않는다. 헤드라인은 "가장 급한
 * 축이 무엇을 말하는가"를 고르는 것이지 평균이나 합계가 아니고,
 * {@link DiagnosisSummary.axes}는 각 축의 판정을 원래 값 그대로 나란히
 * 늘어놓을 뿐이다.
 *
 * ## 입지 축을 판정 척도에 넣지 않는다
 *
 * `src/lib/location/types.ts`가 이미 밝혔듯, 입지 축은 좋다·나쁘다를
 * 판정하지 않는다 — `state: "unlocated" | "located"`뿐이다. 그래서
 * {@link SummaryAxisStatus}에서 입지가 쓰는 값(`"unlocated"`·`"located"`)은
 * 나머지 세 축이 공유하는 판정 값(`"stop"`·`"incomplete"`·`"expert"`·
 * `"clear"`, 호가만 더 갖는 `"withheld"`)과 **완전히 분리된 갈래**다.
 * `located`를 `clear`로 바꿔치기하면 "입지 확인 통과"라는 없는 판정을
 * 만들어 내는 것이라, 이 파일 어디에도 그런 변환이 없다 — 헤드라인
 * 계산({@link SummaryHeadline})도 판정 세 축(권리·구매·호가)의 값만
 * 보고, 입지는 참여하지 않는다.
 *
 * ## `notLooked` — 이 파일의 요점
 *
 * 네 축은 화면에 동시에 다 있지 않다. 구매 유형별 금융은 실거주에서는
 * 아예 계산되지 않고(`src/lib/purchase/types.ts`), 호가·입지는 실거주
 * 매수에서 평형을 고르기 전에는 계산되지 않는다(`src/App.tsx`의
 * `residentialProfile` 참고). **빠진 축을 목록에서 빼면 "문제없음"으로
 * 읽힌다.** 그래서 {@link DiagnosisSummary.axes}는 항상 네 줄이고, 보지
 * 못한 축은 `status: "notLooked"`로 남는다 — 사라지지 않는다.
 */
import type { PriceAssessment, PriceOverall } from "../price";
import type { PurchaseAssessment, PurchaseOverall } from "../purchase";
import type { LocationAssessment } from "../location";

/**
 * 권리분석 문진(등기부등본 문진)은 이 앱에서 제거됐다 — 별도 도구로
 * 나중에 다시 만든다. `App.tsx`는 이제 항상 `rights={null}`만 넘긴다.
 *
 * 그런데도 이 타입이 남아 있는 이유: 진단 종합은 네 축을 나란히
 * 다루는 자리이고, 이 파일의 조합 검사(모든 축 상태 조합에서 안전·
 * 등급 주장이 나오지 않는지)가 rights를 다른 세 축과 같은 모양으로
 * 계속 취급한다. 원래 `src/lib/rights/assess.ts`가 정의하던
 * `RightsAssessment`의 전체 모양(문항별 판정·특약 비율 등) 중 이
 * 모듈이 실제로 읽는 세 필드만 남긴 최소 형태다.
 */
export type RightsOverall = "stop" | "incomplete" | "expert" | "clear";

export interface RightsAssessment {
  overall: RightsOverall;
  overallLabel: string;
  overallNote: string;
}

/** 네 축의 식별자. 화면에 나오는 순서와 같다(위험이 무거운 순서, 룰셋 참고) */
export type SummaryAxisId = "rights" | "purchase" | "price" | "location";

export const SUMMARY_AXIS_IDS: readonly SummaryAxisId[] = [
  "rights",
  "purchase",
  "price",
  "location",
];

/**
 * 한 축의 줄에 실리는 상태.
 *
 * - `notLooked`: 이 진단이 이 축을 아예 보지 않았다. 다른 어떤 값도
 *   아니고, "문제없다"와 절대 같은 뜻이 아니다.
 * - `stop`·`incomplete`·`expert`·`clear`·`withheld`: 권리·구매·호가
 *   세 축이 이미 낸 값을 그대로 옮긴 것. 이 파일이 새로 정의하지 않는다.
 * - `unlocated`·`located`: 입지 축이 이미 낸 상태를 그대로 옮긴 것.
 *   판정이 아니라 "좌표를 아는가"라는 사실이다.
 */
export type SummaryAxisStatus =
  | "notLooked"
  | RightsOverall
  | PurchaseOverall
  | PriceOverall
  | LocationAssessment["state"];

/**
 * 헤드라인이 설 수 있는 값.
 *
 * 판정을 내는 세 축(권리·구매·호가)의 `overall`만 참여한다 — 입지는
 * 판정이 아니므로 참여하지 않는다. `incomplete`와 `withheld`를
 * `unresolved` 한 갈래로 묶는 이유는 둘 다 "아직 모른다"이지 "괜찮다"가
 * 아니라는 점에서 같기 때문이다(부모 스펙 4번 규칙). 어느 축에서 왔는지는
 * {@link DiagnosisSummary.axes}가 원래 값 그대로 보여 준다 — 이 헤드라인은
 * 그 값을 뭉갠 게 아니라 "지금 가장 먼저 읽어야 할 말이 무엇인가"만
 * 고른 것이다.
 *
 * 우선순위(`stop` > `unresolved` > `expert` > `clear`)와 그 이유는
 * `assess.ts`의 `decideHeadline` 문서와 `rules/summary-2026-08.json`의
 * `_headlinePriorityNote`에 있다.
 */
export type SummaryHeadline = "stop" | "unresolved" | "expert" | "clear";

/* ─────────────────────────── 룰셋의 모양 ─────────────────────────── */

export interface SummaryAxisCopy {
  /** 화면에 쓰는 축 이름 */
  label: string;
}

export interface SummaryNotLookedCopy {
  /** 상태를 나타내는 짧은 글자 */
  label: string;
  /** 왜 못 봤는지, 그것이 "문제없다"가 아니라는 사실 */
  note: string;
}

export interface SummaryHeadlineCopy {
  label: string;
  note: string;
}

export interface SummaryRules {
  version: string;
  effectiveFrom: string;
  /** 화면 제목 */
  title: string;
  axes: Record<SummaryAxisId, SummaryAxisCopy>;
  notLooked: Record<SummaryAxisId, SummaryNotLookedCopy>;
  headline: Record<SummaryHeadline, SummaryHeadlineCopy>;
  /**
   * 헤드라인이 `expert`가 아닌데 세 판정 축(권리·구매·호가) 중
   * 하나라도 `expert`가 있으면 헤드라인 note 뒤에 덧붙이는 문장.
   *
   * `src/lib/rights/assess.ts`의 `pendingExpertNote`와 같은 자리·같은
   * 이유다 — 미완성 하나가 헤드라인을 차지하면서 이미 걸린 전문가 확인
   * 필요 항목을 회색 문구 뒤로 숨기면 실제보다 덜 위험해 보인다.
   */
  expertPendingNote: string;
  /**
   * 권리분석의 대상(사용자가 답한 등기부)과 호가·입지의 대상(목록에서
   * 고른 평형)이 같은 집이라는 보장이 없다는 사실. 항상 함께 나간다 —
   * 이 종합이 서로 다른 대상을 한 집인 것처럼 말하지 않기 위해서다.
   */
  targetMismatchNote: string;
  disclaimer: string[];
}

/* ─────────────────────────── 입력 ─────────────────────────── */

/**
 * 네 축 엔진이 이미 낸 결과. `null`은 "이 진단이 이 축을 보지 않았다"다.
 *
 * 이 타입에 새로 계산하는 필드는 없다 — 전부 각 엔진의 `*Assessment`
 * 타입을 그대로 받는다.
 */
export interface DiagnosisSummaryInput {
  rights: RightsAssessment | null;
  purchase: PurchaseAssessment | null;
  price: PriceAssessment | null;
  location: LocationAssessment | null;
}

/* ─────────────────────────── 결과 ─────────────────────────── */

export interface SummaryAxisLine {
  id: SummaryAxisId;
  /** 화면에 쓰는 축 이름 */
  axisLabel: string;
  status: SummaryAxisStatus;
  /** 화면에 그대로 쓰는 상태 글자. 색이 아니라 이 글자가 상태를 말한다 */
  statusLabel: string;
  /** 이 상태에 대한 한 줄. `notLooked`면 왜 못 봤는지, 아니면 그 축이 이미 낸 설명 */
  note: string;
}

export interface DiagnosisSummary {
  headline: SummaryHeadline;
  headlineLabel: string;
  /**
   * 헤드라인에 대한 설명. 세 판정 축 중 `expert`가 있는데 헤드라인이
   * `expert`가 아니면 {@link SummaryRules.expertPendingNote}가 뒤에
   * 붙는다.
   */
  headlineNote: string;
  /** 항상 네 줄, 항상 같은 순서(rights·purchase·price·location) */
  axes: readonly SummaryAxisLine[];
  targetMismatchNote: string;
  disclaimer: readonly string[];
}
