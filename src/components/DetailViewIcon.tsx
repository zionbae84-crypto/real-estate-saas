/**
 * "상세보기" 트리거에 붙는 아이콘(사용자 지시: "이부분 아이콘을
 * 상세보기 로 변경해줘").
 *
 * 모양은 **오른쪽을 가리키는 홑화살괄호**다. 대출 한도의 "결정 내역"
 * 팝업이 이제 이 아이콘 자리에서 **오른쪽으로**(지도가 있는 넓은
 * 칸 쪽으로) 열리므로(`ComplexDetail.tsx`의 `.detail-binding-popup`
 * 문서 참고), 열리는 방향을 가리키는 화살표가 "여기를 누르면 오른쪽에
 * 상세가 열린다"는 뜻을 그림으로도 전한다.
 *
 * `ChevronIcon`(아래 방향, "이 자리에서 펼쳐진다")과 일부러 다른
 * 파일로 둔다 — 그 아이콘은 열림·닫힘을 180도 회전으로 보이는 계약을
 * 지니는데, 이 아이콘은 회전하지 않는다(방향 자체가 "오른쪽 어딘가에
 * 상세가 있다"는 뜻이라 열림 상태와 무관하게 고정이다).
 */
export function DetailViewIcon() {
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
      <path d="M6 4 10 8 6 12" />
    </svg>
  );
}
