import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComplexUnit, TradeRecord } from "../data/complexes";
import type { BuyerProfile } from "../lib/finance";
import { rules } from "../state/useAffordability";
import { ComplexDetail } from "./ComplexDetail";

function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    price: 1_200_000_000,
    contractDate: "2026-07-10",
    floor: 12,
    ...overrides,
  };
}

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
    address: "서울특별시 강남구 대치동 316",
    tradeCount: 1,
    trades: [trade()],
    minPrice: 1_200_000_000,
    maxPrice: 1_200_000_000,
    minFloor: 12,
    maxFloor: 12,
    unknownFloorCount: 0,
    lowConfidence: false,
    ...overrides,
  };
}

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    ownedHomeCount: 0,
    cash: 700_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 59,
    isRegulatedArea: true,
    ...overrides,
  };
}

/** 취득세 줄에 붙는 주택 수 고지. 호출부가 골라 넘기는 값이라 여기서 고정한다 */
const 주택수고지 = rules.acquisitionTax.householdCountNote;

interface RenderOverrides {
  unit?: ComplexUnit;
  units?: ComplexUnit[];
  profile?: BuyerProfile | null;
  onSelectUnit?: (unit: ComplexUnit) => void;
  onClose?: () => void;
}

function renderDetail(overrides: RenderOverrides = {}) {
  const u = overrides.unit ?? unit();
  const p = overrides.profile === undefined ? profile() : overrides.profile;
  return render(
    <ComplexDetail
      unit={u}
      units={overrides.units ?? [u]}
      onSelectUnit={overrides.onSelectUnit ?? vi.fn()}
      householdCountNote={주택수고지}
      priceBudget={p === null ? null : { profile: p, financeRules: rules }}
      profile={p}
      onClose={overrides.onClose ?? vi.fn()}
    />,
  );
}

/** 매물가격 입력란에 값을 넣는다 — 이 화면의 유일한 가격 입력이다 */
async function enterPrice(won: string) {
  await userEvent.type(screen.getByLabelText("매물가격"), won);
}

describe("ComplexDetail — 제목과 사실 줄", () => {
  /**
   * 사용자 지시: "면적은 삭제하고 제목으로 아파트 단지 이름만 남기고
   * 나머지는 아래 설명부분으로 이동시켜줘."
   */
  it("제목은 단지 이름 하나다 — 면적도 법정동도 제목에 없다", () => {
    renderDetail({ unit: unit({ areaBucket: 84 }) });
    const title = screen.getByRole("heading", { name: "테스트아파트" });
    expect(title).toBeInTheDocument();
    expect(title.textContent).toBe("테스트아파트");
    expect(title.textContent).not.toContain("84");
    expect(title.textContent).not.toContain("대치동");
  });

  it("주소와 준공년(경과년수)을 사실 줄로 보여준다", () => {
    const { container } = renderDetail({ unit: unit({ builtYear: 2000 }) });
    const facts = container.querySelector(".complex-detail-facts");
    expect(facts).toHaveTextContent("서울특별시 강남구 대치동 316");
    // 경과년수는 오늘 기준으로 센다 — 연도를 하드코딩하지 않고 같은 규칙으로 만든다.
    const age = new Date().getFullYear() - 2000;
    expect(facts).toHaveTextContent(`2000년 준공 · ${age}년차`);
  });

  /**
   * 주소가 없는 것은 우리가 못 만든 것이지 그 단지에 주소가 없는 것이
   * 아니다 — "주소 없음"이라고 적으면 없는 사실을 말하게 된다.
   */
  it("주소가 없으면 그 줄을 만들지 않는다 — '주소 없음'이라고 적지 않는다", () => {
    const { container } = renderDetail({ unit: unit({ address: null }) });
    const facts = container.querySelector(".complex-detail-facts");
    expect(facts?.querySelector(".complex-detail-address")).toBeNull();
    expect(facts).toHaveTextContent("2015년 준공");
    expect(container.textContent).not.toContain("주소 없음");
  });

  /** 맨숫자 0은 답의 모양을 한 거짓말이다 — "0년차"라고 적지 않는다 */
  it("올해 준공이면 경과년수를 붙이지 않는다", () => {
    const thisYear = new Date().getFullYear();
    const { container } = renderDetail({ unit: unit({ builtYear: thisYear }) });
    const facts = container.querySelector(".complex-detail-facts");
    expect(facts).toHaveTextContent(`${thisYear}년 준공`);
    expect(facts?.textContent).not.toContain("0년차");
  });
});

describe("ComplexDetail — 평형(타입) 선택기", () => {
  const 평형59 = unit({ areaBucket: 59 });
  const 평형84 = unit({ areaBucket: 84 });
  const 평형114 = unit({ areaBucket: 114 });

  it("같은 단지의 평형을 면적 오름차순으로 보여준다", () => {
    renderDetail({ unit: 평형84, units: [평형114, 평형59, 평형84] });
    const group = screen.getByRole("group", { name: "평형 고르기" });
    const labels = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["59㎡", "84㎡", "114㎡"]);
  });

  it("지금 고른 평형을 aria-pressed로 알린다 — 색만으로 말하지 않는다", () => {
    renderDetail({ unit: 평형84, units: [평형59, 평형84] });
    expect(screen.getByRole("button", { name: "84㎡" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "59㎡" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("평형을 누르면 그 평형으로 갈아탄다", async () => {
    const onSelectUnit = vi.fn();
    renderDetail({ unit: 평형59, units: [평형59, 평형84], onSelectUnit });

    await userEvent.click(screen.getByRole("button", { name: "84㎡" }));

    expect(onSelectUnit).toHaveBeenCalledWith(평형84);
  });

  /**
   * 다른 단지의 평형이 섞이면 이 단지에 없는 평형을 고를 수 있게 된다.
   */
  it("다른 단지의 평형은 섞지 않는다", () => {
    const 다른단지 = unit({ complexKey: "11680-9999", areaBucket: 101 });
    renderDetail({ unit: 평형59, units: [평형59, 평형84, 다른단지] });
    expect(screen.queryByRole("button", { name: "101㎡" })).not.toBeInTheDocument();
  });

  /** 고를 것이 없는데 눌린 버튼 하나가 떠 있으면 무엇을 하라는 장치인지 알 수 없다 */
  it("평형이 하나뿐이면 선택기를 그리지 않는다", () => {
    renderDetail({ unit: 평형59, units: [평형59] });
    expect(
      screen.queryByRole("group", { name: "평형 고르기" }),
    ).not.toBeInTheDocument();
  });
});

describe("ComplexDetail — 실거래 내역", () => {
  it("거래일·거래가·층을 표로 보여준다", () => {
    renderDetail({
      unit: unit({
        tradeCount: 2,
        trades: [
          trade({ price: 1_250_000_000, contractDate: "2026-07-10", floor: 12 }),
          trade({ price: 1_180_000_000, contractDate: "2026-05-02", floor: 3 }),
        ],
      }),
    });

    const table = screen.getByRole("table");
    expect(within(table).getByText("2026.07.10")).toBeInTheDocument();
    expect(within(table).getByText("12억 5,000만원")).toBeInTheDocument();
    expect(within(table).getByText("12층")).toBeInTheDocument();
    expect(within(table).getByText("2026.05.02")).toBeInTheDocument();
    expect(within(table).getByText("11억 8,000만원")).toBeInTheDocument();
    expect(within(table).getByText("3층")).toBeInTheDocument();
  });

  /**
   * 층을 모르면 빈 칸으로 두지 않는다 — 빈 칸은 읽는 사람이 알아서
   * 채우는 자리가 된다. 파이프라인이 0층·1층으로 채우지 않는 규칙의
   * 화면 쪽 절반이다.
   */
  it("층을 모르면 '모름'이라고 적는다 — 칸을 비우지 않는다", () => {
    renderDetail({
      unit: unit({ tradeCount: 1, trades: [trade({ floor: null })] }),
    });
    expect(screen.getByText("모름")).toBeInTheDocument();
  });

  it("거래가 없으면 없다고 말한다", () => {
    renderDetail({ unit: unit({ tradeCount: 0, trades: [] }) });
    expect(screen.getByText(/최근 6개월 거래가 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  /**
   * `tradeCount`가 0보다 큰데 `trades`가 비어 있으면 그건 거래가 없는
   * 게 아니라 **내역을 받지 못한 것**이다. 두 상태를 같은 빈 표로 그리면
   * 화면이 없는 사실을 말한다.
   */
  it("건수는 있는데 내역이 없으면 '거래가 없다'고 말하지 않는다", () => {
    renderDetail({ unit: unit({ tradeCount: 5, trades: [] }) });
    expect(
      screen.getByText(/거래는 5건인데, 거래 내역을 받지 못했어요/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/거래가 없어요/)).not.toBeInTheDocument();
  });
});

describe("ComplexDetail — 매물가격이 아래 전부를 움직인다", () => {
  /**
   * 사용자 지시로 이 화면의 가격 입력란은 하나다. 예전에는 위쪽 계산이
   * `unit.maxPrice` 고정이고 호가 입력이 접힌 영역 안에 따로 있어, 한
   * 화면이 두 가격을 기준으로 말했다.
   */
  it("가격 입력란이 하나뿐이다", () => {
    const { container } = renderDetail();
    expect(screen.getByLabelText("매물가격")).toBeInTheDocument();
    /*
      호가 입력란(`PriceCheck`가 스스로 그리던 것)은 더 이상 없다.
      `queryByLabelText(/호가/)`로 재지 않는다 — 그 영역의 **판정 결과**
      에도 "호가"가 들어간 라벨이 여럿 있어서(`.price-evidence` 등)
      입력란이 없어도 걸린다. 실제로 세야 하는 것은 **입력 요소의 수**다.
    */
    expect(container.querySelectorAll("input[inputmode='numeric']")).toHaveLength(
      1,
    );
    expect(container.querySelector(".price-check-form")).toBeNull();
  });

  /** 빈 표는 언제나 "계산해 봤더니 0"으로 읽힌다 */
  it("가격을 넣기 전에는 0원짜리 표 대신 무엇을 하면 되는지 말한다", () => {
    renderDetail();
    expect(
      screen.getByText(/매물가격을 넣으면 취득시 부대비용과 매달 나가는 돈을 계산해요/),
    ).toBeInTheDocument();
    expect(screen.queryByText("취득시 부대비용")).not.toBeInTheDocument();
  });

  it("예산이 없으면 예산을 먼저 넣으라고 말한다", () => {
    renderDetail({ profile: null });
    expect(
      screen.getByText(/예산\(현금·연 소득\)을 먼저 넣으면/),
    ).toBeInTheDocument();
  });

  it("가격을 넣으면 취득시 부대비용과 매달 나가는 돈이 나온다", async () => {
    renderDetail();
    await enterPrice("120000");

    expect(screen.getByText("취득시 부대비용")).toBeInTheDocument();
    expect(screen.getByText("매달 나가는 돈")).toBeInTheDocument();
  });

  /** 사용자 지시: "매달 나가는 돈은 최대 대출가능 금액을 알려주면" */
  it("이 가격에서 받을 수 있는 최대 대출액을 알려준다", async () => {
    renderDetail();
    await enterPrice("120000");

    expect(
      screen.getByText(/이 가격에서 받을 수 있는 최대 대출은/),
    ).toBeInTheDocument();
  });

  /**
   * 부대비용은 넣은 가격에서 다시 계산돼야 한다 — 예전처럼
   * `unit.maxPrice` 고정이면 화면이 사용자가 넣지 않은 가격의 숫자를
   * 낸다.
   */
  it("가격을 바꾸면 부대비용도 함께 바뀐다", async () => {
    const { container } = renderDetail();
    const total = () =>
      container.querySelector(".detail-block--costs .detail-stat-value")
        ?.textContent;

    await enterPrice("100000");
    const 싼값 = total();

    await userEvent.clear(screen.getByLabelText("매물가격"));
    await enterPrice("150000");

    expect(total()).not.toBe(싼값);
  });

  it("부대비용 옆에 주택 수 고지가 함께 나온다", async () => {
    renderDetail();
    await enterPrice("120000");
    expect(screen.getByText(주택수고지)).toBeInTheDocument();
  });

  /**
   * 호가 위치 확인이 **같은 가격**을 쓴다. 두 값이 갈리면 위쪽 부대비용과
   * 아래쪽 호가 판정이 서로 다른 가격을 말하게 된다.
   */
  it("호가 위치 확인도 같은 매물가격을 기준으로 판정한다", async () => {
    renderDetail();
    await enterPrice("120000");

    expect(
      screen.getByText(/위에 넣은 매물가격 12억원 기준이에요/),
    ).toBeInTheDocument();
  });

  it("가격을 넣기 전에는 호가 판정도 무엇을 하면 되는지 말한다", () => {
    renderDetail();
    expect(
      screen.getByText(/위 매물가격을 넣으면 이 평형의 실거래 범위 어디쯤인지/),
    ).toBeInTheDocument();
  });
});

describe("ComplexDetail — 대출액·금리를 직접 넣고 원리금과 등급을 본다", () => {
  /**
   * 사용자 지시: "사용자가 본인이 필요한 대출액을 직접 입력하고, 그에따른
   * 원리금을 볼수 있도록 ... 사용자가 금리를 조절할수 있도록 ... 소득대비
   * 원리금이 적정한지 판단해서 안전/주의/경고 등을 알려줘."
   *
   * 계산기가 **접힌 부속이 아니라 이 블록의 본문**이다 — 예전에는
   * 셰브런 뒤에 숨어 있었다.
   */
  it("대출액·금리 입력란이 펼치지 않아도 바로 보인다", async () => {
    renderDetail();
    await enterPrice("120000");

    expect(screen.getByLabelText("대출금액")).toBeInTheDocument();
    expect(screen.getByLabelText("금리 (연 %)")).toBeInTheDocument();
  });

  it("소득 대비 상환부담률과 등급을 함께 낸다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    expect(container.querySelector("[data-field='burdenRatio']")).not.toBeNull();
    const grade = container.querySelector("[data-field='grade']");
    expect(grade).not.toBeNull();
    expect(["안전", "주의", "위험"]).toContain(grade?.textContent);
  });

  /** 등급은 색이 아니라 글자가 지고, 색 구분은 `data-level`이 건다 */
  it("등급에 data-level이 붙는다 — 색만으로 뜻을 전달하지 않는다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    const grade = container.querySelector("[data-field='grade']");
    expect(["safe", "caution", "danger"]).toContain(
      grade?.getAttribute("data-level"),
    );
  });

  /**
   * 금리를 올리면 상환액이 늘고, 늘어난 상환액으로 등급이 다시 매겨져야
   * 한다 — 룰셋 기준 금리로 재면 화면이 방금 보여준 상환액과 다른 전제의
   * 등급을 내놓는다.
   */
  it("금리를 올리면 월 상환액이 늘어난다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    const payment = () =>
      container.querySelector("[data-field='monthlyPayment']")?.textContent;
    const 기본금리 = payment();

    const rate = screen.getByLabelText("금리 (연 %)");
    await userEvent.clear(rate);
    await userEvent.type(rate, "9");

    expect(payment()).not.toBe(기본금리);
  });

  it("한도를 넘는 대출액은 계산하지 않고 왜 안 했는지 말한다", async () => {
    renderDetail();
    await enterPrice("120000");

    const amount = screen.getByLabelText("대출금액");
    await userEvent.clear(amount);
    await userEvent.type(amount, "990000");

    expect(
      screen.getByText(/받을 수 있는 최대 대출액은 .*그보다 큰 금액으로는 계산하지 않았어요/),
    ).toBeInTheDocument();
  });
});

describe("ComplexDetail — 접는 것과 지우는 것은 다르다", () => {
  /**
   * `PriceCheck`·`LocationFacts`는 `<details>`로 접되 지우지 않는다.
   * 두 영역의 고지는 대부분 `MUST_SURVIVE_PRINT_CLASSES`이고, 인쇄에서
   * 펼치는 규칙(`::details-content`)은 **진짜 `<details>`에만** 걸린다 —
   * 직접 만든 상자로 접으면 종이에서 내용이 통째로 사라진다.
   */
  it("호가·입지는 네이티브 details로 접는다", () => {
    const { container } = renderDetail();
    expect(container.querySelector("details.detail-fold--price")).not.toBeNull();
    expect(
      container.querySelector("details.detail-fold--location"),
    ).not.toBeNull();
  });

  it("접혀 있어도 안의 고지가 DOM에 그대로 있다 — 인쇄에서 펼쳐진다", () => {
    const { container } = renderDetail();
    const fold = container.querySelector("details.detail-fold--price");
    expect(fold).not.toHaveAttribute("open");
    // 이 화면이 값을 매기지 않는다는 고지는 접힌 안에 그대로 있어야 한다.
    expect(fold?.querySelector(".price-no-estimate")).not.toBeNull();
  });

  it("목록으로 돌아가는 버튼이 있다", async () => {
    const onClose = vi.fn();
    renderDetail({ onClose });
    await userEvent.click(screen.getByRole("button", { name: /목록으로/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
