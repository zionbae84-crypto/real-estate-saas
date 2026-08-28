/**
 * "이 숫자가 어떻게 나왔는지 보기" 트리거에 붙는 아이콘(사용자 지시:
 * "지금 토글형식보다 산출근거 아이콘으로 수정해줘").
 *
 * 모양은 **정보(ⓘ)**다. `ChevronIcon`의 문서가 정보 아이콘을 쓰지
 * *않은* 이유를 이렇게 적어 뒀다 — "이 버튼이 여는 것은 설명이 아니라
 * 이 자리에서 아래로 펼쳐지는 카드"라서 회전으로 열림·닫힘을 보일 수
 * 있는 화살표가 맞았다고. 그 판단이 지금은 안 맞는 자리가 생겼다:
 * 대출 한도의 "결정 내역"은 **아래로 펼쳐지는 카드가 아니라 값 옆에
 * 뜨는 설명 팝업**이고(`ComplexDetail`의 `.detail-binding-popup`),
 * 부대비용도 사용자가 "산출근거"라고 부르며 같은 성격으로 묶었다 —
 * 둘 다 "이 숫자가 왜 이런지 설명해 줘"이지 "이 카드를 접었다 폈다"가
 * 아니다. 그래서 이 아이콘은 **회전하지 않는다** — 정보 기호를
 * 180도 돌려 봐야 뜻이 안 생긴다.
 *
 * `ChevronIcon`과 같은 자리에 쓴다(같은 크기·같은 stroke 규칙) — 버튼
 * 모양(원형·테두리·호버)은 그대로 재사용하고 안의 그림만 바뀐다.
 */
export function CalcBasisIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.25" />
      <line x1="8" y1="7.25" x2="8" y2="11.25" />
      <circle cx="8" cy="4.75" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
