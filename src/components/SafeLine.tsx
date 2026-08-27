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
 * 최대 가격과 "무리 없는 선"을 **표 한 장**으로 요약한다(사용자 지시:
 * "최대 가격까지 부담률이 안전 범위 안에 있어요"는 값이 없는 문장이니
 * 실구매가능 산정 내용을 표로 보여 달라).
 *
 * 이 제품이 다른 계산기와 갈리는 지점을 화면에 드러내는 자리다 — 다른
 * 앱은 최대치에서 멈추고 그 숫자를 크게 보여주지만, 이 컴포넌트는 그
 * 옆에 안전선을 **동등한 무게**(같은 표의 두 행)로 둔다.
 *
 * 예전에는 세 경우(없음·같음·다름)가 각각 다른 마크업(문장 하나 / 문장
 * 하나 / 두 상자)이었다. 지금은 **항상 같은 두 행짜리 표**다 — "최대
 * 가격"·"무리 없는 선"이 항상 함께 보이고, 값이 없으면 그 이유를 행
 * 아래 짧은 안내(`.hint`)로 붙인다. 값이 최대 가격과 같으면 같은
 * 8자리 숫자를 두 번 찍는 대신 값 칸에 그 관계를 직접 말한다("최대
 * 가격과 같아요") — 바로 위 헤드라인이 이미 그 숫자를 보여준 뒤라
 * 세 번째 반복은 만들지 않는다. 문장으로 갈음하던 자리를 표로 바꿨을
 * 뿐 원인 판단(`noRepaymentCapacity`)은 그대로다 — 소득·부채 문제인지,
 * 그 외 이유인지를 여전히 갈라 말한다(리뷰 수정 Important 2).
 */
export function SafeLine({
  affordablePrice,
  safePrice,
  noRepaymentCapacity,
}: SafeLineProps) {
  const hasSafePrice = safePrice !== null && safePrice !== 0;

  let safeModifier: string;
  let safeValueText: string;
  let safeNote: string | undefined;

  if (!hasSafePrice) {
    // `null`은 "안전한 가격이 하나도 없음", `0`은 "0원 자체가 안전
    // 최대치로 검증됨"이라는 별개의 뜻이지만(calcSafePrice 문서 참고),
    // 화면에 "0원"을 그대로 내밀면 두 경우 모두 "0원까지는 안전합니다"로
    // 읽혀 도움이 되지 않는다 — **0원을 결과로 내미는 것은 정보가
    // 아니라 조롱이다.** 그래서 숫자 대신 "없음"과 이유를 함께 낸다.
    safeModifier = "safe-line-item--none";
    safeValueText = "없음";
    safeNote = noRepaymentCapacity
      ? "소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어 무리 없는 가격대가 없어요."
      : "지금 조건으론 무리 없는 가격대가 없어요.";
  } else if (safePrice === affordablePrice) {
    // 최대 가격 자체가 이미 안전 범위 안에 있다는 뜻이다. 같은 8자리
    // 숫자를 두 줄에 그대로 반복하면 눈으로 다시 대조해야 같다는 걸
    // 알 수 있다 — 대신 값 칸에 관계를 직접 말해 한눈에 읽히게 한다
    // (바로 위 헤드라인이 이미 그 숫자를 보여줬으므로 세 번째 반복은
    // 만들지 않는다).
    safeModifier = "safe-line-item--safe";
    safeValueText = "최대 가격과 같아요";
    safeNote = undefined;
  } else {
    safeModifier = "safe-line-item--safe";
    safeValueText = formatWon(safePrice);
    safeNote = undefined;
  }

  return (
    <dl className="safe-line safe-line-table">
      <div className="safe-line-item safe-line-item--max">
        <dt className="safe-line-label">최대 가격</dt>
        <dd className="safe-line-amount">{formatWon(affordablePrice)}</dd>
      </div>
      <div className={`safe-line-item ${safeModifier}`}>
        <dt className="safe-line-label">
          무리 없는 선
          {safeNote !== undefined && <p className="hint">{safeNote}</p>}
        </dt>
        <dd className="safe-line-amount">{safeValueText}</dd>
      </div>
    </dl>
  );
}
