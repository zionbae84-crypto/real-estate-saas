/**
 * 호가 위치 판정 엔진의 공개 표면.
 *
 * `src/lib/finance`·`src/lib/rights`·`src/lib/purchase`와 나란한
 * 자리다. 예산 엔진(`src/lib/finance`)은 **읽기만 하고 고치지 않는다** —
 * 이 모듈의 예산 줄은 `calcBurdenAt`·`calcAcquisitionCosts`·
 * `ownFundsRequired`를 그대로 불러 쓰고, 실거주 프로필이 없으면 그
 * 줄 자체를 만들지 않는다.
 *
 * **적정가를 내지 않는다.** 이 모듈 어디에도 점 추정(적정가·추정가·
 * 시세)이 없고, `(min + max) / 2` 같은 값도 만들지 않는다. 내는 것은
 * 관측된 범위와 그 안에서의 위치뿐이며, 표본이 그 위치를 받치지
 * 못하면 판정을 유보한다.
 */
export { assessPrice } from "./assess";
export { parsePriceRules } from "./rules";
export { PRICE_BANDS, PRICE_OVERALLS, PRICE_VERDICTS } from "./types";
export type {
  PriceAssessment,
  PriceBand,
  PriceBudgetFinding,
  PriceBudgetInput,
  PriceBudgetSituation,
  PriceDisclosure,
  PriceEvidence,
  PriceFinding,
  PriceFindingId,
  PriceOverall,
  PricePositionFinding,
  PriceRules,
  PriceVerdict,
} from "./types";
