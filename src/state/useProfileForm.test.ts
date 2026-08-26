import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AREA_BANDS } from "../lib/area-band";
import { calcAcquisitionCosts, calcAffordablePrice } from "../lib/finance";
import { rules } from "./useAffordability";
import {
  ASSUMED_REMOVED_INPUTS,
  DEFAULT_FORM_STATE,
  assumedExclusiveAreaSqm,
  loadStoredState,
  STORAGE_KEY,
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
  it("필수값(현금·연 소득)은 비어 있다", () => {
    expect(DEFAULT_FORM_STATE.cash).toBeNull();
    expect(DEFAULT_FORM_STATE.annualIncome).toBeNull();
  });

  /**
   * 스펙 §4: 기본값은 전체 선택(= 필터 없음). 처음 온 사용자는 네 번째
   * 질문에 이미 답한 상태로 시작한다.
   */
  it("평형대 기본값은 전체 선택이다", () => {
    expect(DEFAULT_FORM_STATE.areaBands).toEqual([...AREA_BANDS]);
  });

  it("규제지역 기본값은 true다 — 과대평가를 피하는 쪽이다", () => {
    expect(DEFAULT_FORM_STATE.isRegulatedArea).toBe(true);
  });

  /**
   * ⚠ **전용면적은 이제 폼 상태에 없다.** 헤드라인이 쓰는 면적은 고른
   * 평형대에서 유도한다(`assumedExclusiveAreaSqm`) — 상태에 한 벌 더
   * 두면 그 값과 선택이 어긋나는 날이 오고, 어긋난 쪽이 조용히 계산을
   * 움직인다.
   */
  it("전용면적은 폼 상태에 없다 — 고른 평형대에서 유도한다", () => {
    expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain("exclusiveAreaSqm");
  });

  it("touched는 처음엔 비어 있다 — 규제지역이 아직 가정 중이라는 뜻이다", () => {
    expect(DEFAULT_FORM_STATE.touched).toEqual([]);
  });

  /**
   * ⚠ **없앤 입력 셋은 폼 상태에 아예 없다.** 상태에 남겨 두면 언젠가
   * 어딘가에서 그 값이 읽히고, 화면에는 그 값을 보거나 고칠 자리가
   * 없다 — 이 저장소가 이미 겪은 결함의 모양이다. 값은
   * `ASSUMED_REMOVED_INPUTS` 한 곳에만 있다.
   */
  it("없앤 입력 셋(생애최초·기존 대출·주택 수)은 폼 상태에 없다", () => {
    for (const key of [
      "isFirstTimeBuyer",
      "existingDebtAnnualPayment",
      "ownedHomeCount",
    ]) {
      expect(Object.keys(DEFAULT_FORM_STATE)).not.toContain(key);
    }
  });
});

describe("ASSUMED_REMOVED_INPUTS — 없앤 입력이 계산에 넘기는 값", () => {
  it("스펙 §3의 표 그대로다", () => {
    expect(ASSUMED_REMOVED_INPUTS).toEqual({
      isFirstTimeBuyer: false,
      existingDebtAnnualPayment: 0,
      ownedHomeCount: 0,
    });
  });
});

/**
 * ⚠ **헤드라인(실구매 가능 가격)이 평형대 선택에서 가져가는 것은 면적
 * 값이 아니라 "85㎡ 초과가 섞였는가"라는 참/거짓 하나다.**
 *
 * 범위에서 대표값 하나를 지어내지 않는다 — 그런 규칙을 만들면 그 규칙이
 * 화면 어디에도 적히지 않은 채 헤드라인을 움직인다. 면적이 계산을
 * 가르는 지점은 85㎡ 하나뿐이라(농특세·정책대출 면적 제한) 참/거짓이면
 * 충분하다.
 */
describe("assumedExclusiveAreaSqm — 고른 평형대가 헤드라인에 넘기는 것", () => {
  it("85㎡ 초과가 안 섞였으면 임계값이다 — 이건 가정이 아니라 사실이다", () => {
    expect(assumedExclusiveAreaSqm(["소형"])).toBe(THRESHOLD);
    expect(assumedExclusiveAreaSqm(["소형", "중소형"])).toBe(THRESHOLD);
  });

  it("85㎡ 초과가 섞이면 임계값을 넘는 값이다 — 농특세가 붙는 쪽(보수적)이다", () => {
    expect(assumedExclusiveAreaSqm(["중대형"])).toBeGreaterThan(THRESHOLD);
    expect(assumedExclusiveAreaSqm([...AREA_BANDS])).toBeGreaterThan(THRESHOLD);
  });

  /**
   * 임계값을 넘기기만 하면 **어떤 값이든 결과가 같다.** 그래서 위에서
   * 고른 값(임계값 + 1)에는 뜻이 없고, 화면·종이도 그 숫자를 내지 않는다.
   * 이 테스트가 그 "뜻 없음"을 증거로 만든다 — 언젠가 면적이 계산을
   * 가르는 지점이 하나 더 생기면 여기가 먼저 깨진다.
   */
  it("임계값 위에서는 어떤 값을 넣어도 결과가 같다", () => {
    const base = toProfile(
      state({ cash: 300_000_000, annualIncome: 80_000_000 }),
    )!;
    const prices = [THRESHOLD + 0.01, THRESHOLD + 1, 120, 200, 1000].map(
      (sqm) => calcAffordablePrice({ ...base, exclusiveAreaSqm: sqm }, rules),
    );
    for (const p of prices) expect(p).toEqual(prices[0]);

    const costs = [THRESHOLD + 0.01, THRESHOLD + 1, 200].map((sqm) =>
      calcAcquisitionCosts(
        500_000_000,
        { ...base, exclusiveAreaSqm: sqm },
        rules,
      ),
    );
    for (const c of costs) expect(c).toEqual(costs[0]);
  });

  it("임계값은 룰셋에서 온다 — 인자로 받아 바뀌면 따라간다", () => {
    // 임계값이 100이면 "중소형"(60~100)은 더 이상 초과를 품지 않는다.
    expect(assumedExclusiveAreaSqm(["중소형"], 100)).toBe(100);
    expect(assumedExclusiveAreaSqm(["중대형"], 100)).toBeGreaterThan(100);
  });

  /**
   * 빈 선택은 결과 화면에 이르지 못한다(화면 1이 막는다). 그래도 값을
   * 지어내지 않고, "초과가 섞였다고 말할 근거가 없다"는 쪽을 따른다.
   */
  it("빈 선택에서는 임계값을 쓴다", () => {
    expect(assumedExclusiveAreaSqm([])).toBe(THRESHOLD);
  });
});

describe("toProfile", () => {
  it("현금이 없으면 null이다", () => {
    expect(toProfile(state({ annualIncome: 50_000_000 }))).toBeNull();
  });

  it("소득이 없으면 null이다", () => {
    expect(toProfile(state({ cash: 100_000_000 }))).toBeNull();
  });

  /**
   * ⚠ **평형대는 이 조건에 없다.** 평형대는 "무엇을 보여줄까"이고 여기서
   * 만드는 것은 "얼마짜리를 살 수 있는가"다 — 두 축을 한 조건에 묶으면
   * 평형대를 비운 사용자에게 화면이 "예산을 계산할 수 없다"고 **원인을
   * 틀리게** 말하게 된다. 이 저장소가 여섯 번 반복한 사고의 모양이다.
   */
  it("평형대를 하나도 안 골라도 예산은 계산된다 — 다른 축이다", () => {
    const profile = toProfile(
      state({ cash: 100_000_000, annualIncome: 50_000_000, areaBands: [] }),
    );
    expect(profile).not.toBeNull();
    expect(profile?.cash).toBe(100_000_000);
  });

  it("현금·소득만 있으면 프로필을 만든다 — 주택 수를 더 묻지 않는다", () => {
    expect(
      toProfile(state({ cash: 100_000_000, annualIncome: 50_000_000 })),
    ).toEqual({
      status: "무주택",
      cash: 100_000_000,
      annualIncome: 50_000_000,
      isRegulatedArea: true,
      // 기본값은 전체 선택이라 85㎡ 초과가 섞여 있다 — 농특세가 붙는
      // 쪽(보수적)으로 계산한다.
      exclusiveAreaSqm: THRESHOLD + 1,
      ...ASSUMED_REMOVED_INPUTS,
    });
  });

  /**
   * 계산에 실제로 넘어가는 값이 화면이 적는 문장과 같은 원본에서 와야
   * 둘이 어긋날 수 없다.
   */
  it("없앤 입력 셋을 ASSUMED_REMOVED_INPUTS 그대로 엔진에 넘긴다", () => {
    const profile = toProfile(
      state({ cash: 100_000_000, annualIncome: 50_000_000 }),
    )!;
    expect(profile.ownedHomeCount).toBe(ASSUMED_REMOVED_INPUTS.ownedHomeCount);
    expect(profile.isFirstTimeBuyer).toBe(
      ASSUMED_REMOVED_INPUTS.isFirstTimeBuyer,
    );
    expect(profile.existingDebtAnnualPayment).toBe(
      ASSUMED_REMOVED_INPUTS.existingDebtAnnualPayment,
    );
  });

  /**
   * 폼 상태에는 면적이 없다 — 엔진에 넘어가는 값은 고른 평형대에서
   * 유도한 것이어야 한다. 두 축을 잇는 유일한 지점이라 여기서 잠근다.
   */
  it("엔진에 넘기는 전용면적은 고른 평형대에서 유도한다", () => {
    const narrow = toProfile(
      state({ cash: 1, annualIncome: 1, areaBands: ["소형", "중소형"] }),
    )!;
    expect(narrow.exclusiveAreaSqm).toBe(THRESHOLD);

    const wide = toProfile(
      state({ cash: 1, annualIncome: 1, areaBands: ["중대형"] }),
    )!;
    expect(wide.exclusiveAreaSqm).toBeGreaterThan(THRESHOLD);
  });

  it("규제지역을 그대로 전달한다", () => {
    expect(
      toProfile(
        state({
          cash: 1,
          annualIncome: 1,
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
            areaBands: ["중소형", "중대형"],
          }),
        ),
      ),
    ).toEqual(
      state({
        cash: 300_000_000,
        annualIncome: 80_000_000,
        areaBands: ["중소형", "중대형"],
      }),
    );
  });

  /**
   * ⚠ **이 저장소는 저장된 값 때문에 빠져나올 수 없는 화면이 뜨는 버그를
   * 겪었다(커밋 `c90babf`).** 화면에 입력란이 없는 값을 저장본에서
   * 되살리면 사용자가 **보지도 고치지도 못하는 값**이 계산을 움직인다.
   * 그래서 없앤 입력의 저장값은 통째로 버린다.
   */
  describe("없앤 입력의 저장값은 되살리지 않는다", () => {
    const legacy = JSON.stringify({
      cash: 300_000_000,
      annualIncome: 80_000_000,
      ownedHomeCount: 2,
      isFirstTimeBuyer: true,
      existingDebtAnnualPayment: 12_000_000,
      exclusiveAreaSqm: 84,
      touched: ["existingDebt", "area", "regulatedArea"],
    });

    it("폼 상태에 그 키들이 아예 들어오지 않는다", () => {
      const restored = loadStoredState(storage(legacy)) as unknown as Record<
        string,
        unknown
      >;
      expect(restored.ownedHomeCount).toBeUndefined();
      expect(restored.isFirstTimeBuyer).toBeUndefined();
      expect(restored.existingDebtAnnualPayment).toBeUndefined();
    });

    it("전용면적 키는 폼 상태에 아예 들어오지 않는다", () => {
      const restored = loadStoredState(storage(legacy)) as unknown as Record<
        string,
        unknown
      >;
      expect(restored.exclusiveAreaSqm).toBeUndefined();
    });

    it("없어진 touched 항목은 걸러 내고, 남은 항목만 복원한다", () => {
      expect(loadStoredState(storage(legacy)).touched).toEqual([
        "regulatedArea",
      ]);
    });

    it("엔진에 넘어가는 값도 가정값이다 — 옛 답이 조용히 계산을 움직이지 않는다", () => {
      const profile = toProfile(loadStoredState(storage(legacy)))!;
      expect(profile.ownedHomeCount).toBe(0);
      expect(profile.isFirstTimeBuyer).toBe(false);
      expect(profile.existingDebtAnnualPayment).toBe(0);
    });
  });

  describe("평형대 복원", () => {
    it("키가 없는 옛 저장본은 전체 선택으로 돌아온다 — 결과를 좁히지 않는다", () => {
      expect(
        loadStoredState(storage(JSON.stringify({ cash: 1 }))).areaBands,
      ).toEqual([...AREA_BANDS]);
    });

    it("배열이 아니면 전체 선택으로 되돌린다", () => {
      expect(
        loadStoredState(storage(JSON.stringify({ areaBands: "소형" })))
          .areaBands,
      ).toEqual([...AREA_BANDS]);
    });

    /**
     * ⚠ **모르는 값을 걸러내고 나머지를 살리지 않는다 — 통째로 버린다.**
     *
     * 구간이 넷에서 셋으로 바뀌면서 옛 이름("중형"·"대형")이 저장본에
     * 남은 사용자가 있다. 아는 값만 남기면 그 사용자의 선택은 "중형·대형"
     * (= 85㎡ 초과 전부)에서 빈 선택이나 엉뚱한 일부로 조용히 바뀌고,
     * 화면은 그 사실을 말하지 않는다 — 저장된 값이 사용자가 고른 적 없는
     * 조건을 만드는, 커밋 `c90babf`와 같은 모양이다.
     *
     * 전체 선택으로 되돌리는 쪽은 **결과를 좁히지 않는** 방향이고, 그
     * 상태는 화면 1의 칩에 그대로 보인다.
     */
    it("모르는 값이 섞여 있으면 통째로 버리고 전체 선택으로 간다", () => {
      expect(
        loadStoredState(
          storage(JSON.stringify({ areaBands: ["소형", "초대형", 7] })),
        ).areaBands,
      ).toEqual([...AREA_BANDS]);
    });

    it("옛 네 구간 이름이 남은 저장본도 전체 선택으로 되돌린다", () => {
      expect(
        loadStoredState(
          storage(JSON.stringify({ areaBands: ["중형", "대형"] })),
        ).areaBands,
      ).toEqual([...AREA_BANDS]);
    });

    /**
     * 빈 배열은 "하나도 고르지 않았다"는 정당한 상태다 — 화면 1이 그
     * 사실을 말하고, 칩을 하나 누르면 곧바로 빠져나온다. 조용히
     * "전체"로 바꿔 읽으면 사용자가 고른 적 없는 조건으로 결과를
     * 그리면서 그 사실을 말하지 않게 된다.
     */
    it("명시적으로 저장된 빈 배열은 빈 채로 복원한다", () => {
      expect(
        loadStoredState(storage(JSON.stringify({ areaBands: [] }))).areaBands,
      ).toEqual([]);
    });

    it("순서는 저장 순서가 아니라 좁은 쪽부터다", () => {
      expect(
        loadStoredState(
          storage(JSON.stringify({ areaBands: ["중대형", "소형"] })),
        ).areaBands,
      ).toEqual(["소형", "중대형"]);
    });
  });

  describe("규제지역은 touched일 때만 저장값을 존중한다", () => {
    it("touched에 없으면 저장된 값이 유효해도 현재 기본값(true)이 된다", () => {
      expect(
        loadStoredState(storage(JSON.stringify({ isRegulatedArea: false })))
          .isRegulatedArea,
      ).toBe(true);
    });

    it("touched에 있으면 저장된 false를 그대로 복원한다", () => {
      expect(
        loadStoredState(
          storage(
            JSON.stringify({
              isRegulatedArea: false,
              touched: ["regulatedArea"],
            }),
          ),
        ).isRegulatedArea,
      ).toBe(false);
    });

    it("boolean이 아니면 기본값으로 되돌린다", () => {
      expect(
        loadStoredState(
          storage(
            JSON.stringify({
              isRegulatedArea: "네",
              touched: ["regulatedArea"],
            }),
          ),
        ).isRegulatedArea,
      ).toBe(true);
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
   * 사용자가 직접 답한 것(현금·소득·평형대)은 가정이 아니므로 가정 문구
   * 체계(`touched`)에 들어가지 않는다.
   */
  it("cash·annualIncome·areaBands는 touched에 기록되지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => {
      result.current.setField("cash", 1);
      result.current.setField("annualIncome", 1);
      result.current.setField("areaBands", ["소형"]);
    });
    expect(result.current.state.touched).toEqual([]);
  });

  it("같은 항목을 두 번 바꿔도 touched에 중복으로 쌓이지 않는다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("isRegulatedArea", false));
    act(() => result.current.setField("isRegulatedArea", true));
    expect(result.current.state.touched).toEqual(["regulatedArea"]);
  });

  it("평형대 선택이 저장된다", () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setField("areaBands", ["중소형", "중대형"]));
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(saved.areaBands).toEqual(["중소형", "중대형"]);
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
      result.current.setField("areaBands", ["소형"]);
      result.current.setField("isRegulatedArea", false);
    });
    act(() => result.current.resetField("regulatedArea"));
    expect(result.current.state.cash).toBe(300_000_000);
    expect(result.current.state.areaBands).toEqual(["소형"]);
  });
});
