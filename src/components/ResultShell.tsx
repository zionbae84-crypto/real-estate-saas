import { useEffect, type ReactNode } from "react";
import { lockBodyScroll } from "../print/bodyScrollLock";

export interface ResultShellProps {
  /** 상단바 가운데 요약 항목들(라벨 + 값 쌍). {@link ResultSummaryItem} */
  summary: ReactNode;
  /** 상단바 오른쪽 버튼들(인쇄·조건 다시 넣기) */
  actions: ReactNode;
  /** 왼쪽 열 — 예산·목록·상세가 세로로 흐르는 스크롤 영역 */
  sidebar: ReactNode;
  /** 오른쪽 열 — 지도 */
  map: ReactNode;
}

/**
 * 화면 2 — 전체화면 결과 셸(design.md §4).
 *
 * ```
 * ┌ .result-shell (fixed, inset 0, grid-template-rows: auto minmax(0,1fr)) ┐
 * │ .result-topbar   이름 · 요약 · [인쇄][다시]                             │
 * ├ .region-results-grid  (= 스펙의 .stage)                                │
 * │ .region-results-sidebar (스크롤)  │ .region-results-map (지도)          │
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
export function ResultShell({ summary, actions, sidebar, map }: ResultShellProps) {
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
        <div className="region-results-sidebar">{sidebar}</div>
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
}

/**
 * 상단바 요약 한 칸 — 작은 라벨 + 굵은 값(design.md §4의 상단바).
 *
 * **값을 여기서 계산하지 않는다.** 호출부(`App.tsx`)가 화면의 다른
 * 자리와 같은 출처에서 뽑아 문자열로 넘긴다 — 상단바가 자기 계산을
 * 새로 하면 아래 결과와 다른 숫자를 말할 수 있다.
 *
 * **누르는 자리가 아니다.** design.md §5는 "한도"를 누르면 예산 상세
 * 패널이 열리는 그림이지만, 그 패널은 다음 작업(Task 5)에서 만든다.
 * 지금 버튼처럼 그려 두면 눌러도 아무 일도 일어나지 않는 죽은 컨트롤이
 * 된다 — Task 3이 리뷰에서 잡힌 실패 중 하나가 정확히 그것이었다
 * (누르라고 적어 놓고 아무 일도 하지 않던 가정 칩).
 */
export function ResultSummaryItem({ label, value, emphasis = false }: ResultSummaryItemProps) {
  return (
    <div className="result-topbar-item">
      <span className="result-topbar-item-label">{label}</span>
      <span
        className={
          emphasis
            ? "result-topbar-item-value result-topbar-item-value--money"
            : "result-topbar-item-value"
        }
      >
        {value}
      </span>
    </div>
  );
}
