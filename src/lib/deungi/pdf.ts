import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorkerModule from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { DeungiPageGeometry, DeungiRule, DeungiTextPiece } from "./types";

/**
 * PDF 파일에서 **글자와 좌표와 선**을 뽑는다. pdf.js에 기대는 유일한 곳이다.
 *
 * ## 파일은 이 브라우저를 벗어나지 않는다
 *
 * pdf.js는 보통 워커를 URL로 불러온다 — 그건 네트워크 요청이다. 여기서는
 * 워커 모듈을 **정적으로 불러와 번들 안에 넣는다.** 워커 모듈은 불러오는
 * 것만으로 스스로를 `globalThis.pdfjsWorker`에 등록하고, pdf.js는 워커를
 * 띄우기 전에 그 자리를 먼저 본다
 * (`PDFWorker.#mainThreadWorkerMessageHandler`). 거기 있으면 `new
 * Worker(url)`도, 워커 파일을 URL로 불러오는 것도 하지 않고 같은
 * 스레드에서 돈다.
 *
 * **정적 import 한 줄이 이 약속을 지탱한다.** 그 줄이 사라지면 워커
 * 모듈이 번들에서 빠지고, pdf.js는 `./pdf.worker.mjs`를 URL로 찾아
 * 나선다. `scripts/deungi-network-guard.test.ts`가 그 줄을 지킨다.
 *
 * 문서도 URL이 아니라 **바이트로만** 넘긴다(`data`). pdf.js가 네트워크로
 * 가는 경로는 URL을 줬을 때뿐이다. 폰트도 마찬가지다 —
 * `standardFontDataUrl`·`cMapUrl`을 주지 않으므로 받아올 곳이 없다.
 *
 * ## 알려진 한계
 *
 * 미리 정의된 CJK CMap(`UniKS-UCS2-H` 등)을 쓰는 PDF는 CMap 자료 없이
 * 글자를 풀 수 없다. 그 경우 글자가 비어 나오고, 그러면 이 파서는
 * "등기사항전부증명서가 아니다"로 판단해 **전부 모름**을 낸다. 잘못 읽는
 * 것보다 못 읽었다고 말하는 쪽이라 그대로 둔다.
 */

// 워커 모듈은 스스로 이 자리를 채우지만, 그 사실에만 기대면 위의 import가
// "쓰이지 않는 import"로 보여 언젠가 정리당한다. 여기서 한 번 더 얹어
// 두는 것은 그 줄이 무엇을 위한 것인지 코드로 남기기 위해서다.
(globalThis as unknown as Record<string, unknown>).pdfjsWorker = pdfjsWorkerModule;

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** PDF의 `cm`은 새 행렬을 현재 행렬 **앞에** 곱한다 */
function multiply(m: Matrix, base: Matrix): Matrix {
  return [
    m[0] * base[0] + m[1] * base[2],
    m[0] * base[1] + m[1] * base[3],
    m[2] * base[0] + m[3] * base[2],
    m[2] * base[1] + m[3] * base[3],
    m[4] * base[0] + m[5] * base[2] + base[4],
    m[4] * base[1] + m[5] * base[3] + base[5],
  ];
}

function applyX(m: Matrix, x: number, y: number): number {
  return m[0] * x + m[2] * y + m[4];
}

function applyY(m: Matrix, x: number, y: number): number {
  return m[1] * x + m[3] * y + m[5];
}

/** 수평으로 볼 세로 흔들림. 이보다 기울면 선이 아니라 사선이다 */
const HORIZONTAL_TOLERANCE = 0.4;
/** 이보다 짧으면 선으로 세지 않는다(점·모서리) */
const MIN_LINE_LENGTH = 2;
/** 이보다 납작한 채워진 사각형은 선으로 그린 것으로 본다 */
const THIN_RECT_HEIGHT = 2;

/** pdf.js가 준 경로 데이터를 점 목록으로 푼다 */
interface PathPoint {
  x: number;
  y: number;
  /** 곡선으로 도달한 점인가. 곡선의 끝점끼리는 직선으로 잇지 않는다 */
  curved: boolean;
  /** 새 서브패스의 시작인가 */
  moved: boolean;
}

function decodePath(data: ArrayLike<number>): PathPoint[] {
  const points: PathPoint[] = [];
  let i = 0;
  while (i < data.length) {
    const op = data[i];
    i += 1;
    if (op === 0 || op === 1) {
      points.push({ x: data[i] ?? 0, y: data[i + 1] ?? 0, curved: false, moved: op === 0 });
      i += 2;
    } else if (op === 2) {
      points.push({ x: data[i + 4] ?? 0, y: data[i + 5] ?? 0, curved: true, moved: false });
      i += 6;
    } else if (op === 3) {
      points.push({ x: data[i + 2] ?? 0, y: data[i + 3] ?? 0, curved: true, moved: false });
      i += 4;
    } else if (op === 4) {
      const start = [...points].reverse().find((point) => point.moved);
      if (start !== undefined) {
        points.push({ x: start.x, y: start.y, curved: false, moved: false });
      }
    } else {
      // 모르는 연산자를 만나면 이 경로는 더 읽지 않는다. 잘못 읽은 좌표로
      // 말소선을 만드느니 이 경로를 통째로 버리는 쪽이 낫다.
      return [];
    }
  }
  return points;
}

const STROKE_OPS = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke]);
const FILL_OPS = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke]);

/** 경로 하나에서 수평선을 뽑는다 */
function linesOf(pathOp: number, points: readonly PathPoint[], ctm: Matrix): DeungiRule[] {
  const lines: DeungiRule[] = [];

  if (STROKE_OPS.has(pathOp)) {
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      if (from === undefined || to === undefined) continue;
      if (to.moved || to.curved || from.curved) continue;
      const y0 = applyY(ctm, from.x, from.y);
      const y1 = applyY(ctm, to.x, to.y);
      if (Math.abs(y1 - y0) > HORIZONTAL_TOLERANCE) continue;
      const x0 = applyX(ctm, from.x, from.y);
      const x1 = applyX(ctm, to.x, to.y);
      if (Math.abs(x1 - x0) < MIN_LINE_LENGTH) continue;
      lines.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y: (y0 + y1) / 2 });
    }
  }

  // 얇은 사각형을 채워서 선처럼 쓰는 문서가 있다. 그것도 말소선일 수 있다.
  if (FILL_OPS.has(pathOp) && points.length > 0) {
    const xs = points.map((point) => applyX(ctm, point.x, point.y));
    const ys = points.map((point) => applyY(ctm, point.x, point.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxY - minY <= THIN_RECT_HEIGHT && maxX - minX >= MIN_LINE_LENGTH) {
      lines.push({ x0: minX, x1: maxX, y: (minY + maxY) / 2 });
    }
  }

  return lines;
}

/** 이 쪽의 수평선을 모두 모은다 */
function rulesOfPage(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): DeungiRule[] {
  const lines: DeungiRule[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;

  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const args = argsArray[i];
      if (Array.isArray(args) && args.length >= 6) {
        ctm = multiply(args.slice(0, 6) as unknown as Matrix, ctm);
      }
    } else if (fn === OPS.constructPath) {
      const args = argsArray[i];
      if (!Array.isArray(args)) continue;
      const pathOp = args[0];
      const data = Array.isArray(args[1]) ? args[1][0] : undefined;
      if (typeof pathOp !== "number" || data === null || data === undefined) continue;
      const buffer = data as ArrayLike<number>;
      if (typeof buffer.length !== "number") continue;
      lines.push(...linesOf(pathOp, decodePath(buffer), ctm));
    }
  }

  return lines;
}

/**
 * PDF 바이트에서 쪽마다 글자·좌표·수평선을 뽑는다.
 *
 * 읽지 못하면 던지지 않고 **빈 배열**을 돌려준다. 부르는 쪽
 * (`readDeungi`)이 빈 결과를 "모름"으로 다루므로, 실패가 조용한 통과가
 * 되지 않는다.
 */
export async function readPdfGeometry(bytes: Uint8Array): Promise<DeungiPageGeometry[]> {
  const task = getDocument({
    // URL이 아니라 바이트로만 넘긴다. pdf.js가 네트워크로 가는 경로는
    // URL을 줬을 때뿐이다.
    data: bytes,
    // 글자만 필요하다. 폰트를 화면에 얹을 일이 없다.
    disableFontFace: true,
    useSystemFonts: false,
  });

  try {
    const doc = await task.promise;
    const pages: DeungiPageGeometry[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      // 쪽은 순서대로 읽는다. 한 번에 다 열면 큰 문서에서 메모리가 튄다.
      // eslint-disable-next-line no-await-in-loop
      pages.push(await readPage(doc, number));
    }
    return pages;
  } catch {
    return [];
  } finally {
    await task.destroy();
  }
}

async function readPage(
  doc: Awaited<ReturnType<typeof getDocument>["promise"]>,
  number: number,
): Promise<DeungiPageGeometry> {
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const operators = await page.getOperatorList();

  const pieces: DeungiTextPiece[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const transform = item.transform;
    const x = transform[4] ?? 0;
    const baselineY = transform[5] ?? 0;
    const height = item.height > 0 ? item.height : Math.abs(transform[3] ?? 0);
    pieces.push({
      text: item.str,
      x,
      endX: x + item.width,
      baselineY,
      height: height > 0 ? height : 1,
    });
  }

  return {
    pageNumber: number,
    width: viewport.width,
    height: viewport.height,
    rotated: page.rotate % 360 !== 0,
    pieces,
    rules: rulesOfPage(operators.fnArray, operators.argsArray),
  };
}
