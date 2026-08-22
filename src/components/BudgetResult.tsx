import { Text } from "@seed-design/react";
import type { AffordableResult } from "../lib/finance";
import { formatWon } from "../format/won";
import { BindingExplainer, getBindingTitle } from "./BindingExplainer";
import { CostBreakdown } from "./CostBreakdown";
import { PolicyLoanList } from "./PolicyLoanList";
import { SafeLine } from "./SafeLine";
import { WarningList } from "./WarningList";

export interface BudgetResultProps {
  result: AffordableResult;
  /**
   * 상환 부담이 안전 범위에 머무는 최대 매매가, 또는 그런 가격이 하나도
   * 없으면 `null`. `useAffordability`의 `safePrice`를 그대로 받는다.
   */
  safePrice: number | null;
}

/**
 * 결과를 네 단으로 나눈다.
 *
 * 1. 최대 가격 — 크게
 * 2. 무엇이 막았는지 한 줄
 * 3. 안전선 — 최대 가격 옆에 나란히
 * 4. 접힌 채로 — 부대비용 내역·정책대출 목록·상세 설명
 *
 * 경고(`WarningList`)는 이 계단 바깥, 맨 위에 두고 접지 않는다 — 접으면
 * 안 되는 종류의 정보다.
 */
export function BudgetResult({ result, safePrice }: BudgetResultProps) {
  return (
    <section className="budget-result">
      <WarningList warnings={result.warnings} />

      {result.affordablePrice === 0 ? (
        <ZeroBudgetMessage result={result} />
      ) : (
        <>
          <div className="result-step result-step--price">
            <h2>실구매 가능 가격</h2>
            {/*
              SEED `Text`는 공식 문서에 `as` prop이 없다 — 있어도 제목
              계층이 필요한 자리에는 쓰지 않는다. 그래서 블록 배치는
              평범한 `<p>`가 맡고, `Text`는(기본 `<span>`) 그 안에서
              숫자에만 SEED 타이포 토큰을 입힌다.
            */}
            <p className="affordable-price">
              <Text>{formatWon(result.affordablePrice)}</Text>
            </p>
          </div>

          <p className="result-step result-step--binding">
            {getBindingTitle(result.loanLimit.binding)}
          </p>

          <div className="result-step result-step--safe-line">
            <SafeLine
              affordablePrice={result.affordablePrice}
              safePrice={safePrice}
              // ZeroBudgetMessage와 같은 근거로 원인을 판단해 넘긴다 —
              // breakdown.DSR은 가격에 의존하지 않으므로 affordablePrice가
              // 0이 아닌 이 분기에서도 그대로 유효하다(SafeLine.tsx 참고).
              noRepaymentCapacity={result.loanLimit.breakdown.DSR === 0}
            />
          </div>

          <details className="result-step result-step--fold">
            <summary>부대비용·정책대출·상세 설명 더 보기</summary>
            <BindingExplainer loanLimit={result.loanLimit} showTitle={false} />
            <CostBreakdown costs={result.costs} />
            <PolicyLoanList matched={result.matchedPolicyLoans} />
          </details>
        </>
      )}
    </section>
  );
}

/**
 * affordablePrice === 0일 때의 안내. 원인을 하나로 단정하지 않는다.
 *
 * 0에 도달하는 흔한 경로는 두 가지다.
 *
 * 1. 현금이 매매가 0원에서도 발생하는 고정 부대비용(법무비·이사비)조차
 *    감당하지 못하는 경우 — LTV가 가격에 비례하므로 가격이 0에 가까우면
 *    대출도 0에 가까워, 소득·부채와 무관하게 이 벽에 부딪힌다. 이 경로는
 *    엔진이 이미 WarningList에 "고정 부대비용만으로도 보유 현금을
 *    초과합니다"라는 정확한 경고를 낸다.
 * 2. 상환능력(DSR) 자체가 0인 경우 — 소득이 없거나 기존 부채가 이미
 *    허용 한도를 다 채워서, breakdown.DSR이 0이 되고 대출 한도 전체가
 *    0으로 눌린다.
 *
 * 두 원인은 완전히 다른 조치를 요구하므로(현금을 더 모으기 vs 부채를
 * 줄이거나 소득을 확인하기) 하나로 뭉뚱그리면 소득 3억·부채 0인
 * 현금 부족 구매자에게 "소득이 없다"고 말하는 식의 오답이 나온다.
 * breakdown.DSR은 가격에 의존하지 않으므로(calcDsrLimit은 price를
 * 받지 않는다) affordablePrice가 0이어도 실제 상환능력 상태를
 * 그대로 반영한다 — 진단에 쓰기 안전한 근거다.
 */
function ZeroBudgetMessage({ result }: { result: AffordableResult }) {
  const incomeOrDebtBlocked = result.loanLimit.breakdown.DSR === 0;

  return (
    <div className="no-budget">
      <h2>현재 조건으로는 주택담보대출이 나오지 않습니다</h2>
      {incomeOrDebtBlocked ? (
        <p>
          소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있습니다.
          기존 부채를 줄이거나 소득을 다시 확인해 보세요.
        </p>
      ) : (
        <p>
          보유 현금이 취득에 드는 최소 비용(법무비·이사비 등)에도 못
          미칩니다. 현금을 더 모으면 살 수 있는 가격이 생깁니다.
        </p>
      )}
    </div>
  );
}
