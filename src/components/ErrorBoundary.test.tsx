import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

/** 조건에 따라 렌더 중 던지는 테스트용 자식. 재무 엔진 예외를 흉내낸다. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("계산 중 예외 발생");
  }
  return <p>정상 렌더</p>;
}

describe("ErrorBoundary", () => {
  // React가 잡히지 않은(것처럼 보이는) 에러를 테스트 콘솔에 시끄럽게 찍는다.
  // componentDidCatch가 실제로 잡고 있으므로 로그만 조용히 만든다.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("자식이 던지지 않으면 그대로 렌더링한다", () => {
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 렌더")).toBeInTheDocument();
  });

  it("자식이 던지면 대체 UI를 보여주고 원래 자식은 그리지 않는다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(
      screen.getByText("계산하다 문제가 생겼어요"),
    ).toBeInTheDocument();
    expect(screen.queryByText("정상 렌더")).not.toBeInTheDocument();
  });

  it("대체 UI는 role=\"alert\"로 노출된다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "계산하다 문제가 생겼어요",
    );
  });

  it("초기화 버튼을 누르면 onReset을 호출하고, 원인이 해소된 자식으로 복구된다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();

    // 실제 App에서는 onReset이 폼 상태를 초기화해 다음 렌더에서는 자식이
    // 더는 던지지 않게 된다. 그 흐름을 shouldThrow 플래그로 흉내낸다.
    function Harness() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ErrorBoundary
          onReset={() => {
            setShouldThrow(false);
            onReset();
          }}
        >
          <Bomb shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    }

    render(<Harness />);
    expect(
      screen.getByText("계산하다 문제가 생겼어요"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "입력 초기화" }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("정상 렌더")).toBeInTheDocument();
    expect(
      screen.queryByText("계산하다 문제가 생겼어요"),
    ).not.toBeInTheDocument();
  });

  it("componentDidCatch가 예외를 콘솔에 기록한다", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "계산 중 예외",
      expect.any(Error),
      expect.anything(),
    );
  });
});
