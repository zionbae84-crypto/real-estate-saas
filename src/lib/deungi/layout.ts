import type { DeungiPageGeometry, DeungiRule, DeungiTextPiece } from "./types";

/**
 * 좌표로 표를 되살리고, 말소선이 그어진 글자를 가려낸다.
 *
 * ## 왜 좌표가 필요한가
 *
 * 등기부 PDF에서 글자를 순서대로만 뽑으면 표의 칸이 뒤섞여 나온다.
 * 실제 샘플에서 한 줄이 이렇게 끊겼다:
 *
 *     12 / 압류 / 2023년11월28일권리자  국민건강보험공단 / 제86890호 / 영이앤시
 *
 * 열이 끊기고 이름이 두 조각으로 쪼개진다. 세로 위치로 줄을 묶고 가로
 * 위치로 칸을 세우지 않으면 어느 금액이 어느 항목의 것인지 알 수 없다.
 *
 * ## 말소선 — 이 파일에서 가장 중요한 부분
 *
 * **글자만 뽑으면 말소된 항목이 살아 있는 것과 똑같이 나온다.** 실제
 * 샘플에는 말소된 근저당 18억이 있었고, 그것을 못 걸러내면 채권최고액
 * 합계가 23.2억이 아니라 41.2억이 된다. 반대로 살아 있는 근저당을
 * 말소로 잘못 보면 위험이 통째로 사라진다 — 이쪽이 더 위험하다.
 *
 * 말소선은 글자가 아니라 벡터 그래픽이라 `getOperatorList()`로만 보인다.
 * 표 괘선과 가르는 기준은 **길이**다. 실제 샘플에서 표 괘선은 길이 약
 * 549(`x=24..574`, 쪽 전체 폭)였고 말소선은 65~233이었다.
 */

/**
 * 표 괘선으로 보는 길이 기준(쪽 폭 대비).
 *
 * 실제 샘플: 괘선 549 / 쪽 폭 595 = 0.92, 가장 긴 말소선 233 / 595 =
 * 0.39. 그 사이에서 0.6을 골랐다 — 0.39와 0.92 어느 쪽에도 붙지 않는다.
 */
const TABLE_RULE_WIDTH_RATIO = 0.6;

/**
 * 말소선이 지나갈 수 있는 세로 구간(기준선 위로 글자 높이의 몇 배까지인가).
 *
 * 말소선은 글자를 가로지르므로 기준선보다 위, 글자 윗선보다 아래에 있다.
 * 아래쪽 경계를 0으로 두지 않은 것은 **표 괘선이 기준선 바로 아래에
 * 지나가는 일이 흔하기** 때문이다.
 */
const STRIKE_BAND_LOW = 0.12;
const STRIKE_BAND_HIGH = 0.62;

/**
 * 말소선으로 인정할 최소 겹침(글자 폭 대비).
 *
 * 0보다 크기만 하면 되게 두면 옆 칸에 그어진 줄이 끝자락만 걸쳐도
 * 말소로 읽힌다. 반대로 너무 높이면 칸의 일부만 덮은 줄을 놓친다.
 */
const STRIKE_OVERLAP_RATIO = 0.3;

/** 같은 줄로 묶는 세로 허용치(글자 높이 대비) */
const ROW_TOLERANCE_RATIO = 0.5;

/** 칸 사이로 보고 빈칸을 넣는 가로 간격(글자 높이 대비) */
const COLUMN_GAP_RATIO = 0.4;

/** 표 괘선을 뺀, 말소선 후보만 남긴 선들 */
export function strikeCandidates(page: DeungiPageGeometry): DeungiRule[] {
  const limit = page.width * TABLE_RULE_WIDTH_RATIO;
  return page.rules.filter((rule) => Math.abs(rule.x1 - rule.x0) < limit);
}

/**
 * 이 글자 조각에 말소선이 그어져 있는가.
 *
 * 판정은 두 가지를 함께 본다 — 선이 글자의 세로 구간을 지나는가, 그리고
 * 글자를 가로로 충분히 덮는가.
 */
export function isStruck(
  piece: DeungiTextPiece,
  candidates: readonly DeungiRule[],
): boolean {
  const low = piece.baselineY + piece.height * STRIKE_BAND_LOW;
  const high = piece.baselineY + piece.height * STRIKE_BAND_HIGH;
  const pieceWidth = Math.max(piece.endX - piece.x, 0.01);

  return candidates.some((rule) => {
    if (rule.y < low || rule.y > high) return false;
    const left = Math.max(piece.x, Math.min(rule.x0, rule.x1));
    const right = Math.min(piece.endX, Math.max(rule.x0, rule.x1));
    const overlap = right - left;
    return overlap / pieceWidth >= STRIKE_OVERLAP_RATIO;
  });
}

/**
 * 줄 안의 글자 조각 하나. 말소선 판정을 조각마다 붙여 둔다.
 *
 * **왜 조각마다인가:** 실제 등기부에서 말소선은 항목 전체에만 그어지지
 * 않는다. 전세금이 부기등기로 바뀌면 **옛 금액 한 칸에만** 줄이 그어지고
 * 나머지는 그대로 살아 있다. 실제 샘플의 을구 1번이 그랬다 — 전세금
 * 1,000만원에만 줄이 있고 항목 자체는 살아 있다. 줄 단위로 몇 개가
 * 그어졌는지만 세면 이 둘을 가를 수 없다.
 */
export interface DeungiRowPiece extends DeungiTextPiece {
  struck: boolean;
}

/** 한 줄. 글자 조각을 세로 위치로 묶고 가로 위치로 세운 결과 */
export interface DeungiRow {
  pageNumber: number;
  /** 줄의 기준선 y */
  y: number;
  /** 칸을 빈칸으로 이어 붙인 줄 전체 */
  text: string;
  /**
   * 말소선이 그어지지 않은 칸만 이어 붙인 줄.
   *
   * 살아 있는 항목의 금액은 여기서 읽는다. 줄이 그어진 옛 금액을 읽으면
   * 이미 바뀐 값이 합계에 들어간다.
   */
  liveText: string;
  /** 이 줄에서 말소선이 그어진 글자 조각 수 */
  struckCount: number;
  /** 이 줄의 글자 조각 수 */
  pieceCount: number;
  pieces: readonly DeungiRowPiece[];
}

/**
 * 한 쪽을 줄 단위로 되살린다. 위에서 아래로, 각 줄은 왼쪽에서 오른쪽으로.
 *
 * 글자만 있는 조각(빈칸)은 버린다 — 칸 사이의 빈칸은 가로 간격을 보고
 * 우리가 다시 넣는다.
 */
export function toRows(page: DeungiPageGeometry): DeungiRow[] {
  const candidates = strikeCandidates(page);
  const pieces = page.pieces
    .filter((piece) => piece.text.trim().length > 0)
    .slice()
    .sort((a, b) => b.baselineY - a.baselineY || a.x - b.x);

  const groups: DeungiTextPiece[][] = [];
  for (const piece of pieces) {
    const last = groups.at(-1) ?? null;
    const anchor = last === null ? undefined : last[0];
    const tolerance =
      Math.max(piece.height, anchor?.height ?? piece.height) * ROW_TOLERANCE_RATIO;
    if (last !== null && anchor !== undefined && Math.abs(anchor.baselineY - piece.baselineY) <= tolerance) {
      last.push(piece);
    } else {
      groups.push([piece]);
    }
  }

  return groups.map((group) => {
    const sorted: DeungiRowPiece[] = group
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((piece) => ({ ...piece, struck: isStruck(piece, candidates) }));
    const first = sorted[0];
    if (first === undefined) {
      return {
        pageNumber: page.pageNumber,
        y: 0,
        text: "",
        liveText: "",
        struckCount: 0,
        pieceCount: 0,
        pieces: [],
      };
    }

    let text = first.text;
    let liveText = first.struck ? "" : first.text;
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous === undefined || current === undefined) continue;
      const gap = current.x - previous.endX;
      const separated = gap > current.height * COLUMN_GAP_RATIO;
      text += separated ? ` ${current.text}` : current.text;
      if (current.struck) continue;
      // 줄이 그어진 칸을 건너뛴 자리는 늘 빈칸으로 벌린다. 앞뒤 글자가
      // 맞붙어 없던 낱말이 생기는 것을 막는다.
      liveText += liveText.length === 0 || (!separated && !previous.struck)
        ? current.text
        : ` ${current.text}`;
    }

    const struckCount = sorted.filter((piece) => piece.struck).length;
    return {
      pageNumber: page.pageNumber,
      y: first.baselineY,
      text,
      liveText,
      struckCount,
      pieceCount: sorted.length,
      pieces: sorted,
    };
  });
}

/** 여러 쪽을 쪽 번호 순서대로 줄로 편다 */
export function toAllRows(pages: readonly DeungiPageGeometry[]): DeungiRow[] {
  return pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .flatMap((page) => toRows(page));
}

/** 빈칸을 모두 없앤 글자열. 표의 칸이 끊긴 자리를 다시 붙일 때 쓴다 */
export function compact(text: string): string {
  return text.replace(/\s+/gu, "");
}
