import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegionSelect } from "./RegionSelect";

/**
 * 이 카드는 이제 **고르기만 한다.** 조회 버튼은 질문 카드가 모두 끝난
 * 자리로 나갔다(사용자 지시) — 버튼과 그 비활성 사유는 `App.test.tsx`가
 * 전체 흐름 안에서 본다.
 *
 * 그래서 여기서 지켜야 할 것은 하나다: **고른 것을 바깥에 정확히
 * 알린다.** 이 콜백이 틀리면 버튼이 엉뚱한 지역을 조회하거나, 고른
 * 지역이 있는데도 계속 잠겨 있다.
 */
describe("RegionSelect", () => {
  it("기본값으로 서울특별시가 선택돼 있고 자치구 선택도 바로 나타난다", () => {
    render(<RegionSelect onRegionChange={vi.fn()} />);
    expect(screen.getByLabelText("광역단체")).toHaveValue("서울특별시");
    expect(screen.getByLabelText("자치구")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "강남구" })).toBeInTheDocument();
  });

  it("다른 시/도로 바꾸면 그 시/도의 구 목록으로 바뀐다", async () => {
    render(<RegionSelect onRegionChange={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "부산광역시");
    expect(screen.getByRole("option", { name: "중구" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "강남구" })).not.toBeInTheDocument();
    // 시/도를 바꾸면 자치구는 다시 "고르세요"로 비워진다.
    expect(screen.getByLabelText("자치구")).toHaveValue("");
  });

  it("구를 고르면 그 regionCode를 알린다", async () => {
    const onRegionChange = vi.fn();
    render(<RegionSelect onRegionChange={onRegionChange} />);
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    expect(onRegionChange).toHaveBeenCalledWith("11680");
  });

  it("구를 다시 '고르세요'로 되돌리면 null을 알린다", async () => {
    const onRegionChange = vi.fn();
    render(<RegionSelect onRegionChange={onRegionChange} />);
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "");
    expect(onRegionChange).toHaveBeenLastCalledWith(null);
  });

  /**
   * 이 자리가 이 파일에서 가장 중요하다. 시/도를 바꾸면 자치구가 비워지는데,
   * 그 사실을 바깥에 알리지 않으면 **앞 시/도에서 고른 구의 코드가 그대로
   * 남는다** — 화면에는 "고르세요"가 떠 있는데 버튼은 눌리고, 누르면
   * 사용자가 보고 있지도 않은 지역을 조회한다.
   */
  it("시/도를 바꾸면 앞서 고른 구를 취소했다고 알린다", async () => {
    const onRegionChange = vi.fn();
    render(<RegionSelect onRegionChange={onRegionChange} />);
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "강남구");
    expect(onRegionChange).toHaveBeenLastCalledWith("11680");

    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "부산광역시");
    expect(onRegionChange).toHaveBeenLastCalledWith(null);
  });

  it("새 시/도에서 고른 구는 그 시/도의 코드로 알린다", async () => {
    const onRegionChange = vi.fn();
    render(<RegionSelect onRegionChange={onRegionChange} />);
    await userEvent.selectOptions(screen.getByLabelText("광역단체"), "부산광역시");
    await userEvent.selectOptions(screen.getByLabelText("자치구"), "해운대구");
    expect(onRegionChange).toHaveBeenLastCalledWith("26350");
  });

  it("조회 버튼은 이 카드 안에 없다 — 질문이 모두 끝난 자리로 나갔다", () => {
    const { container } = render(<RegionSelect onRegionChange={vi.fn()} />);
    expect(container.querySelector("button")).toBeNull();
  });
});
