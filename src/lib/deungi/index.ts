/**
 * 등기사항전부증명서 PDF 파서의 공개 표면.
 *
 * `src/lib/rights`의 판정 엔진에 **입력만** 만들어 준다. 판정 규칙과
 * `rules/rights-2026-08.json`은 이 파서가 손대지 않는다.
 */
export { crossCheck } from "./crosscheck";
export type { CrossCheckOutcome } from "./crosscheck";
export { compact, isStruck, strikeCandidates, toAllRows, toRows } from "./layout";
export type { DeungiRow } from "./layout";
export { readPdfGeometry } from "./pdf";
export { COVERED_ITEM_IDS, LEFT_TO_USER, parseDeungiPdf, readDeungi } from "./parse";
export type { DeungiReading } from "./parse";
export {
  classifyPurpose,
  mainRankOf,
  parseWon,
  readAddress,
  readEntries,
  readHeader,
  readOwners,
  readSummaryRows,
  sectionRows,
} from "./read";
export { parseDeungiRules, problemOf } from "./rules";
export type { DeungiCopy, DeungiRules } from "./rules";
export type {
  DeungiAddress,
  DeungiCrossCheck,
  DeungiEntry,
  DeungiEntryKind,
  DeungiHeader,
  DeungiOwner,
  DeungiPageGeometry,
  DeungiProblem,
  DeungiProblemId,
  DeungiPurpose,
  DeungiRule,
  DeungiSummaryRow,
  DeungiTextPiece,
  DeungiTotal,
} from "./types";
