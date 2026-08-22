import { useCallback, useMemo, useState } from "react";
import rawRules from "../../rules/2026-08.json";
import {
  calcAffordablePrice,
  calcMaxLoan,
  calcSafePrice,
  calcSafetyScore,
  parseRules,
  type AffordableResult,
  type BuyerProfile,
  type LoanLimit,
  type Rules,
  type SafetyScore,
} from "../lib/finance";

/**
 * 번들에 포함된 규제 룰셋.
 * 빌드 타임에 import되므로 네트워크 요청도 로딩 상태도 없다.
 */
export const rules: Rules = parseRules(rawRules);

export interface Affordability {
  result: AffordableResult;
  /** 슬라이더가 가리키는 현재 가격(원) */
  price: number;
  setPrice: (price: number) => void;
  /** 현재 가격에서의 대출 한도 */
  loanAtPrice: LoanLimit;
  /** 현재 가격에서 그 대출을 받았을 때의 상환 부담 */
  safety: SafetyScore;
  /**
   * 상환 부담이 안전 범위에 머무는 최대 매매가(원), 또는 그런 가격이
   * 하나도 없으면 `null`(`calcSafePrice` 문서 참고). 슬라이더가 가리키는
   * 현재 가격(`price`/`override`)과 무관하게 프로필·룰셋만으로 정해지는
   * 값이라 `result.affordablePrice`와 같은 층위(프로필 단위)에서
   * 독립적으로 메모이즈한다 — 슬라이더를 움직일 때마다 다시 계산할
   * 이유가 없다.
   */
  safePrice: number | null;
}

export function useAffordability(
  profile: BuyerProfile | null,
): Affordability | null {
  // null이면 "최대치에 붙어 있음"을 뜻한다. 프로필이 바뀌어 실구매력이
  // 달라져도 자동으로 따라간다.
  const [override, setOverride] = useState<number | null>(null);

  const result = useMemo(
    () => (profile === null ? null : calcAffordablePrice(profile, rules)),
    [profile],
  );

  // safePrice는 슬라이더 위치(override/price)와 무관하게 프로필·룰셋만으로
  // 정해진다. result와 같은 의존성 배열([profile])로 따로 메모이즈해,
  // 아래 반환 useMemo에 넣고 override를 의존성에 걸어 슬라이더를 움직일
  // 때마다(=override가 바뀔 때마다) 다시 검색하지 않게 한다.
  const safePrice = useMemo(
    () => (profile === null ? null : calcSafePrice(profile, rules)),
    [profile],
  );

  const setPrice = useCallback((next: number) => setOverride(next), []);

  return useMemo(() => {
    if (profile === null || result === null) return null;

    const price =
      override === null
        ? result.affordablePrice
        : clamp(override, 0, result.affordablePrice);

    const loanAtPrice = calcMaxLoan(profile, rules, price);
    const safety = calcSafetyScore(profile, rules, loanAtPrice.amount);

    return { result, price, setPrice, loanAtPrice, safety, safePrice };
  }, [profile, result, override, setPrice, safePrice]);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
