import { LAND_LEASE_STATES, type LandLeaseRules } from "./types";

/**
 * 이 룰셋의 문구가 반드시 품어야 하는 낱말.
 *
 * 문구가 있기만 하면 통과하는 검사는 이 저장소에서 이미 헛돌았다 —
 * 누군가 `monthlyNote`를 "토지임대부 주택이에요" 한 줄로 줄여도 필드는
 * 여전히 채워져 있고, 화면은 여전히 한 줄을 그리고, 사용자는 고지를
 * 읽었다고 믿는다. 그런데 그 줄에는 **이 표시가 존재하는 이유**(월
 * 상환액 밖에 매달 나가는 돈이 더 있다)가 한 글자도 없다. 그래서
 * 데이터 수준에서 막는다.
 */
const REQUIRED_TOKENS: ReadonlyArray<{
  key: "monthlyNote" | "priceNote";
  tokens: readonly string[];
}> = [
  // 월 상환액 옆에 붙는 문장은 그 숫자 밖에 매달 나가는 돈이 있다는 것을
  // 말해야 한다.
  { key: "monthlyNote", tokens: ["월 상환액", "매달"] },
  // 호가 화면의 문장은 이 값이 무엇의 값인지를 말해야 한다.
  { key: "priceNote", tokens: ["호가", "매달"] },
];

/**
 * 등급 문구가 반드시 품어야 하는 낱말.
 *
 * `grade`는 화면의 **판정**을 바꾸는 문구다. "확인이 필요해요" 한 줄로
 * 줄여 놓아도 필드는 채워져 있고 화면은 등급을 내리지만, 왜 내렸는지가
 * 한 글자도 없으면 사용자는 무엇을 확인해야 하는지 모른 채 등급만
 * 낯설게 읽는다. 등급을 붙드는 이유는 하나뿐이라("우리 계산 밖에 매달
 * 나가는 돈이 있다") 그 말이 실제로 있는지 데이터 수준에서 막는다.
 *
 * `label`은 뺀다 — 등급 칸에 들어가는 짧은 글자라 문장이 아니다.
 */
const REQUIRED_GRADE_TOKENS: ReadonlyArray<{
  key: "note" | "noLoanNote" | "groupHeading";
  token: string;
}> = [
  { key: "note", token: "매달" },
  { key: "noLoanNote", token: "매달" },
  { key: "groupHeading", token: "매달" },
];

/**
 * 금액 추정 금지.
 *
 * 토지 사용료는 우리 데이터에 없다. 룰셋에 "월 20만원쯤"·"약 15만원"
 * 같은 값이 들어오면 화면이 우리가 모르는 것을 아는 척하게 되고, 그
 * 방향의 오차가 이 제품에서 가장 위험하다(사용자가 실제보다 안전하다고
 * 믿는다). 숫자+금액단위 조합을 문구에서 아예 금지한다.
 */
const MONEY_ESTIMATE = /\d\s*(원|만원|억|만\s*원)/;

/**
 * 토지임대부 룰셋 JSON을 검증해 {@link LandLeaseRules}로 바꾼다.
 *
 * `src/lib/price/rules.ts`·`src/lib/rights/rules.ts`와 같은 태도다 —
 * 사람이 손으로 고치는 데이터이므로 틀렸을 때 어디가 틀렸는지 말해
 * 준다. 여기서 지키는 불변식은 셋이다:
 *
 * 1. **두 상태(`yes`·`unknown`)가 모두 있어야 한다.** `unknown`이
 *    빠지면 `landLeaseNotice`가 그릴 문구를 잃고, 모름이 조용히
 *    화면에서 사라진다 — "아님"으로 접히는 것과 결과가 같다.
 * 2. **화면별 문구가 그 이유를 실제로 말해야 한다**
 *    ({@link REQUIRED_TOKENS}).
 * 3. **어떤 문구도 토지 사용료 금액을 추정하지 않는다**
 *    ({@link MONEY_ESTIMATE}).
 * 4. **등급을 붙드는 문구(`grade`)가 다 있고, 왜 붙드는지를 말한다**
 *    ({@link REQUIRED_GRADE_TOKENS}). `grade`가 비면 화면은 등급을 내릴
 *    글자를 잃고 "안전"으로 되돌아간다 — 이 파일이 막으려는 바로 그
 *    상태다.
 */
export function parseLandLeaseRules(raw: unknown): LandLeaseRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");

  const grade = plainObject(r.grade, "grade");
  for (const key of ["label", "note", "noLoanNote", "groupHeading"] as const) {
    requireText(grade, key, `grade.${key}`);
    const text = String(grade[key]);
    if (MONEY_ESTIMATE.test(text)) {
      throw new Error(`룰셋 값 오류: grade.${key}가 금액을 말하고 있어요. 토지 사용료는 우리 데이터에 없어서 추정하면 안 돼요 — "얼마쯤 더 나온다"가 아니라 "우리가 모르는 돈이 더 나간다"고만 말해요.`);
    }
  }
  for (const { key, token } of REQUIRED_GRADE_TOKENS) {
    if (!String(grade[key]).includes(token)) {
      throw new Error(`룰셋 값 오류: grade.${key}에 "${token}"이 없어요. 이 등급이 내려간 이유는 우리 계산 밖에 매달 나가는 돈이 있다는 것 하나인데, 그 말이 빠지면 사용자는 무엇을 확인해야 하는지 모른 채 등급만 낯설게 읽어요.`);
    }
  }

  const states = plainObject(r.states, "states");

  for (const state of LAND_LEASE_STATES) {
    const copy = plainObject(states[state], `states.${state}`);
    requireText(copy, "badge", `states.${state}.badge`);
    requireText(copy, "monthlyNote", `states.${state}.monthlyNote`);
    requireText(copy, "priceNote", `states.${state}.priceNote`);
    requireText(copy, "checkNote", `states.${state}.checkNote`);

    for (const { key, tokens } of REQUIRED_TOKENS) {
      const text = String(copy[key]);
      for (const token of tokens) {
        if (!text.includes(token)) {
          throw new Error(`룰셋 값 오류: states.${state}.${key}에 "${token}"이 없어요. 이 문구가 붙는 이유는 우리가 계산한 숫자 밖에 매달 나가는 돈이 더 있다는 것 하나인데, 그 말이 빠지면 화면은 한 줄을 그리고 사용자는 고지를 읽었다고 믿게 돼요.`);
        }
      }
    }

    for (const key of ["badge", "monthlyNote", "priceNote", "checkNote"] as const) {
      const text = String(copy[key]);
      if (MONEY_ESTIMATE.test(text)) {
        throw new Error(`룰셋 값 오류: states.${state}.${key}가 금액을 말하고 있어요. 토지 사용료는 우리 데이터에 없어서 추정하면 안 돼요 — "얼마쯤 더 나온다"가 아니라 "우리가 모르는 돈이 더 나간다"고만 말해요.`);
      }
    }
  }

  return raw as LandLeaseRules;
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
