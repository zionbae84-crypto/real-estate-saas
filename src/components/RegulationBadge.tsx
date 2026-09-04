/**
 * 상단바 "지역" 값 옆에 붙는 규제 여부 아이콘 배지.
 *
 * ⚠ **"투기과열지구"·"조정대상지역"을 따로 구분하지 않는다.** 국토부
 * 보도자료(2026.6.30., `api/_data/regulated-regions.README.md` 참고)의
 * 참고2 현황표는 두 지정을 **정확히 같은 40개 지역**에 동시에 건다 —
 * 이 앱의 `regulated-regions.json`도 그 표를 그대로 옮긴 것이라 둘을
 * 나눠 구분할 데이터가 없다. 참고1 표도 이 앱이 계산하는 LTV(40%/0%)를
 * 둘을 가르지 않고 "규제지역"으로 함께 묶는다. 그래서 이 배지는 셋 중
 * 하나만 말한다 — 이 앱이 실제로 아는 것 이상을 말하지 않는다:
 *
 * 1. **규제지역**(확정) — 지역 조회가 `regulated-regions.json`의
 *    `regulated` 목록에 있는 지역이라고 판정했다.
 * 2. **비규제지역**(확정) — 지역 조회가 그 목록에 없는 지역이라고
 *    판정했다(목록에 없으면 비규제로 본다, README 참고).
 * 3. **규제지역(가정)** — 아직 지역을 조회하지 못했거나 조회가
 *    실패해 기본값으로 계산 중이다. `AssumptionLine`의
 *    `regulatedAreaNotice`와 같은 판단 기준
 *    (`state.touched.includes("regulatedArea")`)을 쓴다 — 두 자리가
 *    서로 다른 기준으로 "확정"을 말하면 한 화면이 두 말을 한다.
 *
 * 아이콘만으로 뜻을 전달하지 않는다 — 글자 라벨이 항상 함께 있고,
 * 아이콘은 `aria-hidden`이라 스크린리더는 라벨만 읽는다(같은 이유로
 * `ChevronIcon`도 `aria-hidden`이다).
 *
 * **짧은 설명 카드를 hover·focus로 단다**(사용자 지시: "규제지역에
 * 마우스를 올리면 간략하게 어떤 차이를 반영하는지 설명하는 내용을 볼
 * 수 있도록" → "딜레이를 최대한 빠르게", "흰색바탕(검정글씨)의
 * 카드형식으로"). `title` 속성이 아니라 `.result-topbar-tooltip`
 * (styles.css, `App.tsx`의 무주택·생애최초 토글과 같은 컴포넌트)을
 * 쓴다 — 네이티브 `title` 툴팁은 뜨기까지 1~1.5초 걸리고 배경·글자색을
 * 못 바꾼다. 이 배지는 원래 포커스를 받지 않는 순수 표시용 요소라
 * `tabIndex={0}`을 줘야 키보드로도 카드를 열 수 있다.
 *
 * 세 상태 모두 같은 문구다 — "이 배지가 무슨 뜻인가"를 설명하는
 * 자리지 "지금 상태가 어떤가"를 다시 말하는 자리가 아니라서, 값이
 * 규제든 비규제든 가정이든 갈릴 이유가 없다. LTV 40%/70%(일반 기준,
 * `rules/2026-08.json`의 `ltv`)를 여기 숫자로 박지 않는 이유는
 * 생애최초는 규제·비규제 상관없이 70%로 같아(예외가 있는 규칙을
 * "간략하게" 압축하면 그 예외가 사라진 채 전달된다) 정직하게 줄이면
 * "낮아질 수 있다"는 조건문 이상으로는 못 줄인다.
 */
const REGULATION_BADGE_EXPLANATION = "규제지역이면 대출 한도(LTV)가 낮아질 수 있어요.";

/** 세 분기가 반복해서 넣는 설명 카드 — 한 군데서만 고치면 되게 뽑아 둔다. */
function RegulationBadgeTooltip() {
  return (
    <span className="result-topbar-tooltip" role="tooltip">
      {REGULATION_BADGE_EXPLANATION}
    </span>
  );
}
export interface RegulationBadgeProps {
  /** 지역 조회가 이 판정을 확정했는가(`state.touched`) */
  determined: boolean;
  /** 규제지역으로 계산 중인가(확정이든 가정이든) */
  isRegulatedArea: boolean;
}

export function RegulationBadge({
  determined,
  isRegulatedArea,
}: RegulationBadgeProps) {
  if (determined && isRegulatedArea) {
    return (
      <span className="regulation-badge regulation-badge--regulated" tabIndex={0}>
        <LockIcon />
        규제지역
        <RegulationBadgeTooltip />
      </span>
    );
  }
  if (determined) {
    return (
      <span className="regulation-badge regulation-badge--unregulated" tabIndex={0}>
        <UnlockIcon />
        비규제지역
        <RegulationBadgeTooltip />
      </span>
    );
  }
  // !determined — 지금 룰셋에서는 언제나 isRegulatedArea === true로
  // 보수적 가정 상태다(`regulatedAreaNotice`와 같은 전제). 그 사실
  // 자체를 이 배지가 새로 판단하지 않는다 — `isRegulatedArea`가
  // 가리키는 방향을 그대로 라벨에 반영해, 나중에 기본값이 바뀌어도
  // 이 배지가 따로 고장 나지 않는다.
  return (
    <span className="regulation-badge regulation-badge--assumed" tabIndex={0}>
      <QuestionIcon />
      {isRegulatedArea ? "규제지역" : "비규제지역"}
      <span className="regulation-badge-qualifier">(가정)</span>
      <RegulationBadgeTooltip />
    </span>
  );
}

/** 잠긴 자물쇠 — 규제(제약이 걸린 상태)를 확정했을 때 */
function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.25" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/** 열린 자물쇠 — 비규제를 확정했을 때 */
function UnlockIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.25" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" />
    </svg>
  );
}

/** 물음표 — 아직 확인하지 못해 가정 중일 때 */
function QuestionIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M6.3 6.4a1.9 1.9 0 0 1 3.6.9c0 1.3-1.9 1.3-1.9 2.7" />
      <circle cx="8" cy="11.3" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
