import {
  calcAcquisitionCosts,
  calcAvailableCash,
  calcBurdenAt,
  ownFundsRequired,
} from "../finance";
import type {
  PriceAssessment,
  PriceBand,
  PriceBudgetFinding,
  PriceBudgetInput,
  PriceBudgetSituation,
  PriceDisclosureText,
  PriceEvidence,
  PriceFinding,
  PriceOverall,
  PricePositionFinding,
  PriceRules,
  PriceVerdict,
} from "./types";

/** 표본이 위치 판정을 받칠 수 있는가, 못 받치면 왜 못 받치는가 */
type EvidenceGate =
  | { sufficient: true; message: string }
  | { sufficient: false; message: string };

/**
 * 제시받은 호가가 그 평형의 최근 1년 실거래 범위 어디에 있는지 말한다.
 *
 * **이 함수의 가장 중요한 동작은 말하지 않는 것이다.**
 *
 * 번들 데이터(1,692개 평형)의 절반은 최근 1년 거래가 한 건뿐이고,
 * 51.7%는 범위가 아예 한 점(min === max)이다. 그런 표본으로 "호가가
 * 범위 위쪽이니 비싸요"라고 말하면 그냥 틀린다 — 그 한 건이 특수관계인
 * 거래일 수도, 저층일 수도 있다. 그래서 룰셋의 두 조건
 * (`evidence.minTradeCount`·`evidence.minRangeWidthRatio`)을 못 넘으면
 * 위치를 **계산하고도 말하지 않고**, 왜 유보하는지를 대신 말한다.
 * 실제 룰셋 값에서는 1,468개(86.8%)가 여기서 멈춘다.
 *
 * **적정가를 내지 않는다.** 이 파일에 `(min + max) / 2`도, 중위값도,
 * "추정 시세"도 없다. 특정 물건의 적정가를 숫자로 단정하면 감정평가법에
 * 저촉될 위험이 있고, 이 앱이 `medianPrice`를 타입에서부터 빼 온 것도
 * 같은 이유다. 내는 것은 관측된 `minPrice`·`maxPrice`와, 호가가 그
 * 위로 얼마나 벗어났는지의 **초과분**뿐이다.
 *
 * **층으로 값을 보정하지 않는다.** 집계가 층 범위(`minFloor`·`maxFloor`)를
 * 함께 내보내게 됐지만, 그건 고지 문장에만 들어간다 — 표본 조건
 * (`evidenceGate`)도, 호가가 놓인 자리(`bandOf`)도, 초과분도 층을 보지
 * 않는다. 층별 가격 모델을 만들거나 "이 층이면 얼마쯤"을 계산하면 그건
 * 감정평가이고, `medianPrice`를 화면에서 뺀 것과 같은 이유로 하지 않는다.
 * 층을 아는 것과 층을 반영해 값을 매기는 것은 다른 일이고, 우리가 하는
 * 것은 앞의 것뿐이다 — 사용자가 자기가 보는 매물의 층과 **스스로**
 * 견주도록. `scripts/price-guard.test.ts`가 그 경로가 소스에 없는지
 * 구조로 확인한다.
 *
 * 이 함수가 낼 수 있는 가장 좋은 결론은 `clear`이고, 그것은 "안전하다"도
 * "싸다"도 아니라 **"이 계산이 확인한 범위에서는 걸리는 게 없었다"**이다.
 * 문구는 전부 룰셋(`rules/price-2026-08.json`)에서 오고, 이 파일에는
 * 사용자에게 보일 문자열이 하나도 없다.
 *
 * 결론을 고르는 순서에 담긴 판단:
 *
 * 1. `stop`이 하나라도 있으면 `stop`이다. 다른 줄이 아무리 깨끗해도
 *    상쇄되지 않는다.
 * 2. 호가를 아직 안 넣었으면 `incomplete`다. **빈칸은 통과가 아니다.**
 *    이때 표본이 이미 모자라면 그 사실을 덧말로 미리 말한다 — 그렇지
 *    않으면 사용자는 호가만 넣으면 답이 나올 거라고 믿고 기다린다.
 * 3. 유보한 줄이 있으면 `withheld`다. **유보는 통과가 아니다.**
 * 4. `expert`가 하나라도 있으면 `expert`다.
 * 5. 그 밖에만 `clear`다.
 *
 * ## 예산 줄
 *
 * `budget`이 `null`이면 예산 줄을 **만들지 않는다.** 실거주 프로필이
 * 없을 때(예산 미입력이거나 투자 유형일 때) 실거주 기준 숫자를 내면
 * 안 되기 때문이다 — `src/App.tsx`의 `residentialProfile`과 같은
 * 판단이다. 있을 때는 기존 예산 엔진(`calcBurdenAt`·
 * `calcAcquisitionCosts`·`ownFundsRequired`)을 **그대로 재사용하고
 * 고치지 않는다.**
 */
export function assessPrice(
  rules: PriceRules,
  evidence: PriceEvidence,
  askingPrice: number | null,
  budget: PriceBudgetInput | null,
): PriceAssessment {
  const gate = evidenceGate(rules, evidence);

  const findings: PriceFinding[] =
    askingPrice === null
      ? []
      : [
          positionFinding(rules, evidence, askingPrice, gate),
          ...(budget === null ? [] : [budgetFinding(rules, budget, askingPrice)]),
        ];

  const overall = decideOverall(findings, askingPrice);
  const copy = rules.overall[overall];

  return {
    overall,
    overallLabel: copy.label,
    overallNote:
      overall === "incomplete" &&
      !gate.sufficient &&
      copy.pendingWithheldNote !== undefined
        ? `${copy.note} ${copy.pendingWithheldNote}`
        : copy.note,
    askingPrice,
    evidence,
    evidenceLabel: rules.evidence.label,
    evidenceMessage: gate.message,
    evidenceSufficient: gate.sufficient,
    findings,
    budgetAbsentNote: budget === null ? rules.budget.absentNote : null,
    disclosure: resolveDisclosure(rules, evidence),
    disclaimer: rules.disclaimer,
  };
}

/**
 * 룰셋의 틀에 실제 층수를 끼워 넣는다. 문장 자체는 한 글자도 여기서
 * 만들지 않는다 — 이 파일에 사용자에게 보일 문자열이 없다는 규칙은 그대로다.
 */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

/**
 * 판정과 언제나 함께 나가는 고지를 짓는다.
 *
 * 층 문장은 **세 갈래 중 하나가 반드시 나간다.** 층을 모르면 그 자리를
 * 비우는 대신 "모른다"고 말한다 — 빈 자리는 "층은 문제없다"로 읽힌다.
 *
 * **여기서 층으로 값을 계산하지 않는다.** 층수는 문자열로 바뀌어 문장에
 * 들어갈 뿐이고, 가격·밴드·표본 조건 어느 쪽도 이 값을 보지 않는다.
 * 층별 가격 모델을 만드는 순간 그건 감정평가이고, 이 앱이 `medianPrice`를
 * 화면에서 뺀 것과 같은 이유로 하지 않는다.
 */
function resolveDisclosure(
  rules: PriceRules,
  evidence: PriceEvidence,
): PriceDisclosureText {
  const d = rules.disclosure;
  const { minFloor, maxFloor, unknownFloorCount } = evidence;

  const known = minFloor !== null && maxFloor !== null;
  const floorRangeNote = !known
    ? d.floorUnknownNote
    : minFloor === maxFloor
      ? fill(d.floorSameNote, { floor: String(minFloor) })
      : fill(d.floorRangeNote, {
          minFloor: String(minFloor),
          maxFloor: String(maxFloor),
        });

  // 전부 모르면 위 문장이 이미 그 말을 했다. 덧붙이면 같은 사실을 두 번
  // 읽히게 하면서 "일부만 모른다"로 오히려 약하게 들린다.
  const partial =
    known && unknownFloorCount > 0
      ? fill(d.floorPartialUnknownNote, {
          unknownFloorCount: String(unknownFloorCount),
        })
      : null;

  return {
    floorNote: d.floorNote,
    floorRangeNote,
    floorPartialUnknownNote: partial,
    reportingLagNote: d.reportingLagNote,
    notAVerdictNote: d.notAVerdictNote,
    noPointEstimateNote: d.noPointEstimateNote,
  };
}

/**
 * 이 평형의 표본이 위치 판정을 받칠 수 있는가.
 *
 * **호가와 무관하게 정해진다.** 그래서 호가를 넣기 전에도 "넣어도
 * 말하지 않을 거예요"라고 미리 알려줄 수 있다.
 *
 * 순서에 담긴 판단: 거래 건수를 먼저 본다. 건수가 모자라면 범위 폭이
 * 넓든 좁든 그 폭 자체가 우연이므로, 폭에 대해 말하는 것보다 건수에
 * 대해 말하는 것이 사용자에게 더 정확한 이유다.
 *
 * `minPrice`가 `maxPrice`보다 크거나 `maxPrice`가 0 이하인 데이터는
 * 이 파이프라인에서 나오지 않지만, 나오더라도 **폭을 잴 수 없으므로
 * 유보한다** — 모르는 값을 통과로 처리하지 않는다.
 */
function evidenceGate(rules: PriceRules, evidence: PriceEvidence): EvidenceGate {
  const messages = rules.evidence.messages;

  if (evidence.tradeCount < rules.evidence.minTradeCount) {
    return { sufficient: false, message: messages.tooFewTrades };
  }
  if (evidence.minPrice === evidence.maxPrice) {
    return { sufficient: false, message: messages.singlePoint };
  }
  if (evidence.maxPrice <= 0 || evidence.minPrice > evidence.maxPrice) {
    return { sufficient: false, message: messages.narrowRange };
  }

  const width = (evidence.maxPrice - evidence.minPrice) / evidence.maxPrice;
  if (width < rules.evidence.minRangeWidthRatio) {
    return { sufficient: false, message: messages.narrowRange };
  }
  return { sufficient: true, message: messages.enough };
}

/**
 * 호가가 놓인 자리.
 *
 * 유보한 경우 `band`와 `aboveMaxRatio`를 **비운다.** 계산은 할 수
 * 있었지만 말하지 않기로 한 자리라, 값을 남겨 두면 언젠가 화면 어딘가로
 * 새어 나간다.
 */
function positionFinding(
  rules: PriceRules,
  evidence: PriceEvidence,
  askingPrice: number,
  gate: EvidenceGate,
): PricePositionFinding {
  const label = rules.position.label;

  if (!gate.sufficient) {
    return {
      id: "position",
      label,
      verdict: "withheld",
      verdictLabel: rules.verdictLabels.withheld,
      message: gate.message,
      band: null,
      aboveMaxRatio: null,
    };
  }

  const band = bandOf(rules, evidence, askingPrice);
  const rule = rules.position.bands[band];

  return {
    id: "position",
    label,
    verdict: rule.verdict,
    verdictLabel: rules.verdictLabels[rule.verdict],
    message: rule.message,
    band,
    aboveMaxRatio:
      askingPrice > evidence.maxPrice
        ? (askingPrice - evidence.maxPrice) / evidence.maxPrice
        : null,
  };
}

/**
 * 호가가 관측 범위의 어디에 놓이는가.
 *
 * 경계(정확히 min이거나 max)는 `within`이다 — 실제로 그 값에 거래가
 * 있었으므로 범위 안이라는 말이 사실이다.
 */
function bandOf(
  rules: PriceRules,
  evidence: PriceEvidence,
  askingPrice: number,
): PriceBand {
  if (askingPrice < evidence.minPrice) return "below";
  if (askingPrice <= evidence.maxPrice) return "within";

  const excess = (askingPrice - evidence.maxPrice) / evidence.maxPrice;
  return excess >= rules.position.aboveFarFrom ? "aboveFar" : "aboveNear";
}

/**
 * 이 호가로 실제로 살 수 있는지, 살면 부담이 어떻게 되는지.
 *
 * **기존 엔진을 그대로 쓴다.** `ownFundsRequired`는 그 가격에서 대출을
 * 한도까지 받아도 현금으로 내야 하는 총액이고, 그것이 가용 현금을
 * 넘으면 이 호가로는 못 산다 — `lib/complex-list.ts`가 목록 행을
 * 거르는 것과 같은 술어다.
 *
 * 못 살 때는 대출액·월 상환액·부담률을 **비운다.** 받을 수 없는
 * 대출의 상환액을 표에 적으면, 표에 박힌 숫자가 옆의 설명보다 먼저
 * 읽혀 "이만큼만 내면 된다"로 읽힌다.
 */
function budgetFinding(
  rules: PriceRules,
  budget: PriceBudgetInput,
  askingPrice: number,
): PriceBudgetFinding {
  const { profile, financeRules } = budget;

  const costs = calcAcquisitionCosts(askingPrice, profile, financeRules);
  const availableCash = calcAvailableCash(profile).amount;
  const ownFunds = ownFundsRequired(askingPrice, profile, financeRules);
  const affordable = ownFunds <= availableCash;

  const burden = affordable
    ? calcBurdenAt(profile, financeRules, askingPrice)
    : null;

  const situation: PriceBudgetSituation =
    burden === null
      ? "unaffordable"
      : burden.safety.level === "danger"
        ? "danger"
        : burden.safety.level === "caution"
          ? "caution"
          : "checked";

  const verdict = rules.budget.verdicts[situation];

  return {
    id: "budget",
    label: rules.budget.label,
    verdict,
    verdictLabel: rules.verdictLabels[verdict],
    message: rules.budget.messages[situation],
    situation,
    costs,
    ownFunds,
    availableCash,
    shortfall: Math.max(0, ownFunds - availableCash),
    neededLoan: burden === null ? null : burden.neededLoan,
    monthlyPayment: burden === null ? null : burden.safety.monthlyPayment,
    burdenRatio: burden === null ? null : burden.safety.burdenRatio,
    safetyLevel: burden === null ? null : burden.safety.level,
  };
}

function decideOverall(
  findings: readonly PriceFinding[],
  askingPrice: number | null,
): PriceOverall {
  const has = (verdict: PriceVerdict) =>
    findings.some((finding) => finding.verdict === verdict);

  if (has("stop")) return "stop";
  if (askingPrice === null) return "incomplete";
  if (has("withheld")) return "withheld";
  if (has("expert")) return "expert";
  return "clear";
}
