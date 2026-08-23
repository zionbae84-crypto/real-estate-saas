import type { LandLeasehold, ParseResult, RawAddress, RawTrade } from "./types";

/** 공공데이터포털·국토부 API가 성공으로 보는 resultCode 값들. */
const SUCCESS_RESULT_CODES = new Set(["00", "000"]);
/** error 사유 문자열의 최대 길이. 원본 본문 전체가 실수로 통째로 들어오는 걸 막는다. */
const MAX_ERROR_MESSAGE_LENGTH = 300;

function truncate(message: string, max: number): string {
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

/**
 * 국토부 실거래가 API 응답(JSON 문자열)을 RawTrade 배열로 바꾼다.
 *
 * 계약 조건:
 * - 레코드 하나가 망가져도 예외를 던지지 않는다. 그 건만 버리고 failures를
 *   올린다 — 한 건 때문에 시군구·월 전체를 잃지 않기 위해서다.
 * - 해제(취소)된 거래(`cdealType`이 공백이 아닌 문자열)는 trades에서 제외하고
 *   cancelled로 따로 센다. 형식이 멀쩡한 정상 레코드이므로 failures가 아니다.
 * - `cdealType`이 문자열이 아니면(필드 없음/undefined/null/숫자 등) 해제
 *   여부를 판정할 수 없다 — 정상 거래로 관대하게 봐주지 않고 failures로 센다.
 *   (아래 classifyDealStatus 참고)
 * - `aptSeq`(단지 고유 ID)가 없거나 공백뿐이면 failures로 센다. 그 거래를
 *   어느 단지에 넣을지 알 수 없기 때문이다(아래 toRequiredText 참고).
 * - `landLeaseholdGbn`이 `"Y"`/`"N"`이 아니면 `null`(모름)로 남긴다. 실패도
 *   아니고 "아님"도 아니다 — 모르는 것은 모른다고 남긴다(toLandLeasehold 참고).
 * - 주소 필드는 없어도 실패가 아니다. 가격·부담 계산에 쓰이지 않으므로
 *   없다고 그 거래의 근거가 나빠지지 않는다(toAddress 참고).
 * - 응답 자체가 성공이 아니면(JSON이 아니거나, resultCode가 성공이 아니거나,
 *   예상한 모양이 전혀 아니면) trades는 항상 빈 배열이고 error에 사유를
 *   담는다. 호출자는 trades를 쓰기 전에 반드시 error부터 확인해야 한다 —
 *   그렇지 않으면 "일일 트래픽 초과" 같은 오류가 "이번 달 거래 없음"으로
 *   조용히 캐시된다(C1).
 */
export function parseResponse(body: string): ParseResult {
  const extracted = extractItems(body);
  if ("error" in extracted) {
    return { trades: [], failures: 0, cancelled: 0, error: extracted.error };
  }

  const trades: RawTrade[] = [];
  let failures = 0;
  let cancelled = 0;

  for (const item of extracted.items) {
    const dealStatus = classifyDealStatus(item);
    if (dealStatus === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (dealStatus === "unknown") {
      failures += 1;
      continue;
    }
    const trade = parseItem(item);
    if (trade === null) {
      failures += 1;
      continue;
    }
    trades.push(trade);
  }

  return { trades, failures, cancelled, error: null };
}

type ExtractResult = { items: unknown[] } | { error: string };

/**
 * 응답 본문에서 아이템 목록을 꺼낸다. 두 가지 국토부 API 특유의 형태를 다룬다:
 * - 해당 시군구·월에 거래가 없으면 `items`가 `""`(빈 문자열)이다. 빈 배열이 아니다.
 * - 거래가 정확히 1건이면 `items.item`이 배열이 아니라 객체 하나로 온다.
 *
 * C1: 공공데이터포털은 일일 트래픽 초과·미등록/만료 키·잘못된 파라미터 같은
 * 가장 흔한 실패를 **HTTP 200**과 함께 돌려준다 — 아래 두 형태 중 하나로:
 * 1. 본문 자체가 JSON이 아님(게이트웨이가 XML 오류 봉투를 돌려줌).
 * 2. JSON이지만 `response.header.resultCode`가 성공 코드가 아님.
 * 두 경우 모두 "거래 없음"이 아니라 오류로 돌려준다 — 예전에는 이 구분이
 * 없어서 오류 응답이 빈 캐시로 영구 저장됐다.
 */
function extractItems(body: string): ExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: "응답 본문이 JSON이 아닙니다(게이트웨이 오류 응답일 가능성)" };
  }

  const resultCode = getPath(parsed, ["response", "header", "resultCode"]);
  if (typeof resultCode === "string" && !SUCCESS_RESULT_CODES.has(resultCode)) {
    const resultMsgRaw = getPath(parsed, ["response", "header", "resultMsg"]);
    const resultMsg = typeof resultMsgRaw === "string" ? resultMsgRaw : "(메시지 없음)";
    return { error: truncate(`resultCode ${resultCode}: ${resultMsg}`, MAX_ERROR_MESSAGE_LENGTH) };
  }

  const items = getPath(parsed, ["response", "body", "items"]);
  if (items === "") {
    // 해당 시군구·월에 거래가 정말 없다는 뜻(빈 문자열). resultCode가
    // 성공이었거나 애초에 없었을 때만 여기 도달한다.
    return { items: [] };
  }
  if (items === undefined || items === null) {
    // response.body.items 경로 자체가 없다 — 예상한 응답 모양이 전혀 아니다.
    // resultCode도 없어 성공/실패를 판정할 근거가 없으므로, "거래 없음"으로
    // 관대하게 봐주지 않고 오류로 본다.
    return { error: "응답 본문이 예상한 형식이 아닙니다(response.body.items 없음)" };
  }

  const item = getPath(items, ["item"]);
  if (item === undefined) return { items: [] };
  if (Array.isArray(item)) return { items: item };
  return { items: [item] };
}

/** obj[keys[0]][keys[1]]... 를 안전하게 따라간다. 중간에 없으면 undefined. */
function getPath(obj: unknown, keys: readonly string[]): unknown {
  let cur = obj;
  for (const key of keys) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * cdealType으로 거래 해제 여부를 판정한다.
 *
 * 이 제품의 방침은 "사지 말아야 할 때를 말해주는 것"이다 — 해제된 거래가
 * 조용히 시세에 섞이는 쪽(안전하지 않은 방향)이 데이터가 줄어드는 쪽(안전한
 * 방향)보다 훨씬 나쁘다. 그래서 cdealType이 문자열이 아니면(필드 없음,
 * undefined, null, 숫자 등) "공백이니까 정상 거래"로 관대하게 봐주지 않고
 * "판정 불가"로 분류해 failures로 드러낸다. 실제 API는 항상 이 필드를
 * 채우므로 지금은 이론적 위험이지만, 그렇다고 판정 함수가 조용히 포함
 * 쪽으로 실패하게 두지 않는다. 나중에 "관대하게" 되돌리지 말 것.
 */
function classifyDealStatus(item: unknown): "active" | "cancelled" | "unknown" {
  if (typeof item !== "object" || item === null) {
    // item 자체가 레코드가 아니면 cdealType을 볼 수 없다 — 판정 불가로 취급한다.
    // (parseItem도 어차피 이런 item은 null을 돌려주지만, 여기서 먼저 걸러도
    // 결과는 같다: failures가 하나 늘고 trades/cancelled에는 영향이 없다.)
    return "unknown";
  }
  const cdealType = (item as Record<string, unknown>).cdealType;
  if (typeof cdealType !== "string") return "unknown";
  return cdealType.trim() === "" ? "active" : "cancelled";
}

/** 레코드 하나를 RawTrade로 바꾼다. 형식이 안 맞으면 예외 대신 null. */
function parseItem(item: unknown): RawTrade | null {
  if (typeof item !== "object" || item === null) return null;
  const r = item as Record<string, unknown>;

  const regionCode = toRegionCode(r.sggCd);
  const aptSeq = toRequiredText(r.aptSeq);
  const legalDongName = typeof r.umdNm === "string" ? r.umdNm : null;
  const complexName = typeof r.aptNm === "string" ? r.aptNm : null;
  const builtYear = toFiniteNumber(r.buildYear);
  const exclusiveAreaSqm = toFiniteNumber(r.excluUseAr);
  const floor = toFiniteNumber(r.floor);
  const price = toWon(r.dealAmount);
  const contractDate = toContractDate(r.dealYear, r.dealMonth, r.dealDay);

  if (
    regionCode === null ||
    aptSeq === null ||
    legalDongName === null ||
    complexName === null ||
    builtYear === null ||
    exclusiveAreaSqm === null ||
    floor === null ||
    price === null ||
    contractDate === null
  ) {
    return null;
  }

  return {
    regionCode,
    aptSeq,
    legalDongName,
    complexName,
    builtYear,
    exclusiveAreaSqm,
    floor,
    price,
    contractDate,
    landLeasehold: toLandLeasehold(r.landLeaseholdGbn),
    address: toAddress(r),
  };
}

/**
 * 있어야만 하는 텍스트 필드(지금은 `aptSeq`)를 읽는다.
 *
 * 국토부 응답의 여러 필드는 "값 없음"을 `null`이 아니라 **공백 한 칸(`" "`)**
 * 으로 보낸다(`aptDong`·`cdealType`·`rgstDate`가 실제로 그렇다). 그래서
 * `typeof v === "string"`만 보면 공백 한 칸이 멀쩡한 값으로 통과해 단지 키가
 * `""`가 되고, 서로 아무 상관 없는 거래들이 그 빈 키 하나로 전부 뭉친다 —
 * 과대병합 중에서도 최악이다. trim한 뒤 빈 문자열이면 없는 것으로 본다.
 *
 * 앞뒤 공백은 떼고 돌려준다. `" 11680-314 "`와 `"11680-314"`가 서로 다른
 * 단지로 갈리면 안 된다.
 */
function toRequiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `landLeaseholdGbn`을 {@link LandLeasehold}로 읽는다.
 *
 * **`"N"`이 아닌 것을 전부 "아님"으로 접지 않는다.** `"Y"`면 `"Y"`, `"N"`이면
 * `"N"`, 그 밖의 모든 것(공백 한 칸, 필드 없음, 숫자, 예상 못한 코드)은
 * `null`(모름)이다. 토지임대부를 놓치는 것이 낙관 방향이므로, 모르는 값을
 * 안전한 쪽("아님")으로 밀어 넣는 실수를 타입 단계에서 막는다.
 *
 * 대소문자와 앞뒤 공백만 정규화한다(`" y "` → `"Y"`). 이건 뜻을 추측하는 게
 * 아니라 이미 아는 코드의 표기를 맞추는 것이고, 방향도 안전한 쪽이다 —
 * `"y"`를 모름으로 버리면 실재하는 토지임대부 경고를 놓친다.
 */
function toLandLeasehold(value: unknown): LandLeasehold {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return code === "Y" || code === "N" ? code : null;
}

/**
 * 주소 필드들을 읽는다. 여기서는 **아무것도 실패로 만들지 않는다** —
 * 주소가 없다고 그 거래의 가격·면적·계약일이 덜 믿을 만해지지는 않기
 * 때문이다({@link RawAddress} 참고). 모르는 값은 `null`로 남긴다.
 */
function toAddress(r: Record<string, unknown>): RawAddress {
  return {
    roadNm: toOptionalText(r.roadNm),
    roadNmCd: toOptionalText(r.roadNmCd),
    bonbun: toOptionalText(r.bonbun),
    bubun: toOptionalText(r.bubun),
    jibun: toOptionalText(r.jibun),
    umdCd: toOptionalText(r.umdCd),
  };
}

/**
 * 있으면 좋고 없어도 그만인 텍스트 필드를 읽는다. 없거나 공백뿐이면 `null`.
 *
 * 숫자로 와도 문자열로 보존한다 — `bonbun`은 `"0746"`(문자열)과 `1284`(숫자)가
 * 실제로 섞여 오고, `bubun`의 `"0000"`은 숫자로 바꾸면 선행 0이 사라져 다른
 * 값이 된다. 반대로 숫자를 문자열로 만들면서 잃는 것은 없다.
 *
 * **빈 문자열을 만들어 채우지 않는다.** `""`는 "주소가 빈 문자열"이라는 없는
 * 사실이고, `null`은 "모른다"는 사실이다. 나중에 지오코딩이 이 둘을 구분해야
 * 한다.
 */
function toOptionalText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** 시군구 코드는 API에서 숫자로 오지만 우리 타입은 문자열이다(선행 0 보존). */
function toRegionCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * "145,000"(만원, 콤마·공백 포함 가능) 형태를 원 단위 정수로 바꾼다.
 * 예: " 82,500" → 825,000,000원. 10,000배 단위 실수는 여기서 나면 전체가 틀린다.
 */
function toWon(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,\s]/g, "");
  if (cleaned === "" || !/^-?\d+$/.test(cleaned)) return null;
  const manwon = Number(cleaned);
  if (!Number.isFinite(manwon)) return null;
  return manwon * 10_000;
}

/** 년·월·일 숫자 필드를 합쳐 YYYY-MM-DD를 만든다. */
function toContractDate(year: unknown, month: unknown, day: unknown): string | null {
  const y = toFiniteNumber(year);
  const m = toFiniteNumber(month);
  const d = toFiniteNumber(day);
  if (y === null || m === null || d === null) return null;
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
