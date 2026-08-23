import { calcAbsoluteCap } from "./loan-limit";
import type { PolicyLoanRule, Rules } from "./types";

const REQUIRED_NUMBER_FIELDS = [
  "baseRate",
  "loanTermMonths",
  "safetyStressSurcharge",
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

  const absoluteCap = assertPlainObject(r.absoluteCap, "absoluteCap");
  if (!Array.isArray(absoluteCap.brackets) || absoluteCap.brackets.length === 0) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: absoluteCap.brackets");
  }
  validateAscendingBrackets(
    absoluteCap.brackets,
    "absoluteCap.brackets",
    (obj, path) => assertNumberField(obj, "amount", `${path}.amount`),
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
    throw new Error(`룰셋 값 오류: acquisitionTax.lowerBound는 upperBound보다 작아야 합니다 (${t.lowerBound} / ${t.upperBound})`);
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
    throw new Error(`룰셋 값 오류: acquisitionTax.lowRate는 highRate 이하여야 합니다 (${t.lowRate} / ${t.highRate})`);
  }

  const s = rules.safetyThreshold;
  if (!(s.safe <= s.caution)) {
    throw new Error(`룰셋 값 오류: safetyThreshold.safe는 caution 이하여야 합니다 (${s.safe} / ${s.caution})`);
  }

  assertRatio(rules.ltv.regulated.default, "ltv.regulated.default");
  assertRatio(rules.ltv.regulated.firstTimeBuyer, "ltv.regulated.firstTimeBuyer");
  assertRatio(rules.ltv.unregulated.default, "ltv.unregulated.default");
  assertRatio(
    rules.ltv.unregulated.firstTimeBuyer,
    "ltv.unregulated.firstTimeBuyer",
  );

  // 규제지역은 담보가치를 더 보수적으로 본다 — 규제지역 LTV가 비규제보다
  // 높아지는 것은 값이 뒤바뀐 오타(예: regulated.default: 0.7,
  // unregulated.default: 0.4)일 가능성이 압도적으로 크고, 그 방향의
  // 오타는 규제지역 한도를 과대평가한다. 이 브랜치가 고친 결함과 정확히
  // 같은 모양이므로, 자동으로 잡히게 여기서 부등식으로 고정한다.
  if (!(rules.ltv.regulated.default <= rules.ltv.unregulated.default)) {
    throw new Error(`룰셋 값 오류: ltv.regulated.default는 ltv.unregulated.default 이하여야 합니다 (${rules.ltv.regulated.default} / ${rules.ltv.unregulated.default})`);
  }
  if (
    !(
      rules.ltv.regulated.firstTimeBuyer <= rules.ltv.unregulated.firstTimeBuyer
    )
  ) {
    throw new Error(`룰셋 값 오류: ltv.regulated.firstTimeBuyer는 ltv.unregulated.firstTimeBuyer 이하여야 합니다 (${rules.ltv.regulated.firstTimeBuyer} / ${rules.ltv.unregulated.firstTimeBuyer})`);
  }

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

  assertNonNegative(rules.legalFee, "legalFee");
  assertNonNegative(rules.movingCost, "movingCost");

  rules.absoluteCap.brackets.forEach((bracket, index) => {
    assertNonNegative(bracket.amount, `absoluteCap.brackets[${index}].amount`);
  });

  // absoluteCap은 가격이 올라갈수록 낮아지거나 같아야지, 높아지면 안 된다
  // (비증가). 실제 규제에서 주담대 절대 상한은 고가주택일수록 강하게
  // 죄지, 완화되지 않는다(예: "15억 이하 6억 → 15억 초과 4억"은 있어도
  // 그 반대는 없다). 올라가는 캡은 오타이거나 값 오입력이다.
  //
  // 이 불변식이 없으면 buildSearchSegments(affordable-price.ts)가 절벽에서
  // 나눈 구간 하나가 실제로는 "선택지 상실 → 한도 하락"이 아니라 "한도
  // 상승"이 되어, ownFunds가 그 경계에서 오히려 떨어진다. 그러면 감당
  // 가능한 가격 집합이 두 덩어리로 갈라지고, 분할되지 않은 이분 탐색은
  // 낮은 쪽 덩어리에 수렴해 실구매력을 조용히 과소 계상한다(억 단위로
  // 틀릴 수 있음이 리뷰에서 실측됨). 데이터 오류를 계산에 흘리지 않고
  // 여기, 파싱 단계에서 시끄럽게 끊는다.
  //
  // 같은 값이 반복되는 평평한 구간(비증가의 등호 쪽)은 오류가 아니므로
  // 허용한다.
  let previousCapAmount: number | null = null;
  rules.absoluteCap.brackets.forEach((bracket, index) => {
    if (previousCapAmount !== null && bracket.amount > previousCapAmount) {
      throw new Error(`룰셋 값 오류: absoluteCap.brackets의 amount는 가격이 올라갈수록 커지면 안 됩니다 (구간 ${index - 1}: ${previousCapAmount} → 구간 ${index}: ${bracket.amount})`);
    }
    previousCapAmount = bracket.amount;
  });

  rules.policyLoans.forEach((loan, index) => {
    const path = `policyLoans[${index}]`;
    assertNonNegative(loan.maxAmount, `${path}.maxAmount`);
    assertRate(loan.rate, `${path}.rate`);

    // 정책대출 경로는 absoluteCap을 걸지 않는다(calcPolicyLimit 참고) —
    // 그 예외는 상품 고시 한도가 이미 지역 절대캡보다 한참 아래라는
    // 데이터 가정 위에 서 있다. 그 가정을 여기서 강제하지 않으면, 고시
    // 한도를 캡 이상으로 잘못 입력한 상품이 캡을 그대로 우회해 버린다.
    //
    // 캡이 주택가격 구간 함수가 되면서 "어느 구간의 캡과 비교할 것인가"가
    // 생겼다. 답은 **그 상품이 자격을 유지하는 최고 가격에서의 캡**이다.
    // 그보다 비싼 집에서는 애초에 그 상품을 받을 수 없으므로 우회가
    // 성립하지 않는다. 가격 상한이 없는 상품은 어떤 가격에서도 자격이
    // 있으므로 가장 낮은(=가장 엄격한) 구간의 캡과 비교한다.
    const capForLoan = capAtHighestEligiblePrice(rules, loan);
    if (!(loan.maxAmount <= capForLoan)) {
      throw new Error(`룰셋 값 오류: ${path}.maxAmount는 자격 최고가에서의 absoluteCap(${capForLoan}) 이하여야 합니다 (${loan.maxAmount})`);
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
    throw new Error(`룰셋 값 오류: ${path}는 ${minPart} ${maxPart}여야 합니다 (${value})`);
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
 * 정책대출 상품 하나가 자격을 유지할 수 있는 최고 주택가격에서의 절대캡.
 *
 * `eligibility.maxHousePrice`가 있으면 그 가격에서의 캡이다. 없으면 어떤
 * 가격에서도 자격이 있다는 뜻이므로, 구간 중 가장 작은 캡을 쓴다 — 캡이
 * 가격에 따라 단조 비증가라는 사실은 validateSemanticInvariants가 이
 * 호출보다 먼저 강제하지만(위 absoluteCap.brackets 비증가 검사), 그래도
 * 최소값을 직접 스캔해 어떤 구간 배치에도 맞는 값을 구한다.
 *
 * 가격→캡 조회는 `loan-limit.ts`의 `calcAbsoluteCap` 하나만 쓴다. 검증과
 * 계산이 다른 규칙을 쓰면 조용히 어긋나므로 복제하지 않는다.
 */
function capAtHighestEligiblePrice(rules: Rules, loan: PolicyLoanRule): number {
  const maxPrice = loan.eligibility.maxHousePrice;
  if (maxPrice !== undefined) {
    return calcAbsoluteCap(rules, maxPrice);
  }
  let smallest = Number.POSITIVE_INFINITY;
  for (const bracket of rules.absoluteCap.brackets) {
    if (bracket.amount < smallest) smallest = bracket.amount;
  }
  return smallest;
}

/**
 * "upTo 오름차순, 마지막 구간만 upTo가 null" 형태의 구간 배열을 검증하는
 * 공용 헬퍼. brokerageFee·housingBond.brackets·absoluteCap.brackets가
 * 정확히 같은 모양이라(오름차순 상한 + 마지막 구간만 무한대) 여기 하나로
 * 묶었다 — 복붙하면 한쪽만 고치고 다른 쪽을 잊는 결함이 반복된다.
 * 상한(upTo) 이외의 나머지 필드(rate/cap 또는 perThousand 또는 amount)
 * 검증은 호출자가 validateItem으로 넘긴다.
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
