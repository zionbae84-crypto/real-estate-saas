import {
  DEUNGI_PROBLEM_IDS,
  type DeungiCrossCheck,
  type DeungiProblem,
  type DeungiProblemId,
  type DeungiPurpose,
} from "./types";

/** 화면에 그대로 쓰는 한 쌍 */
export interface DeungiCopy {
  label: string;
  note: string;
}

export interface DeungiRules {
  version: string;
  effectiveFrom: string;
  title: string;
  subtitle: string;
  /** 결과와 늘 함께 나가야 하는 문구 */
  disclaimer: string[];
  purpose: Record<DeungiPurpose, DeungiCopy>;
  issuedAt: { known: string; unknown: string };
  totals: { mortgageLabel: string; leaseLabel: string; unknownValue: string };
  struck: DeungiCopy;
  problems: Record<DeungiProblemId, DeungiProblem>;
  crossCheck: Record<DeungiCrossCheck, DeungiCopy>;
  unreadItems: DeungiCopy;
}

const PURPOSES: readonly DeungiPurpose[] = ["read", "issued", "unknown"];
const CROSS_CHECKS: readonly DeungiCrossCheck[] = ["agreed", "mismatch", "unavailable"];

/**
 * 이 파서가 결과와 함께 반드시 말해야 하는 두 가지.
 *
 * 1. **위·변조를 우리가 가려낼 수 없다.** 이 PDF가 진짜 등기소 발급본인지
 *    알 방법이 없는데, 그 사실을 말하지 않으면 사용자는 우리가 문서를
 *    검증했다고 믿는다.
 * 2. **등기부는 언제든 바뀐다.** 언제 뗀 것인지가 결과만큼 중요하다.
 *
 * 문구 자체는 룰셋에서 오지만, 이 두 가지가 빠진 룰셋은 받지 않는다 —
 * 문구를 다듬다 통째로 사라지는 것이 실제로 일어나는 자리다.
 */
const DISCLAIMER_MUST_MENTION: readonly string[] = ["변조", "바뀌"];

/**
 * 등기부 파서의 문구 룰셋을 검증해 {@link DeungiRules}로 바꾼다.
 *
 * `src/lib/rights/rules.ts`와 같은 태도다 — 사람이 손으로 고치는
 * 데이터이므로 틀렸을 때 어디가 틀렸는지 말해 준다.
 */
export function parseDeungiRules(raw: unknown): DeungiRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");
  requireText(r, "title", "title");
  requireText(r, "subtitle", "subtitle");

  if (
    !Array.isArray(r.disclaimer) ||
    r.disclaimer.length === 0 ||
    !r.disclaimer.every((line) => isText(line))
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: disclaimer (한 줄 이상의 문자열이어야 해요)");
  }
  const disclaimer = (r.disclaimer as string[]).join(" ");
  for (const must of DISCLAIMER_MUST_MENTION) {
    if (!disclaimer.includes(must)) {
      throw new Error(`룰셋 값 오류: disclaimer에 "${must}"가 들어간 문장이 없어요. 위·변조를 가려낼 수 없다는 사실과 등기부가 언제든 바뀐다는 사실은 결과와 함께 나가야 해요.`);
    }
  }

  const purpose = plainObject(r.purpose, "purpose");
  for (const key of PURPOSES) requireCopy(purpose[key], `purpose.${key}`);

  const issuedAt = plainObject(r.issuedAt, "issuedAt");
  requireText(issuedAt, "known", "issuedAt.known");
  requireText(issuedAt, "unknown", "issuedAt.unknown");

  const totals = plainObject(r.totals, "totals");
  requireText(totals, "mortgageLabel", "totals.mortgageLabel");
  requireText(totals, "leaseLabel", "totals.leaseLabel");
  requireText(totals, "unknownValue", "totals.unknownValue");

  requireCopy(r.struck, "struck");
  requireCopy(r.unreadItems, "unreadItems");

  const crossCheckCopy = plainObject(r.crossCheck, "crossCheck");
  for (const key of CROSS_CHECKS) requireCopy(crossCheckCopy[key], `crossCheck.${key}`);

  const problems = plainObject(r.problems, "problems");
  for (const id of DEUNGI_PROBLEM_IDS) {
    const problem = plainObject(problems[id], `problems.${id}`);
    requireText(problem, "label", `problems.${id}.label`);
    requireText(problem, "note", `problems.${id}.note`);
    if (problem.severity !== "block" && problem.severity !== "warn") {
      throw new Error(`룰셋 값 오류: problems.${id}.severity는 block이나 warn이어야 해요 (${String(problem.severity)})`);
    }
  }

  return raw as DeungiRules;
}

/** 문제 id를 화면 문구가 붙은 문제로 바꾼다 */
export function problemOf(rules: DeungiRules, id: DeungiProblemId): DeungiProblem {
  const copy = rules.problems[id];
  return { id, label: copy.label, note: copy.note, severity: copy.severity };
}

function requireCopy(value: unknown, path: string): void {
  const copy = plainObject(value, path);
  requireText(copy, "label", `${path}.label`);
  requireText(copy, "note", `${path}.note`);
}

function isText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function requireText(container: Record<string, unknown>, key: string, path: string): void {
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
