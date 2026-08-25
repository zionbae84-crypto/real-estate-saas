import { useCallback, useMemo, useState } from "react";
import rawPurchaseRules from "../../rules/purchase-2026-08.json";
import {
  assessPurchase,
  parsePurchaseRules,
  type GapInput,
  type InvestmentType,
  type PurchaseAssessment,
  type PurchaseRules,
  type RentalInput,
  type RentalLoanAnswer,
} from "../lib/purchase";
import { rules as financeRules } from "./useAffordability";

/**
 * 번들에 포함된 구매 유형 룰셋.
 * 빌드 타임에 들어오므로 네트워크 요청도 로딩 상태도 없다.
 */
export const purchaseRules: PurchaseRules = parsePurchaseRules(rawPurchaseRules);

export type GapMoneyField = keyof GapInput;
export type RentalMoneyField = "price" | "deposit" | "cash" | "monthlyRent" | "annualOperatingCost";
export type LoanMoneyField =
  | "principal"
  | "annualDebtService"
  | "annualInterest";

export interface PurchaseCheckState {
  rules: PurchaseRules;
  gapInput: GapInput;
  rentalInput: RentalInput;
  setGapField: (field: GapMoneyField, won: number | null) => void;
  setRentalField: (field: RentalMoneyField, won: number | null) => void;
  setLoanKind: (kind: RentalLoanAnswer["kind"]) => void;
  setLoanAmount: (field: LoanMoneyField, won: number | null) => void;
  assessment: PurchaseAssessment;
}

const EMPTY_GAP: GapInput = { price: null, deposit: null, cash: null };

/**
 * 대출 답의 처음 상태는 **모름**이다.
 *
 * "대출을 끼지 않아요"를 미리 골라 두면, 아무것도 답하지 않은 사람의
 * 화면에 이미 "갚을 원리금이 없다"는 답이 들어가 있게 된다. 그건 우리가
 * 확인한 적 없는 사실이다. 모름에서 시작하면 DSCR·RTI가 "아직 낼 수
 * 없어요"로 남고, 전체 결론도 "아직 다 채우지 않았어요"에 머문다.
 */
const EMPTY_RENTAL: RentalInput = {
  price: null,
  deposit: null,
  cash: null,
  monthlyRent: null,
  annualOperatingCost: null,
  loan: { kind: "unknown" },
};

/**
 * 구매 유형별 지표 입력을 들고 판정을 낸다.
 *
 * **저장하지 않는다.** `useProfileForm`은 예산 입력을 localStorage에
 * 남기지만, 여기 담기는 것은 특정 매물의 매매가·보증금·월세다 —
 * 권리분석 문진과 같은 이유로 남기지 않는다.
 *
 * **갭투자와 월세 수익형의 입력을 따로 들고 있다.** 같은 "보증금"이라도
 * 한쪽은 전세보증금이고 다른 쪽은 월세보증금이라 뜻이 다르다. 하나로
 * 합쳐 두면 유형을 바꿨을 때 앞 유형의 금액이 다른 뜻으로 되살아난다.
 */
export function usePurchaseCheck(type: InvestmentType): PurchaseCheckState {
  const [gapInput, setGapInput] = useState<GapInput>(EMPTY_GAP);
  const [rentalInput, setRentalInput] = useState<RentalInput>(EMPTY_RENTAL);

  const setGapField = useCallback((field: GapMoneyField, won: number | null) => {
    setGapInput((current) => ({ ...current, [field]: won }));
  }, []);

  const setRentalField = useCallback(
    (field: RentalMoneyField, won: number | null) => {
      setRentalInput((current) => ({ ...current, [field]: won }));
    },
    [],
  );

  /**
   * 대출 답을 바꾸면 금액은 **언제나 비운다**.
   *
   * "대출이 있고 금액을 알아요"에 원리금을 적었다가 "대출을 끼지
   * 않아요"로 바꾼 뒤 다시 돌아오면, 사용자가 다시 적은 적 없는 금액으로
   * DSCR이 돈다. 빈칸(=모름)에서 다시 시작하는 쪽이 언제나 안전하다 —
   * 사용자가 적은 적 없는 값으로 계산하느니, 계산하지 않는 편이 낫다.
   */
  const setLoanKind = useCallback((kind: RentalLoanAnswer["kind"]) => {
    setRentalInput((current) => ({
      ...current,
      loan:
        kind === "known"
          ? {
              kind,
              principal: null,
              annualDebtService: null,
              annualInterest: null,
            }
          : { kind },
    }));
  }, []);

  const setLoanAmount = useCallback(
    (field: LoanMoneyField, won: number | null) => {
      setRentalInput((current) => {
        if (current.loan.kind !== "known") return current;
        return { ...current, loan: { ...current.loan, [field]: won } };
      });
    },
    [],
  );

  const assessment = useMemo(
    () =>
      type === "갭투자"
        ? assessPurchase(purchaseRules, financeRules, {
            type,
            ...gapInput,
          })
        : assessPurchase(purchaseRules, financeRules, {
            type,
            ...rentalInput,
          }),
    [type, gapInput, rentalInput],
  );

  return {
    rules: purchaseRules,
    gapInput,
    rentalInput,
    setGapField,
    setRentalField,
    setLoanKind,
    setLoanAmount,
    assessment,
  };
}
