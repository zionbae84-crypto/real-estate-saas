import { noLoanCaveat } from "../lib/burden-grade";
import { landLeaseRules } from "../state/landLeaseRules";

export interface NoLoanLineProps {
  /** `ComplexUnit.landLeasehold` 값을 그대로 넘긴다 */
  landLeasehold: "Y" | "N" | null;
}

/**
 * 현금만으로 덮이는 가격이라는 표시.
 *
 * "월 0원 · 부담률 0%"만 보여주면 계산이 안 된 것처럼 읽혀서, 왜 0인지를
 * 말한다. 그런데 이 말은 이 화면에서 가장 강한 안심 문구 중 하나다 —
 * **"매달 나가는 돈이 없다"로 읽힌다.**
 *
 * 토지임대부(또는 토지임대부인지 모르는) 집에서는 그 읽기가 틀린다.
 * 대출이 0원인 것은 사실이므로 문장을 지우지 않고, 대신 **같은 자리에서**
 * 단서가 함께 읽히게 한다. 화면 아래 각주로 밀면 읽히지 않고, 그러면
 * 이 줄만 남아 매달 나가는 돈이 없다고 말한다.
 *
 * 단서 문구는 룰셋에서 온다(`rules/land-lease-2026-08.json`의
 * `grade.noLoanNote`). 목록 행과 단지 상세가 이 컴포넌트 하나를 쓰므로
 * 두 화면이 다른 말을 할 수 없다.
 *
 * `<span>`인 이유는 `LandLeaseNote`와 같다 — 목록의 행은 `onSelect`가
 * 있으면 통째로 `<button>` 안으로 들어가고, `<button>`의 콘텐츠 모델은
 * phrasing content다.
 */
export function NoLoanLine({ landLeasehold }: NoLoanLineProps) {
  const caveat = noLoanCaveat(landLeasehold, landLeaseRules);

  return (
    <span className="complex-no-loan" data-complete={caveat === null}>
      대출 없이 살 수 있어요
      {caveat !== null && (
        <span className="complex-no-loan-caveat"> — {caveat}</span>
      )}
    </span>
  );
}
