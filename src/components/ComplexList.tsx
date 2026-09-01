import { useEffect, useRef } from "react";
import { AGGREGATION_WINDOW_LABEL } from "../data/complexes";
import type { ComplexUnit } from "../data/complexes";
import { formatWon } from "../format/won";
import { burdenGrade } from "../lib/burden-grade";
import { burdenTierOf } from "../lib/complex-list";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import { landLeaseRules } from "../state/landLeaseRules";
import { LandLeaseNote } from "./LandLeaseNote";
import { NoLoanLine } from "./NoLoanLine";

/**
 * 각 덩어리에서 한 번에 보여주는 최대 행 수.
 *
 * 덩어리를 합쳐 세지 않고 **각각** 자른다. 합쳐 세면 안전 덩어리가
 * 길 때 뒤 덩어리가 화면 밖으로 밀려나고, 그러면 "선이 어디에
 * 있는가"라는 이 화면의 요점이 보이지 않는다 — 실제로 안전 82개·부담
 * 7개인 프로필에서 두 번째 헤더가 아예 안 나왔다. 덩어리가 셋이 된
 * 뒤에는 이 규칙이 더 중요해졌다: 가운데 덩어리("우리 숫자로는 …")가
 * 밀려나면 등급을 붙든 이유 자체가 화면에서 사라진다.
 */
const PAGE_SIZE = 10;

export interface ComplexListProps {
  result: ComplexListResult;
  /**
   * 이 목록이 반영한 가장 최근 계약월(YYYY-MM). **모르면 `null`이고,
   * 그때는 신선도 줄을 아예 그리지 않는다.**
   *
   * 이 줄은 "{dataAsOf} 계약분까지 반영했어요"라는 사실 서술이다.
   * 목록의 출처가 번들 데이터에서 "고른 지역을 그때 조회한 결과"로
   * 바뀐 뒤로는, 옛 배치 실행의 정적 기준일을 여기에 넣으면 이 조회에
   * 대해 확인한 적 없는 것을 말하게 된다 — 근거를 실제보다 튼튼해
   * 보이게 하는 쪽이라 이 앱이 가장 경계하는 오표기다. 모르면 말하지
   * 않는 것이 유일하게 정직한 처리다.
   */
  dataAsOf: string | null;
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
  /**
   * 지금 지도에서 고른 단지(`complexKey`). 그 단지의 행에 표시를 달고,
   * 값이 바뀌면 그 행을 목록 스크롤 안으로 끌어온다.
   *
   * **단지 키라 같은 단지의 평형 행이 여럿이면 전부 표시된다.** 마커는
   * 단지 하나에 하나이므로(ComplexMap의 `groupByComplex`) 그것이 정직한
   * 대응이다 — 평형 하나만 골라 표시하면 지도에서 누른 마커가 가리키는
   * 것보다 좁게 말하게 된다.
   *
   * 선택 상태는 여기서 만들지 않는다. `App.tsx`가 한 벌만 들고
   * (`focusedComplexKey`) 목록과 지도에 같은 값을 내려 준다 — 두 벌로
   * 관리하면 어긋난다(task-4-brief Step 4).
   */
  focusedComplexKey?: string | null;
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
 * 목록을 등급에서 세 덩어리로 가른다. 어디까지가 무리 없는지를 배지
 * 하나가 아니라 목록 구조가 말한다.
 *
 * 가운데 덩어리는 **우리가 다 재지 못한 행**이다(토지임대부이거나
 * 토지임대부인지 모르는 평형). "무리 없이 살 수 있어요"에 넣으면 우리가
 * 스스로 불완전하다고 인정한 숫자로 안심시키는 것이 되고, "부담이
 * 커요"에 넣으면 모르는 것을 아는 척하는 것이 된다 — 그래서 자기
 * 덩어리를 준다. 가르는 기준은 행 배지와 **같은 함수**다
 * (`lib/burden-grade.ts`의 `burdenGradeLevel`).
 */
export function ComplexList({
  result,
  dataAsOf,
  hasRegionFilter,
  noRepaymentCapacity,
  visibleCount = PAGE_SIZE,
  onShowMore,
  onSelect,
  focusedComplexKey = null,
}: ComplexListProps) {
  const sectionRef = useRef<HTMLElement>(null);

  /*
   * 지도에서 마커를 누르면 그 단지의 행이 사이드바 스크롤 밖에 있을 수
   * 있다 — 그때 목록은 아무 반응도 하지 않는 것처럼 보인다. 표시된 행을
   * 스크롤 안으로 끌어온다.
   *
   * **`querySelector`로 첫 번째 표시 행 하나만 끌어온다.** 같은 단지의
   * 평형 행이 여럿이면 전부 표시되는데(위 prop 주석), 행마다 각자
   * `scrollIntoView`를 부르면 마지막 행이 이겨 목록이 그 단지의 **끝**으로
   * 내려간다.
   *
   * `visibleCount`도 의존성에 넣는다 — 마커가 가리키는 행이 "더 보기"
   * 너머에 있으면 App이 먼저 `visibleCount`를 늘리고, 그 행은 이 렌더
   * **다음**에야 DOM에 생긴다.
   *
   * `scrollIntoView`는 jsdom에 없다(정의되지 않은 속성이다) — 옵셔널
   * 호출로 둬야 테스트 환경에서 터지지 않는다.
   */
  useEffect(() => {
    if (focusedComplexKey === null) return;
    const row = sectionRef.current?.querySelector(".complex-row--focused");
    row?.scrollIntoView?.({ block: "nearest" });
  }, [focusedComplexKey, visibleCount]);

  const total =
    result.withinSafe.length + result.unverified.length + result.beyondSafe.length;

  if (total === 0) {
    return (
      <section className="complex-list" aria-label="살 수 있는 단지" ref={sectionRef}>
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
  const unverifiedShown = result.unverified.slice(0, visibleCount);
  const beyondShown = result.beyondSafe.slice(0, visibleCount);
  const remaining =
    total - safeShown.length - unverifiedShown.length - beyondShown.length;

  return (
    <section className="complex-list" aria-label="살 수 있는 단지" ref={sectionRef}>
      <h2>살 수 있는 단지</h2>

      {safeShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--safe">무리 없이 살 수 있어요</h3>
          <ul className="complex-rows">
            {safeShown.map((e) => (
              <ComplexRow
                key={unitKey(e.unit)}
                entry={e}
                onSelect={onSelect}
                focused={e.unit.complexKey === focusedComplexKey}
              />
            ))}
          </ul>
        </>
      )}

      {/*
        우리 숫자가 그 행의 매달 부담을 다 담지 못하는 행들. 안전 덩어리
        **바로 다음**에 둔다 — 이 행들은 우리 계산상 "무리 없는" 쪽에
        있던 행이라, 사용자가 좋은 선택지를 찾는 그 자리에서 바로
        읽혀야 한다. 헤더 문구는 룰셋에서 온다(판정을 바꾸는 근거다).
      */}
      {unverifiedShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--unverified">
            {landLeaseRules.grade.groupHeading}
          </h3>
          <ul className="complex-rows">
            {unverifiedShown.map((e) => (
              <ComplexRow
                key={unitKey(e.unit)}
                entry={e}
                onSelect={onSelect}
                focused={e.unit.complexKey === focusedComplexKey}
              />
            ))}
          </ul>
        </>
      )}

      {beyondShown.length > 0 && (
        <>
          <h3 className="complex-group complex-group--beyond">살 수는 있지만 부담이 커요</h3>
          <ul className="complex-rows">
            {beyondShown.map((e) => (
              <ComplexRow
                key={unitKey(e.unit)}
                entry={e}
                onSelect={onSelect}
                focused={e.unit.complexKey === focusedComplexKey}
              />
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
export function unitKey(unit: ComplexUnit): string {
  return `${unit.complexKey}|${unit.areaBucket}`;
}

function ComplexRow({
  entry,
  onSelect,
  focused = false,
}: {
  entry: ComplexListEntry;
  onSelect?: (unit: ComplexUnit) => void;
  /** 지도에서 이 단지를 고른 상태인가 */
  focused?: boolean;
}) {
  const { unit, burden, needsBuiltYear } = entry;
  // 덩어리를 가른 것과 **같은 함수**다(lib/complex-list.ts). 배지와
  // 덩어리 헤더가 어긋나려면 이 함수가 같은 입력에 다른 답을 내야 한다.
  const grade = burdenGrade(burden.safety.level, unit.landLeasehold, landLeaseRules);

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
        <span className="complex-trades"> · {AGGREGATION_WINDOW_LABEL} 거래 {unit.tradeCount}건</span>
      </span>
      <span className="complex-burden" data-level={grade.level}>
        범위 위쪽인 {formatWon(unit.maxPrice)}에 산다면{" "}
        {/*
          대출이 필요한지 아닌지는 `burdenTierOf`가 가른다 — **지도 마커의
          색·꼬리표를 가르는 것과 같은 함수다**(lib/complex-list.ts). 여기서
          `burden.neededLoan === 0`을 직접 다시 쓰면 두 화면이 각자의 조건을
          갖게 되고, 한쪽만 고쳐지는 날 지도와 목록이 같은 단지를 두고 다른
          말을 한다.
        */}
        {burdenTierOf(entry) === "no-loan" ? (
          // 현금만으로 덮이는 가격이다. "월 0원 · 부담률 0%"만 보여주면
          // 계산이 안 된 것처럼 읽힌다 — 왜 0인지를 말한다. 그 말이
          // "매달 나가는 돈이 없다"로 읽히지 않게 하는 일은 NoLoanLine이
          // 같은 자리에서 한다.
          <>
            <NoLoanLine landLeasehold={unit.landLeasehold} />{" "}
            <span className="complex-level">{grade.label}</span>
          </>
        ) : (
          <>
            월 {formatWon(burden.safety.monthlyPayment)} · 부담률{" "}
            {(burden.safety.burdenRatio * 100).toFixed(0)}%{" "}
            <span className="complex-level">{grade.label}</span>
          </>
        )}
        {/*
          등급이 왜 거기서 멈췄는지는 등급 글자 **바로 옆**에서 말한다.
          숫자와 등급이 문구보다 먼저 읽히므로, 아래 표시 안으로 밀면
          사용자는 "확인 필요"를 읽고도 무엇이 부족한지 모른 채 지나간다.
        */}
        {grade.note !== null && (
          <span className="complex-grade-note"> {grade.note}</span>
        )}
        {/*
          토지임대부 표시는 이 숫자 **안**에 붙는다. 부담률·등급을 읽는
          바로 그 자리에서 "이 월 상환액 밖에 매달 나가는 돈이 더 있다"를
          알아야 한다 — 행 이름 옆이나 목록 아래 각주로 밀면 읽히지 않고,
          그러면 이 행은 아무 표시 없이 "무리 없이 살 수 있어요" 덩어리에
          들어앉는다.

          `neededLoan === 0`(대출 없이 사는 경우)에도 그대로 붙는다. 오히려
          그쪽이 더 낙관적으로 읽히는 자리다 — 대출이 없다고 매달 나가는
          돈이 없는 것이 아니다.
        */}
        <LandLeaseNote landLeasehold={unit.landLeasehold} />
      </span>
    </>
  );

  const className = focused ? "complex-row complex-row--focused" : "complex-row";

  if (onSelect === undefined) {
    return (
      <li className={className} aria-current={focused ? "true" : undefined}>
        {rows}
      </li>
    );
  }

  return (
    <li className={className} aria-current={focused ? "true" : undefined}>
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

function Freshness({ dataAsOf }: { dataAsOf: string | null }) {
  // 모르면 말하지 않는다 — 위 prop 주석 참고.
  if (dataAsOf === null) return null;
  return (
    <p className="complex-freshness">
      {dataAsOf} 계약분까지 반영했어요. 실거래 신고가 한 달쯤 늦어서 최근
      달은 거래가 실제보다 적게 잡혀요.
    </p>
  );
}
