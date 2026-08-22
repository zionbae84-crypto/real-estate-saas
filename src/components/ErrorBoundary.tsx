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
        <h2>계산 중 문제가 발생했습니다</h2>
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
