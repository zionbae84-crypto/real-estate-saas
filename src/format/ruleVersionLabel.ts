import type { Rules } from "../lib/finance";

/**
 * 화면 상단에 표시할 "몇 년 몇 월 규제 기준" 문구를 룰셋 자체에서 뽑아낸다.
 *
 * 예전에는 이 문구가 App.tsx에 리터럴로 박혀 있어("2026년 3월 규제 기준"),
 * rules/2026-03.json을 다른 버전으로 교체해도 화면 문구는 따라 바뀌지
 * 않았다 — 룰셋과 화면이 서로 다른 말을 하게 되는 사일런트 결함이었다.
 * `rules.effectiveFrom`(YYYY-MM-DD)에서 연·월만 뽑아 매번 다시 만든다.
 *
 * @throws RangeError effectiveFrom이 YYYY-MM-DD 형식이 아니면 던진다.
 */
export function formatRuleVersionLabel(
  rules: Pick<Rules, "effectiveFrom">,
): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(rules.effectiveFrom);
  if (!match) {
    throw new RangeError(
      `룰셋 effectiveFrom이 YYYY-MM-DD 형식이 아닙니다: "${rules.effectiveFrom}"`,
    );
  }
  const [, year, month] = match;

  return `${year}년 ${Number(month)}월 규제 기준`;
}
