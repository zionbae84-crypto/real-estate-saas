import type { ComplexUnit } from "../data/complexes";
import { formatWon } from "../format/won";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import type { SafetyLevel } from "../lib/finance";

/**
 * 각 덩어리에서 한 번에 보여주는 최대 행 수.
 *
 * 두 덩어리를 합쳐 세지 않고 **각각** 자른다. 합쳐 세면 안전 덩어리가
 * 길 때 두 번째 덩어리가 화면 밖으로 밀려나고, 그러면 "선이 어디에
 * 있는가"라는 이 화면의 요점이 보이지 않는다 — 실제로 안전 82개·부담
 * 7개인 프로필에서 두 번째 헤더가 아예 안 나왔다.
 */
const PAGE_SIZE = 10;

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
  /**
   * 있으면 각 행이 눌러서 상세(상환 시뮬레이션)를 열 수 있는 버튼이
   * 된다. 없으면(App.tsx 밖에서 이 컴포넌트만 렌더링하는 기존
   * 테스트처럼) 행은 그냥 텍스트다 — 누를 곳이 없는데 버튼처럼
   * 보이면 그 자체가 거짓말이다(AssumptionLine의 같은 원칙).
   */
  onSelect?: (unit: ComplexUnit) => void;
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
  onSelect,
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

  const safeShown = result.withinSafe.slice(0, visibleCount);
  const beyondShown = result.beyondSafe.slice(0, visibleCount);
  const remaining = total - safeShown.length - beyondShown.length;

  return (
    <section className="complex-list" aria-label="살 수 있는 단지">
      <h2>살 수 있는 단지</h2>
      <BasisNote />

      {safeShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--safe">무리 없이 살 수 있어요</h3>
          <ul className="complex-rows">
            {safeShown.map((e) => (
              <ComplexRow key={unitKey(e.unit)} entry={e} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}

      {beyondShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--beyond">살 수는 있지만 부담이 커요</h3>
          <ul className="complex-rows">
            {beyondShown.map((e) => (
              <ComplexRow key={unitKey(e.unit)} entry={e} onSelect={onSelect} />
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

/**
 * 행의 React 키.
 *
 * `complexKey`는 **단지** 키라 평형별로 중복된다 — 한 단지에 25㎡와 28㎡가
 * 있으면 두 행의 키가 같아지고, React가 행을 중복하거나 누락시킬 수 있다.
 * 평형까지 넣어야 유일하다.
 */
function unitKey(unit: ComplexUnit): string {
  return `${unit.complexKey}|${unit.areaBucket}`;
}

function ComplexRow({
  entry,
  onSelect,
}: {
  entry: ComplexListEntry;
  onSelect?: (unit: ComplexUnit) => void;
}) {
  const { unit, burden, needsBuiltYear } = entry;
  const level = burden.safety.level;

  // 각 줄은 <p>가 아니라 <span>이다. onSelect가 있으면 이 마크업이
  // 그대로 <button> 안으로 들어가는데, button의 콘텐츠 모델은
  // phrasing content라 <p>는 유효하지 않다. 블록 모양과 여백은
  // styles.css가 그대로 유지한다 — 마크업만 바뀌고 화면은 같다.
  const rows = (
    <>
      <span className="complex-name">
        <strong>{unit.complexName}</strong> {unit.areaBucket}㎡ · {unit.legalDongName}
        {needsBuiltYear && <span className="complex-built"> · {unit.builtYear}년 준공</span>}
      </span>
      <span className="complex-range">
        {formatRange(unit.minPrice, unit.maxPrice)}
        <span className="complex-trades"> · 최근 1년 거래 {unit.tradeCount}건</span>
      </span>
      <span className="complex-burden" data-level={level}>
        범위 위쪽인 {formatWon(unit.maxPrice)}에 산다면{" "}
        {burden.neededLoan === 0 ? (
          // 현금만으로 덮이는 가격이다. "월 0원 · 부담률 0%"만 보여주면
          // 계산이 안 된 것처럼 읽힌다 — 왜 0인지를 말한다.
          <>
            <span className="complex-no-loan">대출 없이 살 수 있어요</span>{" "}
            <span className="complex-level">{LEVEL_LABELS[level]}</span>
          </>
        ) : (
          <>
            월 {formatWon(burden.safety.monthlyPayment)} · 부담률{" "}
            {(burden.safety.burdenRatio * 100).toFixed(0)}%{" "}
            <span className="complex-level">{LEVEL_LABELS[level]}</span>
          </>
        )}
      </span>
    </>
  );

  if (onSelect === undefined) {
    return <li className="complex-row">{rows}</li>;
  }

  return (
    <li className="complex-row">
      <button
        type="button"
        className="complex-row-button"
        onClick={() => onSelect(unit)}
      >
        {rows}
      </button>
    </li>
  );
}

/**
 * 가격 범위 문구.
 *
 * 거래가 하나뿐이거나 값이 모두 같으면 범위가 한 점으로 모인다. 같은
 * 숫자를 두 번 읽히게 하지 않는다 — 거래 건수가 그 숫자의 근거를 이미
 * 말한다. 전체 평형의 절반이 거래 1건이라 이 경우가 드물지 않다.
 *
 * 표시 문자열로 비교한다. 원 단위로 비교해도 지금 데이터에서는 결과가
 * 같지만(`formatWon`은 반올림하지 않고 나머지를 그대로 쓴다), 사용자가
 * 보는 것은 숫자가 아니라 문자열이므로 판단 기준을 화면에 맞춘다.
 */
export function formatRange(minPrice: number, maxPrice: number): string {
  const low = formatWon(minPrice);
  const high = formatWon(maxPrice);
  return low === high ? high : `${low} ~ ${high}`;
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

/**
 * 이 목록의 숫자가 어느 면적 기준인지 밝힌다.
 *
 * 헤드라인(실구매 가능 가격·안전선)은 아직 매물을 고르기 전이라
 * **가정한 전용면적**으로 계산되고, 목록의 각 행은 **그 평형의 실제
 * 면적**으로 계산된다. 행 쪽이 정확하지만, 둘이 다르면 85㎡ 이하
 * 행은 헤드라인보다 비싼 가격까지 통과한다(농특세가 붙지 않아
 * 부대비용이 적기 때문이다). 그런 행을 보고 사용자가 화면이 서로
 * 모순된다고 읽지 않게, 기준을 먼저 말한다. `ComplexDetail`에는 이미
 * 같은 안내가 있지만 목록 화면에는 없었다.
 */
function BasisNote() {
  return (
    <p className="complex-list-note">
      각 줄은 그 평형의 실제 전용면적으로 계산했어요. 위에 보이는
      실구매 가능 가격과 안전선은 가정한 면적 기준이라, 그보다 비싼 집이
      여기 보일 수 있어요. 이 목록 쪽이 더 정확해요.
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
