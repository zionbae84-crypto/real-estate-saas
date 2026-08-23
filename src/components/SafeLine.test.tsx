import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeLine, type SafeLineProps } from "./SafeLine";

/**
 * 리뷰 수정(Important 2): `SafeLineProps`에 `noRepaymentCapacity`가
 * 추가돼 필수 prop이 됐다 — 아래 헬퍼가 기본값을 채워, 이 값과 무관한
 * 기존 테스트(숫자 표시·병합 여부)는 값을 매번 신경 쓰지 않아도 되게
 * 한다. 원인 귀속 자체를 검증하는 테스트는 명시적으로 다른 값을 넘긴다.
 */
function renderSafeLine(
  props: Omit<SafeLineProps, "noRepaymentCapacity"> &
    Partial<Pick<SafeLineProps, "noRepaymentCapacity">>,
) {
  return render(
    <SafeLine noRepaymentCapacity={false} {...props} />,
  );
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
      screen.getByText(/지금 조건으론 무리 없는 가격대가 없어요/),
    ).toBeInTheDocument();
  });

  it("안전선이 없으면(null) 숫자 대신 문장을 보여준다", () => {
    // null은 "안전한 가격이 하나도 없음"이고 0과는 뜻이 다르다
    // (calcSafePrice 문서 참고) — 화면 문구는 같다: 어느 쪽이든 보여줄
    // 안전한 숫자가 없다는 뜻이다.
    renderSafeLine({ affordablePrice: 300_000_000, safePrice: null });
    expect(
      screen.getByText(/지금 조건으론 무리 없는 가격대가 없어요/),
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

  describe("리뷰 수정: 안전한 가격이 없는 원인을 소득으로 단정하지 않는다 (Important 2)", () => {
    // calcSafePrice가 null(또는 0)을 돌려주는 이유는 둘이다 — 소득이
    // 없거나, 기존 부채가 이미 상환 여력을 채웠거나. 리뷰어 브루트포스
    // 그리드 1,920개 중 1,304개(68%)가 후자였다. 원인을 하나로(소득
    // 탓으로) 뭉뚱그리면 소득이 높고 부채가 많은 사용자에게도 "소득이
    // 없다"고 잘못 말하게 된다. BudgetResult의 ZeroBudgetMessage가 이미
    // breakdown.DSR === 0으로 두 원인을 구분해 쓰는 근거를 그대로
    // 받아, 여기서는 그 결과(noRepaymentCapacity)만 boolean으로 받는다.
    it("noRepaymentCapacity가 true면(DSR===0) 소득·부채를 원인으로 짚는다", () => {
      renderSafeLine({
        affordablePrice: 300_000_000,
        safePrice: null,
        noRepaymentCapacity: true,
      });
      expect(
        screen.getByText(/소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어/),
      ).toBeInTheDocument();
    });

    it("noRepaymentCapacity가 false면(DSR>0) 소득 탓으로 단정하지 않는다", () => {
      renderSafeLine({
        affordablePrice: 300_000_000,
        safePrice: null,
        noRepaymentCapacity: false,
      });
      expect(screen.queryByText(/소득으로는/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/소득이 없거나 기존 부채가/),
      ).not.toBeInTheDocument();
    });

    it("safePrice가 0이어도(null과 같은 화면) 같은 원인 분기를 따른다", () => {
      renderSafeLine({
        affordablePrice: 300_000_000,
        safePrice: 0,
        noRepaymentCapacity: true,
      });
      expect(
        screen.getByText(/소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있어/),
      ).toBeInTheDocument();
    });
  });
});
