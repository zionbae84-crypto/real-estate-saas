import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * 상단바 트리거(`aria-controls`)와 이 패널을 잇는 id. **한 곳에서만
 * 적는다** — 두 자리에 각각 문자열을 적으면 한쪽만 바뀌는 날 그 연결이
 * 조용히 끊긴다(스크린리더에게는 버튼이 아무것도 제어하지 않는 것으로
 * 들린다).
 */
export const BUDGET_PANEL_ID = "budget-panel";

export interface BudgetPanelProps {
  /**
   * 펼쳐져 있는가.
   *
   * **`App.tsx`에서 파생시켜 넘긴다**(`budgetPanelRequested && phase ===
   * "결과"`). 이 컴포넌트가 자기 상태를 들지 않는 이유는 아래 Esc
   * 핸들러 문서에 있다 — 화면 1이 덮고 있는 동안에는 이 값이 반드시
   * `false`여야 한다.
   */
  open: boolean;
  onClose: () => void;
  /**
   * 닫을 때 포커스를 되돌릴 자리(상단바의 "실구매 가능 가격" 버튼).
   *
   * 닫으면 이 패널은 화면에서 `display: none`이 된다 — 그 안에 포커스가
   * 남아 있으면 브라우저가 포커스를 `<body>`로 떨어뜨려, 키보드 사용자는
   * 방금까지 읽던 자리가 아니라 문서 맨 앞으로 튕긴다.
   */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}

/**
 * 예산 상세 패널 — 상단바의 "실구매 가능 가격"을 누르면 펼쳐지는
 * 오버레이(design.md §5).
 *
 * 안에 담기는 것은 **지금까지 사이드바에 세로로 쌓여 있던 그대로의
 * 컴포넌트들**이다(`PrintSummary`·`AssumptionLine`·`BudgetResult`·
 * `PriceSlider`·`SafetyBadge`). 로직도 prop도 손대지 않았다 — 바뀐 것은
 * 어디에 그리는가뿐이다.
 *
 * ## 닫혀 있어도 **언마운트하지 않는다** (이 파일에서 가장 중요한 것)
 *
 * 이 패널 안에는 `MUST_SURVIVE_PRINT_CLASSES` 아홉 개가 들어 있다:
 * `no-budget`, `binding-explainer`, `cost-breakdown`, `policy-loan-list`,
 * `slider-price`, `slider-warning`, `safe-line`, `assumption-line`,
 * `assumption-notice`. (여기 함께 적혀 있던 `assumption-item`은 눌러서
 * 고치는 버튼 갈래가 사라지면서 보호 대상에서도 없어졌다.)
 *
 * 패널의 기본 상태는 **닫힘**이고, `Cmd+P`는 어느 단계에서든 눌린다 —
 * 닫혀 있을 때 언마운트하면 그 사람의 종이에서 이 아홉 개가 통째로
 * 사라진다. 그래서 열림·닫힘은 **클래스 하나**(`--closed`)로만 표시하고,
 * 실제 숨김은 `src/styles.css`의 **`@media screen` 블록 안**에서 한다 —
 * `screen`은 인쇄 미디어와 절대 매치되지 않으므로 그 숨김이 종이에 닿을
 * 방법 자체가 없다(`scripts/printCss.test.ts`가 그 규칙이 블록 밖으로
 * 나가지 않는지 검사한다).
 *
 * `hidden` 속성이나 인라인 `display: none`을 쓰지 않는 이유가 같다 —
 * 둘 다 미디어를 가리지 않아 인쇄에도 그대로 적용된다. Task 3이 인라인
 * `body.style.overflow`로 인쇄를 다시 깬 것과 정확히 같은 실패 형태다.
 *
 * ## 화면 전체를 덮지 않는다
 *
 * `.region-results-grid` 안에서 사이드바 열(372px)만 덮는 절대 배치다 —
 * 지도 칸 밖이라 열려 있는 동안에도 지도는 그대로 조작된다(브리프의
 * 요구). 대신 패널 뒤에 가려지는 사이드바를 바꾸는 조작(목록 행·지도
 * 마커)은 `App.tsx`에서 이 패널을 닫는다 — 안 닫으면 눌러도 아무 변화가
 * 없는 죽은 컨트롤이 된다.
 *
 * 상단바 안에 두지 않은 이유는 `.result-topbar`가 `overflow-x: auto`라
 * 그 안의 절대 배치 자식이 상단바 높이에서 잘리기 때문이다.
 */
export function BudgetPanel({
  open,
  onClose,
  returnFocusRef,
  children,
}: BudgetPanelProps) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    // `ComplexDetail`과 같은 이유로 첫 컨트롤이 아니라 섹션 자체에
    // 포커스를 준다 — 사용자가 "무엇이 열렸는지"부터 듣는다.
    sectionRef.current?.focus();
  }, [open]);

  /**
   * **사용자가 이 패널을 직접 닫을 때만** 포커스를 트리거로 되돌린다
   * (`Esc`와 닫기 버튼 — 그때 포커스는 이 패널 안에 있다). 닫는 순간
   * 패널은 화면에서 `display: none`이 되므로, 그대로 두면 포커스가
   * `<body>`로 떨어져 키보드 사용자가 문서 맨 앞으로 튕긴다.
   *
   * **`App`이 닫는 경로(지도 마커·목록 행)에서는 건드리지 않는다.**
   * 그때 사용자의 손은 지도에 있고 포커스는 이 패널 안에 없다 — 거기서
   * 포커스를 상단바로 끌어오면 누른 적 없는 컨트롤이 갑자기 읽히는,
   * 요청하지 않은 포커스 이동이 된다. 그래서 `open` 전환을 보는
   * effect가 아니라 **이 두 자리에서만** 되돌린다.
   *
   * 순서가 중요하다: 먼저 포커스를 옮기고 나서 닫는다. 반대로 하면 그
   * 사이에 브라우저가 사라진 요소에서 포커스를 이미 떨어뜨린 뒤다.
   */
  function closeAndReturnFocus() {
    returnFocusRef.current?.focus();
    onClose();
  }

  /**
   * `Esc`로 닫는다.
   *
   * **열려 있을 때만 리스너를 붙인다.** `open`은 `App.tsx`에서
   * `phase === "결과"`와 함께 파생된 값이라, 화면 1(`.entry-screen`)이
   * 덮고 있는 동안에는 반드시 `false`다 — 그래서 그 상태에서는 이
   * 리스너가 **아예 존재하지 않는다.**
   *
   * 이 조건이 없으면 유령 동작이 된다: 결과 트리는 `phase === "입력"`
   * 동안 통째로 `inert`지만, `inert`는 `document`에 직접 붙은 키
   * 리스너를 막지 못한다. 화면 1에서 Esc를 눌렀는데 보이지도 않는 뒤쪽
   * 패널이 닫히는(그리고 포커스가 보이지 않는 버튼으로 옮겨 가는) 일이
   * 벌어진다.
   */
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      returnFocusRef.current?.focus();
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, returnFocusRef]);

  return (
    <section
      id={BUDGET_PANEL_ID}
      className={open ? "budget-panel" : "budget-panel budget-panel--closed"}
      aria-label="예산 상세"
      ref={sectionRef}
      tabIndex={-1}
    >
      {/*
        제목은 `<p>`다 — `<h2>`를 쓰면 바로 아래 `BudgetResult`의
        "실구매 가능 가격"과 같은 층위의 제목이 하나 더 생겨, 종이에서
        같은 덩어리가 두 번 시작하는 것처럼 읽힌다.
      */}
      <p className="budget-panel-title">예산 상세</p>
      {/*
        종이 위에는 누를 것이 없다 — `.budget-detail-close`는
        `PRINT_HIDDEN_SELECTORS`에 올려 인쇄에서 지운다. 값도 문구도
        아니고 조작 장치라 잃는 정보가 없다.
      */}
      <button
        type="button"
        className="budget-detail-close"
        onClick={closeAndReturnFocus}
      >
        닫기
      </button>
      {children}
    </section>
  );
}
