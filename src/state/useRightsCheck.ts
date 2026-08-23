import { useCallback, useMemo, useState } from "react";
import rawRightsRules from "../../rules/rights-2026-08.json";
import {
  assessRights,
  parseRightsRules,
  type RightsAnswer,
  type RightsAnswers,
  type RightsAssessment,
  type RightsRules,
} from "../lib/rights";

/**
 * 번들에 포함된 권리분석 룰셋.
 * 빌드 타임에 들어오므로 네트워크 요청도 로딩 상태도 없다.
 */
export const rightsRules: RightsRules = parseRightsRules(rawRightsRules);

export interface RightsCheckState {
  rules: RightsRules;
  answers: RightsAnswers;
  /** 매매 예정가(원). 아직 모르면 null */
  price: number | null;
  setPrice: (won: number | null) => void;
  selectOption: (itemId: string, optionId: string) => void;
  setAmount: (itemId: string, won: number | null) => void;
  reset: () => void;
  assessment: RightsAssessment;
}

/**
 * 권리분석 문진의 답을 들고 판정을 낸다.
 *
 * **저장하지 않는다.** `useProfileForm`은 예산 입력을 localStorage에
 * 남기지만, 여기 담기는 것은 특정 집의 등기 상태와 매도인에 대한
 * 답이다 — 재무 정보보다 민감하고, 남의 기기·공용 브라우저에서 그대로
 * 되살아나면 안 된다. 새로고침하면 처음부터 다시 답한다. 그 불편이
 * 남는 편보다 낫다.
 */
export function useRightsCheck(): RightsCheckState {
  const [answers, setAnswers] = useState<RightsAnswers>({});
  const [price, setPrice] = useState<number | null>(null);

  /**
   * 선택지를 고르면 금액은 **언제나 비운다**.
   *
   * 예전 선택지에 넣어 둔 금액이 따라오면, "합계를 확인했어요"에
   * 3억을 넣었다가 "근저당권이 없어요"로 바꿨을 때 그 3억이 화면 밖에
   * 남아 다시 "확인했어요"로 돌아오는 순간 사용자가 다시 입력한 적
   * 없는 금액으로 계산이 돈다. 빈칸(=모름)에서 다시 시작하는 쪽이
   * 언제나 안전하다.
   */
  const selectOption = useCallback((itemId: string, optionId: string) => {
    setAnswers((current) => ({
      ...current,
      [itemId]: { optionId, amountWon: null },
    }));
  }, []);

  /** 금액만 바꾼다. 아직 선택지를 안 골랐으면 아무 일도 하지 않는다 */
  const setAmount = useCallback((itemId: string, won: number | null) => {
    setAnswers((current) => {
      const answer: RightsAnswer | undefined = current[itemId];
      if (answer === undefined) return current;
      return { ...current, [itemId]: { ...answer, amountWon: won } };
    });
  }, []);

  const reset = useCallback(() => {
    setAnswers({});
    setPrice(null);
  }, []);

  const assessment = useMemo(
    () => assessRights(rightsRules, answers, price),
    [answers, price],
  );

  return {
    rules: rightsRules,
    answers,
    price,
    setPrice,
    selectOption,
    setAmount,
    reset,
    assessment,
  };
}
