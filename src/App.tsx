import { useEffect, useMemo, useState } from "react";
import { AssumptionLine } from "./components/AssumptionLine";
import { BudgetResult } from "./components/BudgetResult";
import { ComplexDetail } from "./components/ComplexDetail";
import { ComplexList } from "./components/ComplexList";
import { ComplexMap, groupWithCoords } from "./components/ComplexMap";
import { DiagnosisSummary } from "./components/DiagnosisSummary";
import { EntryScreen } from "./components/EntryScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { PrintSummary, type AreaSource } from "./components/PrintSummary";
import { ProfileForm } from "./components/ProfileForm";
import { PurchaseCheck } from "./components/PurchaseCheck";
import { PurchaseTypeSelect } from "./components/PurchaseTypeSelect";
import { RegionSelect } from "./components/RegionSelect";
import { SafetyBadge } from "./components/SafetyBadge";
import {
  AGGREGATION_WINDOW_LABEL,
  type ComplexUnit,
} from "./data/complexes";
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
import { rules, useAffordability } from "./state/useAffordability";
import { useComplexCoordinates } from "./state/useComplexCoordinates";
import { useRegionComplexes } from "./state/useRegionComplexes";
import { purchaseRules } from "./state/usePurchaseCheck";
import { usePurchaseType } from "./state/usePurchaseType";
import type { AssumableField } from "./state/useProfileForm";
import { useProfileForm } from "./state/useProfileForm";

export function App() {
  const { state, setField, resetField, reset, profile } = useProfileForm();
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
  /**
   * 화면 단계 — "입력"(영상 위 입력 화면, 화면 1)과 "결과"(전체화면
   * 결과, 화면 2). `EntryScreen`이 이 값을 읽어 자기 자신을 시각적으로
   * 숨긴다(언마운트하지 않는다 — 이유는 `EntryScreen`의 `phase` prop
   * 문서 참고).
   *
   * **처음 값은 복원된 구매 유형이 정한다.** 새로 들어온 사용자는 아직
   * 아무것도 확정하지 않았으므로 "입력"에서 시작한다 — 하지만
   * `purchaseType`은 localStorage에서 복원되므로(usePurchaseType),
   * 무조건 "입력"으로 시작하면 투자 유형을 저장해 둔 사람이 새로고침
   * 했을 때 **빠져나올 수 없는 화면**이 된다(재검토 수정 Critical 1):
   *
   * - `.entry-screen`은 불투명한 전체화면 레이어라 화면을 덮는데,
   * - 그 안의 내용(`PurchaseTypeSelect`·`ProfileForm`·`RegionSelect`)은
   *   전부 `purchaseType === "실거주"` 게이트라 제목과 부제만 남고,
   * - 유형 라디오가 서 있는 결과 트리는 `phase === "입력"`이라 `inert`다.
   *
   * 그래서 `setPhase`를 부를 수 있는 네 자리(아래 지역 조회 성공 effect,
   * `handleBackToEntry`, `handleOpenAssumption`, `handlePurchaseTypeChange`)
   * 가 전부 없거나 닿지 않는 상태가 됐다 — localStorage를 지우는 것
   * 말고 나갈 길이 없었다.
   *
   * **고른 해법은 "유형을 화면 1에도 항상 그리기"가 아니라 이 값의
   * 시드다.** 그쪽은 화면 1을 "제목 + 부제 + 라디오 하나"짜리 화면으로
   * 남기는데, 고를 수 있는 투자 유형이 월세수익형 하나뿐이라(이미
   * 선택된 라디오는 `onChange`를 부르지 않는다) 자기 유형을 유지한 채
   * 결과로 돌아가는 길이 여전히 없다 — 실거주를 한 번 거쳐 오는 우회로만
   * 남는다. 시드는 그 대신 **복원 직후 상태를 "방금 그 유형을 고른
   * 직후"와 똑같이** 만든다(`handlePurchaseTypeChange`가 투자 유형에서
   * phase를 "결과"로 넘기는 것과 같은 규칙이다).
   *
   * 그 결과 이 앱의 불변식 하나가 선다: **`phase === "입력"`인 동안
   * `purchaseType`은 항상 실거주다.** 위 네 자리 중 "입력"으로 되돌리는
   * 셋은 전부 실거주 전용 화면에만 있고, 넷째(`handlePurchaseTypeChange`)
   * 는 실거주를 고를 때만 "입력"을 준다. 화면 1이 자기 내용을 실거주에만
   * 거는 지금 구조가 이 불변식 위에서만 성립한다 —
   * `purchase-type.test.tsx`의 "저장된 투자 유형으로 새로 열기"가
   * 그 불변식을 (jsdom이 적용하지 않는 `inert`·`display`를 직접 보며)
   * 잠근다.
   *
   * **전환은 지역 조회 성공 하나뿐이다**(아래 effect). 지역 선택
   * 버튼을 누른 그 순간(`handleRegionSelect`)이 아니라 **조회가 실제로
   * 성공했을 때**를 본다 — 조회 중이거나 실패한 동안 화면이 아직 아무
   * 결과도 없이 "결과" 단계로 넘어가면, 이 축이 다른 축("이 지역엔
   * 데이터가 없다"/"조회 실패")의 빈 상태를 조용히 삼키는 여섯 번째
   * 반복이 된다(`App.tsx`가 이미 겪은 그 버그 형태).
   *
   * **"조건 다시 넣기"(아래 `handleBackToEntry`)는 이 값만 되돌린다.**
   * 프로필·지역 조회 결과·구매 유형 등 나머지 상태는 전혀 건드리지
   * 않는다 — 화면 전환일 뿐 리셋이 아니다.
   */
  const [phase, setPhase] = useState<"입력" | "결과">(() =>
    purchaseType === "실거주" ? "입력" : "결과",
  );
  /**
   * 고른 지역의 실거래가 조회 상태. 번들에 실린 3개 구 정적 데이터
   * (`COMPLEX_UNITS`)를 대신한다 — 이 앱이 전국으로 넓어지면서 목록의
   * 출처가 "빌드 시점에 박아 둔 파일"에서 "고른 지역을 그때 조회한
   * 결과"로 바뀌었다.
   */
  const regionComplexes = useRegionComplexes();
  /** 지금 확정된 지역코드. 좌표 조회(useComplexCoordinates)가 이 값을 쓴다 */
  const [currentRegionCode, setCurrentRegionCode] = useState<string | null>(null);
  /** 조회 결과 안에서 행정동으로 더 좁힌 값. null이면 그 지역 전체다 */
  const [selectedDong, setSelectedDong] = useState<string | null>(null);
  // ComplexList의 PAGE_SIZE와 같은 값이다 — 각 덩어리에서 이만큼씩 보여준다.
  const [visibleCount, setVisibleCount] = useState(10);
  // 상세(상환 시뮬레이션)를 연 평형. null이면 목록 화면이다.
  const [selectedUnit, setSelectedUnit] = useState<ComplexUnit | null>(null);

  /**
   * 진단 종합(`DiagnosisSummary`)이 읽는 네 축의 최신 판정.
   *
   * **여기서 계산하지 않는다.** `PurchaseCheck`·
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

  /**
   * 지역을 고르면 규제지역 여부를 API 응답으로 정한다.
   *
   * 목록에 있는 지역이면(true/false) 폼 상태에 반영해 위쪽 실구매 가능
   * 가격도 같은 전제로 계산되게 한다. 그 순간 이 값은 가정이 아니라
   * **확인된 사실**이 되므로 `setField`가 `touched`에도 넣어 가정 문구에서
   * 뺀다.
   *
   * **`null`(모르는 지역)이면 가정 상태로 되돌린다** — 손대지 않고 두지
   * 않는다. 앞서 아는 지역 X를 조회했다면 그 값이 X의 **확정 지위까지**
   * 그대로 남아, 우리가 아무것도 확인하지 못한 지역 Y의 화면이 "이
   * 지역은 규제지역입니다"라고 단정하게 된다. 지금은
   * `api/_data/regulated-regions.json`의 `nonRegulated` 목록이 비어 있어
   * 보수적인 `true`만 넘어오지만, 그 목록이 채워지는 순간 비규제(LTV
   * 70%) 판정이 규제지역인 Y로 새어 나가 한도를 30%p 과대평가한다 —
   * 그 목록이 존재하는 이유가 바로 채워지는 것이다.
   *
   * **폼 상태에 직접 반영한다.** 목록 전용 프로필을 따로 만들면 위의 최대
   * 가격과 아래 목록이 서로 다른 프로필로 계산돼, 화면이 두 개의 다른
   * 예산을 동시에 말하게 된다(옛 `handleRegionChange`와 같은 이유).
   *
   * **조회 실패(`status === "error"`)일 때도 가정 상태로 되돌린다.** 실패한
   * 조회는 이번 지역에 대해 아무것도 확인해 주지 못했다 — 그런데도 status만
   * 보고 멈추면 직전에 성공했던 다른 지역의 `isRegulatedArea`가 "확정
   * 사실"인 채로 화면에 남는다. 지금은 `nonRegulated` 목록이 비어 있어
   * 새어 나갈 수 있는 값이 보수적인 `true`뿐이지만, 목록이 채워지면 위
   * `null` 케이스와 같은 방식으로 한도를 과대평가한다.
   */
  useEffect(() => {
    if (regionComplexes.status === "error") {
      resetField("regulatedArea");
      return;
    }
    if (regionComplexes.status !== "success") return;
    if (regionComplexes.isRegulatedArea !== null) {
      setField("isRegulatedArea", regionComplexes.isRegulatedArea);
    } else {
      resetField("regulatedArea");
    }
  }, [
    regionComplexes.status,
    regionComplexes.isRegulatedArea,
    setField,
    resetField,
  ]);

  /**
   * 지역을 확정하면 그 지역의 실거래가를 조회한다.
   *
   * 앞 지역에서 고른 행정동과 "더 보기"로 늘려 둔 행 수를 함께 되돌린다 —
   * 남겨 두면 새 지역에는 없는 동으로 걸러 빈 목록이 되거나, 새 지역의
   * 첫 화면이 앞 지역의 스크롤 깊이를 물려받는다.
   */
  function handleRegionSelect(regionCode: string) {
    setSelectedDong(null);
    setVisibleCount(10);
    setCurrentRegionCode(regionCode);
    regionComplexes.query(regionCode);
  }

  /**
   * 지역 조회가 **성공**하면 화면 단계를 "결과"로 넘긴다.
   *
   * `regionComplexes.status`가 "success"로 바뀌는 순간에만 반응한다 —
   * "loading"·"error"는 이 조건에 걸리지 않으므로 화면은 계속 "입력"에
   * 머문다(그 두 상태는 `EntryScreen` 안에서 그 자체로 보여준다). 성공
   * 여부와 무관하게(예: `units.length === 0`이어도) 조회 자체가 성공하면
   * 넘어간다 — "이 지역엔 데이터가 없어요"도 이미 확인된 사실이므로
   * "결과" 화면이 보여줄 몫이지, 입력 화면이 계속 붙들고 있을 이유가
   * 아니다.
   *
   * 의존 배열이 `regionComplexes.status`만 본다는 것이 중요하다 —
   * `phase`를 넣지 않는다. 넣으면 "조건 다시 넣기"로 "입력"에 돌아간
   * 직후에도 status가 여전히 "success"이므로 이 effect가 다시 돌아
   * 곧바로 "결과"로 되튕긴다. 지금 형태는 status가 실제로
   * **바뀔 때만** 반응하므로, 같은 지역을 다시 조회하지 않는 한
   * "조건 다시 넣기"가 붙든 "입력" 상태가 유지된다.
   */
  useEffect(() => {
    if (regionComplexes.status === "success") setPhase("결과");
  }, [regionComplexes.status]);

  /**
   * "조건 다시 넣기". 화면 단계만 "입력"으로 되돌린다.
   *
   * 프로필(`useProfileForm`)·지역 조회 결과(`regionComplexes`)·구매
   * 유형 등 나머지 상태는 전혀 건드리지 않는다 — 새로 조회하지 않고
   * 화면만 되돌아가는 것이므로, 이미 입력한 값도 기존 조회 결과도 그대로
   * 남는다(task-3-brief.md의 요구사항).
   */
  function handleBackToEntry() {
    setPhase("입력");
  }

  /**
   * 가정 문구(`AssumptionLine`)의 항목을 눌렀다. 그 항목을 열고,
   * **화면 1로 함께 되돌린다.**
   *
   * 되돌리지 않으면 이 버튼은 눌러도 아무 일도 일어나지 않는다:
   * 그 항목을 여는 곳은 `ProfileForm`인데, 그 폼은 이제 `EntryScreen`
   * 안에 있고 `EntryScreen`은 `phase === "결과"` 내내
   * `display: none`이다 — 그리고 이 칩들이 보이는 단계가 바로 그
   * "결과"뿐이다. 칩의 문구가 직접 "눌러서 알려주세요"라고 지시하므로,
   * 눌러서 아무 일도 일어나지 않으면 화면이 자기 지시를 지키지
   * 않는 것이 된다(`AssumptionLine`이 스스로 적은 원칙 — "숨긴 가정을
   * 조용히 깔지 않고, 결과 옆에 두어 눌러서 고칠 수 있게 한다").
   *
   * `handleBackToEntry`와 같은 이유로 화면 단계만 바꾼다 — 프로필도
   * 지역 조회 결과도 그대로 남으므로, 값을 고치고 "이 지역으로
   * 조회하기"를 다시 누르면 결과로 돌아온다.
   */
  function handleOpenAssumption(field: AssumableField) {
    setOpenField(field);
    setPhase("입력");
  }

  /**
   * 지도용 좌표. 목록보다 늦게 채워진다 — 목록이 지도의 느린 응답을
   * 기다리지 않아야 한다(useComplexCoordinates 문서, 부모 스펙 §3).
   * 지역 조회가 성공하면(목록이 이미 뜬 뒤) 같은 지역으로 좌표도 조회한다.
   */
  const complexCoordinates = useComplexCoordinates();

  /** 조회 결과에 실제로 있는 행정동만. 없는 동은 고를 수 있으면 안 된다 */
  const dongOptions = useMemo(
    () => [...new Set(regionComplexes.units.map((u) => u.legalDongName))].sort(),
    [regionComplexes.units],
  );

  const dongFilteredUnits = useMemo(
    () =>
      selectedDong === null
        ? regionComplexes.units
        : regionComplexes.units.filter((u) => u.legalDongName === selectedDong),
    [regionComplexes.units, selectedDong],
  );

  /**
   * `regionCodes`에 빈 배열을 넘긴다 — 지역 필터를 여기서 걸지 않는다.
   *
   * 이 목록의 원천(`dongFilteredUnits`)은 이미 사용자가 확정한 지역
   * 하나를 조회한 결과이고, 행정동 좁히기까지 끝난 뒤다. 같은 일을
   * `buildComplexList`에서 한 번 더 할 이유가 없다.
   *
   * `regionComplexes.status`를 함께 보는 이유는, 조회하기 전(idle)이나
   * 실패했을 때도 `units`가 빈 배열이라 그 사실만으로는 "이 지역에
   * 없다"와 "아직 묻지 않았다"가 구분되지 않기 때문이다 — 성공했을
   * 때만 목록을 만든다.
   */
  const complexList = useMemo(
    () =>
      // `|| purchaseType !== "실거주"`를 이 줄에 붙여 둔다 —
      // `scripts/purchase-structure.test.ts`의 변이 검사가 이 문자열을
      // 소스에서 그대로 찾아 "유형 조건을 지우면 잡아내는지"를 확인한다.
      profile === null || purchaseType !== "실거주" ||
      regionComplexes.status !== "success"
        ? null
        : buildComplexList({
            units: dongFilteredUnits,
            profile,
            rules,
            regionCodes: [],
          }),
    [profile, purchaseType, regionComplexes.status, dongFilteredUnits],
  );

  /**
   * 같은 목록을 **행정동 좁히기를 걸지 않고** 한 번 더 만든 것.
   *
   * 화면에는 절대 그리지 않는다 — 아래 `dongFilteredEmpty`가 "0건의
   * 원인이 동인가"를 가르는 데에만 쓴다. 동을 좁혀 0건이 됐을 때, 동을
   * 풀면 뭔가 나오는지를 이 목록으로 확인한다. 순수 함수라 두 번 불러도
   * 결과가 같고, 둘 다 메모이즈돼 있어 비용도 미미하다.
   */
  const unfilteredComplexList = useMemo(
    () =>
      profile === null || purchaseType !== "실거주" ||
      regionComplexes.status !== "success"
        ? null
        : buildComplexList({
            units: regionComplexes.units,
            profile,
            rules,
            regionCodes: [],
          }),
    [profile, purchaseType, regionComplexes.status, regionComplexes.units],
  );

  /**
   * 행정동을 하나로 좁혔는데 그 동엔 예산에 맞는 단지가 하나도 없는가.
   *
   * **여기서 직접 가른다** — `ComplexList`의 `EmptyMessage`(기본 문구
   * "지금 예산으로 살 수 있는 단지가 이 데이터에는 없어요. 현금이 더
   * 있으면 선택지가 생겨요")에 맡기지 않는다. 위 지역 0건 분기와 같은
   * 이유다: 행정동으로 좁힌 뒤 결과가 0개인 원인은 두 가지인데("이
   * 동엔 없다" / "예산이 부족하다"), `ComplexList`는 이 둘을 가르지
   * 못한다 — `dongFilteredUnits`가 이미 한 동으로 좁혀진 상태로
   * 들어가므로 `emptyBecauseOfFilter`는 여기서도 지역 분기와 같은 이유로
   * 구조적으로 항상 false다.
   *
   * 진짜 원인은 "예산이 부족하다"가 아니라 "**이 동**엔 맞는 게 없다"인
   * 경우가 많다 — 사용자가 방금 스스로 동을 좁혔고, 예산은 그 전(동을
   * 좁히기 전) 목록에서 이미 확인된 채였을 수 있다. 그런데도 화면이
   * "현금이 더 있으면"이라고 말하면, 진짜 해법("동 선택을 넓혀 보세요")
   * 대신 틀린 해법을 준다. 그래서 `selectedDong`이 걸려 있고 걸러진
   * 결과가 0개면 `ComplexList`를 아예 부르지 않고 이 사실 하나만
   * 말한다.
   *
   * **다만 지역 전체에도 0건이면 이 문구를 쓰지 않는다.** 이 문구가 담은
   * 조언("다른 동을 선택하거나 전체로 넓혀 보세요")은 넓히면 결과가
   * 달라진다는 뜻인데, 지역 전체가 이미 0건이면 전체로 넓혀도 똑같은
   * 0건이다 — 사실이 아닌 조언으로 진짜 원인(예산 부족, 또는 상환 능력
   * 0)을 가리는, 방향만 뒤집힌 **같은 오귀속**이다. 그때는 그대로
   * `ComplexList`로 흘려보낸다: 그쪽은 `noRepaymentCapacity`(DSR이 0)와
   * 일반 예산 부족을 이미 갈라 각각 다른 해법을 말하고, 그 문구들은
   * 목록이 비어 있다는 사실만으로 올바르게 그려진다.
   *
   * 그래서 동을 걸지 않은 {@link unfilteredComplexList}를 함께 본다.
   */
  const isEmptyList = (list: typeof complexList) =>
    list !== null &&
    list.withinSafe.length === 0 &&
    list.unverified.length === 0 &&
    list.beyondSafe.length === 0;

  const dongFilteredEmpty =
    selectedDong !== null &&
    isEmptyList(complexList) &&
    !isEmptyList(unfilteredComplexList);

  /**
   * 지도에 그리는 단지들. **목록에 뜨는 단지와 정확히 같은 집합이다.**
   *
   * `complexList`가 이미 두 가지를 순서대로 건 결과(동 좁히기 →
   * 예산 필터)이므로, 그 세 덩어리를 도로 합치기만 하면 두 창이
   * 어긋날 방법이 없다. 예전처럼 지도에 `dongFilteredUnits`(예산
   * 필터 전)를 넘기지 않는다 — 그러면 왼쪽 목록엔 3개인데 오른쪽
   * 지도엔 40개가 뜨고, 지도 어디에도 "이건 예산으로 거른 게
   * 아니에요"라고 적혀 있지 않았다. 더 나쁜 것은 마커 색(옅다=싸다)이
   * **그려진 집합** 기준의 3분위라, 옅은 마커가 "이 지역 기준으로
   * 싼 편"일 뿐인데 "내 예산에 맞는다"로 읽혔다는 점이다.
   *
   * 같은 필터를 여기서 다시 구현하지 않고 `complexList`에서 되꺼내는
   * 것이 핵심이다. 조건을 두 번 적으면 한쪽만 고쳐지는 날이 오고,
   * 그날 두 창은 조용히 다른 집합을 말한다.
   *
   * 세 덩어리를 모두 넣는다 — 목록도 셋을 모두 그린다(무리 없음·
   * 확인 필요·부담이 큼). 지도에서 `withinSafe`만 그리면 지도가
   * 목록보다 낙관적으로 말하게 된다.
   */
  const mappedUnits = useMemo(
    () =>
      complexList === null
        ? []
        : [
            ...complexList.withinSafe,
            ...complexList.unverified,
            ...complexList.beyondSafe,
          ].map((entry) => entry.unit),
    [complexList],
  );

  /**
   * 지도에 그릴 단지가 하나라도 있는가.
   *
   * 좌표 조회를 걸지, 지도를 그릴지를 **이 값 하나로** 정한다. 두
   * 자리에서 각각 길이를 세면 한쪽만 고쳐져 어긋난다. 그릴 것이 없는
   * 줄 이미 아는 채로 국토부·네이버 지오코딩 호출량을 쓰지 않는다.
   *
   * 예전에는 같은 역할을 `hasRegionUnits`(이 지역 조회에 단지가 하나라도
   * 있었는가)가 했다. 지도가 지역 전체가 아니라 예산에 맞는 단지만
   * 그리게 되면서 기준이 여기로 내려왔다.
   */
  const hasMappedUnits = mappedUnits.length > 0;

  /*
   * 좌표 조회를 건다.
   *
   * **이 effect는 `hasMappedUnits`(지도에 실제로 그릴 단지가 있는가)
   * 아래에 있어야 한다** — 의존성 배열은 렌더 중에 평가되므로, 선언보다
   * 위에 두면 TDZ에 걸린다.
   *
   * 조건이 예전의 "이 지역에 단지가 하나라도 있는가"(`hasRegionUnits`)에서
   * 여기로 옮겨 온 이유: 지도가 이제 예산에 맞는 단지만 그리므로, 지역에
   * 단지가 많아도 예산에 맞는 것이 0개면 그릴 것이 없다. 그릴 것이 없는
   * 줄 이미 아는 채로 지오코딩 호출량을 쓰지 않는다.
   *
   * 좌표는 여전히 **지역 전체**로 한 번 받아 온다(`query(regionCode, null)`) —
   * 캐시 단위를 지역으로 두어야 동을 바꾸거나 예산을 조금 움직일 때마다
   * 다시 묻지 않는다. 지도에 무엇을 그릴지는 아래 렌더가 `mappedUnits`로
   * 따로 정한다.
   */
  useEffect(() => {
    if (regionComplexes.status !== "success" || currentRegionCode === null) return;
    if (!hasMappedUnits) return;
    complexCoordinates.query(currentRegionCode, null);
    // `complexCoordinates.query`는 useCallback([], ...)이라 참조가 안
    // 고정돼 있다 — 그래도 의존성에 적어 둔다. 이 effect가 그 사실에
    // 조용히 기대고 있으면, 훅 쪽이 바뀌는 날 여기서 무한 루프가 난다.
  }, [regionComplexes.status, currentRegionCode, hasMappedUnits, complexCoordinates.query]);

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
    /*
     * 투자 목적 유형(갭투자·월세수익형)은 지역 조회를 거치지 않는다 —
     * `PurchaseCheck`가 입력과 결과를 한 화면에서 즉시 보여주는
     * 컴포넌트라, "지역 조회 성공"이라는 이 앱의 유일한 "결과로
     * 넘어가는" 신호가 그 경로에는 아예 없다. 그 신호를 기다리기만
     * 하면 `EntryScreen`(영상)이 영영 걷히지 않아 `PurchaseCheck`가
     * 화면 뒤에 가려진 채로 남는다 — 그래서 여기서 직접 "결과"로
     * 넘긴다. 반대로 실거주를 고르면 아래 규칙대로 되돌린다.
     *
     * (이 핸들러는 두 자리에서 불린다 — 실거주 경로의 화면 1 안에 선
     * 라디오와, 투자 경로의 결과 화면에 선 라디오다. 그래서 "입력"
     * 단계에서만 불린다고 전제할 수 없다.)
     */
    /*
     * 리뷰 수정(Minor 6): 실거주로 돌아올 때 무조건 "입력"으로 되돌리면,
     * 이미 성공한 지역 조회 결과가 그대로 남아 있는데도 화면이 다시
     * 조회를 요구한다 — 데이터는 `regionComplexes`에 그대로 있고 화면
     * 게이트만 막고 있는 상태다. 볼 것이 이미 있으면 결과로 보낸다
     * (거기서 "조건 다시 넣기"로 언제든 화면 1로 갈 수 있다). 아직
     * 조회한 적이 없으면(idle/loading/error) 화면 1이 맞다 — 그쪽이
     * 조회 로딩·실패 문구를 그리는 자리다.
     */
    setPhase(
      next === "실거주"
        ? regionComplexes.status === "success"
          ? "결과"
          : "입력"
        : "결과",
    );
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
      {/*
        화면 1 — 영상 위 입력 화면. `EntryScreen`은 `phase`가 "결과"가
        되면 이 전체를 시각적으로 숨긴다(언마운트는 하지 않는다 —
        `EntryScreen`의 doc comment 참고). 서비스 제목·부제·구매 유형·
        프로필 입력·지역 선택까지, "입력"이라는 이름이 뜻하는 모든 것을
        여기 한 번에 담는다 — 아래 `ErrorBoundary` 안쪽(화면 2에 해당하는
        내용)에는 더 이상 이 세 컴포넌트가 나오지 않는다.
      */}
      <EntryScreen phase={phase}>
        {/*
          design.md §3의 "작은 라벨"(눈썹) 자리는 비워 둔다.

          리뷰 수정(Minor 11): 여기 있던 "예산 계산"은 바로 아래 제목
          ("내 예산으로 살 수 있는 집")을 다시 말할 뿐이라 읽는 사람에게
          아무것도 더해 주지 않았다 — 눈에는 들어오는데 뜻이 없는 줄은
          제목이 하는 일을 방해한다. 대신 채울 새 카피를 짓지도 않는다
          (design.md §7: 카피는 별도 프로젝트). 사실을 하나 더 말할 것이
          생기면 그때 이 자리에 넣는다.
        */}
        <h1>내 예산으로 살 수 있는 집</h1>
        <p className="subtitle">
          {/*
            리뷰 수정(인쇄 함께 볼 것): "이 브라우저를 벗어나지 않아요"는
            "이 브라우저"라는 지시 대상이 종이 위에는 없어 뜻이 서지 않는다
            — 인쇄에서만 지운다(hiddenInPrint.ts의 .subtitle-privacy-note).
            뒤에 붙는 "고른 지역 코드만 서버로 전송돼요"도 같은 약속의
            단서라 같은 span 안에 둔다. 앞의 룰셋 기준은 종이에서도 뜻이
            있어 남긴다.

            "· 수도권"은 지웠다. 지역이 전국으로 넓어져 더 이상 사실이
            아니다 — 범위를 실제보다 좁게 말하는 쪽이라도, 화면이 확인한
            적 없는 것을 말하는 것은 마찬가지다.
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
            : `구매 유형 기준 ${purchaseRules.version}`}
          <span className="subtitle-privacy-note">
            {" "}
            · 입력한 재무정보는 이 브라우저를 벗어나지 않아요. 지역 실거래가 조회에는
            고른 지역 코드만 서버로 전송돼요.
          </span>
        </p>

        {/*
          리뷰 수정(Important 3): 유형 선택을 **실거주에서만** 여기 둔다.

          투자 경로(월세수익형·갭투자)에서는 이 라디오가 아래 결과 화면,
          자기 입력(`PurchaseCheck`) 바로 위에 선다. 투자 경로는
          `handlePurchaseTypeChange`가 유형을 고르는 순간 phase를 "결과"로
          넘기는데, 그 순간 이 화면(`.entry-screen`)은 `display: none`이
          된다 — 유형 선택이 여기에만 있으면 투자 결과 화면에서는 유형을
          **바꿀 방법이 아예 없었다.** 그래서 "조건 다시 넣기"가 유일한
          탈출구였고, 그 버튼이 데려오는 이 화면에는 (실거주가 아니므로
          `ProfileForm`·`RegionSelect`도 없이) 유형 라디오 하나만 남아
          막다른 길이 됐다. 게다가 고를 수 있는 투자 유형은 월세수익형
          하나뿐이라(`SELECTABLE_PURCHASE_TYPES`), 이미 선택된 라디오를
          다시 눌러도 `onChange`가 불리지 않아 결과로 돌아갈 수도 없었다 —
          유일한 실질 선택지인 실거주는 `PurchaseCheck`를 언마운트하며
          `usePurchaseCheck`의 입력값을 지운다("돌아가도 입력값은
          남는다"는 제약 위반).

          유형 선택이 결과 화면에 함께 서면 그 막다른 길이 사라진다 —
          그리고 그 화면의 "조건 다시 넣기"는 되돌릴 조건이 없는 채로
          남으므로 아래 투자 분기에서 뺐다.
        */}
        {purchaseType === "실거주" && (
          <PurchaseTypeSelect
            rules={purchaseRules}
            value={purchaseType}
            onChange={handlePurchaseTypeChange}
            restoreFailed={restoreFailed}
          />
        )}

        {/*
          프로필 입력·지역 선택은 실거주에서만 뜻이 있다 — 갭투자·월세
          수익형은 `PurchaseCheck`가 자기 입력을 따로 받는다(아래
          `ErrorBoundary` 안, App.tsx 하단 주석 참고).
        */}
        {purchaseType === "실거주" && (
          <>
            <ProfileForm
              state={state}
              setField={setField}
              openField={openField}
              areaOverridden={selectedUnit !== null}
            />

            {/*
              프로필이 아직 안 끝났으면(주택 수 미답 포함) 지역 선택을
              보여주지 않는다 — 예산을 모르는 채로 지역부터 확정하게
              두지 않는다. 대신 무엇이 모자란지를 바로 아래 else 가지가
              같은 조건에서 말한다(리뷰 수정 Important 5).
            */}
            {affordability === null || residentialProfile === null ? (
              /*
                리뷰 수정(Important 5): 무엇이 비어서 조회 버튼이 안
                나오는지 이 화면에서 말한다.

                예전에는 이 문구가 결과 트리 쪽(아래 `ErrorBoundary` 안)
                에만 있었다. 그런데 그 조건(`affordability === null ||
                residentialProfile === null`)은 실거주 경로에서 사실상
                `phase === "입력"`을 뜻하고, 그 동안 결과 트리는 이
                불투명한 오버레이 **밑에** 깔려 있다 — 존재 이유인 모든
                상태에서 100% 보이지 않는 문구였다. 현금·소득만 넣고
                주택 수를 답하지 않은 사람은 "이 지역으로 조회하기"가
                그냥 나타나지 않는 것을 보고, 화면 어디에서도 무엇이
                모자란지 듣지 못했다.

                `App.tsx`가 여섯 번 반복한 버그 형태(어떤 상태가 자기
                원인을 말하지 않는 것)의 뒤집힌 판이다 — 문구는 있었지만
                사용자가 아니라 테스트 하네스만 볼 수 있는 자리에 있었다.
              */
              <p className="prompt">
                현금·연소득·주택 수를 알려주면 살 수 있는 가격을 계산해요.
              </p>
            ) : (
              <>
                <RegionSelect onSelect={handleRegionSelect} />

                {regionComplexes.status === "loading" && (
                  <p>지역 실거래가를 조회하고 있어요…</p>
                )}

                {regionComplexes.status === "error" && (
                  <div className="region-query-error">
                    <p>지금 실거래가를 불러오지 못했어요.</p>
                    <button type="button" onClick={regionComplexes.retry}>
                      다시 시도
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </EntryScreen>

      {/*
        화면 2 — 결과. `phase === "입력"`인 동안에는 이 안 전체가
        `inert`다.

        리뷰 수정(Important 4): `.entry-screen`이 `visibility: hidden`
        대신 `display: none`을 쓰는 이유("숨은 컨트롤이 포커스를 받으면
        안 된다")는 정확한데, 그 논리가 한 방향으로만 적용돼 있었다.
        `phase === "입력"`일 때 이 결과 트리는 **여전히 전부 렌더링된
        채로** 불투명한 `z-index: 40` 오버레이 **밑에** 깔려 있다 —
        인쇄 버튼·가격 슬라이더·단지 행·"더 보기"·가정 칩·상세 닫기
        버튼까지. 키보드 사용자는 보이지 않는 컨트롤로 탭이 빨려 들어가고,
        스크린 리더는 화면에 없는 결과 페이지를 읽는다.

        `inert` 하나로 **포커스와 접근성 트리 노출을 동시에** 끊는다
        (`aria-hidden`은 포커스를 막지 못하고, `tabindex="-1"`은 AT
        노출을 막지 못한다 — 둘을 따로 관리하면 언젠가 한쪽만 고쳐진다).
        `display: none`이 아닌 이유는 인쇄다: `phase`가 "입력"인 채로
        인쇄해도 이 트리는 종이에 나와야 한다(`inert`는 렌더링·인쇄에
        영향을 주지 않는다). 리액트 19는 `inert`를 불리언 prop으로
        그대로 넘긴다.
      */}
      <div className="results-screen" inert={phase === "입력"}>
      {/*
        화면에서는 숨고 인쇄에서만 나오는 한 줄(styles.css의
        `.purchase-type-print`). 예전에는 `PurchaseTypeSelect` 안에
        있었는데, 그 컴포넌트가 실거주 경로에서 `EntryScreen` 안에 놓이고
        그 레이어는 인쇄에서 통째로 지워지므로(hiddenInPrint.ts의
        `.entry-screen`) 보호 대상 클래스(`purchase-type-print`,
        MUST_SURVIVE_PRINT_CLASSES)가 조상과 함께 사라졌다 —
        `printCss.test.ts`는 선택자 문자열만 보므로 그 형태는 잡지 못한다.
        그래서 이 레이어 밖에서 그린다. 이 종이가 어떤 구매 유형을
        전제하는지 말하는 줄이라, 없으면 종이를 건네받은 사람은 아래
        숫자들이 무엇 위에 서 있는지 알 수 없다.
      */}
      <p className="purchase-type-print">
        구매 유형 — {purchaseRules.types[purchaseType].label}
      </p>

      <ErrorBoundary onReset={reset}>
        {/*
          유형을 고르면 그 유형에 맞는 화면만 나온다.

          실거주에서는 지금까지와 **똑같은** 예산 계산이 그대로 나오고,
          갭투자·월세 수익형에서는 그 자리가 통째로 유형별 지표로 바뀐다.
          두 화면을 나란히 두지 않는 이유는 화면 정리가 아니라 계산이다 —
          실거주 예산 계산은 실거주 대출 한도 위에 서 있어서, 투자 목적
          매수 옆에 두면 그 한도를 이 매수에 쓸 수 있는 것처럼 읽힌다.
          `residentialProfile`이 그 계산 자체를 막고, 이 분기가 화면을
          막는다.
        */}
        {purchaseType === "실거주" ? (
          <>
          {/*
            주택 수도 필수 답이 됐다 — 미입력을 무주택으로 대신 채우면
            정책대출 자격이 넓어져 한도가 커지는데, 그건 사용자가 확인한
            적 없는 값으로 낙관적인 답을 내는 것이다(useProfileForm.ts의
            `ownedHomeCount` 주석 참고). 그래서 `toProfile`이 null이면
            이 트리는 아무 숫자도 그리지 않는다. **무엇이 모자란지를
            말하는 안내는 화면 1(`EntryScreen`) 쪽에 있다** — 이 조건이
            참인 동안 이 트리는 그 불투명한 오버레이 밑에 깔려 있어,
            여기 적으면 아무도 읽을 수 없다(리뷰 수정 Important 5).

            `residentialProfile`을 함께 보는 이유는 타입 좁히기다 —
            아래에서 이 프로필로 취득세 고지를 골라야 하는데, 두 값이
            같은 조건에서 생기고 사라지므로 조건도 함께 둔다.
          */}
          {affordability !== null && residentialProfile !== null && (
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
                onOpen={handleOpenAssumption}
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
                  {/*
                    `RegionSelect`와 조회 로딩/실패 문구는 이제
                    `EntryScreen`(화면 1) 안에만 있다 — 여기(화면 2에
                    해당하는 내용)는 조회가 이미 **성공**했을 때만
                    렌더되므로(phase가 "결과"가 되는 유일한 조건과 같다),
                    그 두 상태를 다시 그릴 필요가 없다.

                    **"이 지역엔 실거래가가 0건"은 여기서 직접 가른다** —
                    `ComplexList`의 `emptyBecauseOfFilter`에 맡기지 않는다.

                    `buildComplexList`의 그 값은 `shown.length === 0 &&
                    units.some(affordable)`인데, 위에서 `regionCodes: []`
                    (필터 없음)를 넘기므로 `shown`이 곧 `units.filter(affordable)`
                    이 된다 — 그러면 두 조건이 동시에 참일 수 없어
                    `emptyBecauseOfFilter`가 **구조적으로 항상 false**다.
                    `hasRegionFilter`를 참으로 고정해도 "지역을 넓혀
                    보세요" 분기는 절대 뜨지 않고, 진짜 원인이 "이 지역엔
                    데이터가 없다"인 경우까지 "예산이 부족해요"로 잘못
                    표시된다 — 모르는 것과 확인한 것을 같은 문구로 보여주는,
                    이 앱이 가장 경계하는 오류다.

                    그래서 `hasRegionFilter`는 `false`로 둔다. 지역을 이미
                    하나로 확정한 뒤라 "넓혀 보라"는 조언 자체가 성립하지
                    않는다. `units.length > 0`인데 예산이 안 맞는 경우는
                    `ComplexList`의 기존 예산 기반 문구가 그대로, 올바르게
                    처리한다.

                    집계 창은 `AGGREGATION_WINDOW_LABEL`에서만 만든다 —
                    "최근 6개월"을 직접 박아 넣으면 파이프라인이 창을 바꿨을
                    때 이 문구만 남아 근거 기간을 실제와 다르게 말하게 된다
                    (`src/data/complexes.ts` 참고).
                  */}
                  {regionComplexes.status === "success" &&
                    regionComplexes.units.length === 0 && (
                      <p className="region-empty">
                        이 지역엔 {AGGREGATION_WINDOW_LABEL} 실거래가 자체가
                        없어요. 다른 지역을 선택해 보세요.
                      </p>
                    )}

                  {regionComplexes.status === "success" &&
                    regionComplexes.units.length > 0 && (
                      <div className="region-results-grid">
                        <div className="region-results-sidebar">
                          {/*
                            매물 유형(아파트/오피스텔) 필터 자리 — 지금은
                            비활성 placeholder다. 오피스텔 실거래가 데이터는
                            아직 연동하지 않았다(국토부 아파트매매 실거래가
                            API만 쓴다 — 별도 스펙에서 오피스텔 매매 실거래가
                            API를 새로 연동할 때 이 select를 활성화한다).
                            `dongOptions`(동 좁히기)와 달리 데이터 유무에
                            좌우되지 않는 정적 요소라 그 조건 밖, 사이드바
                            상단에 항상 그린다.
                          */}
                          <div className="field housing-type-select">
                            <label htmlFor="housing-type">매물 유형</label>
                            <select id="housing-type" value="apartment" disabled>
                              <option value="apartment">아파트</option>
                            </select>
                          </div>
                          {/*
                            `.dong-narrow`는 인쇄에서 지우는 선택자다
                            (`src/print/hiddenInPrint.ts`) — 종이 위에서는
                            고를 수 없는 장치다. 클래스가 없으면 그 규칙이
                            이 select에 닿지 못한다.
                          */}
                          {dongOptions.length > 1 && (
                            <div className="field dong-narrow">
                              <label htmlFor="dong-narrow">행정동으로 좁히기</label>
                              <select
                                id="dong-narrow"
                                value={selectedDong ?? ""}
                                onChange={(e) => {
                                  setSelectedDong(
                                    e.target.value === "" ? null : e.target.value,
                                  );
                                  // 앞서 걸러지지 않은 목록에서 "더 보기"로
                                  // 늘려 둔 행 수를 되돌린다 — 안 그러면 동을
                                  // 좁힌 새 목록이 이전 목록의 스크롤
                                  // 깊이를 그대로 물려받는다
                                  // (handleRegionSelect와 같은 이유).
                                  setVisibleCount(10);
                                }}
                              >
                                <option value="">전체</option>
                                {dongOptions.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {dongFilteredEmpty ? (
                            <p className="dong-empty">
                              이 동엔 조건에 맞는 단지가 없어요. 다른 동을
                              선택하거나 전체로 넓혀 보세요.
                            </p>
                          ) : (
                            complexList !== null && (
                              <ComplexList
                                result={complexList}
                                /*
                                  이 조회가 실제로 반영한 계약월이다.
                                  번들의 `DATA_AS_OF`(옛 배치 파이프라인이
                                  3개 구를 돌린 시점)를 쓰면, 전국 아무
                                  지역이나 그때그때 조회하는 지금 화면에서는
                                  확인한 적 없는 신선도를 사실처럼 말하게
                                  된다. 모르면(null) ComplexList가 그 줄을
                                  아예 그리지 않는다.
                                */
                                dataAsOf={regionComplexes.dataAsOf}
                                hasRegionFilter={false}
                                noRepaymentCapacity={
                                  affordability.result.loanLimit.breakdown.DSR === 0
                                }
                                visibleCount={visibleCount}
                                onShowMore={() => setVisibleCount((n) => n + 10)}
                                onSelect={handleSelectUnit}
                              />
                            )
                          )}
                        </div>
                        <div className="region-results-map">
                          {/*
                            이 안쪽 조건의 `status === "success"`는 바깥
                            `region-results-grid` 조건이 이미 보장한다 — 이
                            블록에 들어왔다는 것 자체가 참이라는 뜻이라
                            여기서는 redundant하다. 그래도 diff 리뷰에서
                            "왜 지워졌는지"를 되짚게 만들지 않으려 그대로
                            남긴다. 실제로 걸러내는 건 `complexList !== null`과
                            아래 `hasMappedUnits` 분기다.

                            예전에 있던 `!dongFilteredEmpty`는 뺐다 — 동으로
                            좁혀 0건이면 `mappedUnits`도 반드시 0이라 아래
                            분기가 이미 같은 경우를 잡는다. 두 조건을 함께
                            두면 "동 때문에 0건"일 때만 지도 칸이 통째로
                            비고(아무 문구도 없이), "예산 때문에 0건"일 때는
                            문구가 뜨는, 같은 사실을 두 가지로 보여주는
                            어긋남이 생긴다.
                          */}
                          {regionComplexes.status === "success" &&
                            complexList !== null &&
                            !hasMappedUnits && (
                              /*
                                지도에 그릴 단지가 없다. **원인을 여기서
                                단정하지 않는다** — 원인은 왼쪽(모바일에선
                                아래) 목록 칸이 이미 자기 문구로 말한다:
                                동으로 좁혀서면 `.dong-empty`, 예산 때문이면
                                `ComplexList`의 예산/상환능력 문구. 여기서
                                "예산이 부족해요"라고 적으면 동 때문에 빈
                                경우에 틀린 원인을 말하게 되고, 그건 이
                                화면이 이미 한 번 겪은 오귀속이다.

                                그래서 이 문구는 지도 칸이 아는 사실 하나만
                                말한다: 그릴 것이 없다. "지도를 표시하지
                                못했어요"(SDK 실패)·"단지 위치를 불러오지
                                못했어요"(좌표 조회 실패)와 절대 같은 말을
                                쓰지 않는다 — 여기는 아무것도 실패하지
                                않았다.
                              */
                              <p className="complex-map-empty">
                                조건에 맞는 단지가 없어 지도에 표시할 단지가
                                없어요.
                              </p>
                            )}
                          {regionComplexes.status === "success" &&
                            complexList !== null &&
                            hasMappedUnits && (
                              <>
                                {/*
                                  좌표 조회(complexCoordinates)는 목록 조회와 별개로
                                  도는 상태 기계다 — idle/loading/error/success를
                                  그대로 구분해 보여준다. "조회 실패"와 "조회했더니
                                  단지가 하나도 없더라"를 같은 빈 지도로 보여주면,
                                  이 앱이 가장 경계하는 오류(모르는 것과 확인한
                                  것을 같은 문구로 보여주는 것)를 지도에서도
                                  반복하게 된다.

                                  idle은 이 렌더 경로에선 사실상 스치는 순간뿐이다
                                  — 위 useEffect가 regionComplexes.status가
                                  "success"로 바뀌자마자(바로 이 조건 블록이
                                  그려지는 시점과 같은 렌더) query()를 호출해
                                  "loading"으로 넘어간다. 그래도 그 찰나에 아무것도
                                  안 그리면 화면이 깜빡이므로 로딩과 같은 문구를
                                  보여준다.
                                */}
                                {/*
                                  로딩·실패 문구를 `.complex-map-status`로 함께
                                  감싼다 — 인쇄에서는 아래 지도 자신
                                  (`.complex-map`)이 지워지므로, 이 문구들을 종이에
                                  남기면 근거를 잃은 "불러오고 있어요…"나 눌러도
                                  반응 없는 "다시 시도" 버튼만 남는 고아 문구가
                                  된다(src/print/hiddenInPrint.ts 참고).
                                */}
                                {(complexCoordinates.status === "idle" ||
                                  complexCoordinates.status === "loading" ||
                                  complexCoordinates.status === "error") && (
                                  <div className="complex-map-status">
                                    {(complexCoordinates.status === "idle" ||
                                      complexCoordinates.status === "loading") && (
                                      <p>지도를 불러오고 있어요…</p>
                                    )}

                                    {complexCoordinates.status === "error" && (
                                      <div className="region-query-error">
                                        {/*
                                          세 실패 문구는 원인이 다르므로 서로 다르게
                                          말한다: 목록 조회 실패("지금 실거래가를…"),
                                          좌표 조회 실패(여기), 네이버지도 SDK 로드
                                          실패("지도를 표시하지 못했어요" —
                                          ComplexMap.tsx). 같은 문구로 뭉치면 사용자도
                                          테스트도 무엇이 실패했는지 구분하지 못한다.
                                        */}
                                        <p>단지 위치를 불러오지 못했어요.</p>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (currentRegionCode !== null) {
                                              complexCoordinates.query(currentRegionCode, null);
                                            }
                                          }}
                                        >
                                          다시 시도
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {complexCoordinates.status === "success" && (
                                  <>
                                    <ComplexMap
                                      /*
                                        목록과 **정확히 같은 집합**을 넘긴다
                                        (`mappedUnits` 정의의 주석 참고).
                                        `dongFilteredUnits`(예산 필터 전)를
                                        넘기면 두 창이 다른 단지를 말한다.
                                      */
                                      units={mappedUnits}
                                      coordinates={complexCoordinates.coordinates}
                                      naverMapClientId={
                                        import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string
                                      }
                                    />
                                    {/*
                                      지오코딩이 일부 주소에서 던졌다(429/5xx/네트워크
                                      오류) — 주소가 진짜로 없어서가 아니다
                                      (api/_lib/handleGeocode.ts의 partialFailureCount
                                      참고). 새 로딩/에러/성공 3분기를 또 만들지
                                      않고, 이미 뜬 지도 옆에 한 줄만 덧붙인다 —
                                      성공적으로 찾은 단지는 그대로 지도에 남아
                                      있으니 "지도가 비어 있다"와 다르게 말해야
                                      한다.

                                      리뷰 수정(Minor 4): 위 조건만으로는 ComplexMap이
                                      이미 "주소로는 위치를 찾을 수 없었어요"(noneLocated)를
                                      보여주고 있을 때도 이 줄이 함께 뜰 수 있었다 —
                                      "**일부** 단지의 위치를…"이 안엔 "하나도"라고
                                      말하는 문구와 부딪힌다. `groupWithCoords`로
                                      ComplexMap 내부와 같은 계산(좌표를 아는 단지가
                                      하나라도 있는가)을 여기서도 돌려, 하나도 없을
                                      땐 이 줄을 접는다 — 있을 땐 그대로 뜬다.
                                    */}
                                    {complexCoordinates.hasPartialFailures &&
                                      groupWithCoords(mappedUnits, complexCoordinates.coordinates)
                                        .length > 0 && (
                                        <p className="complex-map-caveat">
                                          일부 단지의 위치를 확인하지 못했어요. 지도에
                                          안 보이는 단지가 있을 수 있어요.
                                        </p>
                                      )}
                                  </>
                                )}
                              </>
                            )}
                        </div>
                      </div>
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
              {/*
                화면 1(영상 위 입력)로 돌아간다. 프로필·지역 조회 결과는
                그대로 남는다(handleBackToEntry 문서 참고) — 이 버튼은
                화면 전환일 뿐 리셋이 아니다.

                `phase === "결과"`일 때만 보인다 — 프로필은 채웠지만 아직
                지역을 조회하지 않았을 때(phase가 여전히 "입력")는 이미
                `EntryScreen`이 화면을 덮고 있어 이 버튼이 뜻이 없다.
              */}
              {phase === "결과" && (
                <button
                  type="button"
                  className="back-to-entry-button"
                  onClick={handleBackToEntry}
                >
                  조건 다시 넣기
                </button>
              )}
            </>
          )}
          </>
        ) : (
          <>
            {/*
              투자 경로의 유형 선택은 이 화면에 선다(위 `EntryScreen`의
              같은 주석 참고) — 이 경로에서 화면 1은 항상 숨어 있으므로,
              여기 없으면 유형을 바꿀 자리가 화면 어디에도 없다.
            */}
            <PurchaseTypeSelect
              rules={purchaseRules}
              value={purchaseType}
              onChange={handlePurchaseTypeChange}
              restoreFailed={restoreFailed}
            />

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
            {/*
              리뷰 수정(Important 3): 이 경로에는 "조건 다시 넣기"를 두지
              않는다. 되돌릴 조건이 화면 1에 없기 때문이다 —
              `ProfileForm`·`RegionSelect`는 실거주 전용이라 투자 경로에서
              화면 1이 담는 것은 제목과 유형 라디오뿐이고, 그 라디오는
              이제 바로 위에 있다. 이 경로의 입력은 전부
              `PurchaseCheck`(이 화면) 안에 있으므로 "조건을 다시 넣는"
              자리도 이 화면이다.

              예전에는 이 버튼이 유형을 바꿀 유일한 통로였는데, 그 통로가
              데려가는 화면은 유형 라디오 하나뿐인 막다른 길이었다(위
              주석). 통로를 없애는 대신 목적지를 이 화면으로 끌어왔다.
            */}
          </>
        )}

        {/*
          진단 종합은 화면의 맨 끝(면책 문구 바로 위)에 둔다 —
          "지금까지 본 것 전부를 한자리에 모으는 마무리"로 두는 이유는
          `DiagnosisSummary.tsx` 문서에 적었다.

          네 축이 동시에 다 채워지는 일은 없다(권리분석은 이 앱에서
          제거돼 항상 `null`이고, 구매 유형별 금융은 투자 경로에서만,
          호가·입지는 실거주에서 평형을 고른 동안만 존재한다) — 그래서
          못 본 축은 값을 지어내지 않고 그대로 `null`을 넘긴다.
          `DiagnosisSummary`가 그 `null`을 "못 봤다"로 그린다.

          `<details>`로 접지 않는다 — 이 화면의 존재 이유가 "못 본
          축을 숨기지 않는 것"인데, 화면 전체를 접어 두면 클릭하지
          않은 사람에게는 그 못 본 축조차 보이지 않는다.
        */}
        <DiagnosisSummary
          rights={null}
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
      </div>
    </main>
  );
}
