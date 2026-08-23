import type { ComplexUnit } from "../data/complexes";
import {
  calcAffordablePrice,
  calcBurdenAt,
  calcSafePrice,
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
 */
export function buildComplexList(input: ComplexListInput): ComplexListResult {
  const { units, profile, rules, regionCodes } = input;

  const affordablePrice = calcAffordablePrice(profile, rules).affordablePrice;
  const safePrice = calcSafePrice(profile, rules);

  const affordable = (u: ComplexUnit) => u.maxPrice <= affordablePrice;
  const inRegion = (u: ComplexUnit) =>
    regionCodes.length === 0 || regionCodes.includes(u.regionCode);

  const shown = units.filter((u) => inRegion(u) && affordable(u));
  const ambiguous = ambiguousNames(shown);

  const withinSafe: ComplexListEntry[] = [];
  const beyondSafe: ComplexListEntry[] = [];

  for (const unit of shown) {
    const entry: ComplexListEntry = {
      unit,
      burden: calcBurdenAt(profile, rules, unit.maxPrice),
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
