import { useEffect, useMemo, useRef, useState } from "react";
import { AGGREGATION_WINDOW_LABEL } from "../data/complexes";
import type { ComplexUnit } from "../data/complexes";
import { formatWon } from "../format/won";
import { burdenGrade, burdenIsComplete } from "../lib/burden-grade";
import { burdenTierOf } from "../lib/complex-list";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import { landLeaseRules } from "../state/landLeaseRules";
import { LandLeaseNote } from "./LandLeaseNote";
import { NoLoanLine } from "./NoLoanLine";

/**
 * 각 덩어리가 한 쪽(페이지)에서 보여주는 행 수.
 *
 * 덩어리를 합쳐 세지 않고 **각각** 따로 페이지를 넘긴다. 합쳐 세면 안전
 * 덩어리가 길 때 뒤 덩어리가 화면 밖으로 밀려나고, 그러면 "선이 어디에
 * 있는가"라는 이 화면의 요점이 보이지 않는다 — 실제로 안전 82개·부담
 * 7개인 프로필에서 두 번째 헤더가 아예 안 나왔다. 덩어리가 셋이 된
 * 뒤에는 이 규칙이 더 중요해졌다: 가운데 덩어리("우리 숫자로는 …")가
 * 밀려나면 등급을 붙든 이유 자체가 화면에서 사라진다.
 *
 * 사용자 지시로 한 쪽에 5개씩, 쪽을 넘겨서 보게 했다(예전엔 10개씩
 * 누적으로 펼치는 "더 보기"였다) — 그래서 각 덩어리는 자기만의 페이지
 * 번호를 갖는다(아래 `ComplexList`의 세 `useState`).
 */
const PAGE_SIZE = 5;

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
  /**
   * 국토부가 응답하지 않아 **캐시에서 나온 목록**이면 그 값을 받은 시각.
   * 평소(라이브 조회 성공)에는 `null`이고, 그때는 아무것도 덧붙이지
   * 않는다(`lib/regionQuery.ts`의 `cachedAt` 문서 참고).
   *
   * 이 사실을 화면에 내지 않으면 사용자는 며칠 지난 값을 오늘 조회한
   * 값으로 읽는다 — 근거를 실제보다 튼튼해 보이게 하는 쪽이라 이 앱이
   * 가장 경계하는 오표기다(`dataAsOf` 주석과 같은 이유).
   */
  cachedAt?: Date | null;
  /** 지역 필터가 걸려 있는가 — 0개 안내 문구를 고르는 데 쓴다 */
  hasRegionFilter: boolean;
  /** 상환 능력(DSR) 자체가 0인가 */
  noRepaymentCapacity: boolean;
  /**
   * 한 쪽에서 보여주는 행 수. 기본은 {@link PAGE_SIZE}(5).
   *
   * 화면에서 쓰는 값을 바꿀 자리가 아니다 — `land-lease-grade.test.tsx`처럼
   * 페이지에 잘리지 않고 목록 전체를 한 번에 검사해야 하는 자리를 위한
   * 탈출구다(예전 `visibleCount` 오버라이드와 같은 자리).
   */
  pageSize?: number;
  /**
   * 있으면 각 행이 눌러서 상세(상환 시뮬레이션)를 열 수 있는 버튼이
   * 된다. 없으면(App.tsx 밖에서 이 컴포넌트만 렌더링하는 기존
   * 테스트처럼) 행은 그냥 텍스트다 — 누를 곳이 없는데 버튼처럼
   * 보이면 그 자체가 거짓말이다(AssumptionLine의 같은 원칙).
   */
  onSelect?: (unit: ComplexUnit) => void;
  /**
   * 지금 지도에서 고른 단지(`complexKey`). 그 단지의 행에 표시를 달고,
   * 값이 바뀌면 그 행이 속한 덩어리의 페이지를 그 행이 있는 쪽으로
   * 넘긴 뒤 목록 스크롤 안으로 끌어온다(아래 첫 `useEffect`).
   *
   * **단지 키라 같은 단지의 평형 행이 여럿이면 전부 표시된다.** 마커는
   * 단지 하나에 하나이므로(ComplexMap의 `groupByComplex`) 그것이 정직한
   * 대응이다 — 평형 하나만 골라 표시하면 지도에서 누른 마커가 가리키는
   * 것보다 좁게 말하게 된다. 같은 이유로, 같은 단지의 평형이 서로 다른
   * 덩어리에 걸쳐 있으면(예: 84㎡는 안전, 59㎡는 대출 필요) **그 덩어리
   * 모두**의 페이지를 넘긴다.
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
 * 목록을 세 덩어리로 가른다. 어디까지가 무리 없는지를 배지 하나가
 * 아니라 목록 구조가 말한다.
 *
 * **대출 필요 여부로만 가른다** — `result.withinSafe`·`result.beyondSafe`를
 * 합친 뒤 `burdenTierOf`로 둘로 쪼갠다. 대출이 아예 없는 행은 전부
 * "무리 없이 살 수 있어요"로, 대출이 끼는 행은 전부 "대출이 필요해요"로
 * 간다(사용자 지시). `result.unverified`(토지임대부 확인 필요)만
 * 대출 유무와 무관하게 따로 남는다 — 아래 참고.
 *
 * ⚠ **`beyondSafe`가 "항상 대출이 낀 행"은 아니다.** `calcSafetyScore`의
 * 부담률은 이번 구매의 새 대출뿐 아니라 **기존 대출**
 * (`existingDebtAnnualPayment`)도 함께 잰다 — 그래서 이번 구매엔 대출이
 * 필요 없어도(neededLoan 0) 기존 빚만으로 등급이 caution/danger로
 * 떨어질 수 있고, 그런 행도 엔진 수준에서는 `beyondSafe`에 담긴다.
 *
 * **처음엔 그런 행을 `beyondSafe`와 함께 "대출이 필요해요"에 남겼다.**
 * 그런데 행 문구는 "대출 없이 살 수 있어요"인데 덩어리 제목은 "대출이
 * 필요해요"라, 화면만 보면 모순으로 읽혔다(사용자 지시: "카테고리가
 * 안 맞는 것 같다"). 그래서 **대출 유무만으로 완전히 가른다** — 대출이
 * 없는 행은 엔진이 낸 등급이 무엇이었든 "무리 없이"로 옮기고, 아래
 * `ComplexRow`도 그 행의 등급 배지를 "안전"으로 함께 맞춘다(그래야
 * "대출 없이 살 수 있어요"와 "위험" 배지가 한 카드 안에서 서로 다른
 * 말을 하지 않는다). **기존 빚이 많다는 사실 자체가 사라지는 것은
 * 아니다** — 그 사실을 실제로 재는 화면(예: `ComplexDetail`의 한도
 * 계산)은 이 목록의 표시와 별개로 `burden.safety.level`을 그대로
 * 쓴다. 여기서 덮는 것은 **이 목록 카드의 등급 배지 하나**뿐이다.
 *
 * 새로 합쳐 나눈 두 배열은 부담률 오름차순으로 다시 정렬한다 — 예전
 * (`withinSafe`·`beyondSafe`를 순서 그대로 이어 붙이는 방식)처럼
 * 재정렬을 생략할 수 없다: 이제 두 배열 모두 `withinSafe`·`beyondSafe`
 * 양쪽에서 원소를 섞어 오므로, 원래 각각의 오름차순은 합친 뒤에는
 * 더 이상 전체 오름차순을 보장하지 않는다.
 *
 * "확인 필요" 덩어리는 **우리가 다 재지 못한 행**이다(토지임대부이거나
 * 토지임대부인지 모르는 평형) — 이건 대출 유무와 무관하게 그대로
 * 자기 덩어리를 유지한다. "무리 없이"에 넣으면 우리가 스스로
 * 불완전하다고 인정한 숫자로 안심시키는 것이 되고, "대출이 필요해요"에
 * 넣으면 모르는 것을 아는 척하는 것이 된다.
 */
export function ComplexList({
  result,
  dataAsOf,
  cachedAt = null,
  hasRegionFilter,
  noRepaymentCapacity,
  pageSize = PAGE_SIZE,
  onSelect,
  focusedComplexKey = null,
}: ComplexListProps) {
  const sectionRef = useRef<HTMLElement>(null);

  /*
   * 대출 유무로 다시 가른 두 배열(위 컴포넌트 문서 참고). `result`가
   * 바뀔 때만 다시 계산한다 — 매 렌더 새 배열을 만들면 아래 `useEffect`의
   * 의존성 비교가 매번 "바뀜"으로 잡혀 페이지 넘김 effect가 불필요하게
   * 다시 돈다.
   */
  const byBurdenRatio = (a: ComplexListEntry, b: ComplexListEntry) =>
    a.burden.safety.burdenRatio - b.burden.safety.burdenRatio;

  /*
   * "무리 없이"로 옮기는 조건은 대출이 없는 것**만**이 아니다 —
   * 토지임대부 데이터가 완전해야(`landLeasehold === "N"`) 한다. 둘 다
   * 갖춘 행만 등급도 "안전"으로 함께 올린다(아래 `ComplexRow`). 완전하지
   * 않은 행("Y"·`null`)은 대출이 없어도 여기서 뺀다 — 자료가 없는데
   * "안전"이라고 말하면 이 저장소가 가장 경계하는 오답이 된다. 그런
   * 행은 원래 있던 곳(`beyondSafe`면 "대출이 필요해", `unverified`면
   * 그대로 "확인 필요")에 남는다.
   */
  const isConfidentNoLoan = (e: ComplexListEntry) =>
    burdenTierOf(e) === "no-loan" && burdenIsComplete(e.unit.landLeasehold);

  const noLoanSafe = useMemo(
    () =>
      [...result.withinSafe, ...result.beyondSafe]
        .filter(isConfidentNoLoan)
        .sort(byBurdenRatio),
    [result],
  );
  const loanNeeded = useMemo(
    () =>
      [...result.withinSafe, ...result.beyondSafe]
        .filter((e) => !isConfidentNoLoan(e))
        .sort(byBurdenRatio),
    [result],
  );

  // 덩어리마다 독립된 페이지 번호. 하나로 합치면 한 덩어리를 넘길 때
  // 다른 덩어리도 함께 넘어간다 — 세 덩어리가 서로 다른 것을 말하는
  // 이 목록에서는 그 자체가 오류다.
  const [loanPage, setLoanPage] = useState(1);
  const [noLoanPage, setNoLoanPage] = useState(1);
  const [unverifiedPage, setUnverifiedPage] = useState(1);

  /*
   * 지도에서 마커를 누르면 그 단지가 속한 덩어리(들)의 페이지를 그
   * 단지가 실제로 있는 쪽으로 넘긴다.
   *
   * 펼치지 않으면 이 배선은 절반만 동작한다: 지도는 지역 전체를
   * 그리는데 목록은 덩어리마다 `pageSize`(기본 5)개씩만 보여주므로,
   * 첫 페이지 밖의 단지 마커를 누르면 선택은 바뀌는데 화면에는 아무
   * 변화가 없다 — 사용자에겐 마커가 죽은 것으로 보인다.
   *
   * **세 덩어리 모두 각자 넘긴다.** 같은 단지의 평형이 서로 다른
   * 덩어리에 걸쳐 있을 수 있어(위 `focusedComplexKey` 문서 참고), 하나만
   * 찾고 멈추면 다른 덩어리의 그 단지 행은 여전히 안 보인다.
   */
  useEffect(() => {
    if (focusedComplexKey === null) return;
    const jumpTo = (
      entries: readonly ComplexListEntry[],
      setPage: (page: number) => void,
    ) => {
      const index = entries.findIndex((e) => e.unit.complexKey === focusedComplexKey);
      if (index !== -1) setPage(Math.floor(index / pageSize) + 1);
    };
    jumpTo(loanNeeded, setLoanPage);
    jumpTo(noLoanSafe, setNoLoanPage);
    jumpTo(result.unverified, setUnverifiedPage);
  }, [focusedComplexKey, result, loanNeeded, noLoanSafe, pageSize]);

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
   * 세 페이지 번호도 의존성에 넣는다 — 마커가 가리키는 행이 지금 보이는
   * 페이지 밖에 있으면 위 effect가 먼저 페이지를 넘기고, 그 행은 이 렌더
   * **다음**에야 DOM에 생긴다.
   *
   * `scrollIntoView`는 jsdom에 없다(정의되지 않은 속성이다) — 옵셔널
   * 호출로 둬야 테스트 환경에서 터지지 않는다.
   */
  useEffect(() => {
    if (focusedComplexKey === null) return;
    const row = sectionRef.current?.querySelector(".complex-row--focused");
    row?.scrollIntoView?.({ block: "nearest" });
  }, [focusedComplexKey, loanPage, noLoanPage, unverifiedPage]);

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
        <Freshness dataAsOf={dataAsOf} cachedAt={cachedAt} />
      </section>
    );
  }

  // 실제로 뭔가 그려지는 덩어리 사이에만 구분선을 놓는다 — 세 덩어리 중
  // 가운데 것이 비어 있을 때(예: 확인 필요 0건) 그 빈자리에 줄만 남는
  // 사고를 막는다.
  const hasLoanNeeded = loanNeeded.length > 0;
  const hasNoLoanSafe = noLoanSafe.length > 0;
  const hasUnverified = result.unverified.length > 0;

  return (
    <section className="complex-list" aria-label="살 수 있는 단지" ref={sectionRef}>
      <h2>살 수 있는 단지</h2>

      <ComplexGroup
        heading="살 수는 있지만 대출이 필요해"
        modifier="beyond"
        entries={loanNeeded}
        page={loanPage}
        onPageChange={setLoanPage}
        pageSize={pageSize}
        onSelect={onSelect}
        focusedComplexKey={focusedComplexKey}
      />

      {hasLoanNeeded && hasNoLoanSafe && <hr className="complex-group-divider" />}

      <ComplexGroup
        heading="무리 없이 살 수 있어요"
        modifier="safe"
        entries={noLoanSafe}
        page={noLoanPage}
        onPageChange={setNoLoanPage}
        pageSize={pageSize}
        onSelect={onSelect}
        focusedComplexKey={focusedComplexKey}
      />

      {(hasLoanNeeded || hasNoLoanSafe) && hasUnverified && (
        <hr className="complex-group-divider" />
      )}

      {/*
        우리 숫자가 그 행의 매달 부담을 다 담지 못하는 행들. 헤더 문구는
        룰셋에서 온다(판정을 바꾸는 근거다).
      */}
      <ComplexGroup
        heading={landLeaseRules.grade.groupHeading}
        modifier="unverified"
        entries={result.unverified}
        page={unverifiedPage}
        onPageChange={setUnverifiedPage}
        pageSize={pageSize}
        onSelect={onSelect}
        focusedComplexKey={focusedComplexKey}
      />

      <Freshness dataAsOf={dataAsOf} cachedAt={cachedAt} />
    </section>
  );
}

/**
 * 한 덩어리(헤더 + 행 목록 + 필요하면 페이지 넘김)를 그린다.
 *
 * 세 덩어리(대출 필요·무리 없이·확인 필요)가 헤더 문구와 CSS 수정자만
 * 다르고 나머지 동작(페이지 자르기·넘김 버튼)은 완전히 같아서 하나로
 * 모았다 — 셋을 각각 손으로 쓰면 페이지 계산이 세 벌 생기고, 언젠가
 * 한 곳만 고쳐져 덩어리마다 다른 쪽수 규칙을 갖게 된다.
 */
function ComplexGroup({
  heading,
  modifier,
  entries,
  page,
  onPageChange,
  pageSize,
  onSelect,
  focusedComplexKey,
}: {
  heading: string;
  modifier: "beyond" | "safe" | "unverified";
  entries: readonly ComplexListEntry[];
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onSelect?: (unit: ComplexUnit) => void;
  focusedComplexKey: string | null;
}) {
  if (entries.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  // 목록이 줄어들어(예: 예산을 낮춰서) 이전에 보던 페이지가 더 이상
  // 없을 수 있다 — 화면 상태(`page`)는 그대로 두고 보여줄 때만 안으로
  // 접어, 마지막 남은 페이지를 보여준다.
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const shown = entries.slice(
    (clampedPage - 1) * pageSize,
    clampedPage * pageSize,
  );

  return (
    <>
      <h3 className={`complex-group complex-group--${modifier}`}>{heading}</h3>
      <ul className="complex-rows">
        {shown.map((e) => (
          <ComplexRow
            key={unitKey(e.unit)}
            entry={e}
            onSelect={onSelect}
            focused={e.unit.complexKey === focusedComplexKey}
          />
        ))}
      </ul>
      {totalPages > 1 && (
        <Pager page={clampedPage} totalPages={totalPages} onChange={onPageChange} />
      )}
    </>
  );
}

/**
 * 덩어리 하나의 쪽 넘김. 이전/다음 버튼과 "N / M쪽" 표시뿐이다 — 쪽
 * 번호를 눌러 건너뛰는 것까지는 사용자 지시에 없었고, 한 덩어리가
 * 수십 쪽이 되는 경우가 드물어(예산 안에 드는 단지 수 자체가 크지
 * 않다) 번호 목록을 따로 낼 이득이 적다.
 */
function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="complex-pager">
      <button
        type="button"
        className="complex-pager-nav"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        이전
      </button>
      <span className="complex-pager-status">
        {page} / {totalPages}쪽
      </span>
      <button
        type="button"
        className="complex-pager-nav"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        다음
      </button>
    </div>
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
  /*
   * 대출이 없고 토지임대부 데이터도 완전하면 등급을 "안전"으로 맞춘다
   * (사용자 지시 — 위 컴포넌트 문서의 `isConfidentNoLoan`과 **같은
   * 조건**이어야 한다. 조건이 갈리면 "무리 없이" 덩어리에 "안전"이
   * 아닌 배지가 뜨는 행이 다시 생긴다 — 실제로 한 번 그랬다:
   * 토지임대부 미확인 행을 대출 유무만 보고 옮겼더니 그 행이 "무리
   * 없이" 헤더 아래에서 "확인 필요" 배지를 달았다).
   *
   * 데이터가 불완전한(`"Y"`·`null`) 행은 대출이 없어도 그대로 둔다 —
   * 엔진이 낸 진짜 등급(`burden.safety.level`, 기존 대출까지 함께 잰
   * 값)을 그대로 보여준다. 자료가 없는데 "안전"이라고 말하면 이
   * 저장소가 가장 경계하는 오답이 된다.
   */
  const effectiveLevel =
    burdenTierOf(entry) === "no-loan" && burdenIsComplete(unit.landLeasehold)
      ? "safe"
      : burden.safety.level;
  const grade = burdenGrade(effectiveLevel, unit.landLeasehold, landLeaseRules);

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
        {/*
          대출이 필요한지 아닌지는 `burdenTierOf`가 가른다 — **지도 마커의
          색·꼬리표를 가르는 것과 같은 함수다**(lib/complex-list.ts). 여기서
          `burden.neededLoan === 0`을 직접 다시 쓰면 두 화면이 각자의 조건을
          갖게 되고, 한쪽만 고쳐지는 날 지도와 목록이 같은 단지를 두고 다른
          말을 한다.

          "범위 위쪽인 X에 산다면"이라는 기준 설명은 더 이상 붙이지 않는다
          (사용자 지시: 카드 안에서 크게 중요하지 않다). 계산 기준 자체는
          바뀌지 않았다 — 여전히 `unit.maxPrice`로 잰다(위 lib/complex-list.ts의
          `buildComplexList` 문서 참고), 화면에서 그 문장을 뺐을 뿐이다.
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

/**
 * 낡은 캐시로 버틴 조회임을 알리는 한 문장.
 *
 * **별도 배너가 아니라 신선도 줄에 붙인다**(사용자 결정). 이 줄이 이미
 * "이 목록이 언제 것인지"를 말하는 자리라, 같은 성격의 사실은 여기
 * 모이는 편이 읽기 쉽다. 대신 굵게 내 눈에 걸리게 한다 —
 * `.complex-stale-note`.
 *
 * 날짜만 적고 시각은 적지 않는다. 이 값의 쓸모는 "얼마나 묵었나"이고,
 * 그 판단에 분 단위는 필요 없다.
 */
function staleNote(cachedAt: Date): string {
  const when = `${cachedAt.getMonth() + 1}월 ${cachedAt.getDate()}일`;
  return `지금 국토교통부 서버가 응답하지 않아 ${when}에 받은 값을 보여드려요.`;
}

function Freshness({
  dataAsOf,
  cachedAt,
}: {
  dataAsOf: string | null;
  cachedAt: Date | null;
}) {
  /*
   * 모르면 말하지 않는다 — 위 prop 주석 참고.
   *
   * **단 `cachedAt`이 있으면 그것만이라도 말한다.** 낡은 값을 보여주는
   * 중이라는 사실은 `dataAsOf`를 아는지와 무관하게 알려야 한다 — 거래가
   * 0건이라 `dataAsOf`가 `null`인 지역에서도 목록은 낡은 캐시에서 나온다.
   */
  if (dataAsOf === null && cachedAt === null) return null;
  return (
    <p className="complex-freshness">
      {dataAsOf !== null && (
        <>
          {dataAsOf} 계약분까지 반영했어요. 실거래 신고가 한 달쯤 늦어서 최근
          달은 거래가 실제보다 적게 잡혀요.
        </>
      )}
      {cachedAt !== null && (
        <span className="complex-stale-note">{staleNote(cachedAt)}</span>
      )}
    </p>
  );
}
