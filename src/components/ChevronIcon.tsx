/**
 * 접힌 것을 펼치는 트리거에 붙는 아이콘. 이 저장소에 아이콘 컴포넌트
 * 선례가 없어 인라인 SVG로 둔다(아이콘 하나 때문에 라이브러리를 들이지
 * 않는다).
 *
 * 모양은 **아래를 가리키는 홑화살괄호(chevron)**다. 정보(ⓘ)가 아니라
 * 화살표를 고른 이유: 이 버튼이 여는 것은 설명이 아니라 **이 자리에서
 * 아래로 펼쳐지는 카드**이고, 열림·닫힘 상태를 회전 하나로 그대로 보일
 * 수 있다(`.cost-breakdown[open]`·`.loan-calc[open]`에서 180° 돈다 —
 * styles.css).
 *
 * `aria-hidden`인 이유는 접근 가능한 이름을 `<summary>`가 지기
 * 때문이다. 이름을 둘 다 주면 스크린리더가 같은 말을 두 번 읽는다.
 * `stroke="currentColor"`라 색은 버튼 규칙 하나만 정하면 된다.
 *
 * **파일로 꺼낸 이유:** 같은 아이콘을 쓰는 자리가 둘이 됐다(취득시
 * 부대비용 내역 · 매달 나가는 돈 계산기). 두 벌로 두면 한쪽만 바뀌어
 * 같은 화면에서 서로 다른 화살표가 뜨는 날이 온다 — 그림 자체가
 * "여기를 누르면 아래로 펼쳐진다"는 하나의 약속이라 출처도 하나여야
 * 한다. 꺼내면서 모양·속성은 한 글자도 바꾸지 않았다.
 */
export function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5 8 10.5 12 6.5" />
    </svg>
  );
}
