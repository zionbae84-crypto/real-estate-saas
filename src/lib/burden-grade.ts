import type { SafetyLevel } from "./finance";
import type { LandLeaseRules } from "./land-lease";

/**
 * 화면에 실제로 보이는 부담 등급.
 *
 * 엔진의 {@link SafetyLevel}(safe·caution·danger)에 네 번째 값이 하나
 * 붙는다 — `"unverified"`. **엔진의 계산을 고친 것이 아니다.** 부담률도
 * 월 상환액도 그대로이고, 달라지는 것은 그 숫자에 우리가 몇 등급을
 * 매겨 주느냐뿐이다.
 */
export type BurdenGradeLevel = SafetyLevel | "unverified";

/** 엔진 등급의 이름. 색이 아니라 이 글자가 등급을 진다 */
const LEVEL_LABELS: Record<SafetyLevel, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
};

/** 화면이 그대로 그리는 한 덩어리 */
export interface BurdenGrade {
  /** `data-level` 고리이자 덩어리를 가르는 기준 */
  level: BurdenGradeLevel;
  /** 등급 칸에 들어가는 글자 */
  label: string;
  /** 등급이 거기서 멈춘 이유. 멈추지 않았으면 `null` */
  note: string | null;
  /**
   * "대출 없이 살 수 있어요" 옆에 반드시 함께 읽혀야 하는 단서.
   * 우리 숫자가 이 집의 매달 부담을 다 담을 때는 `null`.
   */
  noLoanNote: string | null;
}

/**
 * 우리가 계산한 월 상환액이 이 집에서 **매달 나가는 돈 전부**인가.
 *
 * `"N"`(토지임대부가 아님)일 때만 참이다. `"Y"`는 토지 사용료가 매달
 * 따로 나가고, `null`은 그런지 아닌지를 우리가 모른다 — 둘 다 우리
 * 숫자가 부족하다는 점에서는 같다. **모름을 "아님"으로 접지 않는다**
 * (`src/lib/land-lease/notice.ts`가 표시를 가르는 것과 같은 갈래다).
 */
export function burdenIsComplete(landLeasehold: "Y" | "N" | null): boolean {
  return landLeasehold === "N";
}

/**
 * 화면에 보일 등급을 정한다. **목록의 덩어리 분기와 행 배지가 둘 다
 * 이 함수 하나에서 나온다.**
 *
 * `safe`만 붙든다:
 *
 * - `safe` + (`"Y"`·`null`) → `"unverified"`. 이 앱에서 가장 강한 안심
 *   등급을, 우리가 스스로 불완전하다고 인정하는 숫자 위에 얹지 않는다.
 *   구매 유형 진단이 검증하지 못한 대출 원금 때문에 전체 결론을
 *   `clear`로 내리지 않는 것과 같은 판단이다
 *   (`src/lib/purchase/assess.ts`의 `hasUnverifiedLoanPrincipal`).
 * - `caution`·`danger`는 그대로 둔다. 이미 안심시키는 말이 아니고,
 *   거기에 "확인 필요"를 덧씌우면 오히려 경고가 약해진다.
 * - `"N"`인 행은 어떤 입력에서도 이 함수를 지나기 **전과 똑같다.**
 *
 * 토지 사용료를 추정하지 않는다 — 데이터에 없다. 부담률도 월 상환액도
 * 다시 계산하지 않고, 우리가 낸 숫자에 붙이는 **이름**만 바꾼다.
 */
export function burdenGradeLevel(
  safetyLevel: SafetyLevel,
  landLeasehold: "Y" | "N" | null,
): BurdenGradeLevel {
  if (burdenIsComplete(landLeasehold)) return safetyLevel;
  return safetyLevel === "safe" ? "unverified" : safetyLevel;
}

/**
 * 등급과 그 등급이 쓰는 문구.
 *
 * **문구는 전부 룰셋에서 온다**(`rules/land-lease-2026-08.json`의
 * `grade`). 판정을 바꾸는 근거를 코드에 박으면 다음 사람이 화면만 보고
 * 고칠 수 없다.
 */
export function burdenGrade(
  safetyLevel: SafetyLevel,
  landLeasehold: "Y" | "N" | null,
  rules: LandLeaseRules,
): BurdenGrade {
  if (burdenIsComplete(landLeasehold)) return plainGrade(safetyLevel);

  const level = burdenGradeLevel(safetyLevel, landLeasehold);
  return {
    level,
    label: level === "unverified" ? rules.grade.label : LEVEL_LABELS[safetyLevel],
    note: level === "unverified" ? rules.grade.note : null,
    // 등급이 내려가지 않는 caution·danger에서도 붙는다. 대출이 0원인
    // 것과 매달 나가는 돈이 없는 것은 별개이고, 그 오해는 등급과
    // 무관하게 생긴다.
    noLoanNote: rules.grade.noLoanNote,
  };
}

/**
 * "대출 없이 살 수 있어요" 옆에 함께 읽혀야 하는 단서. 없으면 `null`.
 *
 * 등급과 **따로** 낸다. 대출이 0원인데 등급이 `danger`인 경로가 실제로
 * 있고(소득이 0이면 부담률이 무한대가 된다), 그때도 "매달 나가는 돈이
 * 없다"는 오해는 똑같이 생기기 때문이다.
 */
export function noLoanCaveat(
  landLeasehold: "Y" | "N" | null,
  rules: LandLeaseRules,
): string | null {
  return burdenIsComplete(landLeasehold) ? null : rules.grade.noLoanNote;
}

/**
 * 특정 평형에 대한 배지가 아닐 때의 등급.
 *
 * 화면 위쪽 한도 배지처럼 **어떤 집도 가리키지 않는** 자리가 있다.
 * 거기서는 내릴 근거가 없다 — 토지임대부 여부는 집의 성질이지 프로필의
 * 성질이 아니다. `"N"`을 넘기는 것과 결과는 같지만, "토지임대부가
 * 아니다"라고 말한 적 없다는 것을 부르는 쪽에서 드러내려고 갈래를
 * 따로 둔다.
 */
export function plainGrade(safetyLevel: SafetyLevel): BurdenGrade {
  return {
    level: safetyLevel,
    label: LEVEL_LABELS[safetyLevel],
    note: null,
    noLoanNote: null,
  };
}
