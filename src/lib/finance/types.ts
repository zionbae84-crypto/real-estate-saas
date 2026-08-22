/** 주택 보유 상황 */
export type HouseholdStatus = "무주택" | "갈아타기";

/** 갈아타기 시 기존 주택 정보 */
export interface ExistingHome {
  /** 예상 매도가(원) */
  expectedSalePrice: number;
  /** 매도 시 상환해야 할 기존 대출 잔액(원) */
  remainingLoan: number;
  /** 사용자가 직접 입력한 예상 양도세(원). 미입력이면 undefined */
  capitalGainsTax?: number;
}

/** 구매자 재무 프로필 */
export interface BuyerProfile {
  status: HouseholdStatus;
  /** 주택 구매에 투입 가능한 순수 보유 현금(원) */
  cash: number;
  /** 연 소득(원, 세전) */
  annualIncome: number;
  /** 기존 부채의 연간 원리금 상환액 합계(원) */
  existingDebtAnnualPayment: number;
  /** 생애최초 주택 구입 여부 */
  isFirstTimeBuyer: boolean;
  /** 전용면적(㎡). 농특세 부과 기준(85㎡ 초과) 판정에 쓰인다 */
  exclusiveAreaSqm: number;
  /**
   * 규제지역(투기과열지구·조정대상지역) 소재 여부.
   *
   * LTV가 크게 갈린다. 규제지역 무주택자는 40%, 비규제 수도권은 70%다.
   * 생애최초는 규제지역에서도 70% 예외를 받는다. 잘못 켜고 끄면 한도가
   * 30%p 어긋나므로, 폼의 기본값은 과대평가를 피하는 쪽(규제지역=true)이다.
   */
  isRegulatedArea: boolean;
  /** 갈아타기일 때만 존재 */
  existingHome?: ExistingHome;
}

/**
 * 대출 한도를 결정지은 제약.
 *
 * LTV·DSR·CAP은 은행 경로에서 "걸린 상한"을 뜻하지만, POLICY만은 의미가
 * 다르다. 정책대출은 강제되는 상한이 아니라 구매자가 택할 수 있는
 * 선택지이므로, binding이 POLICY라는 것은 "정책대출을 택할 때의 한도가
 * 당신의 최대치"라는 뜻이다.
 */
export type BindingConstraint = "LTV" | "DSR" | "CAP" | "POLICY";

/** 대출 한도 계산 결과 */
export interface LoanLimit {
  /**
   * 최종 대출 가능액(원).
   * max( min(LTV, DSR@시중금리, CAP), POLICY )
   */
  amount: number;
  /** 어느 제약이 이 금액을 만들었는가 */
  binding: BindingConstraint;
  /**
   * 각 제약별 한도(원, 정수). 사용자에게 근거를 보여줄 때 쓴다.
   *
   * LTV·DSR·CAP은 은행 경로의 상한이다(DSR은 시중금리 기준).
   *
   * POLICY는 정책대출을 택했을 때 **실제로 받을 수 있는** 한도이지, 상품
   * 고시 한도(`PolicyLoanRule.maxAmount`)가 아니다. 정책대출도 상환능력과
   * 담보가치의 제약을 받으므로, 자격 상품마다
   * `min(maxAmount, LTV한도, DSR한도@상품금리)`를 구한 뒤 그중 최대값이
   * 들어간다. DSR을 상품 금리로 계산하는 이유는 정책대출의 혜택이 심사
   * 면제가 아니라 낮은 금리이기 때문이다 — 금리가 낮으면 같은 원금의 월
   * 상환액이 작아 상환능력 기준 한도가 정당하게 더 크다.
   *
   * 따라서 `POLICY <= max(자격 상품들의 maxAmount)`가 항상 성립하며,
   * 자격 상품이 있어도 소득이 없으면 POLICY는 0이 될 수 있다.
   * 자격이 되는 정책대출 상품이 아예 없을 때도 POLICY는 **0**이며, 이는
   * "정책대출이라는 선택지 자체가 없음"을 뜻한다(최대값 의미론에서 0은
   * 어떤 은행 한도도 이기지 못하므로 자연스러운 부재 표현이다).
   * 모든 값은 유한한 정수이며 Infinity가 들어가지 않는다.
   */
  breakdown: Record<BindingConstraint, number>;
}

/** 취득 부대비용 내역 */
export interface CostBreakdown {
  /** 취득세 + 지방교육세 + 농어촌특별세 합계(원) */
  acquisitionTax: number;
  /** 중개보수(원) */
  brokerageFee: number;
  /** 법무사 비용(원) */
  legalFee: number;
  /** 이사 비용(원) */
  movingCost: number;
  /** 중개보수에 붙는 부가가치세(원) */
  brokerageVat: number;
  /** 국민주택채권 매입 후 즉시 매도 시의 할인 손실 추정액(원) */
  housingBondCost: number;
  /** 위 항목의 합계(원) */
  total: number;
}

/** 재무 안전성 등급 */
export type SafetyLevel = "safe" | "caution" | "danger";

/** 상환 부담 평가 결과 */
export interface SafetyScore {
  /** 기본 시나리오 월 상환액(원) */
  monthlyPayment: number;
  /**
   * 기본 시나리오 상환부담률 (0.28 = 28%).
   *
   * **분모는 세전(gross) 월 소득이다 — 가처분소득이 아니다.** 한국의
   * DSR류 기준선은 관례적으로 세전 소득에 대해 고시되므로,
   * rules.safetyThreshold의 25% / 35% 임계값도 세전과 짝을 이룰 때만
   * 의미가 맞는다. 분모를 가처분소득으로 바꾸면 같은 임계값이 훨씬
   * 엄격해져 등급 체계 전체가 어긋난다. 설계 문서 6절에는 한때
   * "가처분소득"으로 적혀 있었으나 세전으로 확정했다(문서도 수정됨).
   * safety.test.ts의 분모 고정 테스트가 이 결정을 지킨다.
   */
  burdenRatio: number;
  /** 금리 스트레스 시나리오 월 상환액(원) */
  stressedMonthlyPayment: number;
  /** 금리 스트레스 시나리오 상환부담률. 분모는 위와 동일하게 세전 월 소득 */
  stressedBurdenRatio: number;
  level: SafetyLevel;
}

/** 정책대출 상품 정의 */
export interface PolicyLoanRule {
  id: string;
  /** 조건 키-값. 엔진이 일반적으로 평가한다 */
  eligibility: {
    requiresNoHome?: boolean;
    requiresFirstTimeBuyer?: boolean;
    maxAnnualIncome?: number;
    maxHousePrice?: number;
    maxAreaSqm?: number;
  };
  /** 최대 대출액(원) */
  maxAmount: number;
  /** 연이율 */
  rate: number;
}

/**
 * 버전이 찍힌 규제 룰셋.
 *
 * ⚠ **적용 범위: 수도권 기준.** 전국에 통용되는 값이 아니다.
 *
 * `ltv`는 규제지역/비규제지역 축을 이미 갖고 있다(`ltv.regulated` /
 * `ltv.unregulated`) — 규제지역은 LTV가 더 낮다는 사실이 반영돼 있다.
 * 하지만 `absoluteCap`, `stressDSR.surcharge`는 여전히 스칼라다. 실제
 * 규제에서는 이 값들도 지역에 따라 달라지는데(비규제지역은 절대 상한이
 * 없고 스트레스 가산금리도 다르다), 이 인터페이스는 그 축을 아직 담지
 * 못한다.
 *
 * 그리고 `ltv`가 가진 축은 "규제/비규제" 구분일 뿐 "수도권/비수도권"
 * 구분이 아니다 — 이 룰셋 자체가 수도권 값만 담고 있다. 비수도권을
 * 지원하려면 값을 바꿔 끼우는 것으로는 안 되고, `ltv`를 포함한 관련
 * 필드 전부에 수도권/비수도권 축을 새로 도입해야 한다(예:
 * `ltv: { metro: { regulated: {...}, unregulated: {...} }, nonMetro: {...} }`)
 * — 즉 프로필에 지역을 받고 룰셋 스키마를 바꾸는 별도 작업이며, 아직
 * 하지 않았다.
 */
export interface Rules {
  version: string;
  effectiveFrom: string;
  /** 이 룰셋이 적용되는 범위를 사람이 읽는 문장으로 적어 둔 것 */
  _scope?: string;
  /** 대출 심사에 쓰는 기준 금리(연이율) */
  baseRate: number;
  /** 상환 개월수 (30년 = 360) */
  loanTermMonths: number;
  stressDSR: {
    stage: number;
    /** 스트레스 가산금리 (0.015 = 1.5%p) */
    surcharge: number;
  };
  /** 안전성 평가용 금리 스트레스 폭 (0.02 = +2%p) */
  safetyStressSurcharge: number;
  ltv: {
    regulated: { default: number; firstTimeBuyer: number };
    unregulated: { default: number; firstTimeBuyer: number };
  };
  /** 중개보수에 별도로 붙는 부가가치세율. 일반과세자 기준 0.1 */
  brokerageVatRate: number;
  housingBond: {
    /** 이 값들의 검증 상태를 설명하는 인간이 읽을 수 있는 주석 */
    _note?: string;
    /**
     * 매매가 대비 시가표준액(공동주택 공시가격) 비율.
     * **검증되지 않은 가정치다.** 단지·연도별로 달라 단일 값으로 확정할 수 없다.
     */
    assumedPriceToStandardRatio: number;
    /**
     * 채권 즉시 매도 시 할인율. **검증되지 않은 가정치다.**
     * 매일 변동하며 조사한 출처들이 4%~10%로 갈렸다.
     */
    assumedDiscountRate: number;
    /** 시가표준액 1,000원당 매입액(원). upTo 오름차순, 마지막은 null */
    brackets: Array<{ upTo: number | null; perThousand: number }>;
  };
  /**
   * 수도권 주택구입 목적 주담대 절대 상한(원). 주택가격 구간별로 다르다.
   *
   * ⚠ **`upTo`는 포함(이하)이다.** 이 파일의 다른 구간 배열
   * (`housingBond.brackets`, `brokerageFee`)과 취득세 구간은 전부
   * 배타(미만)이므로 여기만 다르다. 규제 원문이 "15억 원 이하 → 6억"으로
   * 쓰기 때문이며, 배타로 읽으면 가격이 정확히 15억일 때 한도를 2억
   * 과소 계상한다. 조회는 반드시 `calcAbsoluteCap`을 쓴다.
   */
  absoluteCap: {
    /** 이 값들의 검증 상태를 설명하는 인간이 읽을 수 있는 주석 */
    _note?: string;
    /** upTo 오름차순, 마지막은 null(무한대). upTo는 포함 */
    brackets: Array<{ upTo: number | null; amount: number }>;
  };
  /** DSR 한도 (0.4 = 40%) */
  dsrLimit: number;
  safetyThreshold: {
    safe: number;
    caution: number;
    /** 스트레스 시나리오에서 이 값을 넘으면 무조건 danger */
    stressedDanger: number;
  };
  acquisitionTax: {
    /** 6억 이하 구간 세율 */
    lowRate: number;
    /** 9억 초과 구간 세율 */
    highRate: number;
    lowerBound: number;
    upperBound: number;
    /** 지방교육세 = 취득세율 × 이 비율 */
    localEducationTaxRatio: number;
    /** 전용 85㎡ 초과 시 농어촌특별세율 */
    ruralTaxRate: number;
    ruralTaxAreaThresholdSqm: number;
    /** 생애최초 감면 한도(원) */
    firstTimeBuyerReliefCap: number;
    /** 생애최초 감면이 적용되는 주택가격 상한(원) */
    firstTimeBuyerReliefPriceCap: number;
  };
  /** 중개보수 구간. upTo 오름차순으로 정렬되어 있어야 한다 */
  brokerageFee: Array<{
    /** 이 금액 미만까지 적용. 마지막 구간은 null(무한대) */
    upTo: number | null;
    rate: number;
    /** 상한액(원). 없으면 null */
    cap: number | null;
  }>;
  /** 법무사 비용 정액 추정(원) */
  legalFee: number;
  /** 이사 비용 정액 추정(원) */
  movingCost: number;
  policyLoans: PolicyLoanRule[];
}
