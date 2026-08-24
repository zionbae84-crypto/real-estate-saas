import type { BuyerProfile } from "./types";

/**
 * 프로필의 숫자 필드. 모두 필수이며 음수가 될 수 없다.
 * 여기에 필드를 추가하면 그 필드도 자동으로 검증된다.
 */
const PROFILE_NUMBER_FIELDS = [
  "cash",
  "annualIncome",
  "existingDebtAnnualPayment",
  "exclusiveAreaSqm",
] as const;

/**
 * 프로필의 불리언 필드. 모두 필수다.
 * 여기에 필드를 추가하면 그 필드도 자동으로 검증된다.
 */
const PROFILE_BOOLEAN_FIELDS = ["isFirstTimeBuyer", "isRegulatedArea"] as const;

/**
 * 계산에 넣기 전에 구매자 프로필을 검증한다.
 *
 * 이 엔진의 소비자는 웹 위저드다. `Number("1억")`은 NaN이고, NaN은 모든
 * 비교가 false라 대출 한도 최소값 스캔에서 조용히 탈락한다 — 즉 제약이
 * 사라진 채로 "더 많이 빌릴 수 있다"는 답이 나온다. 안전하지 않은 방향의
 * 오답이므로, 계산을 시작하기 전에 반드시 끊는다.
 *
 * 순수 함수이며, 문제가 없으면 아무것도 하지 않는다.
 */
export function assertValidProfile(profile: BuyerProfile): void {
  for (const field of PROFILE_NUMBER_FIELDS) {
    assertNonNegativeFinite(profile[field], field);
  }
  for (const field of PROFILE_BOOLEAN_FIELDS) {
    assertBoolean(profile[field], field);
  }

  // 주택 수는 "채" 단위라 정수여야 한다. 소수(1.5채)는 폼이 만들 수 없는
  // 값이므로 들어왔다면 어딘가 파싱이 샌 것이고, 그대로 흘리면
  // maxOwnedHomes 비교가 사람이 예상하지 못한 쪽으로 갈린다.
  assertNonNegativeInteger(profile.ownedHomeCount, "ownedHomeCount");

  // 두 축(주택 수 · 매도 여부)의 아귀를 맞춘다.
  //
  // "갈아타기"는 기존 주택을 팔아 그 대금을 현금에 보탠다는 뜻이다
  // (calcAvailableCash). 그런데 보유 주택이 0채면 팔 집이 없다 — 그
  // 조합은 매도 대금을 더하면서 동시에 무주택 정책대출 자격까지
  // 유지하는, 정확히 이 제품이 피해야 하는 낙관 방향의 프로필이다.
  // 경계에서 끊는다.
  if (profile.status === "갈아타기" && profile.ownedHomeCount < 1) {
    throw new RangeError(`갈아타기인데 보유 주택이 0채입니다: ownedHomeCount (${String(profile.ownedHomeCount)})`);
  }

  const home = profile.existingHome;
  if (home === undefined) return;

  assertNonNegativeFinite(
    home.expectedSalePrice,
    "existingHome.expectedSalePrice",
  );
  assertNonNegativeFinite(home.remainingLoan, "existingHome.remainingLoan");
  // 양도세는 선택 입력이다. 입력했다면 그 값은 유효해야 한다.
  if (home.capitalGainsTax !== undefined) {
    assertNonNegativeFinite(
      home.capitalGainsTax,
      "existingHome.capitalGainsTax",
    );
  }
}

/**
 * 값이 유한하고 0 이상인 숫자인지 검사하는 공용 헬퍼.
 *
 * 프로필 필드 검증에서 시작했지만 이름이 뜻하는 성질 자체(유한·비음수)는
 * 프로필에 국한되지 않는다 — calcMaxLoan 등 공개 진입점의 price 인자도
 * 같은 성질을 요구하므로(loan-limit.ts, acquisition-cost.ts 참고),
 * 같은 검사를 복제하는 대신 이 헬퍼를 그대로 재사용한다.
 */
export function assertNonNegativeFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`유효한 숫자가 아닙니다: ${path} (${String(value)})`);
  }
  if (value < 0) {
    throw new RangeError(`0 이상이어야 합니다: ${path} (${String(value)})`);
  }
}

/**
 * 값이 유한하고 0 이상인 **정수**인지 검사하는 공용 헬퍼.
 *
 * {@link assertNonNegativeFinite}를 먼저 거친 뒤 정수 여부만 더 본다 —
 * NaN·Infinity·음수의 메시지를 한 곳에 모아 두기 위해서다.
 */
function assertNonNegativeInteger(value: number, path: string): void {
  assertNonNegativeFinite(value, path);
  if (!Number.isInteger(value)) {
    throw new RangeError(`정수여야 합니다: ${path} (${String(value)})`);
  }
}

/**
 * 값이 불리언인지 검사하는 공용 헬퍼.
 *
 * 이 엔진의 소비자는 웹 위저드다. 폼 상태가 문자열("true")이나 undefined로
 * 새는 경로가 생기면, isRegulatedArea 같은 필드가 항상 false(falsy)로
 * 취급돼 규제지역 구매자에게 비규제 LTV(70%)를 적용하는 안전하지 않은
 * 방향의 오답이 조용히 나온다. 그래서 계산을 시작하기 전에 타입 자체를
 * 경계에서 끊는다.
 */
function assertBoolean(value: boolean, path: string): void {
  if (typeof value !== "boolean") {
    throw new RangeError(`유효한 불리언이 아닙니다: ${path} (${String(value)})`);
  }
}
