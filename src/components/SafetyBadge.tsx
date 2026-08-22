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
    </section>
  );
}

function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "소득 없음";
  return `${(ratio * 100).toFixed(1)}%`;
}
