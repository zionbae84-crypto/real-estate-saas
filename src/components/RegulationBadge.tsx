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
 *    `regulated` 목록에서 판정을 받았다.
 * 2. **비규제지역**(확정) — `nonRegulated` 목록에서 판정을 받았다.
 * 3. **규제지역(가정)** — 목록 어디에도 없어 보수적 기본값으로
 *    계산했다. `AssumptionLine`의 `regulatedAreaNotice`와 같은 판단
 *    기준(`state.touched.includes("regulatedArea")`)을 쓴다 — 두
 *    자리가 서로 다른 기준으로 "확정"을 말하면 한 화면이 두 말을 한다.
 *
 * 아이콘만으로 뜻을 전달하지 않는다 — 글자 라벨이 항상 함께 있고,
 * 아이콘은 `aria-hidden`이라 스크린리더는 라벨만 읽는다(같은 이유로
 * `ChevronIcon`도 `aria-hidden`이다).
 */
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
      <span className="regulation-badge regulation-badge--regulated">
        <LockIcon />
        규제지역
      </span>
    );
  }
  if (determined) {
    return (
      <span className="regulation-badge regulation-badge--unregulated">
        <UnlockIcon />
        비규제지역
      </span>
    );
  }
  // !determined — 지금 룰셋에서는 언제나 isRegulatedArea === true로
  // 보수적 가정 상태다(`regulatedAreaNotice`와 같은 전제). 그 사실
  // 자체를 이 배지가 새로 판단하지 않는다 — `isRegulatedArea`가
  // 가리키는 방향을 그대로 라벨에 반영해, 나중에 기본값이 바뀌어도
  // 이 배지가 따로 고장 나지 않는다.
  return (
    <span className="regulation-badge regulation-badge--assumed">
      <QuestionIcon />
      {isRegulatedArea ? "규제지역" : "비규제지역"}
      <span className="regulation-badge-qualifier">(가정)</span>
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
