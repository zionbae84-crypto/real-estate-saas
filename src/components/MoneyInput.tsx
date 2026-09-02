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
  /**
   * 값을 언제 부모에 알리는가. 기본은 `"change"`(입력할 때마다 즉시) —
   * 이 앱 대부분의 입력(현금·소득·대출금액)이 쓰는 그대로다.
   *
   * `"blur"`면 입력하는 동안은 부모 상태(그리고 그 값에 딸린 계산)를
   * 건드리지 않고, 입력란을 벗어날 때만 확정한다(사용자 지시: "입력하면
   * 그 자리에 확정된 금액이 적히도록"). 타이핑 중간값("9" → "90" →
   * "900"…)이 매번 "9만원"·"90만원"으로 잘못 해석돼 아래 계산이
   * 깜빡이는 것을 막는 자리(예: `ComplexDetail`의 예상 매수금액)에 쓴다.
   *
   * 확정되면 입력란 자체가 사람이 읽는 형태로 바뀐다("90000" →
   * "9억원") — 그래서 이 모드에서는 되비추기(`.echo`)를 따로 내지
   * 않는다. **상자 자신이 그 자리다**(사용자 지시: "지금은 아래에
   * 중복해서 금액이 생김").
   */
  commitOn?: "change" | "blur";
}

/**
 * 한국식 금액 입력. 단위 없는 숫자는 만원으로 읽는다.
 *
 * 입력란 아래에 해석 결과를 항상 되비춘다. 만원 기본 해석은 자릿수를 틀리기
 * 쉬운데(50000000을 "5천만원"으로 의도해도 5,000억이 된다), 되비추기가 그
 * 오해를 즉시 눈에 보이게 만든다. 이것이 만원 기본값을 성립시킨다.
 *
 * (`commitOn="blur"`일 때는 되비추기 대신 입력란 자신이 확정값을 보여준다
 * — 아래 `commitOn` 문서 참고.)
 */
export function MoneyInput({
  id,
  label,
  value,
  onChange,
  hint,
  commitOn = "change",
}: MoneyInputProps) {
  const [text, setText] = useState(() => initialText(value, commitOn));

  useEffect(() => {
    setText((current) =>
      parseMoney(current) === value ? current : initialText(value, commitOn),
    );
  }, [value, commitOn]);

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
    if (commitOn === "change") onChange(parseMoney(next));
  }

  /*
   * `commitOn === "blur"`에서만 쓴다. 부모에 값을 알리고(여기서 처음
   * 알린다 — `handleChange`는 이 모드에서 부모를 건드리지 않는다),
   * 읽을 수 있으면 입력란 자체를 확정된 표기로 바꿔 되비추기를 대신한다.
   *
   * 읽을 수 없는 채로 벗어나면(`parsed === null`) 글자를 그대로 두어
   * 무엇을 잘못 썼는지 눈에 남긴다 — 지우거나 되돌리면 사용자가 무엇을
   * 고쳐야 하는지 잊는다.
   */
  function handleBlur() {
    if (commitOn !== "blur") return;
    const parsedOnBlur = parseMoney(text);
    onChange(parsedOnBlur);
    if (parsedOnBlur !== null) setText(formatWon(parsedOnBlur));
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
          onBlur={commitOn === "blur" ? handleBlur : undefined}
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
      {/*
        되비추기는 **입력한 글자와 뜻이 다를 때만** 낸다(사용자 지시:
        "매물가격입력란 아래 중복으로 출력되는 금액은 제거해줘").

        ⚠ **되비추기 자체를 없애지는 않았다.** 이 컴포넌트의 만원 기본
        해석을 성립시키는 장치가 바로 이것이다(위 문서 참고) — "120000"을
        치면 "12억원"이 떠서 자릿수 오해를 그 자리에서 잡는다. 없애면
        5천만원을 의도한 "50000000"이 5,000억으로 조용히 들어간다.

        지우는 것은 **같은 말을 두 번 하는 경우뿐**이다: "12억"이라고
        친 아래에 "12억원"이 또 뜨는 자리. 판단은 서식 차이(쉼표·공백·
        끝의 "원")를 걷어낸 뒤 글자로 견준다 — 뜻이 같으면 새로 알려줄
        것이 없다.

        `commitOn === "blur"`에서는 이 되비추기를 아예 내지 않는다 —
        확정되면 입력란 자신이 같은 뜻(`formatWon`)으로 바뀌므로, 그
        아래 또 적으면 그게 바로 사용자가 지적한 중복이다.
      */}
      {commitOn === "change" && parsed !== null && !readsSame(text, parsed) && (
        <p className="echo">{formatWon(parsed)}</p>
      )}
    </div>
  );
}

/**
 * 입력한 글자가 해석 결과와 **같은 말인가**. 되비추기를 낼지 정한다.
 *
 * 서식만 다른 것은 같은 말로 본다 — 쉼표·공백은 `parseMoney`가 이미
 * 무시하고(그 함수의 첫 줄), 끝의 "원"은 붙이든 말든 뜻이 같다.
 * 그 둘만 걷어내고 남은 글자를 견준다.
 */
function readsSame(text: string, parsed: number): boolean {
  const normalize = (s: string) => s.replace(/[,\s]/g, "").replace(/원$/, "");
  return normalize(text) === normalize(formatWon(parsed));
}

/**
 * 원 단위 값을 입력란에 표시할 문자열로 바꾼다.
 *
 * 만원으로 나누어떨어지면 **만원 단위 숫자**로 적는다(이 입력란은 단위
 * 없는 숫자를 만원으로 읽으므로 그대로 되읽힌다). 아니면 원 단위로 적되
 * "원"을 붙여 뜻을 못박는다.
 *
 * **셋째 자리마다 쉼표를 넣는다**(사용자 지시). `449703200원`처럼 붙어
 * 나오면 자릿수를 눈으로 셀 수 없다 — 이 저장소가 금액을 언제나
 * `formatWon`으로 끊어 보여 주는 것과 같은 이유다. `parseMoney`가 쉼표를
 * 먼저 걷어내므로(그 함수의 첫 줄) 이 표기는 그대로 다시 읽힌다.
 */
function toText(value: number | null): string {
  if (value === null) return "";
  if (value % MAN !== 0) return `${value.toLocaleString("ko-KR")}원`;
  return (value / MAN).toLocaleString("ko-KR");
}

/**
 * 처음(또는 바깥에서 `value`가 바뀌었을 때) 입력란에 채울 글자.
 *
 * `commitOn === "blur"`에서는 `toText`(만원 단위 숫자)가 아니라
 * `formatWon`(한국어로 풀어 쓴 확정 표기, "9억원")을 쓴다 — 그 모드의
 * 입력란은 "확정되면 사람이 읽는 형태로 바뀐다"는 계약을 지녀서,
 * 바깥에서 값이 주입될 때도(예: 평형을 갈아타 매물가격이 그 평형
 * 기준으로 다시 채워질 때) 이미 확정된 값처럼 보여야 한다 — 갓 블러된
 * 값과 방금 주입된 값이 다른 서식이면 "확정"의 뜻이 흔들린다.
 */
function initialText(
  value: number | null,
  commitOn: "change" | "blur",
): string {
  if (value === null) return "";
  return commitOn === "blur" ? formatWon(value) : toText(value);
}
