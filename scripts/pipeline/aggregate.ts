import { buildAddressString } from "./address.js";
import { computePnu } from "./pnu.js";
import type { NormalizedTrade } from "./normalize";
import type { LandLeasehold, ReportConfig } from "./types";

/**
 * 이 평형의 실거래 한 건. **집계값이 아니라 국토부가 공개한 사실 그대로다.**
 *
 * `medianPrice`를 산출물에서 뺀 규칙("가격은 항상 범위로만 말한다")과
 * 어긋나지 않는다. 그 규칙이 막는 것은 **우리가 대표값을 골라 단정하는
 * 것**이고, 여기 담기는 것은 우리가 고르거나 계산한 값이 아니라 실제로
 * 체결된 계약 한 건이다. 사용자가 자기가 들은 호가를 견줄 대상은
 * 우리가 만든 숫자가 아니라 이 사실이어야 한다.
 */
export interface TradeRecord {
  /** 원 단위 정수 */
  price: number;
  /** YYYY-MM-DD */
  contractDate: string;
  /**
   * 층. **믿을 수 없으면 `null`이다**({@link isTrustworthyFloor}).
   *
   * 모르는 층을 0층·1층으로 채우지 않는다 — `minFloor`/`maxFloor`가
   * 못 믿을 층을 범위에서 빼는 것과 같은 규칙이고, 이 표는 그보다 더
   * 직접적으로 "이 거래는 몇 층이었다"고 말하는 자리라 더더욱 지어내면
   * 안 된다.
   */
  floor: number | null;
}

export interface ComplexUnit {
  /** 국토부 단지 고유 ID(`aptSeq`). `normalize.ts`의 buildComplexKey 참고 */
  complexKey: string;
  /**
   * 화면에 쓸 단지 이름. {@link pickComplexName}이 그 단지의 모든 거래에서 고른다.
   *
   * 키가 `aptSeq`로 바뀌어도 **이름은 여전히 화면에 필요하다** — 사용자는
   * `"11680-314"`가 아니라 "까치마을"을 찾는다. 키와 이름의 역할이 갈렸다:
   * 키는 묶는 데만 쓰고, 이름은 보여 주는 데만 쓴다.
   */
  complexName: string;
  regionCode: string;
  legalDongName: string;
  builtYear: number;
  /** 전용면적을 1㎡ 단위로 반올림한 값. 화면 표시용(예: "84㎡") */
  areaBucket: number;
  /**
   * 이 버킷(complexKey × areaBucket)에 실제로 들어간 거래들의 **최대**
   * 전용면적(원본 실수값, 반올림하지 않음).
   *
   * areaBucket은 반올림값이라 실제 전용면적 85.4㎡가 85로 내려올 수 있다
   * — 그러면 화면이 85㎡ 이하로 오판해 농특세(85㎡ 초과분)를 빼고
   * 계산한다. 부대비용이 실제보다 작아지고 실구매력이 커지므로 이
   * 제품이 가장 피해야 하는 낙관 방향 오류다. 85㎡ 임계값 판정에는
   * areaBucket이 아니라 이 값을 써야 한다.
   *
   * 평균·중위값이 아니라 **최대값**을 쓴다 — 면적이 클수록 농특세가
   * 붙어 비용이 커지고 실구매력이 작아지므로, 최대값 쪽으로 틀리는
   * 것이 보수적인(안전한) 방향이다.
   *
   * 계산 대상은 `recent`(최근 6개월, 대표가를 낸 창)가 아니라 이
   * 버킷에 속한 **모든** 거래(`group`)다 — areaBucket은 시간과 무관한
   * 물리적 속성이므로, 오래된 거래라도 그 단지·평형의 실제 면적을
   * 알려준다면 반영해야 더 정확(하고 여전히 보수적인 방향)해진다.
   */
  maxExclusiveAreaSqm: number;
  /**
   * 이 단지가 **토지임대부**인가. `"Y"` / `"N"` / `null`(모름).
   *
   * 토지 소유권이 없는 집이라 사는 사람이 반드시 알아야 하는 "사지 말아야 할"
   * 신호다. 그래서 판정 방향이 한쪽으로 기울어 있다 —
   * {@link mergeLandLeasehold} 참고.
   *
   * 창(window)은 `recent`가 아니라 그룹 **전체**다. 토지임대부는
   * `maxExclusiveAreaSqm`처럼 시간과 무관한 그 단지의 성질이지 "최근 6개월의
   * 사실"이 아니다.
   *
   * **`!== "Y"`를 "토지임대부 아님"으로 읽지 말 것.** "아님"은 `=== "N"`뿐이다.
   */
  landLeasehold: LandLeasehold;
  /**
   * 이 단지의 지번주소("서울특별시 강남구 대치동 316"). 만들 수 없으면 `null`.
   *
   * 창은 `recent`가 아니라 그룹 **전체**다 — 건물 주소는 시간과 무관한
   * 그 단지의 성질이라 `maxExclusiveAreaSqm`·`landLeasehold`와 같은 갈래다.
   * 주소를 만들 수 있는 첫 거래의 것을 쓴다(한 건물의 주소는 어느 거래를
   * 봐도 같다).
   *
   * ⚠ **예전에는 산출물에서 뺐다.** `emit.ts`가 그 이유를 "금지된 값이라서가
   * 아니라 아직 쓸 화면이 없어서"라고 적어 뒀는데, 사용자 지시로 단지 상세
   * 화면이 주소를 보여주게 되면서 그 이유가 사라졌다. 지오코딩이 여전히
   * 거래별 원본 주소(`data/raw/`)를 쓴다는 사실은 그대로다 — 이 값은
   * **표시용**이고, 같은 함수(`buildAddressString`)로 만들어 지도가 찍은
   * 자리와 화면이 적은 주소가 갈리지 않게 한다.
   */
  address: string | null;
  /**
   * 이 단지의 PNU(필지고유번호, {@link computePnu}). 만들 수 없으면 `null`.
   *
   * 세대수 조회(한국부동산원 공동주택 단지 식별정보 API)의 조인 키로만
   * 쓰는 내부 값이다 — `address`와 같은 갈래(시간과 무관한 그 단지의
   * 성질, group 전체에서 만들 수 있는 첫 거래의 것을 쓴다)지만, 이
   * 값 자체는 화면이 쓸 일이 없어 `emit.ts`의 `toEmittedUnit`이 빼고
   * `householdCount`(그 PNU로 실제 조회한 세대수)만 내보낸다.
   */
  pnu: string | null;
  /**
   * 이 단지의 총 세대수. `aggregate()`는 이 값을 **언제나 `null`로 둔다** —
   * 이 함수는 순수 함수라 외부 API를 부르지 않는다. 실제 값은
   * `live.ts`의 `fetchLiveComplexes`가 집계 이후에 `pnu`로 채운다.
   *
   * ⚠ 오프라인 배치 파이프라인(`run.ts`)은 아직 채우지 않는다 — 지금
   * 화면이 실제로 쓰는 것은 라이브 API뿐이고(`src/data/complexes.ts`의
   * 번들 데이터는 vestigial, `address`·`trades`와 같은 사정이다), 배치
   * 산출물에 세대수를 채우는 것은 그 산출물을 다시 쓸 일이 생기면
   * 처리할 별도 과제다.
   */
  householdCount: number | null;
  /** 최근 6개월 거래의 중위값(원) */
  medianPrice: number;
  tradeCount: number;
  /**
   * `minPrice`~`maxPrice`·`tradeCount`를 만든 바로 그 거래들. 거래일
   * **내림차순**(최신이 앞)이다.
   *
   * 창이 `recent`인 것은 의도적이다 — 층 범위와 같은 이유로, 이 표는
   * "이 가격 범위를 만든 거래들"에 대한 사실이라 그 범위를 만든 창과
   * 정확히 같아야 한다. 그래서 `trades.length === tradeCount`가 언제나
   * 참이고, `aggregate.test.ts`가 그 불변식을 잠근다.
   */
  trades: TradeRecord[];
  minPrice: number;
  maxPrice: number;
  /**
   * `minPrice`~`maxPrice`를 만든 바로 그 거래들(최근 6개월 창) 중 층을
   * 믿을 수 있는 거래의 **최저층**. 믿을 수 있는 층이 하나도 없으면 `null`.
   *
   * **가격을 보정하기 위한 값이 아니다.** 층별 가격 모델을 만들거나
   * "이 층이면 얼마쯤"을 계산하면 그건 감정평가 영역이고, 이 앱이
   * `medianPrice`를 산출물에서 뺀 것과 같은 이유로 하면 안 된다. 이 값이
   * 있는 이유는 하나뿐이다 — 사용자가 자기가 보는 매물의 층과 이 범위를
   * 만든 거래들의 층을 **스스로** 견줄 수 있게 하는 것이다.
   *
   * 창(window)이 `recent`인 것은 의도적이다. `maxExclusiveAreaSqm`은
   * 시간과 무관한 물리적 속성이라 그룹 전체에서 보지만, 층 범위는
   * "이 가격 범위를 만든 거래들"에 대한 사실이라 그 범위를 만든 창과
   * 정확히 같아야 한다. 창 밖 거래의 층을 섞으면 화면이 범위에 들어
   * 있지도 않은 거래의 층을 말하게 된다.
   */
  minFloor: number | null;
  /** {@link minFloor}와 같은 창·같은 규칙의 **최고층**. 같은 조건에서 `null`. */
  maxFloor: number | null;
  /**
   * 그 창의 거래 중 층을 믿을 수 없었던 건수({@link isTrustworthyFloor} 참고).
   *
   * **모르는 층을 0층이나 1층으로 채우지 않는다.** 채우면 그 거래가 층
   * 범위를 조용히 아래로 늘려 화면이 없는 사실을 말하게 된다. 대신 범위에서
   * 빼고 몇 건이 그랬는지를 여기 남긴다 — 층을 모르는 거래가 섞여 있다는
   * 사실 자체가 화면까지 드러나야 한다.
   */
  unknownFloorCount: number;
  /**
   * (최근 3개월 중위값 − 그 이전 3개월 중위값) ÷ 그 이전 3개월 중위값.
   * 분모는 "그 이전 3개월"이다 — 한국어 "X 대비 Y"는 X가 기준(분모)이라는
   * 뜻이라 "최근 대비 이전"이라고 쓰면 정반대로 읽힌다. 양수면 최근이 더
   * 비싸졌다는 뜻, 음수면 더 싸졌다는 뜻이다(비율, 0.05 = 5%). 비교 대상(그
   * 이전 3개월 거래)이 없으면 null.
   */
  changeRate3m: number | null;
  /** changeRate3m 계산에 쓰인 "최근 3개월" 창의 거래 건수 */
  changeRate3mRecentCount: number;
  /** changeRate3m 계산에 쓰인 "그 이전 3개월" 창의 거래 건수(분모 쪽) */
  changeRate3mPriorCount: number;
  /**
   * changeRate3m이 근거한 두 창 중 하나라도 lowConfidenceMinTrades 미만이면
   * true. changeRate3m 자체는 null이 아니어도(계산은 됐어도) 표본이 1~2건뿐인
   * 급등락일 수 있다 — lowConfidence(대표가 신뢰도)와 별개로, 이 변동률
   * 하나만 두고 봐도 신뢰할 수 있는지를 나타낸다. changeRate3m이 null이면
   * 애초에 값이 없으므로 항상 false.
   */
  changeRate3mLowConfidence: boolean;
  /**
   * (최근 6개월 중위값(= medianPrice) − 그 이전 6개월 중위값) ÷ 그 이전
   * 6개월 중위값. 분모는 changeRate3m과 마찬가지로 "그 이전" 창이고, 부호
   * 의미도 같다(양수 = 상승, 음수 = 하락). 특정 시점(12개월 전) 대비가
   * 아니라 "최근 6개월 vs 그 이전 6개월"이므로, 3개월 vs 3개월로 대칭인
   * changeRate3m과 창 크기가 다르다. 비교 대상이 없으면 null.
   */
  changeRate12m: number | null;
  /** changeRate12m의 "최근 6개월" 창 거래 건수. tradeCount와 같은 값이다. */
  changeRate12mRecentCount: number;
  /** changeRate12m의 "그 이전 6개월" 창 거래 건수(분모 쪽) */
  changeRate12mPriorCount: number;
  /** changeRate3mLowConfidence와 같은 뜻으로, changeRate12m에 대해 판정한다. */
  changeRate12mLowConfidence: boolean;
  lowConfidence: boolean;
}

/** 중위값. 짝수 개면 가운데 둘의 평균을 내림한다. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return 0;
  if (sorted.length % 2 === 1) return a;
  const b = sorted[mid - 1];
  if (b === undefined) return a;
  return Math.floor((a + b) / 2);
}

/**
 * 전용면적을 1㎡ 단위로 반올림한다.
 *
 * 84.4와 84.6은 실제로 같은 평형인데 84와 85로 갈린다. 조용히 뭉개는 대신
 * 이상 신호 리포트의 "평형 분할 의심"이 이를 잡는다.
 */
export function areaBucket(sqm: number): number {
  return Math.round(sqm);
}

/**
 * 이 층 값을 화면에 사실로 말해도 되는가.
 *
 * 실제 캐시(9,276건)에는 1~65층의 정수만 들어 있지만, 국토부 응답은 지하를
 * 0이나 음수로 보내기도 하고 `parse-response.ts`의 `toFiniteNumber`는 그런
 * 값을 그대로 통과시킨다. 1층 미만이거나 정수가 아닌 값은 "저층"이라고
 * 부를 수도, 무시하고 넘어갈 수도 없다 — **모른다고 말해야 한다.**
 *
 * 관대하게 봐주지 않는 방향으로 실패한다(`classifyDealStatus`와 같은 태도):
 * 못 믿을 값을 1층으로 반올림해 범위에 넣으면 화면이 "1층부터"라고 없는
 * 사실을 말하고, 사용자는 자기 매물이 그보다 높다는 이유로 안심한다.
 *
 * 상한은 두지 않는다. "몇 층까지가 정상인가"는 우리가 아는 값이 아니라
 * 그때그때의 건물에 달린 값이라, 임의의 상한을 두면 실재하는 초고층 거래를
 * 조용히 "모름"으로 만든다 — 모르는 것을 채우지 않는 것과 같은 이유로,
 * 아는 것을 지우지도 않는다.
 */
export function isTrustworthyFloor(floor: number): boolean {
  return Number.isInteger(floor) && floor >= 1;
}

/**
 * 거래들을 화면에 그대로 낼 수 있는 형태로 옮긴다. **거래일 내림차순**
 * (최신이 앞)이고, 같은 날이면 금액 내림차순이다.
 *
 * 2차 정렬 키가 있는 이유는 **결정론** 때문이다 — 산출물이 매번 같은
 * 순서여야 커밋 diff가 실제 데이터 변화만 보여준다(이 파일 아래
 * `units.sort`가 같은 이유로 2차 키를 둔다). 같은 날 같은 금액이면 어느
 * 쪽이 앞이든 화면에 같은 줄이라 3차 키는 두지 않는다.
 *
 * 층은 못 믿을 값이면 `null`로 바꾼다 — {@link TradeRecord.floor} 참고.
 */
export function toTradeRecords(trades: NormalizedTrade[]): TradeRecord[] {
  return trades
    .map((t) => ({
      price: t.price,
      contractDate: t.contractDate,
      floor: isTrustworthyFloor(t.floor) ? t.floor : null,
    }))
    .sort((a, b) =>
      a.contractDate === b.contractDate
        ? b.price - a.price
        : a.contractDate < b.contractDate
          ? 1
          : -1,
    );
}

/**
 * 이 단지의 대표 주소. 주소를 만들 수 있는 첫 거래의 것을 쓰고, 어느
 * 거래로도 못 만들면 `null`이다 — 지어내지 않는다.
 */
export function firstAddress(trades: NormalizedTrade[]): string | null {
  for (const trade of trades) {
    const address = buildAddressString(trade);
    if (address !== null) return address;
  }
  return null;
}

/**
 * 이 단지의 PNU. 만들 수 있는 첫 거래의 것을 쓴다 — {@link firstAddress}와
 * 같은 이유·같은 창(group 전체)이다.
 */
export function firstPnu(trades: NormalizedTrade[]): string | null {
  for (const trade of trades) {
    const pnu = computePnu(trade.regionCode, trade.address.umdCd, trade.address.bonbun, trade.address.bubun);
    if (pnu !== null) return pnu;
  }
  return null;
}

/**
 * 한 단지의 거래들이 말하는 토지임대부 여부를 하나로 합친다.
 *
 * 우선순위가 대칭이 아니다. 이 순서가 이 함수의 전부다:
 * 1. 한 건이라도 `"Y"`면 `"Y"`다. 나머지가 전부 `"N"`이어도 `"Y"`다.
 * 2. `"Y"`가 없고 모르는 값(`null`)이 하나라도 있으면 `null`(모름)이다.
 * 3. 모든 거래가 `"N"`일 때만 `"N"`(아님)이다.
 *
 * 다수결이나 최빈값을 쓰지 않는 이유: 토지임대부를 **놓치는 쪽이 낙관
 * 방향**이기 때문이다. 화면이 "토지 소유권이 있는 집"이라고 잘못 말하면
 * 사용자는 없는 근거로 안심한다. 반대로 실제로는 아닌 집을 토지임대부라고
 * 말하면 사용자는 확인하러 간다 — 확인 비용은 들지만 잘못 사지는 않는다.
 *
 * 빈 배열이면 `null`이다 — 아무 근거도 없는데 "아님"이라고 단정하지 않는다.
 */
export function mergeLandLeasehold(values: readonly LandLeasehold[]): LandLeasehold {
  if (values.includes("Y")) return "Y";
  if (values.length === 0 || values.includes(null)) return null;
  return "N";
}

/** 주어진 연/월의 마지막 날짜(일). month는 0-indexed이며 범위를 벗어나도 Date.UTC가 정규화한다. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * asOf에서 months개월 전 날짜를 구한다.
 *
 * `Date.UTC(y, m - n, day)`를 그대로 쓰면 대상 월이 day보다 짧을 때 다음 달로
 * 넘어간다(예: 8월 31일의 6개월 전은 "2월 31일"이 아니라 3월 3일이 되어버린다).
 * 대상 월의 마지막 날로 day를 클램프해 "6개월 전"이 실행 시점에 따라 며칠씩
 * 밀리지 않게 한다.
 */
function monthsBefore(asOf: Date, months: number): Date {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth() - months;
  const day = asOf.getUTCDate();
  // Date.UTC가 month의 연/월 오버플로를 정규화해준다 (일은 1로 고정해 오염 방지).
  const normalized = new Date(Date.UTC(year, month, 1));
  const targetYear = normalized.getUTCFullYear();
  const targetMonth = normalized.getUTCMonth();
  const clampedDay = Math.min(day, lastDayOfMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

function changeRate(recent: number[], older: number[]): number | null {
  if (recent.length === 0 || older.length === 0) return null;
  const from = median(older);
  if (from === 0) return null;
  return (median(recent) - from) / from;
}

interface ChangeRateResult {
  rate: number | null;
  recentCount: number;
  priorCount: number;
  lowConfidence: boolean;
}

/**
 * changeRate와 함께 그 값이 근거한 두 창의 거래 건수·저신뢰 여부를 낸다.
 *
 * 값을 null로 지우는 대신 정보를 더하는 기존 관례(lowConfidence가 tradeCount·
 * minPrice·maxPrice와 함께 나가는 것과 같다)를 따른다 — 표본이 1건뿐인
 * 변동률도 값 자체는 내보내되, 어느 창이 얼마나 얇았는지 소비자가 판단할 수
 * 있게 한다. 값이 애초에 null이면(비교 대상 없음) lowConfidence를 켤 대상이
 * 없으므로 항상 false다.
 */
function changeRateWithConfidence(
  recent: number[],
  older: number[],
  minTrades: number,
): ChangeRateResult {
  const rate = changeRate(recent, older);
  const lowConfidence = rate !== null && (recent.length < minTrades || older.length < minTrades);
  return { rate, recentCount: recent.length, priorCount: older.length, lowConfidence };
}

/**
 * 한 단지의 거래들에서 화면에 쓸 대표 이름 하나를 고른다.
 *
 * 키가 `aptSeq`가 되면서 생긴 새 문제다. 예전에는 이름이 키의 일부라 한 키
 * 안의 이름이 (정규화 후) 항상 같았지만, 이제 같은 `aptSeq`에 표기가 다른
 * 이름이 붙어 올 수 있다. 그때 아무거나 쓰면(예전처럼 `group[0]`) 화면에
 * 뜨는 이름이 **입력 순서에 따라 달라진다** — 파일 읽는 순서가 바뀌면 같은
 * 데이터로 다른 산출물이 나온다.
 *
 * 고르는 순서:
 * 1. **가장 많이 쓰인 이름.** 사람들이 실제로 그렇게 부르는 이름이고, 오타
 *    한 건이 대표를 차지하지 못한다.
 * 2. 같으면 **계약일이 더 최근인 이름.** 단지가 개명하면 새 이름이 이긴다.
 * 3. 그래도 같으면 **사전순.** 남는 것은 결정론뿐이라 임의로라도 못박는다 —
 *    같은 입력이면 언제 실행해도 같은 이름이 나와야 한다.
 *
 * 표기가 흔들리는 것인지 진짜로 다른 이름이 붙은 것인지는 이 함수가 판단하지
 * 않는다. 그건 사람이 볼 일이라 이상 신호 리포트의 "한 단지 ID에 이름이 여러
 * 개" 절이 드러낸다.
 */
export function pickComplexName(trades: readonly NormalizedTrade[]): string {
  const stats = new Map<string, { count: number; latest: string }>();
  for (const t of trades) {
    const prev = stats.get(t.complexName);
    if (prev === undefined) {
      stats.set(t.complexName, { count: 1, latest: t.contractDate });
    } else {
      prev.count += 1;
      if (t.contractDate > prev.latest) prev.latest = t.contractDate;
    }
  }

  let best: { name: string; count: number; latest: string } | null = null;
  for (const [name, { count, latest }] of stats) {
    if (
      best === null ||
      count > best.count ||
      (count === best.count && latest > best.latest) ||
      (count === best.count && latest === best.latest && name < best.name)
    ) {
      best = { name, count, latest };
    }
  }
  return best?.name ?? "";
}

export function aggregate(
  trades: NormalizedTrade[],
  asOf: Date,
  config: ReportConfig,
): ComplexUnit[] {
  // 이름은 **단지 전체**에서 한 번 고른다. 평형별로 따로 고르면 같은 단지의
  // 84㎡ 행과 101㎡ 행에 다른 이름이 떠서, 화면이 한 단지를 두 단지처럼
  // 보여 준다.
  const nameByComplex = new Map<string, string>();
  {
    const byComplex = new Map<string, NormalizedTrade[]>();
    for (const trade of trades) {
      const list = byComplex.get(trade.complexKey);
      if (list) list.push(trade);
      else byComplex.set(trade.complexKey, [trade]);
    }
    for (const [key, list] of byComplex) nameByComplex.set(key, pickComplexName(list));
  }
  const sixMonthsAgo = monthsBefore(asOf, 6);
  const threeMonthsAgo = monthsBefore(asOf, 3);
  const twelveMonthsAgo = monthsBefore(asOf, 12);

  const groups = new Map<string, NormalizedTrade[]>();
  for (const trade of trades) {
    const key = `${trade.complexKey}|${areaBucket(trade.exclusiveAreaSqm)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(trade);
    else groups.set(key, [trade]);
  }

  const units: ComplexUnit[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;

    const at = (t: NormalizedTrade) => new Date(`${t.contractDate}T00:00:00Z`);
    // 모든 창은 asOf를 포함 상한으로 둔다. 상한이 없으면 asOf 이후(미래) 거래가
    // "최근" 구간에 섞여 들어가 중위값을 오염시킨다 — asOf가 replay 기준 시점을
    // 뜻하는 이상, 그 이후 거래를 아는 척해서는 안 된다.
    const recent = group.filter((t) => at(t) >= sixMonthsAgo && at(t) <= asOf);
    // 최근 6개월 거래가 없으면 대표 시세를 낼 근거가 없다.
    if (recent.length === 0) continue;

    const recentPrices = recent.map((t) => t.price);
    const last3m = group
      .filter((t) => at(t) >= threeMonthsAgo && at(t) <= asOf)
      .map((t) => t.price);
    const prior3m = group
      .filter((t) => at(t) < threeMonthsAgo && at(t) >= sixMonthsAgo && at(t) <= asOf)
      .map((t) => t.price);
    const prior12m = group
      .filter((t) => at(t) < sixMonthsAgo && at(t) >= twelveMonthsAgo && at(t) <= asOf)
      .map((t) => t.price);

    // 층 범위는 가격 범위를 만든 바로 그 거래들(recent)에서만 낸다. 못 믿을
    // 값은 채우지 않고 빼되, 몇 건이었는지는 남긴다.
    const knownFloors = recent.map((t) => t.floor).filter(isTrustworthyFloor);

    const rate3m = changeRateWithConfidence(last3m, prior3m, config.lowConfidenceMinTrades);
    const rate12m = changeRateWithConfidence(recentPrices, prior12m, config.lowConfidenceMinTrades);

    units.push({
      complexKey: first.complexKey,
      complexName: nameByComplex.get(first.complexKey) ?? first.complexName,
      regionCode: first.regionCode,
      legalDongName: first.legalDongName,
      builtYear: first.builtYear,
      areaBucket: areaBucket(first.exclusiveAreaSqm),
      maxExclusiveAreaSqm: Math.max(...group.map((t) => t.exclusiveAreaSqm)),
      // 창은 recent가 아니라 group 전체 — 시간과 무관한 그 단지의 성질이다.
      landLeasehold: mergeLandLeasehold(group.map((t) => t.landLeasehold)),
      // 주소도 같은 갈래다(건물의 성질). 만들 수 있는 첫 거래의 것을 쓴다.
      address: firstAddress(group),
      pnu: firstPnu(group),
      householdCount: null,
      medianPrice: median(recentPrices),
      tradeCount: recent.length,
      trades: toTradeRecords(recent),
      minPrice: Math.min(...recentPrices),
      maxPrice: Math.max(...recentPrices),
      minFloor: knownFloors.length === 0 ? null : Math.min(...knownFloors),
      maxFloor: knownFloors.length === 0 ? null : Math.max(...knownFloors),
      unknownFloorCount: recent.length - knownFloors.length,
      changeRate3m: rate3m.rate,
      changeRate3mRecentCount: rate3m.recentCount,
      changeRate3mPriorCount: rate3m.priorCount,
      changeRate3mLowConfidence: rate3m.lowConfidence,
      changeRate12m: rate12m.rate,
      changeRate12mRecentCount: rate12m.recentCount,
      changeRate12mPriorCount: rate12m.priorCount,
      changeRate12mLowConfidence: rate12m.lowConfidence,
      lowConfidence: recent.length < config.lowConfidenceMinTrades,
    });
  }

  // 산출물 순서를 결정론화: complexKey로 정렬, 같으면 areaBucket으로 정렬
  // complexKey는 문자열이므로 < 연산자로 locale-independent 비교
  units.sort((a, b) => {
    const keyCompare = a.complexKey < b.complexKey ? -1 : a.complexKey > b.complexKey ? 1 : 0;
    if (keyCompare !== 0) return keyCompare;
    return a.areaBucket - b.areaBucket;
  });

  return units;
}
