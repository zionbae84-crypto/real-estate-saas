import { useEffect, useState } from "react";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
import { formatWon } from "../format/won";
import { parseMoney } from "../format/parseMoney";

const MAN = 10_000;

export interface MoneyInputProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (won: number | null) => void;
  hint?: string;
}

/**
 * 한국식 금액 입력. 단위 없는 숫자는 만원으로 읽는다.
 *
 * 입력란 아래에 해석 결과를 항상 되비춘다. 만원 기본 해석은 자릿수를 틀리기
 * 쉬운데(50000000을 "5천만원"으로 의도해도 5,000억이 된다), 되비추기가 그
 * 오해를 즉시 눈에 보이게 만든다. 이것이 만원 기본값을 성립시킨다.
 */
export function MoneyInput({
  id,
  label,
  value,
  onChange,
  hint,
}: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value));

  useEffect(() => {
    setText((current) =>
      parseMoney(current) === value ? current : toText(value),
    );
  }, [value]);

  const parsed = parseMoney(text);
  const unreadable = text.trim() !== "" && parsed === null;

  function handleChange(next: string) {
    setText(next);
    onChange(parseMoney(next));
  }

  return (
    <div className="money-input">
      <TextField
        label={label}
        description={hint}
        invalid={unreadable}
        errorMessage={unreadable ? "숫자로 읽을 수 없습니다" : undefined}
      >
        <TextFieldInput
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => handleChange(event.target.value)}
        />
      </TextField>
      {parsed !== null && <p className="echo">{formatWon(parsed)}</p>}
    </div>
  );
}

/** 원 단위 값을 입력란에 표시할 만원 단위 문자열로 바꾼다. */
function toText(value: number | null): string {
  if (value === null) return "";
  if (value % MAN !== 0) return `${value}원`;
  return String(value / MAN);
}
