import { formatWon } from "../format/won";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import type { SafetyLevel } from "../lib/finance";

/** 한 번에 보여주는 최대 행 수 */
const PAGE_SIZE = 20;

const LEVEL_LABELS: Record<SafetyLevel, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
};

export interface ComplexListProps {
  result: ComplexListResult;
  /** 데이터 기준일(YYYY-MM) */
  dataAsOf: string;
  /** 지역 필터가 걸려 있는가 — 0개 안내 문구를 고르는 데 쓴다 */
  hasRegionFilter: boolean;
  /** 상환 능력(DSR) 자체가 0인가 */
  noRepaymentCapacity: boolean;
  /** 더 보기로 늘린 행 수. 기본은 PAGE_SIZE */
  visibleCount?: number;
  onShowMore?: () => void;
}

/**
 * 예산에 맞는 단지 목록.
 *
 * **시세를 범위와 거래 건수로만 말한다.** 중위값 하나를 "이 단지 시세"로
 * 내놓지 않는다 — 부모 스펙 §12가 "특정 단지의 적정가를 단정하지 않는다"고
 * 못박았고(감정평가법 저촉 회피), 그 결정이 저신뢰 69.6% 문제도 함께 푼다.
 * 거래가 1건이면 범위가 저절로 점이 되고 그 옆의 "거래 1건"이 근거를
 * 그대로 드러낸다.
 *
 * **변동률을 내지 않는다.** 사실 서술이지만 투자 판단 재료로 읽힌다
 * (같은 조항의 "수익률 예측 금지").
 *
 * 목록을 안전선에서 두 덩어리로 가른다. 어디까지가 무리 없는지를 배지
 * 하나가 아니라 목록 구조가 말한다.
 */
export function ComplexList({
  result,
  dataAsOf,
  hasRegionFilter,
  noRepaymentCapacity,
  visibleCount = PAGE_SIZE,
  onShowMore,
}: ComplexListProps) {
  const total = result.withinSafe.length + result.beyondSafe.length;

  if (total === 0) {
    return (
      <section className="complex-list" aria-label="살 수 있는 단지">
        <h2>살 수 있는 단지</h2>
        <EmptyMessage
          emptyBecauseOfFilter={result.emptyBecauseOfFilter}
          hasRegionFilter={hasRegionFilter}
          noRepaymentCapacity={noRepaymentCapacity}
        />
        <Freshness dataAsOf={dataAsOf} />
      </section>
    );
  }

  // 두 덩어리를 합쳐 세므로 "더 보기"가 덩어리 경계에서 어색해지지 않는다.
  const safeShown = result.withinSafe.slice(0, visibleCount);
  const beyondBudget = Math.max(0, visibleCount - result.withinSafe.length);
  const beyondShown = result.beyondSafe.slice(0, beyondBudget);
  const remaining = total - safeShown.length - beyondShown.length;

  return (
    <section className="complex-list" aria-label="살 수 있는 단지">
      <h2>살 수 있는 단지</h2>

      {safeShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--safe">무리 없이 살 수 있어요</h3>
          <ul className="complex-rows">
            {safeShown.map((e) => (
              <ComplexRow key={e.unit.complexKey} entry={e} />
            ))}
          </ul>
        </>
      )}

      {beyondShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--beyond">살 수는 있지만 부담이 커요</h3>
          <ul className="complex-rows">
            {beyondShown.map((e) => (
              <ComplexRow key={e.unit.complexKey} entry={e} />
            ))}
          </ul>
        </>
      )}

      {remaining > 0 && onShowMore !== undefined && (
        <button type="button" className="complex-more" onClick={onShowMore}>
          {remaining}개 더 보기
        </button>
      )}

      <Freshness dataAsOf={dataAsOf} />
    </section>
  );
}

function ComplexRow({ entry }: { entry: ComplexListEntry }) {
  const { unit, burden, needsBuiltYear } = entry;
  const level = burden.safety.level;

  return (
    <li className="complex-row">
      <p className="complex-name">
        <strong>{unit.complexName}</strong> {unit.areaBucket}㎡ · {unit.legalDongName}
        {needsBuiltYear && <span className="complex-built"> · {unit.builtYear}년 준공</span>}
      </p>
      <p className="complex-range">
        {formatWon(unit.minPrice)} ~ {formatWon(unit.maxPrice)}
        <span className="complex-trades"> · 최근 1년 거래 {unit.tradeCount}건</span>
      </p>
      <p className="complex-burden" data-level={level}>
        범위 위쪽인 {formatWon(unit.maxPrice)}에 산다면 월{" "}
        {formatWon(burden.safety.monthlyPayment)} · 부담률{" "}
        {(burden.safety.burdenRatio * 100).toFixed(0)}%{" "}
        <span className="complex-level">{LEVEL_LABELS[level]}</span>
      </p>
    </li>
  );
}

function EmptyMessage({
  emptyBecauseOfFilter,
  hasRegionFilter,
  noRepaymentCapacity,
}: {
  emptyBecauseOfFilter: boolean;
  hasRegionFilter: boolean;
  noRepaymentCapacity: boolean;
}) {
  // "지역을 넓혀 보라"는 필터가 원인일 때만 말한다. 전체 지역에서도
  // 0개인데 지역을 넓히라고 하면 거짓말이다.
  if (emptyBecauseOfFilter && hasRegionFilter) {
    return (
      <p className="complex-empty">
        고른 지역에는 살 수 있는 단지가 없어요. 지역을 넓혀 보세요.
      </p>
    );
  }

  if (noRepaymentCapacity) {
    return (
      <p className="complex-empty">
        소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어 살 수 있는
        단지가 없어요. 기존 부채를 줄이면 한도가 늘어나요.
      </p>
    );
  }

  return (
    <p className="complex-empty">
      지금 예산으로 살 수 있는 단지가 이 데이터에는 없어요. 현금이 더
      있으면 선택지가 생겨요.
    </p>
  );
}

function Freshness({ dataAsOf }: { dataAsOf: string }) {
  return (
    <p className="complex-freshness">
      {dataAsOf} 계약분까지 반영했어요. 실거래 신고가 한 달쯤 늦어서 최근
      달은 거래가 실제보다 적게 잡혀요.
    </p>
  );
}
