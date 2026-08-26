import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import type { BurdenAtPrice, CostBreakdown as CostBreakdownData } from "../lib/finance";
import { rules } from "../state/useAffordability";
import { ComplexDetail } from "./ComplexDetail";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  const areaBucket = overrides.areaBucket ?? 59;
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
    lowConfidence: false,
    ...overrides,
  };
}

function burden(overrides: Partial<BurdenAtPrice> = {}): BurdenAtPrice {
  return {
    neededLoan: 200_000_000,
    safety: {
      monthlyPayment: 1_200_000,
      burdenRatio: 0.22,
      stressedMonthlyPayment: 1_500_000,
      stressedBurdenRatio: 0.29,
      level: "safe",
    },
    ...overrides,
  };
}

/** 취득세 줄에 붙는 주택 수 고지. 호출부가 골라 넘기는 값이라 여기서 고정한다 */
const 주택수고지 = rules.acquisitionTax.householdCountNote;

function costs(overrides: Partial<CostBreakdownData> = {}): CostBreakdownData {
  return {
    acquisitionTax: 3_200_000,
    brokerageFee: 1_600_000,
    brokerageVat: 160_000,
    legalFee: 300_000,
    movingCost: 1_500_000,
    housingBondCost: 400_000,
    total: 7_160_000,
    ...overrides,
  };
}

describe("ComplexDetail", () => {
  it("단지명·평형·법정동·가격범위·거래 건수를 목록과 같은 규칙으로 보여준다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
    );
    const title = container.querySelector(".complex-detail-title")?.textContent ?? "";
    expect(title).toMatch(/테스트아파트/);
    expect(title).toMatch(/59㎡/);
    expect(title).toMatch(/대치동/);
    /*
     * 범위·거래 건수는 이제 화면에 두 번 나온다 — 여기 머리말과, 아래
     * 호가 위치 확인이 "이 판단이 몇 건에 근거하는가"로 다시 적는
     * 자리다(PriceCheck 참고). 그 자리는 판정 바로 옆에 있어야 뜻이
     * 서므로 지우지 않고, 이 검사만 머리말로 좁힌다.
     */
    const range = container.querySelector(".complex-detail-range")?.textContent ?? "";
    expect(range).toMatch(/2억 8,000만원 ~ 3억 2,000만원/);
    expect(range).toMatch(/거래 5건/);
  });

  it("변동률을 화면에 내지 않는다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/상승|하락|변동률|수익률/);
  });

  it("어느 가격 기준인지 문구로 드러낸다", () => {
    const { container } = render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
    );
    // 두 블록이 **같은** 가격 전제를 쓰므로 그 전제는 화면 위쪽에서
    // 한 번만 적는다(design.md §6).
    const basis = container.querySelector(".complex-detail-basis")?.textContent ?? "";
    expect(basis).toMatch(/범위 위쪽인/);
    expect(basis).toMatch(/3억 2,000만원/);
  });

  it("필요 대출액을 보여준다", () => {
    const { container } = render(
      <ComplexDetail
        unit={unit()}
        burden={burden({ neededLoan: 250_000_000 })}
        costs={costs()}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    // 대출액은 이제 "매달 나가는 돈"의 가정 줄이 진다 — 그 금액이
    // 얼마짜리 대출을 30년·고정금리로 갚는 값인지가 같은 줄에 있어야
    // 월 상환액이 무엇을 전제로 한 숫자인지 읽힌다.
    const note = container.querySelector(
      ".detail-block--monthly .detail-stat-note",
    )?.textContent ?? "";
    expect(note).toMatch(/대출/);
    expect(note).toMatch(/2억 5,000만원/);
  });

  it("대출이 필요 없으면 그 사실을 말한다", () => {
    render(
      <ComplexDetail
        unit={unit()}
        burden={burden({
          neededLoan: 0,
          safety: {
            monthlyPayment: 0,
            burdenRatio: 0,
            stressedMonthlyPayment: 0,
            stressedBurdenRatio: 0,
            level: "safe",
          },
        })}
        costs={costs()}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/대출 없이 살 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/필요 대출액은/)).not.toBeInTheDocument();
  });

  it("월 상환액·부담률·안전 등급·금리 스트레스 시나리오를 보여준다", () => {
    const { container } = render(
      <ComplexDetail
        unit={unit()}
        burden={burden({
          safety: {
            monthlyPayment: 1_200_000,
            burdenRatio: 0.22,
            stressedMonthlyPayment: 1_500_000,
            stressedBurdenRatio: 0.29,
            level: "safe",
          },
        })}
        costs={costs()}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("안전")).toBeInTheDocument();
    expect(screen.getByText(/120만원/)).toBeInTheDocument();
    expect(screen.getByText(/22\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/금리가 2%p 오르면/)).toBeInTheDocument();
    expect(container.querySelector(".stressed-payment")?.textContent).toMatch(/150만원/);
  });

  it("부담 등급을 색과 함께 글자로도 말한다", () => {
    const { container } = render(
      <ComplexDetail
        unit={unit()}
        burden={burden({
          safety: {
            monthlyPayment: 2_000_000,
            burdenRatio: 0.45,
            stressedMonthlyPayment: 2_500_000,
            stressedBurdenRatio: 0.5,
            level: "danger",
          },
        })}
        costs={costs()}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
    expect(screen.getByText("위험")).toBeInTheDocument();
  });

  it("부대비용 내역을 항목별로 보여준다", () => {
    render(
      <ComplexDetail
        unit={unit()}
        burden={burden()}
        costs={costs({ acquisitionTax: 3_200_000, total: 7_160_000 })}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("취득세 (지방교육세·농특세 포함)")).toBeInTheDocument();
    expect(screen.getByText(/320만원/)).toBeInTheDocument();
  });

  /**
   * `calcAcquisitionCosts`는 취득자의 주택 수를 읽지 않고 언제나
   * 무주택 기준 세율로 계산한다(acquisition-cost.ts 참고) — 단지
   * 상세의 부대비용 내역에도 그 사실과 방향을 알리는 고지가 함께
   * 나가야 한다.
   */
  it("부대비용 옆에 주택 수 고지가 함께 나온다", () => {
    render(
      <ComplexDetail
        unit={unit()}
        burden={burden()}
        costs={costs()}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(주택수고지),
    ).toBeInTheDocument();
  });

  it("이 평형의 전용면적으로 계산했고 그 면적이 임시값이라는 사실을 알려준다", () => {
    // 예전에는 세 문장이었다. 화면 대부분이 이런 설명 문단이라는 것이
    // 사용자가 지적한 문제라 한 문장으로 줄였다 — **뜻은 그대로다**:
    // 이 화면 숫자가 어느 면적 기준인지, 그리고 그 면적이 이 화면에서만
    // 쓰이는 임시값이라는 것.
    const { container } = render(
      <ComplexDetail unit={unit({ areaBucket: 59 })} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
    );
    const basis = container.querySelector(".complex-detail-basis")?.textContent ?? "";
    expect(basis).toMatch(/59㎡/);
    // 목록으로 돌아가면 헤드라인은 다시 **고른 평형대**가 정하는 전제로
    // 돌아간다 — 예전 문구("원래 가정한 값")는 룰셋 가정 면적을 가리켰고,
    // 그 값은 이제 없다.
    expect(basis).toMatch(/고른 평형대/);
  });

  describe("리뷰 수정: 상세 화면의 배지·마크업·포커스", () => {
    it("이 배지가 '이 집을 샀을 때'의 답이라고 글자로 말한다", () => {
      // 상세 화면에는 헤드라인 배지(최대로 빌렸을 때)와 이 배지가 함께
      // 뜬다. 라벨이 없으면 어느 쪽이 이 매물의 답인지 알 수 없다.
      const { container } = render(
        <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
      );
      expect(container.querySelector(".safety-badge-label")?.textContent).toMatch(
        /이 집을 샀을 때/,
      );
    });

    it("두 블록에 죽은 data-level을 붙이지 않는다", () => {
      // 예전 `.complex-detail-loan`이 그랬다: 대응하는 CSS도 없고
      // `.complex-level` 자식도 없는, 아무것도 하지 않는 속성이었다.
      // 그 문단은 두 블록으로 흡수됐지만 같은 실수를 반복하지 않는다 —
      // 등급을 말하는 자리는 배지 하나뿐이다.
      const { container } = render(
        <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
      );
      const blocks = [...container.querySelectorAll(".detail-block")];
      expect(blocks).toHaveLength(2);
      for (const block of blocks) {
        expect(block.hasAttribute("data-level")).toBe(false);
      }
      expect(container.querySelectorAll("[data-level]")).toHaveLength(1);
    });

    it("열리면 포커스가 상세로 옮겨간다", () => {
      // 목록이 사라지고 이 화면이 그 자리에 나타난다. 포커스가 사라진
      // 버튼 자리에 남으면 스크린리더 사용자는 화면이 바뀐 것을 모른다.
      render(
        <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={vi.fn()} />,
      );
      expect(document.activeElement).toBe(
        screen.getByRole("region", { name: "단지 상세" }),
      );
    });
  });

  it("목록으로 버튼을 누르면 닫는다", () => {
    const onClose = vi.fn();
    render(
      <ComplexDetail unit={unit()} burden={burden()} costs={costs()}
        householdCountNote={주택수고지} priceBudget={null} onClose={onClose} />,
    );
    screen.getByRole("button", { name: /목록으로/ }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

/**
 * ══════════════════════════════════════════════════════════════════
 * 두 블록으로 줄인 상세 (design.md §6)
 * ══════════════════════════════════════════════════════════════════
 *
 * 사용자가 "지금은 너무 복잡해졌어"라고 했다. 이 화면은 **빼는** 작업이다:
 * 계산도 팔레트도 그대로 두고, 무엇을 얼마나 보여줄지만 줄인다.
 *
 * 아래 검사들이 지키는 것은 셋이다.
 * 1. 두 블록(살 때 드는 비용 · 매달 나가는 돈)이 Stat Block 배치로 선다.
 * 2. **접는 것과 지우는 것은 다르다** — 접힌 영역의 고지 문구는 DOM에
 *    그대로 남고, 인쇄에서 펼쳐진다(CSS 쪽은 scripts/printCss.test.ts).
 * 3. 대출이 필요 없을 때 **맨숫자 0을 크게 찍지 않는다.**
 */
describe("두 블록으로 줄인 상세", () => {
  function renderDetail(
    props: {
      unit?: ComplexUnit;
      burden?: BurdenAtPrice;
      costs?: CostBreakdownData;
    } = {},
  ) {
    return render(
      <ComplexDetail
        unit={props.unit ?? unit()}
        burden={props.burden ?? burden()}
        costs={props.costs ?? costs()}
        householdCountNote={주택수고지}
        priceBudget={null}
        onClose={vi.fn()}
      />,
    );
  }

  /** 라벨·값 두 줄을 한 쌍으로 읽는다 */
  function statBlock(container: HTMLElement, selector: string) {
    const block = container.querySelector(selector);
    return {
      label: block?.querySelector(".detail-stat-label")?.textContent ?? null,
      value: block?.querySelector(".detail-stat-value")?.textContent ?? null,
      note: block?.querySelector(".detail-stat-note")?.textContent ?? null,
    };
  }

  describe("① 살 때 드는 비용", () => {
    it("라벨 위·값 아래의 Stat Block으로 낸다", () => {
      const { container } = renderDetail({
        costs: costs({ total: 8_505_278 }),
      });
      const block = statBlock(container, ".detail-block--costs");
      expect(block.label).toBe("살 때 드는 비용");
      expect(block.value).toBe("850만 5,278원");
    });

    it("내역은 접혀 있고, 합계를 두 번 적지 않는다", () => {
      const { container } = renderDetail({ costs: costs({ total: 8_505_278 }) });
      const fold = container.querySelector(".detail-block--costs details");
      expect(fold).not.toBeNull();
      expect(fold?.hasAttribute("open")).toBe(false);
      // summary는 "내역"만 말한다 — 바로 위에서 이미 크게 적은 합계를
      // 되풀이하면 같은 숫자가 한 화면에 두 번 박힌다.
      const summary = fold?.querySelector("summary");
      expect(summary?.textContent).not.toMatch(/850만/);
      expect(summary?.textContent).toMatch(/내역/);
    });

    it("접혀 있어도 항목별 금액과 주택 수 고지는 DOM에 남는다", () => {
      const { container } = renderDetail();
      const fold = container.querySelector(".detail-block--costs details");
      expect(fold?.textContent).toMatch(/취득세 \(지방교육세·농특세 포함\)/);
      expect(fold?.textContent).toContain(주택수고지);
    });

    it("전용 85㎡를 넘으면 농특세가 붙는다는 사실을 한 줄로 말한다", () => {
      const { container } = renderDetail({
        unit: unit({ areaBucket: 114, maxExclusiveAreaSqm: 114.5 }),
      });
      const note = statBlock(container, ".detail-block--costs").note ?? "";
      expect(note).toMatch(/85㎡/);
      expect(note).toMatch(/농어촌특별세|농특세/);
    });

    it("85㎡ 이하면 그 줄을 만들지 않는다", () => {
      // 해당하지 않는 고지를 늘 띄워 두면 같은 자리의 진짜 고지까지
      // 함께 닳는다.
      const { container } = renderDetail({
        unit: unit({ areaBucket: 59, maxExclusiveAreaSqm: 59.9 }),
      });
      expect(statBlock(container, ".detail-block--costs").note).toBeNull();
    });
  });

  describe("② 매달 나가는 돈", () => {
    it("라벨 위·값 아래의 Stat Block으로 낸다", () => {
      const { container } = renderDetail();
      const block = statBlock(container, ".detail-block--monthly");
      expect(block.label).toBe("매달 나가는 돈");
      expect(block.value).toBe("120만원");
    });

    it("대출액·기간·금리를 가정으로 화면에 적는다", () => {
      const { container } = renderDetail({
        burden: burden({ neededLoan: 320_000_000 }),
      });
      const note = statBlock(container, ".detail-block--monthly").note ?? "";
      expect(note).toMatch(/3억 2,000만원/);
      expect(note).toMatch(new RegExp(`${rules.loanTermMonths / 12}년`));
      expect(note).toMatch(
        new RegExp(`연 ${+(rules.baseRate * 100).toFixed(2)}%`),
      );
      expect(note).toMatch(/가정/);
    });

    it("상환부담률은 한 줄로만 낸다 — 별도 지표 블록을 만들지 않는다", () => {
      const { container } = renderDetail();
      expect(container.querySelector(".detail-burden-ratio")?.textContent).toBe(
        "소득 대비 22.0%",
      );
      // 예전의 세로 <dl>(월 상환액 / 소득 대비 상환부담률)은 사라졌다.
      expect(container.querySelector(".safety-badge dl")).toBeNull();
    });

    it("소득이 없으면 부담률 자리에 0%가 아니라 이유를 적는다", () => {
      const { container } = renderDetail({
        burden: burden({
          safety: {
            monthlyPayment: 1_200_000,
            burdenRatio: Number.POSITIVE_INFINITY,
            stressedMonthlyPayment: 1_500_000,
            stressedBurdenRatio: Number.POSITIVE_INFINITY,
            level: "danger",
          },
        }),
      });
      const line =
        container.querySelector(".detail-burden-ratio")?.textContent ?? "";
      expect(line).toMatch(/소득/);
      expect(line).not.toMatch(/0\.0%/);
    });

    it("금리 상승 시나리오는 접는다", () => {
      const { container } = renderDetail();
      const fold = container.querySelector(".detail-fold--stress");
      expect(fold?.tagName).toBe("DETAILS");
      expect(fold?.hasAttribute("open")).toBe(false);
      expect(fold?.querySelector("summary")?.textContent).toMatch(
        /금리가 2%p 오르면/,
      );
      // 접혀 있어도 값은 DOM에 남는다 — 인쇄에서 펼쳐진다.
      expect(fold?.querySelector(".safety-stress")?.textContent).toMatch(
        /150만원/,
      );
    });
  });

  describe("⚠ 대출이 필요 없을 때 — 맨숫자 0을 크게 찍지 않는다", () => {
    const 무대출 = burden({
      neededLoan: 0,
      safety: {
        monthlyPayment: 0,
        burdenRatio: 0,
        stressedMonthlyPayment: 0,
        stressedBurdenRatio: 0,
        level: "safe",
      },
    });

    it("값 자리에 '대출 없이 살 수 있어요'를 낸다", () => {
      const { container } = renderDetail({ burden: 무대출 });
      const block = statBlock(container, ".detail-block--monthly");
      expect(block.value).toMatch(/대출 없이 살 수 있어요/);
    });

    it("0원도 0.0%도 내지 않는다", () => {
      const { container } = renderDetail({ burden: 무대출 });
      const monthly = container.querySelector(".detail-block--monthly");
      expect(monthly?.textContent).not.toMatch(/0원/);
      expect(monthly?.textContent).not.toMatch(/0\.0%/);
      expect(container.querySelector(".detail-burden-ratio")).toBeNull();
      expect(container.querySelector(".detail-fold--stress")).toBeNull();
    });

    it("토지임대부면 같은 자리에서 단서가 함께 읽힌다", () => {
      const { container } = renderDetail({
        burden: 무대출,
        unit: unit({ landLeasehold: "Y" }),
      });
      const block = container.querySelector(".detail-block--monthly");
      expect(block?.querySelector(".complex-no-loan-caveat")).not.toBeNull();
    });
  });

  describe("접는 것과 지우는 것은 다르다", () => {
    /**
     * 인쇄에서 `<details>`를 강제로 펼치는 규칙은 `styles.css`의
     * `@media print`에 이미 있다(`details:not([open])::details-content`,
     * `scripts/printCss.test.ts`가 잠근다). 그 규칙이 **새 접기에도
     * 걸리려면** 접기가 진짜 `<details>` 요소여야 하고 기본이 닫힘이어야
     * 한다 — 여기서 그 형태를 못박는다. 직접 만든 상자로 접으면 그
     * 규칙이 닿지 않아 종이에서 내용이 통째로 사라진다.
     */
    it("접기는 진짜 <details>이고 기본이 닫힘이다", () => {
      const { container } = renderDetail();
      const folds = [...container.querySelectorAll(".detail-fold")];
      expect(folds.length).toBeGreaterThanOrEqual(3);
      for (const fold of folds) {
        expect(fold.tagName).toBe("DETAILS");
        expect(fold.hasAttribute("open")).toBe(false);
      }
    });

    it("호가의 위치는 제목만 보이게 접힌다", () => {
      const { container } = renderDetail();
      const fold = container.querySelector(".detail-fold--price");
      expect(fold?.querySelector("summary")?.textContent).toMatch(
        /호가의 위치/,
      );
      expect(fold?.querySelector(".price-check")).not.toBeNull();
      // 제목이 summary와 겹치지 않게 안쪽 제목은 지운다.
      expect(fold?.querySelector(".price-check-title")).toBeNull();
    });

    it("주변에 무엇이 있는지도 제목만 보이게 접힌다", () => {
      const { container } = renderDetail();
      const fold = container.querySelector(".detail-fold--location");
      expect(fold?.querySelector("summary")?.textContent).toMatch(
        /주변에 무엇이 있는지/,
      );
      expect(fold?.querySelector(".location-facts")).not.toBeNull();
      expect(fold?.querySelector(".location-facts-title")).toBeNull();
    });

    it("접힌 채로도 두 영역의 고지 문구가 DOM에 그대로 있다", () => {
      // `MUST_SURVIVE_PRINT_CLASSES`에 오른 것들이다. 접기가 이것들을
      // 언마운트하면 종이에서 통째로 사라진다.
      const { container } = renderDetail();
      for (const cls of [
        "price-no-estimate",
        "price-disclosure",
        "price-disclaimer",
        "location-state",
        "location-state-note",
        "location-disclosure",
        "location-disclaimer",
      ]) {
        const el = container.querySelector(`.${cls}`);
        expect(
          el,
          `.${cls}가 DOM에 없습니다 — 접기가 내용을 지웠습니다.`,
        ).not.toBeNull();
        expect(el?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });

    it("빈 상태 문구는 자기 원인을 그대로 말한다", () => {
      // "이 단지의 좌표를 아직 못 구했어요"가 접기 안에서도 살아 있어야
      // 한다 — 한 축의 모름이 다른 축의 기본값으로 흡수되면 안 된다.
      const { container } = renderDetail();
      expect(container.querySelector(".location-state")?.textContent).toMatch(
        /아직 위치를 몰라요/,
      );
    });

    it("새 summary도 '더 보기' 접미사 관행을 따른다", () => {
      // 인쇄에서는 <details>가 강제로 펼쳐지므로 "더 보기"는 죽은
      // 지시문이 된다 — 접미사만 .fold-more-hint로 감싸 인쇄에서 지운다.
      const { container } = renderDetail();
      for (const fold of container.querySelectorAll(".detail-fold")) {
        const summary = fold.querySelector("summary");
        expect(
          summary?.querySelector(".fold-more-hint"),
          `${fold.className}의 summary에 .fold-more-hint가 없습니다.`,
        ).not.toBeNull();
      }
    });
  });

  describe("그 밖에 줄인 것", () => {
    it("전용면적 설명은 한 문장이다", () => {
      const { container } = renderDetail({
        unit: unit({ areaBucket: 43, maxExclusiveAreaSqm: 43.2 }),
      });
      const basis =
        container.querySelector(".complex-detail-basis")?.textContent ?? "";
      expect(basis).toMatch(/43㎡/);
      expect(basis).toMatch(/3억 2,000만원/);
      // 예전 3줄 설명은 문장이 셋이었다. 한 문장으로 줄인다.
      expect((basis.match(/요\./g) ?? []).length).toBeLessThanOrEqual(1);
      expect(container.querySelector(".complex-detail-area-note")).toBeNull();
    });

    it("등급 배지는 그대로 두되 숫자는 아래 블록에만 둔다", () => {
      const { container } = renderDetail();
      expect(container.querySelector(".safety-level")?.textContent).toBe("안전");
      expect(container.querySelector(".safety-badge dl")).toBeNull();
      expect(container.querySelector(".safety-badge .safety-stress")).toBeNull();
    });
  });
});
