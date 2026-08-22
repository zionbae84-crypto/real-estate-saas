/** API 응답 한 건을 정규화 전 형태로 담은 것. 금액은 이미 원 단위 정수다. */
export interface RawTrade {
  /** 시군구 코드 5자리 */
  regionCode: string;
  /** 법정동명 (코드가 아니라 이름으로 온다) */
  legalDongName: string;
  complexName: string;
  builtYear: number;
  exclusiveAreaSqm: number;
  floor: number;
  /** 원 단위 정수 */
  price: number;
  /** YYYY-MM-DD */
  contractDate: string;
}

export interface ParseResult {
  trades: RawTrade[];
  /** 파싱에 실패한 레코드 수. 조용히 버리지 않고 세어서 리포트에 남긴다 */
  failures: number;
  /**
   * 해제(취소)된 거래로 걸러낸 레코드 수.
   *
   * `cdealType`이 공백이 아니면 계약이 해제된 것이다. 해제된 거래가 단지의
   * 대표가(중위값)에 섞이면 실제로는 성사되지 않은 금액이 시세로 둔갑한다.
   * 파싱 실패(형식 오류)와 원인이 다르므로 failures와 합치지 않고 따로 센다 —
   * 합치면 "이번 달 데이터 품질이 나쁘다"는 신호와 "정상적으로 해제된 계약이
   * 있다"는 신호가 뒤섞여 실패 카운트가 무의미해진다.
   */
  cancelled: number;
}

export interface ReportConfig {
  /** 과소병합 후보로 볼 정규화명 편집거리 상한 */
  underMergeMaxEditDistance: number;
  /** 과대병합 의심으로 볼 최고가/최저가 비율 하한 */
  overMergeMinPriceRatio: number;
  /** 과대병합 판정에 필요한 최소 거래 건수 */
  overMergeMinTradeCount: number;
  /** lowConfidence 판정 기준 (최근 6개월 거래 건수 미만) */
  lowConfidenceMinTrades: number;
}
