import { ActionButton } from "seed-design/ui/action-button";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  error: Error | null;
}

/**
 * 엔진 예외를 잡는다. 폼이 이미 막았어야 하므로 여기 도달하면 사실상 버그지만,
 * 재무 계산 화면이 백지가 되는 것이 최악이므로 잡아서 되돌릴 길을 준다.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("계산 중 예외", error, info);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <div className="error-fallback" role="alert">
        {/*
          리뷰 수정(Minor 1): "계산하다 문제가 생겼어요"는 "계산하다가"의
          "가"가 잘린 것처럼 읽힌다. role="alert"로 노출되는, 앱이 망가졌을
          때 나오는 유일한 제목이라 여기서 말이 잘리면 안 된다. "계산 중"으로
          바꾸면 조사 없이도 자연스럽게 이어진다.
        */}
        <h2>계산 중 문제가 생겼어요</h2>
        <p>입력값을 초기화하고 다시 시도해 주세요.</p>
        <ActionButton
          type="button"
          variant="neutralSolid"
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset();
          }}
        >
          입력 초기화
        </ActionButton>
      </div>
    );
  }
}
