import type { PolicyLoanRule, Rules } from "./types";

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

/**
 * 엔진이 실제로 평가할 줄 아는 eligibility 조건의 전부.
 *
 * 이 목록이 곧 화이트리스트다. 여기에 없는 키는 isEligible이 무시하므로,
 * 통과시키면 "조건이 있는 척하지만 아무나 통과하는" 정책대출 상품이
 * 만들어진다(예: `{ minChildren: 1 }`이 무자녀 구매자에게도 매칭). 오타
 * 하나(`maxAnnualIncomes`)로 소득 상한이 통째로 사라지는 것도 같은 경로다.
 *
 * 조건을 추가할 때 손댈 곳은 이 상수 하나와 policy-loans.ts의 평가 로직뿐이다.
 * Record의 키가 PolicyLoanRule["eligibility"]에 묶여 있어, 타입에 필드를
 * 추가하면 여기도 채우도록 컴파일러가 강제한다.
 */
const ELIGIBILITY_FIELD_TYPES: Record<
  keyof PolicyLoanRule["eligibility"],
  "boolean" | "number"
> = {
  requiresNoHome: "boolean",
  requiresFirstTimeBuyer: "boolean",
  maxAnnualIncome: "number",
  maxHousePrice: "number",
  maxAreaSqm: "number",
};

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
  // 적용 범위 메모(수도권·규제지역 기준). 선택 필드이지만 있으면 문자열이어야 한다.
  if (r._scope !== undefined && typeof r._scope !== "string") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: _scope");
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

  validateSemanticInvariants(raw as Rules);

  return raw as Rules;
}

/**
 * 타입은 맞지만 말이 안 되는 값을 걸러낸다.
 *
 * 룰셋은 사람이 손으로 고치는 데이터다. 값을 잘못 넣어도 타입 검사는
 * 통과하고, 계산은 조용히 이상한 답을 낸다(예: 취득세 상·하한이 뒤집히면
 * 누진 구간의 기울기가 음수가 된다). 싸게 잡을 수 있는 것은 여기서 잡는다.
 */
function validateSemanticInvariants(rules: Rules): void {
  const t = rules.acquisitionTax;
  if (!(t.lowerBound < t.upperBound)) {
    throw new Error(
      `룰셋 값 오류: acquisitionTax.lowerBound는 upperBound보다 작아야 합니다 (${t.lowerBound} / ${t.upperBound})`,
    );
  }

  const s = rules.safetyThreshold;
  if (!(s.safe <= s.caution)) {
    throw new Error(
      `룰셋 값 오류: safetyThreshold.safe는 caution 이하여야 합니다 (${s.safe} / ${s.caution})`,
    );
  }

  assertRatio(rules.ltv.default, "ltv.default");
  assertRatio(rules.ltv.firstTimeBuyer, "ltv.firstTimeBuyer");
  assertRatio(rules.dsrLimit, "dsrLimit");

  rules.policyLoans.forEach((loan, index) => {
    if (!(loan.maxAmount >= 0)) {
      throw new Error(
        `룰셋 값 오류: policyLoans[${index}].maxAmount는 0 이상이어야 합니다 (${loan.maxAmount})`,
      );
    }
  });
}

/** LTV·DSR처럼 "소득·가격의 몇 %"를 뜻하는 비율은 (0, 1] 범위여야 한다 */
function assertRatio(value: number, path: string): void {
  if (!(value > 0 && value <= 1)) {
    throw new Error(
      `룰셋 값 오류: ${path}는 0 초과 1 이하여야 합니다 (${value})`,
    );
  }
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

/**
 * 숫자 필드 검사. NaN·Infinity는 숫자가 아닌 것으로 취급한다.
 * NaN은 모든 비교가 false라 하위 계산에서 조용히 제약을 무력화하므로,
 * 경계에서 반드시 걸러야 한다.
 */
function assertNumberField(
  container: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!Number.isFinite(container[key])) {
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

/**
 * eligibility의 모든 키는 선택적이다. 존재하는 키만 타입을 검사하되,
 * 엔진이 모르는 키는 조용히 무시되면 안 되므로 즉시 실패시킨다.
 */
function validateEligibility(
  eligibility: Record<string, unknown>,
  path: string,
): void {
  for (const key of Object.keys(eligibility)) {
    if (!(key in ELIGIBILITY_FIELD_TYPES)) {
      throw new Error(
        `엔진이 알지 못하는 정책대출 조건입니다(무시되면 조건 없는 상품이 됩니다): ${path}.${key}`,
      );
    }
  }

  for (const [key, expected] of Object.entries(ELIGIBILITY_FIELD_TYPES)) {
    const value = eligibility[key];
    if (value === undefined) continue;
    const ok =
      expected === "boolean"
        ? typeof value === "boolean"
        : Number.isFinite(value);
    if (!ok) {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.${key}`);
    }
  }
}

function validateBrokerageBrackets(brackets: unknown[]): void {
  brackets.forEach((bracket, index) => {
    const path = `brokerageFee[${index}]`;
    const obj = assertPlainObject(bracket, path);
    assertNumberField(obj, "rate", `${path}.rate`);
    if (obj.cap !== null && !Number.isFinite(obj.cap)) {
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
    if (typeof upTo !== "number" || !Number.isFinite(upTo)) {
      throw new Error("중개보수 구간의 upTo는 숫자 또는 null이어야 합니다");
    }
    if (upTo <= previous) {
      throw new Error("중개보수 구간은 upTo 오름차순이어야 합니다");
    }
    previous = upTo;
  }
}
