import { describe, expect, it } from "vitest";
import rawDeungiRules from "../../../rules/deungi-2026-08.json";
import { safetyClaimsIn } from "../../../scripts/claims-safety";
import { parseDeungiRules, problemOf } from "./rules";
import { DEUNGI_PROBLEM_IDS } from "./types";

/**
 * 파서 문구 룰셋을 검증한다.
 *
 * 여기서 지키는 불변식은 값의 범위가 아니라 **이 제품이 반드시 해야 하는
 * 말**이다 — 위·변조를 가려낼 수 없다는 것, 등기부는 언제든 바뀐다는 것.
 * 그리고 어떤 문구도 "안전하다"고 말하지 않는다는 것.
 */

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(rawDeungiRules)) as Record<string, unknown>;
}

/** 룰셋 안의 사용자 문구를 전부 모은다(밑줄로 시작하는 키는 내부 메모다) */
function texts(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((entry, i) => texts(entry, `${path}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      key.startsWith("_") ? [] : texts(entry, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe("등기부 파서 룰셋", () => {
  it("실제 룰셋 파일을 그대로 받는다", () => {
    const rules = parseDeungiRules(rawDeungiRules);
    expect(rules.version).toBe("deungi-2026-08");
    expect(rules.disclaimer.length).toBeGreaterThan(0);
  });

  it("문제 id마다 화면 문구가 있다", () => {
    const rules = parseDeungiRules(rawDeungiRules);
    for (const id of DEUNGI_PROBLEM_IDS) {
      const problem = problemOf(rules, id);
      expect(problem.id).toBe(id);
      expect(problem.label.length).toBeGreaterThan(0);
      expect(problem.note.length).toBeGreaterThan(0);
    }
  });

  it("검사할 문구를 실제로 찾는다(전제)", () => {
    expect(texts(rawDeungiRules).length).toBeGreaterThan(30);
  });

  it("어떤 문구도 안전하다고 말하지 않는다", () => {
    const offenders = texts(rawDeungiRules).flatMap(([path, text]) =>
      safetyClaimsIn(text).map((claim) => `${path}: ${claim}`),
    );
    expect(offenders).toEqual([]);
  });

  describe("빠지면 안 되는 것", () => {
    it("위·변조를 가려낼 수 없다는 말이 없으면 받지 않는다", () => {
      const broken = clone();
      broken.disclaimer = ["등기부는 언제든 바뀌어요."];
      expect(() => parseDeungiRules(broken)).toThrow(/변조/u);
    });

    it("등기부가 바뀐다는 말이 없으면 받지 않는다", () => {
      const broken = clone();
      broken.disclaimer = ["위조나 변조를 확인하는 기능이 아니에요."];
      expect(() => parseDeungiRules(broken)).toThrow(/바뀌/u);
    });

    it("문제 문구가 하나라도 빠지면 받지 않는다", () => {
      const broken = clone();
      const problems = broken.problems as Record<string, unknown>;
      delete problems.crossCheckMismatch;
      expect(() => parseDeungiRules(broken)).toThrow(/problems.crossCheckMismatch/u);
    });

    it("모르는 severity는 받지 않는다", () => {
      const broken = clone();
      const problems = broken.problems as Record<string, Record<string, unknown>>;
      const mismatch = problems.crossCheckMismatch;
      if (mismatch !== undefined) mismatch.severity = "info";
      expect(() => parseDeungiRules(broken)).toThrow(/severity/u);
    });

    it("면책 문구가 비면 받지 않는다", () => {
      const broken = clone();
      broken.disclaimer = [];
      expect(() => parseDeungiRules(broken)).toThrow(/disclaimer/u);
    });

    it("열람용·발급용 문구가 빠지면 받지 않는다", () => {
      const broken = clone();
      const purpose = broken.purpose as Record<string, unknown>;
      delete purpose.read;
      expect(() => parseDeungiRules(broken)).toThrow(/purpose.read/u);
    });
  });
});
