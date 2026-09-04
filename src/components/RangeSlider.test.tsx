import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axisLabelTicks, niceAxisStep, niceAxisTicks, RangeSlider } from "./RangeSlider";

function renderSlider(
  over: Partial<React.ComponentProps<typeof RangeSlider>> = {},
) {
  const onChange = over.onChange ?? vi.fn();
  render(
    <RangeSlider
      label="면적"
      min={0}
      max={200}
      step={1}
      value={{ min: 50, max: 150 }}
      formatValue={(v) => `${v}㎡`}
      {...over}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("RangeSlider", () => {
  it("시각 라벨을 낸다", () => {
    renderSlider({ label: "면적" });
    expect(screen.getByText("면적")).toBeInTheDocument();
  });

  it("지금 범위를 formatValue로 낸다", () => {
    renderSlider({ value: { min: 59, max: 84 }, formatValue: (v) => `${v}㎡` });
    expect(screen.getByText("59㎡ ~ 84㎡")).toBeInTheDocument();
  });

  /**
   * 사용자 지시(참고 사진): 손잡이가 아직 경계값(min/max) 그대로면
   * 숫자 대신 "전체"를 강조색으로 낸다.
   */
  it("값이 min/max 그대로면 '전체'를 낸다 — 숫자를 내지 않는다", () => {
    renderSlider({ min: 0, max: 200, value: { min: 0, max: 200 } });
    expect(screen.getByText("전체")).toBeInTheDocument();
    expect(screen.queryByText(/~/)).not.toBeInTheDocument();
  });

  it("한쪽만 min/max와 같아도 '전체'가 아니다", () => {
    renderSlider({ min: 0, max: 200, value: { min: 0, max: 150 } });
    expect(screen.queryByText("전체")).not.toBeInTheDocument();
  });

  /**
   * 두 손잡이가 **접근성 이름으로 구분된다**는 것이 핵심이다. SEED
   * `Slider`의 `label` prop을 그대로 썼다면 `aria-labelledby`가
   * `aria-label`을 덮어써 두 손잡이 이름이 똑같이 "면적"으로 접힌다 —
   * 이 테스트가 실제로 이름으로 조회되는지를 확인해 그 회귀를 잡는다
   * (RangeSlider.tsx의 같은 주석 참고).
   */
  it("손잡이가 둘이고, 접근성 이름으로 최소·최대가 구분된다", () => {
    renderSlider({ label: "면적" });
    expect(screen.getByRole("slider", { name: "면적 최소" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "면적 최대" })).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("SEED 슬라이더의 범위가 넘긴 min/max/value와 맞는다", () => {
    renderSlider({ min: 0, max: 200, value: { min: 50, max: 150 } });
    const lo = screen.getByRole("slider", { name: "면적 최소" });
    const hi = screen.getByRole("slider", { name: "면적 최대" });
    expect(lo).toHaveAttribute("aria-valuemin", "0");
    expect(lo).toHaveAttribute("aria-valuemax", "200");
    expect(lo).toHaveAttribute("aria-valuenow", "50");
    expect(hi).toHaveAttribute("aria-valuenow", "150");
  });

  it("aria-valuetext로 formatValue가 사람이 읽는 값을 낸다", () => {
    renderSlider({ value: { min: 50, max: 150 }, formatValue: (v) => `${v}㎡` });
    expect(
      screen.getByRole("slider", { name: "면적 최소" }),
    ).toHaveAttribute("aria-valuetext", "50㎡");
  });

  it("최소 손잡이를 Home으로 밀면 하한이 min으로 바뀐다", () => {
    const { onChange } = renderSlider({ value: { min: 50, max: 150 } });
    fireEvent.keyDown(screen.getByRole("slider", { name: "면적 최소" }), {
      key: "Home",
    });
    expect(onChange).toHaveBeenCalledWith({ min: 0, max: 150 });
  });

  it("최대 손잡이를 End로 밀면 상한이 max로 바뀐다", () => {
    const { onChange } = renderSlider({ value: { min: 50, max: 150 } });
    fireEvent.keyDown(screen.getByRole("slider", { name: "면적 최대" }), {
      key: "End",
    });
    expect(onChange).toHaveBeenCalledWith({ min: 50, max: 200 });
  });

  /**
   * ⚠ **SEED 슬라이더는 화살표 키가 "어느 손잡이"를 움직일지를
   * `focus` 이벤트로만 기억한다** — keyDown을 받은 DOM 요소가 아니라,
   * 가장 최근 `focus`가 들어온 손잡이를 움직인다(실제 브라우저에서는
   * 클릭·Tab이 항상 focus를 먼저 낸다). 그래서 테스트에서 특정
   * 손잡이를 화살표 키로 움직이려면 **keyDown 전에 반드시 그 손잡이에
   * focus를 먼저 보내야 한다** — Home/End는 예외다(각각 언제나 첫째·
   * 마지막 손잡이를 움직이도록 라이브러리가 못박아 둬서 focus와
   * 무관하다).
   */
  it("focus를 먼저 보낸 손잡이만 화살표 키로 움직인다", () => {
    const { onChange } = renderSlider({ value: { min: 50, max: 150 } });
    const hi = screen.getByRole("slider", { name: "면적 최대" });
    fireEvent.focus(hi);
    fireEvent.keyDown(hi, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith({ min: 50, max: 149 });
  });

  /**
   * `minStepsBetweenThumbs={1}` — 최소 손잡이가 최대 손잡이를 지나치지
   * 못한다. 지나치면 뒤집힌 범위(min > max)가 만들어져 결과가 조용히
   * 0건이 된다.
   */
  it("최소 손잡이가 최대 손잡이를 지나치지 못한다", () => {
    const onChange = vi.fn();
    renderSlider({ value: { min: 50, max: 51 }, onChange });
    const lo = screen.getByRole("slider", { name: "면적 최소" });
    fireEvent.focus(lo);
    fireEvent.keyDown(lo, { key: "ArrowRight" });
    expect(
      onChange.mock.calls.every(([range]) => range.min <= range.max),
    ).toBe(true);
  });

  describe("축 눈금", () => {
    it("0~42 범위에서 10 간격을 고른다 — 4~5개로 나뉘는 흔한 수", () => {
      renderSlider({
        min: 0,
        max: 42,
        value: { min: 0, max: 42 },
        formatTick: (v) => `${v}`,
      });
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("최대")).toBeInTheDocument();
      // 42 자체(실제 데이터 최댓값, 뜻 없는 수)는 눈금으로 찍지 않는다 —
      // "최대"라는 말이 그 자리를 대신한다.
      expect(screen.queryByText("42")).not.toBeInTheDocument();
      /*
       * 리뷰: "40"은 42(=max)와 축 전체 길이의 4.76%밖에 안 떨어져
       * "최대"와 화면에서 "최0평"처럼 겹쳐 보였다 — 글자 눈금에서는
       * 뺀다(`axisLabelTicks`, 아래 단위 테스트로 규칙 자체를 따로
       * 확인한다).
       */
      expect(screen.queryByText("40")).not.toBeInTheDocument();
      // 단, 트랙 위 구분선(`.seed-slider-tick`)에는 그대로 남는다 —
      // 가는 선 하나는 글자처럼 옆 눈금과 겹쳐 읽히지 않는다. (0, 10,
      // 20, 30, 40 다섯 개 — niceAxisTicks(0, 42) 그대로.)
      expect(document.querySelectorAll(".seed-slider-tick")).toHaveLength(5);
    });

    it("min이 0이 아니어도 그 지점부터 나이스 넘버로 시작한다", () => {
      // 135~550 같은 실제 지역 매매가 범위(억원 단위)를 흉내낸다.
      renderSlider({
        min: 135,
        max: 550,
        value: { min: 135, max: 550 },
        formatTick: (v) => `${v}`,
      });
      // 135 이상인 100 단위 배수부터: 200, 300, 400. 500은 550(=max)과
      // 12.05%밖에 안 떨어져 "최대"와 겹칠 수 있어 글자에서는 뺀다.
      for (const tick of ["200", "300", "400"]) {
        expect(screen.getByText(tick)).toBeInTheDocument();
      }
      expect(screen.queryByText("500")).not.toBeInTheDocument();
      expect(screen.getByText("최대")).toBeInTheDocument();
    });

    it("formatTick을 따로 주면 눈금에는 그 포맷을, 범위 문구에는 formatValue를 각자 쓴다", () => {
      renderSlider({
        min: 0,
        max: 40,
        value: { min: 10, max: 30 },
        formatValue: (v) => `${v}억원`,
        formatTick: (v) => `${v}억`,
      });
      expect(screen.getByText("10억원 ~ 30억원")).toBeInTheDocument();
      expect(screen.getByText("10억")).toBeInTheDocument();
      expect(screen.getByText("20억")).toBeInTheDocument();
    });

    /*
     * 사용자 지시: "필터부분은 스크롤 사이에 표시된 각 구간에 구분선을
     * 표시해줘." SEED `Slider`의 `ticks` prop이 내는 `.seed-slider-tick`
     * 개수가 `niceAxisTicks`(글자를 거르기 전, 원래 눈금 전부)와
     * 맞는지 — 트랙 위 구분선은 글자 겹침 규칙과 무관하게 전부 선다.
     */
    it("트랙 위 구분선은 축 글자와 별개로 nice 눈금 전부를 낸다", () => {
      renderSlider({ min: 0, max: 200, value: { min: 50, max: 150 } });
      expect(document.querySelectorAll(".seed-slider-tick")).toHaveLength(
        niceAxisTicks(0, 200).length,
      );
    });

    /**
     * 사용자 지시(매매가는 "10억단위로"): `tickUnit`을 주면 그보다 잘게
     * 끊기지 않는다. 억 단위로 흉내내려고 formatTick을 `v/10 → "N0"`
     * 문자열로 준다(1_000_000_000 같은 실제 원 단위는 가독성이 떨어져
     * 단위 자체를 10으로 흉내낸다 — `niceAxisStep`의 unit 계산은
     * 스케일과 무관하다).
     */
    it("tickUnit을 주면 그 배수로만 눈금이 찍힌다", () => {
      renderSlider({
        min: 0,
        max: 45,
        value: { min: 0, max: 45 },
        formatTick: (v) => `${v}`,
        tickUnit: 10,
      });
      // niceAxisStep(45, 5, 10) 없이 그냥 뒀다면 5 간격(0,5,10,...)이
      // 나왔을 값이지만, tickUnit=10이라 10의 배수만 남는다.
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.queryByText("5")).not.toBeInTheDocument();
      expect(screen.queryByText("15")).not.toBeInTheDocument();
    });

    it("tickUnit을 안 주면 기존 동작 그대로다", () => {
      renderSlider({
        min: 0,
        max: 42,
        value: { min: 0, max: 42 },
        formatTick: (v) => `${v}`,
      });
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
    });
  });
});

describe("niceAxisStep", () => {
  it("범위를 4등분에 가깝게, 1·2·5·10 계열로 반올림한다", () => {
    expect(niceAxisStep(40)).toBe(10);
    expect(niceAxisStep(20)).toBe(5);
    expect(niceAxisStep(9)).toBe(2);
    expect(niceAxisStep(400)).toBe(100);
  });

  it("범위가 0 이하면 1을 낸다 — 나눗셈 오류를 피한다", () => {
    expect(niceAxisStep(0)).toBe(1);
    expect(niceAxisStep(-5)).toBe(1);
  });

  describe("unit(최소 눈금 단위)", () => {
    it("unit을 주면 그 배수 중에서만 1·2·5·10 계열로 고른다", () => {
      // span=1.5e9(15억), 목표 4~5등분(3e8/구간)이면 원래 5억 간격이 될
      // 값이지만, unit=1e9(10억)을 주면 그보다 잘게 못 끊어 10억을 낸다.
      expect(niceAxisStep(1_500_000_000, 5, 1_000_000_000)).toBe(1_000_000_000);
      // span이 커지면 unit의 배수(1·2·5·10배) 중에서 계속 고른다.
      expect(niceAxisStep(9_000_000_000, 5, 1_000_000_000)).toBe(2_000_000_000);
    });

    it("unit을 주지 않으면 기존 계산과 똑같다", () => {
      expect(niceAxisStep(40, 5, undefined)).toBe(niceAxisStep(40));
    });

    it("범위가 0 이하면 unit을 그대로 낸다", () => {
      expect(niceAxisStep(0, 5, 10)).toBe(10);
    });
  });
});

describe("niceAxisTicks", () => {
  it("min부터 오름차순, max 자체는 포함하지 않는다", () => {
    expect(niceAxisTicks(0, 42)).toEqual([0, 10, 20, 30, 40]);
  });

  it("min이 눈금 배수가 아니면 그 위 첫 배수부터 시작한다", () => {
    expect(niceAxisTicks(12, 90)).toEqual([20, 40, 60, 80]);
  });

  it("max가 min보다 크지 않으면 빈 배열이다", () => {
    expect(niceAxisTicks(10, 10)).toEqual([]);
    expect(niceAxisTicks(10, 5)).toEqual([]);
  });
});

describe("axisLabelTicks", () => {
  it("마지막 눈금이 max와 축 길이의 20% 안쪽이면 뺀다", () => {
    // niceAxisTicks(0, 42) = [0, 10, 20, 30, 40]. 40~42 간격은 42의
    // 4.76%(<20%)라 40을 뺀다.
    expect(axisLabelTicks(0, 42)).toEqual([0, 10, 20, 30]);
  });

  it("마지막 눈금이 20% 밖이면 그대로 둔다", () => {
    // niceAxisTicks(0, 40) = [0, 10, 20, 30]. 30~40 간격은 40의
    // 25%(>=20%)라 그대로 남는다.
    expect(axisLabelTicks(0, 40)).toEqual([0, 10, 20, 30]);
  });

  it("빈 배열이면 그대로 빈 배열이다", () => {
    expect(axisLabelTicks(10, 10)).toEqual([]);
  });
});
