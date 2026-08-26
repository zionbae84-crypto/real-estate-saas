import { formatWon } from "../format/won";
import { burdenGrade, plainGrade } from "../lib/burden-grade";
import type { SafetyScore } from "../lib/finance";
import { landLeaseRules } from "../state/landLeaseRules";

export interface SafetyBadgeProps {
  safety: SafetyScore;
  /**
   * 이 배지가 **특정 평형**에 대한 것일 때만 넘긴다
   * (`ComplexUnit.landLeasehold` 값을 그대로).
   *
   * 넘기지 않으면 이 배지는 어떤 집도 가리키지 않는다는 뜻이다 — 화면
   * 위쪽의 한도 배지가 그렇다(프로필과 슬라이더 가격으로만 잰다).
   * 그 자리에서는 등급을 붙들 근거가 없다: 토지임대부는 집의 성질이지
   * 프로필의 성질이 아니다. **`"N"`을 대신 넘기지 않는다** — 그건
   * "토지임대부가 아니다"라고 말하는 것이고, 우리는 그렇게 말한 적이
   * 없다.
   */
  landLeasehold?: "Y" | "N" | null;
  /**
   * 등급이 왜 거기서 멈췄는지를 이 배지가 **직접** 설명하는가. 기본은
   * 설명한다.
   *
   * `false`를 주는 자리는 하나뿐이다: 배지가 둘 뜨는 화면(단지 상세)의
   * **위쪽** 배지. 두 배지가 같은 평형을 두고 같은 문장을 말하면 한
   * 화면에 똑같은 경고가 두 번 뜨고, 그러면 둘 다 잡음으로 읽힌다
   * (`LandLeaseNote`가 화면별로 문장을 가른 이유와 같다). 등급 **글자**
   * 자체는 두 배지 모두에 그대로 남는다 — 지우는 것은 설명뿐이라, 위
   * 배지가 아래 배지보다 낙관적으로 말하는 일은 생기지 않는다.
   */
  explainGrade?: boolean;
  /**
   * 이 배지가 어느 질문에 답하는지 알려주는 한 줄.
   *
   * 단지 상세 화면에서는 배지가 **둘** 뜬다: 위(헤드라인)는 한도까지
   * 최대로 빌렸을 때, 아래(상세)는 이 집을 샀을 때다. 마크업이 같고
   * 라벨이 없으면 어느 쪽이 "이 집을 사면"의 답인지 알 수 없는데,
   * 하필 더 낙관적인 쪽이 매물 옆에 붙어 읽히기 쉽다.
   *
   * 라벨은 색이 아니라 **글자**로 구분한다 — 색만으로 의미를 전달하지
   * 않는다는 이 앱의 규칙이자, 배지 색은 이미 등급(안전·주의·위험)이
   * 쓰고 있어 겹칠 자리도 없다.
   *
   * 배지가 화면에 하나뿐일 때(목록 화면)는 비워 둔다 — 구분할 것이
   * 없는데 라벨이 붙으면 잡음이다.
   */
  label?: string;
  /**
   * 이 배지가 **숫자까지** 낼 것인가(월 상환액·부담률·금리 상승
   * 시나리오). 기본은 낸다.
   *
   * `false`를 주는 자리는 하나뿐이다: 단지 상세(design.md §6). 그
   * 화면은 "매달 나가는 돈" 블록이 같은 숫자를 Stat Block 배치로
   * 이미 크게 내고, 금리 상승 시나리오는 그 아래 `<details>`로
   * 접는다 — 배지가 같은 값을 세로 `<dl>`로 한 번 더 내면 한 화면에
   * 같은 숫자가 두 번 박힌다(사용자가 스크린샷으로 지적한 그 자리다).
   *
   * **등급과 그 근거는 지우지 않는다.** 이 prop이 지우는 것은 값
   * 표시뿐이고, 등급 글자(`safety-level`)·등급 근거
   * (`safety-grade-note`)·현금 구매일 때 등급 귀속 설명은 그대로
   * 남는다 — 앞의 둘은 `MUST_SURVIVE_PRINT_CLASSES`
   * (`src/print/hiddenInPrint.ts`)에 올라 있는 보호 대상이다.
   *
   * `explainGrade`와 같은 갈래의 prop이다: 한 화면에 같은 말이 두 번
   * 나오는 것을 막되, **더 낙관적인 쪽만 남는 방향으로는 절대 자르지
   * 않는다.**
   */
  showFigures?: boolean;
}

/**
 * 등급 글자와 색.
 *
 * 목록의 행 배지와 **같은 함수**에서 나온다(`lib/burden-grade.ts`).
 * 두 화면이 각자 등급을 정하면 같은 집을 두고 목록은 "확인 필요",
 * 상세는 "안전"이라고 말하는 일이 생긴다 — 그 어긋남은 눈에 잘 띄지
 * 않는데, 하필 더 낙관적인 쪽이 매물 옆에 붙어 읽힌다.
 */
export function SafetyBadge({
  safety,
  label,
  landLeasehold,
  explainGrade = true,
  showFigures = true,
}: SafetyBadgeProps) {
  const grade =
    landLeasehold === undefined
      ? plainGrade(safety.level)
      : burdenGrade(safety.level, landLeasehold, landLeaseRules);

  return (
    <section className="safety-badge" data-level={grade.level}>
      {label !== undefined && <p className="safety-badge-label">{label}</p>}
      <p className="safety-level">{grade.label}</p>
      {/*
        등급이 왜 거기서 멈췄는지는 등급 글자 **바로 아래**에서 말한다.
        아래 월 상환액·부담률을 읽기 전에 그 숫자가 무엇을 빠뜨렸는지
        알아야 한다 — 숫자를 다 읽은 뒤에 말하면 이미 늦다.
      */}
      {grade.note !== null && explainGrade && (
        <p className="safety-grade-note">{grade.note}</p>
      )}

      {showFigures && (
        <>
          <dl>
            <div>
              <dt>월 상환액</dt>
              <dd data-field="payment">{formatWon(safety.monthlyPayment)}</dd>
            </div>
            <div>
              <dt>소득 대비 상환부담률</dt>
              <dd data-field="ratio">{formatRatio(safety.burdenRatio)}</dd>
            </div>
          </dl>

          <p className="safety-stress">
            금리가 2%p 오르면 <StressFigures safety={safety} />
          </p>
        </>
      )}

      {safety.monthlyPayment === 0 && (
        <ZeroPaymentNote safety={safety} showFigures={showFigures} />
      )}
    </section>
  );
}

/**
 * 금리가 2%p 올랐을 때의 값 두 개(월 상환액·부담률).
 *
 * **문장에서 떼어 낸 이유.** 단지 상세는 이 시나리오를 `<details>`로
 * 접고 `summary`에 "금리가 2%p 오르면"을 적는다 — 그러면 펼친 내용이
 * 값만 담아야 한다(인쇄에서는 강제로 펼쳐지므로, 값 쪽에도 같은
 * 접두사가 있으면 종이에 같은 문장이 두 번 찍힌다). 값의 **표기**는
 * 두 화면이 나눠 갖되 문장 조립만 갈린다 — 숫자를 만드는 자리는
 * 여전히 하나다.
 */
export function StressFigures({ safety }: { safety: SafetyScore }) {
  return (
    <>
      월{" "}
      <span className="stressed-payment">
        {formatWon(safety.stressedMonthlyPayment)}
      </span>
      , 부담률 {formatRatio(safety.stressedBurdenRatio)}
    </>
  );
}

/**
 * 대출 없이 전액 현금으로 사는 경우(monthlyPayment === 0)를 설명한다.
 *
 * 엔진(safety.ts)은 소득이 0이면 burdenRatio를 Infinity로 돌려주고, 그
 * 값이 danger 임계값을 넘으므로 level은 "위험"이 된다 — 이것은 엔진의
 * 올바른 판단이며 이 컴포넌트는 절대 second-guess하지 않는다(level을
 * 재계산하거나 숨기지 않는다). 다만 화면만 보면 "월 상환액 0원"과
 * "위험" 배지가 나란히 있어 모순처럼 보인다. 실제로는 상환 부담이 큰
 * 것이 아니라 소득 정보 자체가 없어(또는 0이어서) 부담률을 계산할
 * 분모가 없다는 뜻이므로, 그 사실을 옆에 풀어 적어 준다.
 *
 * 소득이 0이 아닌데 우연히 상환액이 0인 경우(전액 현금 구매 + 실소득
 * 있음)는 burdenRatio가 유한(0)해 등급이 이미 "안전"으로 정확히
 * 나오므로, 등급 귀속에 대한 설명 없이 "대출이 없다"는 사실만 짚는다.
 *
 * **`showFigures`가 false면 그 둘째 갈래는 내지 않는다.** 그 자리(단지
 * 상세)에서는 바로 아래 "매달 나가는 돈" 블록이 이미 "대출 없이 살 수
 * 있어요"라고 크게 말하고 있어, 같은 사실을 배지가 한 번 더 적으면
 * 화면이 두 번 말한다. **첫째 갈래(소득 정보가 없어 등급이 그렇게 나온
 * 것이라는 설명)는 어느 경우에도 지우지 않는다** — 그 문장이 없으면
 * "위험" 배지와 "대출 없이 살 수 있어요"가 나란히 서서 서로를
 * 반박하는 화면이 된다.
 */
function ZeroPaymentNote({
  safety,
  showFigures,
}: {
  safety: SafetyScore;
  showFigures: boolean;
}) {
  if (!Number.isFinite(safety.burdenRatio)) {
    return (
      <p className="safety-note">
        대출 없이 전액 현금으로 사는 경우예요. 이 등급은 상환 부담이
        아니라 소득 정보가 없다는 사실을 반영해요.
      </p>
    );
  }

  if (!showFigures) return null;

  return (
    <p className="safety-note">대출 없이 전액 현금으로 사는 경우예요.</p>
  );
}

/**
 * 부담률 한 값의 표기. **이 함수 하나가 유일한 출처다** — 단지 상세의
 * "소득 대비 22.0%" 한 줄도 여기서 만든다. 서식이 두 자리에서 따로
 * 정해지면 같은 값이 화면마다 다른 자릿수로 찍힌다.
 *
 * 소득이 없으면 0%가 아니라 "소득 없음"이다. 맨숫자 0은 답의 모양을 한
 * 거짓말이라는 이 저장소의 규칙이 여기에도 걸린다.
 */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "소득 없음";
  return `${(ratio * 100).toFixed(1)}%`;
}
