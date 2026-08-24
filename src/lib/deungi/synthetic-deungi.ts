import {
  buildPdf,
  syntheticWidth,
  type SyntheticLine,
  type SyntheticPage,
  type SyntheticText,
} from "./synthetic";

/**
 * 실제 등기사항전부증명서와 같은 **모양**을 가진 합성 PDF를 만든다.
 *
 * 값은 전부 가짜다. 구조만 실제와 같게 둔다 — 머리말, 표제부·갑구·을구,
 * 말소선, 그리고 문서 끝의 「주요 등기사항 요약」이다.
 */

export interface SyntheticEntry {
  rank: string;
  purpose: string;
  /** 접수 칸(예: `2021년5월20일 제12345호`) */
  received: string;
  /** 등기원인 칸 */
  cause: string;
  /** 권리자 및 기타사항 칸. 줄마다 하나씩 */
  detail: string[];
  /** 가로줄이 그어진(말소된) 항목인가 */
  struck?: boolean;
  /**
   * 일부 칸에만 줄을 긋는다. 말소인지 아닌지 애매한 상태를 만드는
   * 테스트에서만 쓴다.
   */
  strikePartial?: boolean;
}

export interface SyntheticOwner {
  name: string;
  registration: string;
  share: string;
  address: string;
  rank: string;
}

export interface SyntheticSummaryRow {
  rank: string;
  purpose: string;
  received: string;
  detail: string;
  target: string;
}

export interface SyntheticSummary {
  owners: SyntheticOwner[];
  /** 「2. 소유지분을 제외한 소유권에 관한 사항 ( 갑구 )」 */
  gapgu: SyntheticSummaryRow[];
  /** 「3. (근)저당권 및 전세권 등 ( 을구 )」 */
  eulgu: SyntheticSummaryRow[];
}

export interface SyntheticDeungi {
  title: string;
  propertyKindLine: string;
  propertyLine: string;
  uniqueNumber: string;
  /** `열 람 용`·`발 급 용` 도장. null이면 도장이 없는 문서 */
  stamp: string | null;
  issuedAt: string | null;
  pyojebu: string[];
  gapgu: SyntheticEntry[];
  eulgu: SyntheticEntry[];
  /** null이면 요약이 없는 문서(대조할 상대가 없는 경우) */
  summary: SyntheticSummary | null;
}

// 칸이 서로 겹치지 않게 잡은 자리. 실제 등기부와 같은 다섯 칸이다.
const COLUMN = { rank: 28, purpose: 66, received: 140, cause: 268, detail: 380 } as const;
const SIZE = 6;
const LINE_HEIGHT = 16;
const TOP = 782;
const BOTTOM = 96;
const RULE_LEFT = 24;
const RULE_RIGHT = 574;

/** 말소선이 지나가는 높이(기준선 위로 글자 크기의 몇 배인가) */
const STRIKE_OFFSET = 0.35;

interface Cursor {
  pages: SyntheticPage[];
  texts: SyntheticText[];
  lines: SyntheticLine[];
  y: number;
  pageNumber: number;
}

function newCursor(): Cursor {
  return { pages: [], texts: [], lines: [], y: TOP, pageNumber: 1 };
}

function put(cursor: Cursor, text: string, x: number, struck: boolean): void {
  if (text.length === 0) return;
  cursor.texts.push({ text, x, y: cursor.y, size: SIZE });
  if (struck) {
    cursor.lines.push({
      x0: x - 1,
      x1: x + syntheticWidth(text, SIZE) + 1,
      y: cursor.y + SIZE * STRIKE_OFFSET,
    });
  }
}

function newline(cursor: Cursor, by = LINE_HEIGHT): void {
  cursor.y -= by;
}

function tableRule(cursor: Cursor): void {
  cursor.lines.push({ x0: RULE_LEFT, x1: RULE_RIGHT, y: cursor.y + SIZE * 1.1 });
}

function breakIfNeeded(cursor: Cursor, issuedAt: string | null): void {
  if (cursor.y > BOTTOM) return;
  endPage(cursor, issuedAt);
}

function endPage(cursor: Cursor, issuedAt: string | null): void {
  if (issuedAt !== null) {
    cursor.texts.push({ text: `열람일시 : ${issuedAt}`, x: 150, y: 60, size: 8 });
  }
  cursor.texts.push({ text: `${cursor.pageNumber}/9`, x: 520, y: 60, size: 8 });
  // 실제 PDF에서 표의 칸은 순서대로 나오지 않는다. 좌표로 되살리지
  // 못하는 파서가 통과하지 않도록 일부러 뒤집어 넣는다.
  cursor.pages.push({ texts: [...cursor.texts].reverse(), lines: cursor.lines });
  cursor.texts = [];
  cursor.lines = [];
  cursor.y = TOP;
  cursor.pageNumber += 1;
}

function writeEntry(cursor: Cursor, entry: SyntheticEntry, issuedAt: string | null): void {
  breakIfNeeded(cursor, issuedAt);
  const struck = entry.struck === true;
  const partial = entry.strikePartial === true;

  put(cursor, entry.rank, COLUMN.rank, struck && !partial);
  put(cursor, entry.purpose, COLUMN.purpose, struck);
  put(cursor, entry.received, COLUMN.received, struck && !partial);
  put(cursor, entry.cause, COLUMN.cause, struck && !partial);
  put(cursor, entry.detail[0] ?? "", COLUMN.detail, struck && !partial);
  newline(cursor);

  for (const line of entry.detail.slice(1)) {
    breakIfNeeded(cursor, issuedAt);
    put(cursor, line, COLUMN.detail, struck && !partial);
    newline(cursor);
  }
  tableRule(cursor);
}

function writeSectionHeader(cursor: Cursor, title: string, note: string, issuedAt: string | null): void {
  breakIfNeeded(cursor, issuedAt);
  newline(cursor, 6);
  cursor.texts.push({ text: title, x: 40, y: cursor.y, size: 10 });
  cursor.texts.push({ text: note, x: 200, y: cursor.y, size: 9 });
  newline(cursor);
  cursor.texts.push({ text: "순위번호", x: COLUMN.rank, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "등기목적", x: COLUMN.purpose, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "접수", x: COLUMN.received, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "등기원인", x: COLUMN.cause, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "권리자 및 기타사항", x: COLUMN.detail, y: cursor.y, size: SIZE });
  newline(cursor);
  tableRule(cursor);
}

/** 합성 등기부 PDF 바이트 */
export function buildDeungiPdf(spec: SyntheticDeungi): Uint8Array {
  const cursor = newCursor();
  const { issuedAt } = spec;

  cursor.texts.push({ text: spec.title, x: 150, y: 812, size: 12 });
  cursor.texts.push({ text: spec.propertyKindLine, x: 250, y: 796, size: 10 });
  cursor.y = TOP;

  cursor.texts.push({ text: spec.propertyLine, x: 30, y: cursor.y, size: SIZE });
  newline(cursor);
  cursor.texts.push({ text: `고유번호 ${spec.uniqueNumber}`, x: 30, y: cursor.y, size: SIZE });
  if (spec.stamp !== null) {
    cursor.texts.push({ text: spec.stamp, x: 470, y: cursor.y, size: 11 });
  }
  newline(cursor);

  if (spec.pyojebu.length > 0) {
    writeSectionHeader(cursor, "【  표  제  부  】", "( 전유부분의 건물의 표시 )", issuedAt);
    for (const line of spec.pyojebu) {
      breakIfNeeded(cursor, issuedAt);
      cursor.texts.push({ text: line, x: COLUMN.rank, y: cursor.y, size: SIZE });
      newline(cursor);
    }
    tableRule(cursor);
  }

  writeSectionHeader(cursor, "【  갑    구  】", "( 소유권에 관한 사항 )", issuedAt);
  for (const entry of spec.gapgu) writeEntry(cursor, entry, issuedAt);

  writeSectionHeader(cursor, "【  을    구  】", "( 소유권 이외의 권리에 관한 사항 )", issuedAt);
  for (const entry of spec.eulgu) writeEntry(cursor, entry, issuedAt);

  if (spec.summary !== null) writeSummary(cursor, spec.summary, issuedAt);

  endPage(cursor, issuedAt);
  return buildPdf(cursor.pages);
}

function writeSummary(cursor: Cursor, summary: SyntheticSummary, issuedAt: string | null): void {
  endPage(cursor, issuedAt);
  cursor.texts.push({ text: "주요 등기사항 요약 (참고용)", x: 200, y: cursor.y, size: 12 });
  newline(cursor, 24);

  cursor.texts.push({ text: "1. 소유지분현황 ( 갑구 )", x: 30, y: cursor.y, size: 10 });
  newline(cursor);
  cursor.texts.push({ text: "등기명의인", x: 30, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "(주민)등록번호", x: 110, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "최종지분", x: 210, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "주소", x: 290, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "순위번호", x: 520, y: cursor.y, size: SIZE });
  newline(cursor);
  for (const owner of summary.owners) {
    breakIfNeeded(cursor, issuedAt);
    cursor.texts.push({ text: owner.name, x: 30, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: owner.registration, x: 110, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: owner.share, x: 210, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: owner.address, x: 290, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: owner.rank, x: 520, y: cursor.y, size: SIZE });
    newline(cursor);
  }

  newline(cursor, 10);
  writeSummaryTable(cursor, "2. 소유지분을 제외한 소유권에 관한 사항 ( 갑구 )", summary.gapgu, issuedAt);
  newline(cursor, 10);
  writeSummaryTable(cursor, "3. (근)저당권 및 전세권 등 ( 을구 )", summary.eulgu, issuedAt);
}

function writeSummaryTable(
  cursor: Cursor,
  title: string,
  rows: readonly SyntheticSummaryRow[],
  issuedAt: string | null,
): void {
  breakIfNeeded(cursor, issuedAt);
  cursor.texts.push({ text: title, x: 30, y: cursor.y, size: 10 });
  newline(cursor);
  cursor.texts.push({ text: "순위번호", x: COLUMN.rank, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "등기목적", x: COLUMN.purpose, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "접수정보", x: COLUMN.received, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "주요등기사항", x: COLUMN.cause, y: cursor.y, size: SIZE });
  cursor.texts.push({ text: "대상소유자", x: 500, y: cursor.y, size: SIZE });
  newline(cursor);
  for (const row of rows) {
    breakIfNeeded(cursor, issuedAt);
    cursor.texts.push({ text: row.rank, x: COLUMN.rank, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: row.purpose, x: COLUMN.purpose, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: row.received, x: COLUMN.received, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: row.detail, x: COLUMN.cause, y: cursor.y, size: SIZE });
    cursor.texts.push({ text: row.target, x: 500, y: cursor.y, size: SIZE });
    newline(cursor);
  }
}

/**
 * 실제 샘플과 같은 얼개의 기본 등기부.
 *
 * 근저당 세 건 중 하나는 말소선이 그어져 있다 — 그것을 걸러내지 못하면
 * 채권최고액 합계가 23.2억이 아니라 41.2억이 된다. 실제 샘플에서 우리가
 * 확인한 그 구조 그대로다.
 */
export function sampleDeungi(): SyntheticDeungi {
  return {
    title: "등기사항전부증명서(말소사항 포함)",
    propertyKindLine: "- 집합건물 -",
    propertyLine: "[집합건물] 경기도 파주시 금촌동 329-158외 2필지 엠에이치타워 제6층 제605호",
    uniqueNumber: "2849-2021-011575",
    stamp: "열 람 용",
    issuedAt: "2026년08월20일 13시36분53초",
    pyojebu: [
      "( 대지권의 목적인 토지의 표시 )",
      "1. 경기도 파주시 금촌동 329-158 대 1,234.5㎡",
      "( 대지권의 표시 )",
      "1 소유권대지권 대지권비율 1234.5분의 25.67",
    ],
    gapgu: [
      {
        rank: "1",
        purpose: "소유권보존",
        received: "2021년3월2일 제5678호",
        cause: "",
        detail: ["소유자 한빛건설주식회사", "110111-0001111", "경기도 파주시 금촌동 100"],
      },
      {
        rank: "2",
        purpose: "소유권이전",
        received: "2021년5월20일 제12345호",
        cause: "2021년4월1일 매매",
        detail: ["소유자 김한결", "800101-1234567", "경기도 파주시 금촌로 12"],
      },
    ],
    eulgu: [
      {
        rank: "1",
        purpose: "근저당권설정",
        received: "2021년5월20일 제12346호",
        cause: "2021년5월20일 설정계약",
        detail: [
          "채권최고액 금1,800,000,000원",
          "채무자 김한결",
          "근저당권자 상도새마을금고",
          "114471-0001234",
        ],
        struck: true,
      },
      {
        rank: "2",
        purpose: "근저당권설정",
        received: "2023년7월11일 제55501호",
        cause: "2023년7월11일 설정계약",
        detail: [
          "채권최고액 금1,920,000,000원",
          "채무자 김한결",
          "근저당권자 영북농업협동조합",
          "114471-0005678",
        ],
      },
      {
        rank: "3",
        purpose: "근저당권설정",
        received: "2024년2월5일 제9001호",
        cause: "2024년2월5일 설정계약",
        detail: ["채권최고액 금400,000,000원", "채무자 김한결", "근저당권자 남진우"],
      },
    ],
    summary: {
      owners: [
        {
          name: "김한결",
          registration: "800101-1******",
          share: "단독소유",
          address: "경기도 파주시 금촌로 12",
          rank: "2",
        },
      ],
      gapgu: [],
      eulgu: [
        {
          rank: "2",
          purpose: "근저당권설정",
          received: "2023년7월11일 제55501호",
          detail: "채권최고액 금1,920,000,000원",
          target: "김한결",
        },
        {
          rank: "3",
          purpose: "근저당권설정",
          received: "2024년2월5일 제9001호",
          detail: "채권최고액 금400,000,000원",
          target: "김한결",
        },
      ],
    },
  };
}
