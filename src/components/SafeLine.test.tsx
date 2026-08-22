import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeLine, type SafeLineProps } from "./SafeLine";

function renderSafeLine(props: SafeLineProps) {
  return render(<SafeLine {...props} />);
}

describe("SafeLine", () => {
  it("안전선과 최대 가격을 나란히 보여준다", () => {
    renderSafeLine({ affordablePrice: 600_000_000, safePrice: 480_000_000 });
    expect(screen.getByText(/6억/)).toBeInTheDocument();
    expect(screen.getByText(/4억 8,000만/)).toBeInTheDocument();
  });

  it("안전선이 0원이면 숫자 대신 문장을 보여준다", () => {
    // 0원을 결과로 내미는 것은 정보가 아니라 조롱이다.
    renderSafeLine({ affordablePrice: 300_000_000, safePrice: 0 });
    expect(screen.queryByText(/^0원$/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/무리 없이 살 수 있는 가격대가 없습니다/),
    ).toBeInTheDocument();
  });

  it("안전선이 없으면(null) 숫자 대신 문장을 보여준다", () => {
    // null은 "안전한 가격이 하나도 없음"이고 0과는 뜻이 다르다
    // (calcSafePrice 문서 참고) — 화면 문구는 같다: 어느 쪽이든 보여줄
    // 안전한 숫자가 없다는 뜻이다.
    renderSafeLine({ affordablePrice: 300_000_000, safePrice: null });
    expect(
      screen.getByText(/무리 없이 살 수 있는 가격대가 없습니다/),
    ).toBeInTheDocument();
  });

  it("안전선이 최대 가격과 같으면 한 줄로 합친다", () => {
    renderSafeLine({ affordablePrice: 500_000_000, safePrice: 500_000_000 });
    expect(screen.getByText(/최대 가격까지 부담률이 안전 범위/)).toBeInTheDocument();
  });

  it("최대 가격과 다르면 두 숫자를 각각 보여준다 — 합쳐 말하지 않는다", () => {
    renderSafeLine({ affordablePrice: 600_000_000, safePrice: 480_000_000 });
    expect(
      screen.queryByText(/최대 가격까지 부담률이 안전 범위/),
    ).not.toBeInTheDocument();
  });
});
