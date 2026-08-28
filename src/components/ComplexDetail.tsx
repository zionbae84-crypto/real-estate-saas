import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { AGGREGATION_WINDOW_LABEL } from "../data/complexes";
import type { ComplexUnit, TradeRecord } from "../data/complexes";
import { formatWon, formatWonRoundedToMan } from "../format/won";
import { burdenGrade } from "../lib/burden-grade";
import type { BuyerProfile } from "../lib/finance";
import {
  brokerageFeeRateFor,
  calcAcquisitionCosts,
  calcBurdenAt,
  calcMaxLoan,
  ltvRateFor,
} from "../lib/finance";
import type { PriceBudgetInput } from "../lib/price";
import { landLeaseRules } from "../state/landLeaseRules";
import { rules } from "../state/useAffordability";
import { locationRules } from "../state/useLocationFacts";
import { priceRules } from "../state/usePriceCheck";
import { BindingLimitTable } from "./BindingExplainer";
import { CostBreakdown } from "./CostBreakdown";
import { DetailViewIcon } from "./DetailViewIcon";
import { LandLeaseNote } from "./LandLeaseNote";
import { LoanCalculator } from "./LoanCalculator";
import { LocationFacts } from "./LocationFacts";
import { MoneyInput } from "./MoneyInput";
import { NoLoanLine } from "./NoLoanLine";
import { PriceCheck } from "./PriceCheck";

export interface ComplexDetailProps {
  /** 지금 고른 평형. 아래 계산은 전부 이 평형 기준이다 */
  unit: ComplexUnit;
   /**
   * 조회 결과의 평형 전부. 이 컴포넌트가 `complexKey`로 걸러 선택기를
   * 그린다.
   *
   * ⚠ **평형대·행정동 필터를 거치기 _전_의 목록이어야 한다.** 사용자가
   * "84㎡대"로 좁혀 놓고 들어왔다고 해서 이 단지에 84㎡ 하나만 있는
   * 것은 아니다 — 거른 목록을 넘기면 칩이 하나만 떠서 "이 단지엔 이
   * 평형뿐"이라는 없는 사실을 말하게 된다. 필터는 **무엇을 보여줄까**를
   * 정하는 장치이지 **무엇이 존재하는가**를 바꾸는 장치가 아니다.
   */
  units: readonly ComplexUnit[];
  onSelectUnit: (unit: ComplexUnit) => void;
  /**
   * 부대비용의 취득세 줄에 붙는 주택 수 고지. 호출부가
   * `householdCountNoteFor`로 골라 넘긴다({@link CostBreakdown} 참고).
   */
  householdCountNote: string;
  /**
   * 호가 위치 확인의 예산 줄에 쓸 실거주 프로필. 없으면 그 줄을
   * 만들지 않는다({@link PriceCheck} 참고).
   */
  priceBudget: PriceBudgetInput | null;
  /**
   * 부대비용·대출 한도·상환 부담을 내는 데 쓰는 실거주 프로필.
   * **이 평형의 실제 전용면적이 반영된 것**이어야 한다(호출부의
   * `effectiveProfile`) — 85㎡ 초과면 농특세가 붙어 부대비용이 달라진다.
   *
   * `null`이면 아래 계산 블록을 통째로 그리지 않는다. 실거주 프로필이
   * 없는데 실거주 기준 숫자를 내면 안 된다.
   */
  profile: BuyerProfile | null;
  onClose: () => void;
}

/** 준공년 → "2000년 준공 · 26년차". 경과년수는 오늘을 기준으로 센다. */
function builtLabel(builtYear: number, now: Date): string {
  const age = now.getFullYear() - builtYear;
  // 준공 연도와 같은 해면 "0년차"가 아니라 "올해 준공"이다 — 맨숫자 0을
  // 답으로 쓰지 않는 이 저장소의 규칙이 여기에도 걸린다. 음수(미래
  // 준공년)도 같은 자리로 보낸다: 지어내는 것보다 덜 말하는 편이 낫다.
  if (age <= 0) return `${builtYear}년 준공`;
  return `${builtYear}년 준공 · ${age}년차`;
}

/** "2026-07-10" → "2026.07.10". 원본 문자열을 파싱하지 않고 모양만 바꾼다 */
function formatContractDate(date: string): string {
  return date.replaceAll("-", ".");
}

/**
 * 평형 선택기에 쓸 이름. 목록·제목에서 쓰던 것과 같은 표기다.
 */
function areaLabel(unit: ComplexUnit): string {
  return `${unit.areaBucket}㎡`;
}

/**
 * 단지 상세.
 *
 * 사용자 지시로 이 화면을 다시 짰다. 요점은 셋이다.
 *
 * 1. **제목은 단지 이름 하나다.** 면적·법정동은 제목에서 빠지고, 그
 *    아래 사실 줄(주소·준공년·경과년수)과 평형 선택기로 내려갔다.
 * 2. **평형(타입)을 이 화면에서 고른다.** 예전에는 목록에서 고른 평형
 *    하나만 다뤘다. 이제 같은 단지의 평형을 여기서 갈아탈 수 있고,
 *    고른 평형의 **실거래 내역**(거래가·거래일·층)을 표로 보여준다.
 * 3. **매물가격 하나가 아래 전부를 움직인다.** 예전에는 위쪽 계산이
 *    `unit.maxPrice`(범위 위쪽) 고정이고 호가 입력은 접힌 영역 안에
 *    따로 있었다 — 한 화면에 가격 기준이 둘이었다. 이제 입력이 하나이고
 *    부대비용·매달 나가는 돈·호가 위치가 **같은 가격**을 쓴다.
 *
 * 그대로 둔 계약도 있다.
 *
 * - **접는 것과 지우는 것은 다르다.** `PriceCheck`·`LocationFacts`는
 *   `<details>`(기본 닫힘)로 접되 지우지 않는다. 두 영역의 고지 문구는
 *   대부분 `MUST_SURVIVE_PRINT_CLASSES`라 인쇄에서는 펼쳐져야 하고,
 *   그 일은 `styles.css`의 `::details-content` 규칙이 한다 — 직접 만든
 *   상자로 접으면 종이에서 내용이 통째로 사라진다.
 * - **맨숫자 0은 답의 모양을 한 거짓말이다.** 가격을 아직 안 넣었으면
 *   0원짜리 표를 그리는 대신 무엇을 넣어야 하는지 말한다.
 * - **가정은 화면에 적는다.** 금리·기간은 계산기 안에서 사용자가 고를
 *   수 있고, 무엇으로 계산했는지는 결과 카드가 그대로 다시 적는다.
 */
export function ComplexDetail({
  unit,
  units,
  onSelectUnit,
  householdCountNote,
  priceBudget,
  profile,
  onClose,
}: ComplexDetailProps) {
  /**
   * 상세가 열리면 포커스를 이 화면으로 옮긴다.
   *
   * 목록이 통째로 사라지고 이 화면이 그 자리에 나타나는데, 포커스는
   * 방금 사라진 행 버튼 자리에 남는다 — 스크린리더 사용자에게는 아무
   * 일도 일어나지 않은 것처럼 들린다.
   *
   * ⚠ **의존성이 `unit`이 아니라 `unit.complexKey`다.** 이제 평형을 이
   * 화면 안에서 갈아탈 수 있는데, 그때마다 섹션으로 포커스를 뺏으면
   * 방금 누른 평형 칩에서 포커스가 사라져 키보드 사용자가 다음 칩으로
   * 이동하지 못한다. **다른 단지**로 갈아탈 때만 옮긴다.
   */
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus();
  }, [unit.complexKey]);

  /**
   * 사용자가 넣은 매물가격. **아래 모든 계산의 기준이다.**
   *
   * ⚠ **이 평형의 실거래 범위 위쪽(`unit.maxPrice`)으로 채워 두고
   * 시작한다.** 한동안 빈 칸으로 시작했는데, 그러면 상세를 열자마자
   * 부대비용도 매달 나가는 돈도 없이 "가격을 넣으면 계산해요" 한 줄만
   * 남는다 — 사용자가 "부대비용, 매달나가는돈 확인란이 다 없어졌어"라고
   * 지적한 상태가 이것이다.
   *
   * **왜 하필 범위 위쪽인가.** 목록 행·예전 상세와 **같은 기준**이라
   * 화면들이 서로 다른 가격을 말하지 않고(`lib/complex-list.ts`),
   * 무엇보다 틀리는 방향이 안전하다 — 범위 위쪽으로 재면 부담이 실제보다
   * **작게** 나오는 일이 없다. 이 앱이 가장 피하는 것이 낙관 방향의
   * 오답이다.
   *
   * **지어낸 값이 아니다.** 바로 위 실거래 내역 표가 그 범위를 만든
   * 거래들을 그대로 보여주고 있어, 이 숫자가 어디서 왔는지 화면에서
   * 확인된다. 사용자는 자기가 들은 호가로 바로 고쳐 쓰면 된다.
   */
  const [askingPrice, setAskingPrice] = useState<number | null>(unit.maxPrice);

  /**
   * 평형을 갈아타면 매물가격을 그 평형의 기준값으로 되돌린다.
   *
   * ⚠ **없으면 조용한 오답이 난다** — 59㎡를 보다가 84㎡ 칩을 눌러도
   * 가격이 59㎡의 것으로 남아, 화면은 멀쩡한 부대비용·상환액을 내는데
   * 그 숫자가 통째로 다른 평형에 대한 것이 된다.
   *
   * 렌더 중에 상태를 고치는 React 공식 패턴이다(`useEffect`보다 낫다 —
   * 잘못된 가격으로 한 번 그린 뒤 고치는 것이 아니라 아예 그리지
   * 않는다). 조건이 있어 무한 루프가 되지 않는다.
   */
  const unitKey = `${unit.complexKey}|${unit.areaBucket}`;
  const [priceUnitKey, setPriceUnitKey] = useState(unitKey);
  if (priceUnitKey !== unitKey) {
    setPriceUnitKey(unitKey);
    setAskingPrice(unit.maxPrice);
  }

  /** 같은 단지의 평형들. 선택기에 그린다 — 면적 오름차순. */
  const siblings = useMemo(
    () =>
      units
        .filter((u) => u.complexKey === unit.complexKey)
        .slice()
        .sort((a, b) => a.areaBucket - b.areaBucket),
    [units, unit.complexKey],
  );

  /**
   * 넣은 가격에서의 부대비용·대출 한도. 가격이나 프로필이 없으면 `null`이고,
   * 그때 아래 두 블록은 숫자 대신 안내를 낸다.
   *
   * **엔진을 여기서 부른다.** 예전에는 호출부가 `unit.maxPrice`로 미리
   * 계산해 넘겼는데, 이제 기준 가격이 이 화면 안의 입력이라 그럴 수 없다.
   * 부르는 함수도 인자도 그대로다 — 바뀐 것은 가격이 어디서 오는가뿐이다.
   */
  const atPrice = useMemo(() => {
    if (profile === null || askingPrice === null || askingPrice <= 0) return null;

    /*
     * 이 가격을 사려면 실제로 빌려야 하는 금액과, 그 대출에서의 부담.
     * **목록 행과 같은 함수**(`calcBurdenAt`)를 쓴다 — 두 화면이 같은
     * 집을 두고 다른 등급을 말할 수 없게 하는 자리다.
     */
    const burden = calcBurdenAt(profile, rules, askingPrice);

    return {
      // 프로필을 함께 담는다 — 이 객체가 `null`이 아니면 프로필도
      // `null`이 아니라는 사실을 타입 수준에서 들고 다니려는 것이다.
      profile,
      costs: calcAcquisitionCosts(askingPrice, profile, rules),
      maxLoan: calcMaxLoan(profile, rules, askingPrice),
      burden,
      /*
       * 화면에 보일 등급(그리고 그 등급이 왜 거기서 멈췄는지). 목록의
       * 행 배지와 **같은 함수**(`burdenGrade`)를 쓴다 — 토지임대부(또는
       * 모름)라 "안전"까지 못 갔다면 그 사실을 두 화면이 같은 말로
       * 전해야 한다.
       */
      grade: burdenGrade(burden.safety.level, unit.landLeasehold, landLeaseRules),
    };
  }, [profile, askingPrice, unit.landLeasehold]);

  /**
   * 한도 결정 내역 팝업이 화면 어디에 뜰지(뷰포트 좌표).
   *
   * ⚠ **사이드바 카드 안이 아니라 뷰포트 기준으로 띄운다**(사용자
   * 지시: "지금 팝업이 사이드바 위치에 생겨서 내용을 가리는데 오른쪽
   * 맵부분에 생기도록 해줘"). 사이드바(`.region-results-sidebar`)는
   * `overflow-y: auto`인데, CSS 오버플로 규칙상 한 축만 `auto`를 걸어도
   * 나머지 축이 `visible`에서 `auto`로 함께 바뀐다 — 그래서 `position:
   * absolute`로 띄우면 사이드바 오른쪽 경계에서 그대로 잘렸다(실측).
   * `position: fixed`는 이 사이드바처럼 `transform`·`filter`가 없는
   * 조상의 overflow에 갇히지 않고 곧장 뷰포트 기준으로 뜬다 — 그래서
   * 사이드바를 벗어나 지도 위에 자연스럽게 걸친다. 리액트 포털 없이도
   * 되는 이유가 이것이다: DOM 자리는 그대로 `<details>` 안이고,
   * `position`만 바꿨다.
   *
   * 좌표는 트리거(아이콘)를 열 때 한 번만 잰다 — 계속 스크롤을 추적하지
   * 않는다. 이 팝업은 열자마자 읽고 곧 닫는 짧은 상호작용이라, 그 사이
   * 사이드바를 또 스크롤하는 경우는 드물고, 만약 그런다면 살짝 어긋나는
   * 정도가 스크롤마다 위치를 다시 재는 복잡도보다 싸다.
   */
  const [bindingPopupPos, setBindingPopupPos] = useState({ top: 0, left: 0 });

  /**
   * `<details>`의 네이티브 toggle 이벤트로 여닫힘을 안다 — 별도 상태로
   * `open`을 다시 관리(제어 컴포넌트로 만들기)하지 않는다. 그러면
   * 인쇄에서 `<details>`를 강제로 펼치는 `::details-content` 규칙이
   * 그대로 걸린다(제어 컴포넌트로 바꾸면 그 규칙이 보는 `open` 속성과
   * 리액트 상태가 어긋날 수 있다).
   */
  function handleBindingToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open) return;
    const trigger = event.currentTarget.querySelector(".detail-binding-toggle");
    const rect = trigger?.getBoundingClientRect();
    if (rect === undefined) return;
    setBindingPopupPos({ top: rect.top, left: rect.right + 8 });
  }

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

      {/* 사용자 지시: 제목은 단지 이름만. 면적은 아래 선택기가 진다. */}
      <h2 className="complex-detail-title">{unit.complexName}</h2>

      {/*
        사실 줄. 주소 · 준공년(경과년수) 순서다 — 사용자 지시의 순서를
        그대로 따른다. 세대수는 지금 데이터에 없어서 넣지 않는다(국토부
        실거래가 API가 주지 않는다) — 없는 값을 지어내거나 빈칸으로 두는
        대신 항목 자체를 만들지 않는다.

        주소가 `null`이면 그 줄을 빼고 준공년만 남긴다. 주소가 없는 것은
        우리가 못 만든 것이지 그 단지에 주소가 없는 것이 아니라, "주소
        없음"이라고 적으면 없는 사실을 말하게 된다.
      */}
      <p className="complex-detail-facts">
        {unit.address !== null && (
          <span className="complex-detail-address">{unit.address}</span>
        )}
        <span className="complex-detail-built">
          {builtLabel(unit.builtYear, new Date())}
        </span>
      </p>

      <LandLeaseNote landLeasehold={unit.landLeasehold} />

      {/*
        평형(타입) 선택기. 라디오가 아니라 버튼인 이유: 고르면 화면
        전체가 그 평형 기준으로 바뀌는 **이동**이지, 폼에 담겨 제출되는
        값이 아니다. 지금 고른 것은 `aria-pressed`가 말한다 — 색만으로
        전달하지 않는다.

        평형이 하나뿐이면 선택기를 그리지 않는다. 고를 것이 없는데
        버튼 하나가 눌린 채로 떠 있으면 무엇을 하라는 장치인지 알 수
        없고, 이 화면이 줄이려는 잡음이 그대로 는다.
      */}
      {siblings.length > 1 && (
        <div
          className="complex-detail-types"
          role="group"
          aria-label="평형 고르기"
        >
          {siblings.map((sibling) => (
            <button
              key={sibling.areaBucket}
              type="button"
              className="complex-detail-type"
              aria-pressed={sibling.areaBucket === unit.areaBucket}
              onClick={() => onSelectUnit(sibling)}
            >
              {areaLabel(sibling)}
            </button>
          ))}
        </div>
      )}

      <TradeHistory unit={unit} />

      {/*
        예상 매수금액(사용자 지시: "매물가격 >> 예상 매수금액 으로
        수정") — **이 화면에 가격 입력란은 이것 하나다.** 예전에는
        위쪽 계산이 `unit.maxPrice` 고정이고 호가 입력이 접힌
        `PriceCheck` 안에 따로 있어, 한 화면이 두 가격을 기준으로 말했다.

        `commitOn="blur"`(사용자 지시: "입력하면 그 자리에 확정된
        금액이 적히도록 해줘 — 지금은 아래에 중복해서 금액이 생김").
        입력하는 동안은 부대비용·최대 대출을 다시 계산하지 않는다 —
        "9"·"90"·"900"…이 매번 "9만원"·"90만원"으로 잘못 해석돼 아래
        숫자들이 깜빡이는 것을 막는다. 벗어나면(blur) 그 값으로 확정해
        아래 전부를 다시 계산하고, 입력란 자신이 "9억원"처럼 사람이
        읽는 형태로 바뀐다 — 그래서 이 아래에 결과를 되비추는 줄이
        따로 없다(`MoneyInput`의 `commitOn` 문서 참고).

        인쇄에서는 입력란을 지운다(`.price-check-form`과 같은 관행 —
        `.complex-detail-price-form`). 넣은 값 자체는 아래 결과들이 각자
        다시 적으므로 종이에서 잃는 정보가 없다.
      */}
      <form
        className="complex-detail-price-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <MoneyInput
          id="complex-detail-price"
          label="예상 매수금액"
          hint="단위를 안 쓰면 만원으로 읽어요. '12억3000'처럼 써도 돼요."
          value={askingPrice}
          onChange={setAskingPrice}
          commitOn="blur"
        />
      </form>

      {atPrice === null ? (
        /*
          가격을 넣기 전. 0원짜리 표를 그리는 대신 무엇을 하면 무엇이
          나오는지 말한다 — 빈 표는 언제나 "계산해 봤더니 0"으로 읽힌다.
        */
        <p className="complex-detail-await-price">
          {profile === null
            ? "예산(현금·연 소득)을 먼저 넣으면 이 가격의 부대비용과 매달 나가는 돈을 계산해요."
            : "예상 매수금액을 넣으면 취득시 부대비용과 매달 나가는 돈을 계산해요."}
        </p>
      ) : (
        <>
          <section className="detail-block detail-block--costs">
            <h3 className="detail-stat-label">취득시 부대비용</h3>
            <div className="detail-stat-line">
              <p className="detail-stat-value">
                {formatWonRoundedToMan(atPrice.costs.total)}
              </p>
              <CostBreakdown
                costs={atPrice.costs}
                householdCountNote={householdCountNote}
                brokerageFeeRate={brokerageFeeRateFor(askingPrice ?? 0, rules)}
                repeatTotal={false}
              />
            </div>
          </section>

          {/*
            매달 나가는 돈. 사용자 지시: 최대 대출 가능 금액을 알려주고,
            사용자가 필요한 대출액을 직접 넣고, 금리를 조절해 원리금을
            본다. 그래서 계산기가 **접힌 부속이 아니라 이 블록의 본문**이다
            (예전에는 셰브런 뒤에 숨어 있었다).
          */}
          <section className="detail-block detail-block--monthly">
            {/*
              **이 가격에 이 집을 샀을 때**의 등급. 아래 계산기가 내는
              등급과 **다른 질문에 답한다** — 이쪽은 "이 가격이면 이만큼
              빌려야 하고, 그게 감당되는가"이고, 아래쪽은 "내가 정한 그
              대출액이면 어떤가"다.

              ⚠ **지우면 안 되는 자리다.** 목록 행이 같은 함수
              (`calcBurdenAt` → `burdenGrade`)로 낸 등급을 이 화면에서도
              말해야 "목록은 확인 필요, 상세는 아무 말 없음"이 되지
              않는다. 특히 현금으로 다 살 수 있어 대출이 0원인 집에서는
              아래 계산기가 등급을 내지 않으므로, 이 자리가 없으면 등급이
              화면에서 통째로 사라진다.

              **등급 글자("안전")를 오른쪽 위 빈 공간으로 올린다**(사용자
              지시: "안전을 오른쪽 상단 빈공간으로 이동하고 줄을
              올려줘"). 예전에는 `SafetyBadge`(라벨 → 등급을 세로로
              쌓는 컴포넌트)를 그대로 써서 "매달 나가는 돈" 아래 두 줄을
              더 차지했다 — 카드 오른쪽이 통째로 비어 있는데도. 이 카드
              하나만의 배치라 `SafetyBadge`를 CSS로 다시 늘어놓는 대신
              그 컴포넌트가 하던 일(등급 낱말·등급이 멈춘 이유)만 여기서
              직접 그린다 — `PriceSlider`가 같은 이유로 이미 이 방식을
              쓴다.
            */}
            <div className="detail-monthly-header">
              <div>
                <h3 className="detail-stat-label">매달 나가는 돈</h3>
                <p className="safety-badge-label">이 가격에 샀을 때예요</p>
              </div>
              <p className="safety-level" data-level={atPrice.grade.level}>
                {atPrice.grade.label}
              </p>
            </div>

            {atPrice.grade.note !== null && (
              <p className="safety-grade-note">{atPrice.grade.note}</p>
            )}

            {/*
              소득이 0이라 부담률을 잴 수 없는 경우의 설명(`SafetyBadge`의
              `ZeroPaymentNote`와 같은 판단·같은 문구). "월 상환액 0원"과
              어떤 등급이 나란히 있으면 계산이 안 된 것처럼도 읽혀서,
              대출이 없어서가 아니라 소득 정보가 없어서라는 사실을 밝힌다.
              현금으로 다 덮이는 평범한 경우(부담률이 유한한 0)는 바로
              아래 `NoLoanLine`이 이미 "대출 없이 살 수 있어요"로 말하므로
              여기서 또 적지 않는다.
            */}
            {!Number.isFinite(atPrice.burden.safety.burdenRatio) && (
              <p className="safety-note">
                대출 없이 전액 현금으로 사는 경우예요. 이 등급은 상환
                부담이 아니라 소득 정보가 없다는 사실을 반영해요.
              </p>
            )}

            {/*
              현금만으로 덮이는 가격이라는 **사실**. 계산기를 대신하지
              않는다 — 아래에서 지운다(예전 결함).

              ⚠ **예전에는 이 사실이 계산기 전체를 가렸다**("대출입력하는
              모듈이 없어졌어", 사용자 리포트). `neededLoan === 0`은
              "이 가격을 사는 데 대출이 필요 없다"는 뜻이지 "대출을
              생각해 볼 이유가 없다"는 뜻이 아니다 — 사용자 지시가
              "사용자가 본인이 필요한 대출액을 직접 입력"이라, 필요
              여부와 무관하게 언제나 금액을 넣어 볼 수 있어야 한다.
              그래서 이제 **사실은 남기고 계산기는 그 아래 그대로 둔다.**
            */}
            {atPrice.burden.neededLoan === 0 && (
              <p className="detail-stat-value detail-stat-value--sentence">
                <NoLoanLine landLeasehold={unit.landLeasehold} />
              </p>
            )}

            {/*
              최대 대출 가능 금액. **이 블록에서 가장 중요한 숫자다**
              (사용자 지시) — 아래 계산기에 얼마를 넣을지 정하는 기준이라,
              문장 안에 섞이지 않고 줄을 바꿔 크게 선다.

              금액은 만원 단위까지만 적는다(사용자 지시). 이 자리는
              "얼마쯤 빌릴 수 있나"를 가늠하는 자리이지 원 단위까지
              맞춰야 하는 자리가 아니고, 정확한 값은 계산기가 한도를
              넘겼을 때 안내에 그대로 적는다.

              **한도가 0원이면 이 줄 자체를 만들지 않는다** — 맨숫자 0은
              답의 모양을 한 거짓말이다(이 저장소의 규칙). 그 경우는
              바로 아래 계산기가 "받을 수 있는 대출이 없어서…"로 이유를
              말한다.
            */}
            {atPrice.maxLoan.amount > 0 && (
              <div className="detail-max-loan">
                <p className="detail-max-loan-label">
                  이 가격에 매수할 경우 최대 대출은
                </p>
                {/*
                  금액과 "결정 내역" 트리거를 **한 줄**에 둔다 — 위
                  부대비용 블록이 큰 금액 옆에 내역 아이콘을 두는 것과
                  같은 장치다(`.detail-stat-line`).
                */}
                <div className="detail-max-loan-line">
                  <strong className="detail-max-loan-amount">
                    {formatWonRoundedToMan(atPrice.maxLoan.amount)}
                  </strong>
                  {/*
                    무엇이 이 한도를 정했는지(LTV·DSR·규제지역 상한·
                    정책대출 중 어느 것) 보여주는 팝업. 사용자 지시:
                    "대출금 옆에 결정내역 아이콘으로 해서 … 산출내역을
                    팝업 형식으로 볼 수 있도록." 아이콘은 "상세보기"
                    (`DetailViewIcon`, 사용자 지시로 정보 아이콘에서
                    바꿨다) — 팝업이 이제 이 자리에서 오른쪽(지도가 있는
                    넓은 칸)으로 열리므로, 여는 방향을 가리키는 화살표가
                    그 사실을 그림으로도 전한다.

                    ⚠ **`<dialog>`가 아니라 `<details>`다.** 모달로
                    만들면 이 내역이 **인쇄에서 통째로 사라진다** — 종이는
                    이 앱의 결과물이고(배우자·중개사에게 건네는 그 종이),
                    "왜 이 한도인지"는 거기서 빠지면 안 되는 근거다.
                    `<details>`는 `styles.css`의 `::details-content` 규칙이
                    인쇄에서 강제로 펼쳐 주고(`CostBreakdown` 주석과 같은
                    함정), 화면에서는 아래 `.detail-binding-popup` CSS가
                    떠 있는 상자로 그린다 — 보이는 것은 팝업이고 종이에서는
                    내역이 남는다.

                    `onToggle`이 열릴 때 아이콘의 화면 좌표를 재서
                    `bindingPopupPos`에 담는다 — 왜 뷰포트 기준으로
                    띄우는지는 그 상태의 문서 참고.
                  */}
                  <details
                    className="detail-binding"
                    onToggle={handleBindingToggle}
                  >
                    <summary
                      className="fold-more-hint detail-binding-toggle"
                      aria-label="한도 결정 내역 상세보기"
                    >
                      <DetailViewIcon />
                    </summary>
                    <div
                      className="detail-binding-popup"
                      style={{
                        top: bindingPopupPos.top,
                        left: bindingPopupPos.left,
                      }}
                    >
                      <p className="detail-binding-title">한도 결정 내역</p>
                      <BindingLimitTable
                        loanLimit={atPrice.maxLoan}
                        ltvBasis={{
                          price: askingPrice ?? 0,
                          // 계산이 쓴 것과 **같은 함수**로 요율을 고른다 —
                          // 화면이 계산과 다른 %를 말할 수 없다.
                          rate: ltvRateFor(atPrice.profile, rules),
                          isRegulatedArea: atPrice.profile.isRegulatedArea,
                          isFirstTimeBuyer: atPrice.profile.isFirstTimeBuyer,
                        }}
                      />
                    </div>
                  </details>
                </div>
              </div>
            )}

            {/*
              계산기는 **언제나 그린다** — 대출이 필요 없거나(현금으로
              덮이는 가격) 받을 수 있는 한도가 0이어도, 그 이유는 계산기
              자신이 안내로 말한다(`guidanceFor`·`maxLoan.amount <= 0`
              분기). 이 화면에서 "대출금액을 직접 넣어 본다"는 장치가
              사라지는 경로가 있으면 안 된다.

              **평형·가격별 `key`를 준다.** 평형을 갈아타거나 매물가격을
              바꾸면 계산기가 다시 마운트되면서 앞 가정(대출액)이
              비워진다. 없으면 화면은 멀쩡한 상환액을 내는데 그 숫자가
              통째로 다른 집·다른 가격에 대한 것이 된다.
            */}
            <LoanCalculator
              key={`${unit.complexKey}|${unit.areaBucket}|${askingPrice}`}
              neededLoan={atPrice.burden.neededLoan}
              maxLoan={atPrice.maxLoan}
              profile={atPrice.profile}
              /*
                등급이 왜 멈췄는지는 **위 배지가 이미 말한다.** 둘 다
                말하면 한 화면에 똑같은 경고가 두 번 뜨고 둘 다 잡음으로
                읽힌다(`SafetyBadge.explainGrade`와 같은 갈래의 판단).
                등급 글자 자체는 여기에도 남으므로, 위 배지보다
                낙관적으로 말하는 일은 생기지 않는다.
              */
              explainGrade={false}
              /*
                등급을 붙드는 자리다 — 토지임대부거나 모르는 집이면 우리
                상환액에 토지 사용료가 빠져 있어 "안전"이라고 말하면
                안 된다(`LoanCalculator.landLeasehold` 문서). 이 화면은
                평형이 정해져 있으므로 언제나 넘긴다.
              */
              landLeasehold={unit.landLeasehold}
            />
          </section>
        </>
      )}

      {/*
        호가 위치 확인. **가격 입력란은 위 하나로 합쳤으므로**(사용자
        지시) 여기에는 값만 내려보낸다 — `askingPrice`를 넘기는 순간
        `PriceCheck`는 자기 입력란을 그리지 않는다.

        접었지만 지우지 않았다: `price-no-estimate`("적절한 값이 얼마인지
        매기지 않아요")·`price-disclosure`(층·향 미반영, 신고 지연)가
        종이에서 사라지면 종이를 건네받은 사람이 남은 판정을 "적정가
        판정"으로 읽는다.
      */}
      <details className="detail-fold detail-fold--price">
        <summary>
          {priceRules.position.label}
          <span className="fold-more-hint"> 더 보기</span>
        </summary>
        <PriceCheck
          key={`${unit.complexKey}|${unit.areaBucket}`}
          unit={unit}
          budget={priceBudget}
          askingPrice={askingPrice}
          showTitle={false}
        />
      </details>

      {/*
        입지 사실은 맨 뒤다. 이건 평형이 아니라 **단지**의 성질이라
        `complexKey` 하나로 묻고, 거리라는 사실은 그 자체로 판단이
        아니므로 "멈춰야 할 이유"들 뒤에 온다. 그 결과 이 화면이
        마지막으로 하는 말이 "우리가 재지 못하는 것"이 된다.
      */}
      <details className="detail-fold detail-fold--location">
        <summary>
          {locationRules.label}
          <span className="fold-more-hint"> 더 보기</span>
        </summary>
        <LocationFacts complexKey={unit.complexKey} showTitle={false} />
      </details>
    </section>
  );
}

/**
 * 고른 평형의 실거래 내역(사용자 지시: "타입을 선택하면 거래가, 거래일을
 * 볼수있도록").
 *
 * **집계값이 아니라 국토부가 공개한 사실 그대로다.** 이 앱이 대표값을
 * 말하지 않는 규칙(`medianPrice`를 산출물에서 뺀 것)과 어긋나지 않는다 —
 * 그 규칙이 막는 것은 우리가 값을 골라 단정하는 것이고, 여기 나오는 것은
 * 실제로 체결된 계약이다. 그래서 이 표에는 평균도 추세도 없다.
 *
 * ⚠ **빈 표를 "거래가 없다"로 그리지 않는다.** `tradeCount`가 0보다
 * 큰데 `trades`가 비어 있으면 그건 거래가 없는 게 아니라 **내역을 받지
 * 못한 것**이다(예: 이 필드가 생기기 전에 만들어진 번들 데이터). 두
 * 상태를 같은 빈 표로 그리면 화면이 없는 사실을 말한다.
 */
function TradeHistory({ unit }: { unit: ComplexUnit }) {
  const { trades, tradeCount } = unit;

  if (trades.length === 0) {
    return (
      <p className="complex-detail-trades-empty">
        {tradeCount > 0
          ? `${AGGREGATION_WINDOW_LABEL} 거래는 ${tradeCount}건인데, 거래 내역을 받지 못했어요.`
          : `${AGGREGATION_WINDOW_LABEL} 거래가 없어요.`}
      </p>
    );
  }

  return (
    <section className="complex-detail-trades" aria-label="실거래 내역">
      <h3 className="detail-stat-label">
        {AGGREGATION_WINDOW_LABEL} 실거래 {trades.length}건
      </h3>
      <table className="complex-detail-trade-table">
        <thead>
          <tr>
            <th scope="col">거래일</th>
            <th scope="col">거래가</th>
            <th scope="col">층</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, index) => (
            <TradeRow key={`${trade.contractDate}|${trade.price}|${index}`} trade={trade} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TradeRow({ trade }: { trade: TradeRecord }) {
  return (
    <tr>
      <td>{formatContractDate(trade.contractDate)}</td>
      <td className="complex-detail-trade-price">
        {formatWonRoundedToMan(trade.price)}
      </td>
      {/*
        층을 모르면 비워 두지 않는다 — 빈 칸은 "1층"이나 "정보 없음"이
        아니라 그냥 읽는 사람이 알아서 채우는 자리가 된다. 모른다고
        글자로 말한다(파이프라인이 0층·1층으로 채우지 않는 것과 같은
        규칙의 화면 쪽 절반이다).
      */}
      <td className="complex-detail-trade-floor">
        {trade.floor === null ? "모름" : `${trade.floor}층`}
      </td>
    </tr>
  );
}
