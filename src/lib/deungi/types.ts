/**
 * 등기사항전부증명서 PDF를 읽어 권리분석 문진의 입력으로 바꾸는 파서의 타입.
 *
 * 이 파서가 지키는 단 하나의 원칙: **못 읽은 것은 "없음"이 아니라
 * "모름"이다.** 파싱 실패·형식 불일치·본문과 요약의 대조 불일치는 전부
 * 모름이고, 모름은 문진 엔진에서 "전문가 확인이 꼭 필요해요"로 이어진다.
 * 빈 결과가 "걸리는 게 없는 등기부"로 읽히는 것이 이 제품이 가장 피해야
 * 하는 실패다.
 */

/** PDF 한 쪽에서 뽑아낸 글자 조각 하나. 좌표는 PDF 사용자 공간(왼쪽 아래가 원점) */
export interface DeungiTextPiece {
  text: string;
  /** 글자 상자의 왼쪽 x */
  x: number;
  /** 글자 상자의 오른쪽 x */
  endX: number;
  /** 글자의 기준선(baseline) y */
  baselineY: number;
  /** 글자 높이(대략 글자 크기) */
  height: number;
}

/**
 * 수평선 하나.
 *
 * 표 괘선과 말소선을 아직 가르지 않은 날것이다. 가르는 일은
 * `layout.ts`가 한다 — **말소선을 놓치면 말소된 근저당이 살아 있는
 * 것으로 합계에 들어간다.**
 */
export interface DeungiRule {
  x0: number;
  x1: number;
  y: number;
}

export interface DeungiPageGeometry {
  pageNumber: number;
  width: number;
  height: number;
  /** 회전된 쪽이면 좌표 가정이 깨진다. 그때는 읽기를 멈춘다 */
  rotated: boolean;
  pieces: DeungiTextPiece[];
  rules: DeungiRule[];
}

/** 등기부의 어느 구(區)에서 온 항목인가 */
export type DeungiSection = "표제부" | "갑구" | "을구" | "요약";

/**
 * 등기목적을 우리가 다루는 갈래로 옮긴 것.
 *
 * `기타`는 "우리가 이름을 붙이지 못한 항목"이다 — 말소기록·변경·이전처럼
 * 금액을 만들지 않는 줄이 여기로 온다.
 */
export type DeungiEntryKind =
  | "근저당권"
  | "전세권"
  | "임차권"
  | "지상권"
  | "압류"
  | "가압류"
  | "가처분"
  | "가등기"
  | "경매개시결정"
  | "신탁"
  | "소유권"
  | "기타";

/** 본문(갑구·을구)에서 읽어낸 항목 하나. 화면이 사람에게 그대로 보여 줄 수 있는 모양이다 */
export interface DeungiEntry {
  section: "갑구" | "을구";
  /** 순위번호. 부기등기면 "3-1"처럼 온다 */
  rank: string;
  /** 순위번호의 주(主) 번호. 부기등기 "3-1"은 "3"으로 묶인다 */
  mainRank: string;
  /** 등기목적 원문 */
  purpose: string;
  kind: DeungiEntryKind;
  /** 채권최고액·전세금·임차보증금(원). 못 읽었으면 null — 0원이 아니다 */
  amountWon: number | null;
  /** 권리자 이름. **판정에 쓰지 않는다** — 사람이 대조할 때만 쓰는 값이다 */
  holder: string | null;
  /** 가로줄이 그어진(말소된) 항목인가 */
  struck: boolean;
  /** 한 항목 안에서 줄이 그어진 칸과 아닌 칸이 섞여 있는가 */
  strikeAmbiguous: boolean;
  /** 사람이 대조할 수 있게 남기는 원문 */
  text: string;
}

/** 요약의 「1. 소유지분현황」 한 줄 */
export interface DeungiOwner {
  name: string;
  /** 최종지분 원문(예: "단독소유", "2분의 1") */
  share: string | null;
  rank: string | null;
}

/** 요약의 「2. …소유권에 관한 사항」·「3. (근)저당권 및 전세권 등」 한 줄 */
export interface DeungiSummaryRow {
  /** 2번 항목은 갑구, 3번 항목은 을구에서 온다 */
  section: "갑구" | "을구";
  rank: string;
  mainRank: string;
  purpose: string;
  kind: DeungiEntryKind;
  amountWon: number | null;
  text: string;
}

/** 머리말에서 읽어낸 부동산의 표시 */
export interface DeungiAddress {
  /** `[집합건물]` 뒤의 줄 전체. 사람이 매물과 맞춰 보는 기준이다 */
  raw: string;
  /** 시·도부터 지번까지(예: "경기도 파주시 금촌동 329-158외 2필지") */
  lot: string | null;
  /** 건물 이름(예: "엠에이치타워") */
  buildingName: string | null;
  /** 동(예: "제6층" 앞에 동이 있으면 "제101동") */
  dong: string | null;
  /** 호(예: "제605호") */
  ho: string | null;
}

export type DeungiPurpose = "read" | "issued" | "unknown";

export interface DeungiHeader {
  /** 집합건물·건물·토지 중 무엇인가. 못 읽었으면 null */
  propertyKind: "집합건물" | "건물" | "토지" | null;
  /** 말소사항 포함으로 뗀 것인가. 못 읽었으면 null */
  withCancelled: boolean | null;
  /** 열람용인가 발급용인가 */
  purpose: DeungiPurpose;
  /** 열람일시 원문(예: "2026년08월20일 13시36분53초"). 못 읽었으면 null */
  issuedAt: string | null;
  /** 같은 시각을 기계가 견줄 수 있는 모양으로(예: "2026-08-20T13:36:53") */
  issuedAtIso: string | null;
  uniqueNumber: string | null;
  address: DeungiAddress | null;
}

/** 룰셋에 문구가 있는 문제 하나 */
export interface DeungiProblem {
  id: DeungiProblemId;
  label: string;
  note: string;
  severity: "block" | "warn";
}

export const DEUNGI_PROBLEM_IDS = [
  "notDeungi",
  "noText",
  "rotatedPage",
  "summaryMissing",
  "crossCheckMismatch",
  "partialStrike",
  "amountUnreadable",
  "currentOnly",
  "notCollective",
] as const;

export type DeungiProblemId = (typeof DEUNGI_PROBLEM_IDS)[number];

export type DeungiCrossCheck = "agreed" | "mismatch" | "unavailable";

/** 금액 합계 하나. `won`이 null이면 **모름이지 0원이 아니다** */
export interface DeungiTotal {
  won: number | null;
  /** 합계에 들어간 항목 수. 모름이면 null */
  count: number | null;
}
