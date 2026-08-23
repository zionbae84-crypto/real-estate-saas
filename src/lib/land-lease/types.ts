/**
 * 토지임대부 표시가 가질 수 있는 상태.
 *
 * **`"N"`(아님)에 해당하는 상태가 없다.** 아무것도 그리지 않는 것이
 * "아님"의 표시이고, 그리는 것은 `"Y"`와 `null` 두 갈래뿐이다. 셋째
 * 상태를 만들어 "일반 분양주택이에요"라고 말하기 시작하면, `null`이
 * 언젠가 그 자리로 미끄러진다 — 모름을 "아님"으로 접는 것이 이
 * 제품에서 가장 하면 안 되는 일이다.
 */
export const LAND_LEASE_STATES = ["yes", "unknown"] as const;

export type LandLeaseState = (typeof LAND_LEASE_STATES)[number];

/**
 * 우리 부담 등급이 이 집의 "매달 나가는 돈"을 다 담지 못할 때 쓰는 문구.
 *
 * **판정을 바꾸는 근거 문구라 코드가 아니라 룰셋에 있다.** 부담 등급은
 * 우리가 계산한 월 상환액만으로 매기는데, `"Y"`와 `null`에서는 그 숫자에
 * 토지 사용료가 빠져 있다 — 우리가 스스로 불완전하다고 인정하는 숫자로
 * 최상위 안심 등급("안전")을 주지 않는다. 구매 유형 진단이 검증하지 못한
 * 대출 원금 때문에 전체 결론을 `clear`로 내리지 않는 것과 같은 판단이다
 * (`src/lib/purchase/assess.ts`의 `hasUnverifiedLoanPrincipal`).
 *
 * 두 상태(`yes`·`unknown`)가 **한 벌을 함께 쓴다.** 등급이 멈추는 이유가
 * 둘 다 같기 때문이다 — 우리 숫자가 매달 나가는 돈을 다 담지 못한다.
 * 무엇을 모르는지는 바로 옆 {@link LandLeaseStateCopy}가 말한다.
 */
export interface LandLeaseGradeCopy {
  /**
   * "안전" 자리에 대신 들어가는 **글자**. 색이 아니라 이 글자가 등급을
   * 진다("사면 안 돼요"가 아니다 — 토지임대부는 알고 사면 되는 집이고,
   * 우리가 말할 수 있는 것은 우리 숫자가 부족하다는 것뿐이다).
   */
  label: string;
  /** 왜 등급이 거기서 멈췄는가. 등급 글자 바로 옆에 붙는다 */
  note: string;
  /**
   * "대출 없이 살 수 있어요" **같은 자리**에 붙는 단서.
   *
   * 대출이 0원인 것은 사실이라 그 말을 지우지 않는다. 다만 그 말은
   * "매달 나가는 돈이 없다"로 읽히고, 토지임대부에서는 그것이 틀린다.
   */
  noLoanNote: string;
  /**
   * 목록에서 이 행들이 모이는 덩어리의 헤더.
   *
   * "살 수는 있지만 부담이 커요"로 보내지 않는다 — 우리는 부담이 크다는
   * 것을 모른다. 아는 것은 다 재지 못했다는 것뿐이다.
   */
  groupHeading: string;
}

/** 한 상태의 문구. 전부 룰셋에서 온다 — 코드에 문구를 박지 않는다 */
export interface LandLeaseStateCopy {
  /**
   * 색이 아니라 **글자**로 존재하는 표시. 흑백 인쇄·색각 이상에서도
   * 이 글자만으로 무슨 상태인지 읽혀야 한다.
   */
  badge: string;
  /**
   * 월 상환액 **바로 옆**에 붙는 문장. 사용자가 "월 얼마"를 읽는 그
   * 자리에서 그 숫자에 토지 사용료가 빠져 있다는 것을 알아야 한다.
   */
  monthlyNote: string;
  /**
   * 호가 위치 확인 화면에 붙는 문장.
   *
   * 그 화면은 월 상환액이 아니라 **값**을 견주는 자리라 짚어야 하는
   * 사실이 다르다 — 이 호가는 땅값이 아니라 건물값이고, 아래 실거래
   * 범위도 토지임대부 거래끼리 견준 값이다.
   *
   * 문장을 나눈 실질적인 이유가 하나 더 있다: **단지 상세가 호가
   * 화면을 품고 있다.** 두 자리에 같은 문장을 쓰면 한 화면에 똑같은
   * 경고가 두 번 뜨고, 그러면 둘 다 잡음으로 읽힌다.
   */
  priceNote: string;
  /**
   * 우리가 대신 계산해 줄 수 없으니 어디서 확인하라는 문장.
   *
   * 금액을 추정하지 않는다 — 데이터에 없다. "얼마쯤 더 나온다"고
   * 지어내는 대신 "우리가 모르는 돈이 더 나간다"고 말한다.
   */
  checkNote: string;
}

export interface LandLeaseRules {
  version: string;
  effectiveFrom: string;
  /** 등급을 붙드는 문구. 두 상태가 함께 쓴다 */
  grade: LandLeaseGradeCopy;
  states: Record<LandLeaseState, LandLeaseStateCopy>;
}

/** 화면이 그대로 그리는 한 덩어리 */
export interface LandLeaseNotice extends LandLeaseStateCopy {
  state: LandLeaseState;
}
