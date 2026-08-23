import type {
  RightsAmountRole,
  RightsItem,
  RightsOption,
  RightsOverall,
  RightsRules,
  RightsSection,
  RightsVerdict,
} from "./types";

const VERDICTS: readonly RightsVerdict[] = ["stop", "expert", "checked"];
const OVERALLS: readonly RightsOverall[] = [
  "stop",
  "incomplete",
  "expert",
  "clear",
];
const SECTIONS: readonly RightsSection[] = [
  "표제부",
  "갑구",
  "을구",
  "등기부 밖",
];
const AMOUNT_ROLES: readonly RightsAmountRole[] = ["zero", "input", "unknown"];

const ENCUMBRANCE_MESSAGE_KEYS = [
  "noPrice",
  "unknown",
  "stop",
  "expert",
  "checked",
] as const;

/**
 * 권리분석 룰셋 JSON을 검증해 {@link RightsRules}로 바꾼다.
 *
 * 재무 룰셋(`src/lib/finance/rules.ts`)과 같은 태도다 — 사람이 손으로
 * 고치는 데이터이므로 틀렸을 때 어디가 틀렸는지 말해 준다. 다만 여기서
 * 지키는 불변식은 숫자의 범위가 아니라 **이 제품이 절대 하면 안 되는
 * 말**에 대한 것이다:
 *
 * 1. 판정은 세 가지뿐이다(`stop`·`expert`·`checked`). 넷째 등급을 넣어
 *    "안전"을 만들 수 없다.
 * 2. **모든 항목에 모름 선택지가 하나 이상 있고, 그것은 절대 `checked`가
 *    아니다.** 모름을 통과로 처리하는 것이 이 제품에서 가장 하면 안 되는
 *    일이라, 코드가 아니라 데이터 수준에서 막는다.
 * 3. 금액을 합계에 넣는 항목(`encumbrance.sourceItemIds`)은 반드시
 *    금액 입력 선택지(`amount: "input"`)와 모름 선택지(`amount:
 *    "unknown"`)를 함께 갖는다. 모름이 없으면 모르는 사용자가 "없어요"를
 *    고르게 되고, 그 순간 위험이 0원으로 사라진다.
 * 4. `expertRatio <= stopRatio`. 뒤집히면 더 위험한 상황이 더 약한
 *    판정을 받는다.
 */
export function parseRightsRules(raw: unknown): RightsRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");
  requireText(r, "unansweredLabel", "unansweredLabel");

  const verdictLabels = plainObject(r.verdictLabels, "verdictLabels");
  for (const verdict of VERDICTS) {
    requireText(verdictLabels, verdict, `verdictLabels.${verdict}`);
  }

  const overall = plainObject(r.overall, "overall");
  for (const key of OVERALLS) {
    const copy = plainObject(overall[key], `overall.${key}`);
    requireText(copy, "label", `overall.${key}.label`);
    requireText(copy, "note", `overall.${key}.note`);
  }

  if (
    !Array.isArray(r.disclaimer) ||
    r.disclaimer.length === 0 ||
    !r.disclaimer.every((line) => isText(line))
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: disclaimer (한 줄 이상의 문자열이어야 해요)");
  }

  const items = parseItems(r.items);
  parseEncumbrance(r.encumbrance, items);

  return raw as RightsRules;
}

function parseItems(rawItems: unknown): RightsItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: items (한 항목 이상이어야 해요)");
  }

  const seenItemIds = new Set<string>();
  const items: RightsItem[] = [];

  rawItems.forEach((rawItem, index) => {
    const path = `items[${index}]`;
    const item = plainObject(rawItem, path);

    requireText(item, "id", `${path}.id`);
    requireText(item, "question", `${path}.question`);
    // 어디를 보는지·왜 위험한지는 장식이 아니다. 등기부를 처음 보는
    // 사람은 이 둘이 없으면 답 자체를 할 수 없다.
    requireText(item, "where", `${path}.where`);
    requireText(item, "why", `${path}.why`);

    const id = item.id as string;
    if (seenItemIds.has(id)) {
      throw new Error(`룰셋 값 오류: 항목 id가 중복돼요 (${id})`);
    }
    seenItemIds.add(id);

    if (!SECTIONS.includes(item.section as RightsSection)) {
      throw new Error(`룰셋 값 오류: ${path}.section은 ${SECTIONS.join("·")} 중 하나여야 해요 (${String(item.section)})`);
    }

    items.push({ ...(item as unknown as RightsItem), options: parseOptions(item.options, path) });
  });

  return items;
}

function parseOptions(rawOptions: unknown, itemPath: string): RightsOption[] {
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
    throw new Error(`룰셋 값 오류: ${itemPath}.options는 두 개 이상이어야 해요`);
  }

  const seenOptionIds = new Set<string>();
  const options: RightsOption[] = [];

  rawOptions.forEach((rawOption, index) => {
    const path = `${itemPath}.options[${index}]`;
    const option = plainObject(rawOption, path);

    requireText(option, "id", `${path}.id`);
    requireText(option, "label", `${path}.label`);

    const id = option.id as string;
    if (seenOptionIds.has(id)) {
      throw new Error(`룰셋 값 오류: 선택지 id가 중복돼요 (${itemPath} 안의 ${id})`);
    }
    seenOptionIds.add(id);

    if (!VERDICTS.includes(option.verdict as RightsVerdict)) {
      throw new Error(`룰셋 값 오류: ${path}.verdict는 ${VERDICTS.join("·")} 중 하나여야 해요 (${String(option.verdict)})`);
    }

    if (option.note !== undefined && !isText(option.note)) {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.note`);
    }

    if (
      option.amount !== undefined &&
      !AMOUNT_ROLES.includes(option.amount as RightsAmountRole)
    ) {
      throw new Error(`룰셋 값 오류: ${path}.amount는 ${AMOUNT_ROLES.join("·")} 중 하나여야 해요 (${String(option.amount)})`);
    }

    if (option.unknown !== undefined && typeof option.unknown !== "boolean") {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.unknown`);
    }

    // 모름을 통과로 만드는 조합은 데이터 수준에서 막는다.
    if (option.unknown === true && option.verdict === "checked") {
      throw new Error(`룰셋 값 오류: 모름 선택지는 checked일 수 없어요 (${path}). 모름은 최소 expert예요.`);
    }

    options.push(option as unknown as RightsOption);
  });

  if (!options.some((option) => option.unknown === true)) {
    throw new Error(`룰셋 값 오류: ${itemPath}에 모름 선택지가 없어요. 모르는 사용자가 고를 자리가 없으면 그 사람은 아무 답이나 고르게 돼요.`);
  }

  return options;
}

function parseEncumbrance(rawEncumbrance: unknown, items: RightsItem[]): void {
  const encumbrance = plainObject(rawEncumbrance, "encumbrance");

  requireText(encumbrance, "priceLabel", "encumbrance.priceLabel");

  const messages = plainObject(encumbrance.messages, "encumbrance.messages");
  for (const key of ENCUMBRANCE_MESSAGE_KEYS) {
    requireText(messages, key, `encumbrance.messages.${key}`);
  }

  const expertRatio = encumbrance.expertRatio;
  const stopRatio = encumbrance.stopRatio;
  for (const [value, name] of [
    [expertRatio, "expertRatio"],
    [stopRatio, "stopRatio"],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`룰셋 값 오류: encumbrance.${name}는 0보다 큰 숫자여야 해요 (${String(value)})`);
    }
  }
  if (!((expertRatio as number) <= (stopRatio as number))) {
    throw new Error(`룰셋 값 오류: encumbrance.expertRatio는 stopRatio 이하여야 해요 (${String(expertRatio)} / ${String(stopRatio)}). 뒤집히면 더 위험한 상황이 더 약한 판정을 받아요.`);
  }

  const sourceItemIds = encumbrance.sourceItemIds;
  if (
    !Array.isArray(sourceItemIds) ||
    sourceItemIds.length === 0 ||
    !sourceItemIds.every((id) => isText(id))
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: encumbrance.sourceItemIds");
  }

  for (const id of sourceItemIds as string[]) {
    const item = items.find((candidate) => candidate.id === id);
    if (item === undefined) {
      throw new Error(`룰셋 값 오류: encumbrance.sourceItemIds가 없는 항목을 가리켜요 (${id})`);
    }
    if (!item.options.some((option) => option.amount === "input")) {
      throw new Error(`룰셋 값 오류: ${id} 항목에 금액을 넣을 선택지(amount: "input")가 없어요`);
    }
    if (!item.options.some((option) => option.amount === "unknown")) {
      throw new Error(`룰셋 값 오류: ${id} 항목에 금액 모름 선택지(amount: "unknown")가 없어요. 모름이 없으면 모르는 사용자가 "없어요"를 골라 위험이 0원으로 사라져요.`);
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
