import { formatWon } from "../format/won";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";

export interface CostBreakdownProps {
  costs: CostBreakdownData;
}

const ROWS: Array<[keyof Omit<CostBreakdownData, "total">, string]> = [
  ["acquisitionTax", "취득세 (지방교육세·농특세 포함)"],
  ["brokerageFee", "중개보수"],
  ["legalFee", "법무사 비용"],
  ["movingCost", "이사 비용"],
];

export function CostBreakdown({ costs }: CostBreakdownProps) {
  return (
    <details className="cost-breakdown">
      <summary>
        부대비용 <span className="cost-total">{formatWon(costs.total)}</span>
      </summary>
      <dl>
        {ROWS.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{formatWon(costs[key])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
