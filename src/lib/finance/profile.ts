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

function assertNonNegativeFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `프로필 필드가 유효한 숫자가 아닙니다: ${path} (${String(value)})`,
    );
  }
  if (value < 0) {
    throw new RangeError(
      `프로필 필드는 0 이상이어야 합니다: ${path} (${String(value)})`,
    );
  }
}
