import type { ComplexUnit } from "../data/complexes";
import { formatWon } from "../format/won";
import type { BurdenAtPrice, CostBreakdown as CostBreakdownData } from "../lib/finance";
import { formatRange } from "./ComplexList";
import { CostBreakdown } from "./CostBreakdown";
import { SafetyBadge } from "./SafetyBadge";

export interface ComplexDetailProps {
  unit: ComplexUnit;
  /** `unit.maxPrice`에서의 부담. ComplexList와 같은 기준(범위 위쪽)이다 */
  burden: BurdenAtPrice;
  /** `unit.maxPrice`에서의 부대비용 내역 */
  costs: CostBreakdownData;
  onClose: () => void;
}

/**
 * 단지 상세: 고른 평형의 상환 시뮬레이션.
 *
 * **모든 계산은 `unit.maxPrice` 기준이다** — ComplexList와 같은 규칙(범위
 * 위쪽으로 재야 부담이 표시보다 커지지 않는 방향으로만 틀린다).
 *
 * `medianPrice`·변동률은 여기서도 내지 않는다. 부모 스펙 §12는 화면
 * 전체에 걸리는 제약이지 목록에만 걸리는 것이 아니다.
 *
 * 이 화면을 열면 호출부(App.tsx)가 프로필의 `exclusiveAreaSqm`을 이
 * 평형의 `areaBucket`으로 반영한다 — 그래서 위쪽 실구매 가능 가격도
 * 함께 움직인다. 그 사실을 사용자가 놀라지 않게 여기서 한 줄로
 * 알려준다.
 */
export function ComplexDetail({ unit, burden, costs, onClose }: ComplexDetailProps) {
  const level = burden.safety.level;

  return (
    <section className="complex-detail" aria-label="단지 상세">
      <button type="button" className="complex-detail-back" onClick={onClose}>
        ← 목록으로
      </button>

      <h2 className="complex-detail-title">
        {unit.complexName} {unit.areaBucket}㎡ · {unit.legalDongName}
      </h2>
      <p className="complex-detail-built">{unit.builtYear}년 준공</p>

      <p className="complex-detail-range">
        {formatRange(unit.minPrice, unit.maxPrice)}
        <span className="complex-trades"> · 최근 1년 거래 {unit.tradeCount}건</span>
      </p>

      <p className="complex-detail-area-note">
        이 평형의 전용면적({unit.areaBucket}㎡)을 반영해서 계산했어요. 그래서
        위쪽 실구매 가능 가격도 함께 바뀌었을 수 있어요.
      </p>

      <p className="complex-detail-loan" data-level={level}>
        범위 위쪽인 {formatWon(unit.maxPrice)}에 산다면{" "}
        {burden.neededLoan === 0 ? (
          <span className="complex-no-loan">대출 없이 살 수 있어요</span>
        ) : (
          <>
            필요 대출액은 <strong>{formatWon(burden.neededLoan)}</strong>이에요
          </>
        )}
      </p>

      <SafetyBadge safety={burden.safety} />

      <CostBreakdown costs={costs} />
    </section>
  );
}
