import type { BuyerProfile, CostBreakdown, Rules } from "./types";

/**
 * 주택 취득에 드는 부대비용을 계산한다.
 * 취득세는 6억~9억 구간에서 누진 세율이 적용된다.
 */
export function calcAcquisitionCosts(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): CostBreakdown {
  const acquisitionTax = calcAcquisitionTax(price, profile, rules);
  const brokerageFee = calcBrokerageFee(price, rules);
  // 룰셋의 정액 항목은 소수일 수 있다. 반환 금액은 모두 정수 원이라는
  // 계약이 있으므로, 지금 값이 마침 정수라는 사실에 기대지 않고 내림한다.
  const legalFee = Math.floor(rules.legalFee);
  const movingCost = Math.floor(rules.movingCost);

  return {
    acquisitionTax,
    brokerageFee,
    legalFee,
    movingCost,
    total: Math.floor(acquisitionTax + brokerageFee + legalFee + movingCost),
  };
}

function calcAcquisitionTax(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const t = rules.acquisitionTax;
  const baseRate = acquisitionTaxRate(price, rules);

  const localEducationTax = baseRate * t.localEducationTaxRatio;
  const ruralTax =
    profile.exclusiveAreaSqm > t.ruralTaxAreaThresholdSqm ? t.ruralTaxRate : 0;

  const total = price * (baseRate + localEducationTax + ruralTax);
  const relief =
    profile.isFirstTimeBuyer && price <= t.firstTimeBuyerReliefPriceCap
      ? t.firstTimeBuyerReliefCap
      : 0;

  return Math.max(0, Math.floor(total - relief));
}

/**
 * 취득세 기본 세율. 6억 이하 1%, 9억 초과 3%,
 * 그 사이는 두 점을 잇는 직선으로 누진한다.
 */
function acquisitionTaxRate(price: number, rules: Rules): number {
  const t = rules.acquisitionTax;
  if (price <= t.lowerBound) return t.lowRate;
  if (price > t.upperBound) return t.highRate;

  const progress = (price - t.lowerBound) / (t.upperBound - t.lowerBound);
  return t.lowRate + (t.highRate - t.lowRate) * progress;
}

function calcBrokerageFee(price: number, rules: Rules): number {
  const bracket = rules.brokerageFee.find(
    (b) => b.upTo === null || price < b.upTo,
  );
  if (!bracket) {
    throw new Error(`중개보수 구간을 찾을 수 없습니다: ${price}`);
  }

  const fee = price * bracket.rate;
  return Math.floor(bracket.cap === null ? fee : Math.min(fee, bracket.cap));
}
