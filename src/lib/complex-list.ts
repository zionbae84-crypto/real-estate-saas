import type { ComplexUnit } from "../data/complexes";
import {
  calcAffordablePrice,
  calcAvailableCash,
  calcBurdenAt,
  calcSafePrice,
  ownFundsRequired,
  type BurdenAtPrice,
  type BuyerProfile,
  type Rules,
} from "./finance";

export interface ComplexListInput {
  units: readonly ComplexUnit[];
  profile: BuyerProfile;
  rules: Rules;
  /** 비어 있으면 전체 지역 */
  regionCodes: readonly string[];
}

export interface ComplexListEntry {
  unit: ComplexUnit;
  /** `maxPrice`에서의 부담. 범위의 위쪽으로 재야 표시보다 부담이 커지지 않는다 */
  burden: BurdenAtPrice;
  /**
   * 같은 이름·같은 법정동에 건축년도가 다른 단지가 또 있는가.
   *
   * 있을 때만 화면에 건축년도를 붙인다. 늘 붙이면 잡음이고, 안 붙이면
   * 재건축 단지처럼 이름이 같은 두 단지를 구분할 수 없다.
   */
  needsBuiltYear: boolean;
}

export interface ComplexListResult {
  /** 안전선 이하 */
  withinSafe: ComplexListEntry[];
  /** 안전선 초과 ~ 실구매력 이하 */
  beyondSafe: ComplexListEntry[];
  affordablePrice: number;
  /** 안전한 가격이 없으면 null */
  safePrice: number | null;
  /**
   * 지역 필터를 풀면 보여줄 것이 생기는가.
   *
   * "지역을 넓혀 보라"는 필터가 원인일 때만 말해야 한다. 전체 지역에서도
   * 0개인데 지역을 넓히라고 하면 거짓말이다.
   */
  emptyBecauseOfFilter: boolean;
}

/**
 * 예산에 맞는 단지를 안전선에서 갈라 정렬한다.
 *
 * 모든 가격 비교와 부담 계산은 **`maxPrice`** 기준이다. 범위의 위쪽으로
 * 재면 틀리더라도 부담이 표시보다 작아지는 쪽으로 틀린다.
 *
 * **행마다 그 행의 실제 전용면적(`unit.areaBucket`)으로 계산한다.**
 * 프로필 하나의 `exclusiveAreaSqm`으로 모든 행을 계산하면, 실제로는
 * 농특세(85㎡ 초과)가 붙어야 할 넓은 평형이 프로필의 좁은 가정 면적을
 * 빌려 부대비용을 적게 계상받는다 — 부담은 실제보다 작게, 구매 가능
 * 여부는 실제보다 낙관적으로 나온다. 이 제품이 가장 피해야 하는 방향의
 * 오답이다.
 *
 * 구매 가능 필터는 `ownFundsRequired`(반복 없이 한 번에 자기자금을
 * 구하는 술어)를 행별 프로필로 직접 불러 판정한다 — `calcAffordablePrice`처럼
 * 행마다 이분 탐색을 다시 돌리지 않는다. 가용현금은 면적과 무관하므로
 * 한 번만 구해 재사용한다.
 *
 * **안전선(`safePrice`)만은 예외로 프로필 기준을 유지한다.** 화면
 * 상단의 헤드라인 값이라 목록의 분기가 상단 문구와 어긋나면 안 되기
 * 때문이다. 그래서 행 자체 면적으로는 안전해도 헤드라인 안전선을
 * 넘으면 아래 덩어리(beyondSafe)에 들어갈 수 있다 — 보수적인 방향이라
 * 허용한다.
 */
export function buildComplexList(input: ComplexListInput): ComplexListResult {
  const { units, profile, rules, regionCodes } = input;

  const affordablePrice = calcAffordablePrice(profile, rules).affordablePrice;
  const safePrice = calcSafePrice(profile, rules);
  const availableCash = calcAvailableCash(profile).amount;

  const rowProfile = (u: ComplexUnit): BuyerProfile => ({
    ...profile,
    exclusiveAreaSqm: u.areaBucket,
  });

  const affordable = (u: ComplexUnit) =>
    ownFundsRequired(u.maxPrice, rowProfile(u), rules) <= availableCash;
  const inRegion = (u: ComplexUnit) =>
    regionCodes.length === 0 || regionCodes.includes(u.regionCode);

  const shown = units.filter((u) => inRegion(u) && affordable(u));
  const ambiguous = ambiguousNames(shown);

  const withinSafe: ComplexListEntry[] = [];
  const beyondSafe: ComplexListEntry[] = [];

  for (const unit of shown) {
    const entry: ComplexListEntry = {
      unit,
      burden: calcBurdenAt(rowProfile(unit), rules, unit.maxPrice),
      needsBuiltYear: ambiguous.has(nameKey(unit)),
    };
    const isSafe = safePrice !== null && unit.maxPrice <= safePrice;
    (isSafe ? withinSafe : beyondSafe).push(entry);
  }

  const byBurden = (a: ComplexListEntry, b: ComplexListEntry) =>
    a.burden.safety.burdenRatio - b.burden.safety.burdenRatio;
  withinSafe.sort(byBurden);
  beyondSafe.sort(byBurden);

  return {
    withinSafe,
    beyondSafe,
    affordablePrice,
    safePrice,
    emptyBecauseOfFilter: shown.length === 0 && units.some(affordable),
  };
}

/** 이름·법정동만으로는 구분되지 않는 단지의 키 */
function nameKey(u: ComplexUnit): string {
  return `${u.legalDongName}|${u.complexName}`;
}

/** 같은 이름·법정동에 건축년도가 둘 이상인 이름들 */
function ambiguousNames(units: readonly ComplexUnit[]): Set<string> {
  const years = new Map<string, Set<number>>();
  for (const u of units) {
    const key = nameKey(u);
    const set = years.get(key) ?? new Set<number>();
    set.add(u.builtYear);
    years.set(key, set);
  }
  const ambiguous = new Set<string>();
  for (const [key, set] of years) {
    if (set.size > 1) ambiguous.add(key);
  }
  return ambiguous;
}
