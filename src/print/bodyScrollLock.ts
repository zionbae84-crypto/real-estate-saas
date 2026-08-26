/**
 * 화면 1(`EntryScreen`)이 떠 있는 동안 문서 스크롤을 잠그는 `<body>`
 * 클래스 이름.
 *
 * **왜 인라인 스타일이 아니라 클래스인가(재검토 수정 Critical 2).**
 * 예전에는 `EntryScreen`이 `document.body.style.overflow = "hidden"`을
 * 직접 썼다. 그 잠금은 `phase === "입력"`인 내내 걸려 있는데, 바로 그
 * 상태가 앞선 리뷰(Critical 1)가 "인쇄할 수 있어야 한다"고 고친 상태다
 * — 그 화면의 인쇄 버튼은 지금 `inert`라 Cmd+P가 유일한 경로다.
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
