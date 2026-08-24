import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import rawFinanceRules from "../rules/2026-08.json";
import { App } from "./App";
import { ComplexDetail } from "./components/ComplexDetail";
import { ComplexList } from "./components/ComplexList";
import { COMPLEX_UNITS, type ComplexUnit } from "./data/complexes";
import { buildComplexList, type ComplexListResult } from "./lib/complex-list";
import {
  calcAcquisitionCosts,
  calcBurdenAt,
  householdCountNoteFor,
  parseRules,
  type BuyerProfile,
} from "./lib/finance";
import { landLeaseRules } from "./state/landLeaseRules";

/**
 * 토지임대부(그리고 토지임대부인지 모르는) 평형이 **"안전"으로 읽히지
 * 않는다**는 것을 화면 단위로 잠근다.
 *
 * 이 파일이 지키는 것은 문구가 아니라 **판정**이다. 표시를 붙이는 것만
 * 으로는 부족하다는 것을 화면에서 확인했다 — 목록 행이 "대출 없이 살
 * 수 있어요"와 "안전"을 먼저 보여주고, 바로 아래에서 우리 스스로 그
 * 숫자가 불완전하다고 인정하고 있었다. 이 앱에서 가장 강한 안심 문구
 * 둘이, 그 말이 가장 틀리는 자리에 붙어 있었다는 뜻이다. 숫자와 등급은
 * 문구보다 먼저 읽힌다.
 *
 * `src/components/LandLeaseNote.test.tsx`가 "표시가 나오는가"를 본다면,
 * 이 파일은 "등급이 무엇이라고 말하는가"를 본다.
 */

const rules = parseRules(rawFinanceRules);

/** 번들 데이터에 실제로 들어 있는 토지임대부 평형들 */
const REAL_LAND_LEASE = COMPLEX_UNITS.filter((u) => u.landLeasehold === "Y");

/**
 * 모름(`null`) 평형은 지금 번들 데이터에 0건이다. 지역을 넓히면 반드시
 * 생기므로 실제 평형 하나를 그대로 베껴 `null`로만 바꿔 함께 검사한다 —
 * 모름을 "아님"으로 접는 것이 이 제품에서 가장 하면 안 되는 일이다.
 */
function unknownVariant(u: ComplexUnit): ComplexUnit {
  return { ...u, complexKey: `${u.complexKey}-unknown`, landLeasehold: null };
}

const SYNTHETIC_UNKNOWN = REAL_LAND_LEASE.map(unknownVariant);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 600_000_000,
    annualIncome: 300_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    isRegulatedArea: true,
    ...overrides,
  };
}

/**
 * 어떤 입력으로도 "안전"이 나오지 않는지 보려면 격자가 필요하다. 현금과
 * 소득을 넓게 흔든다 — 대출이 0원인 경우(현금이 아주 많은 프로필)도
 * 반드시 포함한다. 그쪽이 더 낙관적으로 읽히는 자리다.
 */
const PROFILES: BuyerProfile[] = [];
for (const cash of [
  400_000_000, 800_000_000, 1_400_000_000, 2_000_000_000, 5_000_000_000,
]) {
  for (const annualIncome of [80_000_000, 200_000_000, 600_000_000]) {
    for (const existingDebtAnnualPayment of [0, 20_000_000]) {
      PROFILES.push(
        profile({ cash, annualIncome, existingDebtAnnualPayment }),
      );
    }
  }
}

function build(units: readonly ComplexUnit[], p: BuyerProfile) {
  return buildComplexList({ units, profile: p, rules, regionCodes: [] });
}

/** 목록 전체를 자르지 않고 그린다 — 잘려서 검사가 공허해지지 않게 */
function renderList(result: ComplexListResult) {
  return render(
    <ComplexList
      result={result}
      dataAsOf="2026-08"
      hasRegionFilter={false}
      noRepaymentCapacity={false}
      visibleCount={result.withinSafe.length + result.unverified.length + result.beyondSafe.length + 1}
    />,
  );
}

/** 한 행에서 화면에 실제로 보이는 등급 글자 */
function levelTextOf(row: Element): string {
  return row.querySelector(".complex-level")?.textContent?.trim() ?? "";
}

describe("전제: 검사할 데이터가 실제로 있다", () => {
  it("번들에 토지임대부 평형이 있다", () => {
    expect(REAL_LAND_LEASE).toHaveLength(5);
  });

  it("합성한 모름 평형도 같은 수만큼 있다", () => {
    expect(SYNTHETIC_UNKNOWN).toHaveLength(5);
    expect(SYNTHETIC_UNKNOWN.every((u) => u.landLeasehold === null)).toBe(true);
  });

  it("번들 데이터에 모름이 아직 0건이다(합성이 필요한 이유)", () => {
    expect(COMPLEX_UNITS.filter((u) => u.landLeasehold === null)).toEqual([]);
  });
});

describe("토지임대부·모름 행은 어떤 입력으로도 '안전'으로 읽히지 않는다", () => {
  const units = [...REAL_LAND_LEASE, ...SYNTHETIC_UNKNOWN];

  it("안전 덩어리에 한 번도 들어가지 않는다", () => {
    let sawRow = false;
    let sawZeroLoan = false;

    for (const p of PROFILES) {
      const result = build(units, p);
      expect(result.withinSafe, JSON.stringify(p)).toEqual([]);
      for (const entry of result.unverified) {
        sawRow = true;
        if (entry.burden.neededLoan === 0) sawZeroLoan = true;
      }
    }

    // 격자가 실제로 그 행들을 한 번은 통과시켰는지 확인한다 — 아니면
    // 위 검사가 "아무것도 안 나왔다"로 공허하게 통과한다.
    expect(sawRow).toBe(true);
    expect(sawZeroLoan).toBe(true);
  });

  it("우리 계산으로는 safe였을 행이 실제로 있다(전제)", () => {
    // 이 검사가 없으면 위 검사는 "원래 다 주의였다"로도 통과한다.
    const flooredFromSafe = PROFILES.flatMap((p) =>
      build(units, p).unverified.filter(
        (e) => e.burden.safety.level === "safe",
      ),
    );
    expect(flooredFromSafe.length).toBeGreaterThan(0);
  });

  it("화면 어느 행에도 '안전' 글자가 붙지 않는다", () => {
    for (const p of PROFILES) {
      const result = build(units, p);
      const { container, unmount } = renderList(result);
      const rows = [...container.querySelectorAll(".complex-row")];
      for (const row of rows) {
        expect(levelTextOf(row), row.textContent ?? "").not.toBe("안전");
      }
      for (const el of container.querySelectorAll(".complex-burden")) {
        expect(el.getAttribute("data-level")).not.toBe("safe");
      }
      unmount();
    }
  });
});

describe('`"N"`인 행은 이번 변경 전과 정확히 같다', () => {
  const CONTROL: Record<string, string> = {
    safe: "안전",
    caution: "주의",
    danger: "위험",
  };

  const units = COMPLEX_UNITS.filter((u) => u.landLeasehold === "N");

  it("검사할 행이 실제로 있다(전제)", () => {
    expect(units.length).toBeGreaterThan(1000);
  });

  /**
   * 이번 변경 전의 덩어리 분기는 `entry.burden.safety.level === "safe"`
   * 하나였다. `"N"`인 행에서는 그 규칙이 글자 그대로 살아 있어야 한다.
   */
  it("덩어리 분기가 예전 규칙과 글자 그대로 같다", () => {
    for (const p of PROFILES.slice(0, 6)) {
      const result = build(units, p);
      expect(result.unverified).toEqual([]);
      for (const e of result.withinSafe) {
        expect(e.burden.safety.level).toBe("safe");
      }
      for (const e of result.beyondSafe) {
        expect(e.burden.safety.level).not.toBe("safe");
      }
    }
  });

  it("등급 글자와 색 고리가 예전 그대로다", () => {
    const result = build(units, profile({ cash: 900_000_000 }));
    const { container } = renderList(result);
    const rows = [...container.querySelectorAll(".complex-row")];
    expect(rows.length).toBeGreaterThan(0);

    const byKey = new Map(
      [...result.withinSafe, ...result.beyondSafe].map((e) => [
        `${e.unit.complexKey}|${e.unit.areaBucket}`,
        e,
      ]),
    );
    const entries = [...byKey.values()];
    expect(entries.length).toBeGreaterThanOrEqual(rows.length);

    const levels = [...container.querySelectorAll(".complex-burden")].map((el) =>
      el.getAttribute("data-level"),
    );
    expect(levels.every((l) => l === "safe" || l === "caution" || l === "danger")).toBe(
      true,
    );
    for (const row of rows) {
      expect(Object.values(CONTROL)).toContain(levelTextOf(row));
    }
  });

  it("등급을 붙드는 문구가 하나도 붙지 않는다", () => {
    const { container } = renderList(build(units, profile({ cash: 900_000_000 })));
    expect(container.querySelector(".complex-grade-note")).toBeNull();
    expect(container.querySelector(".complex-no-loan-caveat")).toBeNull();
    expect(container.textContent ?? "").not.toContain(landLeaseRules.grade.note);
    expect(container.textContent ?? "").not.toContain(
      landLeaseRules.grade.groupHeading,
    );
  });
});

describe("덩어리 헤더와 행 등급이 어긋나지 않는다", () => {
  /**
   * 이 저장소는 이 모순을 이미 한 번 고쳤다 — "무리 없이 살 수 있어요"
   * 덩어리 안에 "주의" 배지가 달린 행이 들어가, 덩어리 헤더가 그 행의
   * 배지보다 낙관적으로 말했다. 덩어리가 셋이 된 뒤에도 같은 불변식이
   * 지켜져야 한다.
   */
  const EXPECTED: Record<string, string> = {
    "무리 없이 살 수 있어요": "안전",
    [landLeaseRules.grade.groupHeading]: landLeaseRules.grade.label,
  };

  it("각 덩어리의 모든 행이 그 덩어리가 말한 등급을 단다", () => {
    // 세 덩어리가 한 화면에 함께 뜨는 조합이어야 검사가 의미 있다:
    // 값싼 평형(안전) + 비싼 평형(부담) + 토지임대부·모름(확인 필요).
    const units = [
      ...COMPLEX_UNITS.filter((u) => u.landLeasehold === "N").slice(0, 300),
      ...REAL_LAND_LEASE,
      ...SYNTHETIC_UNKNOWN,
    ];
    let sawUnverifiedGroup = false;
    let sawSafeGroup = false;

    // 토지임대부 평형이 실구매 가능해야 그 덩어리가 뜬다(11억~15억).
    for (const p of PROFILES.filter((x) => x.cash >= 1_400_000_000)) {
      const { container, unmount } = renderList(build(units, p));
      for (const heading of container.querySelectorAll(".complex-group")) {
        const text = heading.textContent ?? "";
        const list = heading.nextElementSibling;
        expect(list?.className).toBe("complex-rows");
        const rows = [...(list?.querySelectorAll(".complex-row") ?? [])];
        expect(rows.length).toBeGreaterThan(0);

        if (text === landLeaseRules.grade.groupHeading) sawUnverifiedGroup = true;
        if (text === "무리 없이 살 수 있어요") sawSafeGroup = true;

        const expected = EXPECTED[text];
        for (const row of rows) {
          if (expected === undefined) {
            // "살 수는 있지만 부담이 커요" — 안전으로도, 확인 필요로도
            // 읽히면 안 된다(이 덩어리는 우리가 다 잰 행들이다).
            expect(levelTextOf(row)).not.toBe("안전");
            expect(levelTextOf(row)).not.toBe(landLeaseRules.grade.label);
          } else {
            expect(levelTextOf(row), text).toBe(expected);
          }
        }
      }
      unmount();
    }

    expect(sawSafeGroup).toBe(true);
    expect(sawUnverifiedGroup).toBe(true);
  });

  it('토지임대부 행이 "부담이 커요" 덩어리로 새지 않는다', () => {
    // 우리는 부담이 크다는 것을 모른다. 아는 것은 다 재지 못했다는 것뿐이다.
    for (const p of PROFILES) {
      const result = build([...REAL_LAND_LEASE, ...SYNTHETIC_UNKNOWN], p);
      for (const e of result.beyondSafe) {
        expect(e.burden.safety.level, JSON.stringify(p)).not.toBe("safe");
      }
    }
  });
});

describe("대출 0원 + 토지임대부", () => {
  const unit = REAL_LAND_LEASE[0];

  function zeroLoanEntry(u: ComplexUnit) {
    // 현금이 가격과 부대비용을 다 덮는 프로필
    const p = profile({ cash: 5_000_000_000 });
    return { profile: p, burden: calcBurdenAt(p, rules, u.maxPrice) };
  }

  it("전제: 이 프로필에서 대출이 실제로 0원이다", () => {
    expect(unit).toBeDefined();
    if (unit === undefined) return;
    expect(zeroLoanEntry(unit).burden.neededLoan).toBe(0);
  });

  it('"대출 없이 살 수 있어요"를 지우지 않는다', () => {
    if (unit === undefined) return;
    const result = build([unit], zeroLoanEntry(unit).profile);
    const { container } = renderList(result);
    expect(container.textContent ?? "").toContain("대출 없이 살 수 있어요");
  });

  it('"매달 나가는 돈이 없다"로 읽히지 않는다', () => {
    if (unit === undefined) return;
    const result = build([unit], zeroLoanEntry(unit).profile);
    const { container } = renderList(result);

    // 단서가 같은 자리에 있다 — 화면 아래 각주가 아니라 그 말 안이다.
    const line = container.querySelector(".complex-no-loan");
    expect(line?.textContent).toContain("대출 없이 살 수 있어요");
    expect(line?.textContent).toContain(landLeaseRules.grade.noLoanNote);
    // 색으로 "안전"을 되돌려 주지 않는다.
    expect(line?.getAttribute("data-complete")).toBe("false");
  });

  it('`"N"`인 행에서는 단서가 붙지 않는다', () => {
    const plain = COMPLEX_UNITS.find(
      (u) => u.landLeasehold === "N" && u.maxPrice < 500_000_000,
    );
    expect(plain).toBeDefined();
    if (plain === undefined) return;
    const result = build([plain], profile({ cash: 5_000_000_000 }));
    const { container } = renderList(result);
    const line = container.querySelector(".complex-no-loan");
    expect(line?.textContent?.trim()).toBe("대출 없이 살 수 있어요");
    expect(line?.getAttribute("data-complete")).toBe("true");
  });
});

describe("목록과 상세가 같은 판단을 보여 준다", () => {
  const p = profile({ cash: 2_000_000_000, annualIncome: 400_000_000 });

  function detailOf(u: ComplexUnit) {
    const rowProfile = { ...p, exclusiveAreaSqm: u.maxExclusiveAreaSqm };
    return render(
      <ComplexDetail
        unit={u}
        burden={calcBurdenAt(rowProfile, rules, u.maxPrice)}
        costs={calcAcquisitionCosts(u.maxPrice, rowProfile, rules)}
        householdCountNote={householdCountNoteFor(rowProfile, rules)}
        priceBudget={{ profile: rowProfile, financeRules: rules }}
        onClose={() => undefined}
      />,
    );
  }

  it.each(
    [...REAL_LAND_LEASE, ...SYNTHETIC_UNKNOWN].map(
      (u) => [`${u.complexKey}|${u.areaBucket}`, u] as const,
    ),
  )(
    "%s의 목록 등급과 상세 등급이 같다",
    (_key, u) => {
      const result = build([u], p);
      const list = renderList(result);
      const rows = [...list.container.querySelectorAll(".complex-row")];
      expect(rows).toHaveLength(1);
      const rowLevel = levelTextOf(rows[0] as Element);

      const detail = detailOf(u);
      const badgeLevel = detail.container
        .querySelector(".safety-level")
        ?.textContent?.trim();

      expect(rowLevel).toBe(badgeLevel);
      expect(rowLevel).not.toBe("안전");

      list.unmount();
      detail.unmount();
    },
  );

  it("상세도 왜 멈췄는지를 등급 글자 바로 아래에서 말한다", () => {
    const u = REAL_LAND_LEASE[0];
    expect(u).toBeDefined();
    if (u === undefined) return;
    const { container } = detailOf(u);
    const level = container.querySelector(".safety-level");
    const note = container.querySelector(".safety-grade-note");
    expect(note?.textContent).toBe(landLeaseRules.grade.note);
    expect(level?.nextElementSibling).toBe(note);
  });
});

describe("판정을 바꾸는 근거 문구가 룰셋에서 온다", () => {
  const u = REAL_LAND_LEASE[0];

  it("등급 이름·이유·덩어리 헤더가 모두 룰셋 값 그대로다", () => {
    expect(u).toBeDefined();
    if (u === undefined) return;
    const result = build([u], profile({ cash: 1_600_000_000 }));
    const { container } = renderList(result);
    const text = container.textContent ?? "";

    expect(text).toContain(landLeaseRules.grade.groupHeading);
    expect(text).toContain(landLeaseRules.grade.label);
    expect(text).toContain(landLeaseRules.grade.note);
  });

  it("룰셋 문구가 '사면 안 돼요'라고 말하지 않는다", () => {
    // 토지임대부는 불법도 사기도 아니다. 우리가 말할 수 있는 것은
    // 우리 숫자가 부족하다는 것뿐이다.
    const shown = [
      landLeaseRules.grade.label,
      landLeaseRules.grade.note,
      landLeaseRules.grade.noLoanNote,
      landLeaseRules.grade.groupHeading,
    ];
    for (const value of shown) {
      expect(value).not.toMatch(/사면 안 |사지 마|위험해요/);
    }
  });
});

/**
 * 화면 전체를 열어 본다. 단지 상세는 배지가 둘, 토지임대부 표시가
 * 둘 뜨는 자리라, 같은 경고가 몇 번 나오는지는 컴포넌트를 따로
 * 그려서는 드러나지 않는다.
 */
describe("실제 화면에서 같은 경고가 두 번 뜨지 않는다", () => {
  beforeEach(() => window.localStorage.clear());

  async function openLandLeaseDetail() {
    render(<App />);
    // 16억 현금 · 2억 소득이면 토지임대부 평형이 목록에 뜬다.
    await userEvent.type(screen.getByLabelText("보유 현금"), "160000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "20000");
    await userEvent.click(screen.getByLabelText("무주택"));
    const row = screen
      .getAllByRole("button")
      .find((b) => /토지임대부아파트/.test(b.textContent ?? ""));
    expect(row).toBeDefined();
    if (row !== undefined) await userEvent.click(row);
  }

  it("두 배지가 같은 등급을 말하되 이유는 한 번만 적는다", async () => {
    await openLandLeaseDetail();

    const levels = [...document.querySelectorAll(".safety-level")].map(
      (n) => n.textContent?.trim(),
    );
    expect(levels.length).toBe(2);
    expect(levels).toEqual([landLeaseRules.grade.label, landLeaseRules.grade.label]);

    const notes = [...document.querySelectorAll(".safety-grade-note")].map(
      (n) => n.textContent,
    );
    expect(notes).toEqual([landLeaseRules.grade.note]);
  });

  it("어디서 확인하라는 줄도 한 번만 나온다", async () => {
    await openLandLeaseDetail();
    const checks = [...document.querySelectorAll(".land-lease-check")];
    expect(checks).toHaveLength(1);
    // 표시 자체는 둘 다 남는다 — 줄인 것은 중복된 문장 하나뿐이다.
    expect(document.querySelectorAll(".land-lease-note")).toHaveLength(2);
  });
});
