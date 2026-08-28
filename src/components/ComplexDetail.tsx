import { useEffect, useMemo, useRef, useState } from "react";
import { AGGREGATION_WINDOW_LABEL } from "../data/complexes";
import type { ComplexUnit, TradeRecord } from "../data/complexes";
import { formatWon, formatWonRoundedToMan } from "../format/won";
import type { BuyerProfile } from "../lib/finance";
import {
  brokerageFeeRateFor,
  calcAcquisitionCosts,
  calcBurdenAt,
  calcMaxLoan,
} from "../lib/finance";
import type { PriceBudgetInput } from "../lib/price";
import { rules } from "../state/useAffordability";
import { locationRules } from "../state/useLocationFacts";
import { priceRules } from "../state/usePriceCheck";
import { CostBreakdown } from "./CostBreakdown";
import { LandLeaseNote } from "./LandLeaseNote";
import { LoanCalculator } from "./LoanCalculator";
import { LocationFacts } from "./LocationFacts";
import { MoneyInput } from "./MoneyInput";
import { NoLoanLine } from "./NoLoanLine";
import { PriceCheck } from "./PriceCheck";
import { SafetyBadge } from "./SafetyBadge";

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
   * 비어 있는 채로 시작한다 — 사용자 지시가 "매물가격을 입력하면 …
   * 확인할 수 있도록"이라, 넣기 전에 숫자를 내면 그 숫자가 어디서 왔는지
   * 말할 수 없다. 예전에는 `unit.maxPrice`(범위 위쪽)를 말없이 깔고
   * 시작했고, 그게 사용자가 지적한 "불필요한 설명"의 절반이었다(그
   * 전제를 매번 문장으로 해명해야 했다).
   */
  const [askingPrice, setAskingPrice] = useState<number | null>(null);

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
    return {
      // 프로필을 함께 담는다 — 이 객체가 `null`이 아니면 프로필도
      // `null`이 아니라는 사실을 타입 수준에서 들고 다니려는 것이다.
      profile,
      costs: calcAcquisitionCosts(askingPrice, profile, rules),
      maxLoan: calcMaxLoan(profile, rules, askingPrice),
      /*
       * 이 가격을 사려면 실제로 빌려야 하는 금액. 계산기 입력란의
       * 기본값이 된다 — 열자마자 보이는 숫자가 사용자가 실제로 필요한
       * 금액이어야 한다. 음수가 되지 않게 바닥을 깐다(현금이 남는 경우).
       */
      /*
       * 이 가격을 사려면 실제로 빌려야 하는 금액과, 그 대출에서의 부담.
       * **목록 행과 같은 함수**(`calcBurdenAt`)를 쓴다 — 두 화면이 같은
       * 집을 두고 다른 등급을 말할 수 없게 하는 자리다.
       */
      burden: calcBurdenAt(profile, rules, askingPrice),
    };
  }, [profile, askingPrice]);

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
        매물가격 — **이 화면에 가격 입력란은 이것 하나다**(사용자 지시).
        예전에는 위쪽 계산이 `unit.maxPrice` 고정이고 호가 입력이 접힌
        `PriceCheck` 안에 따로 있어, 한 화면이 두 가격을 기준으로 말했다.

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
          label="매물가격"
          hint="단위를 안 쓰면 만원으로 읽어요. '12억3000'처럼 써도 돼요."
          value={askingPrice}
          onChange={setAskingPrice}
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
            : "매물가격을 넣으면 취득시 부대비용과 매달 나가는 돈을 계산해요."}
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
            <h3 className="detail-stat-label">매달 나가는 돈</h3>

            {/*
              **이 가격에 이 집을 샀을 때**의 등급. 아래 계산기가 내는
              등급과 **다른 질문에 답한다** — 이쪽은 "이 가격이면 이만큼
              빌려야 하고, 그게 감당되는가"이고, 아래쪽은 "내가 정한 그
              대출액이면 어떤가"다. 그래서 라벨을 각각 단다.

              ⚠ **지우면 안 되는 자리다.** 목록 행이 같은 함수
              (`calcBurdenAt` → `burdenGrade`)로 낸 등급을 이 화면에서도
              말해야 "목록은 확인 필요, 상세는 아무 말 없음"이 되지
              않는다. 특히 현금으로 다 살 수 있어 대출이 0원인 집에서는
              아래 계산기가 등급을 내지 않으므로, 이 배지가 없으면 등급이
              화면에서 통째로 사라진다.

              `showFigures={false}` — 금액·부담률은 아래 계산기가 낸다.
              여기서는 등급 글자와 그 등급이 왜 멈췄는지만 남긴다.
            */}
            <SafetyBadge
              safety={atPrice.burden.safety}
              label="이 가격에 샀을 때예요"
              landLeasehold={unit.landLeasehold}
              showFigures={false}
            />

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
              <p className="detail-max-loan">
                이 가격에 매수할 경우 최대 대출은
                <strong className="detail-max-loan-amount">
                  {formatWonRoundedToMan(atPrice.maxLoan.amount)}
                </strong>
                이에요.
              </p>
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
