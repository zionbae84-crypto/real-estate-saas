import { useMemo } from "react";
import rawSummaryRules from "../../rules/summary-2026-08.json";
import {
  buildDiagnosisSummary,
  parseSummaryRules,
  type DiagnosisSummary,
  type DiagnosisSummaryInput,
  type SummaryRules,
} from "../lib/summary";

/**
 * 번들에 포함된 진단 종합 룰셋.
 * 빌드 타임에 들어오므로 네트워크 요청도 로딩 상태도 없다.
 */
export const summaryRules: SummaryRules = parseSummaryRules(rawSummaryRules);

export interface DiagnosisSummaryState {
  rules: SummaryRules;
  summary: DiagnosisSummary;
}

/**
 * 네 축이 이미 낸 판정(또는 아직 못 봤다는 `null`)을 받아 종합을 낸다.
 *
 * **여기서 새로 계산하지 않는다** — `buildDiagnosisSummary`가 각 엔진의
 * 산출물을 그대로 읽을 뿐이다. 이 훅이 하는 일은 그 함수를 룰셋과 함께
 * 부르고, 네 값이 바뀌지 않는 한 다시 계산하지 않는 것(`useMemo`)뿐이다.
 *
 * 인자를 객체 하나(`DiagnosisSummaryInput`)가 아니라 네 값으로 따로
 * 받는다 — 호출부(`App.tsx`)가 매 렌더마다 새 객체를 만들면 참조가
 * 매번 달라져 `useMemo`가 무력해진다. 네 축 각각의 참조가 실제로
 * 바뀔 때만(엔진이 새 판정을 낼 때만) 다시 계산한다.
 */
export function useDiagnosisSummary(
  rights: DiagnosisSummaryInput["rights"],
  purchase: DiagnosisSummaryInput["purchase"],
  price: DiagnosisSummaryInput["price"],
  location: DiagnosisSummaryInput["location"],
): DiagnosisSummaryState {
  const summary = useMemo(
    () => buildDiagnosisSummary(summaryRules, { rights, purchase, price, location }),
    [rights, purchase, price, location],
  );
  return { rules: summaryRules, summary };
}
