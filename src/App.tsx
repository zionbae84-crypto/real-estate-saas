import { BudgetResult } from "./components/BudgetResult";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { ProfileForm } from "./components/ProfileForm";
import { SafetyBadge } from "./components/SafetyBadge";
import { useAffordability } from "./state/useAffordability";
import { useProfileForm } from "./state/useProfileForm";

export function App() {
  const { state, setField, setExistingHomeField, reset, profile } =
    useProfileForm();
  const affordability = useAffordability(profile);

  return (
    <main className="app">
      <h1>내 예산으로 살 수 있는 집</h1>
      <p className="subtitle">
        2026년 3월 규제 기준 · 수도권 · 입력한 재무정보는 이 브라우저를 벗어나지
        않습니다
      </p>

      <ErrorBoundary onReset={reset}>
        <ProfileForm
          state={state}
          setField={setField}
          setExistingHomeField={setExistingHomeField}
        />

        {affordability === null ? (
          <p className="prompt">
            현금과 연소득을 입력하면 살 수 있는 가격을 계산합니다.
          </p>
        ) : (
          <>
            <BudgetResult result={affordability.result} />
            {affordability.result.affordablePrice > 0 && (
              <>
                <PriceSlider
                  price={affordability.price}
                  max={affordability.result.affordablePrice}
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
