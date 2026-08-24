import { compact, type DeungiRow } from "./layout";
import type {
  DeungiAddress,
  DeungiEntry,
  DeungiEntryKind,
  DeungiHeader,
  DeungiOwner,
  DeungiPurpose,
  DeungiSummaryRow,
} from "./types";

/**
 * 줄로 편 등기부를 머리말·본문 항목·요약으로 읽는다.
 *
 * 여기서 만드는 값은 전부 **사람이 원본과 맞춰 볼 수 있는 모양**이다.
 * 판정은 하지 않는다 — 판정은 `rules/rights-2026-08.json`을 쓰는 문진
 * 엔진의 몫이고, 이 파일은 그 입력이 될 사실만 모은다.
 */

/** 금액 글자를 원 단위 정수로. 못 읽으면 null — **0원이 아니다** */
export function parseWon(text: string): number | null {
  const matched = /금?\s*([0-9][0-9,]*)\s*원/u.exec(text);
  const digits = matched?.[1];
  if (digits === undefined) return null;
  const won = Number(digits.replace(/,/gu, ""));
  if (!Number.isFinite(won) || won < 0) return null;
  return Math.round(won);
}

/**
 * 이름표 뒤에 바로 붙은 금액만 읽는다(예: `채권최고액 금1,800,000,000원`).
 *
 * 이름표를 요구하는 것이 이 함수의 전부다. 줄 어딘가의 아무 숫자나
 * 금액으로 읽으면 접수번호("제86890호")나 날짜가 채권최고액이 된다.
 */
function amountAfter(compacted: string, label: string): number | null {
  const digits = new RegExp(`${label}금?([0-9][0-9,]*)원`, "u").exec(compacted)?.[1];
  if (digits === undefined) return null;
  const won = Number(digits.replace(/,/gu, ""));
  if (!Number.isFinite(won) || won < 0) return null;
  return Math.round(won);
}

/**
 * 등기목적을 갈래로 옮긴다.
 *
 * 순서가 판단이다. `말소`가 가장 먼저인 것은 "근저당권말소"가
 * 근저당권으로 읽혀 금액 없는 근저당이 하나 더 생기는 것을 막기
 * 위해서다. `가압류`가 `압류`보다, `가등기`가 `소유권`보다 먼저인 것도
 * 같은 이유다 — "소유권이전청구권가등기"는 가등기다.
 */
export function classifyPurpose(purpose: string): DeungiEntryKind {
  const c = compact(purpose);
  if (c.length === 0) return "기타";
  if (c.includes("말소")) return "기타";
  if (c.includes("경매개시결정")) return "경매개시결정";
  if (c.includes("가등기")) return "가등기";
  if (c.includes("가처분")) return "가처분";
  if (c.includes("가압류")) return "가압류";
  if (c.includes("압류")) return "압류";
  if (c.includes("신탁")) return "신탁";
  if (c.includes("근저당권") || c.includes("저당권")) return "근저당권";
  if (c.includes("전세권")) return "전세권";
  if (c.includes("임차권")) return "임차권";
  if (c.includes("지상권")) return "지상권";
  if (c.includes("소유권")) return "소유권";
  return "기타";
}

/** 순위번호에서 주(主) 번호만. 부기등기 "3-1"은 "3"에 묶인다 */
export function mainRankOf(rank: string): string {
  return rank.split("-")[0] ?? rank;
}

const RANK_AT_START = /^(\d+(?:-\d+)*)(?=\s|$)/u;

/**
 * 순위번호 칸의 너비(pt).
 *
 * **왜 자리를 보는가:** 숫자로 시작한다는 것만으로 새 항목을 열면,
 * 권리자 칸의 등록번호("110111-0001111")가 새 항목을 만들어 버린다.
 * 실제로 그 결함이 있었고, 말소된 근저당 하나가 두 항목으로 쪼개져
 * 절반만 말소로 읽혔다. 순위번호는 표의 가장 왼쪽 칸에만 있다.
 */
const RANK_COLUMN_WIDTH = 40;

/** 이 구에서 표의 왼쪽 끝이 어디인가 */
function leftEdgeOf(rows: readonly DeungiRow[]): number {
  let left = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const first = row.pieces[0];
    if (first !== undefined) left = Math.min(left, first.x);
  }
  return Number.isFinite(left) ? left : 0;
}

/** 이 줄이 새 항목의 첫 줄인가. 맞으면 순위번호를 돌려준다 */
function rankStarting(row: DeungiRow, leftEdge: number): string | null {
  const first = row.pieces[0];
  if (first === undefined) return null;
  if (first.x > leftEdge + RANK_COLUMN_WIDTH) return null;
  return RANK_AT_START.exec(first.text)?.[1] ?? null;
}

/** 표의 머리글·쪽 바닥글처럼 항목이 아닌 줄 */
function isNoise(row: DeungiRow): boolean {
  const c = compact(row.text);
  if (c.length === 0) return true;
  if (c.includes("순위번호") && c.includes("등기목적")) return true;
  if (c.includes("등기명의인") && c.includes("최종지분")) return true;
  if (c.includes("주요등기사항") && c.includes("대상소유자")) return true;
  if (c.includes("열람일시")) return true;
  if (c.includes("관할등기소")) return true;
  if (c.includes("이하여백")) return true;
  if (/^\d+\/\d+$/u.test(c)) return true;
  return false;
}

export type DeungiRowSection = "머리말" | "표제부" | "갑구" | "을구" | "요약";

export interface SectionedRow {
  row: DeungiRow;
  section: DeungiRowSection;
  /** 요약 안에서 몇 번째 표인가(1·2·3). 요약 밖이면 0 */
  summaryPart: 0 | 1 | 2 | 3;
}

/**
 * 줄마다 어느 구(區)에 속하는지 표시한다.
 *
 * 구 제목은 `【  표  제  부  】`처럼 빈칸이 불규칙하게 들어가 있어서
 * 빈칸을 모두 없앤 뒤 견준다.
 */
export function sectionRows(rows: readonly DeungiRow[]): SectionedRow[] {
  let section: DeungiRowSection = "머리말";
  let summaryPart: 0 | 1 | 2 | 3 = 0;

  return rows.map((row) => {
    const c = compact(row.text);
    if (c.includes("【표제부】")) section = "표제부";
    else if (c.includes("【갑구】")) section = "갑구";
    else if (c.includes("【을구】")) section = "을구";
    else if (c.includes("주요등기사항요약")) {
      section = "요약";
      summaryPart = 0;
    }

    if (section === "요약") {
      if (c.startsWith("1.소유지분현황")) summaryPart = 1;
      else if (c.startsWith("2.소유지분을제외한")) summaryPart = 2;
      else if (c.startsWith("3.")) summaryPart = 3;
    }

    return { row, section, summaryPart };
  });
}

/** 머리말을 읽는다. 못 읽은 자리는 전부 null이나 `unknown`으로 남는다 */
export function readHeader(rows: readonly DeungiRow[]): DeungiHeader {
  const all = compact(rows.map((row) => row.text).join("\n"));

  const propertyKind = all.includes("집합건물")
    ? "집합건물"
    : all.includes("[건물]") || all.includes("-건물-")
      ? "건물"
      : all.includes("[토지]") || all.includes("-토지-")
        ? "토지"
        : null;

  const withCancelled = all.includes("말소사항포함")
    ? true
    : all.includes("현재유효사항")
      ? false
      : null;

  const purpose: DeungiPurpose = all.includes("열람용")
    ? "read"
    : all.includes("발급용")
      ? "issued"
      : "unknown";

  const issued = /열람일시:?(\d{4})년(\d{2})월(\d{2})일(\d{2})시(\d{2})분(\d{2})초/u.exec(all);
  const issuedAt =
    issued === null
      ? null
      : `${issued[1]}년${issued[2]}월${issued[3]}일 ${issued[4]}시${issued[5]}분${issued[6]}초`;
  const issuedAtIso =
    issued === null
      ? null
      : `${issued[1]}-${issued[2]}-${issued[3]}T${issued[4]}:${issued[5]}:${issued[6]}`;

  const unique = /고유번호(\d{4}-\d{4}-\d{6})/u.exec(all);

  return {
    propertyKind,
    withCancelled,
    purpose,
    issuedAt,
    issuedAtIso,
    uniqueNumber: unique?.[1] ?? null,
    address: readAddress(rows),
  };
}

const PROPERTY_TAG = /\[\s*(집합건물|건물|토지)\s*\]\s*(.+)$/u;

/**
 * `[집합건물] 경기도 파주시 금촌동 329-158외 2필지 엠에이치타워 제6층 제605호`를
 * 조각낸다.
 *
 * 다음 작업에서 "이 등기부가 정말 그 매물인가"를 사람이 견줘야 하므로
 * 원문(`raw`)을 반드시 남긴다. 조각내기에 실패해도 원문은 남는다.
 */
export function readAddress(rows: readonly DeungiRow[]): DeungiAddress | null {
  for (const row of rows) {
    const matched = PROPERTY_TAG.exec(row.text);
    const rest = matched?.[2];
    if (rest === undefined) continue;

    const raw = rest.replace(/\s+/gu, " ").trim();
    const tokens = raw.split(" ");

    const ho = /제?\s*(\d+(?:-\d+)?)\s*호/u.exec(raw)?.[0]?.replace(/\s+/gu, "") ?? null;
    const dong = /제\s*\d+\s*동/u.exec(raw)?.[0]?.replace(/\s+/gu, "") ?? null;

    let lotEnd = -1;
    tokens.forEach((token, index) => {
      // "329-158외"처럼 지번 뒤에 "외"가 붙어 나오는 줄이 있다.
      if (/^산?\d[\d-]*외?$/u.test(token)) lotEnd = index;
    });
    if (lotEnd >= 0 && tokens[lotEnd + 1] === "외") lotEnd += 1;
    if (lotEnd >= 0 && /^\d+필지$/u.test(tokens[lotEnd + 1] ?? "")) lotEnd += 1;

    const buildingStart = lotEnd + 1;
    let buildingEnd = tokens.length;
    for (let i = buildingStart; i < tokens.length; i += 1) {
      if (/^제\s*\d/u.test(tokens[i] ?? "")) {
        buildingEnd = i;
        break;
      }
    }

    return {
      raw,
      lot: lotEnd >= 0 ? tokens.slice(0, lotEnd + 1).join(" ") : null,
      buildingName:
        buildingStart < buildingEnd ? tokens.slice(buildingStart, buildingEnd).join(" ") : null,
      dong,
      ho,
    };
  }
  return null;
}

const HOLDER_LABELS = [
  "근저당권자",
  "전세권자",
  "임차권자",
  "지상권자",
  "권리자",
  "채권자",
  "수탁자",
] as const;

/** 권리자 이름. **판정에 쓰지 않는다** — 사람이 대조할 때만 쓴다 */
function readHolder(compacted: string): string | null {
  for (const label of HOLDER_LABELS) {
    const at = compacted.indexOf(label);
    if (at < 0) continue;
    const after = compacted.slice(at + label.length);
    const name = /^[가-힣A-Za-z()]{2,30}/u.exec(after)?.[0];
    if (name !== undefined && name.length > 0) return name;
  }
  return null;
}

/** 항목 하나의 금액. 이름표가 붙은 금액만 읽는다 */
function readAmount(compacted: string, kind: DeungiEntryKind): number | null {
  if (kind === "근저당권") return amountAfter(compacted, "채권최고액");
  if (kind === "전세권") return amountAfter(compacted, "전세금");
  if (kind === "임차권") {
    return amountAfter(compacted, "임차보증금") ?? amountAfter(compacted, "전세금");
  }
  return null;
}

/** 한 항목이 말소로 보이는 최소 비율. 아래면 "애매함"으로 남긴다 */
const STRUCK_MAJORITY = 0.5;

/** 갑구·을구의 항목을 읽는다 */
export function readEntries(sectioned: readonly SectionedRow[]): DeungiEntry[] {
  const leftEdge = {
    갑구: leftEdgeOf(sectioned.filter((e) => e.section === "갑구").map((e) => e.row)),
    을구: leftEdgeOf(sectioned.filter((e) => e.section === "을구").map((e) => e.row)),
  };
  const entries: DeungiEntry[] = [];
  let current: { section: "갑구" | "을구"; rank: string; rows: DeungiRow[] } | null = null;

  const flush = (): void => {
    if (current === null) return;
    const text = current.rows.map((row) => row.text).join("\n");
    const compacted = compact(text);
    const firstRow = current.rows[0];
    const purposeToken = firstRow === undefined
      ? ""
      : (firstRow.text.replace(RANK_AT_START, "").trim().split(/\s+/u)[0] ?? "");
    const kind = classifyPurpose(purposeToken);

    const pieceCount = current.rows.reduce((sum, row) => sum + row.pieceCount, 0);
    const struckCount = current.rows.reduce((sum, row) => sum + row.struckCount, 0);
    const ratio = pieceCount === 0 ? 0 : struckCount / pieceCount;

    entries.push({
      section: current.section,
      rank: current.rank,
      mainRank: mainRankOf(current.rank),
      purpose: purposeToken,
      kind,
      amountWon: readAmount(compacted, kind),
      holder: readHolder(compacted),
      struck: ratio >= STRUCK_MAJORITY,
      strikeAmbiguous: ratio > 0 && ratio < STRUCK_MAJORITY,
      text,
    });
    current = null;
  };

  for (const { row, section } of sectioned) {
    if (section !== "갑구" && section !== "을구") {
      flush();
      continue;
    }
    if (isNoise(row)) continue;

    const rank = rankStarting(row, leftEdge[section]);
    if (rank !== null) {
      flush();
      current = { section, rank, rows: [row] };
    } else if (current !== null && current.section === section) {
      current.rows.push(row);
    }
  }
  flush();

  return entries;
}

/** 요약의 「1. 소유지분현황」 */
export function readOwners(sectioned: readonly SectionedRow[]): DeungiOwner[] {
  const owners: DeungiOwner[] = [];
  for (const { row, section, summaryPart } of sectioned) {
    if (section !== "요약" || summaryPart !== 1) continue;
    if (isNoise(row)) continue;
    const c = compact(row.text);
    if (c.startsWith("1.소유지분현황")) continue;

    const tokens = row.text.trim().split(/\s+/u);
    const name = tokens[0];
    if (name === undefined || !/[가-힣A-Za-z]/u.test(name)) continue;

    const share = tokens.find((token) => /^(단독소유|\d+분의\d+)$/u.test(compact(token))) ?? null;
    const last = tokens.at(-1);
    owners.push({
      name,
      share,
      rank: last !== undefined && /^\d+(-\d+)?$/u.test(last) ? last : null,
    });
  }
  return owners;
}

/** 요약의 2·3번 표 */
export function readSummaryRows(sectioned: readonly SectionedRow[]): DeungiSummaryRow[] {
  const leftEdge = leftEdgeOf(
    sectioned.filter((entry) => entry.section === "요약").map((entry) => entry.row),
  );
  const rows: DeungiSummaryRow[] = [];
  for (const { row, section, summaryPart } of sectioned) {
    if (section !== "요약") continue;
    if (summaryPart !== 2 && summaryPart !== 3) continue;
    if (isNoise(row)) continue;

    const rank = rankStarting(row, leftEdge);
    if (rank === null) continue;

    const rest = row.text.replace(RANK_AT_START, "").trim();
    const purposeToken = rest.split(/\s+/u)[0] ?? "";
    const kind = classifyPurpose(purposeToken);
    const compacted = compact(row.text);

    rows.push({
      section: summaryPart === 2 ? "갑구" : "을구",
      rank,
      mainRank: mainRankOf(rank),
      purpose: purposeToken,
      kind,
      amountWon: readAmount(compacted, kind),
      text: row.text,
    });
  }
  return rows;
}

/** 요약 표가 문서에 있는가 */
export function hasSummary(sectioned: readonly SectionedRow[]): boolean {
  return sectioned.some(({ section }) => section === "요약");
}

/** 특정 구의 글자를 모두 이어 붙인 것(말소된 줄도 포함한다) */
export function sectionText(
  sectioned: readonly SectionedRow[],
  section: DeungiRowSection,
): string {
  return compact(
    sectioned
      .filter((entry) => entry.section === section)
      .map((entry) => entry.row.text)
      .join("\n"),
  );
}
