import rawComplexes from "../../data/complexes.json";
import rawManifest from "../../data/manifest.json";
import rawRegions from "../../data/regions.json";

/**
 * `scripts/pipeline/aggregate.ts`의 `recent`(대표가·건수 창)가 최근 몇
 * 개월인가. `tradeCount`·`minPrice`·`maxPrice`·`lowConfidence`·층 범위가
 * 전부 이 창 안의 거래로 낸 값이다(`data/README.md` 기준).
 *
 * **화면 문구는 반드시 이 상수(또는 {@link AGGREGATION_WINDOW_LABEL})로
 * 만들어야 한다.** 직접 "최근 1년"·"최근 12개월" 같은 문구를 박아 넣으면
 * 표본 기간을 실제보다 부풀려 말하게 되고, 이 앱은 "사지 말아야 할
 * 때를 말해주는 것"이 방침이라 근거를 실제보다 튼튼해 보이게 하는
 * 오표기가 가장 나쁘다. `scripts/window-label.test.ts`가 이 값이
 * 파이프라인 값과 같은지, 화면·룰셋 문구가 이 값에서 갈라져 나왔는지를
 * 소스에서 직접 확인한다.
 */
export const AGGREGATION_WINDOW_MONTHS = 6;

/** 화면에 그대로 쓰는 라벨. "최근 6개월" 같은 문구를 이 값에서만 만든다 */
export const AGGREGATION_WINDOW_LABEL = `최근 ${AGGREGATION_WINDOW_MONTHS}개월`;

/**
 * 파이프라인이 만든 단지×평형 한 건.
 *
 * 필드 정의는 `data/README.md`에 있다 — 파이프라인이 산출물과 함께 만든다.
 *
 * `changeRate*`는 데이터에는 있지만 **화면에 쓰지 않으므로 이 타입에 넣지
 * 않는다.** 사실 서술이지만 투자 판단 재료로 읽히고(부모 스펙 §12의 수익률
 * 예측 금지), 저신뢰가 아닌 평형 중에도 그 비율의 근거 창에 거래가 1건뿐인
 * 것이 156개 있다. 타입에서 빼 두면 실수로 화면에 흘리기 어려워진다.
 */
export interface ComplexUnit {
  /**
   * 단지를 가르는 키. **국토부가 주는 단지 고유 ID**(`"11680-314"` =
   * 시군구코드-일련번호)다.
   *
   * 예전에는 `지역코드|법정동|건축년도|정규화한 이름`을 이어붙인 값이었다.
   * 이름이 키에 들어 있어 표기가 조금만 흔들려도 한 단지가 여러 개로
   * 갈렸고(갈리면 각 조각의 거래 건수가 줄어 화면이 실제보다 근거가 튼튼한
   * 척하게 된다), 같은 이름의 다른 단지는 한 덩어리로 뭉쳤다.
   *
   * **화면에 내지 않는다.** 사용자가 찾는 것은 ID가 아니라 이름이다. 이
   * 값은 묶고 구분하는 데에만 쓴다 — React 키를 만들 때는 평형까지 붙여야
   * 유일해진다(`ComplexList.tsx`의 `unitKey` 참고).
   */
  complexKey: string;
  complexName: string;
  regionCode: string;
  legalDongName: string;
  builtYear: number;
  /** 전용면적을 1㎡ 단위로 반올림한 값. **표시용**(예: "84㎡") */
  areaBucket: number;
  /**
   * 이 버킷에 실제로 들어간 거래들의 **최대** 전용면적(원본 실수값).
   *
   * 85㎡ 임계값(농특세·정책대출 자격) 판정에는 `areaBucket`이 아니라
   * 이 값을 써야 한다 — `areaBucket`은 반올림값이라 실제 85.4㎡가 85로
   * 내려와 초과분을 놓칠 수 있다. 이 제품이 가장 피해야 하는 낙관 방향
   * 오류다. 최대값을 쓰는 이유는 그것이 보수적이기 때문이다 — 면적이
   * 클수록 농특세가 붙어 부대비용이 커지고 실구매력이 작아진다.
   */
  maxExclusiveAreaSqm: number;
  /**
   * 이 단지가 **토지임대부**인가. `"Y"` / `"N"` / `null`(모름).
   *
   * 토지 소유권이 없는 집이라 사는 사람이 반드시 알아야 하는 "사지 말아야
   * 할" 신호다. 파이프라인은 그 단지의 **모든** 거래를 보고 정하며, 한
   * 건이라도 `"Y"`면 `"Y"`다 — 놓치는 쪽이 낙관 방향이라 판정을 한쪽으로
   * 기울여 뒀다(`data/README.md` 참고).
   *
   * **`!== "Y"`를 "토지임대부 아님"으로 읽지 말 것.** "아님"은 `=== "N"`
   * 하나뿐이고 `null`은 아직 모른다는 뜻이다. 둘을 뭉쳐 "아님"으로 그리면
   * 화면이 "토지 소유권이 있는 집"이라는 없는 사실을 말하게 되고, 사용자는
   * 없는 근거로 안심한다.
   *
   * **아직 화면에 붙이지 않았다.** 붙일 때는 `null`을 "아님"이 아니라
   * "확인이 필요해요" 쪽으로 그려야 한다.
   */
  landLeasehold: "Y" | "N" | null;
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
  /**
   * `minPrice`~`maxPrice`를 만든 바로 그 거래들의 최저층. 층을 믿을 수
   * 있는 거래가 하나도 없었으면 `null`.
   *
   * **값을 보정하는 데 쓰지 않는다.** "이 층이면 얼마쯤"을 계산하면 그건
   * 감정평가 영역이고, 이 앱이 `medianPrice`를 타입에서부터 뺀 것과 같은
   * 이유로 하면 안 된다. 화면이 이 값으로 하는 일은 하나뿐이다 — 이
   * 범위를 만든 거래가 몇 층부터 몇 층까지였는지 **사실로 말해서**
   * 사용자가 자기가 보는 매물의 층과 스스로 견주게 하는 것.
   */
  minFloor: number | null;
  /** 같은 창·같은 규칙의 최고층. 같은 조건에서 `null` */
  maxFloor: number | null;
  /**
   * 그 창의 거래 중 층을 믿을 수 없었던 건수(지하 표기 등).
   *
   * 모르는 층을 0층·1층으로 채우지 않는 대신 몇 건이 그랬는지를 남긴다.
   * 화면은 이 값이 0이 아니면 그 사실을 함께 말해야 한다 — 층을 모르는
   * 거래가 섞인 범위를 "N층부터 M층까지"로만 말하면 우리가 아는 것보다
   * 많이 아는 척하는 것이 된다.
   */
  unknownFloorCount: number;
  lowConfidence: boolean;
}

export interface RegionSummary {
  regionCode: string;
  complexCount: number;
  unitCount: number;
}

/**
 * 번들에 실린 단지 데이터.
 *
 * 정적 import인 이유: 런타임에 받으면 `src/no-network.test.ts`가 지키는
 * "입력한 재무정보는 이 브라우저를 벗어나지 않습니다"의 경계가 흐려진다.
 * 정적 파일을 받는 것이 재무정보를 보내는 것은 아니지만, 그 가드를 열면
 * 약속이 무엇을 뜻하는지가 모호해진다.
 *
 * gzip 68KB다. 수도권 66개 시군구로 넓히면 이 방식은 무효가 되고 지역별
 * 분할이 답이 된다 — 스펙 §9 참고.
 */
/**
 * 번들에 실린 `landLeasehold` 값을 세 값 중 하나로 좁힌다.
 *
 * JSON을 그대로 가져오면 이 필드의 타입이 `string`으로 넓어져 화면 코드가
 * `"Y"`/`"N"` 말고 무엇이 올 수 있는지 알 수 없게 된다. 캐스팅으로 눌러
 * 덮으면 타입만 좁아지고 실제 값은 그대로라 아무것도 보장하지 못한다.
 *
 * 그래서 값을 실제로 확인해 좁힌다. **모르는 값은 `null`(모름)로 간다 —
 * `"N"`(아님)으로 가지 않는다.** 이 방향이 이 함수의 요점이다: 예상 못한
 * 값을 "아님"으로 접으면 화면이 "토지 소유권이 있는 집"이라는 없는 사실을
 * 말하고, 사용자는 없는 근거로 안심한다.
 *
 * 던지지 않는 이유: 값 하나가 이상하다고 앱 전체가 흰 화면이 되면 나머지
 * 1,691개 평형의 멀쩡한 정보까지 사라진다. 모르는 것을 모른다고 표시하는
 * 쪽이 더 정직하고 덜 파괴적이다.
 */
function narrowLandLeasehold(value: string | null): "Y" | "N" | null {
  return value === "Y" || value === "N" ? value : null;
}

export const COMPLEX_UNITS: readonly ComplexUnit[] = rawComplexes.map((u) => ({
  ...u,
  landLeasehold: narrowLandLeasehold(u.landLeasehold),
}));

export const REGIONS: readonly RegionSummary[] = rawRegions;

/** 수집된 거래 중 가장 최근 계약월(YYYY-MM) */
export const DATA_AS_OF: string = rawManifest.dataAsOf;

/** 시군구 코드 → 사람이 읽는 이름. 데이터에 이름이 없어 여기 둔다 */
export const REGION_NAMES: Readonly<Record<string, string>> = {
  "11650": "서초구",
  "11680": "강남구",
  "11710": "송파구",
};
