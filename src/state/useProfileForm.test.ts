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

  it("규제지역 기본값은 true다 — 과대평가를 피하는 쪽이다", () => {
    expect(DEFAULT_FORM_STATE.isRegulatedArea).toBe(true);
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
      // DEFAULT_FORM_STATE.isRegulatedArea가 true이므로 state()가 만드는
      // 기본 프로필에도 그대로 true가 전달된다.
      isRegulatedArea: true,
      exclusiveAreaSqm: 84,
    });
  });

  it("toProfile이 규제지역을 그대로 전달한다", () => {
    const profile = toProfile(
      state({ cash: 1, annualIncome: 1, isRegulatedArea: false }),
    );
    expect(profile?.isRegulatedArea).toBe(false);
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

  describe("isFirstTimeBuyer는 boolean이 아니면 기본값(false)으로 대체한다", () => {
    // localStorage는 사용자가 직접 고칠 수 있는 자리다. 문자열 "true"나
    // 숫자 1처럼 "참으로 보이는" 값이 그대로 통과하면, 켜두면 LTV·정책대출
    // 자격을 과대평가하는 이 플래그가 검증 없이 켜져 버린다.
    it.each([
      ["문자열 \"true\"", "true"],
      ["숫자 1", 1],
      ["문자열 \"1\"", "1"],
      ["null", null],
    ])("%s는 false로 떨어진다", (_label, value) => {
      const stored = JSON.stringify({ isFirstTimeBuyer: value });
      expect(loadStoredState(storage(stored)).isFirstTimeBuyer).toBe(false);
    });

    it("실제 boolean true는 그대로 복원한다", () => {
      const stored = JSON.stringify({ isFirstTimeBuyer: true });
      expect(loadStoredState(storage(stored)).isFirstTimeBuyer).toBe(true);
    });
  });

  describe("isRegulatedArea는 boolean이 아니면 기본값(true)으로 되돌린다", () => {
    // isFirstTimeBuyer와 같은 이유, 반대 방향: 이 필드는 꺼졌을 때(false)
    // LTV를 40%→70%로 과대평가한다. "참으로 보이는" 조작값이 검증 없이
    // 통과해 false로 떨어지면 안 되고, 항상 안전한 기본값(true)으로
    // 돌아가야 한다.
    it.each([
      ["문자열 \"true\"", '"true"'],
      ["숫자 1", "1"],
      ["null", "null"],
    ])("%s는 기본값(true)으로 되돌린다", (_label, bad) => {
      const stored = JSON.stringify({
        ...DEFAULT_FORM_STATE,
        isRegulatedArea: JSON.parse(bad),
      });
      const loaded = loadStoredState({ getItem: () => stored });
      expect(loaded.isRegulatedArea, bad).toBe(true);
    });

    it("실제 boolean false는 그대로 복원한다", () => {
      const stored = JSON.stringify({
        ...DEFAULT_FORM_STATE,
        isRegulatedArea: false,
      });
      const loaded = loadStoredState({ getItem: () => stored });
      expect(loaded.isRegulatedArea).toBe(false);
    });
  });

  describe("existingHome.capitalGainsTax: 0과 미입력(null)을 구분해 복원한다", () => {
    // 엔진은 capitalGainsTax가 "없을 때"만 양도세 미반영 경고를 낸다
    // (useProfileForm.ts의 toProfile 주석 참고). 0(양도세가 실제로
    // 0원)과 미입력을 구분하지 못하고 0이 "미입력"으로 저하되면, 양도세가
    // 정말 0원인 사용자에게도 필요 없는 경고가 뜨게 된다.
    it("0은 0으로 남는다 — null로 저하되지 않는다", () => {
      const stored = JSON.stringify({
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 0,
        },
      });
      const loaded = loadStoredState(storage(stored));
      expect(loaded.existingHome.capitalGainsTax).toBe(0);
    });

    it("미입력(null)은 null로 남는다", () => {
      const stored = JSON.stringify({
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: null,
        },
      });
      const loaded = loadStoredState(storage(stored));
      expect(loaded.existingHome.capitalGainsTax).toBeNull();
    });

    it("toProfile을 거쳐도 0은 0으로, null은 undefined(미반영 경고 대상)로 남는다", () => {
      const zero = loadStoredState(
        storage(
          JSON.stringify({
            cash: 1,
            annualIncome: 1,
            status: "갈아타기",
            existingHome: {
              expectedSalePrice: 700_000_000,
              remainingLoan: 300_000_000,
              capitalGainsTax: 0,
            },
          }),
        ),
      );
      expect(toProfile(zero)?.existingHome?.capitalGainsTax).toBe(0);

      const missing = loadStoredState(
        storage(
          JSON.stringify({
            cash: 1,
            annualIncome: 1,
            status: "갈아타기",
            existingHome: {
              expectedSalePrice: 700_000_000,
              remainingLoan: 300_000_000,
              capitalGainsTax: null,
            },
          }),
        ),
      );
      expect(toProfile(missing)?.existingHome?.capitalGainsTax).toBeUndefined();
    });
  });
});
