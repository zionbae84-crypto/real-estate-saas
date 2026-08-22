import type { RawTrade } from "./types";

export interface NormalizedTrade extends RawTrade {
  complexKey: string;
}

/**
 * 단지명 최소 정규화.
 *
 * 공백·특수문자를 없애고 대소문자를 통일하는 것까지만 한다.
 * **차수("1차")·단지 번호("1단지")·"아파트" 접미사는 건드리지 않는다** —
 * "우성1차"와 "우성2차"는 실제로 다른 단지이고, 접미사를 떼면 조용히 합쳐진다.
 *
 * 기본값이 "안 합침"이므로 틀리는 방향이 안전하다. 합쳤어야 할 것을 못 합친 경우는
 * 이상 신호 리포트의 "과소병합 후보"가 잡아 사람이 확인하게 한다.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\-_.()[\]{},'"·]/g, "");
}

/** 법정동 + 건축년도 + 정규화명. 셋이 모두 같아야 같은 단지로 본다. */
export function buildComplexKey(trade: RawTrade): string {
  return [
    trade.regionCode,
    trade.legalDongName,
    trade.builtYear,
    normalizeName(trade.complexName),
  ].join("|");
}

export function normalizeAll(trades: RawTrade[]): NormalizedTrade[] {
  return trades.map((trade) => ({ ...trade, complexKey: buildComplexKey(trade) }));
}
