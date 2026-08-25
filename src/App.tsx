import { useMemo, useState } from "react";
import { AssumptionLine } from "./components/AssumptionLine";
import { BudgetResult } from "./components/BudgetResult";
import { ComplexDetail } from "./components/ComplexDetail";
import { ComplexList } from "./components/ComplexList";
import { DiagnosisSummary } from "./components/DiagnosisSummary";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { PrintSummary, type AreaSource } from "./components/PrintSummary";
import { ProfileForm } from "./components/ProfileForm";
import { PurchaseCheck } from "./components/PurchaseCheck";
import { PurchaseTypeSelect } from "./components/PurchaseTypeSelect";
import { RegionFilter } from "./components/RegionFilter";
import { RightsCheck } from "./components/RightsCheck";
import { SafetyBadge } from "./components/SafetyBadge";
import { COMPLEX_UNITS, DATA_AS_OF, REGIONS, type ComplexUnit } from "./data/complexes";
import { buildComplexList } from "./lib/complex-list";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import {
  calcAcquisitionCosts,
  calcBurdenAt,
  householdCountNoteFor,
} from "./lib/finance";
import type { LocationAssessment } from "./lib/location";
import type { PriceAssessment } from "./lib/price";
import type { PurchaseAssessment, PurchaseType } from "./lib/purchase";
import type { RightsAssessment } from "./lib/rights";
import { rules, useAffordability } from "./state/useAffordability";
import { purchaseRules } from "./state/usePurchaseCheck";
import { usePurchaseType } from "./state/usePurchaseType";
import type { AssumableField } from "./state/useProfileForm";
import { useProfileForm } from "./state/useProfileForm";

export function App() {
  const { state, setField, reset, profile } = useProfileForm();
  // AssumptionLine이 어떤 가정 항목을 눌렀는지 여기서 받아, ProfileForm에
  // "그 항목만 제자리(폼 안)에서 열어라"고 전달한다. 이 상태가 없으면
  // AssumptionLine의 버튼도 ProfileForm의 openField 분기도 도달할 방법이
  // 없다(둘 다 그 자체로는 완결돼 있지만 이어 주는 배선이 없었다).
  const [openField, setOpenField] = useState<AssumableField | null>(null);
  /**
   * 구매 유형. 지금까지 이 화면이 말없이 전제하던 값이라 실거주에서
   * 시작하고, 한 번 고르면 기억한다(usePurchaseType 문서 참고) —
   * 나머지 프로필이 전부 저장되는데 유형만 저장되지 않으면, 새로고침한
   * 뒤 화면이 실거주로 되돌아가 자기 매수에 해당하지 않는 한도를 다시
   * 보여준다.
   */
  const { purchaseType, setPurchaseType, restoreFailed } = usePurchaseType();
  const [regionCodes, setRegionCodes] = useState<string[]>([]);
  // ComplexList의 PAGE_SIZE와 같은 값이다 — 각 덩어리에서 이만큼씩 보여준다.
  const [visibleCount, setVisibleCount] = useState(10);
  // 상세(상환 시뮬레이션)를 연 평형. null이면 목록 화면이다.
  const [selectedUnit, setSelectedUnit] = useState<ComplexUnit | null>(null);

  /**
   * 진단 종합(`DiagnosisSummary`)이 읽는 네 축의 최신 판정.
   *
   * **여기서 계산하지 않는다.** `RightsCheck`·`PurchaseCheck`·
   * `PriceCheck`·`LocationFacts`가 각자 이미 계산한 값을
   * `onAssessment` 콜백으로 올려 줄 뿐이다 — 복제해서 다시 계산하면
   * 이 상태와 그 컴포넌트들이 언젠가 어긋난다.
   *
   * `null`은 "이 진단이 이 축을 아직 보지 않았다"다. 구매 유형별
   * 금융은 `PurchaseCheck`가 투자 경로에서만 렌더되고, 호가·입지는
   * `PriceCheck`·`LocationFacts`가 실거주에서 평형을 고른 동안에만
   * 렌더된다 — 그 컴포넌트가 렌더되지 않는 동안에는 콜백이 불리지
   * 않으므로, 아래 핸들러들이 그 전환 시점에 명시적으로 `null`로
   * 되돌린다(그러지 않으면 다른 평형·다른 유형의 판정이 남아 있는
   * 축으로 오인된다).
   */
  const [rightsAssessment, setRightsAssessment] = useState<RightsAssessment | null>(null);
  const [purchaseAssessment, setPurchaseAssessment] = useState<PurchaseAssessment | null>(null);
  const [priceAssessment, setPriceAssessment] = useState<PriceAssessment | null>(null);
  const [locationAssessment, setLocationAssessment] = useState<LocationAssessment | null>(null);

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
    // areaBucket(반올림)이 아니라 maxExclusiveAreaSqm(그 평형의 실제 최대
    // 전용면적)을 쓴다 — 반올림이 85㎡ 임계값을 잘못 넘나들게 하면 농특세
    // 판정이 낙관 방향으로 틀린다. complex-list.ts의 rowProfile과 같은 이유.
    return { ...profile, exclusiveAreaSqm: selectedUnit.maxExclusiveAreaSqm };
  }, [profile, selectedUnit]);

  /**
   * 실거주가 아닐 때는 프로필을 아예 넘기지 않는다.
   *
   * **이 한 줄이 "투자 목적 매수에 실거주 대출 한도를 쓰지 않는다"를
   * 지키는 자리다.** `useAffordability`와 `buildComplexList`는 둘 다
   * `calcMaxLoan`·`calcAffordablePrice`·`calcSafePrice`로 내려가는데,
   * 그 함수들은 `rules/2026-08.json`의 LTV·DSR·절대상한 위에 서 있고
   * 그 값들은 전부 **실거주 매수를 전제로** 고시된 것이다.
   * 임대사업자대출·다주택자 LTV는 그 룰셋에 없다. 그래서 갭투자·월세
   * 수익형에서는 화면에서 숨기는 데 그치지 않고 **계산 자체를 하지
   * 않는다** — 숨기기만 하면 언젠가 그 값이 다른 자리로 새어 나온다.
   * `scripts/purchase-structure.test.ts`가 이 배선을 소스 수준에서
   * 잠근다.
   */
  const residentialProfile = purchaseType === "실거주" ? effectiveProfile : null;

  const affordability = useAffordability(residentialProfile);

  const complexList = useMemo(
    () =>
      profile === null || purchaseType !== "실거주"
        ? null
        : buildComplexList({
            units: COMPLEX_UNITS,
            profile,
            rules,
            regionCodes,
          }),
    [profile, purchaseType, regionCodes],
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
    // 새 평형의 PriceCheck·LocationFacts가 다시 마운트되며 자기
    // onAssessment로 새 값을 곧바로 올려 주지만(App.tsx 상단 주석), 그
    // 전까지 앞 평형의 판정이 잠깐이라도 새 평형에 대한 것처럼 남지
    // 않도록 먼저 비워 둔다.
    setPriceAssessment(null);
    setLocationAssessment(null);
  }

  /**
   * 단지 상세를 닫는다.
   *
   * `PriceCheck`·`LocationFacts`가 통째로 사라지면 그 컴포넌트들의
   * `onAssessment`는 다시 불리지 않는다 — 그래서 여기서 명시적으로
   * 비운다. 비우지 않으면 방금 닫은 매물의 판정이 "지금 보고 있는
   * 매물"인 것처럼 진단 종합에 남는다.
   */
  function handleCloseDetail() {
    setSelectedUnit(null);
    setPriceAssessment(null);
    setLocationAssessment(null);
  }

  /**
   * 유형을 바꾸면 열려 있던 단지 상세를 닫는다.
   *
   * 상세는 실거주 예산 계산 위에서만 뜻이 있는 화면이다. 남겨 두면
   * 갭투자로 갔다가 돌아왔을 때 예전 평형이 화면 전체의 전용면적을
   * 계속 바꿔치기하고 있는 상태가 된다(effectiveProfile 참고).
   */
  function handlePurchaseTypeChange(next: PurchaseType) {
    setPurchaseType(next);
    setSelectedUnit(null);
    // 상세(호가·입지)는 실거주에서 평형을 고른 동안에만 존재한다 —
    // 유형을 바꾸면 그 컴포넌트들이 사라지므로 진단 종합에 남은 값도
    // 함께 비운다(handleCloseDetail과 같은 이유).
    setPriceAssessment(null);
    setLocationAssessment(null);
    // 구매 유형별 금융(PurchaseCheck)은 투자 경로에서만 렌더된다.
    // 실거주로 돌아가면 그 컴포넌트가 사라지므로 값도 비운다 — 다른
    // 유형(갭투자 ↔ 월세수익형) 사이의 전환은 컴포넌트가 계속
    // 렌더되며 onAssessment가 새 값으로 갱신하므로 그대로 둔다.
    if (next === "실거주") setPurchaseAssessment(null);
  }

  /**
   * 인쇄물의 "전용면적" 전제가 어디서 왔는지(PrintSummary가 문구 방향을
   * 가르는 데 쓴다).
   *
   * `effectiveProfile`과 같은 우선순위를 따른다 — 상세가 열려 있으면
   * 그 평형의 실제 면적이 이미 화면 전체의 계산을 바꿔치기하고 있으므로
   * (위 `effectiveProfile` 주석 참고), 인쇄물도 그 사실을 "선택한 매물의
   * 실제 면적"이라고 밝혀야 한다 — 그렇지 않으면 사용자가 실제로는
   * 값을 확정한 적 없는데 "직접 입력"이라고 오인시키게 된다.
   */
  const areaSource: AreaSource =
    selectedUnit !== null
      ? "selectedUnit"
      : state.touched.includes("area")
        ? "touched"
        : "assumed";

  /**
   * PrintSummary에 넘길, 지금 실제로 계산에 쓰이는 전용면적(㎡).
   *
   * `effectiveProfile`과 같은 값(`maxExclusiveAreaSqm`)을 써야 인쇄물의
   * "전용면적" 문구가 실제로 계산에 쓰인 면적과 어긋나지 않는다.
   */
  const effectiveAreaSqm =
    selectedUnit !== null ? selectedUnit.maxExclusiveAreaSqm : state.exclusiveAreaSqm;

  const detail = useMemo(() => {
    if (residentialProfile === null || selectedUnit === null) return null;
    return {
      unit: selectedUnit,
      burden: calcBurdenAt(residentialProfile, rules, selectedUnit.maxPrice),
      costs: calcAcquisitionCosts(
        selectedUnit.maxPrice,
        residentialProfile,
        rules,
      ),
      /*
       * 호가 위치 확인의 예산 줄이 쓸 프로필.
       *
       * `residentialProfile`을 그대로 넘긴다 — 실거주가 아니면 이
       * 값이 `null`이고, 그러면 `assessPrice`가 예산 줄을 아예 만들지
       * 않는다. 화면에서 숨기는 것이 아니라 계산 자체를 하지 않는
       * 것이 요점이다(위 `residentialProfile` 주석과 같은 이유).
       *
       * 이 프로필의 전용면적은 이미 이 평형의 실제 면적으로 바꿔치기돼
       * 있다(`effectiveProfile`) — 호가에서의 부대비용도 그 면적으로
       * 계산돼야 85㎡ 임계값을 낙관 방향으로 넘기지 않는다.
       */
      priceBudget: { profile: residentialProfile, financeRules: rules },
      /*
       * 부대비용의 취득세 줄에 붙는 주택 수 고지. 위쪽
       * `BudgetResult`와 **같은 프로필**에서 고르므로 한 화면이 두 말을
       * 하지 않는다 — 고르는 규칙은 `householdCountNoteFor` 하나뿐이다.
       */
      householdCountNote: householdCountNoteFor(residentialProfile, rules),
    };
  }, [residentialProfile, selectedUnit]);

  return (
    <main className="app">
      <h1>내 예산으로 살 수 있는 집</h1>
      <p className="subtitle">
        {/*
          리뷰 수정(인쇄 함께 볼 것): "이 브라우저를 벗어나지 않아요"는
          "이 브라우저"라는 지시 대상이 종이 위에는 없어 뜻이 서지 않는다
          — 인쇄에서만 지운다(hiddenInPrint.ts의 .subtitle-privacy-note).
          앞의 룰셋 기준·수도권 범위는 종이에서도 뜻이 있어 남긴다.
        */}
        {/*
          어느 룰셋 기준인지는 유형에 따라 다르다. `rules/2026-08.json`의
          LTV·DSR·절대상한은 실거주 매수를 전제한 값이고, 투자 경로는 바로
          그 기준으로 한도를 계산하지 않는다고 말한다 — 그 화면 위에
          "2026년 8월 규제 기준"이 남아 있으면 종이에서 뜻이 어긋난다.
          투자 경로에서는 이 화면이 실제로 쓴 구매 유형 룰셋을 적는다.
        */}
        {purchaseType === "실거주"
          ? formatRuleVersionLabel(rules)
          : `구매 유형 기준 ${purchaseRules.version}`}{" "}
        · 수도권
        <span className="subtitle-privacy-note">
          {" "}
          · 입력한 재무정보는 이 브라우저를 벗어나지 않아요
        </span>
      </p>

      <ErrorBoundary onReset={reset}>
        <PurchaseTypeSelect
          rules={purchaseRules}
          value={purchaseType}
          onChange={handlePurchaseTypeChange}
          restoreFailed={restoreFailed}
        />

        {/*
          유형을 고르면 그 유형에 맞는 화면만 나온다.

          실거주에서는 지금까지와 **똑같은** 예산 계산이 그대로 나오고,
          갭투자·월세 수익형에서는 그 자리가 통째로 유형별 지표로 바뀐다.
          두 화면을 나란히 두지 않는 이유는 화면 정리가 아니라 계산이다 —
          실거주 예산 계산은 실거주 대출 한도 위에 서 있어서, 투자 목적
          매수 옆에 두면 그 한도를 이 매수에 쓸 수 있는 것처럼 읽힌다.
          `residentialProfile`이 그 계산 자체를 막고, 이 분기가 화면을
          막는다.

          권리분석 문진은 이 분기 **밖**에 있다. 등기부는 어떤 목적으로
          사든 같은 서류이고, 유형과 무관하게 봐야 한다.
        */}
        {purchaseType === "실거주" ? (
          <>
          <ProfileForm
            state={state}
            setField={setField}
            openField={openField}
            areaOverridden={selectedUnit !== null}
          />

          {/*
            주택 수도 필수 답이 됐다 — 미입력을 무주택으로 대신 채우면
            정책대출 자격이 넓어져 한도가 커지는데, 그건 사용자가 확인한
            적 없는 값으로 낙관적인 답을 내는 것이다(useProfileForm.ts의
            `ownedHomeCount` 주석 참고). 그래서 `toProfile`이 null을
            돌려주고 이 안내가 대신 나온다.

            `residentialProfile`을 함께 보는 이유는 타입 좁히기다 —
            아래에서 이 프로필로 취득세 고지를 골라야 하는데, 두 값이
            같은 조건에서 생기고 사라지므로 조건도 함께 둔다.
          */}
          {affordability === null || residentialProfile === null ? (
            <p className="prompt">
              현금·연소득·주택 수를 알려주면 살 수 있는 가격을 계산해요.
            </p>
          ) : (
            <>
              {/*
                화면에서는 숨고 인쇄에서만 나온다(styles.css의 .print-summary).
                지금 화면 그대로 인쇄되는 이 리포트가 배우자·부모님처럼 화면을
                보지 않은 사람에게 건네지므로, 계산의 전제(사용가능 현금 예산·연
                소득·생애최초 여부·기존 대출·규제지역 여부·전용면적)와
                룰셋 기준·인쇄일을 종이에도 남긴다.
              */}
              <PrintSummary
                state={state}
                effectiveAreaSqm={effectiveAreaSqm}
                areaSource={areaSource}
                rules={rules}
              />
              <AssumptionLine
                state={state}
                onOpen={setOpenField}
                areaOverridden={selectedUnit !== null}
              />
              <BudgetResult
                result={affordability.result}
                safePrice={affordability.safePrice}
                householdCountNote={householdCountNoteFor(
                  residentialProfile,
                  rules,
                )}
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
                    // 평형을 고른 동안에는 이 배지도 그 평형을 전제로
                    // 계산된다(면적·가격 범위 모두). 아래 상세 배지는
                    // 등급을 붙드는데 위 배지만 "안전"이라고 말하면 한
                    // 화면이 스스로 모순되고, 하필 먼저 읽히는 쪽이
                    // 낙관적이다. 고른 평형이 없으면 넘기지 않는다 —
                    // 그때 이 배지는 어떤 집도 가리키지 않는다.
                    landLeasehold={selectedUnit?.landLeasehold}
                    // 등급이 왜 멈췄는지는 아래 상세 배지가 말한다.
                    // 두 배지가 같은 문장을 말하면 한 화면에 똑같은
                    // 경고가 두 번 뜨고 둘 다 잡음으로 읽힌다. 등급
                    // 글자는 여기에도 그대로 남는다.
                    explainGrade={false}
                  />
                </>
              )}
              {detail !== null ? (
                <ComplexDetail
                  unit={detail.unit}
                  burden={detail.burden}
                  costs={detail.costs}
                  householdCountNote={detail.householdCountNote}
                  priceBudget={detail.priceBudget}
                  onClose={handleCloseDetail}
                  onPriceAssessment={setPriceAssessment}
                  onLocationAssessment={setLocationAssessment}
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

              {/*
                지금 보고 있는 화면 상태 그대로(상세가 열려 있으면 그 매물,
                아니면 목록) 인쇄한다 — 별도 인쇄 화면을 만들지 않는다.
                버튼 자신은 인쇄에서 지운다(styles.css의 .print-button).
              */}
              <button
                type="button"
                className="print-button"
                onClick={() => window.print()}
              >
                인쇄하기
              </button>
            </>
          )}
          </>
        ) : (
          <>
            <PurchaseCheck type={purchaseType} onAssessment={setPurchaseAssessment} />

            {/*
              지금 보고 있는 화면 상태 그대로 인쇄한다 — 실거주 경로와
              같은 버튼이고, 버튼 자신은 인쇄에서 지운다.
            */}
            <button
              type="button"
              className="print-button"
              onClick={() => window.print()}
            >
              인쇄하기
            </button>
          </>
        )}

        {/*
          권리분석 문진은 **예산 흐름에 붙이지 않고 독립된 자리**에 둔다.
          이유가 둘 있다.

          1. 문진의 대상이 다르다. 위 목록의 "단지 × 평형"은 실거래가를
             집계한 단위이지 특정 호실이 아니다. 등기사항전부증명서는
             호실 하나에 대해 떼는 문서이므로, 목록의 행에서 "이 집의
             등기부"를 물을 수 있는 자리가 없다. 단지 상세에 붙이면
             그 행의 숫자가 특정 매물의 권리 상태인 것처럼 읽혀, 이
             제품이 절대 만들면 안 되는 오해가 된다.
          2. 이 문진은 예산 계산 없이도 성립한다. 계약을 앞두고
             등기부만 들고 온 사람이 현금·소득을 먼저 입력해야만 쓸 수
             있게 하면, 가장 급한 사람이 가장 늦게 도달한다. 그래서
             `affordability === null` 분기 **밖**에 둔다.

          접힌 채로 시작하지만 인쇄에서는 강제로 펼쳐진다(styles.css의
          `::details-content` 규칙) — 이 앱의 다른 <details>와 같다.
        */}
        <RightsCheck onAssessment={setRightsAssessment} />

        {/*
          진단 종합은 권리분석 바로 다음, 화면의 맨 끝(면책 문구 바로
          위)에 둔다 — "지금까지 본 것 전부를 한자리에 모으는 마무리"로
          두는 이유는 `DiagnosisSummary.tsx` 문서에 적었다.

          네 축이 동시에 다 채워지는 일은 없다(구매 유형별 금융은
          투자 경로에서만, 호가·입지는 실거주에서 평형을 고른 동안만
          존재한다) — 그래서 못 본 축은 값을 지어내지 않고 그대로
          `null`을 넘긴다. `DiagnosisSummary`가 그 `null`을 "못 봤다"로
          그린다.

          `<details>`로 접지 않는다 — 이 화면의 존재 이유가 "못 본
          축을 숨기지 않는 것"인데, 화면 전체를 접어 두면 클릭하지
          않은 사람에게는 그 못 본 축조차 보이지 않는다.
        */}
        <DiagnosisSummary
          rights={rightsAssessment}
          purchase={purchaseAssessment}
          price={priceAssessment}
          location={locationAssessment}
        />
      </ErrorBoundary>

      {/*
        면책 문구도 유형에 따라 갈린다.

        "추정치이며 실제 대출한도는 …"은 이 화면이 대출한도 추정치를 낸다는
        것을 전제한 문장이다. 투자 경로에서는 바로 위에서 "이 유형의 대출
        한도는 우리가 계산하지 않아요"라고 말한 뒤라, 그 문장이 그대로
        남으면 어딘가에 한도 추정치가 있는 것처럼 읽힌다.
      */}
      <footer className="disclaimer">
        {purchaseType === "실거주" ? (
          <>
            추정치이며 실제 대출한도는 금융기관 심사 결과에 따릅니다.
            시세는 국토교통부 실거래가에 기반한 추정 범위입니다.
          </>
        ) : (
          <>
            이 화면은 대출한도를 계산하지 않아요. 여기 있는 숫자는 적어 주신
            값으로 낸 비율이에요.
            시세는 국토교통부 실거래가에 기반한 추정 범위입니다.
          </>
        )}
      </footer>
    </main>
  );
}
