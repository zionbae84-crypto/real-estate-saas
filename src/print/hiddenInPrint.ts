/**
 * 인쇄할 때 화면에서 지우는 요소들의 CSS 선택자 목록.
 *
 * **이 배열이 유일한 출처(source of truth)다.** `src/styles.css`의
 * `@media print` 블록은 정확히 이 선택자들에만 숨김 규칙(`display: none`)을
 * 건다 — `src/print/printCss.test.ts`가 두 쪽이 항상 일치하는지 검사한다.
 * CSS만 고치고 여기를 빼먹거나, 반대로 여기만 늘리고 CSS를 안 고치면
 * 그 테스트가 잡는다.
 *
 * 여기 오르는 것은 전부 "종이 위에서는 조작할 수 없는 상호작용 장치"다.
 * 값·문구(등급·경고·면책·가정·전제) 표시는 **절대 이 목록에 있으면
 * 안 된다** — {@link MUST_SURVIVE_PRINT_CLASSES}에 있는 클래스명은 여기
 * 선택자 어디에도 등장하면 안 되고, `printCss.test.ts`가 그 경계를
 * 지킨다.
 */
export const PRINT_HIDDEN_SELECTORS: readonly string[] = [
  // 프로필 입력 폼 전체(현금·소득·생애최초·기존부채·규제지역·전용면적
  // 입력란). 값 자체는 지우지 않는다 — `PrintSummary`가 같은 값을 종이에
  // 맞는 평문으로 별도로 인쇄한다(App.tsx 참고). 입력란만 골라 숨기는
  // 대신 폼 전체를 숨기기로 한 이유: SEED TextField·Checkbox는 라벨·
  // 힌트·입력란이 한 덩어리로 묶여 있어 "입력란만" 골라내려면 SEED 내부
  // DOM 구조에 의존해야 하는데, 그 구조는 우리가 보장할 수 있는 계약이
  // 아니다(seed-design/ui/*는 벤더 스니펫이라 수정 금지). 폼 전체를
  // 지우고 값을 별도로 인쇄하면 이 의존을 아예 없앤다.
  ".profile-form",
  // 가격 슬라이더의 드래그 컨트롤(SEED Slider). 종이에서는 끌 수 없는
  // 장치다. 슬라이더가 가리키는 **값**(`.slider-price`)과 한계 경고
  // (`.slider-warning`)는 아래 위쪽 대출 배지가 바로 그 가격 기준으로
  // 계산되므로(전제) 지우지 않는다 — PriceSlider.tsx가 이 값들을 드래그
  // 컨트롤과 분리된 형제 요소로 둔 이유다.
  ".price-slider-control",
  // 지역(시군구) 다중 선택 체크박스. 부모 스펙이 인쇄에서 지울 항목으로
  // 명시했다. 선택한 지역이 남긴 흔적(규제지역 반영·목록에 뜬 단지들의
  // 법정동명)은 이미 다른 자리에 남아 있어 별도 텍스트로 되살리지
  // 않는다.
  ".region-filter",
  // 인쇄 버튼 자신. 종이에는 누를 버튼이 없다.
  ".print-button",
  // 목록을 더 불러오는 버튼. 지금 화면에 이미 펼쳐진 행 너머로는 데이터가
  // 로드돼 있지 않으므로 버튼을 지워도 잃는 정보가 없다 — 누를 수도 없다.
  ".complex-more",
  // 단지 상세에서 목록으로 돌아가는 버튼. 종이에는 "뒤로 갈" 목록 화면이
  // 없다.
  ".complex-detail-back",
];

/**
 * 인쇄물에서 **절대 사라지면 안 되는** 요소들의 클래스 이름(선택자
 * 문법 없이, 순수 클래스명만).
 *
 * `printCss.test.ts`가 {@link PRINT_HIDDEN_SELECTORS}의 어떤 선택자에도
 * 이 이름들이 등장하지 않는지 검사한다. 나중에 누군가 숨김 범위를
 * 넓히다가(예: `.warning-list`를 실수로 추가) 등급·경고·면책·가정·전제가
 * 함께 사라지는 사고를 여기서 막는다.
 */
export const MUST_SURVIVE_PRINT_CLASSES: readonly string[] = [
  "safety-level", // 등급 글자(안전/주의/위험) — SafetyBadge
  "complex-level", // 목록 행의 등급 글자 — ComplexList
  "complex-burden", // 등급을 감싸는 행 요소 자체
  "safety-badge", // 등급 배지 섹션 전체
  "warning-list", // 엔진이 낸 경고
  "disclaimer", // 면책 문구(footer)
  "assumption-line", // 가정 문구 목록(무엇을 가정했는지)
  "assumption-item", // 가정 문구(고칠 수 있는 항목) — 버튼 겉모양만 지운다
  "assumption-notice", // 가정 문구(순수 정보 항목)
  "print-summary", // 전제(입력값)·룰셋 기준·인쇄일 요약
  "slider-price", // 슬라이더가 가리키는 가격(아래 배지 계산의 전제)
  "slider-warning", // 그 가격이 한계라는 안내
  "safe-line", // 안전선
  "binding-explainer", // 무엇이 한도를 막았는지 설명
  "cost-breakdown", // 부대비용 내역
  "policy-loan-list", // 정책대출 목록
  "no-budget", // 예산 0원 안내
];
