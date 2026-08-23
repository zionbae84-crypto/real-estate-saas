import { formatWon } from "../format/won";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";
import { rules } from "../state/useAffordability";

export interface CostBreakdownProps {
  costs: CostBreakdownData;
}

type CostKey = keyof Omit<CostBreakdownData, "total">;

interface RowMeta {
  label: string;
  /** 라벨 아래에 덧붙일 짧은 설명(추정치 안내 등) */
  note?: string;
}

/**
 * 항목별 표시 정보. `Record<CostKey, RowMeta>`로 타입을 걸어 뒀으므로,
 * CostBreakdown에 필드가 하나 늘면 컴파일러가 여기도 채우라고 강제한다.
 * 예전에는 배열(Row[])이라 새 필드를 깜빡 빠뜨려도 조용히 통과했다 —
 * 이 브랜치에서 두 필드(brokerageVat, housingBondCost)를 추가하면서
 * 두 번 다 그 실수를 할 뻔했다.
 */
const ROW_META: Record<CostKey, RowMeta> = {
  acquisitionTax: {
    label: "취득세 (지방교육세·농특세 포함)",
    // 이 계산은 무주택 기준이다 — `calcAcquisitionCosts`(acquisition-cost.ts)는
    // 취득자의 주택 수를 읽지 않는다. 문구는 `rules/2026-08.json`의
    // `acquisitionTax.householdCountNote`에서 그대로 온다(코드에 박지
    // 않는다) — `rules.ts`의 `parseRules`가 이 문구의 방향(부대비용이
    // 이보다 커질 수 있다는 방향이어야 함)을 강제한다.
    note: rules.acquisitionTax.householdCountNote,
  },
  brokerageFee: { label: "중개보수" },
  brokerageVat: { label: "중개보수 부가세 (10%)" },
  legalFee: { label: "법무사 비용" },
  movingCost: { label: "이사 비용" },
  housingBondCost: {
    label: "국민주택채권 매입 손실 (추정)",
    // 시가표준액 비율과 할인율은 검증되지 않은 가정치다(단지·연도별로
    // 다르고, 할인율은 매일 변동한다). 구간표만 확정된 값이므로, 취득세와
    // 같은 확신으로 이 숫자를 제시하면 안 된다 — 화면에서도 밝힌다.
    note: "시가표준액 비율·할인율이 확정 값이 아니라 실제와 다를 수 있는 추정치예요.",
  },
};

/**
 * 화면에 보여줄 순서. ROW_META가 이미 완전성(모든 필드가 있는지)을
 * 타입으로 강제하므로, 여기서는 순서만 자유롭게 정할 수 있다 — 항목을
 * 빠뜨려도 ROW_META 쪽에서 먼저 컴파일 에러가 난다.
 */
const ROW_ORDER: readonly CostKey[] = [
  "acquisitionTax",
  "brokerageFee",
  "brokerageVat",
  "legalFee",
  "movingCost",
  "housingBondCost",
];

export function CostBreakdown({ costs }: CostBreakdownProps) {
  return (
    <details className="cost-breakdown">
      <summary>
        부대비용 <span className="cost-total">{formatWon(costs.total)}</span>
      </summary>
      <dl>
        {ROW_ORDER.map((key) => {
          const { label, note } = ROW_META[key];
          return (
            <div key={key}>
              <dt>
                {label}
                {note !== undefined && <p className="hint">{note}</p>}
              </dt>
              <dd>{formatWon(costs[key])}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
