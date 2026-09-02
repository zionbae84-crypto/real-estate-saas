import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rawFinanceRules from "../rules/2026-08.json";
import { App } from "./App";
import { ComplexDetail } from "./components/ComplexDetail";
import { ComplexList } from "./components/ComplexList";
import { COMPLEX_UNITS, type ComplexUnit } from "./data/complexes";
import { buildComplexList, type ComplexListResult } from "./lib/complex-list";
import * as regionQuery from "./lib/regionQuery";
import {
  calcAcquisitionCosts,
  calcBurdenAt,
  calcMaxLoan,
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

  /**
   * 상세를 열고 **예상 매수금액까지 명시적으로 넣는다.**
   *
   * 사용자 지시로 이 화면의 계산이 `unit.maxPrice` 고정에서 사용자가
   * 넣는 예상 매수금액 기준으로 바뀌었다. 이 칸은 이제 그 평형의
   * 실거래 범위 위쪽(`unit.maxPrice`)으로 채워진 채 시작하므로 사실
   * 아무것도 안 넣어도 목록과 같은 가격이지만, 이 테스트가 검사하는
   * 것은 "목록과 상세가 같은 가격에서 같은 등급을 말하는가"이므로 그
   * 가격을 명시적으로 넣는 형태를 유지한다.
   */
  async function detailOf(u: ComplexUnit) {
    // App.tsx의 `effectiveProfile`과 **같은 규칙**으로 만든다 — 이 평형의
    // 실제 전용면적을 반영한 프로필이라야 85㎡ 임계값(농특세)을 낙관
    // 방향으로 넘기지 않는다.
    const rowProfile = { ...p, exclusiveAreaSqm: u.maxExclusiveAreaSqm };
    const rendered = render(
      <ComplexDetail
        unit={u}
        units={[u]}
        onSelectUnit={() => undefined}
        householdCountNote={householdCountNoteFor(rowProfile, rules)}
        priceBudget={{ profile: rowProfile, financeRules: rules }}
        profile={rowProfile}
        onClose={() => undefined}
      />,
    );
    /*
     * MoneyInput은 만원 단위로 읽는다(입력 힌트 참고) — 원 단위 값을
     * 그대로 넣지 않도록 만원으로 바꿔서 넣는다.
     *
     * ⚠ **먼저 비운다.** 이 칸은 이제 `unit.maxPrice`로 채워진 채
     * 시작하므로(`ComplexDetail`의 `askingPrice` 문서), 그냥 타이핑하면
     * 기본값 뒤에 붙어 훨씬 큰 금액이 되고 부담 등급이 달라진다.
     * (여기서 넣는 값이 곧 그 기본값과 같지만, 이 테스트가 검사하는 것은
     * "목록과 상세가 같은 가격에서 같은 등급을 말하는가"이므로 그 가격을
     * 명시적으로 넣는 형태를 유지한다.)
     */
    const priceInput = screen.getByLabelText("예상 매수금액");
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, String(u.maxPrice / 10_000));
    // 이 입력란은 `commitOn="blur"`다 — 벗어나야 값이 확정되고, 아래
    // 등급이 그 값을 기준으로 다시 계산된다.
    await userEvent.tab();
    return rendered;
  }

  it.each(
    [...REAL_LAND_LEASE, ...SYNTHETIC_UNKNOWN].map(
      (u) => [`${u.complexKey}|${u.areaBucket}`, u] as const,
    ),
  )(
    "%s의 목록 등급과 상세 등급이 같다",
    async (_key, u) => {
      const result = build([u], p);
      const list = renderList(result);
      const rows = [...list.container.querySelectorAll(".complex-row")];
      expect(rows).toHaveLength(1);
      const rowLevel = levelTextOf(rows[0] as Element);

      const detail = await detailOf(u);
      const badgeLevel = detail.container
        .querySelector(".safety-level")
        ?.textContent?.trim();

      expect(rowLevel).toBe(badgeLevel);
      expect(rowLevel).not.toBe("안전");

      list.unmount();
      detail.unmount();
    },
  );

  /**
   * 등급이 왜 "안전"까지 못 갔는지는 **등급 글자 바로 다음**에서 말한다.
   * 낯선 등급 글자만 남지 않게 한다는 계약은 그대로다.
   *
   * ⚠ **더 이상 "같은 `<div>` 안"이 아니다.** 사용자 지시로 등급 낱말
   * ("안전")을 카드 오른쪽 위로 올리면서(`ComplexDetail.tsx`의
   * `.detail-monthly-header`), 등급은 제목 줄과 나란히 서고 근거 문장은
   * 그 아래 **전체 폭**을 쓰는 별도 줄이 됐다 — 카드 하나에서 오른쪽
   * 끝에 짧게 붙은 낱말과 그 아래 긴 문장을 같은 폭의 상자에 억지로
   * 가두면 문장이 좁게 줄바꿈된다. 그래서 지금 확인하는 것은 "같은
   * 상자 안"이 아니라 **"등급 머리 바로 다음에 온다"**(둘 사이에
   * 다른 내용이 끼어들지 않는다)는 순서 계약이다.
   */
  it("상세도 왜 멈췄는지를 등급 글자 바로 다음에서 말한다", async () => {
    const u = REAL_LAND_LEASE[0];
    expect(u).toBeDefined();
    if (u === undefined) return;
    const { container } = await detailOf(u);
    const level = container.querySelector(".safety-level");
    const note = container.querySelector(".safety-grade-note");
    expect(note?.textContent).toBe(landLeaseRules.grade.note);

    const header = level?.closest(".detail-monthly-header");
    expect(header).not.toBeNull();
    // 등급 머리(.detail-monthly-header) 바로 다음 형제가 근거 문장이다
    // — 둘 사이에 다른 내용이 끼어들면 등급과 근거가 멀어져 읽힌다.
    expect(header?.nextElementSibling).toBe(note);
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
  afterEach(() => vi.restoreAllMocks());

  async function openLandLeaseDetail() {
    /*
     * 목록의 출처가 번들 데이터에서 "고른 지역을 그때 조회한 결과"로
     * 바뀌었다(App.tsx의 지역 선택 위자드). 이 파일이 잠그는 것은 여전히
     * **화면에서 같은 경고가 두 번 뜨지 않는가**이므로, 조회 결과로
     * 예전과 **같은 번들 데이터**를 돌려주어 화면을 그대로 재현한다 —
     * 바뀐 것은 그 목록에 도달하는 경로뿐이다.
     *
     * `isRegulatedArea`를 `null`("모르는 지역")로 둔다. 불리언을 주면
     * App이 그 값을 폼에 반영하면서 규제지역이 **가정에서 확정으로**
     * 바뀌는데, 이 테스트는 그 축과 무관하고 예전 흐름에서도 가정인
     * 채였다.
     */
    vi.spyOn(regionQuery, "fetchRegionComplexes").mockResolvedValue({
      units: [...COMPLEX_UNITS],
      isRegulatedArea: null,
      dataAsOf: null,
    });

    render(<App />);
    // 16억 현금 · 2억 소득이면 토지임대부 평형이 목록에 뜬다.
    await userEvent.type(screen.getByLabelText(/얼마 있어요/), "160000");
    await userEvent.type(screen.getByLabelText(/연 소득은요/), "20000");
    await userEvent.click(screen.getByRole("radio", { name: "무주택이에요" }));

    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(
      screen.getByRole("button", { name: "이 지역으로 조회하기" }),
    );
    await screen.findByRole("region", { name: "살 수 있는 단지" });

    const row = screen
      .getAllByRole("button")
      .find((b) => /토지임대부아파트/.test(b.textContent ?? ""));
    expect(row).toBeDefined();
    if (row !== undefined) await userEvent.click(row);
  }

  /**
   * 예산 상세 쪽 등급은 `PriceSlider`와 합쳐지며 `.price-slider-grade`가
   * 됐고(사용자 지시), 단지 상세 쪽도 이제 `SafetyBadge`를 거치지 않고
   * `ComplexDetail`이 직접 `.safety-level`을 그린다(사용자 지시로
   * "매달 나가는 돈" 머리를 다시 짜면서 — `ComplexDetail.tsx`의
   * `.detail-monthly-header` 문서 참고). **클래스 이름은 그대로다.**
   *
   * **계약은 그대로다**: 두 자리가 같은 등급을 말하고, 왜 "안전"까지
   * 못 갔는지는 **한 번만** 적는다.
   *
   * 예상 매수금액은 이제 이 평형의 실거래 범위 위쪽으로 채워진 채
   * 시작하므로(`ComplexDetail`의 `askingPrice` 문서) **먼저 비우고**
   * 이 테스트가 정한 값을 넣는다 — 안 그러면 기본값 뒤에 붙어 훨씬 큰
   * 금액이 되고, 두 자리가 서로 다른 등급을 말하게 된다. 이 입력란은
   * `commitOn="blur"`이므로 벗어나야(`tab()`) 값이 확정된다.
   */
  it("두 자리가 같은 등급을 말하되 이유는 한 번만 적는다", async () => {
    await openLandLeaseDetail();
    const priceInput = screen.getByLabelText("예상 매수금액");
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, "150000");
    await userEvent.tab();

    const levels = [
      ...document.querySelectorAll(".price-slider-grade, .safety-level"),
    ].map((n) => n.textContent?.trim());
    expect(levels.length).toBe(2);
    expect(levels).toEqual([
      landLeaseRules.grade.label,
      landLeaseRules.grade.label,
    ]);

    // 예산 상세 쪽은 explainGrade={false}라 근거를 내지 않는다 —
    // 단지 상세 쪽(.safety-grade-note)만 낸다.
    expect(document.querySelectorAll(".price-slider-grade-note")).toHaveLength(0);
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
