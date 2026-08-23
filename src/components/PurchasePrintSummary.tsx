import { formatWon } from "../format/won";
import type {
  GapInput,
  InvestmentType,
  PurchaseRules,
  RentalInput,
} from "../lib/purchase";
import { formatPrintDate, type PrintSummaryItem } from "./PrintSummary";

/**
 * 투자 경로(갭투자·월세 수익형)의 인쇄물 전용 요약이다. 실거주 경로의
 * {@link PrintSummary}와 정확히 같은 목적으로 만든 대응물이다.
 *
 * **왜 필요한가.** 값 입력란은 인쇄에서 지운다(`.purchase-form`) — 종이
 * 위에서는 채울 수 없기 때문이다. 그 대신 "무엇을 넣었는지는 결과가 다시
 * 적으므로 종이에서 잃는 정보가 없다"고 적어 두었는데, 실제로는 그렇지
 * 않았다. 갭투자는 전세가율 지표가 매매가·전세보증금을 다시 적어 살아
 * 남지만, **월세 수익형 인쇄물에는 매매 예정가·보증금·월세·연간
 * 운영비용이 한 번도 나오지 않았다.** 지표들이 순영업소득·비율만 적기
 * 때문이다. 종이를 건네받은 사람은 그 비율이 어떤 숫자에서 나왔는지 알
 * 방법이 없다.
 *
 * **인쇄일과 어느 룰셋 기준인지도 함께 남긴다.** 실거주 인쇄물에는 둘 다
 * 있는데 투자 인쇄물에는 없었다. 화면 부제에 남던 "2026년 8월 규제
 * 기준"은 **실거주 룰셋**(`rules/2026-08.json`)의 버전이라, 바로 그
 * 기준으로 한도를 계산하지 않는다고 말하는 이 화면 위에 붙으면 뜻이
 * 어긋난다 — App.tsx가 유형에 따라 그 부제를 가르고, 여기서는 이 화면이
 * 실제로 쓴 구매 유형 룰셋의 버전을 적는다.
 */

/** 값이 없으면 "입력 안 함"이다. **0원으로 적지 않는다** */
function moneyOrBlank(won: number | null): string {
  return won === null ? "입력 안 함" : formatWon(won);
}

/**
 * 이 종이가 어떤 입력 위에 서 있는지를 라벨·값 쌍으로 만든다.
 *
 * 라벨은 룰셋의 필드 문구를 그대로 쓴다 — 화면에서 사용자가 본 이름과
 * 종이에 적히는 이름이 달라지면 같은 값을 두 이름으로 부르게 된다.
 */
export function buildPurchasePrintItems(
  rules: PurchaseRules,
  type: InvestmentType,
  input: GapInput | RentalInput,
): PrintSummaryItem[] {
  if (type === "갭투자") {
    const fields = rules.types.갭투자.fields;
    const gap = input as GapInput;
    return [
      { label: fields.price.label, value: moneyOrBlank(gap.price) },
      { label: fields.deposit.label, value: moneyOrBlank(gap.deposit) },
      { label: fields.cash.label, value: moneyOrBlank(gap.cash) },
    ];
  }

  const rule = rules.types.월세수익형;
  const fields = rule.fields;
  const rental = input as RentalInput;
  const loan = rental.loan;

  const items: PrintSummaryItem[] = [
    { label: fields.price.label, value: moneyOrBlank(rental.price) },
    { label: fields.deposit.label, value: moneyOrBlank(rental.deposit) },
    { label: fields.cash.label, value: moneyOrBlank(rental.cash) },
    { label: fields.monthlyRent.label, value: moneyOrBlank(rental.monthlyRent) },
    {
      label: fields.annualOperatingCost.label,
      value: moneyOrBlank(rental.annualOperatingCost),
    },
    { label: rule.loanChoice.label, value: rule.loanChoice[loan.kind] },
  ];

  // 금액은 "금액을 알아요"를 골랐을 때만 적는다. 다른 답에서는 우리가
  // 받은 적 없는 값이라 "입력 안 함"조차 적을 자리가 아니다.
  if (loan.kind === "known") {
    items.push(
      { label: fields.loanPrincipal.label, value: moneyOrBlank(loan.principal) },
      {
        label: fields.annualDebtService.label,
        value: moneyOrBlank(loan.annualDebtService),
      },
      {
        label: fields.annualInterest.label,
        value: moneyOrBlank(loan.annualInterest),
      },
    );
  }

  return items;
}

export interface PurchasePrintSummaryProps {
  rules: PurchaseRules;
  type: InvestmentType;
  input: GapInput | RentalInput;
  /** 테스트에서 날짜를 고정하기 위한 훅. 기본은 실제 현재 시각. */
  now?: () => Date;
}

export function PurchasePrintSummary({
  rules,
  type,
  input,
  now = () => new Date(),
}: PurchasePrintSummaryProps) {
  const items = buildPurchasePrintItems(rules, type, input);

  return (
    <section className="purchase-print-summary">
      <p className="purchase-print-summary-meta">
        구매 유형 기준 {rules.version} · 인쇄일 {formatPrintDate(now())}
      </p>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
