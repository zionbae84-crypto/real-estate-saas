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
  // 화면 부제의 개인정보 보호 안내("입력한 재무정보는 이 브라우저를
  // 벗어나지 않아요"). 브라우저에 남는다는 사실 자체가 "이 브라우저"를
  // 가리키는 말이라 종이 위에서는 지시 대상이 없어 뜻이 서지 않는다.
  // 나머지 부제(룰셋 기준·수도권 범위)는 종이에서도 뜻이 있어 남긴다.
  ".subtitle-privacy-note",
  // AssumptionLine 문구 안의 "눌러서 알려주세요/바꾸세요"류 조작 지시.
  // 문구 전체를 지우면 그 항목이 무엇을 가정했는지(사실)와 고치면
  // 숫자가 어느 방향으로 움직이는지(경고)까지 함께 사라진다 — 그래서
  // 조작 지시 부분만 별도 span으로 감싸 그 부분만 지운다. 같은 문자열
  // 하나(AssumptionItem.text)에서 잘라 쓰므로 화면·인쇄용 문구를 두 벌로
  // 관리하지 않는다(AssumptionLine.tsx의 renderAssumptionText 참고).
  ".assumption-action",
  // PriceSlider 한계 경고 안의 "슬라이더를 내려 ~ 확인해 보세요" 조작
  // 지시. "이건 빌릴 수 있는 한계예요. 무리 없는 선은 따로 있어요"는
  // 이 인쇄물에서 가장 중요한 문장 중 하나라 반드시 남아야 하고, 뒤의
  // 조작 지시만 지운다.
  ".slider-action",
  // <details> summary 안의 "더 보기"/"모두 보기" 접미사. 인쇄에서는
  // <details>를 강제로 펼치므로(아래 @media print의 ::details-content
  // 규칙), 펼쳐진 내용 바로 위에서 "더 보기"라고 말하는 것은 이미 벌어진
  // 일을 하라고 시키는 죽은 지시문이 된다. 요약 문구 자체(예: "부대비용·
  // 정책대출·상세 설명", "네 가지 한도")는 펼쳐진 내용의 제목으로 여전히
  // 뜻이 있어 남긴다.
  ".fold-more-hint",
  // 권리분석 문진의 **답하는 자리**(매매 예정가 입력란·항목별 라디오·
  // 금액 입력란). 종이에서는 고를 수도 적을 수도 없다. 대신 문진이
  // 무엇을 물었고 무엇이라 답했고 무엇이 걸렸는지는 `RightsVerdict`가
  // 결과 안에 질문·답·판정·근거를 모두 다시 적으므로(그 컴포넌트 문서
  // 참고) 종이에서 잃는 정보가 없다 — `.rights-verdict` 이하는 아래
  // MUST_SURVIVE_PRINT_CLASSES가 지킨다.
  ".rights-check-form",
  // 문진 안내문 안의 "두 서류를 떼어 놓고 답해 주세요" 조작 지시.
  // 바로 위 `.rights-check-form`이 인쇄에서 지워지므로 종이에는 답할
  // 자리가 없다 — 지시 대상이 없는 말이 된다. `.fold-more-hint`·
  // `.assumption-action`·`.slider-action`과 같은 패턴으로, 안내문 전체가
  // 아니라 조작 지시 부분만 span으로 갈라 그 부분만 지운다. 어떤 서류를
  // 보고 답하는 문진인지와 "다 지나가도 안전하다고 말하지 않아요"는
  // 종이에서도 뜻이 있어 남는다.
  ".rights-check-action",
  // 구매 유형 라디오. 종이에서는 고를 수 없다 — 대신 고른 유형이
  // `.purchase-type-print` 한 줄로 남는다(PurchaseTypeSelect 참고).
  // 그 줄이 없으면 종이를 건네받은 사람은 아래 숫자들이 어떤 전제 위에
  // 서 있는지 알 수 없다.
  ".purchase-type-form",
  // 호가 입력란. 종이에서는 채울 수 없다. 무엇을 넣었고 무엇이
  // 나왔는지는 `PriceCheck`의 결과가 호가와 근거(거래 건수·실거래
  // 범위·평형)를 다시 적으므로 종이에서 잃는 정보가 없다 —
  // `.price-verdict` 이하와, 입력란 **위**의 "적절한 값이 얼마인지
  // 매기지 않아요"(`.price-no-estimate`)는 아래 MUST_SURVIVE_PRINT_CLASSES가
  // 지킨다. 그 한 줄이 사라지면 종이를 건네받은 사람이 아래 판정을
  // "적정가 판정"으로 읽는다.
  ".price-check-form",
  // 갭투자·월세 수익형의 **값 입력란**(매매 예정가·보증금·현금·월세·
  // 운영비용·대출 답). 종이에서는 채울 수 없다. 무엇을 넣었고 무엇이
  // 나왔는지는 `PurchaseVerdict`가 결과 안에 값과 판정을 다시 적으므로
  // 종이에서 잃는 정보가 없다 — `.purchase-verdict` 이하와, 그 위의
  // `.purchase-loan-note`("한도는 계산하지 않아요")는 아래
  // MUST_SURVIVE_PRINT_CLASSES가 지킨다.
  ".purchase-form",
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
  "safety-level", // 등급 글자(안전/주의/위험/확인 필요) — SafetyBadge
  "complex-level", // 목록 행의 등급 글자 — ComplexList
  "complex-burden", // 등급을 감싸는 행 요소 자체
  // 등급이 "안전"까지 가지 않고 멈춘 이유(토지임대부·모름). 종이에서
  // 사라지면 낯선 등급 글자만 남아, 종이를 건네받은 사람은 무엇이
  // 부족해서 멈춘 것인지 알 수 없다.
  "safety-grade-note", // 상세 배지 아래
  "complex-grade-note", // 목록 행의 등급 옆
  // "대출 없이 살 수 있어요" 옆의 단서. 이 단서가 빠지면 종이에는 이
  // 앱에서 가장 강한 안심 문구만 남는다.
  "complex-no-loan-caveat",
  // 토지임대부 표시. 종이에서 사라지면 안 되는 것 중에서도 무거운
  // 축이다 — 이 종이의 월 상환액에는 매달 나가는 토지 사용료가 들어
  // 있지 않고(우리 데이터에 금액이 없다), 그 사실이 빠지면 종이를
  // 건네받은 사람은 남은 숫자를 매달 나가는 돈 전부로 읽는다.
  // 모른다는 표시(`unknown`)도 같은 이유로 남아야 한다 — 빈 자리는
  // "토지임대부가 아니다"로 읽힌다.
  "land-lease-note", // 표시 전체(목록 행·상세·호가 세 화면 공용)
  "land-lease-badge", // 색이 아니라 글자로 존재하는 그 표시
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
  // 권리분석 문진의 결과. 이 앱에서 가장 무거운 경고가 여기 있다 —
  // 종이에서 사라지면 안 되는 것의 목록에 등급 글자·항목별 판정·
  // 기존 권리 합계·면책 문구를 모두 올린다.
  "rights-verdict", // 결과 영역 전체
  "rights-overall", // 전체 결론 글자(사면 안 돼요 / … / 걸리는 게 없었어요)
  "rights-finding", // 항목별 판정 줄
  "rights-finding-verdict", // 그 줄의 등급 글자
  "rights-encumbrance", // 기존 권리 합계 계산
  "rights-disclaimer", // 법률 자문이 아니라는 것과 잔금 직전 재확인
  // 구매 유형별 재무 지표. 이 화면에서 가장 무거운 말은 "이 유형의
  // 대출 한도는 우리가 계산하지 않아요"다 — 종이에서 그것이 사라지면
  // 남은 지표들만 보고 한도가 문제되지 않는 것으로 읽는다.
  "purchase-type-print", // 이 종이가 어떤 구매 유형을 전제하는가
  "purchase-print-summary", // 입력값·인쇄일·어느 구매 유형 룰셋 기준인가
  "purchase-loan-note", // 한도를 계산하지 않는다는 사실과 그 이유
  "purchase-verdict", // 결과 영역 전체
  "purchase-overall", // 전체 결론 글자
  "purchase-metric", // 지표별 판정 줄
  "purchase-metric-verdict", // 그 줄의 등급 글자
  "purchase-metric-warning", // 보증금이 DSR에 안 잡힌다는 경고
  "purchase-stage", // 역전세 하락 단계별 필요 금액과 감당 여부
  "purchase-disclaimer", // 투자 자문이 아니라는 것과 전망하지 않는다는 것
  // 호가 위치 확인. 이 화면에서 가장 무거운 말은 판정이 아니라
  // **고지**다 — 층·향이 이 범위에 없다는 사실과 실거래 신고가 늦다는
  // 사실이 종이에서 사라지면, 남은 판정만 보고 우리가 틀린 확신을 준다.
  "price-no-estimate", // 이 화면이 값을 매기지 않는다는 사실
  "price-verdict", // 결과 영역 전체
  "price-overall", // 전체 결론 글자(멈춰 주세요 / 유보했어요 / …)
  "price-evidence", // 이 판단이 몇 건에 근거하는가(거래 건수·실거래 범위)
  "price-finding", // 줄별 판정
  "price-finding-verdict", // 그 줄의 등급 글자
  "price-budget-absent", // 예산 줄을 계산하지 않았다는 사실
  "price-disclosure", // 층·향 미반영·신고 지연·"바가지라는 뜻이 아니다"
  "price-disclaimer", // 감정평가가 아니라는 것과 전망하지 않는다는 것
  // 입지 사실. 이 영역에는 조작 장치가 하나도 없어 숨길 것이 없고,
  // 여기서 가장 무거운 말인 **고지**는 종이에서 더 중요하다 — 종이를
  // 건네받은 사람은 화면의 다른 맥락을 보지 못했다. 특히 학구도 고지가
  // 사라지면, 남은 학교 목록이 배정 결과처럼 읽힌다.
  "location-facts", // 영역 전체
  "location-state", // 지금이 "아직 위치를 몰라요"인지 아닌지의 글자
  "location-state-note", // 왜 그 상태인지(좌표를 못 구했다는 사실)
  "location-fact", // 역·학교 줄
  "location-fact-message", // 그 줄이 못 쟀으면 왜 못 쟀는지
  "location-school-list", // 반경 안의 학교들
  "location-distance", // 거리 값과 그 옆의 "직선거리" 라벨
  "location-disclosure", // 직선거리·학구도·소음 등 미반영·등급 아님
  "location-disclaimer", // 입지 평가가 아니라는 것과 반경이 법정 기준이 아니라는 것
  // 진단 종합. 조작 장치가 하나도 없어 숨길 것이 없고, 종이에서 특히
  // 값어치가 크다(배우자·부모님에게 건네는 문서에서 "무엇을 봤고 무엇을
  // 못 봤는지"를 한자리에서 말하는 자리이기 때문이다). 못 본 축 줄이
  // 사라지면 안 본 축이 "문제없음"으로 읽힌다.
  "diagnosis-summary", // 영역 전체
  "diagnosis-summary-headline", // 헤드라인 글자(사면 안 되는 신호가 있어요 / …)
  "diagnosis-summary-headline-note", // 헤드라인 설명(expert 부기 포함)
  "diagnosis-summary-axis", // 축별 줄(권리·구매·호가·입지 — notLooked 포함 언제나 네 줄)
  "diagnosis-summary-axis-status", // 그 줄의 상태 글자
  "diagnosis-summary-target-mismatch", // 등기부 대상과 목록에서 고른 매물이 같은 집이라는 보장이 없다는 고지
  "diagnosis-summary-disclaimer", // 새 판정이 아니라는 것과 점수로 뭉치지 않는다는 것
];
