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
  /**
   * 응답 자체가 성공이 아니라고 판단되면 사유(짧은 문자열), 정상 응답이면 null.
   *
   * 공공데이터포털은 일일 트래픽 초과·미등록/만료 키·잘못된 파라미터 같은
   * 가장 흔한 실패들을 **HTTP 200**과 함께 돌려준다 — 게이트웨이 XML 봉투이거나,
   * `response.header.resultCode`가 성공이 아닌 JSON 본문으로. 이걸 "거래
   * 없음"과 구분하지 않으면 오류 응답이 조용히 빈 캐시로 영구 저장된다.
   *
   * error가 null이 아니면 trades/failures/cancelled는 모두 의미가 없다
   * (전부 0/빈 배열) — 호출자는 trades를 쓰기 전에 반드시 error를 먼저 봐야
   * 한다. 사유 문자열에는 resultCode/resultMsg 정도만 담고, 원본 응답 본문
   * 전체나 요청 URL(키가 들어 있다)은 절대 넣지 않는다 — 길이도 제한한다.
   */
  error: string | null;
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
  /**
   * 거래 0건(status: "empty")으로 돌아온 시군구·월의 비율이 이 값(0~1)을
   * 넘으면 리포트가 해당 목록을 나열한다. 요약 줄(개수/전체)은 이 값과
   * 무관하게 항상 나온다 — 이 임계값은 "목록까지 펼쳐 보여줄지"만 결정한다.
   */
  emptyRatioWarnThreshold: number;
}
