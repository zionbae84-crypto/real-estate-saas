import { useLayoutEffect, useMemo } from "react";
import { AGGREGATION_WINDOW_LABEL } from "../data/complexes";
import type { ComplexUnit } from "../data/complexes";
import { formatWon } from "../format/won";
import { householdCountNoteFor } from "../lib/finance";
import { assessPrice } from "../lib/price";
import type {
  PriceAssessment,
  PriceBudgetInput,
  PriceFinding,
} from "../lib/price";
import { usePriceCheck } from "../state/usePriceCheck";
import { formatRange } from "./ComplexList";
import { LandLeaseNote } from "./LandLeaseNote";
import { MoneyInput } from "./MoneyInput";

const MONEY_HINT = "단위를 안 쓰면 만원으로 읽어요. '3억5000'처럼 써도 돼요.";

export interface PriceCheckProps {
  unit: ComplexUnit;
  /**
   * 실거주 예산. **`null`이면 예산 줄을 아예 만들지 않는다.**
   *
   * 실거주 프로필이 없을 때(예산 미입력이거나 투자 유형일 때) 실거주
   * 기준 숫자를 내면 안 된다 — `src/App.tsx`의 `residentialProfile`과
   * 같은 판단이고, 그 판단은 화면이 아니라 엔진에서 이뤄진다
   * (`assessPrice`가 이 값이 `null`이면 계산 자체를 하지 않는다).
   */
  budget: PriceBudgetInput | null;
  /**
   * 이 축의 최신 판정을 바깥에 알린다. 새로 계산하지 않고 이미 낸 값을
   * 올릴 뿐이다(`PurchaseCheck.onAssessment`와 같은 배선).
   *
   * ⚠ **지금 이 값을 받는 화면은 없다.** 받던 곳(진단 종합)이 지워졌고,
   * `ComplexDetail`도 더 이상 흘려보내지 않는다. 축을 다시 모으는 화면이
   * 붙는 날을 위한 자리로만 남아 있다.
   */
  onAssessment?: (assessment: PriceAssessment) => void;
  /**
   * 이 영역이 자기 제목을 그릴 것인가. 기본은 그린다.
   *
   * `false`를 주는 자리는 하나뿐이다: 단지 상세가 이 영역을
   * `<details>`로 접고 **같은 문구**(`rules.position.label`)를
   * `summary`에 적는 자리(design.md §6). 제목이 둘이 되면 인쇄에서
   * `<details>`가 강제로 펼쳐질 때 종이에 같은 제목이 연달아 두 번
   * 찍힌다.
   *
   * 섹션의 접근 가능한 이름(`aria-label="호가 위치 확인"`)은 그대로
   * 남으므로, 제목을 지워도 스크린리더에서 이 영역이 무엇인지 잃지
   * 않는다. `BindingExplainer.showTitle`과 같은 갈래의 prop이다.
   */
  showTitle?: boolean;
  /**
   * 호가를 **바깥이 정할 때** 그 값. 넘기면 이 컴포넌트는 자기 입력란을
   * 그리지 않고 이 값으로만 판정한다(`null`은 "아직 안 넣었다").
   *
   * 사용자 지시로 단지 상세의 가격 입력란을 하나로 합치면서 생긴
   * prop이다 — 한 화면에 가격 입력란이 둘 있으면 어느 쪽이 기준인지
   * 알 수 없고, 실제로 두 값이 갈리면 위쪽 부대비용과 아래쪽 호가 판정이
   * 서로 다른 가격을 말하게 된다.
   *
   * **넘기지 않으면(`undefined`) 예전 그대로** 자기 입력란과 자기 상태를
   * 쓴다. 두 모드가 있는 이유는 이 컴포넌트가 언젠가 다시 혼자 설 수 있기
   * 때문이고, 지금 실제로 쓰는 자리(`ComplexDetail`)는 언제나 넘긴다.
   */
  askingPrice?: number | null;
}

/**
 * 제시받은 호가가 이 평형의 최근 6개월 실거래 범위 어디에 있는가.
 *
 * **적정가를 말하지 않는다.** 이 화면에는 "이 집은 얼마가 적당해요"가
 * 없고, 앞으로 생기지도 않는다 — 특정 물건의 적정가를 단정하면
 * 감정평가법에 저촉될 위험이 있고, 이 앱이 `medianPrice`를 타입에서부터
 * 빼고 가격을 범위로만 말해 온 것도 같은 이유다. 그 사실을 입력란
 * **위에서 먼저** 말한다(`disclosure.noPointEstimateNote`) — 값을
 * 적고 나서야 "그건 안 알려줘요"라고 하면 이미 기대를 만든 뒤다.
 *
 * **가장 중요한 동작은 말하지 않는 것이다.** 번들 데이터의 절반은
 * 최근 6개월 거래가 한 건뿐이고 51.7%는 범위가 아예 한 점이라, 실제
 * 룰셋 값에서는 86.8%의 평형이 판정 유보가 된다. 그때 화면은 빈칸을
 * 남기는 대신 **왜 유보하는지**를 말한다.
 *
 * **등급은 언제나 글자다.** `data-verdict`는 색을 입히는 고리일 뿐이고,
 * 색이 하나도 적용되지 않아도(흑백 인쇄·색각 이상) 무엇이 "이대로는
 * 멈춰 주세요"이고 무엇이 "판정을 유보했어요"인지 읽을 수 있어야
 * 한다. `PurchaseVerdict`·`LocationFacts`와 같은 규칙이다.
 *
 * 입력란은 인쇄에서 지운다(`.price-check-form`) — 종이에서는 채울 수
 * 없다. 대신 결과가 호가와 근거(거래 건수·범위)를 다시 적으므로
 * 종이에서 잃는 정보가 없고, 층·향 고지와 신고 지연 고지는
 * `.price-disclosure`로 언제나 함께 남는다.
 */
export function PriceCheck({
  unit,
  budget,
  onAssessment,
  showTitle = true,
  askingPrice: controlledPrice,
}: PriceCheckProps) {
  /**
   * 바깥이 호가를 정하는가. prop이 **아예 없을 때만** 자기 입력란을
   * 쓴다 — `null`은 "바깥이 정하는데 아직 안 넣었다"는 뜻이라 여기서
   * 자기 상태로 되돌아가면 안 된다.
   */
  const controlled = controlledPrice !== undefined;
  // 평형이 바뀌면 이 컴포넌트는 통째로 다시 마운트된다(호출부의 key).
  // 그래도 근거 객체는 렌더마다 새로 만들지 않는다 — 훅의 useMemo가
  // 참조로 의존성을 보기 때문이다.
  const evidence = useMemo(
    () => ({
      tradeCount: unit.tradeCount,
      minPrice: unit.minPrice,
      maxPrice: unit.maxPrice,
      // 층은 고지 문장에만 쓰인다 — 판정도 가격도 이 값을 보지 않는다.
      minFloor: unit.minFloor,
      maxFloor: unit.maxFloor,
      unknownFloorCount: unit.unknownFloorCount,
    }),
    [unit],
  );

  const {
    rules,
    askingPrice: ownPrice,
    setAskingPrice,
    assessment: ownAssessment,
  } = usePriceCheck(evidence, budget);

  /*
   * 제어 모드에서는 훅이 낸 판정을 버리고 바깥 값으로 다시 낸다.
   * 훅을 조건부로 부를 수는 없으므로(리액트 훅 규칙) 언제나 부르되,
   * 이 자리에서 어느 쪽을 쓸지 고른다. `assessPrice`는 순수 함수라
   * 한 번 더 부르는 비용이 렌더 한 번의 산술뿐이다.
   */
  const assessment = controlled
    ? assessPrice(rules, evidence, controlledPrice ?? null, budget)
    : ownAssessment;
  const askingPrice = controlled ? (controlledPrice ?? null) : ownPrice;

  // useEffect가 아니라 useLayoutEffect다 — 페인트 **전에** 부모 상태를
  // 갱신해, 진단 종합이 한 프레임 늦은 판정을 보여주지 않게 한다. 평형이
  // 바뀌어 이 컴포넌트가 다시 마운트되면(호출부의 key) 새 평형의
  // 판정으로 곧바로 갱신된다.
  useLayoutEffect(() => {
    onAssessment?.(assessment);
  }, [assessment, onAssessment]);

  return (
    <section className="price-check" aria-label="호가 위치 확인">
      {showTitle && (
        <h3 className="price-check-title">{rules.position.label}</h3>
      )}

      {/*
        무엇을 말하지 않는 화면인지 먼저 밝힌다. 이 문단은 인쇄에서도
        남는다 — 종이를 건네받은 사람이 아래 판정을 "적정가 판정"으로
        읽으면 안 된다.
      */}
      <p className="price-no-estimate">
        {assessment.disclosure.noPointEstimateNote}
      </p>

      {/*
        토지임대부 표시는 입력란 **위**에 붙는다 — 값을 적기 전에
        알아야 하는 사실이기 때문이다. 토지임대부면 이 호가가 가리키는
        물건 자체가 다르고(땅을 사는 것이 아니다), 아래 예산 줄의 월
        상환액에도 토지 사용료가 들어 있지 않다. 적고 나서야 말하면
        이미 기대를 만든 뒤다 — 바로 위 `price-no-estimate`가 같은
        이유로 입력란 위에 있다.

        예산 줄(월 상환액이 실제로 찍히는 자리)이 아니라 여기에 두는
        이유: 그 줄은 호가를 넣어야 생기고(`assessPrice`는 호가가
        없으면 findings를 아예 만들지 않는다), 실거주 프로필이 없으면
        아예 만들어지지 않는다. 거기에만 붙이면 이 화면에서 표시가
        사라지는 경로가 둘 생긴다.
      */}
      <LandLeaseNote landLeasehold={unit.landLeasehold} variant="price" />

      {/*
        제어 모드에서는 입력란을 그리지 않는다 — 호가를 위쪽 매물가격
        입력란 하나가 정한다(사용자 지시). 대신 **무엇을 기준으로 판정한
        것인지**를 한 줄로 적는다: 이 영역은 접혀 있다가 펼쳐지므로,
        위 입력란이 화면 밖에 있을 때 판정만 보이면 어느 금액에 대한
        답인지 알 수 없다. 값이 아직 없으면 그 사실을 말한다.
      */}
      {controlled ? (
        <p className="price-check-basis">
          {askingPrice === null
            ? "위 매물가격을 넣으면 이 평형의 실거래 범위 어디쯤인지 짚어 드려요."
            : `위에 넣은 매물가격 ${formatWon(askingPrice)} 기준이에요.`}
        </p>
      ) : (
        <form className="price-check-form" onSubmit={(e) => e.preventDefault()}>
          <MoneyInput
            id="price-check-asking"
            label={rules.askingPrice.label}
            hint={rules.askingPrice.hint}
            value={askingPrice}
            onChange={setAskingPrice}
          />
          <p className="hint">{MONEY_HINT}</p>
        </form>
      )}

      <PriceVerdict assessment={assessment} unit={unit} budget={budget} />
    </section>
  );
}

/**
 * 판정 결과.
 *
 * 이 영역은 인쇄에서 **그대로 남는다.** 배우자·부모님·중개사에게
 * 건네지는 바로 그 종이다.
 */
function PriceVerdict({
  assessment,
  unit,
  budget,
}: {
  assessment: PriceAssessment;
  unit: ComplexUnit;
  /** 예산 줄의 부대비용 옆에 주택 수 고지를 붙이는 데 쓴다({@link FindingValues} 참고) */
  budget: PriceBudgetInput | null;
}) {
  return (
    <div className="price-verdict">
      <p className="price-overall" data-verdict={assessment.overall}>
        {assessment.overallLabel}
      </p>
      <p className="price-overall-note">{assessment.overallNote}</p>

      {/*
        이 판단이 몇 건에 근거하는지 숨기지 않는다. 판정 유보든 아니든
        같은 자리에 같은 방식으로 적는다 — 유보일 때만 건수를 보여주면
        건수가 "변명"처럼 읽히고, 판정이 났을 때는 근거가 사라진다.
      */}
      <dl className="price-evidence">
        <div>
          <dt>{AGGREGATION_WINDOW_LABEL} 거래</dt>
          <dd data-field="tradeCount">{assessment.evidence.tradeCount}건</dd>
        </div>
        <div>
          <dt>실거래 범위</dt>
          <dd data-field="range">
            {formatRange(assessment.evidence.minPrice, assessment.evidence.maxPrice)}
          </dd>
        </div>
        <div>
          <dt>평형</dt>
          <dd data-field="area">
            {unit.complexName} {unit.areaBucket}㎡
          </dd>
        </div>
      </dl>
      <p className="price-evidence-message">{assessment.evidenceMessage}</p>

      {assessment.findings.length > 0 && (
        <ol className="price-findings">
          {assessment.findings.map((finding) => (
            <li
              key={finding.id}
              className="price-finding"
              data-verdict={finding.verdict}
            >
              <p className="price-finding-head">
                <span className="price-finding-verdict">
                  {finding.verdictLabel}
                </span>
                <span className="price-finding-name">{finding.label}</span>
              </p>
              <FindingValues
                finding={finding}
                askingPrice={assessment.askingPrice}
                budget={budget}
              />
              {/*
                유보한 줄의 문구는 바로 위 근거 설명과 같은 문장이다
                (엔진이 "왜 유보하는가"를 두 자리에 같은 값으로 싣는다 —
                인쇄에서 어느 한쪽만 남아도 이유가 남게 하려는 것이다).
                화면에서는 같은 문장을 두 번 읽히게 하지 않는다.
              */}
              {finding.message !== assessment.evidenceMessage && (
                <p className="price-finding-message">{finding.message}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {/*
        예산 줄을 만들지 않았다는 사실. 빈칸으로 두면 "이 호가는 예산에
        문제가 없다"로 읽힌다 — 계산하지 않았다는 말과 문제가 없다는
        말은 다르다. 인쇄에서도 남는다.
      */}
      {assessment.budgetAbsentNote !== null && (
        <p className="price-budget-absent">{assessment.budgetAbsentNote}</p>
      )}

      {/*
        판정과 **언제나 함께** 나가는 고지. 유보든 통과든 예외가 없다.

        층 줄이 맨 앞이다. 예전에는 이 자리가 "우리 집계에는 층이 없어요"
        라는 사과였는데, 이제 집계가 층 범위를 함께 내보내므로 그 범위를
        만든 거래가 몇 층부터 몇 층까지였는지를 **사실로** 말한다 —
        사용자가 자기가 보는 매물의 층과 스스로 견줄 수 있게. 층을 모르면
        자리를 비우는 대신 모른다고 말한다(빈 자리는 "층은 문제없다"로
        읽힌다). 층으로 값을 보정해 주지는 않으며, 향·수리 상태는 여전히
        이 범위에 없다는 사실이 바로 다음 줄에 남는다.
      */}
      <ul className="price-disclosure">
        <li data-field="floorRange">{assessment.disclosure.floorRangeNote}</li>
        {assessment.disclosure.floorPartialUnknownNote !== null && (
          <li data-field="floorPartialUnknown">
            {assessment.disclosure.floorPartialUnknownNote}
          </li>
        )}
        <li>{assessment.disclosure.floorNote}</li>
        <li>{assessment.disclosure.reportingLagNote}</li>
        <li>{assessment.disclosure.notAVerdictNote}</li>
      </ul>

      <ul className="price-disclaimer">
        {assessment.disclaimer.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** 값 줄 하나. 값이 없으면 줄 자체를 만들지 않는다 */
function Row({
  label,
  value,
  field,
}: {
  label: string;
  value: string | null;
  field: string;
}) {
  if (value === null) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd data-field={field}>{value}</dd>
    </div>
  );
}

function won(value: number | null): string | null {
  return value === null ? null : formatWon(value);
}

function percent(value: number | null): string | null {
  return value === null ? null : `${(value * 100).toFixed(1)}%`;
}

/**
 * 줄마다 실제로 낸 값.
 *
 * **낼 수 없는 값은 자리를 비운다.** 표에 박힌 숫자는 옆의 설명보다
 * 먼저 읽히고, 0이나 0.0%는 언제나 가장 낙관적으로 읽힌다.
 * `PurchaseVerdict`와 같은 규칙이다.
 *
 * 위치 줄에서 내는 숫자는 호가와 **초과분**뿐이다 — 초과분은 관측된
 * 최고가와 호가의 차이일 뿐이고, 어떤 값이 적당한지에 대한 추정이
 * 아니다.
 *
 * **부대비용(`budgetCosts`) 바로 아래에는 주택 수 고지가 함께 나간다.**
 * `finding.costs`는 `calcAcquisitionCosts`가 낸 값인데, 그 함수는
 * 취득자의 주택 수를 읽지 않고 언제나 무주택 기준 세율로 계산한다
 * (`acquisition-cost.ts`의 `calcAcquisitionTax` 주석 참고).
 *
 * 화면이 주택 수를 **묻게 되면서** 그 고지가 둘로 갈렸다 — 무주택이라고
 * 답한 사람에게 "취득세가 더 나올 수 있어요"는 거짓이고, 거짓 경고는
 * 같은 자리의 진짜 경고까지 함께 닳게 만든다. 어느 쪽을 낼지는
 * `householdCountNoteFor`가 `budget.profile`을 보고 정한다 —
 * `CostBreakdown`이 쓰는 것과 **같은 함수**라 두 화면이 같은 사용자에게
 * 서로 다른 말을 할 수 없다.
 */
function FindingValues({
  finding,
  askingPrice,
  budget,
}: {
  finding: PriceFinding;
  askingPrice: number | null;
  budget: PriceBudgetInput | null;
}) {
  if (finding.id === "position") {
    return (
      <dl className="price-finding-values">
        <Row field="asking" label="제시받은 호가" value={won(askingPrice)} />
        <Row
          field="aboveMax"
          label="범위 위쪽보다 높은 정도"
          value={percent(finding.aboveMaxRatio)}
        />
      </dl>
    );
  }

  // 이 줄(finding.id === "budget")은 assessPrice가 budget !== null일
  // 때만 만든다(assess.ts의 budgetFinding 호출부 참고) — 그래서 여기
  // 도달했다면 budget은 항상 존재한다.
  const householdCountNote =
    budget === null
      ? undefined
      : householdCountNoteFor(budget.profile, budget.financeRules);

  return (
    <>
      <dl className="price-finding-values">
        <Row
          field="ownFunds"
          label="이 호가에 필요한 현금"
          value={won(finding.ownFunds)}
        />
        <Row
          field="budgetCosts"
          label="그중 부대비용"
          value={won(finding.costs.total)}
        />
        <Row field="availableCash" label="사용가능 현금 예산" value={won(finding.availableCash)} />
        <Row
          field="shortfall"
          label="모자란 금액"
          value={finding.shortfall === 0 ? null : formatWon(finding.shortfall)}
        />
        <Row field="neededLoan" label="필요 대출액" value={won(finding.neededLoan)} />
        {/*
          대출이 0원이면 월 상환액과 부담률 줄을 만들지 않는다. 현금만으로
          덮이는 가격이라 값 자체는 정확히 0이지만, "월 0원 · 부담률 0.0%"는
          계산이 안 된 것처럼도 읽히고 표에 박힌 0은 언제나 가장 낙관적으로
          읽힌다 — `ComplexList`가 같은 경우에 숫자 대신 "대출 없이 살 수
          있어요"라고 말하는 것과 같은 판단이다. 여기서는 바로 위
          "필요 대출액 0원"이 그 자리를 대신한다.
        */}
        <Row
          field="monthlyPayment"
          label="월 상환액"
          value={finding.neededLoan === 0 ? null : won(finding.monthlyPayment)}
        />
        <Row
          field="burdenRatio"
          label="부담률"
          value={finding.neededLoan === 0 ? null : percent(finding.burdenRatio)}
        />
      </dl>
      {householdCountNote !== undefined && (
        <p className="price-household-count-note">{householdCountNote}</p>
      )}
    </>
  );
}
