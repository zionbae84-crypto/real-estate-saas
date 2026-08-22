import { useState } from "react";
import { AssumptionLine } from "./components/AssumptionLine";
import { BudgetResult } from "./components/BudgetResult";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { ProfileForm } from "./components/ProfileForm";
import { SafetyBadge } from "./components/SafetyBadge";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { rules, useAffordability } from "./state/useAffordability";
import type { AssumableField } from "./state/useProfileForm";
import { useProfileForm } from "./state/useProfileForm";

export function App() {
  const { state, setField, reset, profile } = useProfileForm();
  const affordability = useAffordability(profile);
  // AssumptionLine이 어떤 가정 항목을 눌렀는지 여기서 받아, ProfileForm에
  // "그 항목만 제자리(폼 안)에서 열어라"고 전달한다. 이 상태가 없으면
  // AssumptionLine의 버튼도 ProfileForm의 openField 분기도 도달할 방법이
  // 없다(둘 다 그 자체로는 완결돼 있지만 이어 주는 배선이 없었다).
  const [openField, setOpenField] = useState<AssumableField | null>(null);

  return (
    <main className="app">
      <h1>내 예산으로 살 수 있는 집</h1>
      <p className="subtitle">
        {formatRuleVersionLabel(rules)} · 수도권 · 입력한 재무정보는 이
        브라우저를 벗어나지 않습니다
      </p>

      <ErrorBoundary onReset={reset}>
        <ProfileForm state={state} setField={setField} openField={openField} />

        {affordability === null ? (
          <p className="prompt">
            현금과 연소득을 입력하면 살 수 있는 가격을 계산합니다.
          </p>
        ) : (
          <>
            <AssumptionLine state={state} onOpen={setOpenField} />
            <BudgetResult
              result={affordability.result}
              safePrice={affordability.safePrice}
            />
            {affordability.result.affordablePrice > 0 && (
              <>
                <PriceSlider
                  price={affordability.price}
                  max={affordability.result.affordablePrice}
                  safePrice={affordability.safePrice}
                  onChange={affordability.setPrice}
                />
                <SafetyBadge safety={affordability.safety} />
              </>
            )}
          </>
        )}
      </ErrorBoundary>

      <footer className="disclaimer">
        추정치이며 실제 대출한도는 금융기관 심사 결과에 따릅니다.
        시세는 국토교통부 실거래가에 기반한 추정 범위입니다.
      </footer>
    </main>
  );
}
