import { useLayoutEffect } from "react";
import type {
  InvestmentType,
  PurchaseAssessment,
  RentalLoanAnswer,
  RentalTypeRule,
} from "../lib/purchase";
import { usePurchaseCheck } from "../state/usePurchaseCheck";
import { MoneyInput } from "./MoneyInput";
import { PurchasePrintSummary } from "./PurchasePrintSummary";
import { PurchaseVerdict } from "./PurchaseVerdict";

const MONEY_HINT = "단위를 안 쓰면 만원으로 읽어요. '3억5000'처럼 써도 돼요.";

const LOAN_KINDS: ReadonlyArray<RentalLoanAnswer["kind"]> = [
  "none",
  "known",
  "unknown",
];

export interface PurchaseCheckProps {
  type: InvestmentType;
  /**
   * 이 축의 최신 판정을 바깥에 알린다. 새로 계산하지 않고 이미 낸 값을
   * 올릴 뿐이다(`PriceCheck.onAssessment`와 같은 배선).
   *
   * ⚠ **지금 이 값을 받는 화면은 없다** — 이 컴포넌트 자체가 수익형과
   * 함께 도달 불가 상태로 남아 있다(일부러 지우지 않았다).
   */
  onAssessment?: (assessment: PurchaseAssessment) => void;
}

/**
 * 갭투자·월세 수익형의 입력과 결과.
 *
 * **여기서 대출 한도를 계산하지 않는다.** `rules/2026-08.json`의
 * LTV·DSR·절대상한은 전부 실거주 매수를 전제한 값이고, 임대사업자대출·
 * 다주택자 LTV는 그 룰셋에 없다. 그래서 화면 맨 위에서 먼저 그 사실을
 * 말한다(룰셋의 `loanLimitNote`) — 이 문구는 이 화면에서 가장 중요한
 * 문장이라 인쇄에서도 지우지 않는다. 실거주 예산 계산은 이 컴포넌트가
 * 열려 있는 동안 아예 렌더되지도, 계산되지도 않는다(App.tsx 참고).
 *
 * 값 입력란은 인쇄에서 지운다(`.purchase-form`). 종이에서는 채울 수
 * 없다 — 대신 `PurchasePrintSummary`가 무엇을 넣었는지를 인쇄물 전용
 * 요약으로 다시 적는다. 예전에는 "결과가 다시 적으므로 잃는 정보가
 * 없다"고 적어 두었지만 실제로는 그렇지 않았다: 갭투자는 전세가율
 * 지표가 매매가·전세보증금을 다시 적어 살아남지만, 월세 수익형
 * 인쇄물에는 매매 예정가·보증금·월세·연간 운영비용이 한 번도 나오지
 * 않았다. 인쇄일과 어느 룰셋 기준인지도 같은 자리에서 남긴다.
 */
export function PurchaseCheck({ type, onAssessment }: PurchaseCheckProps) {
  const {
    rules,
    gapInput,
    rentalInput,
    setGapField,
    setRentalField,
    setLoanKind,
    setLoanAmount,
    assessment,
  } = usePurchaseCheck(type);

  // useEffect가 아니라 useLayoutEffect다 — 페인트 **전에** 부모 상태를
  // 갱신해, 진단 종합이 한 프레임 늦은 판정을 보여주지 않게 한다.
  // (`PriceCheck`·`LocationFacts`도 같은 배선이다.)
  useLayoutEffect(() => {
    onAssessment?.(assessment);
  }, [assessment, onAssessment]);

  const typeRule = type === "갭투자" ? rules.types.갭투자 : rules.types.월세수익형;

  return (
    <section className="purchase-check" aria-label={`${typeRule.label} 재무 지표`}>
      {/*
        이 문단은 인쇄에서 살아남는다. "모른다"는 말이 이 화면의 결론
        절반이라, 종이에서 사라지면 아래 지표들만 남아 한도가 없는 것처럼
        읽힌다.
      */}
      <p className="purchase-loan-note">{typeRule.loanLimitNote}</p>

      <form className="purchase-form" onSubmit={(e) => e.preventDefault()}>
        {type === "갭투자" ? (
          <>
            <MoneyInput
              id="purchase-gap-price"
              label={rules.types.갭투자.fields.price.label}
              hint={rules.types.갭투자.fields.price.hint}
              value={gapInput.price}
              onChange={(won) => setGapField("price", won)}
            />
            <MoneyInput
              id="purchase-gap-deposit"
              label={rules.types.갭투자.fields.deposit.label}
              hint={rules.types.갭투자.fields.deposit.hint}
              value={gapInput.deposit}
              onChange={(won) => setGapField("deposit", won)}
            />
            <MoneyInput
              id="purchase-gap-cash"
              label={rules.types.갭투자.fields.cash.label}
              hint={rules.types.갭투자.fields.cash.hint}
              value={gapInput.cash}
              onChange={(won) => setGapField("cash", won)}
            />
          </>
        ) : (
          <>
            {(["price", "deposit", "cash", "monthlyRent", "annualOperatingCost"] as const).map(
              (field) => (
                <MoneyInput
                  key={field}
                  id={`purchase-rental-${field}`}
                  label={rules.types.월세수익형.fields[field].label}
                  hint={rules.types.월세수익형.fields[field].hint}
                  value={rentalInput[field]}
                  onChange={(won) => setRentalField(field, won)}
                />
              ),
            )}
            <LoanFields
              rule={rules.types.월세수익형}
              loan={rentalInput.loan}
              onKindChange={setLoanKind}
              onAmountChange={setLoanAmount}
            />
          </>
        )}
        <p className="hint">{MONEY_HINT}</p>
      </form>

      {/*
        화면에서는 숨고 인쇄에서만 나온다(styles.css의
        .purchase-print-summary). 실거주 경로의 PrintSummary와 같은
        패턴이다 — 조작 장치(입력란)는 종이에서 지우고, 그 장치가 담고
        있던 값은 평문으로 남긴다.
      */}
      <PurchasePrintSummary
        rules={rules}
        type={type}
        input={type === "갭투자" ? gapInput : rentalInput}
      />

      <PurchaseVerdict assessment={assessment} />
    </section>
  );
}

/**
 * 대출을 끼는지 묻는 자리.
 *
 * **"대출을 끼지 않아요"와 "금액을 모르겠어요"를 갈라 둔다.** 하나로
 * 합치면 모름이 0원으로 둔갑해 DSCR·RTI가 "갚을 게 없다"는 가장
 * 낙관적인 모습이 된다. 권리분석 문진이 "없어요"와 "모르겠어요"를
 * 가르는 것과 같은 이유다.
 *
 * 금액 입력란은 "금액을 알아요"를 고른 순간에만 나온다. 늘 띄워 두면
 * 다른 답을 고른 사람도 거기 0을 적을 수 있게 되는데, 그 0은 "확인한
 * 0원"과 구별되지 않는다.
 */
function LoanFields({
  rule,
  loan,
  onKindChange,
  onAmountChange,
}: {
  rule: RentalTypeRule;
  loan: RentalLoanAnswer;
  onKindChange: (kind: RentalLoanAnswer["kind"]) => void;
  onAmountChange: (
    field: "principal" | "annualDebtService" | "annualInterest",
    won: number | null,
  ) => void;
}) {
  return (
    <fieldset className="purchase-loan">
      <legend className="purchase-loan-question">{rule.loanChoice.label}</legend>
      <div className="purchase-loan-options">
        {LOAN_KINDS.map((kind) => (
          <label className="purchase-loan-option" key={kind}>
            <input
              type="radio"
              name="purchase-loan-kind"
              value={kind}
              checked={loan.kind === kind}
              onChange={() => onKindChange(kind)}
            />
            <span className="purchase-loan-option-label">
              {rule.loanChoice[kind]}
            </span>
          </label>
        ))}
      </div>

      {loan.kind === "known" && (
        <>
          {/*
            대출 원금을 **따로 묻는다.** 아래 두 값(연간 원리금·이자)에서
            원금을 역산할 수 없기 때문이다 — 금리와 기간을 모르면 그 둘로는
            원금이 나오지 않는다. 원금이 비어 있으면 필요 자기자금을 아예
            내지 않는다(0으로 두면 대출이 없는 것으로 계산된다).
          */}
          <MoneyInput
            id="purchase-rental-loanPrincipal"
            label={rule.fields.loanPrincipal.label}
            hint={rule.fields.loanPrincipal.hint}
            value={loan.principal}
            onChange={(won) => onAmountChange("principal", won)}
          />
          <MoneyInput
            id="purchase-rental-annualDebtService"
            label={rule.fields.annualDebtService.label}
            hint={rule.fields.annualDebtService.hint}
            value={loan.annualDebtService}
            onChange={(won) => onAmountChange("annualDebtService", won)}
          />
          <MoneyInput
            id="purchase-rental-annualInterest"
            label={rule.fields.annualInterest.label}
            hint={rule.fields.annualInterest.hint}
            value={loan.annualInterest}
            onChange={(won) => onAmountChange("annualInterest", won)}
          />
        </>
      )}
    </fieldset>
  );
}
