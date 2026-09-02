/**
 * "조건 다시 넣기"(상단바에서 화면 1로 돌아가는 버튼)에 붙는 아이콘
 * (사용자 지시: 글자 라벨 대신 홈 아이콘으로).
 *
 * `ChevronIcon`·`DetailViewIcon`과 같은 관례를 따른다 — 인라인 SVG,
 * `aria-hidden`(접근 가능한 이름은 버튼의 `aria-label`이 진다),
 * `stroke="currentColor"`(색은 버튼 규칙 하나로 정해진다).
 */
export function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 8 9 2.5 15.5 8" />
      <path d="M4 6.75V15h10V6.75" />
      <path d="M7 15v-4.5h4V15" />
    </svg>
  );
}
