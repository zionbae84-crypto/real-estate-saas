import { useEffect, useMemo, useRef, useState } from "react";
import { BudgetPanel, BUDGET_PANEL_ID } from "./components/BudgetPanel";
import { BudgetResult, ZERO_BUDGET_HEADLINE } from "./components/BudgetResult";
import { ComplexDetail } from "./components/ComplexDetail";
import { ComplexList, unitKey } from "./components/ComplexList";
import { ComplexMap, groupWithCoords } from "./components/ComplexMap";
import { EntryScreen } from "./components/EntryScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HomeIcon } from "./components/HomeIcon";
import { HoverTooltipCard, useHoverTooltip } from "./components/HoverTooltip";
import { PriceSlider } from "./components/PriceSlider";
import { PrintSummary, type AreaBasis } from "./components/PrintSummary";
import {
  FIRST_TIME_BUYER_HINT_LINES,
  OWNED_HOME_HINT_LINES,
  ProfileForm,
} from "./components/ProfileForm";
import { MoneyInput } from "./components/MoneyInput";
import { RegionQuickSelect } from "./components/RegionQuickSelect";
import { RegulationBadge } from "./components/RegulationBadge";
import { ResultShell, ResultSummaryItem } from "./components/ResultShell";
import { RegionSelect } from "./components/RegionSelect";
import { WarningList } from "./components/WarningList";
import {
  AGGREGATION_WINDOW_LABEL,
  type ComplexUnit,
} from "./data/complexes";
import {
  complexFilterBounds,
  filterByComplexFilters,
  wouldHelpToResetAxis,
  type ComplexFilterState,
} from "./lib/complex-filters";
import { buildComplexList, burdenTierOf } from "./lib/complex-list";
import { regionNameByCode } from "./data/regions";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { formatWon } from "./format/won";
import {
  calcAcquisitionCosts,
  calcBurdenAt,
  calcMaxLoan,
} from "./lib/finance";
import { rules, useAffordability } from "./state/useAffordability";
import { useComplexCoordinates } from "./state/useComplexCoordinates";
import { useRegionComplexes } from "./state/useRegionComplexes";
import { purchaseRules } from "./state/usePurchaseCheck";
import { usePurchaseType } from "./state/usePurchaseType";
import { useProfileForm } from "./state/useProfileForm";

/**
 * 부대비용 카드의 취득세 줄에 붙는 간단한 계산 기준 고지.
 *
 * `calcAcquisitionCosts`는 취득자의 주택 수를 읽지 않고 언제나 무주택
 * 기준 세율로 계산한다(acquisition-cost.ts) — 사용자가 화면 1에서 무엇을
 * 답했든 이 계산의 기준은 항상 같다. 그래서 문구도 답에 따라 갈릴 필요가
 * 없다(사용자 지시: "무주택 기준, 다주택인 경우 달라질 수 있음 정도로
 * 요약"). `householdCountNoteFor`가 돌려주는 두 긴 문구(rules.ts,
 * `PriceCheck`가 여전히 쓴다)는 여기서는 쓰지 않는다 — 부대비용 카드는
 * 요점만 보이게 한다는 것이 이번 지시의 핵심이다.
 */
const ACQUISITION_TAX_SUMMARY_NOTE =
  "취득세는 무주택 기준으로 계산했어요. 다주택이면 세율이 달라질 수 있어요.";

export function App() {
  const { state, setField, resetField, reset, profile } = useProfileForm();
  /**
   * 구매 유형. **언제나 실거주다** — 유형 선택은 사용자 지시로
   * 제거됐고, 이 앱은 실거주 전용이 됐다(usePurchaseType 문서 참고).
   *
   * 상수를 그대로 쓰지 않고 훅으로 받는 이유는 두 가지다. (1) 저장소에
   * 남은 옛 유형("월세수익형")을 그 훅이 실거주로 덮는다. (2) 아래
   * 실거주 한도 게이트(`residentialProfile`·`buildComplexList` 조건)가
   * 이 값을 읽는데, 훅이 넓은 `PurchaseType`을 돌려주므로 그 비교가
   * 타입 수준에서 자명해지지 않는다 — 유형이 다시 늘어나도 그 게이트가
   * 그대로 서 있다.
   */
  const purchaseType = usePurchaseType();
  /**
   * 화면 단계 — "입력"(영상 위 입력 화면, 화면 1)과 "결과"(전체화면
   * 결과, 화면 2). `EntryScreen`이 이 값을 읽어 자기 자신을 시각적으로
   * 숨긴다(언마운트하지 않는다 — 이유는 `EntryScreen`의 `phase` prop
   * 문서 참고).
   *
   * **언제나 "입력"에서 시작한다.** 새로 들어온 사용자는 아직 아무것도
   * 확정하지 않았고, 이제 화면 1이 담는 것(프로필 입력·지역 선택)은
   * 유형과 무관하게 언제나 그려진다.
   *
   * 예전에는 이 값을 복원된 구매 유형이 정했다 — 투자 유형을 저장해 둔
   * 사람이 새로고침하면 화면 1에 제목과 부제만 남고 결과 트리는
   * `inert`라, localStorage를 지우는 것 말고 나갈 길이 없었기 때문이다
   * (재검토 수정 Critical 1). 유형 선택이 사라지면서 그 상태에 이르는
   * 경로 자체가 없어졌고, 저장소에 남은 옛 유형도 `usePurchaseType`이
   * 실거주로 덮는다.
   *
   * **전환은 지역 조회 성공 하나뿐이다**(아래 effect). 지역 선택
   * 버튼을 누른 그 순간(`handleRegionSelect`)이 아니라 **조회가 실제로
   * 성공했을 때**를 본다 — 조회 중이거나 실패한 동안 화면이 아직 아무
   * 결과도 없이 "결과" 단계로 넘어가면, 이 축이 다른 축("이 지역엔
   * 데이터가 없다"/"조회 실패")의 빈 상태를 조용히 삼키는 여섯 번째
   * 반복이 된다(`App.tsx`가 이미 겪은 그 버그 형태).
   *
   * **"조건 다시 넣기"(아래 `handleBackToEntry`)는 이 값만 되돌린다.**
   * 프로필·지역 조회 결과 등 나머지 상태는 전혀 건드리지 않는다 —
   * 화면 전환일 뿐 리셋이 아니다.
   */
  const [phase, setPhase] = useState<"입력" | "결과">("입력");
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
  /**
   * 매매가·면적·입주년차 슬라이더 필터(사용자 지시: "필터 : 면적/
   * 입주년차/세대수/가격을 조정하여 필터로"). `null`이면 "아직 이 지역
   * 데이터로 초기화하지 않았다"는 뜻이다 — 지역을 조회할 때마다 아래
   * effect가 그 지역의 실제 최소·최대(`complexFilterBounds`)로 채운다.
   *
   * **지역이 바뀌면 반드시 다시 채워야 한다.** 이전 지역의 좁은 범위
   * (예: 강남 매매가 상한)를 그대로 들고 새 지역(예: 노원)으로 가면,
   * 그 지역 대부분의 매물이 조용히 걸러진다 — 사용자는 이유를 알 수
   * 없다.
   */
  const [complexFilters, setComplexFilters] = useState<ComplexFilterState | null>(
    null,
  );
  // 상세(상환 시뮬레이션)를 연 평형. null이면 목록 화면이다.
  const [selectedUnit, setSelectedUnit] = useState<ComplexUnit | null>(null);
  /**
   * 지금 고른 단지(`complexKey`) — 목록 행 표시와 지도 마커 강조가
   * **이 한 벌**을 함께 본다(task-4-brief Step 4: "선택 상태는 한 곳에서
   * 관리한다"). 목록과 지도가 각자 자기 선택을 들면 두 창이 서로 다른
   * 단지를 가리키는 날이 온다.
   *
   * **`selectedUnit`과 다른 축이다.** `selectedUnit`은 "상세를 연
   * 평형"이고, 그 값은 화면 전체의 계산을 그 평형의 실제 면적으로
   * 바꿔치기한다(`effectiveProfile`) — 상세를 닫으면 반드시 `null`로
   * 돌아가야 하는 값이다. 반면 이 값은 "지금 보고 있는 단지"일 뿐이라
   * 상세를 닫아도 남는다(닫은 뒤에도 그 행이 어디였는지 보인다).
   * 하나로 합치면 둘 중 한쪽의 규칙이 반드시 깨진다.
   *
   * 단지(complexKey) 단위인 이유는 마커가 단지 하나에 하나이기
   * 때문이다(ComplexMap의 `groupByComplex`). 그래서 같은 단지의 평형
   * 행이 여럿이면 그 행들이 함께 표시된다 — 마커가 실제로 가리키는 것이
   * 그 단지 전체다.
   */
  const [focusedComplexKey, setFocusedComplexKey] = useState<string | null>(null);

  /**
   * 사용자가 예산 상세 패널을 **열어 달라고 했는가**(상단바의 "실구매
   * 가능 가격"을 눌렀는가).
   *
   * **"열려 있는가"가 아니다.** 실제 열림은 아래 {@link budgetPanelOpen}
   * 에서 `phase`와 함께 파생시킨다 — 이 요청만 들고 화면 단계를 함께
   * 보지 않으면, 화면 1이 덮고 있는 동안에도 패널이 "열린" 상태로 남아
   * 그 `Esc` 핸들러가 살아 있게 된다. 그러면 화면 1에서 Esc를 눌렀는데
   * 보이지도 않는 뒤쪽 패널이 닫히고 포커스가 보이지 않는 버튼으로
   * 옮겨 간다 — 결과 트리는 `inert`지만 `inert`는 `document`에 직접
   * 붙은 키 리스너를 막지 못한다.
   *
   * **핸들러마다 `setBudgetPanelRequested(false)`를 기억하는 방식을
   * 고르지 않았다.** 이 저장소가 여섯 번 반복한 실패가 정확히 그
   * 모양이다("결정을 한 방향으로만 적용하고 나머지 상태를 추적하지
   * 않았다"). `phase`를 "입력"으로 되돌리는 자리는 지금 둘인데
   * (`handleBackToEntry`·`handleOpenAssumption`), 셋째가 생기는 날 그
   * 하나만 빠뜨리면 유령 동작이 돌아온다. 파생값은 빠뜨릴 자리가 없다.
   */
  const [budgetPanelRequested, setBudgetPanelRequested] = useState(false);
  /**
   * 예산 상세 패널이 실제로 펼쳐져 있는가. 위 요청 × `phase === "결과"`.
   *
   * 화면 1로 갔다가 돌아오면 **열어 둔 그대로 돌아온다** — 요청은
   * 지우지 않기 때문이다. "조건 다시 넣기"가 프로필도 조회 결과도
   * 건드리지 않는 화면 전환일 뿐이라는 기존 계약과 같은 방향이고,
   * 가정 칩(`AssumptionLine`)이 이제 이 패널 안에 있어서 그 칩을 눌러
   * 값을 고치고 돌아온 사람이 방금 있던 자리로 되돌아오게 한다.
   */
  const budgetPanelOpen = budgetPanelRequested && phase === "결과";
  /**
   * 상단바 무주택·생애최초 토글 위에 뜨는 설명 카드의 위치.
   * `useHoverTooltip` 문서(`components/HoverTooltip.tsx`) 참고 — 자리마다
   * 독립된 상태다(하나로 묶으면 한쪽에서 잰 위치가 다른 쪽에도 남는다).
   */
  const ownedHomeTooltip = useHoverTooltip<HTMLDivElement>();
  const firstTimeBuyerTooltip = useHoverTooltip<HTMLDivElement>();
  /**
   * 패널을 닫을 때 포커스를 되돌릴 자리(상단바의 트리거 버튼).
   * 닫히면 패널은 화면에서 `display: none`이 되므로, 그 안에 남은
   * 포커스는 `<body>`로 떨어진다(BudgetPanel.tsx 참고).
   */
  const budgetTriggerRef = useRef<HTMLButtonElement>(null);

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
   * `resolveIsRegulated`(`api/_lib/handleComplexes.ts`)는 이제
   * `regulated` 목록 포함 여부만으로 항상 확정 `boolean`을 낸다 —
   * 목록에 없는 지역은 비규제로 본다(사용자 지시, `api/_data/
   * regulated-regions.README.md` 참고). 그 값을 폼 상태에 반영해 위쪽
   * 실구매 가능 가격도 같은 전제로 계산되게 한다. 그 순간 이 값은
   * 가정이 아니라 **확인된 사실**이 되므로 `setField`가 `touched`에도
   * 넣어 가정 문구에서 뺀다.
   *
   * **`null` 분기는 지금 실제로는 일어나지 않는다** — API가 성공하면
   * 항상 boolean을 준다. 그래도 지운다고 프로필이 더 정확해지지 않고,
   * 지우면 `regionComplexes.isRegulatedArea`의 타입(`boolean | null`,
   * `regionQuery.ts`)과 이 코드가 어긋난다. 응답 계약이 여전히 null을
   * 허용하므로(오래된 배포판, 스키마가 다시 바뀔 가능성) 방어적으로
   * 남겨 둔다 — 실제로 null이 오면 손대지 않고 가정 상태로 되돌린다.
   *
   * **폼 상태에 직접 반영한다.** 목록 전용 프로필을 따로 만들면 위의 최대
   * 가격과 아래 목록이 서로 다른 프로필로 계산돼, 화면이 두 개의 다른
   * 예산을 동시에 말하게 된다(옛 `handleRegionChange`와 같은 이유).
   *
   * **조회 실패(`status === "error"`)일 때도 가정 상태로 되돌린다.** 실패한
   * 조회는 이번 지역에 대해 아무것도 확인해 주지 못했다 — 그런데도 status만
   * 보고 멈추면 직전에 성공했던 다른 지역의 `isRegulatedArea`가 "확정
   * 사실"인 채로 화면에 남는다.
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
   * 입주년차를 재는 기준 시각. **한 번만 잰다** — 렌더마다 `new Date()`를
   * 새로 부르면 슬라이더의 경계(`complexFilterBounds`)와 실제 거르는 값
   * (`filterByComplexFilters`)이 자정을 넘는 순간 1년 어긋날 수 있고,
   * 그 어긋남은 재현하기 어려운 버그가 된다. `useProfileForm`이 값을
   * 마운트 시점에 한 번만 읽는 것과 같은 태도다.
   */
  const now = useMemo(() => new Date(), []);

  /**
   * 지금 지역 데이터의 실제 최소·최대(면적·가격·입주년차 슬라이더가
   * 낼 수 있는 전체 범위). `complexFilters`(사용자가 지금 맞춘 값)와
   * 다른 값이다 — 이 값은 "슬라이더를 끝까지 밀면 어디까지 가는가"를
   * 정하고, 아래 렌더가 "이 축을 전체로 풀면 도움이 되는가"를 물을
   * 때도 이 값을 쓴다(`wouldHelpToResetAxis`).
   */
  const complexFilterBoundsValue = useMemo(
    () => complexFilterBounds(regionComplexes.units, now),
    [regionComplexes.units, now],
  );

  /**
   * 지역을 새로 조회할 때마다 매매가·면적·입주년차 슬라이더를 그 지역
   * 데이터의 실제 최소·최대로 되돌린다.
   *
   * **`regionComplexes.units`가 바뀔 때만 돈다 — `selectedDong`이
   * 바뀔 때는 돌지 않는다.** 행정동으로 좁히는 것은 이 슬라이더들이
   * 정하는 축과 다르다(매매가·면적·입주년차는 지역 전체 기준이지 동
   * 기준이 아니다) — 동을 바꿀 때마다 슬라이더 범위가 흔들리면
   * 사용자가 방금 맞춘 값이 사라진다.
   */
  useEffect(() => {
    if (regionComplexes.status !== "success") return;
    setComplexFilters(complexFilterBoundsValue);
  }, [regionComplexes.status, complexFilterBoundsValue]);

  /**
   * **고른 단지(평형)에 매달린 상태를 한 번에 비우는 유일한 자리다.**
   *
   * **함수 하나로 모은 이유**(C1 수정): 예전에는 상세를 닫는 핸들러마다
   * 이 리셋을 손으로 되풀이했다. 그러다 Task 3이 `RegionSelect`를
   * `EntryScreen`으로 옮겨 "상세를 연 채 다른 지역을 조회하는" 새 경로를
   * 열었을 때, `handleRegionSelect`만 그것을 받지 못했다 — 서초구를
   * 조회했는데 사이드바에 강남 단지 상세가 남고, `effectiveProfile`이
   * 화면 전체(상단바 실구매 가능 가격·안전선·인쇄 요약)를 그 단지의
   * 전용면적으로 계속 계산했다. 이 저장소가 여섯 번 낸 사고와 같은
   * 형태다("결정을 한 방향으로만 적용하고 나머지 상태를 추적하지
   * 않았다"). 자리를 하나로 모으면 다음 경로가 생겨도 **빠뜨릴 줄이
   * 없다** — 부를 것이 하나뿐이다.
   *
   * 진단 종합이 제거되기 전에는 이 함수가 호가·입지 판정 두 상태도 함께
   * 비웠다. 그 두 상태는 진단 종합 말고 읽는 곳이 없어 함께 사라졌고,
   * 남은 것은 `selectedUnit` 하나다 — 그래도 자리는 그대로 하나로
   * 유지한다(축이 다시 늘어도 빠뜨릴 곳이 없어야 한다).
   *
   * `scripts/complex-selection-reset.test.ts`가 그 setter의 `null` 호출이
   * 이 함수 밖에 흩어지지 않았는지 소스에서 검사한다.
   */
  function clearComplexSelection() {
    setSelectedUnit(null);
  }

  /**
   * 지역을 확정하면 그 지역의 실거래가를 조회한다.
   *
   * 앞 지역에서 고른 행정동을 되돌린다 — 남겨 두면 새 지역에는 없는
   * 동으로 걸러 빈 목록이 된다. `ComplexList`에 건 `key`(region+dong,
   * 아래 렌더 참고)가 이 값의 변화를 보고 목록을 다시 마운트하므로,
   * 각 덩어리가 펼쳐 둔 페이지도 함께 1쪽으로 되돌아간다 — 새 지역의
   * 첫 화면이 앞 지역의 페이지 깊이를 물려받지 않는다.
   *
   * **열려 있던 단지 상세도 함께 닫는다**(C1). 앞 지역 단지의 상세는 새
   * 지역 화면에서 잔상이 아니라 **틀린 숫자**다 — 사이드바가 목록 대신
   * 그 상세를 계속 그려 새 지역 목록이 아예 보이지 않고, 그동안
   * `effectiveProfile`이 그 평형의 전용면적을 화면 전체에 대입해
   * 취득 부대비용을 사용자가 보고 있지 않은 단지 기준으로 계산한다.
   * 앞 지역에서 좁은 평형을 골랐다면 그 오차는 실구매 가능 가격을
   * **올리는** 쪽이다(낙관 편향).
   */
  function handleRegionSelect(regionCode: string) {
    setSelectedDong(null);
    // 앞 지역에서 고른 단지는 새 지역 목록에도 지도에도 없다.
    setFocusedComplexKey(null);
    clearComplexSelection();
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
   * 지도용 좌표. 목록보다 늦게 채워진다 — 목록이 지도의 느린 응답을
   * 기다리지 않아야 한다(useComplexCoordinates 문서, 부모 스펙 §3).
   * 지역 조회가 성공하면(목록이 이미 뜬 뒤) 같은 지역으로 좌표도 조회한다.
   */
  const complexCoordinates = useComplexCoordinates();

  /**
   * 지금 보고 있는 지역의 사람이 읽는 이름("서울특별시 강남구").
   *
   * 모르는 코드면 `null`이고, 그때 상단바는 그 칸을 아예 내지 않는다 —
   * 코드(`11680`)를 그대로 보여주면 사용자가 읽을 수 없는 숫자를
   * 확인된 사실처럼 세우게 된다.
   */
  const currentRegionName =
    currentRegionCode === null ? null : regionNameByCode(currentRegionCode);

  /**
   * 매매가·면적·입주년차 슬라이더(사용자 지시)만 남긴 조회 결과.
   *
   * **거르는 축이 셋이고, 그래서 0건의 원인도 셋 더 있다.** "이 지역엔
   * 거래가 없어요"·"이 조건에는 매물이 없어요"·"예산으로는 못 사요"는
   * 서로 다른 말이고, 섞으면 사용자에게 틀린 해법을 준다(넓혀야 할 것이
   * 지역인지 필터인지 예산인지가 달라진다). 이 저장소가 여섯 번 반복한
   * 실패의 정확한 형태라, 아래 렌더에서 원인을 각자 자기 문구로 가른다
   * (`wouldHelpToResetAxis`가 셋 중 어느 축을 넓히면 도움이 되는지
   * 축별로 답한다).
   *
   * `complexFilters === null`은 지역을 막 조회해 아직 그 지역 범위로
   * 초기화되기 전인 한 프레임뿐이다(위 초기화 effect가 곧바로 채운다)
   * — 그 찰나에는 거르지 않고 원본을 그대로 낸다.
   */
  const rangeFilteredUnits = useMemo(
    () =>
      complexFilters === null
        ? regionComplexes.units
        : filterByComplexFilters(regionComplexes.units, complexFilters, now),
    [regionComplexes.units, complexFilters, now],
  );

  /**
   * 조회 결과에 실제로 있는 행정동만. 없는 동은 고를 수 있으면 안 된다.
   *
   * **필터로 거른 뒤의 목록에서 뽑는다** — 거르기 전에서 뽑으면, 고른
   * 필터 범위에는 한 건도 없는 동이 선택지에 남아 고르는 순간 빈 목록이
   * 된다. 그때 화면은 "이 동엔 조건에 맞는 단지가 없어요"라고 말하는데,
   * 사용자가 방금 고른 것은 동이라 원인을 동으로 읽게 된다 — 진짜
   * 원인(필터)을 가리는 오귀속이다.
   */
  const dongOptions = useMemo(
    () => [...new Set(rangeFilteredUnits.map((u) => u.legalDongName))].sort(),
    [rangeFilteredUnits],
  );

  const dongFilteredUnits = useMemo(
    () =>
      selectedDong === null
        ? rangeFilteredUnits
        : rangeFilteredUnits.filter((u) => u.legalDongName === selectedDong),
    [rangeFilteredUnits, selectedDong],
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
   * 풀면 뭔가 나오는지를 이 목록으로 확인한다.
   *
   * **슬라이더 필터는 여기서도 걸린 채다**(`rangeFilteredUnits`에서
   * 만든다). 푸는 것은 동 하나뿐이라야 이 대조가 "동 때문인가"만
   * 답한다 — 필터까지 함께 풀면 필터 때문에 빈 경우에도 "다른 동을
   * 선택해 보세요"라고 말하게 되고, 그건 넓혀야 할 축을 틀리게 짚는
   * 오귀속이다.
   *
   * `buildComplexList`는 순수 함수라 두 번 불러도 결과가 같고, 둘 다
   * 메모이즈돼 있어 비용도 미미하다.
   */
  const unfilteredComplexList = useMemo(
    () =>
      profile === null || purchaseType !== "실거주" ||
      regionComplexes.status !== "success"
        ? null
        : buildComplexList({
            units: rangeFilteredUnits,
            profile,
            rules,
            regionCodes: [],
          }),
    [profile, purchaseType, regionComplexes.status, rangeFilteredUnits],
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
  const mappedEntries = useMemo(
    () =>
      complexList === null
        ? []
        : [
            ...complexList.withinSafe,
            ...complexList.unverified,
            ...complexList.beyondSafe,
          ],
    [complexList],
  );

  const mappedUnits = useMemo(
    () => mappedEntries.map((entry) => entry.unit),
    [mappedEntries],
  );

  /**
   * 평형(`unitKey`) → 부담 수준. 지도 마커 색·아래쪽 글자가 이 값을 쓴다
   * (`ComplexMap`의 `burdenByUnit` prop 문서 참고).
   *
   * 사용자 지시로 부담 수준 구분이 지도에 되돌아왔다: "마커는 기존처럼
   * 대출없음/대출있음으로 구분해주고, 색상도 기존처럼 밝은블루/주황으로
   * 수정하고, 아래쪽에 표시해줘."
   *
   * 목록 행과 **같은 값**을 준다 — `burdenTierOf`가 이미 목록의 각
   * 행이 "대출 없이 살 수 있어요"와 "월 …· 부담률 …"을 가르는 데
   * 쓰는 그 함수다. 지도가 새 계산을 하면 두 창이 같은 단지를 두고
   * 다른 말을 하게 된다 — 이 저장소가 여섯 번 겪은 버그 형태다.
   *
   * 키는 평형 단위(`unitKey`)다 — 부담은 평형마다 다르고, 마커는 그중
   * 대표 평형의 숫자를 라벨에 낸다(`ComplexMap`의 `burdenTiers`).
   */
  const burdenByUnit = useMemo(
    () =>
      new Map(
        mappedEntries.map((entry) => [unitKey(entry.unit), burdenTierOf(entry)]),
      ),
    [mappedEntries],
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
   * 지도에서 마커를 눌렀다. 목록 쪽 선택을 같은 단지로 맞춘다 — 그 행이
   * 지금 보이는 페이지 밖에 있어도 걱정할 것 없다. `ComplexList`가
   * `focusedComplexKey` prop을 보고 그 단지가 속한 덩어리의 페이지를
   * 스스로 넘긴다(`ComplexList.tsx`의 첫 `useEffect`) — 여기서는 그 값만
   * 알려 주면 된다.
   *
   * 상세(`selectedUnit`)는 열지 않는다. 마커는 단지 하나를 가리키고
   * 상세는 **평형** 하나에 대한 것이라, 어느 평형인지는 마커가 정할 수
   * 없다 — 그 선택은 목록 행이 한다(`handleSelectUnit`).
   *
   * **상세가 열려 있는데 다른 단지의 마커를 누르면 상세를 닫는다**
   * (리뷰 수정 Important 2). 안 닫으면 두 창이 서로 다른 단지를
   * 가리킨다: 사이드바는 A의 상세를 그린 채인데 지도는 B를 강조한다.
   * 게다가 A의 상세가 열려 있는 동안에는
   * `effectiveProfile`이 **화면 전체의 계산**을 A의 전용면적으로
   * 바꿔치기하고 있어, 상단바의 실구매 가능 가격까지 B를 보는 사람이
   * 확인한 적 없는 전제 위에 서 있게 된다. 이 저장소가 여섯 번 낸
   * 사고가 정확히 이 형태다.
   *
   * **무시하지 않고 닫는 쪽을 골랐다.** 무시하면 마커가 "눌러도 아무
   * 일도 일어나지 않는 컨트롤"이 된다 — 누른 단지가 화면 어디에도
   * 반영되지 않으므로, 사용자에겐 지도가 고장 난 것으로
   * 보인다(Task 3 리뷰가 잡은 죽은 가정 칩과 같은 실패). 게다가 A를
   * 읽다가 B를 누른 사람의 의도는 "B가 궁금하다"이지 "A에 머무르고
   * 싶다"가 아니다. 닫으면 matrix 10번("닫아도 방금 본 단지가 어디였는지
   * 보인다")도 그대로 성립한다 — 남는 선택이 방금 누른 B다.
   *
   * **같은 단지의 마커면 닫지 않는다.** 그때 두 창은 이미 같은 단지를
   * 가리키고 있어 어긋남이 없다. 읽고 있는 상세의 마커를 눌렀다고
   * 그 상세를 걷어 가면 그쪽이 놀랍다 — 팝업만 토글된다.
   */
  function handleFocusComplex(complexKey: string) {
    /*
     * 예산 상세 패널을 닫는다(Task 5).
     *
     * 패널은 지도를 덮지 않으므로 열려 있어도 마커는 그대로 눌린다 —
     * 그런데 마커가 바꾸는 것(목록의 선택 행, 그리고 아래에서 닫는 상세)은
     * 전부 패널 **뒤**에 있는 사이드바 안이다. 닫지 않으면 마커를 누른
     * 사람에게는 아무 일도 일어나지 않은 것으로 보인다 — 이 저장소가
     * 이미 두 번 낸 "눌러도 아무 반응이 없는 컨트롤" 실패다(Task 3의
     * 죽은 가정 칩, 그리고 상세가 열린 채 무시되던 마커).
     */
    setBudgetPanelRequested(false);
    if (selectedUnit !== null && selectedUnit.complexKey !== complexKey) {
      // `handleCloseDetail`과 같은 정리다 — 두 창이 서로 다른 단지를
      // 가리키지 않게 A의 상세를 닫는다.
      handleCloseDetail();
    }
    setFocusedComplexKey(complexKey);
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
    // 행을 눌렀다는 것은 사이드바를 보고 있었다는 뜻이라, 지금 구조에서는
    // 패널이 이미 닫혀 있다(패널이 사이드바를 덮는다). 그래도 여기서
    // 닫는다 — 패널 폭이 바뀌거나 다른 경로에서 이 핸들러가 불리는 날,
    // "행을 눌렀는데 화면이 그대로"인 죽은 컨트롤이 되지 않게 한다.
    setBudgetPanelRequested(false);
    /*
     * 앞 평형에 매달려 있던 것을 **먼저 전부 비우고** 그 위에 이번
     * 평형을 얹는다. `clearComplexSelection`을 그대로 부른다 — 같은
     * 렌더에서 아래 `setSelectedUnit(unit)`이 이긴다. 이렇게 두면
     * "고른 단지에 매달린 상태"를 비우는 자리가 코드 전체에 하나뿐이라,
     * 축이 하나 늘어도 여기서 빠뜨릴 수 없다(C1).
     */
    clearComplexSelection();
    setSelectedUnit(unit);
    // 행을 누르면 지도도 그 단지로 옮겨 가며 마커를 강조한다
    // (design.md §4: 목록 행 ↔ 마커는 양방향으로 이어진다).
    setFocusedComplexKey(unit.complexKey);
  }

  /**
   * 단지 상세를 닫는다.
   *
   * 리셋을 {@link clearComplexSelection}에 맡기는 이유는 그쪽에 적었다.
   * 이 핸들러가 그 함수를 감싸기만 하는 얇은 껍데기인 것은 의도다 —
   * `ComplexDetail`의 `onClose`가 받는 이름을 그대로 두면서도 리셋
   * 지점은 하나로 남는다.
   */
  function handleCloseDetail() {
    clearComplexSelection();
  }

  /**
   * 인쇄물의 "전용면적" 전제가 어디서 왔는지(PrintSummary가 문구 방향을
   * 가르는 데 쓴다).
   *
   * `effectiveProfile`과 같은 우선순위를 따른다 — 상세가 열려 있으면
   * 그 평형의 실제 면적이 이미 화면 전체의 계산을 바꿔치기하고 있으므로
   * (위 `effectiveProfile` 주석 참고), 인쇄물도 그 사실을 "선택한 매물의
   * 실제 면적"이라고 밝혀야 한다 — 그렇지 않으면 사용자가 실제로는
   * 값을 확정한 적 없는데 가정값이라고 오인시키게 된다.
   *
   * ⚠ **상세를 열지 않았을 때는 숫자를 넘기지 않는다.** 그때 헤드라인은
   * 언제나 룰셋의 `ruralTaxAreaThresholdSqm`(85㎡) 이하로 가정하므로
   * (`useProfileForm`의 `toProfile`) 넘길 대표값 자체가 없다 —
   * `PrintSummary`가 그 임계값을 룰셋에서 직접 다시 읽어 적는다.
   *
   * 갈래가 셋에서 둘로 줄었다 — 전용면적을 직접 입력하는 칸이 화면 1에서
   * 사라졌으므로 "직접 입력"에 이르는 경로가 없다.
   */
  const areaBasis: AreaBasis =
    selectedUnit !== null
      ? { source: "selectedUnit", sqm: selectedUnit.maxExclusiveAreaSqm }
      : { source: "assumed" };

  /**
   * 단지 상세에 넘길 것들.
   *
   * ⚠ **부대비용·대출 한도·상환 부담은 더 이상 여기서 계산하지 않는다.**
   * 사용자 지시로 그 계산들의 기준 가격이 `selectedUnit.maxPrice`(범위
   * 위쪽) 고정에서 **사용자가 넣는 매물가격**으로 바뀌었고, 그 입력은
   * 상세 화면 안에 산다. 그래서 이 자리는 계산 결과가 아니라 **계산에
   * 필요한 것**(프로필·고지·평형 목록)을 넘긴다.
   *
   * `profile`로 `residentialProfile`을 그대로 넘긴다 — 실거주가 아니면
   * `null`이고, 그러면 상세가 실거주 기준 숫자를 아예 만들지 않는다.
   * 이 프로필의 전용면적은 이미 고른 평형의 실제 면적으로 바꿔치기돼
   * 있다(`effectiveProfile`) — 85㎡ 임계값을 낙관 방향으로 넘기지 않으려면
   * 부대비용이 그 면적으로 계산돼야 한다.
   */
  const detail = useMemo(() => {
    if (selectedUnit === null) return null;
    return {
      unit: selectedUnit,
      profile: residentialProfile,
      /*
       * 호가 위치 확인의 예산 줄이 쓸 프로필. 실거주가 아니면 `null`이고,
       * 그러면 `assessPrice`가 예산 줄을 아예 만들지 않는다 — 화면에서
       * 숨기는 것이 아니라 계산 자체를 하지 않는 것이 요점이다.
       */
      priceBudget:
        residentialProfile === null
          ? null
          : { profile: residentialProfile, financeRules: rules },
      /*
       * 부대비용의 취득세 줄에 붙는 계산 기준 고지. 위쪽 `BudgetResult`와
       * **같은 상수**(`ACQUISITION_TAX_SUMMARY_NOTE`)를 써서 한 화면이
       * 두 말을 하지 않는다.
       */
      householdCountNote: ACQUISITION_TAX_SUMMARY_NOTE,
    };
  }, [residentialProfile, selectedUnit]);

  /**
   * 면책 문구.
   *
   * `disclaimer`는 `MUST_SURVIVE_PRINT_CLASSES`다. 이 `<footer>`가 어느
   * 한 화면에서라도 빠지면 그 화면에서 인쇄한 종이에서 면책이
   * 사라진다 — 종이를 건네받은 사람이 추정치를 확정 사실로 읽게 되는,
   * 이 저장소가 가장 경계하는 종류의 사고다. 그래서 **두 자리에 그대로**
   * 둔다(사이드바 끝 / 프로필 미완 폴백). 세 번째였던 투자 경로는 구매
   * 유형 선택과 함께 사라졌다 — 그 화면 자체가 없어진 것이라 면책이
   * 빠질 종이도 없다.
   *
   * 실거주 경로에서 이 자리는 셸(`position: fixed; inset: 0`) **안**의
   * 사이드바 끝이다. 밖에 남기면 셸 뒤에 깔려 보이지도 읽히지도 않는다
   * (Task 3 리뷰 Important 4·5와 같은 실패). 같은 이유로 `ErrorBoundary`
   * **안**에 둔다 — 경계가 터진 화면에는 면책할 추정치 자체가 없으므로
   * 안쪽에 두는 쪽의 손해가 없다.
   *
   * 예전에는 문구가 유형에 따라 갈렸다 — 투자 경로에서는 바로 위에서
   * "이 유형의 대출 한도는 우리가 계산하지 않아요"라고 말한 뒤라
   * "추정치이며 실제 대출한도는 …"이 그대로 남으면 어딘가에 한도
   * 추정치가 있는 것처럼 읽혔기 때문이다. 그 화면이 사라져 갈래도
   * 하나로 줄었다.
   */
  const disclaimer = (
    <footer className="disclaimer">
      추정치이며 실제 대출한도는 금융기관 심사 결과에 따릅니다.
      시세는 국토교통부 실거래가에 기반한 추정 범위입니다.
    </footer>
  );

  return (
    <main className="app">
      {/*
        화면 1 — 영상 위 입력 화면. `EntryScreen`은 `phase`가 "결과"가
        되면 이 전체를 시각적으로 숨긴다(언마운트는 하지 않는다 —
        `EntryScreen`의 doc comment 참고). 서비스 제목·부제·프로필
        입력·지역 선택까지, "입력"이라는 이름이 뜻하는 모든 것을
        여기 한 번에 담는다 — 아래 `ErrorBoundary` 안쪽(화면 2에 해당하는
        내용)에는 더 이상 이 컴포넌트들이 나오지 않는다.
      */}
      <EntryScreen phase={phase}>
        {/*
          design.md §3의 "작은 라벨"(눈썹) 자리에는 **새 카피를 짓지
          않는다**(design.md §7: 카피는 별도 프로젝트).

          리뷰 수정(Minor 11): 여기 있던 "예산 계산"은 바로 아래 제목을
          다시 말할 뿐이라 읽는 사람에게 아무것도 더해 주지 않았다 —
          눈에는 들어오는데 뜻이 없는 줄은 제목이 하는 일을 방해한다.

          `prototype.html` 재스킨으로 이 자리는 **비어 있지 않게 됐다**:
          작은 활자로 물러난 서비스 이름(아래 `<h1>`, 워드마크)이 그
          자리를 그대로 채운다. 눈썹과 제목이 같은 말을 되풀이하던 문제는
          그대로 풀린 채다 — 되풀이하는 줄이 하나 없어졌고, 새로 지은
          문장도 없다(큰 활자의 질문은 프로토타입이 이미 쓴 카피다).
        */}
        {/*
          워드마크 — 서비스 이름. `prototype.html`은 이 자리를 장식용
          `<div>`로 뒀지만, 이 앱에서 **문서의 제목은 서비스 이름**이고
          그 계약을 검사하는 테스트가 이미 있다(App.test.tsx "서비스
          제목을 표시한다"). 그래서 태그는 `<h1>` 그대로 두고 모양만
          워드마크로 만든다(styles.css의 `.entry-wordmark`).
        */}
        <h1 className="entry-wordmark">내 예산으로 살 수 있는 집</h1>
        {/*
          이 화면에서 가장 큰 활자. **문서 제목이 아니라 이 폼이 묻는
          질문**이라 `<h2>`다 — 위 `<h1>`(서비스 이름) 아래에 놓여
          제목 위계도 그대로 선다. `prototype.html`의 `h1` 카피를 그대로
          옮겼다.
        */}
        <h2 className="entry-headline">
          얼마가 있고,
          <br />
          어디에 살고 싶으신가요.
        </h2>
        <p className="subtitle">
          {/*
            어느 룰셋 기준으로 계산했는지. `rules/2026-08.json`의
            LTV·DSR·절대상한은 실거주 매수를 전제한 값이고, 이 앱은
            실거주 전용이 됐으므로 적을 기준도 하나다.

            개인정보 보호 문구(입력값이 브라우저를 벗어나지 않는다는 안내)는
            사용자 지시로 지웠다.
          */}
          {formatRuleVersionLabel(rules)}
        </p>

        {/*
          프로필 입력·지역 선택. 예전에는 실거주에서만 그렸다 —
          갭투자·월세수익형에서는 `PurchaseCheck`가 자기 입력을 따로
          받았기 때문이다. 유형 선택이 사라지면서 이 앱은 실거주
          전용이 됐고, 이 화면은 언제나 그려진다.
        */}
        {/*
          지역 선택은 이제 `ProfileForm` 안, 3번째 자리(연 소득 다음,
          주택 수 앞)에 그려진다(사용자 지시) — `regionSlot`으로 끼워
          넣는다. 화면에 항상 보이지만, 예산을 모르는 채로 조회를
          실행하지는 못한다 — `disabled`가 "이 지역으로 조회하기"
          버튼을 잠근다(`RegionSelect.tsx`의 disabled prop 주석 참고).
          이렇게 안 하면 예산 없이 조회가 성공해 화면이 "결과"로
          넘어가는데 그 결과 셸은 프로필이 없으면 아무것도 그리지
          않는다 — 이 저장소가 여섯 번 반복한, 빠져나올 수 없는 빈
          화면(커밋 `c90babf`)과 같은 모양이 된다.

        */}
        <ProfileForm
          state={state}
          setField={setField}
          regionSlot={
            <RegionSelect
              onSelect={handleRegionSelect}
              disabled={affordability === null || residentialProfile === null}
            />
          }
        />

        {/*
          예산을 모르는 채로 지역부터 확정하게 두지 않는다. 대신 무엇이
          모자란지를 아래 가지들이 각자 말한다(리뷰 수정 Important 5).

          ⚠ **모자란 축이 둘이고, 둘을 한 문장으로 뭉치지 않는다.**
          돈(현금·연 소득)이 없으면 예산 자체를 계산할 수 없고, 평형대를
          하나도 고르지 않았으면 계산은 되지만 보여줄 매물을 고를 수
          없다 — 원인이 다르면 해야 할 일도 다르다. 한 문구로 합치면
          평형대만 비운 사용자가 현금을 다시 들여다보게 된다. 이
          저장소가 여섯 번 반복한 실패의 형태 그대로다.
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
            현금·연 소득·주택 수를 알려주면 살 수 있는 가격을 계산해요.
          </p>
        ) : (
          <>
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
      </EntryScreen>

      {/*
        화면 2 — 결과. `phase === "입력"`인 동안에는 이 안 전체가
        `inert`다.

        리뷰 수정(Important 4): `.entry-screen`이 `visibility: hidden`
        대신 `display: none`을 쓰는 이유("숨은 컨트롤이 포커스를 받으면
        안 된다")는 정확한데, 그 논리가 한 방향으로만 적용돼 있었다.
        `phase === "입력"`일 때 이 결과 트리는 **여전히 전부 렌더링된
        채로** 불투명한 `z-index: 40` 오버레이 **밑에** 깔려 있다 —
        가격 슬라이더·단지 행·"더 보기"·가정 칩·상세 닫기 버튼까지.
        키보드 사용자는 보이지 않는 컨트롤로 탭이 빨려 들어가고,
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
          `.purchase-type-print`). 예전에는 유형 라디오 안에 있었는데, 그
          라디오가 `EntryScreen` 안에 놓이고 그 레이어는 인쇄에서 통째로
          지워지므로(hiddenInPrint.ts의 `.entry-screen`) 보호 대상
          클래스(`purchase-type-print`, MUST_SURVIVE_PRINT_CLASSES)가
          조상과 함께 사라졌다 — `printCss.test.ts`는 선택자 문자열만
          보므로 그 형태는 잡지 못한다. 그래서 이 레이어 밖에서 그린다.

          **라디오가 사라진 뒤에도 이 줄은 남긴다.** 고를 수 없게 됐다고
          전제가 사라진 것이 아니다 — 아래 숫자들은 전부 "내가 들어가
          사는 집"을 전제로 계산됐고, 종이에 그 사실을 적는 자리가
          여기뿐이다(hiddenInPrint.ts의 `purchase-type-print` 주석).
        */}
        <p className="purchase-type-print">
          구매 유형 — {purchaseRules.types[purchaseType].label}
        </p>

        <ErrorBoundary onReset={reset}>
          {/*
            실거주 예산 계산. 예전에는 이 자리가 구매 유형에 따라
            갈렸고, 갭투자·월세수익형에서는 통째로 유형별 지표
            (`PurchaseCheck`)로 바뀌었다. 유형 선택이 사용자 지시로
            제거되면서 그 분기도 함께 사라졌다 — 이 앱은 실거주
            전용이다.

            **`PurchaseCheck`·`PurchaseVerdict`·`PurchasePrintSummary`와
            그 아래 엔진(`src/lib/purchase`)은 지우지 않고 그대로 뒀다.**
            사용자가 오피스텔·수익형을 나중에 다시 붙일 계획을 말했고,
            그때 되살릴 것이 화면 분기 하나로 남는 편이 낫다. 지금은
            App 어디에서도 렌더되지 않는 도달 불가능한 코드다.

            `residentialProfile`이 실거주가 아닐 때 계산 자체를 막는
            게이트는 **그대로 남긴다** — 유형이 다시 늘어나는 날
            실거주 대출 한도가 투자 목적 매수로 새어 나가지 않게 하는
            자리이고, `scripts/purchase-structure.test.ts`가 그 배선을
            소스에서 잠근다.
          */}
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
          {affordability !== null && residentialProfile !== null ? (
            /*
              화면 2 — 전체화면 셸(design.md §4). 상단바 + 사이드바 +
              지도. 안에 담기는 것은 지금까지와 **같은 컴포넌트들이고
              조건도 그대로**다 — 바뀐 것은 어디에 그리는가뿐이다.
            */
            <ResultShell
              /*
                패널이 사이드바 열을 완전히 덮는 동안 그 열을 `inert`로
                잠근다(ResultShell의 `panelOpen` 문서 참고). `open`과
                **같은 파생값**을 넘긴다 — 따로 계산하면 언젠가 둘이
                어긋나 "보이지 않는데 조작되는" 상태가 돌아온다.
              */
              panelOpen={budgetPanelOpen}
              summary={
                <>
                  {/*
                    현금·소득은 **읽는 값이 아니라 고치는 자리**다(사용자
                    지시: "지도페이지 들어온 후 조건변경은 상단 사이드
                    바에서 직접하고싶어"). 그래서 `ResultSummaryItem`
                    (라벨+값을 읽기 전용으로 내는 칸)이 아니라 입력 화면과
                    **같은 `MoneyInput`**을 둔다 — 만원 기본 해석과 그
                    오해를 잡는 되비추기가 여기서도 그대로 필요하고, 그
                    규칙을 두 번 구현하면 두 자리가 언젠가 다른 값을
                    읽는다.

                    `commitOn="blur"`인 이유: 타이핑 중간값("1" → "15" →
                    "150"…)이 매번 확정되면 그 값에 딸린 계산 전부(실구매
                    가능 가격·목록·지도 마커)가 글자 하나마다 다시 돈다.
                    입력란을 벗어날 때만 확정한다.

                    라벨은 이 컴포넌트가 스스로 낸다(SEED TextField) —
                    그래서 `ResultSummaryItem`의 라벨과 겹치지 않게 칸
                    자체를 바꿔 끼웠다. 입력 화면의 라벨("얼마 있어요?")과
                    **다른 문구**를 쓰는 것도 의도다: 두 화면이 동시에
                    마운트돼 있어(phase는 감추기만 한다) 같은 문구면
                    접근성 질의가 애매해진다.
                  */}
                  <div className="result-topbar-item result-topbar-item--field">
                    <MoneyInput
                      id="topbar-cash"
                      label="사용가능 현금 예산"
                      value={state.cash}
                      onChange={(won) => setField("cash", won)}
                      commitOn="blur"
                    />
                  </div>
                  <div className="result-topbar-item result-topbar-item--field">
                    <MoneyInput
                      id="topbar-income"
                      label="연 소득(세전)"
                      value={state.annualIncome}
                      onChange={(won) => setField("annualIncome", won)}
                      commitOn="blur"
                    />
                  </div>
                  {/*
                    design.md §4의 그림은 이 자리를 "한도"라 부르지만,
                    이 숫자는 대출 한도가 아니라 부대비용까지 뺀 매매가다
                    — 화면의 다른 자리와 다른 이름으로 부르면 종이와
                    화면이 같은 숫자를 두고 두 말을 한다. 사용자 지시로
                    예산 상세 패널 안의 헤드라인 카드(구 `BudgetResult`
                    제목)가 없어진 뒤로는 이 라벨이 그 이름의 **유일한**
                    출처다 — 패널 쪽이 이 문구를 다시 쓸 일 자체가 없다.
                  */}
                  {/*
                    **0원이면 숫자를 내지 않는다**(리뷰 수정 Important 1).

                    `affordability`는 프로필만 완성되면 `null`이 아니라,
                    DSR이 0이거나 현금이 고정 부대비용에도 못 미치는
                    사람도 이 셸에 도달한다. 그때 이 자리는 화면에서
                    가장 큰 글씨이자 종이의 첫 줄인데, 예전에는 거기에
                    황동으로 "실구매 가능 가격 / 0원"만 찍혔다 — 이
                    저장소가 `no-budget`을 `MUST_SURVIVE_PRINT_CLASSES`에
                    넣어 둔 바로 그 이유(맨숫자 0은 답의 모양을 한
                    거짓말이다)에 정면으로 어긋난다.

                    그래서 다른 모든 자리와 같은 규칙을 따른다: 숫자를
                    숨기고 원인을 말한다. 문구는 사이드바의
                    `ZeroBudgetMessage`가 쓰는 것과 **같은 상수**다
                    (`ZERO_BUDGET_HEADLINE`) — 여기서 새로 짓지 않는다.
                  */}
                  {/*
                    **이 칸이 예산 상세 패널의 트리거다**(Task 5,
                    design.md §5). 스펙의 그림은 이 자리를 "한도"라
                    부르지만 여기 이름은 "실구매 가능 가격"이다(위
                    라벨 주석) — 누르는 자리를 옮긴 것이지 새 항목을
                    만든 것이 아니다.

                    **0원일 때도 버튼이다.** 그때가 사용자가 "왜
                    0원인가"를 가장 알고 싶은 순간이고, 그 답
                    (`ZeroBudgetMessage`)이 이 패널 안에 있다. 0원일
                    때만 죽은 버튼으로 두면 Task 3이 리뷰에서 잡힌
                    실패(누르라고 적어 놓고 아무 일도 안 하던 가정
                    칩)를 그대로 재현한다.
                  */}
                  {affordability.result.affordablePrice > 0 ? (
                    <ResultSummaryItem
                      label="실구매 가능 가격"
                      value={formatWon(affordability.result.affordablePrice)}
                      emphasis
                      onToggle={() => setBudgetPanelRequested((v) => !v)}
                      expanded={budgetPanelOpen}
                      controls={BUDGET_PANEL_ID}
                      buttonRef={budgetTriggerRef}
                    />
                  ) : (
                    <ResultSummaryItem
                      label="실구매 가능 가격"
                      value={ZERO_BUDGET_HEADLINE}
                      notice
                      onToggle={() => setBudgetPanelRequested((v) => !v)}
                      expanded={budgetPanelOpen}
                      controls={BUDGET_PANEL_ID}
                      buttonRef={budgetTriggerRef}
                    />
                  )}
                  {/*
                    지역 이름은 코드가 아니라 이름으로 적는다(위
                    `currentRegionName` 주석 참고).
                  */}
                  {currentRegionName !== null && currentRegionCode !== null && (
                    <div className="result-topbar-item result-topbar-item--field">
                      <span className="result-topbar-item-label">지역</span>
                      <span className="result-topbar-item-value-row">
                        <span className="result-topbar-item-value">
                          {currentRegionName}
                        </span>
                        <RegulationBadge
                          determined={state.touched.includes("regulatedArea")}
                          isRegulatedArea={state.isRegulatedArea}
                        />
                      </span>
                      {/*
                        지금 지역을 **읽는 줄 아래**에 바꾸는 자리를 둔다 —
                        고른 지역이 무엇인지는 여전히 한 줄로 읽히고
                        (규제 배지도 그 줄에 붙어 있다), 바꾸는 것은 그
                        아래에서 한다. 조회 중에는 잠근다: 연달아 고르면
                        응답 순서가 엉켜 화면이 마지막에 고른 지역과 다른
                        결과를 낼 수 있다(useRegionComplexes의
                        `lastRegionCode` 가드가 막아 주지만, 잠그는 편이
                        무엇이 진행 중인지도 함께 말한다).
                      */}
                      <RegionQuickSelect
                        regionCode={currentRegionCode}
                        onSelect={handleRegionSelect}
                        disabled={regionComplexes.status === "loading"}
                      />
                    </div>
                  )}
                  {/*
                    무주택·생애최초도 상단바에서 그 자리에서 바꾼다(사용자
                    지시: "위 상단에 생애최초/무주택도 같이 표시해주고,
                    토글로 선택을 바꿀수 있게도 만들어줘"). 이 트리는
                    `state.ownedHomeCount !== null`일 때만 그려진다(위
                    `residentialProfile`·`affordability` 가드 참고 —
                    `toProfile`은 주택 수가 없으면 null을 낸다) — 그래서
                    "아직 안 골랐다" 상태를 여기서 또 다룰 필요가 없다.

                    두 값 다 항상 둘 중 하나이므로(입력 화면의 라디오와
                    같다) `role="radiogroup"`의 `role="radio"` 버튼 둘로
                    낸다 — 지도 위 "지도 유형" 팝오버의 세그먼트 토글
                    (`ComplexMap.tsx`)과 같은 모양이다.

                    ⚠ **버튼 글자는 입력 화면과 일부러 다르게 쓴다.** 두
                    화면은 언제나 함께 마운트돼 있어서(phase는 감추기만
                    한다) `ProfileForm.tsx`의 라디오와 글자가 같으면
                    `getByRole("radio", { name: "무주택이에요" })`류
                    질의가 두 화면에 걸쳐 두 개를 찾아 애매해진다 —
                    처음엔 문구를 맞췄다가 바로 그 실패로 잡혔다
                    (`RegionQuickSelect`가 같은 이유로 "광역단체"·
                    "자치구"가 아니라 "시·도 바꾸기"·"시·군·구 바꾸기"를
                    쓰는 것과 같다). `role="radiogroup"`의 `aria-label`
                    (아래 "무주택 여부"·"생애최초 구입")이 각 버튼의
                    맥락을 이미 말해 주므로, 버튼 자체는 짧게 줄여도
                    뜻이 흐려지지 않는다.

                    설명 문구는 입력 화면(`ProfileForm.tsx`)의 같은 필드
                    도움말을 **그대로** 옮긴 것이다(사용자 지시: "마우스를
                    올리면 간략하게 어떤 차이를 반영하는지 설명하는 내용을
                    볼 수 있도록") — 새로 문구를 짓지 않는 이유는 두 화면이
                    같은 필드를 다른 말로 설명하기 시작하면 어느 쪽이
                    맞는지 알 수 없어지기 때문이다(위 "버튼 글자" 문단과
                    같은 원칙, 이번엔 반대 방향 — 라디오 이름은 일부러
                    다르게, 뜻풀이는 일부러 같게). 지금은 그 약속이
                    관례가 아니라 구조다 — `ProfileForm.tsx`가 내보내는
                    `OWNED_HOME_HINT_LINES`·`FIRST_TIME_BUYER_HINT_LINES`
                    상수 하나를 이 카드와 화면 1의 `<p className="hint">`가
                    같이 쓴다.

                    생애최초 쪽은 두 줄이다(사용자 지시: "생애최초
                    구입시 ltv 한도가 바뀌는것도 추가해줘" — "내용이
                    다르면 2줄로 정리해줘") — 취득세·정책대출 우대에
                    이어, 규제지역에서 LTV가 40%→70%로 바뀐다는 사실을
                    더했다(`ltvRateFor`, `src/lib/finance/loan-limit.ts`).
                    무주택 쪽은 LTV와 무관해(그 함수가 보는 축은
                    규제지역·생애최초 둘뿐이다) 한 줄 그대로 둔다.

                    `title` 속성이 아니라 `useHoverTooltip`
                    (`components/HoverTooltip.tsx`)이 띄우는 카드다(사용자
                    지시: "딜레이를 최대한 빠르게", "흰색바탕(검정글씨)의
                    카드형식으로" → "지도와의 경계때문에... 지도 위
                    레이어에 표시되어 가려지지 않도록", "한줄로 표기").
                    네이티브 `title` 툴팁은 뜨기까지 1~1.5초 걸리고
                    배경·글자색을 못 바꾼다. **`position: fixed`로
                    뷰포트 기준에 띄운다** — `.result-topbar`가
                    `overflow-x: auto`라 `position: absolute`로는 상단바
                    경계에서 잘렸다(실측). `onFocus`/`onBlur`도 같이
                    걸어서 키보드 tab으로도 같은 카드를 볼 수 있다.
                  */}
                  <div
                    ref={ownedHomeTooltip.ref}
                    className="result-topbar-item result-topbar-item--field"
                    onMouseEnter={ownedHomeTooltip.show}
                    onMouseLeave={ownedHomeTooltip.hide}
                    onFocus={ownedHomeTooltip.show}
                    onBlur={ownedHomeTooltip.hide}
                  >
                    <span className="result-topbar-item-label">무주택 여부</span>
                    <div
                      className="result-topbar-toggle"
                      role="radiogroup"
                      aria-label="무주택 여부"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={state.ownedHomeCount === 0}
                        className={
                          state.ownedHomeCount === 0
                            ? "result-topbar-toggle-option result-topbar-toggle-option--active"
                            : "result-topbar-toggle-option"
                        }
                        onClick={() => setField("ownedHomeCount", 0)}
                      >
                        무주택
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={(state.ownedHomeCount ?? 0) > 0}
                        className={
                          (state.ownedHomeCount ?? 0) > 0
                            ? "result-topbar-toggle-option result-topbar-toggle-option--active"
                            : "result-topbar-toggle-option"
                        }
                        onClick={() => setField("ownedHomeCount", 1)}
                      >
                        유주택
                      </button>
                    </div>
                    <HoverTooltipCard pos={ownedHomeTooltip.pos} lines={OWNED_HOME_HINT_LINES} />
                  </div>
                  <div
                    ref={firstTimeBuyerTooltip.ref}
                    className="result-topbar-item result-topbar-item--field"
                    onMouseEnter={firstTimeBuyerTooltip.show}
                    onMouseLeave={firstTimeBuyerTooltip.hide}
                    onFocus={firstTimeBuyerTooltip.show}
                    onBlur={firstTimeBuyerTooltip.hide}
                  >
                    <span className="result-topbar-item-label">생애최초 구입</span>
                    <div
                      className="result-topbar-toggle"
                      role="radiogroup"
                      aria-label="생애최초 구입"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={state.isFirstTimeBuyer}
                        className={
                          state.isFirstTimeBuyer
                            ? "result-topbar-toggle-option result-topbar-toggle-option--active"
                            : "result-topbar-toggle-option"
                        }
                        onClick={() => setField("isFirstTimeBuyer", true)}
                      >
                        해당
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!state.isFirstTimeBuyer}
                        className={
                          !state.isFirstTimeBuyer
                            ? "result-topbar-toggle-option result-topbar-toggle-option--active"
                            : "result-topbar-toggle-option"
                        }
                        onClick={() => setField("isFirstTimeBuyer", false)}
                      >
                        비해당
                      </button>
                    </div>
                    <HoverTooltipCard
                      pos={firstTimeBuyerTooltip.pos}
                      lines={FIRST_TIME_BUYER_HINT_LINES}
                    />
                  </div>
                  {/*
                    상단바에서 지역을 바꾸면 조회가 이 화면 **위에서**
                    일어난다 — 그런데 로딩·실패 안내는 여태 입력 화면
                    안에만 있었다(그쪽은 첫 조회를 여는 자리다). 그대로
                    두면 상단바에서 지역을 바꿨을 때 아무 일도 안 일어난
                    것처럼 보이다가 목록이 통째로 갈린다.
                  */}
                  {/*
                    ⚠ **입력 화면의 같은 두 문구와 글자가 겹치지 않아야
                    한다.** 두 화면은 함께 마운트돼 있어서(phase는 감추기만
                    한다) "지역 실거래가를 조회하고 있어요…"·"지금 실거래가를
                    불러오지 못했어요."가 문서에 그대로 남아 있다 — 같은
                    표현을 쓰면 글자로 찾는 자리가 어느 화면인지 못 고른다.
                    문구가 실제로 가리키는 상황도 다르다: 저쪽은 첫 조회이고
                    이쪽은 **보고 있던 지역을 바꾼** 조회다.
                  */}
                  {regionComplexes.status === "loading" && (
                    <p className="result-topbar-status" role="status">
                      새 지역을 불러오는 중이에요…
                    </p>
                  )}
                  {regionComplexes.status === "error" && (
                    <p className="result-topbar-status result-topbar-status--error" role="alert">
                      새 지역 조회에 실패했어요.{" "}
                      {/*
                        입력 화면의 재시도 버튼과 **다른 이름**이어야 한다 —
                        두 화면이 함께 마운트돼 있어(phase는 감추기만 한다)
                        같은 "다시 시도"면 문서에 두 벌이 생기고, 이름으로
                        버튼을 찾는 자리가 어느 쪽인지 못 고른다.
                      */}
                      <button type="button" onClick={() => regionComplexes.retry()}>
                        실거래가 다시 불러오기
                      </button>
                    </p>
                  )}
                </>
              }
              actions={
                <>
                  {/*
                    인쇄 버튼은 사용자 지시로 없앴다. 인쇄 자체는 그대로
                    살아 있다 — 브라우저의 Cmd+P가 그대로 `@media print`
                    규칙을 타므로, 없앤 것은 버튼 하나뿐이다.
                  */}
                  {/*
                    화면 1(영상 위 입력)로 돌아간다. 프로필·지역 조회 결과는
                    그대로 남는다(handleBackToEntry 문서 참고) — 이 버튼은
                    화면 전환일 뿐 리셋이 아니다.

                    `phase === "결과"`일 때만 보인다 — 프로필은 채웠지만 아직
                    지역을 조회하지 않았을 때(phase가 여전히 "입력")는 이미
                    `EntryScreen`이 화면을 덮고 있어 이 버튼이 뜻이 없다.

                    현금·소득·지역·무주택·생애최초는 상단바에서 바로
                    바뀌지만(위 `RegionQuickSelect`·`MoneyInput`·
                    `result-topbar-toggle` 참고), **구매유형**(실거주/투자)은
                    아직 화면 1에서만 바꿀 수 있다 — 그래서 이 버튼은 남는다.
                    아이콘만으로 두면 눌러야 뜻을 알게 되므로 접근 가능한
                    이름은 `aria-label`로 그대로 "조건 다시 넣기"를 준다
                    (글자를 지운 것은 사용자 지시).
                  */}
                  {phase === "결과" && (
                    <button
                      type="button"
                      className="back-to-entry-button"
                      onClick={handleBackToEntry}
                      aria-label="조건 다시 넣기"
                    >
                      <HomeIcon />
                    </button>
                  )}
                </>
              }
              map={
                /*
                  지도 칸의 내용. 칸(`.region-results-map`) 자체는
                  `ResultShell`이 만든다 — 조건부 렌더링은 예전 그대로다.
                */
                <>
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
                            /*
                              마커 색·아래쪽 글자가 쓸 부담 수준.
                              목록과 같은 값이다(`burdenByUnit` 정의의
                              주석 참고).
                            */
                            burdenByUnit={burdenByUnit}
                            /*
                              선택은 App이 한 벌만 든다 — 목록 행 표시와
                              이 마커 강조가 같은 값을 본다.
                            */
                            focusedComplexKey={focusedComplexKey}
                            onFocusComplex={handleFocusComplex}
                            naverMapClientId={
                              import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string
                            }
                            /*
                              매매가·면적·입주년차 슬라이더(사용자 지시,
                              "필터" 버튼 팝업 안). 값의 출처·경계는
                              여기서 정하지 않는다 — `complexFilterBoundsValue`는
                              그 지역 데이터에서 매번 다시 재는 경계,
                              `complexFilters`는 사용자가 지금 맞춘 값이다.
                              `complexFilters`가 `null`인 한 프레임(지역을
                              막 조회해 아직 그 지역 범위로 초기화되기 전)에는
                              `complexFilterBoundsValue`를 그대로 값으로 쓴다.
                            */
                            filterBounds={complexFilterBoundsValue}
                            filterValue={complexFilters ?? complexFilterBoundsValue}
                            onFilterChange={setComplexFilters}
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
                </>
              }
              panel={
                /*
                  예산 상세 패널(design.md §5, Task 5). Task 4까지
                  사이드바 맨 위에 세로로 쌓여 있던 예산 블록이 통째로
                  여기로 옮겨 왔다 — **컴포넌트도 prop도 조건도 그대로**
                  이고 자리만 바뀌었다.

                  닫혀 있어도 언마운트하지 않는다. 이 안에는 보호 대상
                  클래스가 열 개 들어 있고, 패널의 기본 상태는 닫힘이며,
                  Cmd+P는 어느 단계에서든 눌린다(BudgetPanel.tsx 참고).
                */
                <BudgetPanel
                  open={budgetPanelOpen}
                  onClose={() => setBudgetPanelRequested(false)}
                  returnFocusRef={budgetTriggerRef}
                >
                  {/*
                    화면에서는 숨고 인쇄에서만 나온다(styles.css의
                    .print-summary). 지금 화면 그대로 인쇄되는 이 리포트가
                    배우자·부모님처럼 화면을 보지 않은 사람에게 건네지므로,
                    계산의 전제(사용가능 현금 예산·연 소득·생애최초 여부·
                    기존 대출·규제지역 여부·전용면적)와 룰셋 기준·인쇄일을
                    종이에도 남긴다 — 사용자 지시로 화면의 "계산 전제"
                    문구 덩어리(구 `AssumptionLine`)는 삭제됐지만, 같은
                    사실(기존 대출·규제지역 판정 여부·전용면적 기준)은
                    이 요약의 각 항목에 여전히 남아 있다.

                    사이드바가 아니라 **이 패널 안**에 둔다. 화면에서는
                    어차피 `display: none`이라 어디 있든 같고, 종이에서는
                    이 순서가 곧 지면 순서다 — 전제(이 요약) → 예산 →
                    목록/상세 → 면책 순서를 유지한다.
                  */}
                  <PrintSummary
                    state={state}
                    areaBasis={areaBasis}
                    rules={rules}
                  />
                  <BudgetResult
                    result={affordability.result}
                    householdCountNote={ACQUISITION_TAX_SUMMARY_NOTE}
                    isRegulatedArea={residentialProfile.isRegulatedArea}
                    isFirstTimeBuyer={residentialProfile.isFirstTimeBuyer}
                  />
                  {affordability.result.affordablePrice > 0 && (
                    <>
                      {/*
                        ⚠ **`max`와 `affordablePrice`는 이제 다른 값이다.**
                        눈금 상한(`sliderMax`)은 실구매 가능 가격보다
                        위다(사용자 지시) — 지금 현금으로 못 사는 가격도
                        짚어 볼 수 있어야 "현금이 얼마 더 필요한지"를
                        말할 수 있다. 그 금액(`cashShortfall`)은 엔진의
                        `ownFundsRequired`에서 나온다(useAffordability.ts)
                        — 슬라이더가 자기 식으로 다시 유도하지 않는다.
                      */}
                      <PriceSlider
                        price={affordability.price}
                        max={affordability.sliderMax}
                        affordablePrice={affordability.result.affordablePrice}
                        cashShortfall={affordability.cashShortfall}
                        safePrice={affordability.safePrice}
                        onChange={affordability.setPrice}
                        safety={affordability.safety}
                        loanAmount={affordability.loanAtPrice.amount}
                        ratePercentText={affordability.ratePercentText}
                        onRateChange={affordability.setRatePercentText}
                        effectiveRate={affordability.effectiveRate}
                        // 평형을 고른 동안에는 이 표도 그 평형을 전제로
                        // 계산된다(면적·가격 범위 모두). 상세 배지는
                        // 등급을 붙드는데 이 표만 "안전"이라고 말하면 한
                        // 화면이 스스로 모순되고, 하필 먼저 읽히는 쪽이
                        // 낙관적이다. 고른 평형이 없으면 넘기지 않는다 —
                        // 그때 이 표는 어떤 집도 가리키지 않는다.
                        landLeasehold={selectedUnit?.landLeasehold}
                        // 등급이 왜 멈췄는지는 상세 배지가 말한다.
                        // 둘 다 같은 문장을 말하면 한 화면에 똑같은
                        // 경고가 두 번 뜨고 둘 다 잡음으로 읽힌다. 등급
                        // 글자는 여기에도 그대로 남는다.
                        explainGrade={false}
                      />
                    </>
                  )}
                </BudgetPanel>
              }
              sidebar={
                <>
              {/*
                엔진이 낸 경고. **사이드바 맨 위, 접히는 것 바깥이다** —
                상단바(트리거) 아래, 목록/상세보다 위.

                `BudgetResult` 안에 있던 것을 여기로 들어냈다. 그
                컴포넌트가 자기 문서에 적어 뒀던 이유가 그대로 이 자리의
                이유다: **접으면 안 되는 종류의 정보다.** Task 5가 예산
                블록을 접힌 채로 시작하는 상세 패널 안으로 옮기면서
                경고까지 함께 접혔고, 결과 화면에는 굵은 "실구매 가능
                가격"만 뜨고 그 숫자를 **한정하는** 문장("기존 주택
                정보가 없어 매도 대금이 반영되지 않았어요" 같은,
                `src/lib/finance/available-cash.ts`의 줄)은 "자세히"를
                눌러야 보이는 상태가 됐다. 상단바의 헤드라인 숫자가 어떤
                조건 위에 서 있는지를 말하는 문장이라, 그 숫자와 같은
                화면에 함께 있어야 한다.

                **`BudgetResult`에 "경고를 숨기는 prop"을 더하는 대신
                들어냈다** — 두면 출처가 둘이 되고, 언젠가 두 자리가
                서로 다른 경고 집합을 말한다. 이 자리가 유일한 출처다.

                경고가 0건이면 `WarningList`가 `null`을 돌려주므로 사이드바
                맨 위에 빈 상자도 빈 여백도 생기지 않는다.

                **패널이 열린 동안에는 가려진다**(패널이 이 열을 덮고
                `inert`로 잠근다). 그대로 둔 판단이다 — 패널이 담는 것이
                바로 그 숫자의 근거(`ZeroBudgetMessage`·`BindingExplainer`·
                `CostBreakdown`)라, 패널이 열린 순간은 사용자가 한정
                조건을 **읽고 있는** 상태다. 고쳐야 했던 것은 기본
                상태(닫힘)에서 숫자만 보이던 것이고, 그 상태는
                App.test.tsx의 "엔진 경고의 자리"가 잠근다.

                인쇄에서는 패널이 흐름에 합류하므로 종이 순서가
                전제(PrintSummary) → 가정 → 예산 → **경고** → 목록/상세 →
                면책이 된다. 경고가 예산 블록 **뒤**로 밀렸지만 같은
                종이에 정확히 한 번 나온다(`warning-list`는
                `MUST_SURVIVE_PRINT_CLASSES`다).
              */}
              <WarningList warnings={affordability.result.warnings} />

              {/*
                사이드바는 이제 **목록 ↔ 단지 상세** 두 화면만 오간다
                (design.md §5). 조건식(`detail !== null`)은 Task 4에서
                쓰던 것 그대로다 — 브리프가 "조건식 자체는 바꾸지
                않는다"고 못 박은 자리다.
              */}
              {detail !== null ? (
                <>
                  <ComplexDetail
                    unit={detail.unit}
                    /*
                      평형 선택기의 원천. **필터를 거치기 전 목록**
                      (`regionComplexes.units`)을 넘긴다 — 평형대로 좁혀
                      놓고 들어왔다고 해서 이 단지에 그 평형만 있는 것은
                      아니다(ComplexDetail의 `units` 문서 참고).
                    */
                    units={regionComplexes.units}
                    onSelectUnit={handleSelectUnit}
                    householdCountNote={detail.householdCountNote}
                    priceBudget={detail.priceBudget}
                    profile={detail.profile}
                    onClose={handleCloseDetail}
                  />
                </>
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

                  {/*
                    필터 슬라이더는 **그 지역에 거래가 있으면 언제나
                    보인다** — 아래 `rangeFilteredUnits.length === 0`
                    분기와 달리 슬라이더 자체는 결과가 0건이어도 사라지지
                    않는다. 사라지면 사용자가 슬라이더를 넓혀 0건에서
                    빠져나올 방법이 없다(슬라이더가 곧 그 탈출구다) — 옛
                    평형대 칩이 화면 1에 살아 입력 화면으로 돌아가야만
                    바꿀 수 있었던 것과 다른 자리다.
                  */}
                  {regionComplexes.status === "success" &&
                    regionComplexes.units.length > 0 && (
                      <>
                          {/*
                            매물 유형·행정동 좁히기를 한 그룹으로 묶는다.
                            아래 목록(`ComplexList`)과는 성격이 다른
                            "조회 조건" 축이라, 이 그룹 전체 아래에 연한
                            구분선을 한 번만 긋는다(`.complex-filters`) —
                            두 필드 각각에 선을 그으면 필드 사이에도 선이
                            생겨 "조건 대 결과"가 아니라 "필드 대 필드"로
                            읽힌다. 인쇄에서는 이 그룹 전체가 사라진다
                            (`src/print/hiddenInPrint.ts`의 `.complex-filters`
                            항목 참고) — 안 그러면 자식(둘 다 인쇄 숨김
                            대상)만 지워지고 빈 구분선만 종이에 남는다.
                          */}
                          <div className="complex-filters">
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
                                    // 동을 바꾸면 앞서 고른 단지가 새 목록에
                                    // 없을 수 있다 — 목록에 없는 행을 가리키는
                                    // 표시가 남지 않게 함께 되돌린다.
                                    setFocusedComplexKey(null);
                                    // `ComplexList`에 건 `key`(아래 렌더)가 동
                                    // 값을 포함하므로, 목록이 다시 마운트돼 각
                                    // 덩어리의 페이지도 함께 1쪽으로 돌아간다
                                    // (handleRegionSelect와 같은 이유) —
                                    // 안 그러면 동을 좁힌 새 목록이 이전
                                    // 목록의 페이지 깊이를 그대로 물려받는다.
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
                          </div>
                          {rangeFilteredUnits.length === 0 ? (
                            /*
                              ⚠ **필터 범위 밖이라 0건인 것은 "예산으로
                              못 산다"·"이 동엔 없다"와 다른 원인이다.**
                              세 슬라이더 중 어느 것을 넓히면 결과가
                              생기는지를 `wouldHelpToResetAxis`로 축마다
                              직접 확인해, 도움이 되는 축만 짚어 말한다 —
                              지역·평형대·예산을 가를 때와 같은 이유다(이
                              저장소가 여섯 번 반복한 실패).
                            */
                            <p className="complex-range-empty">
                              {(() => {
                                const filters = complexFilters ?? complexFilterBoundsValue;
                                const axes: Array<{
                                  key: "price" | "area" | "builtYearAge";
                                  label: string;
                                }> = [
                                  { key: "price", label: "매매가" },
                                  { key: "area", label: "면적" },
                                  { key: "builtYearAge", label: "입주년차" },
                                ];
                                const helpful = axes
                                  .filter((axis) =>
                                    wouldHelpToResetAxis(
                                      regionComplexes.units,
                                      filters,
                                      complexFilterBoundsValue,
                                      axis.key,
                                      now,
                                    ),
                                  )
                                  .map((axis) => axis.label);
                                return helpful.length > 0
                                  ? `${helpful.join("·")} 범위에 해당하는 매물이 이 지역엔 없어요. ${helpful.join("·")} 범위를 넓혀 보세요.`
                                  : "지금 필터 조건에 해당하는 매물이 이 지역엔 없어요. 필터 범위를 넓혀 보세요.";
                              })()}
                            </p>
                          ) : dongFilteredEmpty ? (
                            <p className="dong-empty">
                              이 동엔 조건에 맞는 단지가 없어요. 다른 동을
                              선택하거나 전체로 넓혀 보세요.
                            </p>
                          ) : (
                            complexList !== null && (
                              <ComplexList
                                /*
                                  지역·행정동이 바뀌면 컴포넌트를 통째로
                                  다시 마운트한다 — 각 덩어리가 내부에 들고
                                  있는 페이지 번호(useState)가 자동으로 1쪽
                                  으로 초기화된다. 프로필(현금·소득 등)만
                                  바뀔 때는 이 key가 그대로라 페이지가
                                  유지된다: 상단바에서 숫자만 살짝 고친
                                  사람이 보던 페이지를 잃지 않는다.
                                */
                                key={`${currentRegionCode ?? ""}|${selectedDong ?? ""}`}
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
                                onSelect={handleSelectUnit}
                                /*
                                  지도에서 고른 단지. 마커 강조와 같은
                                  값을 본다(위 `focusedComplexKey` 주석).
                                */
                                focusedComplexKey={focusedComplexKey}
                              />
                            )
                          )}
                      </>
                    )}
                </>
              )}

                  {/*
                    면책은 **목록·상세 어느 쪽에서도** 사이드바 끝에
                    남는다(dispatch B). `disclaimer`는
                    MUST_SURVIVE_PRINT_CLASSES라 어느 화면에서 인쇄해도
                    종이에 남아야 한다.
                  */}
                  {disclaimer}
                </>
              }
            />
          ) : (
            /*
              프로필이 아직 안 끝났다 — 셸을 세우지 않는다(그 안에 담을
              숫자가 하나도 없다. 무엇이 모자란지는 화면 1이 말한다).
              그래도 **면책은 남긴다**: 이 상태에서 인쇄한 종이(인쇄는
              브라우저의 Cmd+P로만 한다)에 구매 유형 한 줄만 남지 않게
              한다.
            */
            disclaimer
          )}

        </ErrorBoundary>

      </div>
    </main>
  );
}
