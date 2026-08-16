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
  /** 최종 대출 가능액(원). max( min(LTV, DSR, CAP), POLICY ) */
  amount: number;
  /** 어느 제약이 이 금액을 만들었는가 */
  binding: BindingConstraint;
  /**
   * 각 제약별 한도(원, 정수). 사용자에게 근거를 보여줄 때 쓴다.
   *
   * LTV·DSR·CAP은 은행 경로의 상한이고, POLICY는 정책대출을 택했을 때의
   * 한도다. 자격이 되는 정책대출 상품이 없으면 POLICY는 **0**이며,
   * 이는 "정책대출이라는 선택지 자체가 없음"을 뜻한다(최대값 의미론에서
   * 0은 어떤 은행 한도도 이기지 못하므로 자연스러운 부재 표현이다).
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
  /** 위 항목의 합계(원) */
  total: number;
}

/** 재무 안전성 등급 */
export type SafetyLevel = "safe" | "caution" | "danger";

/** 상환 부담 평가 결과 */
export interface SafetyScore {
  /** 기본 시나리오 월 상환액(원) */
  monthlyPayment: number;
  /** 기본 시나리오 상환부담률 (0.28 = 28%) */
  burdenRatio: number;
  /** 금리 스트레스 시나리오 월 상환액(원) */
  stressedMonthlyPayment: number;
  /** 금리 스트레스 시나리오 상환부담률 */
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

/** 버전이 찍힌 규제 룰셋 */
export interface Rules {
  version: string;
  effectiveFrom: string;
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
    default: number;
    firstTimeBuyer: number;
  };
  /** 수도권 주택구입 목적 주담대 절대 상한(원) */
  absoluteCap: number;
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
