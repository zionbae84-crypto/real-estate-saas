import type { Rules } from "./types";

const REQUIRED_NUMBER_FIELDS = [
  "baseRate",
  "loanTermMonths",
  "safetyStressSurcharge",
  "absoluteCap",
  "dsrLimit",
  "legalFee",
  "movingCost",
] as const;

/**
 * 룰셋 JSON을 검증해 Rules로 변환한다.
 * 규제 파일은 사람이 손으로 고치는 데이터이므로, 틀렸을 때 어디가 틀렸는지 말해준다.
 */
export function parseRules(raw: unknown): Rules {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("룰셋은 객체여야 합니다");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.version !== "string") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: version");
  }
  if (typeof r.effectiveFrom !== "string") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: effectiveFrom");
  }
  for (const field of REQUIRED_NUMBER_FIELDS) {
    if (typeof r[field] !== "number") {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${field}`);
    }
  }
  for (const field of [
    "stressDSR",
    "ltv",
    "safetyThreshold",
    "acquisitionTax",
  ]) {
    if (typeof r[field] !== "object" || r[field] === null) {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${field}`);
    }
  }
  if (!Array.isArray(r.policyLoans)) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: policyLoans");
  }
  if (!Array.isArray(r.brokerageFee) || r.brokerageFee.length === 0) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: brokerageFee");
  }

  validateBrokerageBrackets(r.brokerageFee);

  return raw as Rules;
}

function validateBrokerageBrackets(brackets: unknown[]): void {
  const last = brackets[brackets.length - 1] as { upTo: unknown };
  if (last.upTo !== null) {
    throw new Error("중개보수 마지막 구간의 upTo는 null이어야 합니다");
  }

  let previous = 0;
  for (const bracket of brackets.slice(0, -1)) {
    const { upTo } = bracket as { upTo: unknown };
    if (typeof upTo !== "number") {
      throw new Error("중개보수 구간의 upTo는 숫자 또는 null이어야 합니다");
    }
    if (upTo <= previous) {
      throw new Error("중개보수 구간은 upTo 오름차순이어야 합니다");
    }
    previous = upTo;
  }
}
