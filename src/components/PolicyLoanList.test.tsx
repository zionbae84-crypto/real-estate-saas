import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MatchedPolicyLoan } from "../lib/finance";
import { PolicyLoanList } from "./PolicyLoanList";

const 디딤돌: MatchedPolicyLoan = {
  loan: {
    id: "디딤돌",
    eligibility: { maxOwnedHomes: 0 },
    maxAmount: 250_000_000,
    rate: 0.032,
  },
  availableAmount: 109_900_000,
};

describe("PolicyLoanList", () => {
  it("자격 상품이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<PolicyLoanList matched={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("상품명과 금리를 보여준다", () => {
    render(<PolicyLoanList matched={[디딤돌]} />);
    expect(screen.getByText("디딤돌")).toBeInTheDocument();
    expect(screen.getByText("연 3.2%")).toBeInTheDocument();
  });

  it("실제 수령 가능액을 보여준다", () => {
    render(<PolicyLoanList matched={[디딤돌]} />);
    expect(screen.getByText("1억 990만원")).toBeInTheDocument();
  });

  it("상품 고시 한도를 금액으로 보여주지 않는다", () => {
    render(<PolicyLoanList matched={[디딤돌]} />);
    // 2억 5,000만원 = maxAmount. 이걸 보여주면 상환능력을 무시한 숫자가 된다.
    expect(screen.queryByText("2억 5,000만원")).not.toBeInTheDocument();
  });

  it("수령 가능액이 0이면 자격은 되지만 받을 수 없다고 밝힌다", () => {
    render(
      <PolicyLoanList matched={[{ ...디딤돌, availableAmount: 0 }]} />,
    );
    expect(
      screen.getByText(/소득 기준으로는 받을 수 있는 금액이 없어요/),
    ).toBeInTheDocument();
  });
});
