/**
 * 화면 1(`EntryScreen`)이 떠 있는 동안 문서 스크롤을 잠그는 `<body>`
 * 클래스 이름.
 *
 * **왜 인라인 스타일이 아니라 클래스인가(재검토 수정 Critical 2).**
 * 예전에는 `EntryScreen`이 `document.body.style.overflow = "hidden"`을
 * 직접 썼다. 그 잠금은 `phase === "입력"`인 내내 걸려 있는데, 바로 그
 * 상태가 앞선 리뷰(Critical 1)가 "인쇄할 수 있어야 한다"고 고친 상태다
 * — 인쇄는 브라우저의 Cmd+P로만 하고, 그 단계에서도 눌린다.
 *
 * `<html>`의 `overflow`는 기본값이 `visible`이라 `<body>`의 `hidden`이
 * 뷰포트로 전파된다. 크롬·파이어폭스에서 인쇄물이 첫 장에서 잘리는
 * 잘 알려진 원인이고, design.md §6이 못 박은 규칙(**`overflow`/
 * `max-height` 제약을 건 요소는 반드시 `@media print`에서 풀어야
 * 한다**)에 정면으로 걸린다. 그런데 인라인 스타일은 `!important`가
 * 아니면 CSS로 덮을 수 없다 — 공용 스타일시트에 `!important`를 심는
 * 것은 그 자체로 다음 함정이 된다.
 *
 * 클래스로 걸면 `@media print`가 같은 특정도의 규칙 하나로 조용히
 * 푼다(`styles.css`, `scripts/printCss.test.ts`가 캐스케이드까지
 * 확인한다). 덤으로 **다른 코드가 쓴 `body.style.overflow`를 덮어쓰지
 * 않는다** — 예전 구현은 잠글 때 값을 기억했다가 풀 때 그대로 되돌려,
 * 그 사이 다른 곳이 쓴 값을 조용히 지웠다. 클래스는 인라인 스타일을
 * 아예 건드리지 않는다.
 *
 * **이 상수가 `src/print/`에 있는 이유:** 이름이 공유돼야 하는 이유가
 * 인쇄 계약이기 때문이다. `scripts/printCss.test.ts`가 이 이름으로
 * `styles.css`를 검사하므로, 클래스명을 바꾸면 CSS와 컴포넌트와 검사가
 * 함께 움직인다(같은 이유로 `hiddenInPrint.ts`도 여기 있다).
 */
export const BODY_SCROLL_LOCK_CLASS = "body-scroll-locked";

/**
 * 지금 문서 스크롤을 잠그고 있는 레이어들.
 *
 * **왜 세어야 하는가(Task 4에서 실제로 겪은 버그).** 전체화면 레이어가
 * 둘이 됐다 — 화면 1(`EntryScreen`)과 화면 2의 셸(`ResultShell`)이다.
 * 그리고 둘은 **동시에 살아 있다**: `phase === "입력"`인 동안에도 결과
 * 트리는 언마운트되지 않고 오버레이 뒤에 깔려 있다(App.tsx의 `phase`
 * 주석).
 *
 * 각자 마운트에서 클래스를 붙이고 정리에서 떼면, 나중에 붙인 쪽이
 * 아니라 **먼저 떼는 쪽**이 이긴다: 프로필을 채우는 순간 셸이 마운트돼
 * 클래스를 붙이고, 지역 조회가 성공해 `phase`가 "결과"로 넘어가면
 * `EntryScreen`의 effect 정리가 그 클래스를 떼어 버린다 — 셸은 여전히
 * 떠 있는데 잠금만 사라져, 전체화면 뒤로 아무것도 움직이지 않는
 * 페이지 스크롤바가 다시 생긴다. (테스트가 이걸 잡았다.)
 *
 * 그래서 "누가 붙였나"가 아니라 **"지금 잠글 이유가 하나라도 있나"**로
 * 판단한다. `remove`가 아니라 매번 집합에서 다시 계산하므로, 밖에서
 * 누가 클래스를 손대도 다음 잠금·해제에서 스스로 맞춰진다.
 */
const holders = new Set<symbol>();

function syncBodyScrollLock(): void {
  document.body.classList.toggle(BODY_SCROLL_LOCK_CLASS, holders.size > 0);
}

/**
 * 문서 스크롤을 잠근다. 돌려받은 함수를 부르면 **그 잠금 하나**가
 * 풀린다 — 다른 레이어가 아직 잠그고 있으면 클래스는 그대로 남는다.
 *
 * 여러 번 풀어도 안전하다(리액트 19의 effect 정리는 한 번만 불리지만,
 * 두 번 불려도 다른 레이어의 잠금을 대신 풀어 버리지 않아야 한다).
 *
 * 인라인 스타일을 쓰지 않는 이유는 위 상수 주석에 있다 — 인쇄에서
 * 풀 수 있어야 한다.
 */
export function lockBodyScroll(): () => void {
  const holder = Symbol("body-scroll-lock");
  holders.add(holder);
  syncBodyScrollLock();
  return () => {
    if (!holders.delete(holder)) return;
    syncBodyScrollLock();
  };
}
