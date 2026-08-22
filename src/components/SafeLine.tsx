import { Text } from "@seed-design/react";
import { formatWon } from "../format/won";

export interface SafeLineProps {
  /** 실구매 가능 최대 매매가(원). `calcAffordablePrice`의 결과다. */
  affordablePrice: number;
  /**
   * 상환 부담이 안전 범위에 머무는 최대 매매가(원), 또는 그런 가격이
   * 하나도 없으면 `null`. `calcSafePrice`의 결과를 그대로 받는다 —
   * `null`과 `0`은 서로 다른 값이지만(그 함수 문서 참고) 이 컴포넌트가
   * 화면에 보여줄 문구는 둘 다 같다: 어느 쪽이든 제시할 안전한 가격이
   * 없다는 뜻이다.
   */
  safePrice: number | null;
  /**
   * 리뷰 수정(Important 2): 상환 능력(DSR) 자체가 0인지 —
   * 소득이 없거나 기존 부채가 이미 상환 한도를 채운 경우.
   * `BudgetResult`의 `ZeroBudgetMessage`와 같은 근거
   * (`result.loanLimit.breakdown.DSR === 0`)로 호출부가 판단해 전달한다.
   *
   * `safePrice`가 `null`(또는 `0`)이 되는 이유는 둘이다 — 소득이 없거나,
   * 기존 부채가 이미 상환 여력을 채웠거나. 이걸 구분하지 않고 "소득으로는
   * 무리 없이 살 수 있는 가격대가 없다"고 단정하면, 소득이 높고 부채가
   * 많은 사용자에게도 "소득이 없다"고 잘못 말하게 된다(리뷰어 브루트포스
   * 그리드 1,920개 중 1,304개, 68%가 이 경우였다). `breakdown.DSR`은
   * 가격에 의존하지 않으므로(calcDsrLimit이 price를 받지 않는다)
   * 이 값은 `affordablePrice`·`safePrice`가 무엇이든 그 프로필의 실제
   * 상환능력 상태를 그대로 반영한다 — 진단에 쓰기 안전한 근거다.
   */
  noRepaymentCapacity: boolean;
}

/**
 * 최대 가격 옆에 "무리 없는 선"을 나란히 놓는다.
 *
 * 이 제품이 다른 계산기와 갈리는 지점을 화면에 드러내는 자리다 — 다른
 * 앱은 최대치에서 멈추고 그 숫자를 크게 보여주지만, 이 컴포넌트는 그
 * 옆에 안전선을 **동등한 무게**로 둔다.
 *
 * 두 특수 케이스를 각각 다른 문장으로 처리한다.
 *
 * 1. `safePrice`가 `null`이거나 `0`이면 — 숫자 대신 문장으로 말한다.
 *    `null`은 `calcSafePrice`의 계약상 "안전한 가격이 하나도 없음"이고,
 *    `0`은 그 함수 문서대로 "0원 자체가 안전 최대치로 검증됨"이라는
 *    별개의 뜻이지만, 화면에 "0원"을 그대로 내밀면 두 경우 모두
 *    "0원까지는 안전합니다"처럼 읽혀 사용자에게 실질적으로 도움이 되는
 *    정보가 아니다 — 살 수 있는 게 없다는 뜻을 "0"이라는 계산 결과로
 *    포장하는 셈이다. **0원을 결과로 내미는 것은 정보가 아니라 조롱이다.**
 *    그래서 이 컴포넌트는 둘을 같은 문장으로 묶어 보여준다. 다만
 *    원인까지 하나로(소득 탓으로) 단정하지는 않는다 — `noRepaymentCapacity`로
 *    소득·부채 문제인지, 그 외의 이유(예: 스트레스 금리에서도 부담률이
 *    임계값을 못 넘음)인지를 갈라 말한다(리뷰 수정 Important 2).
 * 2. `safePrice === affordablePrice`(0이 아닌 경우)이면 — 최대 가격
 *    자체가 이미 안전 범위 안에 있다는 뜻이다. 같은 숫자를 두 번 나란히
 *    보여주면 사용자에게는 계산 오류처럼 보이므로, 한 줄로 합쳐 그
 *    사실을 직접 말한다.
 */
export function SafeLine({
  affordablePrice,
  safePrice,
  noRepaymentCapacity,
}: SafeLineProps) {
  if (safePrice === null || safePrice === 0) {
    return (
      <p className="safe-line safe-line--none">
        {noRepaymentCapacity
          ? "소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어 " +
            "무리 없이 살 수 있는 가격대가 없습니다."
          : "지금 조건으로는 무리 없이 살 수 있는 가격대가 없습니다."}
      </p>
    );
  }

  if (safePrice === affordablePrice) {
    return (
      <p className="safe-line safe-line--merged">
        최대 가격까지 부담률이 안전 범위 안에 있어요.
      </p>
    );
  }

  return (
    <div className="safe-line safe-line--split">
      <div className="safe-line-item safe-line-item--max">
        <span className="safe-line-label">최대 가격</span>
        <Text className="safe-line-amount">{formatWon(affordablePrice)}</Text>
      </div>
      <div className="safe-line-item safe-line-item--safe">
        <span className="safe-line-label">무리 없는 선</span>
        <Text className="safe-line-amount">{formatWon(safePrice)}</Text>
      </div>
    </div>
  );
}
