import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAffordablePrice } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { assertValidProfile } from "./profile";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    // 이 파일의 기존 테스트는 전부 비규제 수도권 70% 기준으로 쓰였다.
    // 기본값을 false로 둬 기존 기대값이 그대로 유지되게 한다.
    isRegulatedArea: false,
    ...overrides,
  };
}

/** 필수 숫자 필드별로 "그 필드만 망가뜨린 프로필"을 만드는 케이스 목록 */
const NUMERIC_FIELD_CASES: Array<[string, (value: number) => BuyerProfile]> = [
  ["cash", (value) => profile({ cash: value })],
  ["annualIncome", (value) => profile({ annualIncome: value })],
  [
    "existingDebtAnnualPayment",
    (value) => profile({ existingDebtAnnualPayment: value }),
  ],
  ["exclusiveAreaSqm", (value) => profile({ exclusiveAreaSqm: value })],
];

describe("assertValidProfile", () => {
  it("정상 프로필은 통과시킨다", () => {
    expect(() => assertValidProfile(profile())).not.toThrow();
  });

  it("0은 유효한 값이다", () => {
    expect(() =>
      assertValidProfile(
        profile({
          cash: 0,
          annualIncome: 0,
          existingDebtAnnualPayment: 0,
          exclusiveAreaSqm: 0,
        }),
      ),
    ).not.toThrow();
  });

  it.each(NUMERIC_FIELD_CASES)(
    "%s가 NaN이면 필드명을 알려주며 실패한다",
    (field, make) => {
      expect(() => assertValidProfile(make(NaN))).toThrow(new RegExp(field));
    },
  );

  it.each(NUMERIC_FIELD_CASES)(
    "%s가 Infinity면 필드명을 알려주며 실패한다",
    (field, make) => {
      expect(() =>
        assertValidProfile(make(Number.POSITIVE_INFINITY)),
      ).toThrow(new RegExp(field));
    },
  );

  it.each(NUMERIC_FIELD_CASES)(
    "%s가 음수면 필드명을 알려주며 실패한다",
    (field, make) => {
      expect(() => assertValidProfile(make(-1))).toThrow(new RegExp(field));
    },
  );

  it("existingHome의 숫자 필드도 전체 경로로 검증한다", () => {
    expect(() =>
      assertValidProfile(
        profile({
          status: "갈아타기",
          ownedHomeCount: 1,
          existingHome: { expectedSalePrice: NaN, remainingLoan: 0 },
        }),
      ),
    ).toThrow(/existingHome\.expectedSalePrice/);

    expect(() =>
      assertValidProfile(
        profile({
          status: "갈아타기",
          ownedHomeCount: 1,
          existingHome: { expectedSalePrice: 700_000_000, remainingLoan: -1 },
        }),
      ),
    ).toThrow(/existingHome\.remainingLoan/);
  });

  it("isRegulatedArea가 불리언이 아니면 필드명을 알려주며 실패한다", () => {
    const broken = {
      ...profile(),
      isRegulatedArea: "true",
    } as unknown as BuyerProfile;
    expect(() => assertValidProfile(broken)).toThrow(/isRegulatedArea/);
  });

  it("양도세는 선택 입력이지만, 입력했다면 유효해야 한다", () => {
    const home = { expectedSalePrice: 700_000_000, remainingLoan: 300_000_000 };
    expect(() =>
      assertValidProfile(profile({ status: "갈아타기", ownedHomeCount: 1, existingHome: home })),
    ).not.toThrow();
    expect(() =>
      assertValidProfile(
        profile({
          status: "갈아타기",
          ownedHomeCount: 1,
          existingHome: { ...home, capitalGainsTax: NaN },
        }),
      ),
    ).toThrow(/existingHome\.capitalGainsTax/);
  });
});

describe("공개 진입점의 비유한 입력 방어", () => {
  // 회귀 방지: NaN 소득은 DSR 한도를 NaN으로 만들고, NaN은 모든 비교가
  // false라 최소값 스캔에서 제외되어 "DSR 제약이 없는" 답이 나왔었다.
  // 자신만만한 숫자 대신 예외가 나와야 한다.
  it("NaN 소득으로는 자신만만한 숫자 대신 예외가 나온다", () => {
    const broken = profile({ annualIncome: NaN });
    expect(() => calcMaxLoan(broken, rules, 600_000_000)).toThrow(
      /annualIncome/,
    );
    expect(() => calcAffordablePrice(broken, rules)).toThrow(/annualIncome/);
  });

  it("NaN 현금으로는 예외가 나온다", () => {
    const broken = profile({ cash: NaN });
    expect(() => calcAffordablePrice(broken, rules)).toThrow(/cash/);
  });

  it("룰셋에서 유입된 NaN도 최소값 스캔에 도달하기 전에 걸린다", () => {
    // 프로필 검증을 통과한 뒤에도 룰셋 쪽에서 NaN이 들어올 수 있다.
    // parseRules를 우회해 직접 만든 룰셋으로 최후 방어선을 검증한다.
    // NaN 주입 지점은 구간별 캡 스키마에 맞춰 bracket.amount로 옮겼다 —
    // calcAbsoluteCap이 이 NaN을 그대로 반환하고, Math.floor(NaN)이
    // breakdown.CAP에 실려 assertNoNaN에 잡히는 경로는 그대로다.
    const brokenRules = {
      ...rules,
      absoluteCap: { brackets: [{ upTo: null, amount: NaN }] },
    };
    expect(() => calcMaxLoan(profile(), brokenRules, 600_000_000)).toThrow(
      /NaN/,
    );
  });
});

/**
 * 주택 수는 "채" 단위의 정수이고, 매도 축(status)과 아귀가 맞아야 한다.
 *
 * 두 축을 나눈 대가로 "갈아타기인데 0채"라는 성립할 수 없는 조합이
 * 표현 가능해졌다 — 팔 집이 없는데 매도 대금을 현금에 더하면서 동시에
 * 무주택 정책대출 자격까지 유지하는, 정확히 이 제품이 피해야 하는
 * 낙관 방향의 프로필이다. 경계에서 끊는다.
 */
describe("assertValidProfile — 주택 수", () => {
  it("0채는 유효하다", () => {
    expect(() =>
      assertValidProfile(profile({ ownedHomeCount: 0 })),
    ).not.toThrow();
  });

  it("음수면 어느 필드인지 알려주며 실패한다", () => {
    expect(() => assertValidProfile(profile({ ownedHomeCount: -1 }))).toThrow(
      /ownedHomeCount/,
    );
  });

  it("소수면 실패한다", () => {
    expect(() => assertValidProfile(profile({ ownedHomeCount: 1.5 }))).toThrow(
      /ownedHomeCount/,
    );
  });

  it("NaN이면 실패한다", () => {
    expect(() => assertValidProfile(profile({ ownedHomeCount: NaN }))).toThrow(
      /ownedHomeCount/,
    );
  });

  it("갈아타기인데 0채면 실패한다", () => {
    expect(() =>
      assertValidProfile(profile({ status: "갈아타기", ownedHomeCount: 0 })),
    ).toThrow(/ownedHomeCount/);
  });

  it("갈아타기이면서 1채 이상이면 통과한다", () => {
    expect(() =>
      assertValidProfile(profile({ status: "갈아타기", ownedHomeCount: 1 })),
    ).not.toThrow();
  });

  it("무주택 상태(status)에서 주택 수가 1 이상인 것은 막지 않는다", () => {
    // 두 축은 독립이다 — 1채를 갖고 있으면서 팔지 않는 사람이 정확히
    // 이 조합이고, 그 사람이 바로 디딤돌 자격을 잃는 사람이다.
    expect(() =>
      assertValidProfile(profile({ status: "무주택", ownedHomeCount: 2 })),
    ).not.toThrow();
  });
});
