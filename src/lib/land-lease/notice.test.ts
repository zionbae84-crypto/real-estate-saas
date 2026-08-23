import { describe, expect, it } from "vitest";
import { landLeaseRules } from "../../state/landLeaseRules";
import { landLeaseNotice } from "./notice";

describe("토지임대부 표시 갈래", () => {
  it('"Y"는 토지임대부로 간다', () => {
    const notice = landLeaseNotice("Y", landLeaseRules);
    expect(notice?.state).toBe("yes");
    expect(notice?.badge).toBe(landLeaseRules.states.yes.badge);
  });

  it('"N"만 표시가 없다', () => {
    expect(landLeaseNotice("N", landLeaseRules)).toBeNull();
  });

  /**
   * 이 저장소에서 가장 중요한 한 줄이다. `null`(모름)이 `"N"`(아님)과
   * 같은 결과를 내면 화면은 "토지 소유권이 있는 집"이라는, 우리가
   * 확인한 적 없는 사실을 말하게 된다.
   */
  it('`null`(모름)은 "아님"으로 접히지 않는다', () => {
    const notice = landLeaseNotice(null, landLeaseRules);
    expect(notice).not.toBeNull();
    expect(notice?.state).toBe("unknown");
    expect(notice).not.toEqual(landLeaseNotice("N", landLeaseRules));
  });

  it("모름의 문구가 확인을 요구한다", () => {
    expect(landLeaseNotice(null, landLeaseRules)?.badge).toContain("확인이 필요해요");
  });

  it("문구가 코드가 아니라 룰셋에서 온다", () => {
    for (const value of ["Y", null] as const) {
      const notice = landLeaseNotice(value, landLeaseRules);
      expect(notice).not.toBeNull();
      const state = notice?.state;
      expect(state).toBeDefined();
      if (state === undefined) return;
      expect(notice?.monthlyNote).toBe(landLeaseRules.states[state].monthlyNote);
      expect(notice?.checkNote).toBe(landLeaseRules.states[state].checkNote);
    }
  });
});
