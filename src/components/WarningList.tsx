export interface WarningListProps {
  warnings: string[];
}

/**
 * 엔진이 낸 경고. 결과 위에 두고 접지 않는다.
 *
 * role="alert"는 목록을 감싸는 별도 wrapper에 둔다. <ul> 자체에 role을
 * 얹으면 그 암묵적 list 역할이 덮어써져 스크린 리더가 더는 이것을
 * 목록으로 인식하지 못하고, 경고가 여러 개일 때 항목별로 탐색할 수
 * 없이 전부를 하나의 인터럽션으로 통째로 읽어 버린다. wrapper에만
 * role="alert"를 두면 영역이 나타났다는 알림은 그대로 유지하면서
 * <ul>/<li>의 목록 구조는 손대지 않는다.
 */
export function WarningList({ warnings }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="warning-list" role="alert">
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
