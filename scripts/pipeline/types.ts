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
