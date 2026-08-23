import { useEffect, useRef } from "react";
import type { ComplexUnit } from "../data/complexes";
import { formatWon } from "../format/won";
import type { BurdenAtPrice, CostBreakdown as CostBreakdownData } from "../lib/finance";
import { formatRange } from "./ComplexList";
import { CostBreakdown } from "./CostBreakdown";
import { SafetyBadge } from "./SafetyBadge";

export interface ComplexDetailProps {
  unit: ComplexUnit;
  /** `unit.maxPrice`에서의 부담. ComplexList와 같은 기준(범위 위쪽)이다 */
  burden: BurdenAtPrice;
  /** `unit.maxPrice`에서의 부대비용 내역 */
  costs: CostBreakdownData;
  onClose: () => void;
}

/**
 * 단지 상세: 고른 평형의 상환 시뮬레이션.
 *
 * **모든 계산은 `unit.maxPrice` 기준이다** — ComplexList와 같은 규칙(범위
 * 위쪽으로 재야 부담이 표시보다 커지지 않는 방향으로만 틀린다).
 *
 * `medianPrice`·변동률은 여기서도 내지 않는다. 부모 스펙 §12는 화면
 * 전체에 걸리는 제약이지 목록에만 걸리는 것이 아니다.
 *
 * 이 화면이 열려 있는 동안 호출부(App.tsx)가 이 평형의 `areaBucket`을
 * 반영해 화면 전체(위쪽 실구매 가능 가격 포함)를 계산한다 — 그래서 이
 * 화면을 여는 동안 위쪽 숫자도 함께 움직일 수 있다. **프로필에는
 * 저장하지 않는다** — 이 화면을 닫으면 원래 가정 면적으로 곧바로
 * 되돌아간다. 그 사실을 사용자가 놀라지 않게 여기서 한 줄로 알려준다.
 */
export function ComplexDetail({ unit, burden, costs, onClose }: ComplexDetailProps) {
  /**
   * 상세가 열리면 포커스를 이 화면으로 옮긴다.
   *
   * 목록이 통째로 사라지고 이 화면이 그 자리에 나타나는데, 포커스는
   * 방금 사라진 행 버튼 자리에 남는다 — 스크린리더 사용자에게는 아무
   * 일도 일어나지 않은 것처럼 들린다. 화면이 바뀌었다는 사실 자체가
   * 전달되지 않으면 그 뒤의 숫자도 읽히지 않는다.
   *
   * 첫 요소(← 목록으로)가 아니라 섹션 자체에 포커스를 준다. 섹션의
   * 접근 가능한 이름("단지 상세")과 그 안의 제목·본문이 순서대로
   * 읽히므로, 사용자가 "무엇이 열렸는지"부터 듣는다.
   *
   * `unit`이 바뀌면 다시 옮긴다 — 다른 평형의 상세로 갈아탈 때도
   * 같은 전환이다.
   */
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus();
  }, [unit]);

  return (
    <section
      className="complex-detail"
      aria-label="단지 상세"
      ref={sectionRef}
      tabIndex={-1}
    >
      <button type="button" className="complex-detail-back" onClick={onClose}>
        ← 목록으로
      </button>

      <h2 className="complex-detail-title">
        {unit.complexName} {unit.areaBucket}㎡ · {unit.legalDongName}
      </h2>
      <p className="complex-detail-built">{unit.builtYear}년 준공</p>

      <p className="complex-detail-range">
        {formatRange(unit.minPrice, unit.maxPrice)}
        <span className="complex-trades"> · 최근 1년 거래 {unit.tradeCount}건</span>
      </p>

      <p className="complex-detail-area-note">
        이 평형의 전용면적({unit.areaBucket}㎡)을 반영해서 계산했어요. 그래서
        위쪽 실구매 가능 가격도 함께 바뀌었을 수 있어요. 프로필에 저장하지는
        않아서, 목록으로 돌아가면 원래 가정한 면적 기준으로 되돌아가요.
      </p>

      <p className="complex-detail-loan">
        범위 위쪽인 {formatWon(unit.maxPrice)}에 산다면{" "}
        {burden.neededLoan === 0 ? (
          <span className="complex-no-loan">대출 없이 살 수 있어요</span>
        ) : (
          <>
            필요 대출액은 <strong>{formatWon(burden.neededLoan)}</strong>이에요
          </>
        )}
      </p>

      <SafetyBadge safety={burden.safety} label="이 집을 샀을 때예요" />

      <CostBreakdown costs={costs} />
    </section>
  );
}
