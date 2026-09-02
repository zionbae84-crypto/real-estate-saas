import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import type { SafetyLevel } from "../lib/finance";
import { ComplexList } from "./ComplexList";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  const areaBucket = overrides.areaBucket ?? 84;
  return {
    complexKey: "11680-9001",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket,
    maxExclusiveAreaSqm: areaBucket,
    landLeasehold: "N",
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
    address: null,
    trades: [],
    lowConfidence: false,
    ...overrides,
  };
}

/**
 * 화면만 검증하므로 부담 값은 직접 만든다 — 엔진 계산은 complex-list.test.ts가
 * 본다.
 *
 * `neededLoan`은 기본 2억(대출 낀 행)이다 — `ComplexList`가 `withinSafe`를
 * `burdenTierOf`로 다시 갈라 "무리 없이"(대출 0)와 "대출이 필요해"(그
 * 외)를 나누므로(위 컴포넌트 문서 참고), "무리 없이"에 실제로 잡히는
 * 행을 만들려면 호출부가 `0`을 명시로 넘겨야 한다.
 */
function entry(
  u: ComplexUnit,
  burdenRatio = 0.22,
  level: SafetyLevel = "safe",
  neededLoan = 200_000_000,
): ComplexListEntry {
  return {
    unit: u,
    needsBuiltYear: false,
    burden: {
      neededLoan,
      safety: {
        monthlyPayment: 1_200_000,
        burdenRatio,
        stressedMonthlyPayment: 1_500_000,
        stressedBurdenRatio: burdenRatio + 0.07,
        level,
      },
    },
  };
}

function renderList(overrides: Partial<ComplexListResult> = {}, props = {}) {
  const result: ComplexListResult = {
    withinSafe: [],
    unverified: [],
    beyondSafe: [],
    affordablePrice: 500_000_000,
    safePrice: 350_000_000,
    emptyBecauseOfFilter: false,
    ...overrides,
  };
  return render(
    <ComplexList
      result={result}
      dataAsOf="2026-08"
      hasRegionFilter={false}
      noRepaymentCapacity={false}
      {...props}
    />,
  );
}

describe("ComplexList", () => {
  it("시세를 범위와 거래 건수로 보여준다", () => {
    renderList({ withinSafe: [entry(unit())] });
    expect(screen.getByText(/2억 8,000만원 ~ 3억 2,000만원/)).toBeInTheDocument();
    expect(screen.getByText(/거래 5건/)).toBeInTheDocument();
  });

  it("변동률을 화면에 내지 않는다", () => {
    // 같은 조항의 "수익률 예측 금지".
    const { container } = renderList({ withinSafe: [entry(unit())] });
    expect(container.textContent).not.toMatch(/상승|하락|변동률|수익률/);
  });

  it("두 덩어리의 헤더가 각각 나온다", () => {
    renderList({
      withinSafe: [entry(unit({ complexKey: "a" }), 0.2, "safe", 0)],
      beyondSafe: [entry(unit({ complexKey: "b" }), 0.33, "caution")],
    });
    expect(screen.getByText("무리 없이 살 수 있어요")).toBeInTheDocument();
    expect(screen.getByText("살 수는 있지만 대출이 필요해")).toBeInTheDocument();
  });

  it("한쪽이 비면 그 헤더가 없다", () => {
    renderList({ beyondSafe: [entry(unit(), 0.33, "caution")] });
    expect(screen.queryByText("무리 없이 살 수 있어요")).not.toBeInTheDocument();
    expect(screen.getByText("살 수는 있지만 대출이 필요해")).toBeInTheDocument();
  });

  it("대출이 필요한 덩어리를 가장 먼저 보여준다", () => {
    // 사용자 지시: "사람들은 대출을 받아서라도 구매하고 싶은 집이
    // 궁금하기 때문" — '무리 없이'가 예산 안에서 가장 안전한 선택지여도,
    // 화면 순서는 그 궁금증을 먼저 채운다.
    const { container } = renderList({
      withinSafe: [entry(unit({ complexKey: "a" }), 0.2, "safe", 0)],
      beyondSafe: [entry(unit({ complexKey: "b" }), 0.33, "caution")],
    });
    const headings = [...container.querySelectorAll(".complex-group")].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual([
      "살 수는 있지만 대출이 필요해",
      "무리 없이 살 수 있어요",
    ]);
  });

  it("부담률을 색과 함께 글자로도 말한다", () => {
    // 색만으로 의미를 전달하면 색이 안 보이는 환경에서 경고가 사라진다.
    const { container } = renderList({
      beyondSafe: [entry(unit(), 0.45, "danger")],
    });
    expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
    expect(screen.getByText("위험")).toBeInTheDocument();
  });

  it("가격 기준 설명 문구는 더 이상 붙지 않는다", () => {
    // 사용자 지시로 뺐다 — 카드 안에서 크게 중요하지 않다고 판단했다.
    // 계산 기준(maxPrice) 자체는 그대로다(complex-list.ts 참고), 화면
    // 문구만 없앴다.
    const { container } = renderList({ withinSafe: [entry(unit())] });
    expect(container.textContent).not.toMatch(/범위 위쪽인/);
  });

  it("건축년도는 필요할 때만 붙는다", () => {
    const { container } = renderList({
      withinSafe: [
        { ...entry(unit({ complexKey: "a", builtYear: 1999 })), needsBuiltYear: true },
        entry(unit({ complexKey: "b", complexName: "다른아파트" })),
      ],
    });
    expect(screen.getByText(/1999년 준공/)).toBeInTheDocument();
    expect(container.textContent?.match(/년 준공/g)).toHaveLength(1);
  });

  it("지역 필터 때문에 0개면 지역을 넓혀 보라고 한다", () => {
    renderList({ emptyBecauseOfFilter: true }, { hasRegionFilter: true });
    expect(screen.getByText(/지역을 넓혀/)).toBeInTheDocument();
  });

  it("전체 지역에서도 0개면 지역 이야기를 하지 않는다", () => {
    // 전체에서도 없는데 지역을 넓히라고 하면 거짓말이다.
    renderList({ emptyBecauseOfFilter: false }, { hasRegionFilter: false });
    expect(screen.queryByText(/지역을 넓혀/)).not.toBeInTheDocument();
  });

  it("상환 능력이 0이면 부채를 줄이라고 말한다", () => {
    renderList({}, { noRepaymentCapacity: true });
    expect(screen.getByText(/기존 부채를 줄이면/)).toBeInTheDocument();
  });

  it("데이터 기준일과 신고 지연을 함께 말한다", () => {
    // 지연을 말하지 않으면 최근 달 거래가 적은 것을 시장이 얼어붙은
    // 것으로 읽는다.
    renderList({ withinSafe: [entry(unit())] });
    expect(screen.getByText(/2026-08 계약분까지/)).toBeInTheDocument();
    expect(screen.getByText(/신고가 한 달쯤 늦어서/)).toBeInTheDocument();
  });

  it("한 덩어리가 길어도 다른 덩어리가 화면에서 밀려나지 않는다", () => {
    // 예전엔 합쳐 세서 안전 덩어리가 길 때 두 번째 헤더가 아예 안 나왔다
    // — "선이 어디에 있는가"라는 이 화면의 요점이 사라졌다. 지금은
    // 덩어리마다 독립된 페이지를 가지므로 이 문제 자체가 구조적으로
    // 일어날 수 없다.
    renderList({
      withinSafe: Array.from({ length: 82 }, (_, i) =>
        entry(unit({ complexKey: `s${i}` }), 0.22, "safe", 0),
      ),
      beyondSafe: Array.from({ length: 7 }, (_, i) =>
        entry(unit({ complexKey: `b${i}` }), 0.33, "caution"),
      ),
    });
    expect(screen.getByText("무리 없이 살 수 있어요")).toBeInTheDocument();
    expect(screen.getByText("살 수는 있지만 대출이 필요해")).toBeInTheDocument();
  });

  it("덩어리마다 5개씩 쪽으로 나누고, 다음 쪽을 누르면 다음 5개가 뜬다", () => {
    renderList({
      withinSafe: Array.from({ length: 12 }, (_, i) =>
        entry(unit({ complexKey: `u${i}`, complexName: `단지${i}` })),
      ),
    });
    expect(screen.getByText("1 / 3쪽")).toBeInTheDocument();
    expect(screen.getByText("단지0")).toBeInTheDocument();
    expect(screen.queryByText("단지5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByText("2 / 3쪽")).toBeInTheDocument();
    expect(screen.getByText("단지5")).toBeInTheDocument();
    expect(screen.queryByText("단지0")).not.toBeInTheDocument();
  });

  it("덩어리가 한 쪽 분량이면 쪽 넘김이 뜨지 않는다", () => {
    renderList({ withinSafe: [entry(unit())] });
    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
  });

  it("대출이 필요 없으면 월 0원 대신 그 사실을 말한다", () => {
    // "월 0원 · 부담률 0%"만 보여주면 계산이 안 된 것처럼 읽힌다.
    const e = entry(unit());
    renderList({ withinSafe: [{ ...e, burden: { ...e.burden, neededLoan: 0 } }] });
    expect(screen.getByText(/대출 없이 살 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/월 0원/)).not.toBeInTheDocument();
  });

  describe("사용자 지시: 대출 없이 사는 행은 등급도 안전으로 통일한다", () => {
    it("기존 대출 때문에 등급이 위험이어도, 이번 구매에 대출이 없고 데이터가 완전하면 무리 없이+안전이 된다", () => {
      // 기존 빚만으로 caution/danger가 될 수 있다(calcSafetyScore가
      // existingDebtAnnualPayment도 함께 잰다) — buildComplexList는 그런
      // 행을 beyondSafe에 담는다(land-lease-grade.test.tsx 참고).
      const { container } = renderList({
        beyondSafe: [entry(unit({ landLeasehold: "N" }), 0.45, "danger", 0)],
      });
      expect(screen.getByText("무리 없이 살 수 있어요")).toBeInTheDocument();
      expect(screen.queryByText("살 수는 있지만 대출이 필요해")).not.toBeInTheDocument();
      expect(screen.getByText(/대출 없이 살 수 있어요/)).toBeInTheDocument();
      expect(container.querySelector(".complex-level")?.textContent).toBe("안전");
    });

    it("대출은 없어도 토지임대부 데이터가 불완전하면 안전이라 부르지 않는다", () => {
      // 데이터가 없는데 "안전"이라고 말하면 이 저장소가 가장 경계하는
      // 오답이다 — 대출 유무와 무관하게 진짜 등급을 그대로 보여준다.
      const { container } = renderList({
        beyondSafe: [entry(unit({ landLeasehold: "Y" }), 0.45, "danger", 0)],
      });
      expect(screen.getByText("살 수는 있지만 대출이 필요해")).toBeInTheDocument();
      expect(screen.queryByText("무리 없이 살 수 있어요")).not.toBeInTheDocument();
      expect(screen.getByText(/대출 없이 살 수 있어요/)).toBeInTheDocument();
      expect(container.querySelector(".complex-level")?.textContent).toBe("위험");
    });
  });

  it("거래가 하나라 범위가 한 점이면 숫자를 한 번만 보여준다", () => {
    // 같은 숫자를 두 번 읽히게 하지 않는다. 전체 평형의 절반이 거래 1건이다.
    const { container } = renderList({
      withinSafe: [
        entry(unit({ minPrice: 135_000_000, maxPrice: 135_000_000, tradeCount: 1 })),
      ],
    });
    const range = container.querySelector(".complex-range")?.textContent ?? "";
    expect(range).toMatch(/1억 3,500만원 · 최근 6개월 거래 1건/);
    expect(range).not.toMatch(/~/);
  });

  it("값이 다르면 범위로 보여준다", () => {
    const { container } = renderList({
      withinSafe: [
        entry(unit({ minPrice: 135_000_000, maxPrice: 135_004_000, tradeCount: 2 })),
      ],
    });
    expect(container.querySelector(".complex-range")?.textContent).toMatch(/~/);
  });

  // onSelect가 없으면(예: 위의 테스트들처럼 이 컴포넌트만 단독으로
  // 렌더링하는 자리) 행은 버튼이 아니다 — 누를 곳이 없는데 버튼처럼
  // 보이면 그 자체가 거짓말이다.
  it("onSelect가 없으면 행이 버튼이 아니다", () => {
    renderList({ withinSafe: [entry(unit())] });
    expect(screen.queryByRole("button", { name: /테스트아파트/ })).not.toBeInTheDocument();
  });

  it("onSelect가 있으면 행을 눌러 그 평형을 알려준다", () => {
    const onSelect = vi.fn();
    const u = unit();
    renderList({ withinSafe: [entry(u)] }, { onSelect });

    screen.getByRole("button", { name: /테스트아파트/ }).click();

    expect(onSelect).toHaveBeenCalledWith(u);
  });

  describe("리뷰 수정: 버튼 안의 마크업이 유효하다", () => {
    it("행 버튼 안에 <p>가 없다", () => {
      // button의 콘텐츠 모델은 phrasing content라 <p>는 유효하지 않다.
      const { container } = renderList({ withinSafe: [entry(unit())] }, { onSelect: vi.fn() });
      const button = container.querySelector(".complex-row-button");
      expect(button).not.toBeNull();
      expect(button?.querySelector("p")).toBeNull();
    });

    it("보이는 내용은 그대로다 — 버튼일 때와 아닐 때가 같다", () => {
      const withButton = renderList(
        { withinSafe: [entry(unit())] },
        { onSelect: vi.fn() },
      ).container;
      const plain = renderList({ withinSafe: [entry(unit())] }).container;
      for (const cls of [".complex-name", ".complex-range", ".complex-burden"]) {
        expect(withButton.querySelector(cls)?.textContent).toBe(
          plain.querySelector(cls)?.textContent,
        );
      }
    });
  });
});
