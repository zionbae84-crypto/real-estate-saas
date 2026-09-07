import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
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
/**
 * 좁은 화면에서 조건 시트가 가리키는 자리. 압축 요약 버튼의
 * `aria-controls`와 시트의 `id`가 같은 상수를 쓴다.
 */
const CONDITIONS_ID = "result-topbar-conditions";

/** 시트를 맨 아래까지 내렸을 때 남는 높이(px). 손잡이와 제목 한 줄이 보이는 선이다. */
const SHEET_MIN_PX = 112;

/**
 * 시트를 끝까지 올려도 남겨 두는 지도 띠(px).
 *
 * 그 띠에 지도 살림살이가 두 줄로 들어간다 — 네이버 로고·저작권(1행)과
 * 마커 색 범례(2행), 오른쪽의 지도 유형·필터·학교 버튼. `styles.css`의
 * `.complex-map-controls` 주석 참고.
 */
const SHEET_MAP_BAND_PX = 88;

/** 손잡이를 끌 때 한 번에 움직이는 양(px). 키보드로 조절할 때 쓴다. */
const SHEET_KEY_STEP_PX = 48;

/*
 * 포인터 캡처는 **거들 뿐이다.** 손가락이 손잡이 밖으로 벗어나도 끌기가
 * 이어지게 해 주지만, 없다고 끌기가 성립하지 않는 것은 아니다. 그리고
 * 활성 포인터가 아니면 던지는 환경이 있다(jsdom, 일부 브라우저의 합성
 * 이벤트) — 그 예외가 끌기를 통째로 무너뜨릴 이유가 없다.
 */
function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* 무시 — 위 주석 참고 */
  }
}

function releasePointer(el: Element, pointerId: number): void {
  try {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    /* 무시 — 위 주석 참고 */
  }
}

export function ResultShell({
  summary,
  actions,
  sidebar,
  map,
  panel,
  panelOpen = false,
}: ResultShellProps) {
  useEffect(() => lockBodyScroll(), []);

  /*
   * 좁은 화면에서 조건 시트(= 원래 상단바 요약)가 펼쳐져 있는가.
   *
   * **넓은 화면에서는 아무 뜻이 없다** — 그쪽에서는 압축 요약 버튼도
   * 시트 스타일도 `@media`로 꺼져 있어서, 이 클래스가 붙든 말든 요약은
   * 상단바에 그대로 선다. 그래서 이 상태 하나로 두 화면을 다 덮는다:
   * "모바일인가"를 자바스크립트로 판정하는 자리는 이 파일 어디에도
   * 없고, 폭 판정은 전부 CSS가 한다.
   */
  const [conditionsOpen, setConditionsOpen] = useState(false);

  /*
   * ── 목록 시트의 높이 ────────────────────────────────────────────
   *
   * `null`이면 CSS 기본값(50%)을 쓴다 — 손잡이를 한 번도 안 끌었으면
   * 여기가 관여하지 않는다. 넓은 화면에서는 이 값을 읽는 규칙 자체가
   * 없으므로(그쪽 사이드바는 그리드 칸이다) 붙어 있어도 무해하다.
   *
   * **예전에는 이 자리에 `scroll-snap` 스크롤 상자가 있었다.** 상자
   * 하나가 시트 높이와 목록 스크롤을 모두 맡고, 상자 위쪽 빈 자리는
   * `pointer-events: none`으로 지도에 넘겼다. 그런데 **스크롤 사슬에서
   * 실제로 스크롤 가능한 요소가 그 상자 하나뿐인데 그 상자가 히트
   * 테스트에서 빠져 있었다** — 브라우저는 손가락 아래에서 밀 대상을
   * 찾지 못했고, 그래서 시트도 목록도 터치로는 전혀 안 움직였다(로컬
   * 실측으로 확인: JS로 `scrollTop`을 밀면 멀쩡히 맨 아래까지 갔다).
   *
   * 그래서 역할을 나눴다 — 시트가 자기 높이를 갖고 스스로 스크롤하고,
   * 높이는 손잡이를 끌어 바꾼다. 시트 위쪽은 아무것도 덮지 않으므로
   * 지도가 그대로 조작된다.
   */
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const sheetScrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  /** 시트가 커질 수 있는 한계. 지도 띠는 남긴다. */
  function clampSheetHeight(height: number): number {
    const stage = sheetScrollerRef.current?.clientHeight ?? 0;
    const max = Math.max(SHEET_MIN_PX, stage - SHEET_MAP_BAND_PX);
    return Math.min(max, Math.max(SHEET_MIN_PX, height));
  }

  /** 지금 시트 높이(px). 아직 안 끌었으면 CSS가 그린 실제 높이를 읽는다. */
  function currentSheetHeight(): number {
    if (sheetHeight !== null) return sheetHeight;
    const sheet = sheetScrollerRef.current?.querySelector(".region-results-sidebar");
    return sheet instanceof HTMLElement ? sheet.getBoundingClientRect().height : SHEET_MIN_PX;
  }

  function handleGrabberPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: currentSheetHeight(),
    };
    capturePointer(event.currentTarget, event.pointerId);
  }

  function handleGrabberPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    // 위로 끌면(clientY가 줄면) 시트가 커진다.
    setSheetHeight(clampSheetHeight(drag.startHeight + (drag.startY - event.clientY)));
  }

  function endGrabberDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);
  }

  /*
   * 손가락이 없는 사람도 조절할 수 있어야 한다 — 위/아래 화살표로
   * 한 칸씩, Home/End로 끝까지.
   */
  function handleGrabberKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const stage = sheetScrollerRef.current?.clientHeight ?? 0;
    const moves: Record<string, number | undefined> = {
      ArrowUp: currentSheetHeight() + SHEET_KEY_STEP_PX,
      ArrowDown: currentSheetHeight() - SHEET_KEY_STEP_PX,
      Home: SHEET_MIN_PX,
      End: stage,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSheetHeight(clampSheetHeight(next));
  }

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
        {/*
          좁은 화면(≤640px)에서 나머지 조건을 펼치는 토글.

          **값을 복제하지 않는다.** 예전에는 이 자리가 "강남구 · 11억
          5,340만원"을 글자로 다시 적었는데, 같은 사실을 두 자리가 각자
          그리면 언젠가 어긋난다(이 저장소가 `dataAsOf`·`실구매 가능
          가격`에서 반복해 지켜 온 원칙이다). 지금은 요약 항목들이 그대로
          상단바에 남고 — 현금과 지역은 **입력란·셀렉트 그대로** 보인다
          (사용자 지시: "상단 사이드바에는 지역과 예산을 표시해줘서 바로
          조건을 바꿀 수 있도록") — 이 버튼은 접힌 나머지(연 소득·무주택·
          생애최초)를 여닫기만 한다.

          넓은 화면에서는 `display: none`이라 초점도 가지 않는다. 접힘·
          펼침이 그쪽에서는 뜻이 없기 때문이다(요약이 늘 한 줄에 선다).
        */}
        <button
          type="button"
          className="result-conditions-toggle"
          aria-expanded={conditionsOpen}
          aria-controls={CONDITIONS_ID}
          onClick={() => setConditionsOpen((v) => !v)}
        >
          {conditionsOpen ? "조건 접기" : "조건 더보기"}
        </button>
        <div
          id={CONDITIONS_ID}
          className={
            conditionsOpen
              ? "result-topbar-summary result-topbar-summary--open"
              : "result-topbar-summary"
          }
        >
          {summary}
        </div>
        <div className="result-topbar-actions">{actions}</div>
      </header>

      <div className="region-results-grid">
        {panel}
        {/*
          목록 시트의 스크롤 상자.

          **넓은 화면에서는 `display: contents`다** — 상자가 사라지고
          `.region-results-sidebar`가 예전 그대로 그리드의 첫 칸이 된다.
          그래서 DOM 순서(패널 → 사이드바 → 지도)도 그대로다. 그 순서가
          인쇄 순서를 정한다(위 `panel` prop 문서 참고).

          좁은 화면에서만 지도를 덮는 스크롤 상자가 되어, 아래 두 눈금과
          시트가 `scroll-snap` 지점 셋을 만든다(살짝 / 절반 / 전체).
          드래그가 곧 네이티브 스크롤이라 포인터 핸들러가 없다. 상자
          자신은 `pointer-events: none`이고 시트만 `auto`라, 시트 위쪽
          빈 자리에서는 **지도가 그대로 조작된다** — `.budget-panel`이
          지키는 것과 같은 원칙이다.
        */}
        <div
          className="result-sheet-scroller"
          ref={sheetScrollerRef}
          style={
            sheetHeight === null
              ? undefined
              : ({ "--sheet-height": `${sheetHeight}px` } as React.CSSProperties)
          }
        >
          {/*
            잡아 끄는 손잡이.

            **사이드바의 자식이 아니라 형제다.** 자식으로 두면 시트의 첫
            자식이 바뀌는데, `App.test.tsx`가 엔진 경고의 자리를 정확히
            `firstElementChild`로 잠그고 있다(경고가 목록 뒤로 밀리지
            않게 지키는 검사다). 형제로 두고 CSS가 시트 높이(`--sheet-height`)
            만큼 띄워 시트 윗변에 겹쳐 놓는다.

            넓은 화면에서는 `display: none`이라 초점도 받지 않는다.
          */}
          <div
            className="result-sheet-grabber"
            role="separator"
            aria-orientation="horizontal"
            aria-label="목록 크기 조절"
            tabIndex={0}
            onPointerDown={handleGrabberPointerDown}
            onPointerMove={handleGrabberPointerMove}
            onPointerUp={endGrabberDrag}
            onPointerCancel={endGrabberDrag}
            onKeyDown={handleGrabberKeyDown}
          />
          {/*
            `panelOpen` prop 문서 참고 — 패널에 완전히 가려지는 동안만 잠근다.

            잡는 손잡이는 **DOM 노드가 아니라 `::before`**다(styles.css의
            좁은 화면 블록). 장식이라 문서에 남길 이유가 없고, 노드로
            두면 사이드바의 첫 자식이 바뀐다 — `App.test.tsx`의 "패널이
            닫힌 채로도 경고가 사이드바 맨 위에 보인다"가 정확히
            `firstElementChild`로 그 자리를 잠그고 있다(엔진 경고가 목록
            뒤로 밀리지 않게 지키는 검사다).
          */}
          <div className="region-results-sidebar" inert={panelOpen}>
            {sidebar}
          </div>
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
