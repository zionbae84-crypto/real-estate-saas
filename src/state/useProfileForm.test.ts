import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM_STATE,
  loadStoredState,
  toProfile,
  type ProfileFormState,
} from "./useProfileForm";

function state(overrides: Partial<ProfileFormState> = {}): ProfileFormState {
  return { ...DEFAULT_FORM_STATE, ...overrides };
}

describe("DEFAULT_FORM_STATE", () => {
  it("생애최초는 꺼진 쪽이 기본이다 — 켜두면 한도를 과대평가한다", () => {
    expect(DEFAULT_FORM_STATE.isFirstTimeBuyer).toBe(false);
  });

  it("필수값은 비어 있고 나머지는 기본값이 있다", () => {
    expect(DEFAULT_FORM_STATE.cash).toBeNull();
    expect(DEFAULT_FORM_STATE.annualIncome).toBeNull();
    // 다른 금액 필드(cash, annualIncome)처럼 미입력 상태는 null이다.
    // 0을 기본값으로 두면 입력란이 "0"으로 시작해 지울 방법이 없어진다
    // (toProfile이 null을 0으로 좁혀 엔진에는 그대로 0으로 전달된다).
    expect(DEFAULT_FORM_STATE.existingDebtAnnualPayment).toBeNull();
    expect(DEFAULT_FORM_STATE.status).toBe("무주택");
    expect(DEFAULT_FORM_STATE.exclusiveAreaSqm).toBe(84);
  });
});

describe("toProfile", () => {
  it("현금이 없으면 null이다", () => {
    expect(toProfile(state({ annualIncome: 50_000_000 }))).toBeNull();
  });

  it("소득이 없으면 null이다", () => {
    expect(toProfile(state({ cash: 200_000_000 }))).toBeNull();
  });

  it("두 필수값이 있으면 프로필을 만든다", () => {
    const profile = toProfile(
      state({ cash: 200_000_000, annualIncome: 50_000_000 }),
    );
    expect(profile).toEqual({
      status: "무주택",
      cash: 200_000_000,
      annualIncome: 50_000_000,
      existingDebtAnnualPayment: 0,
      isFirstTimeBuyer: false,
      exclusiveAreaSqm: 84,
    });
  });

  it("무주택이면 existingHome을 넣지 않는다", () => {
    const profile = toProfile(
      state({
        cash: 1,
        annualIncome: 1,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: null,
        },
      }),
    );
    expect(profile?.existingHome).toBeUndefined();
  });

  it("갈아타기면서 기존주택 필수 두 값이 있으면 existingHome을 넣는다", () => {
    const profile = toProfile(
      state({
        cash: 1,
        annualIncome: 1,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      }),
    );
    expect(profile?.existingHome).toEqual({
      expectedSalePrice: 700_000_000,
      remainingLoan: 300_000_000,
      capitalGainsTax: 20_000_000,
    });
  });

  it("양도세 미입력이면 capitalGainsTax를 생략한다 — 엔진이 경고를 낸다", () => {
    const profile = toProfile(
      state({
        cash: 1,
        annualIncome: 1,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: null,
        },
      }),
    );
    expect(profile?.existingHome?.capitalGainsTax).toBeUndefined();
  });

  it("갈아타기인데 기존주택 값이 없으면 existingHome 없이 만든다", () => {
    const profile = toProfile(
      state({ cash: 1, annualIncome: 1, status: "갈아타기" }),
    );
    expect(profile).not.toBeNull();
    expect(profile?.existingHome).toBeUndefined();
  });
});

describe("loadStoredState", () => {
  function storage(value: string | null): Pick<Storage, "getItem"> {
    return { getItem: () => value };
  }

  it("저장된 값이 없으면 기본값이다", () => {
    expect(loadStoredState(storage(null))).toEqual(DEFAULT_FORM_STATE);
  });

  it("깨진 JSON이면 조용히 기본값으로 돌아간다", () => {
    expect(loadStoredState(storage("{{{"))).toEqual(DEFAULT_FORM_STATE);
  });

  it("타입이 어긋난 필드는 기본값으로 대체한다", () => {
    const stored = JSON.stringify({
      cash: "이백만원",
      annualIncome: 50_000_000,
      exclusiveAreaSqm: -5,
      status: "외계인",
    });
    const loaded = loadStoredState(storage(stored));
    expect(loaded.cash).toBeNull();
    expect(loaded.annualIncome).toBe(50_000_000);
    expect(loaded.exclusiveAreaSqm).toBe(84);
    expect(loaded.status).toBe("무주택");
  });

  it("정상 저장값은 그대로 복원한다", () => {
    const stored = JSON.stringify({
      ...DEFAULT_FORM_STATE,
      cash: 200_000_000,
      annualIncome: 70_000_000,
      isFirstTimeBuyer: true,
    });
    const loaded = loadStoredState(storage(stored));
    expect(loaded.cash).toBe(200_000_000);
    expect(loaded.isFirstTimeBuyer).toBe(true);
  });
});
