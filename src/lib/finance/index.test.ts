import { describe, expect, it } from "vitest";
import * as finance from "./index";

/**
 * 공개 API의 표면을 고정한다.
 *
 * index.ts에는 테스트가 없어서, export 한 줄을 지워도 아무것도 깨지지
 * 않았다(각 모듈의 테스트는 파일을 직접 import한다). 이름이 사라지면
 * 여기서 깨지게 한다.
 */
const EXPECTED_FUNCTIONS = [
  "assertHouseholdCountNoteRequired",
  "assertNoHomeNoteRequired",
  "assertNoOptimisticCostDirection",
  "assertValidProfile",
  "calcAcquisitionCosts",
  "calcAffordablePrice",
  "calcAvailableCash",
  "calcBurdenAt",
  "calcMaxLoan",
  "calcPolicyLimit",
  "calcSafePrice",
  "calcSafetyScore",
  "equalPrincipalSchedule",
  "householdCountNoteFor",
  "matchPolicyLoans",
  "maxPrincipal",
  "monthlyPayment",
  "ownFundsRequired",
  "parseRules",
] as const;

const EXPECTED_VALUES = ["NO_POLICY_LIMIT", "PRICE_STEP"] as const;

/**
 * `NO_ABSOLUTE_CAP`은 위 목록에 넣지 않는다 — 위 목록은 "숫자 상수는
 * 모두 유한하다"는 것도 함께 검사하는데(바로 아래 it.each), 이 상수만
 * 유일하게 `Number.POSITIVE_INFINITY`다(loan-limit.ts 참고, CAP 제약이
 * `min()`으로 합쳐지므로 부재의 정확한 표현이 Infinity다). 같은 검사에
 * 섞으면 그 검사 자체가 깨지므로 따로 다룬다.
 */
const EXPECTED_INFINITE_VALUES = ["NO_ABSOLUTE_CAP"] as const;

describe("finance 공개 API", () => {
  it.each(EXPECTED_FUNCTIONS)("%s를 함수로 export한다", (name) => {
    expect(typeof finance[name]).toBe("function");
  });

  it.each(EXPECTED_VALUES)("%s를 숫자 상수로 export한다", (name) => {
    expect(Number.isFinite(finance[name])).toBe(true);
  });

  it.each(EXPECTED_INFINITE_VALUES)("%s를 Infinity 상수로 export한다", (name) => {
    expect(finance[name]).toBe(Number.POSITIVE_INFINITY);
  });

  it("문서화된 계약값을 그대로 노출한다", () => {
    // "10만원 단위로 내림"은 UI가 함께 지켜야 하는 계약이다
    expect(finance.PRICE_STEP).toBe(100_000);
    // 최대값 의미론에서 "정책대출 선택지 없음"은 0이다
    expect(finance.NO_POLICY_LIMIT).toBe(0);
  });

  it("export한 이름 외에 예상치 못한 것이 새로 늘지 않았다", () => {
    const actual = Object.keys(finance).sort();
    const expected = [
      ...EXPECTED_FUNCTIONS,
      ...EXPECTED_VALUES,
      ...EXPECTED_INFINITE_VALUES,
    ].sort();
    expect(actual).toEqual(expected);
  });
});
