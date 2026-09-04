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
    householdCount: null,
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

/**
 * 예상 매수금액 입력란에 값을 넣는다 — 이 화면의 유일한 가격 입력이다.
 *
 * ⚠ **먼저 비운다.** 이 칸은 이제 이 평형의 실거래 범위 위쪽으로
 * 채워진 채 시작하므로(`ComplexDetail`의 `askingPrice` 문서), 그냥
 * 타이핑하면 기본값 뒤에 붙어 엉뚱한 금액이 된다.
 *
 * ⚠ **끝에 `tab()`으로 블러(blur)한다.** 이 입력란은 `commitOn="blur"`
 * 다(사용자 지시: "입력하면 그 자리에 확정된 금액이 적히도록") — 타이핑
 * 하는 동안은 부모(`askingPrice`)를 건드리지 않으므로, 벗어나기 전까지는
 * 아래 부대비용·최대 대출이 여전히 예전 값이다.
 */
async function enterPrice(won: string) {
  const input = screen.getByLabelText("예상 매수금액");
  await userEvent.clear(input);
  await userEvent.type(input, won);
  await userEvent.tab();
}

/**
 * 예상 매수금액을 비운다 — "아직 안 넣은" 상태를 만드는 유일한 길이다.
 * `commitOn="blur"`라 비운 뒤에도 `tab()`으로 벗어나야 확정된다(위
 * `enterPrice` 문서와 같은 이유).
 */
async function clearPrice() {
  await userEvent.clear(screen.getByLabelText("예상 매수금액"));
  await userEvent.tab();
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

describe("ComplexDetail — 예상 매수금액이 아래 전부를 움직인다", () => {
  /**
   * 사용자 지시로 이 화면의 가격 입력란은 하나다. 예전에는 위쪽 계산이
   * `unit.maxPrice` 고정이고 호가 입력이 접힌 영역 안에 따로 있어, 한
   * 화면이 두 가격을 기준으로 말했다.
   */
  it("가격 입력란이 하나뿐이다", () => {
    const { container } = renderDetail();
    expect(screen.getByLabelText("예상 매수금액")).toBeInTheDocument();
    /*
      호가 입력란(`PriceCheck`가 스스로 그리던 것)은 더 이상 없다.
      `queryByLabelText(/호가/)`로 재지 않는다 — 그 영역의 **판정 결과**
      에도 "호가"가 들어간 라벨이 여럿 있어서(`.price-evidence` 등)
      입력란이 없어도 걸린다. 실제로 세야 하는 것은 **입력 요소의 수**다.
    */
    /*
      ⚠ **"숫자 입력이 하나"가 아니라 "가격 입력이 하나"다.** 계산기의
      대출금액 칸도 `inputmode="numeric"`이지만 그건 **가격**이 아니라
      빌릴 금액이라 세면 안 된다(예전에는 가격이 채워지기 전이라 계산기
      자체가 없어서 우연히 1이었다). 실제로 잠가야 하는 것은 이 화면에
      **가격을 정하는 칸이 둘 있지 않다**는 것이다.
    */
    const priceForm = container.querySelector(".complex-detail-price-form");
    expect(priceForm?.querySelectorAll("input")).toHaveLength(1);
    expect(container.querySelector(".price-check-form")).toBeNull();
  });

  /** 빈 표는 언제나 "계산해 봤더니 0"으로 읽힌다 */
  /**
   * 사용자 리포트: "부대비용, 매달나가는돈 확인란이 다 없어졌어."
   *
   * 한동안 이 칸이 빈 채로 시작해서, 상세를 열자마자 두 블록이 없고
   * 안내 한 줄만 남았다. 이제 이 평형의 실거래 범위 위쪽으로 채워 두고
   * 시작한다 — 열자마자 숫자가 보이고, 사용자는 자기 호가로 고쳐 쓴다.
   */
  it("상세를 열면 예상 매수금액이 이 평형 기준으로 채워져 두 블록이 바로 보인다", () => {
    renderDetail({ unit: unit({ maxPrice: 1_200_000_000 }) });

    /*
      이 입력란은 `commitOn="blur"`다(사용자 지시) — 값이 확정되면
      되비추기(.echo)가 아니라 **입력란 자신**이 사람이 읽는 형태로
      바뀐다(`formatWon`). 12억원이 그 형태다.
    */
    expect(screen.getByLabelText("예상 매수금액")).toHaveValue("12억원");
    expect(screen.getByText("취득시 부대비용")).toBeInTheDocument();
    expect(screen.getByText("매달 나가는 돈")).toBeInTheDocument();
    expect(
      screen.queryByText(/예상 매수금액을 넣으면 취득시 부대비용과 매달 나가는 돈을 계산해요/),
    ).not.toBeInTheDocument();
  });

  it("가격을 비우면 0원짜리 표 대신 무엇을 하면 되는지 말한다", async () => {
    renderDetail();
    await clearPrice();

    expect(
      screen.getByText(/예상 매수금액을 넣으면 취득시 부대비용과 매달 나가는 돈을 계산해요/),
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
  /**
   * 사용자 지시로 이 줄은 **금액이 줄을 바꿔 크게 선다** — 아래 계산기에
   * 얼마를 넣을지 정하는 기준이라 문장에 섞이면 안 된다. 그리고 금액은
   * 만원 단위까지만 적는다.
   */
  it("이 가격에서 받을 수 있는 최대 대출액을 만원 단위로 알려준다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    const line = container.querySelector(".detail-max-loan");
    expect(line).toHaveTextContent("이 가격에 매수할 경우 최대 대출은");

    // 금액은 문장과 **다른 요소**여야 한다(줄바꿈·굵기·크기가 거기 걸린다).
    const amount = container.querySelector(".detail-max-loan-amount");
    expect(amount).not.toBeNull();

    // 만원 단위까지만 — 원 단위 잔돈이 남아 있으면 안 된다.
    // (`formatWonRoundedToMan`은 만원 미만을 반올림해 지운다.)
    expect(amount?.textContent).toMatch(/^[\d억,\s만]+원$/);
    expect(amount?.textContent).not.toMatch(/만\s*[\d,]+원$/);

    // 사용자 지시로 문장을 닫던 "이에요."를 뺐다 — 금액이 줄을 바꿔
    // 따로 서면서 그 말이 금액 아래 홀로 떨어져 읽혔다.
    expect(
      container.querySelector(".detail-max-loan-label")?.textContent,
    ).not.toMatch(/이에요/);
  });

  /**
   * 사용자 지시: "대출금 옆에 결정내역 아이콘으로 해서 … 산출내역을
   * 팝업 형식으로 볼 수 있도록."
   *
   * 표 자체는 예산 상세와 **같은 컴포넌트**(`BindingLimitTable`)라 두
   * 화면이 같은 한도를 두고 다른 설명을 할 수 없다. 여기서 검사하는
   * 것은 배선이다: 트리거가 금액 옆에 있고, 그 안의 표가 **이 매물가격
   * 기준**으로 계산됐는가.
   */
  it("최대 대출 옆 아이콘으로 한도 결정 내역을 열어 볼 수 있다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    // ⚠ **`.detail-max-loan` 안으로 좁힌다.** 부대비용 카드도 같은
    // `.detail-binding-toggle` 클래스를 쓰는 "상세보기" 아이콘을 자기
    // 카드 안에 가지고 있어서(사용자 지시로 "동일하게" 만들었다), 좁히지
    // 않으면 DOM에서 먼저 나오는 부대비용 쪽 아이콘을 잘못 집는다.
    const loanBlock = container.querySelector(".detail-max-loan");
    expect(loanBlock).not.toBeNull();
    if (loanBlock === null) return;

    const toggle = loanBlock.querySelector(".detail-binding-toggle");
    expect(toggle).not.toBeNull();
    // 아이콘 하나뿐이라 이름은 `aria-label`이 진다. 사용자 지시로
    // "상세보기"를 담게 바뀌었다.
    expect(toggle).toHaveAttribute("aria-label", "한도 결정 내역 상세보기");

    // 네 가지 한도가 모두 있고, 결정된 것이 표시된다.
    const table = loanBlock.querySelector(".detail-binding-popup .binding-limit-table");
    expect(table).not.toBeNull();
    expect(table).toHaveTextContent("담보 가치(LTV)");
    expect(table).toHaveTextContent("상환 능력(DSR)");
    expect(table).toHaveTextContent("규제지역 상한");
    expect(table).toHaveTextContent("정책대출");
    expect(table?.querySelector('[data-active="true"]')).not.toBeNull();

    // LTV 안내가 **이 매물가격**을 기준으로 말한다 — 12억을 넣었으므로
    // 상세가 예전처럼 `unit.maxPrice`를 말하면 여기서 걸린다.
    expect(table).toHaveTextContent(/매매가 12억원 기준/);
  });

  /**
   * ⚠ **`<dialog>`가 아니라 `<details>`여야 한다.** 모달로 만들면 이
   * 내역이 인쇄에서 통째로 사라진다 — `@media print`의
   * `::details-content` 규칙은 `<details>`에만 걸린다.
   */
  it("결정 내역은 details로 접는다 — 인쇄에서 펼쳐지려면 그 태그여야 한다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    const fold = container
      .querySelector(".detail-max-loan")
      ?.querySelector(".detail-binding");
    expect(fold?.tagName).toBe("DETAILS");
    expect(container.querySelector("dialog")).toBeNull();
    // 기본은 닫힘 — 누르면 열린다.
    expect(fold).not.toHaveAttribute("open");
  });

  /**
   * 사용자 지시: "지금 팝업이 사이드바 위치에 생겨서 내용을 가리는데
   * 오른쪽 맵부분에 생기도록 해줘." — CSS는 `position: fixed`로 뷰포트
   * 기준으로 띄운다(`styles.css`의 `.detail-binding-popup`이 정한다.
   * jsdom은 스타일시트를 실제로 적용·계산하지 않아 여기서 재지
   * 않는다 — 실제 화면 확인은 브라우저로 했다).
   *
   * 이 테스트가 잠그는 것은 **좌표 배선**이다: 아이콘을 열면 그
   * 화면 좌표(`getBoundingClientRect`)를 재서 팝업에 인라인
   * `top`/`left`로 넘긴다는 계약. 값 자체는 jsdom에서 항상 0이지만,
   * "연다고 해서 인라인 좌표가 아예 안 실리는" 회귀는 이걸로 잡는다.
   */
  it("한도 결정 내역을 열면 아이콘 좌표를 팝업에 인라인으로 넘긴다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    const toggle = container
      .querySelector(".detail-max-loan")
      ?.querySelector(".detail-binding-toggle");
    expect(toggle).not.toBeUndefined();
    if (toggle === undefined || toggle === null) return;
    await userEvent.click(toggle);

    // ⚠ 부대비용 카드에도 같은 `.detail-binding-popup`이 있으므로(항상
    // 열리지 않은 채로도 DOM에 존재한다) `.detail-max-loan` 안으로 좁혀
    // 방금 연 팝업을 정확히 집는다 — 안 좁히면 안 열어 본 팝업의(top:0px
    // 그대로인) 인라인 스타일을 우연히 통과시킬 수 있다.
    const popup = container
      .querySelector(".detail-max-loan")
      ?.querySelector(".detail-binding-popup") as HTMLElement | null | undefined;
    expect(popup).not.toBeUndefined();
    expect(popup).not.toBeNull();
    expect(popup?.style.top).not.toBe("");
    expect(popup?.style.left).not.toBe("");
  });

  /**
   * 사용자 지시: "취득시 부대비용 카드의 상세보기도 첨부한 사진처럼
   * 동일하게 만들어줘(아이콘 형태, 팝업형식, 자연스러운 연결, 글자크기
   * 축소 등 동일하게)" — 최대 대출 카드의 "한도 결정 내역" 팝업과 같은
   * 조합(`DetailViewIcon` 트리거 + `<details>` + `.detail-binding-popup`)
   * 이어야 한다. 표 자체는 예산 상세와 **같은 컴포넌트**
   * (`CostBreakdownTable`)라 두 화면이 같은 부대비용을 두고 다른 숫자를
   * 말할 수 없다 — 여기서 검사하는 것은 배선이다.
   */
  it("부대비용 옆 아이콘으로 상세 내역을 열어 볼 수 있다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    // ⚠ **`.detail-block--costs` 안으로 좁힌다.** 최대 대출 카드도 같은
    // `.detail-binding-toggle`을 쓰므로, 안 좁히면 그쪽 아이콘을 잘못
    // 집을 수 있다.
    const costBlock = container.querySelector(".detail-block--costs");
    expect(costBlock).not.toBeNull();
    if (costBlock === null) return;

    const toggle = costBlock.querySelector(".detail-binding-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-label", "취득시 부대비용 내역 상세보기");

    // `<dialog>`가 아니라 `<details>`다 — 인쇄에서 `::details-content`가
    // 강제로 펼쳐 준다(최대 대출 팝업과 같은 이유).
    const fold = costBlock.querySelector(".detail-binding");
    expect(fold?.tagName).toBe("DETAILS");
    expect(container.querySelector("dialog")).toBeNull();

    // 항목별 표(부대비용 카드와 같은 표, `CostBreakdownTable`)가 담겨 있다.
    const table = costBlock.querySelector(".detail-binding-popup .cost-breakdown-table");
    expect(table).not.toBeNull();
    expect(table).toHaveTextContent("취득세 (지방교육세·농특세 포함)");
    expect(table).toHaveTextContent("중개보수 (부가세 포함)");
    expect(table).toHaveTextContent("법무사 비용");
    expect(table).toHaveTextContent("이사 비용");
    expect(table).toHaveTextContent(/국민주택채권/);
  });

  it("부대비용 상세 내역을 열면 아이콘 좌표를 팝업에 인라인으로 넘긴다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    const toggle = container
      .querySelector(".detail-block--costs")
      ?.querySelector(".detail-binding-toggle");
    expect(toggle).not.toBeUndefined();
    if (toggle === undefined || toggle === null) return;
    await userEvent.click(toggle);

    const popup = container
      .querySelector(".detail-block--costs")
      ?.querySelector(".detail-binding-popup") as HTMLElement | null | undefined;
    expect(popup).not.toBeUndefined();
    expect(popup).not.toBeNull();
    expect(popup?.style.top).not.toBe("");
    expect(popup?.style.left).not.toBe("");
  });

  /**
   * 사용자 지시: "스크롤을 이동하면 연결된 상자도 같이 움직이게 해줘." —
   * 예전엔 아이콘을 열 때 좌표를 한 번만 쟀다(위 두 테스트가 그 배선을
   * 잠근다). 이 테스트는 **그 이후로도** 스크롤할 때마다 다시 재는지,
   * 그리고 팝업을 닫으면 더는 재지 않는지를 본다 — `getBoundingClientRect`를
   * 호출마다 다른 값을 내도록 흉내 내, 인라인 좌표가 실제로 갱신되는지로
   * 확인한다.
   */
  it("팝업이 열린 동안 스크롤하면 위치를 다시 잰다 — 닫으면 더는 재지 않는다", async () => {
    const { container } = renderDetail();
    await enterPrice("120000");

    let rectTop = 100;
    const getRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        rectTop += 10;
        return {
          top: rectTop,
          right: 200,
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON() {},
        } as DOMRect;
      });

    const toggle = container
      .querySelector(".detail-max-loan")
      ?.querySelector(".detail-binding-toggle");
    expect(toggle).not.toBeUndefined();
    if (toggle === undefined || toggle === null) return;
    await userEvent.click(toggle);

    const popup = () =>
      container
        .querySelector(".detail-max-loan")
        ?.querySelector(".detail-binding-popup") as HTMLElement;

    const openedTop = popup().style.top;

    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(popup().style.top).not.toBe(openedTop));
    const scrolledTop = popup().style.top;

    // 닫는다 — 리스너가 떨어져 나가 이후 스크롤은 더 이상 좌표를 갱신하지 않는다.
    await userEvent.click(toggle);
    window.dispatchEvent(new Event("scroll"));
    expect(popup().style.top).toBe(scrolledTop);

    getRectSpy.mockRestore();
  });

  /**
   * 사용자 리포트: "대출입력하는 모듈이 없어졌어".
   *
   * 원인은 `neededLoan === 0`(현금이 이 가격+부대비용을 다 덮는다)일 때
   * `LoanCalculator` 전체를 안 그리고 "대출 없이 살 수 있어요"만 그리던
   * 분기였다. 사용자 지시는 "사용자가 본인이 필요한 대출액을 직접
   * 입력"이라, **대출이 필요한지와 무관하게** 언제나 금액을 넣어 볼 수
   * 있어야 한다 — 현금이 충분해도 레버리지를 검토해 볼 수 있다.
   */
  it("현금으로 다 덮이는 가격이어도 대출 입력 계산기는 사라지지 않는다", async () => {
    // cash 7억, 가격 3억 — 부대비용을 더해도 여유가 커서 neededLoan은 0이다.
    renderDetail({ profile: profile({ cash: 700_000_000 }) });
    await enterPrice("30000");

    // 사실은 사실대로 남는다.
    expect(screen.getByText("대출 없이 살 수 있어요")).toBeInTheDocument();

    // 그리고 계산기는 여전히 그대로 있다 — 대출금액을 직접 넣을 수 있다.
    expect(screen.getByLabelText("대출금액")).toBeInTheDocument();
    expect(screen.getByLabelText(/금리/)).toBeInTheDocument();
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

    // enterPrice가 이미 지우고 다시 채우므로 별도로 비울 필요가 없다.
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
  it("호가 위치 확인도 같은 예상 매수금액을 기준으로 판정한다", async () => {
    renderDetail();
    await enterPrice("120000");

    expect(
      screen.getByText(/위에 넣은 예상 매수금액 12억원 기준이에요/),
    ).toBeInTheDocument();
  });

  it("가격을 비우면 호가 판정도 무엇을 하면 되는지 말한다", async () => {
    renderDetail();
    await clearPrice();
    expect(
      screen.getByText(/위 예상 매수금액을 넣으면 이 평형의 실거래 범위 어디쯤인지/),
    ).toBeInTheDocument();
  });

  /**
   * 평형을 갈아타면 가격도 그 평형 기준으로 돌아가야 한다.
   *
   * ⚠ **없으면 조용한 오답이다** — 59㎡를 보다가 84㎡ 칩을 눌러도 가격이
   * 59㎡의 것으로 남아, 화면은 멀쩡한 부대비용·상환액을 내는데 그 숫자가
   * 통째로 다른 평형에 대한 것이 된다.
   */
  it("평형을 갈아타면 예상 매수금액이 그 평형 기준으로 다시 채워진다", () => {
    const small = unit({ areaBucket: 59, maxPrice: 683_000_000 });
    const large = unit({ areaBucket: 84, maxPrice: 920_000_000 });

    // 호출부(App)가 고른 평형을 내려 주는 구조라, 칩을 누르면 부모가
    // `unit`을 바꿔 다시 그린다 — 그 흐름을 rerender로 재현한다.
    const { rerender } = render(
      <ComplexDetail
        unit={small}
        units={[small, large]}
        onSelectUnit={vi.fn()}
        householdCountNote={주택수고지}
        priceBudget={{ profile: profile(), financeRules: rules }}
        profile={profile()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("예상 매수금액")).toHaveValue("6억 8,300만원");

    rerender(
      <ComplexDetail
        unit={large}
        units={[small, large]}
        onSelectUnit={vi.fn()}
        householdCountNote={주택수고지}
        priceBudget={{ profile: profile(), financeRules: rules }}
        profile={profile()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("예상 매수금액")).toHaveValue("9억 2,000만원");
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
