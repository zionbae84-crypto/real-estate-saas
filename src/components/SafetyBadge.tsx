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
        금리가 2%p 오르면 월{" "}
        <span className="stressed-payment">
          {formatWon(safety.stressedMonthlyPayment)}
        </span>
        , 부담률 {formatRatio(safety.stressedBurdenRatio)}
      </p>

      {safety.monthlyPayment === 0 && <ZeroPaymentNote safety={safety} />}
    </section>
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
 */
function ZeroPaymentNote({ safety }: { safety: SafetyScore }) {
  if (!Number.isFinite(safety.burdenRatio)) {
    return (
      <p className="safety-note">
        대출 없이 전액 현금으로 사는 경우예요. 이 등급은 상환 부담이
        아니라 소득 정보가 없다는 사실을 반영해요.
      </p>
    );
  }

  return (
    <p className="safety-note">대출 없이 전액 현금으로 사는 경우예요.</p>
  );
}

function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "소득 없음";
  return `${(ratio * 100).toFixed(1)}%`;
}
