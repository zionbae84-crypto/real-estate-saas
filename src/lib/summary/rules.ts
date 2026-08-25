import { SUMMARY_AXIS_IDS, type SummaryRules } from "./types";

const HEADLINE_KEYS = ["stop", "unresolved", "expert", "clear"] as const;

/**
 * clear 헤드라인이 "안전하다"는 뜻이 아니라고 스스로 밝히는지 확인하는
 * 최소 조건.
 *
 * `scripts/claims-safety.ts`의 탐지기가 실제 문구 전체를 훑어 더 넓은
 * 그물로 확인하지만, 여기서도 구조적으로 한 번 더 막는다 — 이 필드
 * 하나가 이 제품에서 가장 미끄러지기 쉬운 자리(최선의 결론이 "안전"으로
 * 읽히는 것)이기 때문이다. `src/lib/location/rules.ts`의
 * `DISCLOSURE_MUST_MENTION`과 같은 패턴이다.
 */
const CLEAR_NOTE_MUST_MENTION = "뜻이 아니";

/**
 * 진단 종합 룰셋 JSON을 검증해 {@link SummaryRules}로 바꾼다.
 *
 * `src/lib/location/rules.ts`·`src/lib/price/rules.ts`와 같은 태도다.
 * 여기서 지키는 불변식:
 *
 * 1. **네 축(rights·purchase·price·location) 모두 `axes`와
 *    `notLooked`에 있어야 한다.** 하나라도 빠지면 그 축은 못 봤을 때
 *    화면에 그릴 문구가 없다 — 빠진 축이 조용히 사라지는 것이 이 파일이
 *    가장 막으려는 일이다.
 * 2. **헤드라인 네 값(stop·unresolved·expert·clear) 모두 있어야 한다.**
 * 3. **`clear` 헤드라인의 note는 "안전하다는 뜻이 아니다"류의 말을
 *    품어야 한다**({@link CLEAR_NOTE_MUST_MENTION}). 이 진단의 최선의
 *    결론조차 안전 보증이 아니라는 것이 부모 스펙의 핵심 규칙이다.
 */
export function parseSummaryRules(raw: unknown): SummaryRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");
  requireText(r, "title", "title");

  const axes = plainObject(r.axes, "axes");
  for (const id of SUMMARY_AXIS_IDS) {
    const copy = plainObject(axes[id], `axes.${id}`);
    requireText(copy, "label", `axes.${id}.label`);
  }

  const notLooked = plainObject(r.notLooked, "notLooked");
  for (const id of SUMMARY_AXIS_IDS) {
    const copy = plainObject(notLooked[id], `notLooked.${id}`);
    requireText(copy, "label", `notLooked.${id}.label`);
    requireText(copy, "note", `notLooked.${id}.note`);
  }

  const headline = plainObject(r.headline, "headline");
  for (const key of HEADLINE_KEYS) {
    const copy = plainObject(headline[key], `headline.${key}`);
    requireText(copy, "label", `headline.${key}.label`);
    requireText(copy, "note", `headline.${key}.note`);
  }

  const clearNote = String(headline.clear && (headline.clear as Record<string, unknown>).note);
  if (!clearNote.includes(CLEAR_NOTE_MUST_MENTION)) {
    throw new Error(
      `룰셋 값 오류: headline.clear.note에 "${CLEAR_NOTE_MUST_MENTION}"이(가) 없어요. 이 진단의 최선의 결론도 "안전하다"는 뜻이 아니라는 사실이 함께 읽혀야 해요 — 그 말이 빠지면 clear가 그대로 "안전 보증"으로 읽혀요.`,
    );
  }

  requireText(r, "expertPendingNote", "expertPendingNote");
  requireText(r, "targetMismatchNote", "targetMismatchNote");

  if (
    !Array.isArray(r.disclaimer) ||
    r.disclaimer.length === 0 ||
    !r.disclaimer.every((line) => isText(line))
  ) {
    throw new Error(
      "룰셋 필드 누락 또는 타입 오류: disclaimer (한 줄 이상의 문자열이어야 해요)",
    );
  }

  return raw as SummaryRules;
}

function isText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function requireText(
  container: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!isText(container[key])) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
}

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
  return value as Record<string, unknown>;
}
