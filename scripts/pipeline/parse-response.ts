import type { ParseResult, RawTrade } from "./types";

/**
 * 국토부 실거래가 API 응답(JSON 문자열)을 RawTrade 배열로 바꾼다.
 *
 * 계약 조건:
 * - 레코드 하나가 망가져도 예외를 던지지 않는다. 그 건만 버리고 failures를
 *   올린다 — 한 건 때문에 시군구·월 전체를 잃지 않기 위해서다.
 * - 해제(취소)된 거래(`cdealType`이 공백이 아님)는 trades에서 제외하고
 *   cancelled로 따로 센다. 형식이 멀쩡한 정상 레코드이므로 failures가 아니다.
 * - 응답 자체가 파싱 불가하면 { trades: [], failures: 0, cancelled: 0 }을
 *   돌려주고 호출자가 판단하게 한다.
 */
export function parseResponse(body: string): ParseResult {
  const items = extractItems(body);
  if (items === null) {
    return { trades: [], failures: 0, cancelled: 0 };
  }

  const trades: RawTrade[] = [];
  let failures = 0;
  let cancelled = 0;

  for (const item of items) {
    if (isCancelled(item)) {
      cancelled += 1;
      continue;
    }
    const trade = parseItem(item);
    if (trade === null) {
      failures += 1;
      continue;
    }
    trades.push(trade);
  }

  return { trades, failures, cancelled };
}

/**
 * 응답 본문에서 아이템 목록을 꺼낸다. 두 가지 국토부 API 특유의 형태를 다룬다:
 * - 해당 시군구·월에 거래가 없으면 `items`가 `""`(빈 문자열)이다. 빈 배열이 아니다.
 * - 거래가 정확히 1건이면 `items.item`이 배열이 아니라 객체 하나로 온다.
 *
 * 본문 자체를 JSON으로 읽을 수 없거나 예상한 모양이 아니면 null을 돌려준다.
 */
function extractItems(body: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const items = getPath(parsed, ["response", "body", "items"]);
  if (items === "" || items === undefined || items === null) {
    // 거래 없음(빈 문자열) 또는 예상한 경로가 아예 없음 — 둘 다 "거래 없음"으로 본다.
    return [];
  }

  const item = getPath(items, ["item"]);
  if (item === undefined) return [];
  if (Array.isArray(item)) return item;
  return [item];
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

/** cdealType이 공백이 아니면 해제(취소)된 거래다. */
function isCancelled(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const cdealType = (item as Record<string, unknown>).cdealType;
  return typeof cdealType === "string" && cdealType.trim() !== "";
}

/** 레코드 하나를 RawTrade로 바꾼다. 형식이 안 맞으면 예외 대신 null. */
function parseItem(item: unknown): RawTrade | null {
  if (typeof item !== "object" || item === null) return null;
  const r = item as Record<string, unknown>;

  const regionCode = toRegionCode(r.sggCd);
  const legalDongName = typeof r.umdNm === "string" ? r.umdNm : null;
  const complexName = typeof r.aptNm === "string" ? r.aptNm : null;
  const builtYear = toFiniteNumber(r.buildYear);
  const exclusiveAreaSqm = toFiniteNumber(r.excluUseAr);
  const floor = toFiniteNumber(r.floor);
  const price = toWon(r.dealAmount);
  const contractDate = toContractDate(r.dealYear, r.dealMonth, r.dealDay);

  if (
    regionCode === null ||
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
    legalDongName,
    complexName,
    builtYear,
    exclusiveAreaSqm,
    floor,
    price,
    contractDate,
  };
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
