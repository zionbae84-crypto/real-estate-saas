import { useMemo, useState } from "react";
import { AssumptionLine } from "./components/AssumptionLine";
import { BudgetResult } from "./components/BudgetResult";
import { ComplexList } from "./components/ComplexList";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { ProfileForm } from "./components/ProfileForm";
import { RegionFilter } from "./components/RegionFilter";
import { SafetyBadge } from "./components/SafetyBadge";
import { COMPLEX_UNITS, DATA_AS_OF, REGIONS } from "./data/complexes";
import { buildComplexList } from "./lib/complex-list";
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
  const [regionCodes, setRegionCodes] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);

  const complexList = useMemo(
    () =>
      profile === null
        ? null
        : buildComplexList({
            units: COMPLEX_UNITS,
            profile,
            rules,
            regionCodes,
          }),
    [profile, regionCodes],
  );

  /**
   * 지역을 고르면 규제지역 여부가 그 지역에서 정해진다.
   *
   * **폼 상태에 직접 반영한다.** 목록 전용 프로필을 따로 만들면 위의 최대
   * 가격과 아래 목록이 서로 다른 프로필로 계산돼, 화면이 두 개의 다른
   * 예산을 동시에 말하게 된다.
   *
   * 하나라도 규제지역이면 규제지역으로 본다 — 여러 구를 골랐을 때 한쪽만
   * 비규제라고 한도를 높게 잡으면 그 구의 단지에 대해 과대 계상이 된다.
   */
  function handleRegionChange(codes: string[]) {
    setRegionCodes(codes);
    setVisibleCount(20);
    if (codes.length > 0) {
      setField(
        "isRegulatedArea",
        codes.some((c) => rules.regulatedRegionCodes.includes(c)),
      );
    }
  }

  return (
    <main className="app">
      <h1>내 예산으로 살 수 있는 집</h1>
      <p className="subtitle">
        {formatRuleVersionLabel(rules)} · 수도권 · 입력한 재무정보는 이
        브라우저를 벗어나지 않아요
      </p>

      <ErrorBoundary onReset={reset}>
        <ProfileForm state={state} setField={setField} openField={openField} />

        {affordability === null ? (
          <p className="prompt">
            현금과 연소득을 입력하면 살 수 있는 가격을 계산해요.
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
            <RegionFilter
              regions={REGIONS}
              selected={regionCodes}
              onChange={handleRegionChange}
            />
            {complexList !== null && (
              <ComplexList
                result={complexList}
                dataAsOf={DATA_AS_OF}
                hasRegionFilter={regionCodes.length > 0}
                noRepaymentCapacity={
                  affordability.result.loanLimit.breakdown.DSR === 0
                }
                visibleCount={visibleCount}
                onShowMore={() => setVisibleCount((n) => n + 20)}
              />
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
