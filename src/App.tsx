import { useMemo, useState } from "react";
import { AssumptionLine } from "./components/AssumptionLine";
import { BudgetResult } from "./components/BudgetResult";
import { ComplexDetail } from "./components/ComplexDetail";
import { ComplexList } from "./components/ComplexList";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { ProfileForm } from "./components/ProfileForm";
import { RegionFilter } from "./components/RegionFilter";
import { SafetyBadge } from "./components/SafetyBadge";
import { COMPLEX_UNITS, DATA_AS_OF, REGIONS, type ComplexUnit } from "./data/complexes";
import { buildComplexList } from "./lib/complex-list";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { calcAcquisitionCosts, calcBurdenAt } from "./lib/finance";
import { rules, useAffordability } from "./state/useAffordability";
import type { AssumableField } from "./state/useProfileForm";
import { useProfileForm } from "./state/useProfileForm";

export function App() {
  const { state, setField, reset, profile } = useProfileForm();
  // AssumptionLine이 어떤 가정 항목을 눌렀는지 여기서 받아, ProfileForm에
  // "그 항목만 제자리(폼 안)에서 열어라"고 전달한다. 이 상태가 없으면
  // AssumptionLine의 버튼도 ProfileForm의 openField 분기도 도달할 방법이
  // 없다(둘 다 그 자체로는 완결돼 있지만 이어 주는 배선이 없었다).
  const [openField, setOpenField] = useState<AssumableField | null>(null);
  const [regionCodes, setRegionCodes] = useState<string[]>([]);
  // ComplexList의 PAGE_SIZE와 같은 값이다 — 각 덩어리에서 이만큼씩 보여준다.
  const [visibleCount, setVisibleCount] = useState(10);
  // 상세(상환 시뮬레이션)를 연 평형. null이면 목록 화면이다.
  const [selectedUnit, setSelectedUnit] = useState<ComplexUnit | null>(null);

  /**
   * 상세가 열려 있는 동안 화면 전체(위 실구매 가능 가격·안전선·상세의
   * 모든 수치)가 고른 평형의 실제 전용면적을 반영해야 한다.
   *
   * **프로필(state)에는 저장하지 않는다.** 저장하면(예전처럼
   * `setField("exclusiveAreaSqm", …)`를 호출하면) localStorage까지
   * 영구히 남아, 상세를 닫은 뒤에도(심지어 다음 세션까지) 헤드라인이
   * 계산한 적 없는 좁은 면적으로 낙관적으로 남는다 — 부담은 실제보다
   * 작게, 실구매력은 실제보다 크게 보이는, 이 제품이 가장 피해야 하는
   * 방향의 오답이다. 그래서 화면이 쓰는 프로필만 상세가 열려 있는
   * 동안 이 값으로 바꿔치기하고, 닫으면 원래 프로필로 즉시 되돌아간다.
   *
   * 이 바꿔치기가 켜져 있는 동안에는 `ProfileForm`의 전용면적 입력란도
   * 함께 사라진다(`areaOverridden`). 남겨 두면 사용자가 거기에 값을
   * 넣어도 화면이 이 평형의 면적을 계속 쓰므로 **입력이 조용히
   * 무시된다.** `AssumptionLine`이 같은 이유로 전용면적 가정 문구를
   * 빼는 것과 같은 판단이다.
   */
  const effectiveProfile = useMemo(() => {
    if (profile === null || selectedUnit === null) return profile;
    return { ...profile, exclusiveAreaSqm: selectedUnit.areaBucket };
  }, [profile, selectedUnit]);

  const affordability = useAffordability(effectiveProfile);

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
    setVisibleCount(10);
    if (codes.length > 0) {
      setField(
        "isRegulatedArea",
        codes.some((c) => rules.regulatedRegionCodes.includes(c)),
      );
    }
  }

  /**
   * 단지 목록의 행을 누르면 그 평형의 상세(상환 시뮬레이션)를 연다.
   *
   * 화면 상태(`selectedUnit`)만 바꾼다 — 프로필에는 아무것도 쓰지
   * 않는다. 위 `effectiveProfile`이 `selectedUnit`을 보고 화면 전체의
   * 계산을 바꿔치기하므로, 위쪽 실구매 가능 가격과 상세 안의 계산은
   * 여전히 같은(바꿔치기된) 프로필을 본다 — 다만 그 반영이 화면 상태에
   * 한정돼, 상세를 닫으면 원래 프로필로 되돌아간다.
   */
  function handleSelectUnit(unit: ComplexUnit) {
    setSelectedUnit(unit);
  }

  const detail = useMemo(() => {
    if (effectiveProfile === null || selectedUnit === null) return null;
    return {
      unit: selectedUnit,
      burden: calcBurdenAt(effectiveProfile, rules, selectedUnit.maxPrice),
      costs: calcAcquisitionCosts(selectedUnit.maxPrice, effectiveProfile, rules),
    };
  }, [effectiveProfile, selectedUnit]);

  return (
    <main className="app">
      <h1>내 예산으로 살 수 있는 집</h1>
      <p className="subtitle">
        {formatRuleVersionLabel(rules)} · 수도권 · 입력한 재무정보는 이
        브라우저를 벗어나지 않아요
      </p>

      <ErrorBoundary onReset={reset}>
        <ProfileForm
          state={state}
          setField={setField}
          openField={openField}
          areaOverridden={selectedUnit !== null}
        />

        {affordability === null ? (
          <p className="prompt">
            현금과 연소득을 입력하면 살 수 있는 가격을 계산해요.
          </p>
        ) : (
          <>
            <AssumptionLine
              state={state}
              onOpen={setOpenField}
              areaOverridden={selectedUnit !== null}
            />
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
                <SafetyBadge
                  safety={affordability.safety}
                  // 상세가 열려 있을 때만 라벨을 붙인다. 그때만 화면에
                  // 배지가 둘(여기 + ComplexDetail 안)이고, 마크업이
                  // 같아서 어느 쪽이 "이 집을 사면"의 답인지 알 수 없다 —
                  // 하필 더 낙관적인 쪽이 매물 옆에 붙는다. 목록 화면에서는
                  // 배지가 하나뿐이라 라벨이 잡음이 된다.
                  label={
                    selectedUnit !== null
                      ? "위 가격에서 최대로 빌렸을 때예요"
                      : undefined
                  }
                />
              </>
            )}
            {detail !== null ? (
              <ComplexDetail
                unit={detail.unit}
                burden={detail.burden}
                costs={detail.costs}
                onClose={() => setSelectedUnit(null)}
              />
            ) : (
              <>
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
                    onShowMore={() => setVisibleCount((n) => n + 10)}
                    onSelect={handleSelectUnit}
                  />
                )}
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
