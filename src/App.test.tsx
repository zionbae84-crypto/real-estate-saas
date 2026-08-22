import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { formatRuleVersionLabel } from "./format/ruleVersionLabel";
import { rules } from "./state/useAffordability";
import type * as UseAffordabilityModule from "./state/useAffordability";

// 룰셋의 effectiveFrom을 실제 값과 다르게 모의한다. App.tsx가 여전히
// "2026년 3월 규제 기준"을 리터럴로 박아 두고 있었다면 이 모의는 아무
// 효과가 없었을 것이다 — 아래 테스트는 화면 문구가 이 모의값을 그대로
// 따라간다는 사실로, 부제목이 실제로 rules.effectiveFrom에서 계산됨을
// 증명한다. (vi.mock은 파일 최상단에서 호출해야 정상적으로 호이스팅된다.)
vi.mock("./state/useAffordability", async () => {
  const actual =
    await vi.importActual<typeof UseAffordabilityModule>(
      "./state/useAffordability",
    );
  return {
    ...actual,
    rules: { ...actual.rules, effectiveFrom: "2027-11-05" },
  };
});

describe("App", () => {
  it("서비스 제목을 표시한다", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /내 예산으로 살 수 있는 집/ }),
    ).toBeInTheDocument();
  });

  // 예전에는 "2026년 3월 규제 기준"이 App.tsx에 리터럴로 박혀 있어,
  // rules/2026-03.json을 다른 버전으로 갈아 끼워도 화면 문구가 따라가지
  // 않았다. 이 파일에서는 위 vi.mock으로 effectiveFrom을 "2027-11-05"로
  // 바꿔 둔 상태이므로, formatRuleVersionLabel(rules)로 독립적으로 다시
  // 계산한 값("2027년 11월 규제 기준")과 화면에 실제로 렌더링된 문구를
  // 비교한다.
  it("부제목의 규제 기준 문구는 실제 룰셋(effectiveFrom)에서 계산된다", () => {
    render(<App />);
    const expectedLabel = formatRuleVersionLabel(rules);

    expect(expectedLabel).toBe("2027년 11월 규제 기준");
    expect(screen.getByText(new RegExp(expectedLabel))).toBeInTheDocument();
  });

  // 리터럴이었다면 이 테스트가 실패한다 — 화면은 여전히 원래 룰셋 파일의
  // "2026년 3월"을 보여줬을 것이다.
  it("원래 룰셋 파일의 문구가 아니라 모의된 값을 보여준다", () => {
    render(<App />);
    expect(
      screen.queryByText(/2026년 3월 규제 기준/),
    ).not.toBeInTheDocument();
  });
});
