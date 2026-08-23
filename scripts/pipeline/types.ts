/**
 * 토지임대부 여부.
 *
 * `"Y"`(토지임대부다) / `"N"`(아니다) / `null`(**모른다**)의 세 값이다.
 * 불리언 두 값으로 접지 않는 이유가 이 타입의 요점이다 — 국토부 응답은
 * `"Y"`/`"N"` 외의 값(공백 한 칸, 필드 없음, 예상 못한 코드)을 보낼 수 있는데,
 * 그걸 `false`로 접으면 화면이 "토지 소유권이 있는 집"이라고 **없는 사실을
 * 말하게 된다.** 토지임대부는 토지 소유권이 없는 집이라 사는 사람이 반드시
 * 알아야 하는 "사지 말아야 할" 신호이므로, 놓치는 쪽이 곧 낙관 방향이다.
 *
 * 나중에 `landLeasehold !== "Y"`를 "토지임대부 아님"으로 읽는 코드를 쓰지 말 것.
 * "아님"은 `=== "N"`뿐이고, `null`은 아직 아무것도 모른다는 뜻이다.
 */
export type LandLeasehold = "Y" | "N" | null;

/**
 * 거래 한 건의 주소. **지금은 저장만 하고 화면에 쓰지 않는다.**
 *
 * 나중에 지오코딩(입지분석)을 붙이려면 도로명·지번이 있어야 하는데, 그때
 * 가서 12개월치를 다시 받을 수는 없다(재수집은 API 호출 예산을 쓰고, 그
 * 사이 해제된 거래는 영영 못 본다). 그래서 지금 받는 김에 남겨 둔다.
 *
 * 전부 `string | null`이다 — API가 이 필드들을 숫자로도 문자열로도 보내고
 * (`bonbun`은 `"0746"`과 `1284`가 섞여 온다), `bubun` 같은 필드는 `"0000"`이라
 * 숫자로 바꾸면 선행 0이 사라진다. 온 그대로를 문자열로 보존한다.
 *
 * 주소가 없다고 거래를 버리지는 않는다. 이 필드들은 **가격·부담 계산에 전혀
 * 쓰이지 않으므로**, 없다고 그 거래의 시세 근거가 나빠지지 않는다. 없으면
 * `null`로 남기고(모르면 모른다고 남긴다) 거래 자체는 살린다.
 */
export interface RawAddress {
  /** 도로명 (예: "광평로19길") */
  roadNm: string | null;
  /** 도로명 코드 */
  roadNmCd: string | null;
  /** 지번 본번 (선행 0이 의미를 가지므로 문자열) */
  bonbun: string | null;
  /** 지번 부번 */
  bubun: string | null;
  /** 지번 (예: 746 또는 "107-44" — 둘 다 온다) */
  jibun: string | null;
  /** 법정동 코드 */
  umdCd: string | null;
}

/** API 응답 한 건을 정규화 전 형태로 담은 것. 금액은 이미 원 단위 정수다. */
export interface RawTrade {
  /** 시군구 코드 5자리 */
  regionCode: string;
  /**
   * 국토부가 주는 **단지 고유 ID**. `"11680-314"` 형태(시군구코드-일련번호).
   *
   * 단지 키(`normalize.ts`의 `buildComplexKey`)가 이 값이다. 이름 표기가
   * 흔들려도 갈라지지 않고, 같은 이름의 다른 단지가 합쳐지지도 않는다.
   *
   * 없거나 공백뿐이면 **파싱 실패로 센다.** 이 값이 없으면 그 거래를 어느
   * 단지에 넣어야 할지 알 수 없고, 이름으로 대충 밀어 넣으면 우리가 방금
   * 없앤 과소·과대병합을 조용히 되살리게 된다.
   */
  aptSeq: string;
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
  /** 토지임대부 여부. 모르면 null — {@link LandLeasehold} 참고 */
  landLeasehold: LandLeasehold;
  /** 주소. **저장만 하고 화면에 쓰지 않는다** — {@link RawAddress} 참고 */
  address: RawAddress;
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
  /**
   * 가격 범위가 "지나치게 넓다"고 볼 최고가/최저가 비율 하한.
   *
   * 옛 이름은 `overMergeMinPriceRatio`("과대병합")였다. 단지 키가 `aptSeq`가
   * 되면서 다른 단지가 한 키로 뭉치는 일 자체가 없어져, 이 임계값이 재는
   * 것은 이제 병합 사고가 아니라 **화면이 내는 가격 범위의 넓이**다.
   */
  widePriceRangeMinRatio: number;
  /** 가격 범위 판정에 필요한 최소 거래 건수. 거래가 적으면 우연히 벌어진다 */
  widePriceRangeMinTradeCount: number;
  /** lowConfidence 판정 기준 (최근 6개월 거래 건수 미만) */
  lowConfidenceMinTrades: number;
  /**
   * 거래 0건(status: "empty")으로 돌아온 시군구·월의 비율이 이 값(0~1)을
   * 넘으면 리포트가 해당 목록을 나열한다. 요약 줄(개수/전체)은 이 값과
   * 무관하게 항상 나온다 — 이 임계값은 "목록까지 펼쳐 보여줄지"만 결정한다.
   */
  emptyRatioWarnThreshold: number;
}
