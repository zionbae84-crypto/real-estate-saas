import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import type { SafetyLevel } from "../lib/finance";
import { ComplexList } from "./ComplexList";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket: 84,
    medianPrice: 300_000_000,
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    lowConfidence: false,
    ...overrides,
  };
}

/** 화면만 검증하므로 부담 값은 직접 만든다 — 엔진 계산은 complex-list.test.ts가 본다 */
function entry(
  u: ComplexUnit,
  burdenRatio = 0.22,
  level: SafetyLevel = "safe",
): ComplexListEntry {
  return {
    unit: u,
    needsBuiltYear: false,
    burden: {
      neededLoan: 200_000_000,
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

  it("medianPrice를 화면에 내지 않는다", () => {
    // 부모 스펙 §12: 특정 단지의 적정가를 단정하지 않는다.
    // medianPrice 3억은 min(2.8억)·max(3.2억) 어느 쪽과도 겹치지 않는다.
    const { container } = renderList({
      withinSafe: [entry(unit({ medianPrice: 300_000_000 }))],
    });
    expect(container.textContent).not.toMatch(/(^|[^,\d])3억원/);
  });

  it("변동률을 화면에 내지 않는다", () => {
    // 같은 조항의 "수익률 예측 금지".
    const { container } = renderList({ withinSafe: [entry(unit())] });
    expect(container.textContent).not.toMatch(/상승|하락|변동률|수익률/);
  });

  it("두 덩어리의 헤더가 각각 나온다", () => {
    renderList({
      withinSafe: [entry(unit({ complexKey: "a" }), 0.2, "safe")],
      beyondSafe: [entry(unit({ complexKey: "b" }), 0.33, "caution")],
    });
    expect(screen.getByText("무리 없이 살 수 있어요")).toBeInTheDocument();
    expect(screen.getByText("살 수는 있지만 부담이 커요")).toBeInTheDocument();
  });

  it("한쪽이 비면 그 헤더가 없다", () => {
    renderList({ beyondSafe: [entry(unit(), 0.33, "caution")] });
    expect(screen.queryByText("무리 없이 살 수 있어요")).not.toBeInTheDocument();
    expect(screen.getByText("살 수는 있지만 부담이 커요")).toBeInTheDocument();
  });

  it("부담률을 색과 함께 글자로도 말한다", () => {
    // 색만으로 의미를 전달하면 색이 안 보이는 환경에서 경고가 사라진다.
    const { container } = renderList({
      beyondSafe: [entry(unit(), 0.45, "danger")],
    });
    expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
    expect(screen.getByText("위험")).toBeInTheDocument();
  });

  it("어느 가격 기준인지 문구로 드러낸다", () => {
    renderList({ withinSafe: [entry(unit())] });
    expect(screen.getByText(/범위 위쪽인/)).toBeInTheDocument();
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
    // 합쳐 세면 안전 덩어리가 길 때 두 번째 헤더가 아예 안 나온다 —
    // "선이 어디에 있는가"라는 이 화면의 요점이 사라진다.
    renderList({
      withinSafe: Array.from({ length: 82 }, (_, i) =>
        entry(unit({ complexKey: `s${i}` })),
      ),
      beyondSafe: Array.from({ length: 7 }, (_, i) =>
        entry(unit({ complexKey: `b${i}` }), 0.33, "caution"),
      ),
    });
    expect(screen.getByText("무리 없이 살 수 있어요")).toBeInTheDocument();
    expect(screen.getByText("살 수는 있지만 부담이 커요")).toBeInTheDocument();
  });

  it("남은 개수를 더 보기에 알려준다", () => {
    const onShowMore = vi.fn();
    renderList(
      {
        withinSafe: Array.from({ length: 15 }, (_, i) =>
          entry(unit({ complexKey: `u${i}` })),
        ),
      },
      { onShowMore },
    );
    expect(screen.getByRole("button", { name: /5개 더 보기/ })).toBeInTheDocument();
  });

  it("대출이 필요 없으면 월 0원 대신 그 사실을 말한다", () => {
    // "월 0원 · 부담률 0%"만 보여주면 계산이 안 된 것처럼 읽힌다.
    const e = entry(unit());
    renderList({ withinSafe: [{ ...e, burden: { ...e.burden, neededLoan: 0 } }] });
    expect(screen.getByText(/대출 없이 살 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/월 0원/)).not.toBeInTheDocument();
  });

  it("거래가 하나라 범위가 한 점이면 숫자를 한 번만 보여준다", () => {
    // 같은 숫자를 두 번 읽히게 하지 않는다. 전체 평형의 절반이 거래 1건이다.
    const { container } = renderList({
      withinSafe: [
        entry(unit({ minPrice: 135_000_000, maxPrice: 135_000_000, tradeCount: 1 })),
      ],
    });
    const range = container.querySelector(".complex-range")?.textContent ?? "";
    expect(range).toMatch(/1억 3,500만원 · 최근 1년 거래 1건/);
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
});
