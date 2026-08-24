import { assertNonNegativeFinite } from "./profile";
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
  assertNonNegativeFinite(price, "price");
  const acquisitionTax = calcAcquisitionTax(price, profile, rules);
  const brokerageFee = calcBrokerageFee(price, rules);
  // 부가세는 상한이 적용된 뒤의 중개보수에 붙는다.
  const brokerageVat = Math.floor(brokerageFee * rules.brokerageVatRate);
  const housingBondCost = calcHousingBondCost(price, rules);
  // 룰셋의 정액 항목은 소수일 수 있다. 반환 금액은 모두 정수 원이라는
  // 계약이 있으므로, 지금 값이 마침 정수라는 사실에 기대지 않고 내림한다.
  const legalFee = Math.floor(rules.legalFee);
  const movingCost = Math.floor(rules.movingCost);

  return {
    acquisitionTax,
    brokerageFee,
    brokerageVat,
    legalFee,
    movingCost,
    housingBondCost,
    total: Math.floor(
      acquisitionTax +
        brokerageFee +
        brokerageVat +
        legalFee +
        movingCost +
        housingBondCost,
    ),
  };
}

/**
 * 이 구매자에게 내야 하는 **취득세 주택 수 고지**를 고른다.
 *
 * 화면이 두 곳(`CostBreakdown`·`PriceCheck`)에서 같은 고지를 내므로,
 * 고르는 규칙을 각자 두면 언젠가 한쪽만 고쳐져 같은 사용자에게 서로
 * 다른 말을 하게 된다. 규칙은 여기 하나뿐이다.
 *
 * 문구 자체는 룰셋에서 온다 — 코드에 박지 않는다. 파서(`rules.ts`)가
 * 두 문구의 방향을 각각 강제한다: 유주택 문구는 "물었지만 반영하지
 * 못했고 부대비용이 커질 수 있다"를 말해야 하고, 무주택 문구는 비용이
 * 커진다는 말을 담지 못한다(그 사람에게는 거짓이라).
 */
export function householdCountNoteFor(
  profile: BuyerProfile,
  rules: Rules,
): string {
  return profile.ownedHomeCount > 0
    ? rules.acquisitionTax.householdCountNote
    : rules.acquisitionTax.householdCountNoteNoHome;
}

/**
 * 국민주택채권 매입 후 즉시 매도 시의 할인 손실 추정액.
 *
 * 채권 매입액은 매매가가 아니라 시가표준액(공동주택 공시가격) 기준이다.
 * 이 엔진은 공시가격을 모르므로 `assumedPriceToStandardRatio`로 추정하며,
 * 그 값과 `assumedDiscountRate`는 모두 **검증되지 않은 가정치**다.
 * 화면에서도 추정치임을 밝혀야 한다.
 */
function calcHousingBondCost(price: number, rules: Rules): number {
  const bond = rules.housingBond;
  const standardValue = price * bond.assumedPriceToStandardRatio;

  const bracket = bond.brackets.find(
    (b) => b.upTo === null || standardValue < b.upTo,
  );
  if (!bracket) {
    throw new Error(`국민주택채권 구간을 찾을 수 없습니다: ${standardValue}`);
  }

  const purchase = (standardValue * bracket.perThousand) / 1_000;
  return Math.floor(purchase * bond.assumedDiscountRate);
}

/**
 * **의도된 한계: 이 함수는 `profile.ownedHomeCount`(주택 수)를 읽지
 * 않는다.** 실제 취득세는 취득자의 주택 수에 따라 세율이 크게
 * 갈린다(다주택 중과) — 하지만 `rules/2026-08.json`에는 그 분기가
 * 아예 없고, 여기서도 항상 `acquisitionTaxRate`가 주는 무주택 기준
 * 누진세율(6억 이하 1%~9억 초과 3%)만 쓴다.
 *
 * ⚠ **화면은 이제 주택 수를 묻는다.** 그래서 이 한계의 성격이 바뀌었다 —
 * 예전에는 "묻지 않은 것을 계산하지 않는다"였지만, 지금은 "물어 놓고
 * 쓰지 않는다"다. 사용자는 물어본 것은 당연히 반영됐다고 읽으므로,
 * 고지가 그 사실 자체를 말하지 않으면 침묵보다 더 나쁘게 오해된다.
 * `householdCountNoteFor`가 무주택·유주택으로 갈린 문구를 고른다.
 *
 * 빠뜨린 게 아니라 **확인된 중과세율이 없어서 넣지 않은 것이다** —
 * 확인되지 않은 규제 수치를 계산에 넣는 것이 이 저장소에서 가장 하면
 * 안 되는 일이다(다른 미검증 값은 `_note`로 밝히고 화면에 알리는
 * 것으로 대신한다 — `housingBond`의 `assumedPriceToStandardRatio` 등).
 *
 * **그래서 무엇이 과소 계상되는가:** 이미 집이 있는 구매자에게는
 * 이 함수가 실제보다 낮은 취득세를 내고, 그 결과
 * `calcAcquisitionCosts`의 `total`도, 그 위의 `ownFundsRequired`도
 * 실제보다 작게 나온다 — "이 정도 현금이면 살 수 있다"는 판단이 낙관
 * 방향으로 틀릴 수 있다는 뜻이다. 그래서 화면은 계산을 고치는 대신
 * `rules.acquisitionTax.householdCountNote`로 이 한계와 방향을
 * 알린다(`CostBreakdown`·`PriceCheck` 참고, `rules.ts`의
 * `assertHouseholdCountNoteRequired`가 그 문구의 방향을 강제한다).
 * 무주택이라고 답한 사람에게는 그 경고가 거짓이므로
 * `householdCountNoteNoHome`이 대신 나간다.
 *
 * 다주택 취득세 중과율을 확인하면, 그때 `Rules.acquisitionTax`에 주택
 * 수별 세율 분기를 추가하고 여기서 `profile.ownedHomeCount`를 읽어야
 * 한다. 프로필에는 이미 그 값이 들어와 있다.
 */
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
