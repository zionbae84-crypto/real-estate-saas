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
export const COMPLEX_UNITS: readonly ComplexUnit[] = rawComplexes;

export const REGIONS: readonly RegionSummary[] = rawRegions;

/** 수집된 거래 중 가장 최근 계약월(YYYY-MM) */
export const DATA_AS_OF: string = rawManifest.dataAsOf;

/** 시군구 코드 → 사람이 읽는 이름. 데이터에 이름이 없어 여기 둔다 */
export const REGION_NAMES: Readonly<Record<string, string>> = {
  "11650": "서초구",
  "11680": "강남구",
  "11710": "송파구",
};
