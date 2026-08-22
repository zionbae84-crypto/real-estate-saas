import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRICE_STEP } from "../lib/finance";
import { PriceSlider } from "./PriceSlider";

describe("PriceSlider", () => {
  it("현재 가격을 사람이 읽는 형태로 보여준다", () => {
    render(
      <PriceSlider price={640_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    expect(screen.getByText("6억 4,000만원")).toBeInTheDocument();
  });

  it("범위와 단위가 엔진의 PRICE_STEP과 맞는다", () => {
    render(
      <PriceSlider price={100_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "640000000");
    expect(slider).toHaveAttribute("step", String(PRICE_STEP));
  });

  it("움직이면 새 가격을 알린다", () => {
    const onChange = vi.fn();
    render(
      <PriceSlider price={640_000_000} max={640_000_000} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "300000000" },
    });
    expect(onChange).toHaveBeenCalledWith(300_000_000);
  });

  it("최대치일 때 그것이 한계임을 알린다", () => {
    render(
      <PriceSlider price={640_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    expect(
      screen.getByText(/빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다/),
    ).toBeInTheDocument();
  });

  it("최대치가 아니면 한계 안내를 띄우지 않는다", () => {
    render(
      <PriceSlider price={300_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    expect(
      screen.queryByText(/빌릴 수 있는 한계이지/),
    ).not.toBeInTheDocument();
  });
});
