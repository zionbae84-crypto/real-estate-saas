import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegionSelect } from "./RegionSelect";

describe("RegionSelect", () => {
  it("기본값으로 서울특별시가 선택돼 있고 자치구 선택도 바로 나타난다", () => {
    render(<RegionSelect onSelect={vi.fn()} />);
    expect(screen.getByLabelText("광역단체")).toHaveValue("서울특별시");
    expect(screen.getByLabelText("자치구")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "강남구" })).toBeInTheDocument();
  });

  it("다른 시/도로 바꾸면 그 시/도의 구 목록으로 바뀐다", async () => {
    render(<RegionSelect onSelect={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "부산광역시");
    expect(screen.getByRole("option", { name: "중구" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "강남구" })).not.toBeInTheDocument();
    // 시/도를 바꾸면 자치구는 다시 "고르세요"로 비워진다.
    expect(screen.getByLabelText("자치구")).toHaveValue("");
  });

  it("구까지 고르고 확인을 누르면 onSelect가 regionCode로 불린다", async () => {
    const onSelect = vi.fn();
    render(<RegionSelect onSelect={onSelect} />);
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.click(screen.getByRole("button", { name: "이 지역으로 조회하기" }));
    expect(onSelect).toHaveBeenCalledWith("11680");
  });

  it("구를 안 고르면 확인 버튼이 비활성화된다", () => {
    render(<RegionSelect onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "이 지역으로 조회하기" })).toBeDisabled();
  });

  /**
   * `disabled` prop — `App.tsx`가 예산(현금·연 소득·주택 수)이 덜 찼을 때
   * 넘긴다. 구까지 골라도 조회하기는 계속 잠겨 있어야 한다 — 그렇지
   * 않으면 예산 없이 조회가 성공해 화면이 빈 결과 셸로 넘어가는 사고로
   * 이어진다(RegionSelect.tsx의 disabled prop 주석 참고).
   */
  it("disabled가 true면 구를 골라도 확인 버튼이 계속 비활성화된다", async () => {
    const onSelect = vi.fn();
    render(<RegionSelect onSelect={onSelect} disabled />);
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    const button = screen.getByRole("button", { name: "이 지역으로 조회하기" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disabled일 때 구를 골랐으면 예산부터 채우라는 이유 문구가 뜬다", async () => {
    render(<RegionSelect onSelect={vi.fn()} disabled />);
    expect(
      screen.queryByText(/현금·연 소득·주택 수·평형대를 먼저 정하면/),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    expect(
      screen.getByText(/현금·연 소득·주택 수·평형대를 먼저 정하면/),
    ).toBeInTheDocument();
  });
});
