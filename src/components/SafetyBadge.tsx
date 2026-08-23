import { formatWon } from "../format/won";
import type { SafetyLevel, SafetyScore } from "../lib/finance";

export interface SafetyBadgeProps {
  safety: SafetyScore;
}

const LABELS: Record<SafetyLevel, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
};

export function SafetyBadge({ safety }: SafetyBadgeProps) {
  return (
    <section className="safety-badge" data-level={safety.level}>
      <p className="safety-level">{LABELS[safety.level]}</p>

      <dl>
        <div>
          <dt>월 상환액</dt>
          <dd data-field="payment">{formatWon(safety.monthlyPayment)}</dd>
        </div>
        <div>
          <dt>소득 대비 상환부담률</dt>
          <dd data-field="ratio">{formatRatio(safety.burdenRatio)}</dd>
        </div>
      </dl>

      <p className="safety-stress">
        금리가 2%p 오르면 월{" "}
        <span className="stressed-payment">
          {formatWon(safety.stressedMonthlyPayment)}
        </span>
        , 부담률 {formatRatio(safety.stressedBurdenRatio)}
      </p>

      {safety.monthlyPayment === 0 && <ZeroPaymentNote safety={safety} />}
    </section>
  );
}

/**
 * 대출 없이 전액 현금으로 사는 경우(monthlyPayment === 0)를 설명한다.
 *
 * 엔진(safety.ts)은 소득이 0이면 burdenRatio를 Infinity로 돌려주고, 그
 * 값이 danger 임계값을 넘으므로 level은 "위험"이 된다 — 이것은 엔진의
 * 올바른 판단이며 이 컴포넌트는 절대 second-guess하지 않는다(level을
 * 재계산하거나 숨기지 않는다). 다만 화면만 보면 "월 상환액 0원"과
 * "위험" 배지가 나란히 있어 모순처럼 보인다. 실제로는 상환 부담이 큰
 * 것이 아니라 소득 정보 자체가 없어(또는 0이어서) 부담률을 계산할
 * 분모가 없다는 뜻이므로, 그 사실을 옆에 풀어 적어 준다.
 *
 * 소득이 0이 아닌데 우연히 상환액이 0인 경우(전액 현금 구매 + 실소득
 * 있음)는 burdenRatio가 유한(0)해 등급이 이미 "안전"으로 정확히
 * 나오므로, 등급 귀속에 대한 설명 없이 "대출이 없다"는 사실만 짚는다.
 */
function ZeroPaymentNote({ safety }: { safety: SafetyScore }) {
  if (!Number.isFinite(safety.burdenRatio)) {
    return (
      <p className="safety-note">
        대출 없이 전액 현금으로 사는 경우예요. 이 등급은 상환 부담이
        아니라 소득 정보가 없다는 사실을 반영해요.
      </p>
    );
  }

  return (
    <p className="safety-note">대출 없이 전액 현금으로 사는 경우예요.</p>
  );
}

function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "소득 없음";
  return `${(ratio * 100).toFixed(1)}%`;
}
