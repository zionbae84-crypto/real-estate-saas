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
const LTV_BAND_NUMBER_FIELDS = ["default", "firstTimeBuyer"] as const;
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
  const ltvRegulated = assertPlainObject(ltv.regulated, "ltv.regulated");
  assertNumberFields(ltvRegulated, "ltv.regulated", LTV_BAND_NUMBER_FIELDS);
  const ltvUnregulated = assertPlainObject(ltv.unregulated, "ltv.unregulated");
  assertNumberFields(ltvUnregulated, "ltv.unregulated", LTV_BAND_NUMBER_FIELDS);

  assertNumberField(r, "brokerageVatRate", "brokerageVatRate");

  const housingBond = assertPlainObject(r.housingBond, "housingBond");
  // 국민주택채권 주석(선택 필드이지만 있으면 문자열이어야 한다)
  if (housingBond._note !== undefined && typeof housingBond._note !== "string") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: housingBond._note");
  }
  assertNumberField(
    housingBond,
    "assumedPriceToStandardRatio",
    "housingBond.assumedPriceToStandardRatio",
  );
  assertNumberField(
    housingBond,
    "assumedDiscountRate",
    "housingBond.assumedDiscountRate",
  );
  if (
    !Array.isArray(housingBond.brackets) ||
    housingBond.brackets.length === 0
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: housingBond.brackets");
  }
  validateAscendingBrackets(
    housingBond.brackets,
    "housingBond.brackets",
    (obj, path) => assertNumberField(obj, "perThousand", `${path}.perThousand`),
  );

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
  validateAscendingBrackets(r.brokerageFee, "brokerageFee", (obj, path) => {
    assertNumberField(obj, "rate", `${path}.rate`);
    if (obj.cap !== null && !Number.isFinite(obj.cap)) {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}.cap`);
    }
  });

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
  assertNonNegative(t.lowRate, "acquisitionTax.lowRate");
  assertNonNegative(t.highRate, "acquisitionTax.highRate");
  assertNonNegative(t.localEducationTaxRatio, "acquisitionTax.localEducationTaxRatio");
  assertNonNegative(t.ruralTaxRate, "acquisitionTax.ruralTaxRate");
  assertNonNegative(t.ruralTaxAreaThresholdSqm, "acquisitionTax.ruralTaxAreaThresholdSqm");
  assertNonNegative(t.firstTimeBuyerReliefCap, "acquisitionTax.firstTimeBuyerReliefCap");
  assertNonNegative(
    t.firstTimeBuyerReliefPriceCap,
    "acquisitionTax.firstTimeBuyerReliefPriceCap",
  );
  // 부호가 먼저 걸러진 뒤에야 대소 비교가 의미를 갖는다(음수 highRate는
  // 위에서 이미 실패하므로, 이 비교는 두 값이 0 이상일 때만 도달한다).
  if (!(t.lowRate <= t.highRate)) {
    throw new Error(
      `룰셋 값 오류: acquisitionTax.lowRate는 highRate 이하여야 합니다 (${t.lowRate} / ${t.highRate})`,
    );
  }

  const s = rules.safetyThreshold;
  if (!(s.safe <= s.caution)) {
    throw new Error(
      `룰셋 값 오류: safetyThreshold.safe는 caution 이하여야 합니다 (${s.safe} / ${s.caution})`,
    );
  }

  assertRatio(rules.ltv.regulated.default, "ltv.regulated.default");
  assertRatio(rules.ltv.regulated.firstTimeBuyer, "ltv.regulated.firstTimeBuyer");
  assertRatio(rules.ltv.unregulated.default, "ltv.unregulated.default");
  assertRatio(
    rules.ltv.unregulated.firstTimeBuyer,
    "ltv.unregulated.firstTimeBuyer",
  );
  assertRatio(rules.dsrLimit, "dsrLimit");

  // 중개보수 부가세는 세율이지 "소득·가격의 몇 %" 비율이 아니므로
  // assertRatio의 (0, 1]이 아니라 baseRate와 같은 [0, 1)로 검사한다.
  assertRate(rules.brokerageVatRate, "brokerageVatRate");

  // housingBond의 두 assumed* 값은 검증되지 않은 가정치이지만, 값 자체는
  // "비율"이라는 의미를 가지므로 (0, 1] 범위 검사는 그대로 적용한다.
  assertRatio(
    rules.housingBond.assumedPriceToStandardRatio,
    "housingBond.assumedPriceToStandardRatio",
  );
  assertRatio(
    rules.housingBond.assumedDiscountRate,
    "housingBond.assumedDiscountRate",
  );
  rules.housingBond.brackets.forEach((bracket, index) => {
    assertNonNegative(
      bracket.perThousand,
      `housingBond.brackets[${index}].perThousand`,
    );
  });

  // baseRate가 자릿수 하나만 빠져도(0.042 → 0.0042) DSR 한도가 몇 배로
  // 뛴다. 이자율은 0(무이자)부터 시작할 수 있지만 100% 이상은 데이터
  // 오류이므로 LTV·DSR과 대칭적인 [0, 1) 범위로 잡는다.
  assertRate(rules.baseRate, "baseRate");

  // 가산금리가 음수면 "스트레스"가 오히려 한도를 늘리는 방향으로 뒤집힌다.
  assertNonNegative(rules.stressDSR.surcharge, "stressDSR.surcharge");
  assertNonNegative(rules.safetyStressSurcharge, "safetyStressSurcharge");

  assertNonNegative(rules.absoluteCap, "absoluteCap");
  assertNonNegative(rules.legalFee, "legalFee");
  assertNonNegative(rules.movingCost, "movingCost");

  rules.policyLoans.forEach((loan, index) => {
    const path = `policyLoans[${index}]`;
    assertNonNegative(loan.maxAmount, `${path}.maxAmount`);
    assertRate(loan.rate, `${path}.rate`);

    // 정책대출 경로는 absoluteCap을 걸지 않는다(calcPolicyLimit 참고) —
    // 그 예외는 상품 고시 한도가 이미 지역 절대캡보다 한참 아래라는
    // 데이터 가정 위에 서 있다. 그 가정을 여기서 강제하지 않으면, 고시
    // 한도를 캡 이상으로 잘못 입력한 상품이 캡을 그대로 우회해 버린다.
    if (!(loan.maxAmount <= rules.absoluteCap)) {
      throw new Error(
        `룰셋 값 오류: ${path}.maxAmount는 absoluteCap(${rules.absoluteCap}) 이하여야 합니다 (${loan.maxAmount})`,
      );
    }
  });

  rules.brokerageFee.forEach((bracket, index) => {
    const path = `brokerageFee[${index}]`;
    assertNonNegative(bracket.rate, `${path}.rate`);
    if (bracket.cap !== null) {
      assertNonNegative(bracket.cap, `${path}.cap`);
    }
  });
}

/** 값이 반드시 0 이상이어야 하는 금액·비율 필드에 쓰는 공용 검사 */
function assertNonNegative(value: number, path: string): void {
  if (!(value >= 0)) {
    throw new Error(`룰셋 값 오류: ${path}는 0 이상이어야 합니다 (${value})`);
  }
}

/**
 * "몇 %"를 뜻하는 비율 필드가 지정한 구간 안에 있는지 검사하는 공용 헬퍼.
 * 경계 포함 여부를 필드별로 다르게 줄 수 있다(LTV·DSR은 0을 허용하지
 * 않는 (0, 1], 금리는 0을 허용하는 [0, 1)).
 */
function assertRange(
  value: number,
  path: string,
  bounds: { min: number; max: number; minInclusive: boolean; maxInclusive: boolean },
): void {
  const { min, max, minInclusive, maxInclusive } = bounds;
  const okMin = minInclusive ? value >= min : value > min;
  const okMax = maxInclusive ? value <= max : value < max;
  if (!(okMin && okMax)) {
    const minPart = minInclusive ? `${min} 이상` : `${min} 초과`;
    const maxPart = maxInclusive ? `${max} 이하` : `${max} 미만`;
    throw new Error(
      `룰셋 값 오류: ${path}는 ${minPart} ${maxPart}여야 합니다 (${value})`,
    );
  }
}

/** LTV·DSR처럼 "소득·가격의 몇 %"를 뜻하는 비율은 (0, 1] 범위여야 한다 */
function assertRatio(value: number, path: string): void {
  assertRange(value, path, {
    min: 0,
    max: 1,
    minInclusive: false,
    maxInclusive: true,
  });
}

/**
 * 금리 필드는 [0, 1) 범위여야 한다. 0(무이자)은 유효하지만, 자릿수 하나가
 * 빠지거나(0.042 → 0.0042) 부호가 뒤집히는(0.015 → -0.015) 흔한 오타를
 * 모두 여기서 잡는다. 100% 이상 금리는 데이터 오류로 본다.
 */
function assertRate(value: number, path: string): void {
  assertRange(value, path, {
    min: 0,
    max: 1,
    minInclusive: true,
    maxInclusive: false,
  });
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
    if (!Object.hasOwn(ELIGIBILITY_FIELD_TYPES, key)) {
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

/**
 * "upTo 오름차순, 마지막 구간만 upTo가 null" 형태의 구간 배열을 검증하는
 * 공용 헬퍼. brokerageFee와 housingBond.brackets가 정확히 같은 모양이라
 * (오름차순 상한 + 마지막 구간만 무한대) 여기 하나로 묶었다 — 복붙하면
 * 한쪽만 고치고 다른 쪽을 잊는 결함이 반복된다. 상한(upTo) 이외의 나머지
 * 필드(rate/cap 또는 perThousand) 검증은 호출자가 validateItem으로 넘긴다.
 */
function validateAscendingBrackets(
  brackets: unknown[],
  pathPrefix: string,
  validateItem: (obj: Record<string, unknown>, path: string) => void,
): void {
  brackets.forEach((bracket, index) => {
    const path = `${pathPrefix}[${index}]`;
    const obj = assertPlainObject(bracket, path);
    validateItem(obj, path);
  });

  const last = brackets[brackets.length - 1] as { upTo: unknown };
  if (last.upTo !== null) {
    throw new Error(`룰셋 값 오류: ${pathPrefix} 마지막 구간의 upTo는 null이어야 합니다`);
  }

  let previous = 0;
  for (const bracket of brackets.slice(0, -1)) {
    const { upTo } = bracket as { upTo: unknown };
    if (typeof upTo !== "number" || !Number.isFinite(upTo)) {
      throw new Error(`룰셋 값 오류: ${pathPrefix} 구간의 upTo는 숫자 또는 null이어야 합니다`);
    }
    if (upTo <= previous) {
      throw new Error(`룰셋 값 오류: ${pathPrefix} 구간은 upTo 오름차순이어야 합니다`);
    }
    previous = upTo;
  }
}
