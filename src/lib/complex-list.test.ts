import { describe, expect, it } from "vitest";
import rawRules from "../../rules/2026-08.json";
import { COMPLEX_UNITS, type ComplexUnit } from "../data/complexes";
import { buildComplexList } from "./complex-list";
import { calcAffordablePrice, ownFundsRequired } from "./finance/affordable-price";
import { calcAvailableCash } from "./finance/available-cash";
import { parseRules } from "./finance/rules";
import { calcSafePrice } from "./finance/safe-price";
import type { BuyerProfile } from "./finance/types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

/**
 * `maxExclusiveAreaSqm`을 명시하지 않으면 `areaBucket`과 같은 값으로
 * 채운다 — 이 스위트의 기존 테스트 대부분은 "행의 실제 면적"이라는 뜻으로
 * `areaBucket`을 오버라이드해 왔는데(85㎡ 임계값 테스트 등), 계산이
 * `maxExclusiveAreaSqm`을 쓰도록 바뀌어도 그 의도가 그대로 살아 있어야
 * 한다. 두 값이 실제로 갈리는 경우(반올림 버킷과 실제 최대 면적이 다른
 * 경우)를 검사하는 테스트는 `maxExclusiveAreaSqm`을 따로 오버라이드한다.
 */
function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  const areaBucket = overrides.areaBucket ?? 84;
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket,
    maxExclusiveAreaSqm: areaBucket,
    landLeasehold: "N",
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    lowConfidence: false,
    ...overrides,
  };
}

function build(units: ComplexUnit[], p = profile(), regionCodes: string[] = []) {
  return buildComplexList({ units, profile: p, rules, regionCodes });
}

const allKeys = (r: ReturnType<typeof build>) =>
  [...r.withinSafe, ...r.beyondSafe].map((e) => e.unit.complexKey);

describe("buildComplexList", () => {
  it("maxPrice가 실구매력을 넘는 단지를 뺀다", () => {
    const r = build([
      unit({ complexKey: "a", maxPrice: 100_000_000 }),
      unit({ complexKey: "b", maxPrice: 90_000_000_000 }),
    ]);
    expect(allKeys(r)).toContain("a");
    expect(allKeys(r)).not.toContain("b");
  });

  it("같은 단지가 양쪽 덩어리에 동시에 들어가지 않는다", () => {
    const r = build([
      unit({ complexKey: "a", maxPrice: 100_000_000 }),
      unit({ complexKey: "b", maxPrice: 450_000_000 }),
    ]);
    const safeKeys = r.withinSafe.map((e) => e.unit.complexKey);
    const beyondKeys = r.beyondSafe.map((e) => e.unit.complexKey);
    expect(safeKeys.filter((k) => beyondKeys.includes(k))).toEqual([]);
  });

  it("안전선 이하는 첫 덩어리, 초과는 둘째 덩어리다", () => {
    const p = profile();
    const r0 = build([], p);
    expect(r0.safePrice).not.toBeNull();
    const safeLine = r0.safePrice as number;
    // 행 면적을 프로필의 가정 면적과 맞춘다. 그래야 헤드라인 안전선과
    // 행 자신의 등급이 같은 기준 위에 서서, 이 위치 검사가 두 기준의
    // 차이가 아니라 "선의 위·아래"만 본다. (면적이 다르면 행 쪽이
    // 맞으므로 선도 함께 움직인다 — 아래 별도 describe가 그 경우를
    // 따로 잠근다.)
    const area = p.exclusiveAreaSqm;
    const r = build(
      [
        unit({ complexKey: "under", areaBucket: area, maxPrice: safeLine - 100_000 }),
        unit({ complexKey: "over", areaBucket: area, maxPrice: safeLine + 100_000 }),
      ],
      p,
    );
    expect(r.withinSafe.map((e) => e.unit.complexKey)).toEqual(["under"]);
    expect(r.beyondSafe.map((e) => e.unit.complexKey)).toEqual(["over"]);
  });

  it("각 덩어리 안에서 부담률 오름차순이다", () => {
    const r = build([
      unit({ complexKey: "a", maxPrice: 300_000_000 }),
      unit({ complexKey: "b", maxPrice: 150_000_000 }),
      unit({ complexKey: "c", maxPrice: 220_000_000 }),
    ]);
    for (const group of [r.withinSafe, r.beyondSafe]) {
      const ratios = group.map((e) => e.burden.safety.burdenRatio);
      expect([...ratios].sort((x, y) => x - y)).toEqual(ratios);
    }
  });

  it("부담률을 maxPrice로 계산한다 — 범위의 가운데값이 아니다", () => {
    // 범위가 넓은 단지에서 둘이 갈린다. 위쪽으로 계산해야 틀리더라도
    // 부담이 표시보다 작아지는 쪽으로 틀린다.
    const wide = build([unit({ minPrice: 100_000_000, maxPrice: 300_000_000 })]);
    const narrow = build([unit({ minPrice: 150_000_000, maxPrice: 150_000_000 })]);
    const wideLoan = [...wide.withinSafe, ...wide.beyondSafe][0]?.burden.neededLoan;
    const narrowLoan = [...narrow.withinSafe, ...narrow.beyondSafe][0]?.burden.neededLoan;
    expect(wideLoan).toBeGreaterThan(narrowLoan ?? 0);
  });

  it("안전 덩어리의 모든 행이 안전 등급이다 — 두 계산이 같은 함수를 쓴다", () => {
    // 안전선과 목록 부담률이 다른 모델을 쓰면 여기서 어긋난다:
    // 안전 구역에 들어갔는데 그 행의 등급이 safe가 아닌 상태가 된다.
    const prices = [50_000_000, 150_000_000, 250_000_000, 350_000_000, 450_000_000];
    const r = build(
      prices.map((maxPrice, i) =>
        unit({ complexKey: `u${i}`, maxPrice, minPrice: maxPrice }),
      ),
    );
    expect(r.withinSafe.length).toBeGreaterThan(0);
    for (const e of r.withinSafe) {
      expect(e.burden.safety.level, e.unit.complexKey).toBe("safe");
    }
  });

  it("지역 필터가 비어 있으면 전체를 본다", () => {
    const r = build([
      unit({ complexKey: "a", regionCode: "11680", maxPrice: 100_000_000 }),
      unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 }),
    ]);
    expect(allKeys(r)).toHaveLength(2);
  });

  it("지역을 고르면 그 지역만 남는다", () => {
    const r = build(
      [
        unit({ complexKey: "a", regionCode: "11680", maxPrice: 100_000_000 }),
        unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 }),
      ],
      profile(),
      ["11680"],
    );
    expect(allKeys(r)).toEqual(["a"]);
  });

  it("필터 때문에 0개인지 아닌지를 구분해 알려준다", () => {
    // "지역을 넓혀 보라"를 필터가 원인일 때만 말하기 위해 필요하다.
    const filtered = build(
      [unit({ regionCode: "11650", maxPrice: 100_000_000 })],
      profile(),
      ["11680"],
    );
    expect(filtered.emptyBecauseOfFilter).toBe(true);

    const tooExpensive = build([unit({ maxPrice: 90_000_000_000 })]);
    expect(tooExpensive.emptyBecauseOfFilter).toBe(false);
  });

  it("안전선이 null이면 첫 덩어리가 비어 있다", () => {
    const p = profile({ annualIncome: 0, cash: 500_000_000 });
    const r = build([unit({ maxPrice: 100_000_000 })], p);
    expect(r.safePrice).toBeNull();
    expect(r.withinSafe).toEqual([]);
  });

  it("같은 이름·같은 동에 건축년도가 다른 단지가 있을 때만 건축년도가 필요하다", () => {
    const r = build([
      unit({ complexKey: "a", complexName: "우성", builtYear: 1999, maxPrice: 100_000_000 }),
      unit({ complexKey: "b", complexName: "우성", builtYear: 2015, maxPrice: 100_000_000 }),
      unit({ complexKey: "c", complexName: "래미안", builtYear: 2015, maxPrice: 100_000_000 }),
    ]);
    const byKey = new Map(
      [...r.withinSafe, ...r.beyondSafe].map((e) => [e.unit.complexKey, e.needsBuiltYear]),
    );
    expect(byKey.get("a")).toBe(true);
    expect(byKey.get("b")).toBe(true);
    expect(byKey.get("c")).toBe(false);
  });

  it("실제 번들 데이터로 돌아간다", () => {
    const r = build([...COMPLEX_UNITS]);
    expect(r.withinSafe.length + r.beyondSafe.length).toBeGreaterThan(0);
    for (const e of [...r.withinSafe, ...r.beyondSafe]) {
      expect(e.unit.maxPrice).toBeLessThanOrEqual(r.affordablePrice);
    }
  });

  describe("리뷰 수정: 목록이 행마다 그 행의 실제 면적을 쓴다", () => {
    it("실제 번들 데이터: 어떤 행도 그 행 자신의 면적 기준 필요 자기자금이 가용 현금을 넘는데 구매 가능으로 보이지 않는다", () => {
      // 리뷰 수정(Minor 4): 예전 이 테스트는 아무것도 잠그지 않았다.
      // 기본 프로필의 가정 면적이 86㎡라 이미 농특세가 붙는 쪽이었고,
      // 행 면적으로 다시 재면 어떤 행이든 같거나 더 싸져서 결함
      // 상태(프로필 면적으로 필터링)로 되돌려도 그대로 통과했다.
      //
      // 가정 면적을 85㎡ 이하(84㎡)로 두면 85㎡ 초과 행은 행 기준이 더
      // 비싸지므로, 프로필 면적으로 봐주는 순간 실제로는 못 사는 행이
      // 목록에 뜬다. 예산도 그 행들이 실제로 후보에 오를 만큼 키운다 —
      // 번들 데이터의 85㎡ 초과 평형은 대체로 비싸다.
      const p = profile({
        exclusiveAreaSqm: 84,
        cash: 2_000_000_000,
        annualIncome: 200_000_000,
      });
      const cash = calcAvailableCash(p).amount;
      const r = build([...COMPLEX_UNITS], p);

      // 공허하게 통과하지 않는지 먼저 확인한다: 옛 필터(프로필 면적
      // 기준 실구매력 이하)로는 통과했겠지만 행 자신의 면적으로 다시
      // 재면 가용현금을 넘는 행이 이 데이터에 실제로 있어야, 아래
      // 검사가 결함을 잡을 수 있다.
      const wouldHavePassedOldFilter = COMPLEX_UNITS.filter(
        (u) =>
          u.maxPrice <= r.affordablePrice &&
          ownFundsRequired(u.maxPrice, { ...p, exclusiveAreaSqm: u.maxExclusiveAreaSqm }, rules) >
            cash,
      );
      expect(wouldHavePassedOldFilter.length).toBeGreaterThan(0);

      for (const e of [...r.withinSafe, ...r.beyondSafe]) {
        const rowProfile = { ...p, exclusiveAreaSqm: e.unit.maxExclusiveAreaSqm };
        expect(
          ownFundsRequired(e.unit.maxPrice, rowProfile, rules),
        ).toBeLessThanOrEqual(cash);
      }
    });

    it("같은 가격이라도 85㎡ 초과 행과 이하 행의 부담이 다르다(농특세)", () => {
      const price = 300_000_000;
      const r = build([
        unit({ complexKey: "small", areaBucket: 84, maxPrice: price, minPrice: price }),
        unit({ complexKey: "large", areaBucket: 130, maxPrice: price, minPrice: price }),
      ]);
      const entries = [...r.withinSafe, ...r.beyondSafe];
      const small = entries.find((e) => e.unit.complexKey === "small");
      const large = entries.find((e) => e.unit.complexKey === "large");
      expect(small).toBeDefined();
      expect(large).toBeDefined();
      // 농특세가 붙는 만큼 부대비용이 늘어 같은 가격에서도 더 많이
      // 빌려야 한다 — neededLoan = price + costs.total - cash.
      expect(large?.burden.neededLoan).toBeGreaterThan(small?.burden.neededLoan ?? 0);
    });

    it("areaBucket이 같은 85여도 maxExclusiveAreaSqm이 85 초과면 농특세가 붙는다 — 반올림 경계 결함 잠금", () => {
      // 핵심 시나리오: 실제 전용면적 85.4㎡는 Math.round(85.4) = 85로
      // 반올림된다. areaBucket(85)만 보면 85㎡ 이하로 오판해 농특세를
      // 빼고 계산한다 — maxExclusiveAreaSqm(85.4)을 써야 초과분이 잡힌다.
      const price = 300_000_000;
      const r = build([
        unit({
          complexKey: "over",
          areaBucket: 85,
          maxExclusiveAreaSqm: 85.4,
          maxPrice: price,
          minPrice: price,
        }),
        unit({
          complexKey: "under",
          areaBucket: 85,
          maxExclusiveAreaSqm: 85,
          maxPrice: price,
          minPrice: price,
        }),
      ]);
      const entries = [...r.withinSafe, ...r.beyondSafe];
      const over = entries.find((e) => e.unit.complexKey === "over");
      const under = entries.find((e) => e.unit.complexKey === "under");
      expect(over).toBeDefined();
      expect(under).toBeDefined();
      // 농특세가 붙는 만큼 부대비용이 늘어 같은 가격·같은 areaBucket에서도
      // 더 많이 빌려야 한다.
      expect(over?.burden.neededLoan).toBeGreaterThan(under?.burden.neededLoan ?? 0);
    });

    it("결함 회귀 잠금: 프로필 하나의 면적으로 모든 행을 봐주면 넓은 평형이 부당하게 통과했다", () => {
      // 프로필은 농특세가 붙지 않는 면적(84㎡)으로 가정했지만, 실제
      // 행(130㎡)은 초과라 농특세가 붙는다. 프로필 면적만으로 감당
      // 가능 여부를 판정하면(옛 결함), 이 단지는 실제로는 가용현금을
      // 넘는데도 목록에 나타난다.
      const p = profile({ exclusiveAreaSqm: 84 });
      const baseAffordable = calcAffordablePrice(p, rules).affordablePrice;
      const cash = calcAvailableCash(p).amount;

      const wideUnit = unit({
        areaBucket: 130,
        maxPrice: baseAffordable,
        minPrice: baseAffordable,
      });

      // 전제 확인: 130㎡ 기준으로 다시 재면 이 가격은 실제로 가용현금을 넘는다.
      const rowProfile = { ...p, exclusiveAreaSqm: wideUnit.maxExclusiveAreaSqm };
      expect(ownFundsRequired(wideUnit.maxPrice, rowProfile, rules)).toBeGreaterThan(cash);
      // 그리고 프로필 하나(84㎡)만으로 판정하면 옛 결함처럼 통과했을
      // 가격이라는 것도 함께 확인한다.
      expect(wideUnit.maxPrice).toBeLessThanOrEqual(baseAffordable);

      const r = build([wideUnit], p);
      expect(allKeys(r)).not.toContain(wideUnit.complexKey);
    });
  });

  describe("리뷰 수정: 덩어리와 행 배지가 어긋날 수 없다", () => {
    /**
     * 덩어리 분기는 `entry.burden.safety.level`이고 행 배지도 같은
     * `entry.burden`에서 나온다. 두 값이 같은 계산 하나에서 나오므로
     * 어긋날 수 없다는 것을 프로필 격자 전체에서 확인한다.
     */
    it("첫 덩어리는 전부 safe, 둘째 덩어리는 전부 safe가 아니다", () => {
      for (const cash of [50_000_000, 500_000_000, 2_000_000_000]) {
        for (const annualIncome of [20_000_000, 40_000_000, 120_000_000]) {
          for (const exclusiveAreaSqm of [59, 84, 86, 130]) {
            for (const isRegulatedArea of [true, false]) {
              const p = profile({
                cash,
                annualIncome,
                exclusiveAreaSqm,
                isRegulatedArea,
              });
              const r = build([...COMPLEX_UNITS], p);
              const where = `${cash}/${annualIncome}/${exclusiveAreaSqm}/${isRegulatedArea}`;
              for (const e of r.withinSafe) {
                expect(e.burden.safety.level, where).toBe("safe");
              }
              for (const e of r.beyondSafe) {
                expect(e.burden.safety.level, where).not.toBe("safe");
              }
            }
          }
        }
      }
    });

    it("리뷰 재현: 프로필보다 넓은 평형은 헤드라인 안전선 이하여도 '주의'면 첫 덩어리에 들어가지 않는다", () => {
      // 리뷰가 재현한 프로필 그대로다: 전용면적 59㎡ 직접 입력 ·
      // 현금 20억 · 연소득 4,000만원 · 생애최초 · 규제지역.
      const p = profile({
        cash: 2_000_000_000,
        annualIncome: 40_000_000,
        exclusiveAreaSqm: 59,
      });
      const wide = unit({
        complexKey: "송파삼성래미안",
        complexName: "송파삼성래미안아파트",
        legalDongName: "송파동",
        areaBucket: 88,
        minPrice: 2_070_000_000,
        maxPrice: 2_070_000_000,
      });

      const r = build([wide], p);

      // 전제: 이 가격은 헤드라인 안전선(가정 면적 59㎡ 기준) 이하다 —
      // 옛 분기(maxPrice <= safePrice)라면 첫 덩어리에 들어갔다.
      expect(r.safePrice).not.toBeNull();
      expect(wide.maxPrice).toBeLessThanOrEqual(r.safePrice as number);

      // 그런데 이 행 자신(88㎡, 농특세)의 등급은 safe가 아니다.
      const entry = [...r.withinSafe, ...r.beyondSafe][0];
      expect(entry?.burden.safety.level).not.toBe("safe");

      // 그러므로 "무리 없이 살 수 있어요" 덩어리에 들어가면 안 된다.
      expect(r.withinSafe).toEqual([]);
      expect(r.beyondSafe.map((e) => e.unit.complexKey)).toEqual([
        "송파삼성래미안",
      ]);
    });

    it("반대 방향: 프로필보다 좁은 평형은 헤드라인 안전선을 넘어도 자기 기준으로 안전하면 첫 덩어리다", () => {
      // 행 쪽이 정확하므로 이 방향도 행을 따른다. 헤드라인은 가정이고,
      // 목록 화면의 안내 문구가 그 차이를 밝힌다.
      const p = profile({ exclusiveAreaSqm: 130 });
      const headline = build([], p).safePrice;
      expect(headline).not.toBeNull();

      const narrowArea = 59;
      const rowLine = calcSafePrice({ ...p, exclusiveAreaSqm: narrowArea }, rules);
      expect(rowLine).not.toBeNull();
      // 좁은 평형은 농특세가 붙지 않아 부대비용이 적다 — 같은 부담에서
      // 더 비싼 집까지 안전하다.
      expect(rowLine as number).toBeGreaterThan(headline as number);

      const price = (headline as number) + 100_000;
      const r = build(
        [unit({ complexKey: "narrow", areaBucket: narrowArea, maxPrice: price, minPrice: price })],
        p,
      );
      expect(r.withinSafe.map((e) => e.unit.complexKey)).toEqual(["narrow"]);
      expect(r.withinSafe[0]?.burden.safety.level).toBe("safe");
    });

    /**
     * 헤드라인이 "안전선이 없어요"라고 말하는데 목록에는 안전 덩어리가
     * 보이는 모순이 생길 수 있는가.
     *
     * 생기지 않는다. `safePrice`가 null이 되는 경로는 두 가지뿐이고 둘
     * 다 면적과 무관하다. (1) 실구매력이 0 — 고정 부대비용(법무비·
     * 이사비)만으로 현금을 넘는 경우이고, 이 비용은 면적이 바뀌어도
     * 같으므로 어떤 행도 필터를 통과하지 못한다. (2) 가격 0에서도
     * 등급이 safe가 아닌 경우 — 소득이 0이거나 기존 부채의 월 상환액만으로
     * 이미 임계값을 넘는 경우다. 둘 다 행의 면적이 아니라 소득·부채가
     * 만드는 바닥이라, 어떤 행도(대출이 0이어도) 그 바닥 아래로
     * 내려가지 못한다.
     */
    it("헤드라인 안전선이 없으면 안전 덩어리도 비어 있다", () => {
      const grids: BuyerProfile[] = [];
      for (const cash of [1_000_000, 3_000_000, 100_000_000, 3_000_000_000]) {
        for (const annualIncome of [0, 5_000_000, 20_000_000, 60_000_000]) {
          for (const existingDebtAnnualPayment of [0, 15_000_000, 40_000_000]) {
            for (const exclusiveAreaSqm of [40, 84, 85, 86, 140]) {
              grids.push(
                profile({
                  cash,
                  annualIncome,
                  existingDebtAnnualPayment,
                  exclusiveAreaSqm,
                }),
              );
            }
          }
        }
      }

      let sawNull = false;
      for (const p of grids) {
        const r = build([...COMPLEX_UNITS], p);
        if (r.safePrice !== null) continue;
        sawNull = true;
        expect(r.withinSafe, JSON.stringify(p)).toEqual([]);
      }
      // 격자가 실제로 그 경우를 한 번은 밟았는지 확인한다 — 아니면
      // 위 검사가 공허하게 통과한다.
      expect(sawNull).toBe(true);
    });
  });
});
