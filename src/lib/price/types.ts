/**
 * 호가 위치 판정이 다루는 타입.
 *
 * 부모 스펙의 진단 네 축 중 "적정가격"이되, **적정가를 매기지 않는다.**
 * 특정 물건의 적정가를 숫자로 단정하면 감정평가법에 저촉될 위험이 있고,
 * 이 앱이 `medianPrice`를 `ComplexUnit` 타입에서부터 빼고 가격을
 * `minPrice ~ maxPrice` 범위로만 말해 온 것도 같은 이유다. 그래서 이
 * 모듈이 내는 것은 **점 추정이 아니라 위치**다 — 제시받은 호가가 그
 * 평형의 최근 6개월 실거래 범위의 어디에 있는가.
 *
 * 판정에 쓰이는 **값**(최소 거래 건수·임계값·문구)은 여기 없다 — 전부
 * `rules/price-2026-08.json`에 있다. 이 파일은 그 데이터의 모양만
 * 정한다. `src/lib/rights/types.ts`·`src/lib/purchase/types.ts`와 같은
 * 태도다.
 *
 * ## 이 모듈이 하지 않는 것 — 점 추정
 *
 * `(min + max) / 2`도, 중위값도, "추정 시세"도 만들지 않는다. 이
 * 파일의 어떤 타입에도 그런 필드가 없고, {@link PriceEvidence}가
 * 들고 있는 것은 관측된 `minPrice`·`maxPrice`·거래 건수뿐이다.
 * `price/assess.test.ts`가 번들 데이터 전 평형에 대해 산출물 어디에도
 * 중간값이 나오지 않는지 확인한다.
 */
import type { BuyerProfile, CostBreakdown, Rules, SafetyLevel } from "../finance";

/**
 * 줄 하나에 내리는 판정.
 *
 * - `stop`: 이대로 진행하면 안 된다. 근거를 듣기 전에 멈춰야 한다
 * - `expert`: 우리가 판단할 수 없다. 사람에게 물어야 한다
 * - `checked`: 이 줄에서는 걸리는 게 없었다
 * - `withheld`: **말하지 않기로 했다.** 표본이 판단을 받치지 못해서
 *   판정 자체를 유보한 것이고, "문제없다"가 아니다
 *
 * `withheld`가 `unknown`(구매 유형 모듈의 "아직 낼 수 없어요")과 다른
 * 이유: 저기서는 입력이 비어 있어 **계산이 불가능**했지만, 여기서는
 * 계산은 얼마든지 가능한데 그 결과를 믿을 수 없어 **말하지 않기로
 * 선택**한 것이다. 이 제품에서 가장 중요한 동작이라 이름을 따로 준다.
 *
 * `checked`는 개별 줄 전용이다. 전체 결론에는 {@link PriceOverall}만
 * 쓰며 그중 어느 값도 "안전"이나 "싸다"를 뜻하지 않는다.
 */
export type PriceVerdict = "stop" | "expert" | "checked" | "withheld";

/**
 * 이 화면 전체의 결론.
 *
 * `clear`조차 "이 계산이 확인한 범위에서는 걸리는 게 없었다"이지
 * "잘 샀다"·"적정하다"가 아니다. 라벨 문구는 룰셋(`overall`)에서 온다.
 */
export type PriceOverall = "stop" | "incomplete" | "withheld" | "expert" | "clear";

/** 판정 줄의 식별자 */
export type PriceFindingId = "position" | "budget";

/**
 * 호가가 놓인 자리.
 *
 * - `below`: 관측된 최저가보다 아래
 * - `within`: 관측 범위 안
 * - `aboveNear`: 최고가 위이지만 층 차이로 설명될 수 있는 폭
 * - `aboveFar`: 최고가보다 크게 위 (`position.aboveFarFrom` 이상)
 */
export type PriceBand = "below" | "within" | "aboveNear" | "aboveFar";

export const PRICE_BANDS: readonly PriceBand[] = [
  "below",
  "within",
  "aboveNear",
  "aboveFar",
];

export const PRICE_VERDICTS: readonly PriceVerdict[] = [
  "stop",
  "expert",
  "checked",
  "withheld",
];

export const PRICE_OVERALLS: readonly PriceOverall[] = [
  "stop",
  "incomplete",
  "withheld",
  "expert",
  "clear",
];

/* ─────────────────────────── 룰셋의 모양 ─────────────────────────── */

export interface PriceOverallCopy {
  label: string;
  note: string;
  /**
   * `incomplete`에서만 쓰는 조건부 덧말.
   *
   * 호가를 아직 안 넣었는데 **이 평형이 이미 표본 조건을 못 넘긴**
   * 경우에 붙는다. 그 사실이 회색 "아직 안 넣었어요" 뒤로 숨으면
   * 사용자는 호가만 넣으면 답이 나올 거라고 믿고 기다린다 — 그건
   * 우리가 줄 수 없는 답이다. 권리분석 룰셋의 `pendingExpertNote`와
   * 같은 자리·같은 이유다.
   */
  pendingWithheldNote?: string;
}

export interface AskingPriceCopy {
  label: string;
  hint: string;
}

/**
 * 판정을 낼 수 있는 표본인지 가르는 조건.
 *
 * **이 두 값이 이 기능의 심장이다.** 번들 데이터의 절반은 최근 6개월
 * 거래가 한 건뿐이고 51.7%는 범위가 아예 한 점이다. 그런 표본으로
 * "범위 위라서 비싸다"고 말하면 그냥 틀린다. 그래서 조건을 못 넘으면
 * 위치를 계산하고도 **말하지 않는다.**
 */
export interface PriceEvidenceRule {
  label: string;
  /** 최근 6개월 거래가 이 건수 미만이면 유보 */
  minTradeCount: number;
  /** (max − min) / max 가 이 값 미만이면 거래 건수와 무관하게 유보 */
  minRangeWidthRatio: number;
  messages: {
    /** 거래 건수가 모자랄 때 */
    tooFewTrades: string;
    /** 범위가 한 점일 때(min === max) */
    singlePoint: string;
    /** 한 점은 아니지만 너무 좁을 때 */
    narrowRange: string;
    /** 조건을 넘어 실제로 위치를 말할 때 */
    enough: string;
  };
}

export interface PriceBandRule {
  verdict: PriceVerdict;
  message: string;
}

export interface PricePositionRule {
  label: string;
  /** (호가 − max) / max 가 이 값 이상이면 `aboveFar` */
  aboveFarFrom: number;
  bands: Record<PriceBand, PriceBandRule>;
}

/** 예산 줄에서 상황별로 내리는 판정. 파서가 낙관 방향 조합을 막는다 */
export type PriceBudgetSituation =
  | "unaffordable"
  | "danger"
  | "caution"
  | "checked";

export interface PriceBudgetRule {
  label: string;
  verdicts: Record<PriceBudgetSituation, PriceVerdict>;
  messages: Record<PriceBudgetSituation, string>;
  /** 실거주 프로필이 없어 이 줄을 아예 만들지 않았을 때 대신 남기는 말 */
  absentNote: string;
}

/**
 * 판정과 **언제나 함께** 나가야 하는 문구들(룰셋에 적힌 원문).
 *
 * 유보든 통과든 예외가 없다. 층 관련 문구가 빠지면 우리가 틀린 확신을
 * 준다 — 같은 평형이라도 저층과 로열층은 값이 다른데, 화면은 그 차이를
 * 값으로 보정해 주지 않기 때문이다.
 *
 * 층 문구 넷은 **자리표시자를 품은 틀**이다. 실제 층수를 끼워 넣은
 * 결과가 {@link PriceDisclosureText}이고, 화면이 읽는 것은 그쪽이다.
 * 셋 중 어느 틀을 쓸지는 관측된 층 범위가 정한다(`assess.ts` 참고).
 */
export interface PriceDisclosure {
  /**
   * 층이 아니라 **향·수리 상태**에 대한 고지.
   *
   * 층은 이제 집계에 있지만 향과 수리 상태는 여전히 없다. 층이 생겼다고
   * 이 문장까지 지우면, 화면이 설명하지 못하는 남은 차이를 사용자가
   * 모르게 된다.
   */
  floorNote: string;
  /** 최저층 ≠ 최고층일 때. `{minFloor}`·`{maxFloor}`를 품는다 */
  floorRangeNote: string;
  /** 관측된 층이 한 층뿐일 때. `{floor}`를 품는다 */
  floorSameNote: string;
  /** 믿을 수 있는 층이 하나도 없을 때. 자리표시자가 없다 */
  floorUnknownNote: string;
  /** 일부 거래만 층을 모를 때 덧붙인다. `{unknownFloorCount}`를 품는다 */
  floorPartialUnknownNote: string;
  reportingLagNote: string;
  notAVerdictNote: string;
  noPointEstimateNote: string;
}

/**
 * 실제 층수를 끼워 넣은 뒤의 고지. 화면이 그대로 그린다.
 *
 * **여기 담긴 층수는 관측된 사실이지 보정 재료가 아니다.** 이 앱은
 * 층으로 값을 깎거나 올리지 않는다 — 그건 감정평가 영역이고, 이 앱이
 * `medianPrice`를 화면에서 뺀 것과 같은 이유로 하지 않는다. 층을
 * 내보내는 목적은 하나뿐이다: 사용자가 자기가 보는 매물의 층과
 * **스스로** 견주게 하는 것.
 */
export interface PriceDisclosureText {
  /** {@link PriceDisclosure.floorNote} 그대로 — 향·수리 상태 고지 */
  floorNote: string;
  /**
   * 이 범위를 만든 거래가 몇 층이었는지. **언제나 문장이 있다** —
   * 층을 모르면 "모른다"고 말하지 빈 문자열이 되지 않는다.
   */
  floorRangeNote: string;
  /**
   * 층을 모르는 거래가 **섞여** 있을 때만. 전부 모르거나 전부 알면 `null`
   * (전부 모르면 {@link floorRangeNote}가 이미 그 말을 한다).
   */
  floorPartialUnknownNote: string | null;
  reportingLagNote: string;
  notAVerdictNote: string;
  noPointEstimateNote: string;
}

export interface PriceRules {
  version: string;
  effectiveFrom: string;
  verdictLabels: Record<PriceVerdict, string>;
  overall: Record<PriceOverall, PriceOverallCopy>;
  askingPrice: AskingPriceCopy;
  evidence: PriceEvidenceRule;
  position: PricePositionRule;
  budget: PriceBudgetRule;
  disclosure: PriceDisclosure;
  disclaimer: string[];
}

/* ─────────────────────────── 입력 ─────────────────────────── */

/**
 * 판정의 근거가 되는 관측치. 그 평형에서 실제로 일어난 일이 전부다.
 *
 * **중간값이 없는 것이 이 타입의 요점이다.** `ComplexUnit`에도 없고
 * 여기에도 없으므로, 점 추정을 화면에 내려면 새 필드를 만들어야 하고
 * 그 순간 눈에 띈다.
 */
export interface PriceEvidence {
  /** 최근 6개월 거래 건수 */
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
  /**
   * 이 범위를 만든 거래들의 최저층. 믿을 수 있는 층이 하나도 없으면 `null`.
   *
   * **판정에 쓰이지 않는다.** 표본 조건(`evidenceGate`)도, 호가가 놓인
   * 자리(`bandOf`)도 이 값을 보지 않는다 — 층을 알게 됐다고 임계값이
   * 느슨해지거나 가격이 보정되지 않는다. 오직 고지 문장에만 들어간다.
   */
  minFloor: number | null;
  /** 같은 창의 최고층. 같은 조건에서 `null`, 같은 이유로 판정에 쓰이지 않는다 */
  maxFloor: number | null;
  /**
   * 그 창의 거래 중 층을 믿을 수 없었던 건수.
   *
   * 모르는 층을 0층·1층으로 채우지 않는 대신 몇 건이 그랬는지를 화면까지
   * 들고 간다 — 층을 모르는 거래가 섞여 있다는 사실이 드러나야 한다.
   */
  unknownFloorCount: number;
}

/**
 * 예산 줄을 낼 수 있는 입력.
 *
 * **`null`이면 예산 줄을 아예 만들지 않는다.** 실거주 프로필이 없을 때
 * (예산 미입력이거나 투자 유형일 때) 실거주 기준 숫자를 내면 안 된다 —
 * `src/App.tsx`의 `residentialProfile`이 같은 판단이다.
 */
export interface PriceBudgetInput {
  profile: BuyerProfile;
  /** 실거주 예산 룰셋(`rules/2026-08.json`) */
  financeRules: Rules;
}

/* ─────────────────────────── 결과 ─────────────────────────── */

export interface PriceFindingBase {
  label: string;
  verdict: PriceVerdict;
  /** 화면에 그대로 쓰는 등급 글자. 색이 아니라 이 글자가 등급을 말한다 */
  verdictLabel: string;
  message: string;
}

export interface PricePositionFinding extends PriceFindingBase {
  id: "position";
  /**
   * 호가가 놓인 자리. **유보했으면 `null`이다** — 계산은 할 수 있었지만
   * 말하지 않기로 한 자리라, 값을 남겨 두면 어디선가 새어 나간다.
   */
  band: PriceBand | null;
  /**
   * 호가가 관측 최고가를 넘은 비율((호가 − max) / max). 넘지 않았거나
   * 유보했으면 `null`. 이 값은 **초과분**이지 시세 추정이 아니다.
   */
  aboveMaxRatio: number | null;
}

export interface PriceBudgetFinding extends PriceFindingBase {
  id: "budget";
  situation: PriceBudgetSituation;
  /** 이 호가에서의 부대비용 */
  costs: CostBreakdown;
  /** 이 호가를 사려면 현금으로 내야 하는 총액(원) */
  ownFunds: number;
  /** 지금 이 매수에 쓸 수 있는 현금(원) */
  availableCash: number;
  /** 모자란 금액(원). 모자라지 않으면 0 */
  shortfall: number;
  /**
   * 이 호가를 사려면 실제로 빌려야 하는 금액(원).
   *
   * **살 수 없으면 `null`이다.** 한도를 넘겨 빌려야 하는 상황에서
   * "월 얼마"를 적으면, 받을 수 없는 대출의 상환액이 표에 박힌다 —
   * 표에 박힌 숫자는 옆의 설명보다 먼저 읽히고, 그 숫자는 "이만큼만
   * 내면 된다"로 읽힌다. 아래 셋도 같은 이유로 함께 비운다.
   */
  neededLoan: number | null;
  /** 그 대출에서의 월 상환액(원). 살 수 없으면 null */
  monthlyPayment: number | null;
  /** 세전 월 소득 대비 상환 부담률. 살 수 없으면 null */
  burdenRatio: number | null;
  /**
   * 예산 엔진이 낸 등급. 살 수 없으면 null.
   *
   * **화면에는 이 값이 나가지 않는다.** 예산 화면의 "안전" 배지와
   * 같은 글자를 여기 붙이면, 값에 대해 한 마디도 하지 않은 화면이
   * 그 매수를 안전하다고 말하는 것처럼 읽힌다. 화면에 나가는 것은
   * 이 값으로 고른 룰셋 문구뿐이다.
   */
  safetyLevel: SafetyLevel | null;
}

export type PriceFinding = PricePositionFinding | PriceBudgetFinding;

export interface PriceAssessment {
  overall: PriceOverall;
  overallLabel: string;
  overallNote: string;
  /** 제시받은 호가(원). 아직 안 넣었으면 null */
  askingPrice: number | null;
  evidence: PriceEvidence;
  evidenceLabel: string;
  /**
   * 표본에 대해 하는 말. 조건을 못 넘었으면 왜 못 넘었는지,
   * 넘었으면 무엇과 견줬는지.
   */
  evidenceMessage: string;
  /**
   * 위치를 말할 수 있는 표본인가.
   *
   * `false`면 어떤 호가를 넣어도 위치 판정은 `withheld`다 — 호가가
   * 아직 없을 때도 이 값은 정해져 있어서, 화면이 "넣어도 말하지 않을
   * 거예요"라고 미리 알려줄 수 있다.
   */
  evidenceSufficient: boolean;
  findings: PriceFinding[];
  /** 실거주 프로필이 없어 예산 줄을 만들지 않았을 때만. 아니면 null */
  budgetAbsentNote: string | null;
  /** 판정과 언제나 함께 나가는 문구들. 층수를 끼워 넣은 뒤의 문장이다 */
  disclosure: PriceDisclosureText;
  disclaimer: readonly string[];
}
