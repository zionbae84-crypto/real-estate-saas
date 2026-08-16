import type { BuyerProfile } from "./types";

export interface AvailableCash {
  /** 주택 구매에 투입 가능한 총 현금(원). 음수가 되지 않는다 */
  amount: number;
  /** 계산에서 빠진 항목에 대한 사용자 경고 */
  warnings: string[];
}

/**
 * 주택 구매에 실제로 투입 가능한 현금을 구한다.
 * 갈아타기는 기존 주택 순자산이 합산된다.
 *
 * 양도세는 보유·거주 기간, 조정지역, 일시적 2주택 등 변수가 과다해
 * 자동 계산하지 않는다. 사용자가 입력하지 않으면 경고로 알린다.
 */
export function calcAvailableCash(profile: BuyerProfile): AvailableCash {
  const warnings: string[] = [];

  if (profile.status !== "갈아타기") {
    return { amount: Math.max(0, Math.floor(profile.cash)), warnings };
  }

  const home = profile.existingHome;
  if (!home) {
    warnings.push("기존 주택 정보가 없어 매도 대금이 반영되지 않았습니다.");
    return { amount: Math.max(0, Math.floor(profile.cash)), warnings };
  }

  if (home.capitalGainsTax === undefined) {
    warnings.push(
      "양도세가 반영되지 않았습니다. 실제 가용 자금은 이보다 적을 수 있습니다.",
    );
  }

  const netEquity =
    home.expectedSalePrice - home.remainingLoan - (home.capitalGainsTax ?? 0);

  return {
    amount: Math.max(0, Math.floor(profile.cash + netEquity)),
    warnings,
  };
}
