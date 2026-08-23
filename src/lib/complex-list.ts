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
   *
   * **단지 키가 `aptSeq`(국토부 단지 ID)로 바뀌어도 이 보정은 여전히
   * 필요하다.** `aptSeq`는 **파이프라인**이 단지를 가르는 문제를 풀었지
   * **사용자**가 가르는 문제를 푼 것이 아니다 — 화면에 뜨는 것은 ID가 아니라
   * 이름이라, 같은 법정동에 이름까지 같은 다른 단지가 둘 있으면 목록에
   * 똑같이 생긴 행이 둘 뜬다. 키가 달라졌다는 사실은 사용자에게 보이지 않는다.
   *
   * 준공년도까지 같아 이것으로도 못 가르는 경우가 있다. 그건 화면이 아직
   * 대책이 없다는 뜻이고, 이상 신호 리포트의 "화면에서 구분 안 되는 동명
   * 단지" 절이 `대책: 없음`으로 드러낸다(지금 데이터에서는 0건이다).
   */
  needsBuiltYear: boolean;
}

export interface ComplexListResult {
  /** 그 행 자신의 부담 등급이 `safe`인 행 */
  withinSafe: ComplexListEntry[];
  /** 살 수는 있지만 그 행의 부담 등급이 `safe`가 아닌 행 */
  beyondSafe: ComplexListEntry[];
  affordablePrice: number;
  /**
   * 헤드라인용 안전선. 안전한 가격이 없으면 null.
   *
   * 프로필의 가정 면적으로 잰 값이라 덩어리 분기에는 쓰지 않는다
   * (아래 `buildComplexList` 문서 참고).
   */
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
 * **행마다 그 행의 실제 전용면적(`unit.maxExclusiveAreaSqm`)으로 계산한다.**
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
 * **두 덩어리로 가르는 기준도 그 행 자신의 부담 등급이다**
 * (`entry.burden.safety.level === "safe"`). 덩어리와 행 배지가 같은
 * `entry.burden` 하나에서 나오므로 구조적으로 어긋날 수 없다.
 *
 * 예전에는 헤드라인 안전선(`safePrice`, 프로필의 **가정** 면적으로 잰
 * 값)과 행의 `maxPrice`를 비교해 갈랐다. 행의 부담은 행 자신의 실제
 * 면적으로 재는데 분기만 가정 면적으로 재니 둘이 어긋났고, 어긋나는
 * 방향이 하필 낙관 쪽이었다 — "무리 없이 살 수 있어요" 덩어리 안에
 * "주의" 배지가 달린 행이 들어가, 덩어리 헤더가 그 행의 배지보다
 * 낙관적으로 말했다. 이 제품이 가장 피해야 하는 종류의 오답이다.
 *
 * `safePrice`는 화면 상단 헤드라인이 쓰므로 계속 계산해 돌려주지만,
 * **분기에는 쓰지 않는다.**
 *
 * `unit.areaBucket`이 아니라 **`unit.maxExclusiveAreaSqm`**(그 버킷에 실제로
 * 들어간 거래들의 최대 전용면적, 원본 실수값)으로 계산한다. `areaBucket`은
 * 반올림한 값이라 실제 전용면적 85.4㎡가 85로 내려올 수 있는데, 그러면
 * 85㎡ 이하로 오판해 농특세를 빼고 계산한다 — 부담은 실제보다 작게,
 * 실구매력은 실제보다 크게 나오는 낙관 방향 오류다.
 */
export function buildComplexList(input: ComplexListInput): ComplexListResult {
  const { units, profile, rules, regionCodes } = input;

  const affordablePrice = calcAffordablePrice(profile, rules).affordablePrice;
  const safePrice = calcSafePrice(profile, rules);
  const availableCash = calcAvailableCash(profile).amount;

  const rowProfile = (u: ComplexUnit): BuyerProfile => ({
    ...profile,
    exclusiveAreaSqm: u.maxExclusiveAreaSqm,
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
    // 덩어리와 배지가 같은 entry.burden에서 나온다 — 위 문서 참고.
    (entry.burden.safety.level === "safe" ? withinSafe : beyondSafe).push(entry);
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
