import { useState } from "react";
import { formatWon, formatWonRoundedToMan } from "../format/won";
import type { LoanLimit } from "../lib/finance";
import { equalPrincipalSchedule, monthlyPayment } from "../lib/finance";
import { rules } from "../state/useAffordability";
import { MoneyInput } from "./MoneyInput";

/**
 * 금리 입력의 상한(%).
 *
 * **20%인 이유**: 이자제한법·대부업법이 정한 최고이자율이 연 20%다 —
 * 그보다 높은 금리는 이 나라에서 주택담보대출로 존재할 수 없으므로,
 * 그 위는 "가정"이 아니라 오타(4.53을 453으로 치는 것 같은)로 보는 편이
 * 맞다. 상한을 두지 않으면 그 오타가 조용히 월 상환액 수천만원짜리
 * 그럴듯한 표가 되어 나온다.
 *
 * 하한은 0이다. 음수 금리는 `equalPrincipalSchedule`이 예외로 막지만,
 * 화면에서는 예외를 던지기 전에 먼저 안내로 잡는다.
 */
export const MAX_RATE_PERCENT = 20;

const MONEY_HINT = "단위를 안 쓰면 만원으로 읽어요. '3억5000'처럼 써도 돼요.";

/** 상환방식. 기본은 원리금균등 — 계산기를 열기 전 이 카드가 이미 보여준 방식이다 */
type Method = "level" | "principal";

const METHOD_LABEL: Record<Method, string> = {
  level: "원리금균등",
  principal: "원금균등",
};

export interface LoanCalculatorProps {
  /**
   * 이 단지를 사는 데 실제로 필요한 대출액(원). 입력란의 기본값을
   * 여기서 만든다 — 계산기를 열자마자 보이는 숫자가 이 화면이 이미
   * 위에서 말한 것과 같아야 한다.
   */
  neededLoan: number;
  /**
   * 이 프로필·이 가격에서 **실제로 받을 수 있는** 최대 대출액
   * (`calcMaxLoan`). 입력 범위의 상한이자, 넘겼을 때 안내에 적는 값이다.
   */
  maxLoan: LoanLimit;
}

/**
 * 매달 나가는 돈을 **직접 가정해 보는** 계산기.
 *
 * 사용자 지시: "대출금액 및 금리는 한도액 내에 직접 입력할수 있도록 해서,
 * 원리금 균등 / 원금균등의 옵션으로 계산해서 확인할수 있게 해줘."
 *
 * ⚠ **이 계산은 이 카드 안에서 끝난다.** 위쪽 실구매 가능 가격도,
 * 사이드바 목록도, 지도 마커도 이 입력을 보지 않는다 — `PriceCheck`의
 * 호가 입력이 프로필에 저장되지 않는 것과 같은 성격이다. 여기는
 * "이 대출로 하면 얼마 나가지?"를 가정해 보는 자리이지 프로필을 바꾸는
 * 자리가 아니다. 그래서 `setField`도 `useProfileForm`도 건드리지 않는다.
 *
 * 단지를 갈아타면 호출부가 `key`로 이 컴포넌트를 다시 마운트해 입력을
 * 비운다(`ComplexDetail` 참고) — 다른 단지의 가정이 새 단지에 남아
 * 있으면 화면은 멀쩡한 숫자를 내는데 그 숫자가 통째로 다른 집에 대한
 * 것이 된다.
 *
 * **기간은 고정이다**(`rules.loanTermMonths`). 사용자 지시에 기간은
 * 없고, 기간까지 열면 이 카드가 대출 상품 시뮬레이터가 된다.
 *
 * **인쇄**: 입력란(`.loan-input-form`)은 종이에서 채울 수 없으므로
 * 지운다(`.price-check-form`과 같은 관행). 대신 결과 카드가 무엇을
 * 전제로 계산했는지 다시 적으므로 종이에서 잃는 정보가 없다.
 */
export function LoanCalculator({ neededLoan, maxLoan }: LoanCalculatorProps) {
  /*
   * 기본값은 `min(필요 대출액, 한도)`다. 이 단지가 이미 "확인 필요"·
   * "위험" 등급이면 필요 대출액이 한도를 넘을 수 있는데, 그때 한도 밖
   * 값을 기본으로 띄우면 계산기가 열리자마자 "계산하지 않았어요"만
   * 보여 준다 — 받을 수 있는 최대치에서 출발하는 편이 맞다.
   */
  const [amount, setAmount] = useState<number | null>(
    Math.min(neededLoan, maxLoan.amount),
  );
  /*
   * 금리는 **문자열로 들고 있는다.** 숫자로 들면 "4."·"4.0"처럼 아직
   * 다 치지 않은 상태를 표현할 수 없어, 소수점을 찍는 순간 입력란이
   * 튄다. 판정은 렌더할 때마다 이 문자열에서 다시 읽는다.
   */
  const [ratePercentText, setRatePercentText] = useState(
    () => String(+(rules.baseRate * 100).toFixed(2)),
  );
  const [method, setMethod] = useState<Method>("level");

  /*
   * 받을 수 있는 대출이 0원이면 입력 범위가 [0, 0]이라 계산기가 열려도
   * 넣을 수 있는 값이 없다. 빈 입력란을 띄우거나 "0원" 표를 내는 대신
   * **왜 계산할 것이 없는지**를 말한다 — 이 저장소가 맨숫자 0을 답으로
   * 쓰지 않는 것과 같은 규칙이다.
   */
  if (maxLoan.amount <= 0) {
    return (
      <div className="loan-calc-body">
        <p className="loan-calc-unavailable">
          지금 조건에서는 받을 수 있는 대출이 없어서 계산할 대출금액이
          없어요. 위쪽 소득·현금을 바꾸면 이 자리도 함께 바뀌어요.
        </p>
      </div>
    );
  }

  const ratePercent =
    ratePercentText.trim() === "" ? null : Number(ratePercentText);
  const rateValid =
    ratePercent !== null &&
    Number.isFinite(ratePercent) &&
    ratePercent >= 0 &&
    ratePercent <= MAX_RATE_PERCENT;

  const guidance = guidanceFor(amount, maxLoan.amount, rateValid);

  return (
    <div className="loan-calc-body">
      {/*
        입력란은 전부 이 폼 **안**에 모은다. 인쇄 숨김을 선택자 하나
        (`.loan-input-form`)로 걸기 때문이다 — 입력란 하나가 이 밖으로
        새면 종이에 누를 수 없는 장치가 남는다
        (`LoanCalculator.test.tsx`가 그 봉인을 검사한다).
      */}
      <form className="loan-input-form" onSubmit={(e) => e.preventDefault()}>
        <MoneyInput
          id="loan-calc-amount"
          label="대출금액"
          hint={MONEY_HINT}
          value={amount}
          onChange={setAmount}
        />
        <p className="hint">
          받을 수 있는 최대 대출액은 {formatWon(maxLoan.amount)}이에요.
        </p>

        <div className="loan-input-field">
          <label htmlFor="loan-calc-rate">금리 (연 %)</label>
          {/*
            네이티브 `<input type="number">`다 — SEED 컴포넌트를 새로
            끌어오지 않는다. `min`·`max`는 브라우저에게 주는 힌트일 뿐
            (직접 타이핑하면 그대로 들어온다) 실제 판정은 아래
            `rateValid`가 진다.
          */}
          <input
            id="loan-calc-rate"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            min={0}
            max={MAX_RATE_PERCENT}
            step={0.01}
            value={ratePercentText}
            onChange={(event) => setRatePercentText(event.target.value)}
          />
        </div>

        {/*
          상환방식은 네이티브 라디오다. 값이 둘뿐이고 서로 배타적이라
          라디오가 그대로 맞는 시맨틱이고, `<fieldset>`/`<legend>`가
          스크린리더에서 두 선택지를 하나의 질문으로 묶는다.
        */}
        <fieldset className="loan-input-method">
          <legend>상환방식</legend>
          {(["level", "principal"] as const).map((value) => (
            <label key={value} className="loan-input-method-option">
              <input
                type="radio"
                name="loan-input-method"
                value={value}
                checked={method === value}
                onChange={() => setMethod(value)}
              />
              {METHOD_LABEL[value]}
            </label>
          ))}
        </fieldset>
      </form>

      <LoanCalcResult
        amount={amount}
        ratePercent={ratePercent}
        method={method}
        guidance={guidance}
      />
    </div>
  );
}

/**
 * 계산하지 않은 이유. 계산할 수 있으면 `null`이다.
 *
 * **빈칸을 남기지 않는다.** 값이 범위 밖이면 표를 지우고 그 자리에 왜
 * 계산하지 않았는지를 적는다 — `PriceCheck`가 판정을 유보할 때 이유를
 * 함께 내는 것과 같은 규칙이고, 빈 자리는 언제나 "문제 없음"으로
 * 읽힌다.
 */
function guidanceFor(
  amount: number | null,
  maxAmount: number,
  rateValid: boolean,
): string | null {
  if (amount === null) {
    return "대출금액을 숫자로 넣어야 계산해요.";
  }
  if (amount === 0) {
    // 0원짜리 대출의 상환액은 정확히 0원이지만, 크게 박힌 0은 계산이
    // 안 된 것처럼도 읽히고 언제나 가장 낙관적으로 읽힌다.
    return "대출금액을 0원보다 크게 넣어야 계산해요.";
  }
  if (amount > maxAmount) {
    return `받을 수 있는 최대 대출액은 ${formatWon(maxAmount)}이라, 그보다 큰 금액으로는 계산하지 않았어요.`;
  }
  if (!rateValid) {
    return `금리는 0%부터 ${MAX_RATE_PERCENT}% 사이로 넣어야 계산해요.`;
  }
  return null;
}

/**
 * 결과 카드. **인쇄에서 그대로 남는 자리다**(`.loan-calc-result`는
 * `MUST_SURVIVE_PRINT_CLASSES`). 그래서 값만 내지 않고 무엇을 전제로
 * 계산했는지(`.loan-calc-basis`)와 이 숫자가 가정이라는 사실
 * (`.loan-calc-note`)을 함께 적는다 — 입력란이 지워진 종이에서 이 두
 * 줄이 없으면 표에 박힌 숫자가 확정된 값으로 읽힌다.
 */
function LoanCalcResult({
  amount,
  ratePercent,
  method,
  guidance,
}: {
  amount: number | null;
  ratePercent: number | null;
  method: Method;
  guidance: string | null;
}) {
  if (guidance !== null || amount === null || ratePercent === null) {
    return (
      <div className="loan-calc-result">
        <p className="loan-calc-guidance">{guidance}</p>
      </div>
    );
  }

  const annualRate = ratePercent / 100;
  const months = rules.loanTermMonths;

  return (
    <div className="loan-calc-result">
      <dl className="loan-calc-figures">
        {method === "level" ? (
          <Row
            field="monthlyPayment"
            label="매달 상환액"
            value={monthlyPayment(amount, annualRate, months)}
          />
        ) : (
          <EqualPrincipalRows
            amount={amount}
            annualRate={annualRate}
            months={months}
          />
        )}
      </dl>
      <p className="loan-calc-basis">
        대출 {formatWon(amount)} · {loanTermLabel(months)} · 연{" "}
        {/*
          조사는 "으로"로 고정한다 — 두 상환방식 이름이 모두 받침으로
          끝나는 "…균등"이라 "…균등으로"가 언제나 맞다("…균등로"는 틀린
          말이고, 브라우저로 확인하기 전까지 그대로 찍히고 있었다).
        */}
        {+ratePercent.toFixed(2)}% · {METHOD_LABEL[method]}으로 계산했어요.
      </p>
      <p className="loan-calc-note">
        이 계산은 가정이라 실제 상환액은 금융기관 심사·상품에 따라 달라져요.
      </p>
    </div>
  );
}

/**
 * 원금균등의 세 줄.
 *
 * **순서가 뜻을 진다.** 원금균등은 회차가 갈수록 상환액이 줄어드는
 * 방식이라 1회차가 가장 크고 마지막 회차가 가장 작다 — 두 줄이 서로
 * 바뀌면 사용자는 매달 나가는 돈이 늘어난다고 읽는다. 그 방향을
 * `LoanCalculator.test.tsx`와 `amortization.test.ts`가 각각 잠근다.
 */
function EqualPrincipalRows({
  amount,
  annualRate,
  months,
}: {
  amount: number;
  annualRate: number;
  months: number;
}) {
  const schedule = equalPrincipalSchedule(amount, annualRate, months);
  return (
    <>
      <Row
        field="firstPayment"
        label="1회차 상환액"
        value={schedule.firstPayment}
      />
      <Row
        field="lastPayment"
        label="마지막 회차 상환액"
        value={schedule.lastPayment}
      />
      <Row
        field="totalInterest"
        label="총 이자"
        value={schedule.totalInterest}
      />
    </>
  );
}

/**
 * 값 한 줄. **표시만 만원 단위로 반올림한다**
 * (`formatWonRoundedToMan` — 직전 태스크가 만든 것을 그대로 쓴다).
 * 위 두 큰 숫자와 같은 규칙이라 한 화면이 두 표기를 섞지 않는다.
 */
function Row({
  field,
  label,
  value,
}: {
  field: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-field={field}>{formatWonRoundedToMan(value)}</dd>
    </div>
  );
}

/**
 * 대출 기간 표기. `ComplexDetail`의 같은 이름 함수와 같은 규칙이다 —
 * 룰셋의 `loanTermMonths`에서 만들고, 12로 나누어떨어지지 않으면
 * 개월로 적는다(반올림해서 "30년"이라고 말해 버리면 화면이 계산에
 * 쓰이지 않은 값을 적게 된다).
 */
function loanTermLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}
