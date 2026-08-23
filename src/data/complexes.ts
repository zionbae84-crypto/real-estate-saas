import rawComplexes from "../../data/complexes.json";
import rawManifest from "../../data/manifest.json";
import rawRegions from "../../data/regions.json";

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
  areaBucket: number;
  /** 대표가격(원). **화면에 숫자로 내지 않는다** — 부모 스펙 §12 */
  medianPrice: number;
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
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
