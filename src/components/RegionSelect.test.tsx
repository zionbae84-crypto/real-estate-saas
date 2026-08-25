import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegionSelect } from "./RegionSelect";

describe("RegionSelect", () => {
  it("시/도를 고르기 전에는 구 선택이 없다", () => {
    render(<RegionSelect onSelect={vi.fn()} />);
    expect(screen.queryByLabelText("자치구")).not.toBeInTheDocument();
  });

  it("시/도를 고르면 그 시/도의 구 목록이 나타난다", async () => {
    render(<RegionSelect onSelect={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    expect(screen.getByLabelText("자치구")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "강남구" })).toBeInTheDocument();
  });

  it("구까지 고르고 확인을 누르면 onSelect가 regionCode로 불린다", async () => {
    const onSelect = vi.fn();
    render(<RegionSelect onSelect={onSelect} />);
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(screen.getByRole("button", { name: "이 지역으로 조회하기" }));
    expect(onSelect).toHaveBeenCalledWith("11680");
  });

  it("시/도만 고르고 구를 안 고르면 확인 버튼이 비활성화된다", async () => {
    render(<RegionSelect onSelect={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "서울특별시");
    expect(screen.getByRole("button", { name: "이 지역으로 조회하기" })).toBeDisabled();
  });
});
