import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LoanLimit } from "../lib/finance";
import { equalPrincipalSchedule, monthlyPayment } from "../lib/finance";
import { formatWonRoundedToMan } from "../format/won";
import { rules } from "../state/useAffordability";
import { LoanCalculator, MAX_RATE_PERCENT } from "./LoanCalculator";

function maxLoan(amount: number): LoanLimit {
  return {
    amount,
    binding: "LTV",
    breakdown: { LTV: amount, DSR: amount, CAP: amount, POLICY: 0 },
  };
}

function renderCalc(
  props: { neededLoan?: number; maxLoanAmount?: number } = {},
) {
  return render(
    <LoanCalculator
      neededLoan={props.neededLoan ?? 200_000_000}
      maxLoan={maxLoan(props.maxLoanAmount ?? 300_000_000)}
    />,
  );
}

/** 대출금액 입력란(MoneyInput)에 값을 새로 넣는다 */
function typeAmount(text: string) {
  const input = screen.getByLabelText(/대출금액/);
  fireEvent.change(input, { target: { value: text } });
}

function typeRate(text: string) {
  const input = screen.getByLabelText(/금리/);
  fireEvent.change(input, { target: { value: text } });
}

function chooseEqualPrincipal() {
  fireEvent.click(screen.getByLabelText("원금균등"));
}

function resultText(container: HTMLElement): string {
  return container.querySelector(".loan-calc-result")?.textContent ?? "";
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 매달 나가는 돈 계산기
 * ══════════════════════════════════════════════════════════════════
 *
 * 사용자 지시: "대출금액 및 금리는 한도액 내에 직접 입력할수 있도록 해서,
 * 원리금 균등 / 원금균등의 옵션으로 계산해서 확인할수 있게 해줘."
 *
 * 이 화면이 지켜야 하는 것 셋.
 *
 * 1. **한도 밖 값으로는 계산하지 않는다.** 빈칸을 남기는 대신 왜
 *    계산하지 않았는지 말한다 — `PriceCheck`가 "판정 유보"를 이유와 함께
 *    내는 것과 같은 규칙이다.
 * 2. **입력은 이 카드 안에서 끝난다.** 프로필도 위쪽 실구매 가능 가격도
 *    건드리지 않는다(`PriceCheck`의 호가 입력과 같은 성격).
 * 3. **인쇄에서는 입력란이 사라지고 결과만 남는다.** 그래서 결과 카드가
 *    무엇을 전제로 계산했는지(대출금액·기간·금리·상환방식)를 다시 적어야
 *    종이에서 잃는 정보가 없다(`.price-check-form`의 관행).
 */
describe("LoanCalculator", () => {
  it("기본 대출금액은 이 단지에 실제로 필요한 대출액이다", () => {
    const { container } = renderCalc({
      neededLoan: 128_000_000,
      maxLoanAmount: 300_000_000,
    });
    expect(resultText(container)).toMatch(/1억 2,800만원/);
  });

  it("필요 대출액이 한도를 넘으면 한도로 깎아서 시작한다", () => {
    // 이 단지가 이미 "확인 필요"·"위험" 등급일 수 있다 — 그때도 계산기는
    // 받을 수 있는 최대치에서 출발해야 한다.
    const { container } = renderCalc({
      neededLoan: 400_000_000,
      maxLoanAmount: 250_000_000,
    });
    expect(resultText(container)).toMatch(/2억 5,000만원/);
  });

  it("기본 금리는 룰셋의 기준금리다", () => {
    renderCalc();
    expect((screen.getByLabelText(/금리/) as HTMLInputElement).value).toBe(
      String(+(rules.baseRate * 100).toFixed(2)),
    );
  });

  it("기본 상환방식은 원리금균등이다 — 계산기를 열기 전 숫자와 같은 방식이다", () => {
    renderCalc();
    expect((screen.getByLabelText("원리금균등") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText("원금균등") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  describe("원리금균등", () => {
    it("매달 상환액 한 줄을 낸다", () => {
      const { container } = renderCalc({
        neededLoan: 200_000_000,
        maxLoanAmount: 300_000_000,
      });
      const expected = formatWonRoundedToMan(
        monthlyPayment(200_000_000, rules.baseRate, rules.loanTermMonths),
      );
      const result = resultText(container);
      expect(result).toMatch(/매달 상환액/);
      expect(result).toContain(expected);
      // 원금균등에서만 나오는 줄은 없다.
      expect(result).not.toMatch(/1회차/);
      expect(result).not.toMatch(/총 이자/);
    });
  });

  describe("원금균등", () => {
    it("1회차·마지막 회차·총 이자 세 줄을 낸다", () => {
      const { container } = renderCalc({
        neededLoan: 200_000_000,
        maxLoanAmount: 300_000_000,
      });
      chooseEqualPrincipal();

      const schedule = equalPrincipalSchedule(
        200_000_000,
        rules.baseRate,
        rules.loanTermMonths,
      );
      const result = resultText(container);
      expect(result).toMatch(/1회차 상환액/);
      expect(result).toMatch(/마지막 회차 상환액/);
      expect(result).toMatch(/총 이자/);
      expect(result).toContain(formatWonRoundedToMan(schedule.firstPayment));
      expect(result).toContain(formatWonRoundedToMan(schedule.lastPayment));
      expect(result).toContain(formatWonRoundedToMan(schedule.totalInterest));
    });

    /**
     * **방향이 틀리면 공식이 틀린 것이다.** 원금균등은 회차가 갈수록
     * 상환액이 줄어드는 방식이라, 화면에서도 1회차가 마지막 회차보다
     * 커야 한다. 두 줄이 서로 바뀌어 붙는 실수를 여기서 잡는다.
     */
    it("1회차가 마지막 회차보다 크다", () => {
      const { container } = renderCalc({
        neededLoan: 200_000_000,
        maxLoanAmount: 300_000_000,
      });
      chooseEqualPrincipal();

      const first = container.querySelector('[data-field="firstPayment"]');
      const last = container.querySelector('[data-field="lastPayment"]');
      const schedule = equalPrincipalSchedule(
        200_000_000,
        rules.baseRate,
        rules.loanTermMonths,
      );
      expect(first?.textContent).toBe(
        formatWonRoundedToMan(schedule.firstPayment),
      );
      expect(last?.textContent).toBe(
        formatWonRoundedToMan(schedule.lastPayment),
      );
      expect(schedule.firstPayment).toBeGreaterThan(schedule.lastPayment);
    });

    it("상환방식을 바꾸면 결과가 실제로 바뀐다", () => {
      const { container } = renderCalc({
        neededLoan: 200_000_000,
        maxLoanAmount: 300_000_000,
      });
      const level = resultText(container);
      chooseEqualPrincipal();
      expect(resultText(container)).not.toBe(level);
    });
  });

  describe("한도 밖·읽을 수 없는 값 — 계산하지 않고 이유를 말한다", () => {
    it("한도를 넘는 대출금액에는 계산 대신 안내를 낸다", () => {
      const { container } = renderCalc({
        neededLoan: 100_000_000,
        maxLoanAmount: 200_000_000,
      });
      typeAmount("30000"); // 3억 — 한도 2억을 넘는다

      const guidance = container.querySelector(".loan-calc-guidance");
      expect(guidance?.textContent).toMatch(/2억원/);
      expect(container.querySelector(".loan-calc-figures")).toBeNull();
    });

    it("숫자로 읽을 수 없으면 계산하지 않는다", () => {
      const { container } = renderCalc();
      typeAmount("얼마쯤");
      expect(container.querySelector(".loan-calc-guidance")).not.toBeNull();
      expect(container.querySelector(".loan-calc-figures")).toBeNull();
    });

    it("대출금액이 0이면 0원을 크게 찍는 대신 안내를 낸다", () => {
      // 이 저장소의 규칙: 맨숫자 0은 답의 모양을 한 거짓말이다.
      const { container } = renderCalc();
      typeAmount("0");
      expect(container.querySelector(".loan-calc-figures")).toBeNull();
      expect(container.querySelector(".loan-calc-guidance")).not.toBeNull();
    });

    it("한도와 정확히 같은 금액은 계산한다 — 경계는 포함이다", () => {
      const { container } = renderCalc({
        neededLoan: 100_000_000,
        maxLoanAmount: 200_000_000,
      });
      typeAmount("20000"); // 정확히 2억
      expect(container.querySelector(".loan-calc-guidance")).toBeNull();
      expect(resultText(container)).toContain(
        formatWonRoundedToMan(
          monthlyPayment(200_000_000, rules.baseRate, rules.loanTermMonths),
        ),
      );
    });

    it("금리가 상한을 넘으면 계산하지 않는다", () => {
      const { container } = renderCalc();
      typeRate(String(MAX_RATE_PERCENT + 0.01));
      expect(container.querySelector(".loan-calc-figures")).toBeNull();
      expect(container.querySelector(".loan-calc-guidance")?.textContent).toMatch(
        new RegExp(String(MAX_RATE_PERCENT)),
      );
    });

    it("금리가 음수면 계산하지 않는다", () => {
      const { container } = renderCalc();
      typeRate("-1");
      expect(container.querySelector(".loan-calc-figures")).toBeNull();
    });

    it("금리 0%는 계산한다 — 경계는 포함이다", () => {
      const { container } = renderCalc({
        neededLoan: 120_000_000,
        maxLoanAmount: 300_000_000,
      });
      typeRate("0");
      expect(container.querySelector(".loan-calc-guidance")).toBeNull();
      expect(resultText(container)).toContain(
        formatWonRoundedToMan(120_000_000 / rules.loanTermMonths),
      );
    });

    it("받을 수 있는 대출이 0원이면 입력란 대신 그 사실을 말한다", () => {
      const { container } = renderCalc({
        neededLoan: 200_000_000,
        maxLoanAmount: 0,
      });
      expect(container.querySelector(".loan-calc-unavailable")).not.toBeNull();
      expect(container.querySelector(".loan-input-form")).toBeNull();
      // 0원을 크게 찍지 않는다.
      expect(container.querySelector(".loan-calc-figures")).toBeNull();
    });
  });

  describe("인쇄에서 잃는 정보가 없다", () => {
    /**
     * 입력란은 `.loan-input-form`으로 인쇄에서 지운다(종이에서는 채울 수
     * 없다). 그러면 결과 카드가 **무엇을 전제로 계산했는지**를 스스로
     * 다시 적어야 한다 — `.price-check-form`을 지우면서 판정이 호가와
     * 근거를 다시 적게 한 것과 같은 관행이다.
     */
    it("결과 카드가 대출금액·기간·금리·상환방식을 다시 적는다", () => {
      const { container } = renderCalc({
        neededLoan: 150_000_000,
        maxLoanAmount: 300_000_000,
      });
      chooseEqualPrincipal();
      const basis = container.querySelector(".loan-calc-basis")?.textContent ?? "";
      expect(basis).toMatch(/1억 5,000만원/);
      expect(basis).toMatch(new RegExp(`${rules.loanTermMonths / 12}년`));
      expect(basis).toMatch(new RegExp(`연 ${+(rules.baseRate * 100).toFixed(2)}%`));
      // 조사까지 본다. 브라우저로 확인하기 전까지 "원금균등로 계산했어요"가
      // 그대로 찍히고 있었다 — 두 이름 모두 받침으로 끝나므로 "으로"다.
      expect(basis).toMatch(/원금균등으로 계산했어요/);
    });

    it("원리금균등에서도 조사가 맞다", () => {
      const { container } = renderCalc();
      expect(
        container.querySelector(".loan-calc-basis")?.textContent,
      ).toMatch(/원리금균등으로 계산했어요/);
    });

    it("이 계산이 가정이라는 사실을 한 줄로 남긴다", () => {
      const { container } = renderCalc();
      const note = container.querySelector(".loan-calc-note")?.textContent ?? "";
      expect(note).toMatch(/가정/);
    });

    it("입력란은 인쇄에서 지우는 폼 안에 모여 있다", () => {
      // 인쇄 숨김은 선택자 하나(`.loan-input-form`)로 건다 — 입력란이
      // 그 밖으로 새면 종이에 누를 수 없는 장치가 남는다.
      const { container } = renderCalc();
      const form = container.querySelector(".loan-input-form");
      expect(form).not.toBeNull();
      for (const input of container.querySelectorAll("input")) {
        expect(
          form?.contains(input),
          `${input.id || input.value} 입력란이 .loan-input-form 밖에 있습니다.`,
        ).toBe(true);
      }
    });

    it("결과 카드는 그 폼 밖에 있다 — 종이에 남아야 한다", () => {
      const { container } = renderCalc();
      const form = container.querySelector(".loan-input-form");
      const result = container.querySelector(".loan-calc-result");
      expect(result).not.toBeNull();
      expect(form?.contains(result!)).toBe(false);
    });
  });
});
