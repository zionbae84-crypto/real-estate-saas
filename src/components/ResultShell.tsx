import { useEffect, type ReactNode, type Ref } from "react";
import { lockBodyScroll } from "../print/bodyScrollLock";

export interface ResultShellProps {
  /** 상단바 가운데 요약 항목들(라벨 + 값 쌍). {@link ResultSummaryItem} */
  summary: ReactNode;
  /** 상단바 오른쪽 버튼들(인쇄·조건 다시 넣기) */
  actions: ReactNode;
  /** 왼쪽 열 — 목록 ↔ 단지 상세가 전환되는 스크롤 영역 */
  sidebar: ReactNode;
  /** 오른쪽 열 — 지도 */
  map: ReactNode;
  /**
   * 예산 상세 패널({@link "./BudgetPanel"}). 사이드바 열 위에 덮이는
   * 오버레이라 **무대(`.region-results-grid`) 안**에 둔다 — 상단바는
   * `overflow-x: auto`라 그 안의 절대 배치 자식이 상단바 높이에서
   * 잘리고, 셸 바로 아래에 두면 상단바 높이를 알 수 없어 위치를 잡을 수
   * 없다.
   *
   * 절대 배치라 그리드 칸을 차지하지 않는다(두 열은 그대로 사이드바와
   * 지도가 쓴다). **DOM 순서를 사이드바보다 앞에 두는 것이 인쇄 순서를
   * 정한다** — 종이에서는 배치가 풀려(`@media print`) 상단바 요약 →
   * 예산 상세 → 목록/상세 → 면책 순으로 흐른다. Task 4까지 사이드바가
   * 세로로 쌓아 보여주던 것과 같은 순서다.
   */
  panel?: ReactNode;
  /**
   * {@link panel}이 펼쳐져 있는가. 참이면 **사이드바 열을 `inert`로**
   * 잠근다(리뷰 findings M2).
   *
   * 패널은 372px 사이드바 열을 정확히 덮는 절대 배치 오버레이인데 DOM
   * 순서는 패널 → 사이드바다. 잠그지 않으면 패널을 지나 Tab을 계속
   * 누를 때 **완전히 가려진** 행정동 `<select>`와 `.complex-row` 버튼에
   * 초점이 간다 — 거기서 Enter를 누르면 보이지도 않는 평형이 선택되고
   * 패널이 발밑에서 닫힌다(WCAG 2.4.3 / 2.4.7).
   *
   * **패널 자신은 잠기지 않는다** — `.budget-panel`은 그리드의 자식이지
   * 사이드바의 자손이 아니다. **지도도 잠기지 않는다**: 브리프가 지키려는
   * "패널이 열려 있어도 지도는 그대로 조작된다"는 그대로 성립한다(지도는
   * `.region-results-map`, 사이드바 열 밖이다). 잠기는 것은 정확히
   * "패널에 가려 보이지 않는 것"뿐이다.
   *
   * `inert` 하나로 포커스와 접근성 트리 노출을 동시에 끊는다 —
   * `aria-hidden`만 걸면 스크린리더에서만 사라지고 Tab은 그대로 들어간다.
   * 렌더링·인쇄에는 영향이 없다(`.results-screen`의 `inert`와 같다).
   *
   * 이 prop은 **`open` 상태를 그대로 받는다** — `panel`이 `ReactNode`라
   * 셸이 그 안을 들여다볼 수 없기 때문이다.
   */
  panelOpen?: boolean;
}

/**
 * 화면 2 — 전체화면 결과 셸(design.md §4).
 *
 * ```
 * ┌ .result-shell (fixed, inset 0, grid-template-rows: auto minmax(0,1fr)) ┐
 * │ .result-topbar   이름 · 요약 · [인쇄][다시]                             │
 * ├ .region-results-grid  (= 스펙의 .stage, position: relative)            │
 * │ .region-results-sidebar (스크롤)  │ .region-results-map (지도)          │
 * │  └ 그 위에 .budget-panel (절대 배치, 사이드바 열만 덮는다)              │
 * └────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * **클래스 이름이 스펙과 다른 이유**: 스펙은 이 두 열을 `.stage`라
 * 부르지만, 여기서는 이미 있던 `.region-results-grid`·
 * `.region-results-sidebar`·`.region-results-map`을 그대로 쓴다. 그
 * 이름들은 인쇄 계약에 박혀 있다 — `scripts/printCss.test.ts`가
 * "사이드바의 `overflow`/`max-height`가 인쇄에서 풀리는가",
 * "그리드가 인쇄에서 1열이 되는가"를 **그 이름으로** 검사한다. 뜻이
 * 그대로인 요소의 이름만 바꾸면 그 가드가 아무것도 지키지 않는 상태로
 * 조용히 통과한다(이 저장소가 팔레트 교체 때 겪은 실패 형태 —
 * task-1-report.md의 `land-lease.test.ts` 항목).
 *
 * **레이아웃에서 절대 놓치면 안 되는 두 가지**(둘 다 프로토타입에서
 * 실제로 겪은 버그다. `styles.css`의 해당 규칙에 다시 적어 뒀다):
 *
 * 1. `.region-results-grid`의 행은 `minmax(0, 1fr)`이어야 한다. `auto`로
 *    두면 지도(자식이 전부 absolute라 내재 높이 0)가 높이를 못 받아
 *    타일이 아예 안 뜬다.
 * 2. 네이버 SDK가 지도 컨테이너의 `position`을 인라인으로 `relative`로
 *    덮어써서 `inset: 0`이 무력화된다. 그래서 `.complex-map`은
 *    `width: 100%; height: 100%`로 칸을 채운다.
 *
 * **문서 스크롤을 잠근다**(design.md §4: 페이지 자체는 스크롤하지 않고
 * 사이드바 목록만 스크롤한다). 화면 1(`EntryScreen`)이 쓰는 것과 **같은
 * 클래스**를 쓴다 — 인라인 스타일이 아니라 클래스여야 `@media print`가
 * `!important` 없이 풀 수 있다(`src/print/bodyScrollLock.ts`에 이유를
 * 자세히 적었다. 인라인으로 잠갔다가 인쇄를 다시 깬 것이 Task 3의
 * 재검토 Critical 2였다).
 *
 * 화면 1이 떠 있는 동안(`phase === "입력"`)에도 이 셸은 언마운트되지
 * 않고 그 **뒤에** 깔려 있다(`.results-screen`이 통째로 `inert`다) —
 * 그래서 두 레이어가 동시에 잠금을 들고 있는 상태가 정상이다. 각자
 * 클래스를 붙였다 떼면 **먼저 떼는 쪽이 이겨** 아직 떠 있는 레이어의
 * 잠금까지 풀린다(지역 조회가 성공해 `phase`가 "결과"로 넘어가는 순간
 * `EntryScreen`의 정리가 이 셸의 잠금을 떼어 버렸다 — 테스트가 잡은
 * 실제 버그다). 그래서 클래스를 직접 만지지 않고 `lockBodyScroll()`이
 * 잠글 이유의 개수를 센다.
 */
export function ResultShell({
  summary,
  actions,
  sidebar,
  map,
  panel,
  panelOpen = false,
}: ResultShellProps) {
  useEffect(() => lockBodyScroll(), []);

  return (
    <div className="result-shell">
      <header className="result-topbar">
        {/*
          서비스 이름. 화면 1의 `<h1>`(내 예산으로 살 수 있는 집)은 이
          단계에서 숨으므로, 이 화면이 무엇인지 말하는 자리가 여기
          하나뿐이다. 제목 계층을 새로 만들지 않는다 — 이 화면의 `h2`는
          목록("살 수 있는 단지")과 예산 결과가 이미 쓰고 있어서, 여기에
          `h1`을 하나 더 세우면 같은 문서에 제목이 둘이 된다.
        */}
        <p className="result-topbar-brand">내 예산으로 살 수 있는 집</p>
        <div className="result-topbar-summary">{summary}</div>
        <div className="result-topbar-actions">{actions}</div>
      </header>

      <div className="region-results-grid">
        {panel}
        {/* `panelOpen` prop 문서 참고 — 패널에 완전히 가려지는 동안만 잠근다. */}
        <div className="region-results-sidebar" inert={panelOpen}>
          {sidebar}
        </div>
        <div className="region-results-map">{map}</div>
      </div>
    </div>
  );
}

export interface ResultSummaryItemProps {
  label: string;
  value: string;
  /** 금액 강조(황동). 지금은 "실구매 가능 가격" 하나뿐이다 */
  emphasis?: boolean;
  /**
   * 값 자리가 숫자가 아니라 **원인을 말하는 문장**일 때 켠다
   * (리뷰 수정 Important 1: 실구매 가능 가격이 0원인 프로필).
   *
   * `emphasis`와 함께 쓰지 않는다 — 켜면 이쪽이 이긴다. 강조(황동 +
   * `tabular-nums`)는 "여기 금액이 있다"는 신호라, 금액이 없다고
   * 말하는 문장에 그 옷을 입히면 화면에서 가장 큰 글씨가 없는 숫자를
   * 있는 것처럼 광고한다. 문장은 좁은 화면에서 줄바꿈도 해야 한다
   * (`.result-topbar-item`의 `nowrap`을 값 쪽에서 되돌린다).
   */
  notice?: boolean;
  /**
   * 이 칸을 **누르는 자리**로 만든다(예산 상세 패널을 여닫는다).
   * 넘기지 않으면 지금까지처럼 값만 보여주는 `<div>`다.
   */
  onToggle?: () => void;
  /** {@link onToggle}이 있을 때, 그 패널이 지금 펼쳐져 있는가 */
  expanded?: boolean;
  /** {@link onToggle}이 있을 때, `aria-controls`로 가리킬 패널의 id */
  controls?: string;
  /** 패널을 닫을 때 포커스를 되돌릴 자리(BudgetPanel이 이 ref를 쓴다) */
  buttonRef?: Ref<HTMLButtonElement>;
  /**
   * 값 옆에 붙는 작은 배지(지금은 "지역" 칸의 {@link RegulationBadge}
   * 하나뿐이다). **여기서 무엇을 배지로 보여줄지 계산하지 않는다** —
   * 이 컴포넌트 자체의 원칙("값을 여기서 계산하지 않는다")과 같은
   * 이유로, 호출부가 다 만든 것을 그대로 받는다.
   */
  badge?: ReactNode;
}

/**
 * 상단바 요약 한 칸 — 작은 라벨 + 굵은 값(design.md §4의 상단바).
 *
 * **값을 여기서 계산하지 않는다.** 호출부(`App.tsx`)가 화면의 다른
 * 자리와 같은 출처에서 뽑아 문자열로 넘긴다 — 상단바가 자기 계산을
 * 새로 하면 아래 결과와 다른 숫자를 말할 수 있다.
 *
 * **한 칸만 누르는 자리다**(Task 5, design.md §5): "실구매 가능 가격".
 * 누르면 예산 상세 패널이 펼쳐진다. 나머지(현금·소득·지역)는 값만
 * 보여주는 칸이라 `onToggle`을 넘기지 않는다.
 *
 * 그 칸은 **`affordablePrice === 0`일 때도 버튼이다.** 그때가 사용자가
 * "왜 0원인가"를 가장 알고 싶은 순간이고, 그 답(`ZeroBudgetMessage`·
 * `BindingExplainer`·`AssumptionLine`)이 바로 패널 안에 있다. 0원일
 * 때만 죽은 버튼으로 두면 Task 3이 리뷰에서 잡힌 실패(누르라고 적어
 * 놓고 아무 일도 안 하던 가정 칩)를 그대로 재현한다.
 *
 * 펼침 힌트("자세히"/"닫기")는 `.fold-more-hint`로 감싼다 — 종이 위에서는
 * 누를 것이 없어 죽은 지시문이 되므로 인쇄에서 지운다
 * (`src/print/hiddenInPrint.ts`). 값과 라벨은 그대로 남는다.
 */
export function ResultSummaryItem({
  label,
  value,
  emphasis = false,
  notice = false,
  onToggle,
  expanded = false,
  controls,
  buttonRef,
  badge,
}: ResultSummaryItemProps) {
  const valueClass = notice
    ? "result-topbar-item-value result-topbar-item-value--notice"
    : emphasis
      ? "result-topbar-item-value result-topbar-item-value--money"
      : "result-topbar-item-value";

  /*
   * 값과 배지를 한 줄에 나란히 둔다. `.result-topbar-item`은 세로
   * 그리드(라벨 행 → 값 행)라, 배지를 형제로 그냥 넣으면 자기 행을
   * 새로 얻어 값 **아래**로 떨어진다(사용자 요청은 값 **옆**이다) —
   * 그래서 값 행 안에 배지를 함께 묶는 감싸개를 하나 더 둔다. `badge`가
   * 없는 다른 칸(현금·소득·실구매 가능 가격)에서는 감싸개가 자식을
   * 하나만 가지므로 시각적으로 전과 같다.
   */
  const body = (
    <>
      <span className="result-topbar-item-label">{label}</span>
      <span className="result-topbar-item-value-row">
        <span className={valueClass}>{value}</span>
        {badge}
      </span>
    </>
  );

  if (onToggle === undefined) {
    return <div className="result-topbar-item">{body}</div>;
  }

  return (
    <button
      type="button"
      ref={buttonRef}
      className="result-topbar-item result-topbar-item--button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      {body}
      <span className="fold-more-hint">{expanded ? "닫기" : "자세히"}</span>
    </button>
  );
}
