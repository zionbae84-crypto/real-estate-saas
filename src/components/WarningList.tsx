export interface WarningListProps {
  warnings: string[];
}

/** 엔진이 낸 경고. 결과 위에 두고 접지 않는다. */
export function WarningList({ warnings }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <ul className="warning-list" role="alert">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}
