import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { rules } from "./useAffordability";
import {
  DEFAULT_FORM_STATE,
  loadStoredState,
  toProfile,
  useProfileForm,
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
  });

  it("전용면적 기본값은 농특세 임계값을 넘는 쪽이다 — 숫자를 박지 않고 룰셋에서 유도한다", () => {
    // 예전에는 84로 박혀 있었는데, 농특세 임계값(85㎡ 초과)보다 낮아
    // 부대비용을 과소 계상하고 살 수 있는 가격을 과대 계상했다 — 이
    // 제품이 절대 하면 안 되는 방향의 결함이었다. 여기서 숫자(86)를
    // 다시 박으면 같은 실수를 테스트에서 반복하는 셈이라, 룰셋 임계값
    // 기준으로 "그 값을 넘는지"를 확인한다.
    expect(DEFAULT_FORM_STATE.exclusiveAreaSqm).toBeGreaterThan(
      rules.acquisitionTax.ruralTaxAreaThresholdSqm,
    );
    expect(DEFAULT_FORM_STATE.exclusiveAreaSqm).toBe(
      rules.acquisitionTax.ruralTaxAreaThresholdSqm + 1,
    );
  });

  it("touched는 처음엔 비어 있다 — 전부 가정 중이라는 뜻이다", () => {
    expect(DEFAULT_FORM_STATE.touched).toEqual([]);
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
      exclusiveAreaSqm: DEFAULT_FORM_STATE.exclusiveAreaSqm,
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
    expect(loaded.exclusiveAreaSqm).toBe(DEFAULT_FORM_STATE.exclusiveAreaSqm);
    expect(loaded.status).toBe("무주택");
  });

  it("touched가 없는 옛 저장본은 빈 배열로 채운다 — 전부 가정 중이라는 안전한 뜻이다", () => {
    const stored = JSON.stringify({
      cash: 200_000_000,
      annualIncome: 50_000_000,
    });
    expect(loadStoredState(storage(stored)).touched).toEqual([]);
  });

  it("유효한 touched 항목은 그대로 복원한다", () => {
    const stored = JSON.stringify({
      ...DEFAULT_FORM_STATE,
      touched: ["existingDebt", "area"],
    });
    expect(loadStoredState(storage(stored)).touched).toEqual([
      "existingDebt",
      "area",
    ]);
  });

  it("touched에 알 수 없는 값이 섞여 있으면 걸러낸다", () => {
    const stored = JSON.stringify({
      ...DEFAULT_FORM_STATE,
      touched: ["existingDebt", "조작된값", 123],
    });
    expect(loadStoredState(storage(stored)).touched).toEqual([
      "existingDebt",
    ]);
  });

  it("touched가 배열이 아니면 빈 배열로 대체한다", () => {
    const stored = JSON.stringify({ ...DEFAULT_FORM_STATE, touched: "전부" });
    expect(loadStoredState(storage(stored)).touched).toEqual([]);
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

  describe("리뷰 수정: 옛 갈아타기 상태를 화면 없이 조용히 반영하지 않는다 (Important 3, 방향 a)", () => {
    // status/existingHome UI가 ProfileForm에서 완전히 빠졌다. 이 상태에서
    // 옛 저장본의 "갈아타기"를 그대로 복원해 반영하면, 사용자가 보지도
    // 고치지도 못하는 채로 구매력(가용 현금)이 매도 순자산만큼 조용히
    // 올라간다 — 이 제품이 절대 하면 안 되는 방향이다. 편집 UI가 돌아올
    // 때까지는 안전한 기본값(무주택)으로 되돌린다.
    it("옛 저장본의 status가 갈아타기여도 무주택으로 되돌린다", () => {
      const stored = JSON.stringify({
        cash: 50_000_000,
        annualIncome: 100_000_000,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      });
      const loaded = loadStoredState(storage(stored));
      expect(loaded.status).toBe("무주택");
    });

    it("toProfile도 무주택으로 처리해 existingHome을 엔진에 넘기지 않는다 — 구매력이 조용히 올라가지 않는다", () => {
      const stored = JSON.stringify({
        cash: 50_000_000,
        annualIncome: 100_000_000,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      });
      const loaded = loadStoredState(storage(stored));
      const profile = toProfile(loaded);
      expect(profile?.existingHome).toBeUndefined();
    });

    it("existingHome 값 자체는 보존한다 — 편집 UI가 돌아왔을 때 데이터를 잃지 않는다", () => {
      const stored = JSON.stringify({
        cash: 50_000_000,
        annualIncome: 100_000_000,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      });
      const loaded = loadStoredState(storage(stored));
      expect(loaded.existingHome).toEqual({
        expectedSalePrice: 700_000_000,
        remainingLoan: 300_000_000,
        capitalGainsTax: 20_000_000,
      });
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
      // 리뷰 수정(Important 3, 방향 a) 이후 loadStoredState는 status를
      // 항상 "무주택"으로 되돌린다 — 여기서 검증하려는 것은 그 결정과
      // 무관한 toProfile의 capitalGainsTax 0/undefined 정규화이므로,
      // existingHome 파싱은 loadStoredState로 거치고 status만 테스트가
      // 직접 "갈아타기"로 되돌려 toProfile의 existingHome 분기를 태운다.
      const zero = loadStoredState(
        storage(
          JSON.stringify({
            cash: 1,
            annualIncome: 1,
            existingHome: {
              expectedSalePrice: 700_000_000,
              remainingLoan: 300_000_000,
              capitalGainsTax: 0,
            },
          }),
        ),
      );
      expect(
        toProfile({ ...zero, status: "갈아타기" })?.existingHome
          ?.capitalGainsTax,
      ).toBe(0);

      const missing = loadStoredState(
        storage(
          JSON.stringify({
            cash: 1,
            annualIncome: 1,
            existingHome: {
              expectedSalePrice: 700_000_000,
              remainingLoan: 300_000_000,
              capitalGainsTax: null,
            },
          }),
        ),
      );
      expect(
        toProfile({ ...missing, status: "갈아타기" })?.existingHome
          ?.capitalGainsTax,
      ).toBeUndefined();
    });
  });
});

describe("useProfileForm — setField가 touched를 기록한다", () => {
  beforeEach(() => window.localStorage.clear());

  it("기존 부채를 바꾸면 existingDebt가 touched에 들어간다", () => {
    const { result } = renderHook(() => useProfileForm());
    expect(result.current.state.touched).not.toContain("existingDebt");

    act(() => result.current.setField("existingDebtAnnualPayment", 1_200_000));

    expect(result.current.state.touched).toContain("existingDebt");
  });

  it("규제지역을 바꾸면 regulatedArea가 touched에 들어간다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("isRegulatedArea", false));
    expect(result.current.state.touched).toContain("regulatedArea");
  });

  it("전용면적을 바꾸면 area가 touched에 들어간다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("exclusiveAreaSqm", 59));
    expect(result.current.state.touched).toContain("area");
  });

  it("cash·annualIncome·isFirstTimeBuyer는 touched에 기록되지 않는다", () => {
    // 이 셋은 첫 화면에 늘 보이는 필수 입력이라 "가정"이라는 개념 자체가
    // 없다 — AssumableField에 속하지 않는다.
    const { result } = renderHook(() => useProfileForm());
    act(() => {
      result.current.setField("cash", 100_000_000);
      result.current.setField("annualIncome", 50_000_000);
      result.current.setField("isFirstTimeBuyer", true);
    });
    expect(result.current.state.touched).toEqual([]);
  });

  it("기존 부채 입력에서 파싱 실패로 null이 넘어오면 touched에 기록하지 않는다", () => {
    // MoneyInput은 못 읽는 값(예: 지운 빈 칸, 문자 섞인 값)일 때
    // onChange(null)을 부른다. 이때 existingDebt를 touched로 표시하면,
    // AssumptionLine은 "사용자가 부채를 확정했다"고 오해해 문구를 감추는데
    // 실제 계산은 여전히 0을 가정한다 — 문구와 계산이 어긋난다. 값이 실제로
    // 있을 때만 touched로 기록해야 한다.
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("existingDebtAnnualPayment", null));
    expect(result.current.state.touched).not.toContain("existingDebt");
  });

  it("기존 부채에 실제 값을 넣으면 여전히 touched에 기록된다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("existingDebtAnnualPayment", 1_200_000));
    expect(result.current.state.touched).toContain("existingDebt");
  });

  it("같은 항목을 두 번 바꿔도 touched에 중복으로 쌓이지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => {
      result.current.setField("exclusiveAreaSqm", 59);
      result.current.setField("exclusiveAreaSqm", 40);
    });
    expect(
      result.current.state.touched.filter((f) => f === "area"),
    ).toHaveLength(1);
  });
});
