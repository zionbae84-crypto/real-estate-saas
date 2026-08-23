import {
  PRICE_BANDS,
  PRICE_OVERALLS,
  PRICE_VERDICTS,
  type PriceBand,
  type PriceBudgetSituation,
  type PriceRules,
  type PriceVerdict,
} from "./types";

/** 판정의 무게. 큰 쪽이 더 무겁다 */
const SEVERITY: Record<PriceVerdict, number> = {
  checked: 0,
  withheld: 1,
  expert: 2,
  stop: 3,
};

const BUDGET_SITUATIONS: readonly PriceBudgetSituation[] = [
  "unaffordable",
  "danger",
  "caution",
  "checked",
];

const EVIDENCE_MESSAGE_KEYS = [
  "tooFewTrades",
  "singlePoint",
  "narrowRange",
  "enough",
] as const;

const DISCLOSURE_KEYS = [
  "floorNote",
  "floorRangeNote",
  "floorSameNote",
  "floorUnknownNote",
  "floorPartialUnknownNote",
  "reportingLagNote",
  "notAVerdictNote",
  "noPointEstimateNote",
] as const;

/**
 * 층 고지 틀이 반드시 품어야 하는 자리표시자.
 *
 * 빠져도 문장은 멀쩡해 보이는데 층수만 조용히 사라진다 — 화면은 여전히
 * 한 줄을 그리고 사용자는 고지를 읽었다고 믿는다. 그 실패는 눈에 띄지
 * 않으므로 데이터 수준에서 막는다.
 */
const DISCLOSURE_PLACEHOLDERS: ReadonlyArray<{
  key: (typeof DISCLOSURE_KEYS)[number];
  tokens: readonly string[];
}> = [
  { key: "floorRangeNote", tokens: ["{minFloor}", "{maxFloor}"] },
  { key: "floorSameNote", tokens: ["{floor}"] },
  { key: "floorPartialUnknownNote", tokens: ["{unknownFloorCount}"] },
];

/**
 * 거래 건수 하한의 하한.
 *
 * 표본 n건의 관측 범위 **밖**으로 평범한 다음 거래가 떨어질 확률은
 * 2/(n+1)이다 — 1건이면 100%, 2건이면 67%다. 그 표본으로 "범위를
 * 벗어났다"고 말하는 것은 가격에 대한 판단이 아니라 표본 길이에 대한
 * 관찰일 뿐이라, 룰셋이 그렇게 설정되는 것을 데이터 수준에서 막는다.
 * 실제 값과 그 근거는 룰셋의 `_minTradeCountNote`에 있다.
 */
const MIN_ALLOWED_TRADE_COUNT = 3;

/**
 * 호가 위치 룰셋 JSON을 검증해 {@link PriceRules}로 바꾼다.
 *
 * `src/lib/rights/rules.ts`·`src/lib/purchase/rules.ts`와 같은 태도다 —
 * 사람이 손으로 고치는 데이터이므로 틀렸을 때 어디가 틀렸는지 말해
 * 준다. 다만 여기서 지키는 불변식은 숫자의 범위가 아니라 **이 화면이
 * 절대 하면 안 되는 말**에 대한 것이다:
 *
 * 1. **범위가 한 점이면 언제나 유보한다.** `minRangeWidthRatio`가 0보다
 *    크도록 강제하므로, 폭이 0인 평형(번들 데이터의 51.7%)은 거래가
 *    아무리 많아도 위치 판정을 받지 못한다. 이 값을 0으로 두면 호가가
 *    1원만 높아도 "범위 위"가 되는데, 그건 가격에 대한 판단이 아니라
 *    표본이 만든 착시다.
 * 2. **거래 건수 하한을 1이나 2로 내릴 수 없다**({@link MIN_ALLOWED_TRADE_COUNT}).
 * 3. **범위 안(`within`)만 `checked`가 될 수 있다.** 범위 아래도, 위도
 *    "걸리는 게 없었다"가 아니다 — 아래는 왜 아래인지 우리가 모르고,
 *    위는 층으로 설명될 수도 아닐 수도 있다.
 * 4. **어느 밴드도 `withheld`가 될 수 없다.** 유보는 표본이 모자랄 때
 *    나오는 것이지 호가가 놓인 자리에서 나오는 것이 아니다. 밴드에
 *    유보를 허용하면 "범위 한참 위인데 유보"라는 조합이 만들어진다.
 * 5. **`aboveFar`는 `aboveNear`보다 가볍지 않다.** 뒤집히면 더 많이
 *    벗어난 호가가 더 약한 판정을 받는다.
 * 6. **예산 줄에서 현금이 모자라거나 위험선을 넘은 경우를 `checked`로
 *    둘 수 없다.**
 */
export function parsePriceRules(raw: unknown): PriceRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");

  const verdictLabels = plainObject(r.verdictLabels, "verdictLabels");
  for (const verdict of PRICE_VERDICTS) {
    requireText(verdictLabels, verdict, `verdictLabels.${verdict}`);
  }

  const overall = plainObject(r.overall, "overall");
  for (const key of PRICE_OVERALLS) {
    const copy = plainObject(overall[key], `overall.${key}`);
    requireText(copy, "label", `overall.${key}.label`);
    requireText(copy, "note", `overall.${key}.note`);
  }
  // 표본이 이미 모자란다는 사실이 회색 "아직 안 넣었어요" 뒤로 숨으면
  // 사용자는 호가만 넣으면 답이 나올 거라고 믿고 기다린다. 권리분석
  // 룰셋의 pendingExpertNote와 같은 자리·같은 이유다.
  requireText(
    plainObject(overall.incomplete, "overall.incomplete"),
    "pendingWithheldNote",
    "overall.incomplete.pendingWithheldNote",
  );

  const askingPrice = plainObject(r.askingPrice, "askingPrice");
  requireText(askingPrice, "label", "askingPrice.label");
  requireText(askingPrice, "hint", "askingPrice.hint");

  parseEvidence(r.evidence);
  parsePosition(r.position);
  parseBudget(r.budget);

  const disclosure = plainObject(r.disclosure, "disclosure");
  for (const key of DISCLOSURE_KEYS) {
    requireText(disclosure, key, `disclosure.${key}`);
  }
  for (const { key, tokens } of DISCLOSURE_PLACEHOLDERS) {
    const text = String(disclosure[key]);
    for (const token of tokens) {
      if (!text.includes(token)) {
        throw new Error(`룰셋 값 오류: disclosure.${key}에 ${token} 자리표시자가 없어요. 자리표시자가 빠지면 문장은 멀쩡해 보이는데 층수만 조용히 사라지고, 사용자는 고지를 읽었다고 믿게 돼요.`);
      }
    }
  }
  // 층을 하나도 모를 때 쓰는 문장은 끼워 넣을 층수가 없다. 자리표시자가
  // 남아 있으면 화면에 "{minFloor}층"이 그대로 나간다.
  const unknownNote = String(disclosure.floorUnknownNote);
  if (/[{}]/.test(unknownNote)) {
    throw new Error("룰셋 값 오류: disclosure.floorUnknownNote에는 자리표시자를 쓸 수 없어요. 층을 하나도 모를 때 쓰는 문장이라 끼워 넣을 층수가 없어요.");
  }

  if (
    !Array.isArray(r.disclaimer) ||
    r.disclaimer.length === 0 ||
    !r.disclaimer.every((line) => isText(line))
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: disclaimer (한 줄 이상의 문자열이어야 해요)");
  }

  return raw as PriceRules;
}

function parseEvidence(rawEvidence: unknown): void {
  const evidence = plainObject(rawEvidence, "evidence");
  requireText(evidence, "label", "evidence.label");

  const messages = plainObject(evidence.messages, "evidence.messages");
  for (const key of EVIDENCE_MESSAGE_KEYS) {
    requireText(messages, key, `evidence.messages.${key}`);
  }

  const minTradeCount = evidence.minTradeCount;
  if (
    typeof minTradeCount !== "number" ||
    !Number.isInteger(minTradeCount) ||
    minTradeCount < MIN_ALLOWED_TRADE_COUNT
  ) {
    throw new Error(`룰셋 값 오류: evidence.minTradeCount는 ${MIN_ALLOWED_TRADE_COUNT} 이상의 정수여야 해요 (${String(minTradeCount)}). 거래 2건 이하의 관측 범위 밖으로 평범한 다음 거래가 떨어질 확률은 3분의 2라서, 그 표본으로 위치를 말하면 가격이 아니라 표본 길이를 말하는 셈이 돼요.`);
  }

  const minRangeWidthRatio = evidence.minRangeWidthRatio;
  if (
    typeof minRangeWidthRatio !== "number" ||
    !Number.isFinite(minRangeWidthRatio) ||
    minRangeWidthRatio <= 0
  ) {
    throw new Error(`룰셋 값 오류: evidence.minRangeWidthRatio는 0보다 큰 숫자여야 해요 (${String(minRangeWidthRatio)}). 0이면 범위가 한 점인 평형(번들 데이터의 51.7%)에서도 위치 판정이 나오는데, 그때는 호가가 1원만 높아도 '범위 위'가 돼요.`);
  }
}

function parsePosition(rawPosition: unknown): void {
  const position = plainObject(rawPosition, "position");
  requireText(position, "label", "position.label");

  const aboveFarFrom = position.aboveFarFrom;
  if (
    typeof aboveFarFrom !== "number" ||
    !Number.isFinite(aboveFarFrom) ||
    aboveFarFrom <= 0
  ) {
    throw new Error(`룰셋 값 오류: position.aboveFarFrom은 0보다 큰 숫자여야 해요 (${String(aboveFarFrom)})`);
  }

  const bands = plainObject(position.bands, "position.bands");
  const verdicts: Partial<Record<PriceBand, PriceVerdict>> = {};

  for (const band of PRICE_BANDS) {
    const rule = plainObject(bands[band], `position.bands.${band}`);
    requireText(rule, "message", `position.bands.${band}.message`);

    const verdict = rule.verdict;
    if (!PRICE_VERDICTS.includes(verdict as PriceVerdict)) {
      throw new Error(`룰셋 값 오류: position.bands.${band}.verdict는 ${PRICE_VERDICTS.join("·")} 중 하나여야 해요 (${String(verdict)})`);
    }
    if (verdict === "withheld") {
      throw new Error(`룰셋 값 오류: position.bands.${band}.verdict는 withheld일 수 없어요. 유보는 표본이 모자랄 때 나오는 판정이지 호가가 놓인 자리에서 나오는 판정이 아니에요.`);
    }
    if (band !== "within" && verdict === "checked") {
      throw new Error(`룰셋 값 오류: position.bands.${band}.verdict는 checked일 수 없어요. 범위 안에 들어올 때만 '걸리는 게 없었다'고 말할 수 있어요 — 범위 아래는 왜 아래인지 우리가 모르고, 범위 위는 층으로 설명될 수도 아닐 수도 있어요.`);
    }
    if (band === "within" && verdict !== "checked") {
      throw new Error(`룰셋 값 오류: position.bands.within.verdict는 checked여야 해요 (${String(verdict)})`);
    }
    verdicts[band] = verdict as PriceVerdict;
  }

  const near = verdicts.aboveNear;
  const far = verdicts.aboveFar;
  if (near !== undefined && far !== undefined && SEVERITY[far] < SEVERITY[near]) {
    throw new Error(`룰셋 값 오류: position.bands.aboveFar는 aboveNear보다 가벼울 수 없어요 (${far} / ${near}). 뒤집히면 더 많이 벗어난 호가가 더 약한 판정을 받아요.`);
  }
}

function parseBudget(rawBudget: unknown): void {
  const budget = plainObject(rawBudget, "budget");
  requireText(budget, "label", "budget.label");
  requireText(budget, "absentNote", "budget.absentNote");

  const messages = plainObject(budget.messages, "budget.messages");
  const verdicts = plainObject(budget.verdicts, "budget.verdicts");

  for (const situation of BUDGET_SITUATIONS) {
    requireText(messages, situation, `budget.messages.${situation}`);

    const verdict = verdicts[situation];
    if (!PRICE_VERDICTS.includes(verdict as PriceVerdict)) {
      throw new Error(`룰셋 값 오류: budget.verdicts.${situation}은 ${PRICE_VERDICTS.join("·")} 중 하나여야 해요 (${String(verdict)})`);
    }
    if (verdict === "withheld") {
      throw new Error(`룰셋 값 오류: budget.verdicts.${situation}은 withheld일 수 없어요. 예산 계산은 실거주 프로필이 있으면 언제나 낼 수 있고, 없으면 이 줄 자체를 만들지 않아요.`);
    }
    if (situation !== "checked" && verdict === "checked") {
      throw new Error(`룰셋 값 오류: budget.verdicts.${situation}은 checked일 수 없어요. 현금이 모자라거나 상환 부담이 선을 넘은 경우를 '확인했어요'로 두면 화면이 실제보다 낙관적으로 말해요.`);
    }
  }
}

function isText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function requireText(
  container: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!isText(container[key])) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
}

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
  return value as Record<string, unknown>;
}
