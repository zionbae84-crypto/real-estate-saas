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

  /*
   * 왜 TextFieldInput의 value/onChange를 네이티브 그대로 쓰고, `text`가
   * 유일한 진실의 원천인가:
   *
   * TextFieldInput(seed-design/ui/text-field.tsx가 감싸는
   * @seed-design/react-text-field의 TextFieldInput)은 mergeProps로 같은
   * 이름의 핸들러를 체이닝한다(@seed-design/dom-utils의 mergeProps: 두
   * 함수가 모두 "on"으로 시작하면 합치지 않고 순서대로 둘 다 호출한다).
   * 우리가 `<TextField>`(라벨을 감싸는 바깥 컴포넌트)에 value/onValueChange를
   * 넘기지 않으면 그 내부의 useTextField 훅이 "제어되지 않음" 상태가 되어
   * `value` 속성 자체는 주입하지 않지만, `onChange` 핸들러(내부 setValue)는
   * 여전히 병합 대상이라 우리 handleChange 뒤에 매 키 입력마다 함께
   * 실행된다. 그 결과 SEED 내부가 자기 나름의 `value`를 계속 추적한다 —
   * 우리가 부모의 value prop 리셋으로 `text`를 비워도 SEED 내부 값은
   * 리셋되지 않는다(직접 확인: data-empty가 갱신되지 않는다).
   *
   * 지금은 눈에 보이는 영향이 없다 — 설치된 @seed-design/css에 data-empty를
   * 소비하는 text-field 레시피가 없고, maxGraphemeCount도 안 쓴다. 하지만
   * SEED CSS를 올려 빈 상태 스타일이 생기거나 나중에 maxGraphemeCount를
   * 켜면, 이 파일을 한 줄도 안 고쳤는데 SEED 내부 상태와 우리 `text`가
   * 어긋나 조용히 깨질 수 있다. 그때는 TextField에 value/onValueChange를
   * 명시적으로 넘겨 두 상태를 하나로 합치는 작업이 필요하다.
   */
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
        errorMessage={unreadable ? "숫자로 읽을 수 없어요" : undefined}
      >
        <TextFieldInput
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => handleChange(event.target.value)}
        />
      </TextField>
      {/*
       * seed-design/ui/text-field.tsx(벤더 스니펫, 수정 불가)는
       * `errorMessage && invalid`일 때 `description`을 VisuallyHidden으로
       * 감싼다 — DOM에는 남고 input의 aria-describedby 연결도 그대로
       * 유지되지만(SeedField.Description의 ref 마운트 여부만 보고
       * aria-describedby를 계산하므로 시각적 숨김과 무관하다), 화면에서는
       * 사라진다. 그래서 사용자가 읽을 수 없는 값을 입력한 바로 그 순간
       * "어떻게 써야 하는지" 안내하는 힌트가 안 보이게 되는 회귀가 있었다.
       *
       * 고치는 방법: SEED의 description 슬롯은 그대로 두어(스크린 리더용
       * aria-describedby 연결은 SEED가 이미 올바르게 처리한다) 접근성
       * 배선은 건드리지 않고, 화면에서만 SEED가 숨기는 바로 그 경우
       * (unreadable === true)에 우리 자신의 <p>로 같은 문구를 되비춘다.
       * 이 되비추기는 aria-hidden으로 스크린 리더에서 빼서 SEED의
       * description과 중복 안내되지 않게 한다.
       */}
      {unreadable && hint && (
        <p className="hint" aria-hidden="true">
          {hint}
        </p>
      )}
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
