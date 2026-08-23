import { describe, expect, it } from "vitest";
import {
  burdenGrade,
  burdenGradeLevel,
  burdenIsComplete,
  noLoanCaveat,
  plainGrade,
} from "./burden-grade";
import type { SafetyLevel } from "./finance";
import { landLeaseRules } from "../state/landLeaseRules";

const LEVELS: readonly SafetyLevel[] = ["safe", "caution", "danger"];
const INCOMPLETE: ReadonlyArray<"Y" | null> = ["Y", null];

describe("burdenIsComplete", () => {
  it('`"N"`일 때만 우리 숫자가 매달 나가는 돈을 다 담는다', () => {
    expect(burdenIsComplete("N")).toBe(true);
    expect(burdenIsComplete("Y")).toBe(false);
    // 모름을 "아님"으로 접지 않는다. 접으면 화면이 "토지 소유권이 있는
    // 집"이라는, 우리가 확인한 적 없는 사실 위에서 등급을 매긴다.
    expect(burdenIsComplete(null)).toBe(false);
  });
});

describe("burdenGradeLevel", () => {
  it.each(LEVELS)('`"N"`인 행의 %s 등급은 그대로다', (level) => {
    expect(burdenGradeLevel(level, "N")).toBe(level);
  });

  it.each(INCOMPLETE)("%s인 행은 safe로 읽히지 않는다", (landLeasehold) => {
    expect(burdenGradeLevel("safe", landLeasehold)).toBe("unverified");
  });

  /**
   * caution·danger는 이미 안심시키는 말이 아니다. 거기에 "확인 필요"를
   * 덧씌우면 오히려 경고가 약해진다 — 붙드는 것은 최상위 등급 하나다.
   */
  it.each(INCOMPLETE)("%s여도 caution·danger는 그대로 둔다", (landLeasehold) => {
    expect(burdenGradeLevel("caution", landLeasehold)).toBe("caution");
    expect(burdenGradeLevel("danger", landLeasehold)).toBe("danger");
  });
});

describe("burdenGrade", () => {
  it.each(LEVELS)('`"N"`인 행의 %s 문구가 예전 그대로다', (level) => {
    // 이번 변경 전 ComplexList.LEVEL_LABELS·SafetyBadge.LABELS가 쓰던
    // 이름이다. 토지임대부가 아닌 행은 글자 하나 달라지면 안 된다.
    const labels: Record<SafetyLevel, string> = {
      safe: "안전",
      caution: "주의",
      danger: "위험",
    };
    expect(burdenGrade(level, "N", landLeaseRules)).toEqual({
      level,
      label: labels[level],
      note: null,
      noLoanNote: null,
    });
  });

  it.each(INCOMPLETE)("%s인 행은 '안전'이라는 글자를 받지 못한다", (ll) => {
    const grade = burdenGrade("safe", ll, landLeaseRules);
    expect(grade.level).toBe("unverified");
    expect(grade.label).not.toContain("안전");
    expect(grade.label).toBe(landLeaseRules.grade.label);
  });

  it.each(INCOMPLETE)("%s인 행은 왜 멈췄는지를 함께 낸다", (ll) => {
    expect(burdenGrade("safe", ll, landLeaseRules).note).toBe(
      landLeaseRules.grade.note,
    );
  });

  it("등급이 내려가지 않아도 대출 0원 단서는 남는다", () => {
    // 소득이 0이면 부담률이 무한대가 돼 등급은 danger인데 대출은 0원일
    // 수 있다. 그때도 "매달 나가는 돈이 없다"는 오해는 똑같이 생긴다.
    expect(burdenGrade("danger", "Y", landLeaseRules).noLoanNote).toBe(
      landLeaseRules.grade.noLoanNote,
    );
  });

  it("문구가 코드가 아니라 룰셋에서 온다", () => {
    const grade = burdenGrade("safe", "Y", landLeaseRules);
    const swapped = burdenGrade("safe", "Y", {
      ...landLeaseRules,
      grade: { ...landLeaseRules.grade, label: "다른 이름", note: "다른 이유예요." },
    });
    expect(grade.label).not.toBe(swapped.label);
    expect(swapped.label).toBe("다른 이름");
    expect(swapped.note).toBe("다른 이유예요.");
  });
});

describe("noLoanCaveat", () => {
  it('`"N"`이면 붙일 단서가 없다', () => {
    expect(noLoanCaveat("N", landLeaseRules)).toBeNull();
  });

  it.each(INCOMPLETE)("%s이면 룰셋의 단서를 낸다", (ll) => {
    expect(noLoanCaveat(ll, landLeaseRules)).toBe(landLeaseRules.grade.noLoanNote);
  });
});

describe("plainGrade", () => {
  /**
   * 어떤 집도 가리키지 않는 배지(화면 위쪽 한도 배지)의 등급이다.
   * `"N"`을 넘긴 것과 결과는 같아야 한다 — 다른 것은 부르는 쪽이
   * "토지임대부가 아니다"라고 말한 적 없다는 사실뿐이다.
   */
  it.each(LEVELS)("%s 등급이 `\"N\"`을 넘긴 것과 같다", (level) => {
    expect(plainGrade(level)).toEqual(burdenGrade(level, "N", landLeaseRules));
  });
});
