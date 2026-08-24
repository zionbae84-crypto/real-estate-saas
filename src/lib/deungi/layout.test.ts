import { describe, expect, it } from "vitest";
import { compact, isStruck, strikeCandidates, toRows } from "./layout";
import type { DeungiPageGeometry, DeungiRule, DeungiTextPiece } from "./types";

/**
 * 말소선 판정과 표 되살리기를 좌표만 놓고 직접 시험한다.
 *
 * PDF를 거치지 않고 좌표를 손으로 놓는 이유는, **이 판정이 틀리는 방향**을
 * 하나씩 겨눠 보기 위해서다. 표 괘선을 말소선으로 읽으면 살아 있는
 * 근저당이 사라지고, 말소선을 표 괘선으로 읽으면 말소된 근저당이 합계에
 * 들어온다. 두 방향을 각각 잠근다.
 */

function piece(text: string, x: number, baselineY: number, height = 9): DeungiTextPiece {
  return { text, x, endX: x + text.length * height, baselineY, height };
}

function page(pieces: DeungiTextPiece[], rules: DeungiRule[]): DeungiPageGeometry {
  return { pageNumber: 1, width: 595, height: 842, rotated: false, pieces, rules };
}

const 글자 = piece("채권최고액", 250, 660);

describe("말소선 판정", () => {
  it("글자 한가운데를 지나는 짧은 선은 말소선이다", () => {
    const line: DeungiRule = { x0: 248, x1: 300, y: 663 };
    expect(isStruck(글자, [line])).toBe(true);
  });

  it("쪽 전체를 가로지르는 표 괘선은 후보에서 빠진다", () => {
    // 실제 샘플의 괘선: x=24..574, 길이 550. 이것을 말소선으로 읽으면
    // 그 줄의 모든 항목이 통째로 말소로 사라진다.
    const 괘선: DeungiRule = { x0: 24, x1: 574, y: 663 };
    const 말소선: DeungiRule = { x0: 248, x1: 300, y: 663 };

    const candidates = strikeCandidates(page([글자], [괘선, 말소선]));
    expect(candidates).toEqual([말소선]);

    // 괘선만 있으면 말소가 아니다 — 세로 위치가 겹쳐도 그렇다.
    expect(isStruck(글자, strikeCandidates(page([글자], [괘선])))).toBe(false);
  });

  it("글자 아래를 지나는 선은 말소선이 아니다", () => {
    expect(isStruck(글자, [{ x0: 248, x1: 300, y: 660 - 3 }])).toBe(false);
  });

  it("글자 위를 지나는 선은 말소선이 아니다", () => {
    expect(isStruck(글자, [{ x0: 248, x1: 300, y: 660 + 9 }])).toBe(false);
  });

  it("끝자락만 걸친 선은 말소선이 아니다", () => {
    // 옆 칸에 그어진 줄이 조금 넘어온 경우. 이것을 말소로 읽으면 살아
    // 있는 항목이 사라진다.
    expect(isStruck(글자, [{ x0: 240, x1: 253, y: 663 }])).toBe(false);
  });

  it("칸 전체를 덮은 선은 말소선이다", () => {
    expect(isStruck(글자, [{ x0: 249, x1: 296, y: 663 }])).toBe(true);
  });
});

describe("표 되살리기", () => {
  it("뒤섞여 들어온 칸을 세로·가로 위치로 되살린다", () => {
    // 실제 PDF에서 이렇게 끊겨 나온다: 열이 뒤섞이고 이름이 쪼개진다.
    const rows = toRows(
      page(
        [
          piece("영이앤시", 380, 640),
          piece("압류", 66, 660),
          piece("12", 28, 660),
          piece("국민건강보험공단", 380, 660),
          piece("2023년11월28일", 140, 660),
        ],
        [],
      ),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.text).toBe("12 압류 2023년11월28일 국민건강보험공단");
    expect(rows[1]?.text).toBe("영이앤시");
  });

  it("말소선이 그어진 조각을 줄마다 센다", () => {
    const rows = toRows(
      page([piece("근저당권설정", 66, 660), piece("소유권이전", 66, 640)], [
        { x0: 65, x1: 120, y: 663 },
      ]),
    );

    expect(rows[0]?.struckCount).toBe(1);
    expect(rows[0]?.pieceCount).toBe(1);
    expect(rows[1]?.struckCount).toBe(0);
  });

  it("빈칸만 있는 조각은 버린다", () => {
    const rows = toRows(page([piece(" ", 100, 660), piece("압류", 66, 660)], []));
    expect(rows[0]?.text).toBe("압류");
  });
});

describe("빈칸 없애기", () => {
  it("불규칙한 빈칸을 지운다", () => {
    expect(compact("【  갑    구  】")).toBe("【갑구】");
    expect(compact("채권최고액 금1,800,000,000원")).toBe("채권최고액금1,800,000,000원");
  });
});
