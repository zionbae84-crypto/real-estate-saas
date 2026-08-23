import type { LocationRules } from "./types";

/**
 * 초등학교 반경의 하한(m).
 *
 * 이보다 좁으면 대개 학교가 한 곳만 남는다. 화면에 학교가 하나만 뜨면
 * 사용자는 "이 단지는 저기로 배정된다"고 읽는데, 초등학교 배정은 거리순이
 * 아니라 학구도로 정해지므로 그건 우리가 주는 **틀린 확신**이다. 후보가
 * 여럿 보여야 "가까운 게 곧 배정은 아니다"라는 고지가 실제로 읽힌다.
 * 실제 값과 그 근거는 룰셋의 `_radiusMetersNote`에 있다.
 */
const MIN_ALLOWED_RADIUS_M = 500;

/**
 * 초등학교 반경의 상한(m).
 *
 * 여기 적히는 거리는 직선거리이고 실제 도보 경로는 그보다 길다(강·철길·
 * 언덕·큰길이 끼면 1.5~2배까지 간다). 직선 2km는 걸어서 3km가 될 수
 * 있어서, 그보다 넓은 반경을 "주변"이라고 부르면 그 말 자체가 거짓말이
 * 된다.
 */
const MAX_ALLOWED_RADIUS_M = 2000;

const SCHOOL_MESSAGE_KEYS = ["unknown", "none", "some"] as const;

const DISCLOSURE_KEYS = [
  "straightLineNote",
  "schoolZoneNote",
  "missingFactorsNote",
  "notARatingNote",
] as const;

/**
 * 고지 문구가 **실제로 그 사실을 말하는지** 확인하는 최소 조건.
 *
 * 문구를 손으로 고치다 핵심 단어가 빠지면, 문장은 멀쩡해 보이는데 고지가
 * 아무것도 고지하지 않게 된다("여기 적힌 거리는 참고용이에요" 같은
 * 문장은 있으나 마나다). 특히 아래 둘이 이 화면의 존재 이유라
 * 데이터 수준에서 잠근다:
 *
 * - `straightLineNote`는 **직선**거리와 **도보**(걷는 것)를 함께 말해야
 *   한다. 둘 중 하나만 있으면 "직선거리예요"로 끝나 그게 걷는 거리와
 *   다르다는 말이 빠지거나, 반대로 무엇이 걷는 거리와 다른지가 빠진다.
 * - `schoolZoneNote`는 **배정**과 **학구도**를 말해야 한다. 이 말이
 *   없으면 화면의 학교 목록이 배정 결과처럼 읽힌다.
 */
const DISCLOSURE_MUST_MENTION: ReadonlyArray<{
  key: (typeof DISCLOSURE_KEYS)[number];
  words: readonly string[];
}> = [
  { key: "straightLineNote", words: ["직선", "걸어"] },
  { key: "schoolZoneNote", words: ["배정", "학구도"] },
  { key: "notARatingNote", words: ["점수", "등급", "순위"] },
];

/**
 * 입지 룰셋 JSON을 검증해 {@link LocationRules}로 바꾼다.
 *
 * `src/lib/price/rules.ts`·`src/lib/rights/rules.ts`와 같은 태도다 —
 * 사람이 손으로 고치는 데이터이므로 틀렸을 때 어디가 틀렸는지 말해 준다.
 * 여기서 지키는 불변식은 **이 화면이 절대 하면 안 되는 말**에 대한 것이다:
 *
 * 1. **반경을 500m 미만으로 좁힐 수 없다.** 좁히면 학교가 한 곳만 남아
 *    화면이 "거기로 배정된다"는 없는 사실을 암시한다.
 * 2. **반경을 2,000m 초과로 넓힐 수 없다.** 직선 2km는 걸어서 3km가 될
 *    수 있어 "주변"이라는 말이 거짓이 된다.
 * 3. **학교 문구 셋 모두 `{radius}` 자리표시자를 품어야 한다.** 빠지면
 *    문장은 멀쩡해 보이는데 어느 범위를 센 것인지가 조용히 사라진다.
 * 4. **고지가 실제로 그 사실을 말해야 한다**({@link DISCLOSURE_MUST_MENTION}).
 *
 * 점수·등급을 만들지 않는다는 약속은 여기서 검사하지 않는다 — 그건 값
 * 하나의 문제가 아니라 **결과의 모양** 문제라 타입(`types.ts`에 그런
 * 필드가 없다)과 테스트(`rules.test.ts`가 룰셋 문구 전체를,
 * `LocationFacts.test.tsx`가 렌더 결과 전체를 탐지기에 통과시킨다)가
 * 나눠 지킨다.
 */
export function parseLocationRules(raw: unknown): LocationRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");
  requireText(r, "label", "label");
  requireText(r, "distanceLabel", "distanceLabel");

  const states = plainObject(r.states, "states");
  for (const key of ["unlocated", "located"] as const) {
    const copy = plainObject(states[key], `states.${key}`);
    requireText(copy, "label", `states.${key}.label`);
    requireText(copy, "note", `states.${key}.note`);
  }

  parseSubway(r.subway);
  parseElementarySchool(r.elementarySchool);

  const disclosure = plainObject(r.disclosure, "disclosure");
  for (const key of DISCLOSURE_KEYS) {
    requireText(disclosure, key, `disclosure.${key}`);
  }
  for (const { key, words } of DISCLOSURE_MUST_MENTION) {
    const text = String(disclosure[key]);
    for (const word of words) {
      if (!text.includes(word)) {
        throw new Error(`룰셋 값 오류: disclosure.${key}에 "${word}"이(가) 없어요. 이 고지가 무엇을 고지하는지가 문장에서 빠지면, 화면은 여전히 한 줄을 그리고 사용자는 고지를 읽었다고 믿게 돼요.`);
      }
    }
  }

  if (
    !Array.isArray(r.disclaimer) ||
    r.disclaimer.length === 0 ||
    !r.disclaimer.every((line) => isText(line))
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: disclaimer (한 줄 이상의 문자열이어야 해요)");
  }

  return raw as LocationRules;
}

function parseSubway(rawSubway: unknown): void {
  const subway = plainObject(rawSubway, "subway");
  requireText(subway, "label", "subway.label");

  const messages = plainObject(subway.messages, "subway.messages");
  for (const key of ["unknown", "measured"] as const) {
    requireText(messages, key, `subway.messages.${key}`);
  }
}

function parseElementarySchool(rawSchool: unknown): void {
  const school = plainObject(rawSchool, "elementarySchool");
  requireText(school, "label", "elementarySchool.label");

  const radius = school.radiusMeters;
  if (
    typeof radius !== "number" ||
    !Number.isFinite(radius) ||
    radius < MIN_ALLOWED_RADIUS_M ||
    radius > MAX_ALLOWED_RADIUS_M
  ) {
    throw new Error(`룰셋 값 오류: elementarySchool.radiusMeters는 ${MIN_ALLOWED_RADIUS_M} 이상 ${MAX_ALLOWED_RADIUS_M} 이하여야 해요 (${String(radius)}). 더 좁히면 대개 학교가 한 곳만 남아 화면이 "거기로 배정된다"는 없는 사실을 암시하고, 더 넓히면 직선거리로는 반경 안이어도 걸어서는 갈 수 없는 학교까지 "주변"이라고 부르게 돼요.`);
  }

  const messages = plainObject(school.messages, "elementarySchool.messages");
  for (const key of SCHOOL_MESSAGE_KEYS) {
    requireText(messages, key, `elementarySchool.messages.${key}`);
    if (!String(messages[key]).includes("{radius}")) {
      throw new Error(`룰셋 값 오류: elementarySchool.messages.${key}에 {radius} 자리표시자가 없어요. 빠지면 문장은 멀쩡해 보이는데 어느 범위를 센 것인지가 조용히 사라지고, 사용자는 "주변"이 얼마인지 모른 채 개수만 읽게 돼요.`);
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
