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

const STRESS_DSR_NUMBER_FIELDS = ["stage", "surcharge"] as const;
const LTV_NUMBER_FIELDS = ["default", "firstTimeBuyer"] as const;
const SAFETY_THRESHOLD_NUMBER_FIELDS = [
  "safe",
  "caution",
  "stressedDanger",
] as const;
const ACQUISITION_TAX_NUMBER_FIELDS = [
  "lowRate",
  "highRate",
  "lowerBound",
  "upperBound",
  "localEducationTaxRatio",
  "ruralTaxRate",
  "ruralTaxAreaThresholdSqm",
  "firstTimeBuyerReliefCap",
  "firstTimeBuyerReliefPriceCap",
] as const;

/** eligibility의 boolean 필드. 존재할 때만 타입을 검사한다 (모두 선택적) */
const ELIGIBILITY_BOOLEAN_FIELDS = [
  "requiresNoHome",
  "requiresFirstTimeBuyer",
] as const;
/** eligibility의 number 필드. 존재할 때만 타입을 검사한다 (모두 선택적) */
const ELIGIBILITY_NUMBER_FIELDS = [
  "maxAnnualIncome",
  "maxHousePrice",
  "maxAreaSqm",
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
    assertNumberField(r, field, field);
  }

  const stressDSR = assertPlainObject(r.stressDSR, "stressDSR");
  assertNumberFields(stressDSR, "stressDSR", STRESS_DSR_NUMBER_FIELDS);

  const ltv = assertPlainObject(r.ltv, "ltv");
  assertNumberFields(ltv, "ltv", LTV_NUMBER_FIELDS);

  const safetyThreshold = assertPlainObject(r.safetyThreshold, "safetyThreshold");
  assertNumberFields(
    safetyThreshold,
    "safetyThreshold",
    SAFETY_THRESHOLD_NUMBER_FIELDS,
  );

  const acquisitionTax = assertPlainObject(r.acquisitionTax, "acquisitionTax");
  assertNumberFields(
    acquisitionTax,
    "acquisitionTax",
    ACQUISITION_TAX_NUMBER_FIELDS,
  );

  if (!Array.isArray(r.policyLoans)) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: policyLoans");
  }
  r.policyLoans.forEach((item, index) => validatePolicyLoan(item, index));

  if (!Array.isArray(r.brokerageFee) || r.brokerageFee.length === 0) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: brokerageFee");
  }
  validateBrokerageBrackets(r.brokerageFee);

  return raw as Rules;
}

/** 배열이 아닌 순수 객체인지 검사한다. 배열은 typeof가 "object"라 별도로 걸러야 한다 */
function assertPlainObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
  return value as Record<string, unknown>;
}

function assertNumberField(
  container: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (typeof container[key] !== "number") {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
}

function assertNumberFields(
  container: Record<string, unknown>,
  pathPrefix: string,
  keys: readonly string[],
): void {
  for (const key of keys) {
    assertNumberField(container, key, `${pathPrefix}.${key}`);
  }
}

function validatePolicyLoan(item: unknown, index: number): void {
  const path = `policyLoans[${index}]`;
  const loan = assertPlainObject(item, path);

  if (typeof loan.id !== "string") {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.id`);
  }
  assertNumberField(loan, "maxAmount", `${path}.maxAmount`);
  assertNumberField(loan, "rate", `${path}.rate`);

  const eligibility = assertPlainObject(loan.eligibility, `${path}.eligibility`);
  validateEligibility(eligibility, `${path}.eligibility`);
}

/** eligibility의 모든 키는 선택적이다. 존재하는 키만 타입을 검사한다 */
function validateEligibility(
  eligibility: Record<string, unknown>,
  path: string,
): void {
  for (const key of ELIGIBILITY_BOOLEAN_FIELDS) {
    const value = eligibility[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.${key}`);
    }
  }
  for (const key of ELIGIBILITY_NUMBER_FIELDS) {
    const value = eligibility[key];
    if (value !== undefined && typeof value !== "number") {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.${key}`);
    }
  }
}

function validateBrokerageBrackets(brackets: unknown[]): void {
  brackets.forEach((bracket, index) => {
    const path = `brokerageFee[${index}]`;
    const obj = assertPlainObject(bracket, path);
    assertNumberField(obj, "rate", `${path}.rate`);
    if (obj.cap !== null && typeof obj.cap !== "number") {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.cap`);
    }
  });

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
