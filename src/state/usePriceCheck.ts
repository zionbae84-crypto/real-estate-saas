import { useMemo, useState } from "react";
import rawPriceRules from "../../rules/price-2026-08.json";
import {
  assessPrice,
  parsePriceRules,
  type PriceAssessment,
  type PriceBudgetInput,
  type PriceEvidence,
  type PriceRules,
} from "../lib/price";

/**
 * 번들에 포함된 호가 위치 룰셋.
 * 빌드 타임에 들어오므로 네트워크 요청도 로딩 상태도 없다.
 */
export const priceRules: PriceRules = parsePriceRules(rawPriceRules);

export interface PriceCheckState {
  rules: PriceRules;
  /** 제시받은 호가(원). 아직 안 넣었으면 null */
  askingPrice: number | null;
  setAskingPrice: (won: number | null) => void;
  assessment: PriceAssessment;
}

/**
 * 제시받은 호가를 들고 그 평형의 실거래 범위와 견준다.
 *
 * **저장하지 않는다.** `useProfileForm`은 예산 입력을 localStorage에
 * 남기지만, 여기 담기는 것은 특정 매물에 대해 들은 가격이다 —
 * 권리분석 문진·구매 유형 입력과 같은 이유로 남기지 않는다.
 *
 * **평형이 바뀌면 호가도 비워져야 한다.** 다른 평형의 범위에 앞
 * 매물의 호가를 견주면 화면은 멀쩡한 판정을 내는데 그 판정이 통째로
 * 다른 집에 대한 것이 된다 — 이 제품이 절대 만들면 안 되는 종류의
 * 조용한 오답이다. 그 초기화는 호출부가 컴포넌트에 평형별 `key`를
 * 주어 다시 마운트시키는 방식으로 한다(`ComplexDetail` 참고) — 이
 * 훅 안에서 `useEffect`로 지우면 한 번 잘못된 값으로 렌더된 뒤에
 * 지워진다.
 */
export function usePriceCheck(
  evidence: PriceEvidence,
  budget: PriceBudgetInput | null,
): PriceCheckState {
  const [askingPrice, setAskingPrice] = useState<number | null>(null);

  const assessment = useMemo(
    () => assessPrice(priceRules, evidence, askingPrice, budget),
    [evidence, askingPrice, budget],
  );

  return { rules: priceRules, askingPrice, setAskingPrice, assessment };
}
