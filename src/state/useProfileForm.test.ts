import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { rules } from "./useAffordability";
import {
  ASSUMED_REMOVED_INPUTS,
  DEFAULT_FORM_STATE,
  loadStoredState,
  toProfile,
  useProfileForm,
  type ProfileFormState,
} from "./useProfileForm";

function state(overrides: Partial<ProfileFormState> = {}): ProfileFormState {
  return { ...DEFAULT_FORM_STATE, ...overrides };
}

const storage = (value: string | null) => ({ getItem: () => value });

const THRESHOLD = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

describe("DEFAULT_FORM_STATE", () => {
  it("필수값(현금·연 소득·주택 수)은 비어 있다", () => {
    expect(DEFAULT_FORM_STATE.cash).toBeNull();
    expect(DEFAULT_FORM_STATE.annualIncome).toBeNull();
    expect(DEFAULT_FORM_STATE.ownedHomeCount).toBeNull();
  });

  it("생애최초는 안전한 기본값(false)이라 미답변으로도 계산을 막지 않는다", () => {
    expect(DEFAULT_FORM_STATE.isFirstTimeBuyer).toBe(false);
  });

  it("규제지역 기본값은 true다 — 과대평가를 피하는 쪽이다", () => {
    expect(DEFAULT_FORM_STATE.isRegulatedArea).toBe(true);
  });

  /**
   * ⚠ **전용면적은 이제 폼 상태에 없다.** 헤드라인이 쓰는 면적은
   * `toProfile`이 룰셋의 `ruralTaxAreaThresholdSqm`에서 직접 읽는다(사용자
   * 지시로 평형대 질문 자체가 사라졌다) — 상태에 한 벌 더 두면 그 값과
   * 룰셋이 어긋나는 날이 오고, 어긋난 쪽이 조용히 계산을 움직인다.
   */
  it("전용면적은 폼 상태에 없다 — 룰셋에서 직접 읽는다", () => {
    expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain("exclusiveAreaSqm");
  });

  it("touched는 처음엔 비어 있다 — 규제지역이 아직 가정 중이라는 뜻이다", () => {
    expect(DEFAULT_FORM_STATE.touched).toEqual([]);
  });

  /**
   * ⚠ **여전히 없앤 입력(기존 대출)은 폼 상태에 없다.** 상태에 남겨 두면
   * 언젠가 어딘가에서 그 값이 읽히고, 화면에는 그 값을 보거나 고칠 자리가
   * 없다 — 이 저장소가 이미 겪은 결함의 모양이다. 값은
   * `ASSUMED_REMOVED_INPUTS` 한 곳에만 있다.
   *
   * 생애최초·주택 수는 사용자 지시로 다시 화면 1의 실제 질문이 됐으므로
   * (`ProfileFormState.ownedHomeCount`·`isFirstTimeBuyer`) 이 목록에서
   * 빠졌다 — 아래 별도 테스트가 그 둘이 폼 상태에 **있다**는 것을 잠근다.
   */
  it("기존 대출은 폼 상태에 없다", () => {
    expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain(
      "existingDebtAnnualPayment",
    );
  });

  it("생애최초·주택 수는 폼 상태에 있다 — 다시 실제 질문이다", () => {
    expect(Object.keys(DEFAULT_FORM_STATE)).toContain("isFirstTimeBuyer");
    expect(Object.keys(DEFAULT_FORM_STATE)).toContain("ownedHomeCount");
  });
});

describe("ASSUMED_REMOVED_INPUTS — 남은 가정(기존 대출)이 계산에 넘기는 값", () => {
  it("기존 대출 없음 하나만 남았다", () => {
    expect(ASSUMED_REMOVED_INPUTS).toEqual({
      existingDebtAnnualPayment: 0,
    });
  });
});

describe("toProfile", () => {
  it("현금이 없으면 null이다", () => {
    expect(
      toProfile(state({ annualIncome: 50_000_000, ownedHomeCount: 0 })),
    ).toBeNull();
  });

  it("소득이 없으면 null이다", () => {
    expect(
      toProfile(state({ cash: 100_000_000, ownedHomeCount: 0 })),
    ).toBeNull();
  });

  /**
   * 주택 수는 사용자 지시로 다시 실제 질문이 됐다 — cash·annualIncome과
   * 같은 자리에 서므로, 미답변(null)이면 다른 둘이 채워져 있어도 계산
   * 자체를 하지 않는다(`ProfileFormState.ownedHomeCount` 주석 참고).
   */
  it("주택 수가 없으면 null이다", () => {
    expect(
      toProfile(state({ cash: 100_000_000, annualIncome: 50_000_000 })),
    ).toBeNull();
  });

  it("현금·소득·주택 수가 있으면 프로필을 만든다", () => {
    expect(
      toProfile(
        state({
          cash: 100_000_000,
          annualIncome: 50_000_000,
          ownedHomeCount: 0,
          isFirstTimeBuyer: false,
        }),
      ),
    ).toEqual({
      status: "무주택",
      cash: 100_000_000,
      annualIncome: 50_000_000,
      isRegulatedArea: true,
      ownedHomeCount: 0,
      isFirstTimeBuyer: false,
      // 항상 룰셋 임계값(85㎡) 이하로 가정한다(사용자 지시로 평형대
      // 질문이 사라졌다) — 목록·상세가 그 매물의 실제 면적으로 다시
      // 계산해 85㎡ 초과분을 알린다.
      exclusiveAreaSqm: THRESHOLD,
      ...ASSUMED_REMOVED_INPUTS,
    });
  });

  /**
   * 생애최초·주택 수를 답하면 그 값이 그대로 프로필에 실린다 — 더는
   * `ASSUMED_REMOVED_INPUTS`를 거치지 않는다.
   */
  it("주택 수·생애최초를 답한 값 그대로 엔진에 넘긴다", () => {
    const profile = toProfile(
      state({
        cash: 100_000_000,
        annualIncome: 50_000_000,
        ownedHomeCount: 1,
        isFirstTimeBuyer: true,
      }),
    )!;
    expect(profile.ownedHomeCount).toBe(1);
    expect(profile.isFirstTimeBuyer).toBe(true);
  });

  /**
   * 계산에 실제로 넘어가는 값이 화면이 적는 문장과 같은 원본에서 와야
   * 둘이 어긋날 수 없다. 이제 이 원본에 남은 것은 기존 대출뿐이다.
   */
  it("남은 가정(기존 대출)을 ASSUMED_REMOVED_INPUTS 그대로 엔진에 넘긴다", () => {
    const profile = toProfile(
      state({
        cash: 100_000_000,
        annualIncome: 50_000_000,
        ownedHomeCount: 0,
      }),
    )!;
    expect(profile.existingDebtAnnualPayment).toBe(
      ASSUMED_REMOVED_INPUTS.existingDebtAnnualPayment,
    );
  });

  /**
   * 폼 상태에는 면적이 없다 — 엔진에 넘어가는 값은 언제나 룰셋의
   * `ruralTaxAreaThresholdSqm`이어야 한다(사용자 지시로 평형대 선택이
   * 사라졌다). 입력값과 무관하게 항상 같은 값인지 여기서 잠근다.
   */
  it("엔진에 넘기는 전용면적은 항상 룰셋 임계값이다", () => {
    const profile = toProfile(
      state({ cash: 1, annualIncome: 1, ownedHomeCount: 0 }),
    )!;
    expect(profile.exclusiveAreaSqm).toBe(THRESHOLD);
  });

  it("규제지역을 그대로 전달한다", () => {
    expect(
      toProfile(
        state({
          cash: 1,
          annualIncome: 1,
          ownedHomeCount: 0,
          isRegulatedArea: false,
        }),
      )?.isRegulatedArea,
    ).toBe(false);
  });

  it("무주택이면 existingHome을 넣지 않는다", () => {
    expect(
      toProfile(
        state({
          cash: 1,
          annualIncome: 1,
          ownedHomeCount: 0,
          existingHome: {
            expectedSalePrice: 700_000_000,
            remainingLoan: 300_000_000,
            capitalGainsTax: null,
          },
        }),
      )?.existingHome,
    ).toBeUndefined();
  });

  it("갈아타기면서 기존주택 필수 두 값이 있으면 existingHome을 넣는다", () => {
    expect(
      toProfile(
        state({
          cash: 1,
          annualIncome: 1,
          ownedHomeCount: 1,
          status: "갈아타기",
          existingHome: {
            expectedSalePrice: 700_000_000,
            remainingLoan: 300_000_000,
            capitalGainsTax: 20_000_000,
          },
        }),
      )?.existingHome,
    ).toEqual({
      expectedSalePrice: 700_000_000,
      remainingLoan: 300_000_000,
      capitalGainsTax: 20_000_000,
    });
  });

  it("양도세 미입력이면 capitalGainsTax를 생략한다 — 엔진이 경고를 낸다", () => {
    expect(
      toProfile(
        state({
          cash: 1,
          annualIncome: 1,
          ownedHomeCount: 1,
          status: "갈아타기",
          existingHome: {
            expectedSalePrice: 700_000_000,
            remainingLoan: 300_000_000,
            capitalGainsTax: null,
          },
        }),
      )?.existingHome?.capitalGainsTax,
    ).toBeUndefined();
  });

  it("0원 양도세는 0으로 남는다 — null로 저하되지 않는다", () => {
    expect(
      toProfile(
        state({
          cash: 1,
          annualIncome: 1,
          ownedHomeCount: 1,
          status: "갈아타기",
          existingHome: {
            expectedSalePrice: 700_000_000,
            remainingLoan: 300_000_000,
            capitalGainsTax: 0,
          },
        }),
      )?.existingHome?.capitalGainsTax,
    ).toBe(0);
  });
});

describe("loadStoredState", () => {
  it("저장된 값이 없으면 기본값이다", () => {
    expect(loadStoredState(storage(null))).toEqual(DEFAULT_FORM_STATE);
  });

  it("깨진 JSON이면 조용히 기본값으로 돌아간다", () => {
    expect(loadStoredState(storage("{"))).toEqual(DEFAULT_FORM_STATE);
  });

  it("타입이 어긋난 필드는 기본값으로 대체한다", () => {
    expect(
      loadStoredState(
        storage(JSON.stringify({ cash: "많음", annualIncome: -1 })),
      ),
    ).toEqual(DEFAULT_FORM_STATE);
  });

  it("정상 저장값은 그대로 복원한다", () => {
    expect(
      loadStoredState(
        storage(
          JSON.stringify({
            cash: 300_000_000,
            annualIncome: 80_000_000,
          }),
        ),
      ),
    ).toEqual(
      state({
        cash: 300_000_000,
        annualIncome: 80_000_000,
      }),
    );
  });

  /**
   * 주택 수·생애최초는 cash·annualIncome과 같은 자리다 — 이제 화면에
   * 실제 입력란이 있으므로(사용자 지시) 저장값을 되살린다.
   */
  it("주택 수·생애최초도 그대로 복원한다", () => {
    const restored = loadStoredState(
      storage(
        JSON.stringify({
          cash: 300_000_000,
          annualIncome: 80_000_000,
          ownedHomeCount: 1,
          isFirstTimeBuyer: true,
        }),
      ),
    );
    expect(restored.ownedHomeCount).toBe(1);
    expect(restored.isFirstTimeBuyer).toBe(true);
  });

  it("주택 수가 형태에 안 맞으면(음수·소수·상한 초과) null(미답변)로 되돌린다", () => {
    for (const bad of [-1, 1.5, 51, "1", null]) {
      expect(
        loadStoredState(
          storage(JSON.stringify({ ownedHomeCount: bad })),
        ).ownedHomeCount,
      ).toBeNull();
    }
  });

  /**
   * ⚠ **이 저장소는 저장된 값 때문에 빠져나올 수 없는 화면이 뜨는 버그를
   * 겪었다(커밋 `c90babf`).** 화면에 입력란이 없는 값을 저장본에서
   * 되살리면 사용자가 **보지도 고치지도 못하는 값**이 계산을 움직인다.
   * 그래서 없앤 입력의 저장값은 통째로 버린다.
   */
  describe("여전히 없앤 입력(기존 대출·전용면적·평형대)의 저장값은 되살리지 않는다", () => {
    // ownedHomeCount·isFirstTimeBuyer는 이 블록에서 뺐다 — 사용자 지시로
    // 다시 실제 입력란이 됐으므로 이제는 되살아나는 쪽이 맞다. 그 사실은
    // 아래 별도 describe("주택 수·생애최초도 그대로 복원한다" 등, 위쪽)가
    // 확인한다.
    const legacy = JSON.stringify({
      cash: 300_000_000,
      annualIncome: 80_000_000,
      existingDebtAnnualPayment: 12_000_000,
      exclusiveAreaSqm: 84,
      areaBands: ["중소형", "중대형"],
      touched: ["existingDebt", "area", "regulatedArea"],
    });

    it("폼 상태에 그 키가 아예 들어오지 않는다", () => {
      const restored = loadStoredState(storage(legacy)) as unknown as Record<
        string,
        unknown
      >;
      expect(restored.existingDebtAnnualPayment).toBeUndefined();
    });

    it("전용면적 키는 폼 상태에 아예 들어오지 않는다", () => {
      const restored = loadStoredState(storage(legacy)) as unknown as Record<
        string,
        unknown
      >;
      expect(restored.exclusiveAreaSqm).toBeUndefined();
    });

    /**
     * 평형대 질문 자체가 사라졌다(사용자 지시) — 옛 저장본에 남은
     * `areaBands`는 읽지 않는다. `parseAreaBands`를 아예 지웠으므로
     * 이 값이 실수로 되살아날 길이 코드에 없다.
     */
    it("평형대 키도 폼 상태에 아예 들어오지 않는다", () => {
      const restored = loadStoredState(storage(legacy)) as unknown as Record<
        string,
        unknown
      >;
      expect(restored.areaBands).toBeUndefined();
    });

    /**
     * 없어진 항목(`existingDebt`·`area`)은 지금 존재하지 않아서 걸러지고,
     * `regulatedArea`는 존재하지만 **세션에 매인 지위**라 걸러진다
     * (아래 "저장본은 지역 판정을 되살리지 않는다" 참고). 그래서 남는
     * 것이 하나도 없다.
     */
    it("없어진 touched 항목은 걸러 낸다", () => {
      expect(loadStoredState(storage(legacy)).touched).toEqual([]);
    });

    it("엔진에 넘어가는 기존 대출도 가정값이다 — 옛 답이 조용히 계산을 움직이지 않는다", () => {
      const restored = { ...loadStoredState(storage(legacy)), ownedHomeCount: 0 };
      const profile = toProfile(restored)!;
      expect(profile.existingDebtAnnualPayment).toBe(0);
    });
  });

  /**
   * ⚠ **판정은 불러온 지역에 매여 있고, 마운트 시점에는 불러온 지역이
   * 없다.** 조회한 지역은 저장되지 않으므로(새 화면에는 지역 줄조차
   * 없다) `touched: ["regulatedArea"]`를 복원하면 화면과 종이가 이름도
   * 대지 못하는 지역에 대해 "규제지역으로 판정했어요"라고 단정하게
   * 된다. 확인할 체크박스도 이제 없다.
   *
   * 그래서 값도 지위도 되살리지 않는다. `isRegulatedArea`는 touched가
   * 정하므로, 판정을 버리면 값도 함께 기본값(보수적인 `true`)으로
   * 돌아간다 — 저장된 `false`가 살아남아 LTV를 70%로 잡는 낙관 방향의
   * 새어 나감이 구조적으로 불가능하다.
   */
  describe("저장본은 지역 판정을 되살리지 않는다", () => {
    it("touched에 regulatedArea가 있어도 복원하지 않는다", () => {
      expect(
        loadStoredState(
          storage(
            JSON.stringify({
              isRegulatedArea: false,
              touched: ["regulatedArea"],
            }),
          ),
        ).touched,
      ).toEqual([]);
    });

    it("그래서 저장된 false도 무시하고 보수적인 기본값(true)이 된다", () => {
      expect(
        loadStoredState(
          storage(
            JSON.stringify({
              isRegulatedArea: false,
              touched: ["regulatedArea"],
            }),
          ),
        ).isRegulatedArea,
      ).toBe(true);
    });

    it("touched가 아예 없는 저장본도 같다", () => {
      expect(
        loadStoredState(storage(JSON.stringify({ isRegulatedArea: false })))
          .isRegulatedArea,
      ).toBe(true);
    });

    it("저장된 true도 '판정'이 아니라 기본값으로 돌아온 것이다", () => {
      const restored = loadStoredState(
        storage(
          JSON.stringify({
            isRegulatedArea: true,
            touched: ["regulatedArea"],
          }),
        ),
      );
      expect(restored.isRegulatedArea).toBe(DEFAULT_FORM_STATE.isRegulatedArea);
      expect(restored.touched).toEqual([]);
    });
  });

  describe("옛 갈아타기 상태를 화면 없이 조용히 반영하지 않는다", () => {
    const stale = JSON.stringify({
      cash: 1,
      annualIncome: 1,
      status: "갈아타기",
      existingHome: {
        expectedSalePrice: 700_000_000,
        remainingLoan: 300_000_000,
        capitalGainsTax: null,
      },
    });

    it("status는 항상 무주택으로 되돌린다", () => {
      expect(loadStoredState(storage(stale)).status).toBe("무주택");
    });

    it("existingHome 값 자체는 보존한다 — AssumptionLine이 그 사실을 알린다", () => {
      expect(loadStoredState(storage(stale)).existingHome).toEqual({
        expectedSalePrice: 700_000_000,
        remainingLoan: 300_000_000,
        capitalGainsTax: null,
      });
    });

    it("그래서 엔진에는 existingHome이 넘어가지 않는다", () => {
      expect(
        toProfile(loadStoredState(storage(stale)))?.existingHome,
      ).toBeUndefined();
    });
  });
});

describe("useProfileForm — setField가 touched를 기록한다", () => {
  beforeEach(() => window.localStorage.clear());

  it("규제지역을 바꾸면 regulatedArea가 touched에 들어간다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("isRegulatedArea", false));
    expect(result.current.state.touched).toEqual(["regulatedArea"]);
  });

  /**
   * 사용자가 직접 답한 것(현금·소득)은 가정이 아니므로 가정 문구
   * 체계(`touched`)에 들어가지 않는다.
   */
  it("cash·annualIncome은 touched에 기록되지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => {
      result.current.setField("cash", 1);
      result.current.setField("annualIncome", 1);
    });
    expect(result.current.state.touched).toEqual([]);
  });

  it("같은 항목을 두 번 바꿔도 touched에 중복으로 쌓이지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("isRegulatedArea", false));
    act(() => result.current.setField("isRegulatedArea", true));
    expect(result.current.state.touched).toEqual(["regulatedArea"]);
  });
});

describe("useProfileForm — resetField가 항목을 가정 상태로 되돌린다", () => {
  beforeEach(() => window.localStorage.clear());

  it("값을 현재 기본값으로 되돌리고 touched에서 뺀다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("isRegulatedArea", false));
    expect(result.current.state.touched).toEqual(["regulatedArea"]);

    act(() => result.current.resetField("regulatedArea"));
    expect(result.current.state.isRegulatedArea).toBe(
      DEFAULT_FORM_STATE.isRegulatedArea,
    );
    expect(result.current.state.touched).toEqual([]);
  });

  /**
   * 이 함수를 부르는 자리가 useEffect라, 매번 새 상태를 내면 렌더
   * 루프가 된다.
   */
  it("이미 가정 상태면 상태 객체를 새로 만들지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    const before = result.current.state;
    act(() => result.current.resetField("regulatedArea"));
    expect(result.current.state).toBe(before);
  });

  it("다른 값은 건드리지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => {
      result.current.setField("cash", 300_000_000);
      result.current.setField("annualIncome", 80_000_000);
      result.current.setField("isRegulatedArea", false);
    });
    act(() => result.current.resetField("regulatedArea"));
    expect(result.current.state.cash).toBe(300_000_000);
    expect(result.current.state.annualIncome).toBe(80_000_000);
  });
});
