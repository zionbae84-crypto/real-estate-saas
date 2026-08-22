import { formatWon } from "../format/won";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";

export interface CostBreakdownProps {
  costs: CostBreakdownData;
}

interface Row {
  key: keyof Omit<CostBreakdownData, "total">;
  label: string;
  /** 라벨 아래에 덧붙일 짧은 설명(추정치 안내 등) */
  note?: string;
}

const ROWS: Row[] = [
  { key: "acquisitionTax", label: "취득세 (지방교육세·농특세 포함)" },
  { key: "brokerageFee", label: "중개보수" },
  { key: "brokerageVat", label: "중개보수 부가세 (10%)" },
  { key: "legalFee", label: "법무사 비용" },
  { key: "movingCost", label: "이사 비용" },
  {
    key: "housingBondCost",
    label: "국민주택채권 매입 손실 (추정)",
    // 시가표준액 비율과 할인율은 검증되지 않은 가정치다(단지·연도별로
    // 다르고, 할인율은 매일 변동한다). 구간표만 확정된 값이므로, 취득세와
    // 같은 확신으로 이 숫자를 제시하면 안 된다 — 화면에서도 밝힌다.
    note: "시가표준액 비율·할인율이 확정 값이 아니라 실제와 다를 수 있는 추정치입니다.",
  },
];

export function CostBreakdown({ costs }: CostBreakdownProps) {
  return (
    <details className="cost-breakdown">
      <summary>
        부대비용 <span className="cost-total">{formatWon(costs.total)}</span>
      </summary>
      <dl>
        {ROWS.map(({ key, label, note }) => (
          <div key={key}>
            <dt>
              {label}
              {note !== undefined && <p className="hint">{note}</p>}
            </dt>
            <dd>{formatWon(costs[key])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
