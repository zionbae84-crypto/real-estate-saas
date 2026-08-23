import type { RightsAnswers, RightsItem, RightsSection } from "../lib/rights";
import { useRightsCheck } from "../state/useRightsCheck";
import { MoneyInput } from "./MoneyInput";
import { RightsVerdict } from "./RightsVerdict";

const MONEY_HINT = "단위를 안 쓰면 만원으로 읽어요. '3억5000'처럼 써도 돼요.";

/**
 * 권리분석 문진.
 *
 * 등기사항전부증명서는 자동으로 조회할 수 없다 — 인터넷등기소는 유료이고
 * 본인 인증이 필요하며, 공식 Open API는 개별 부동산의 갑구·을구 내용을
 * 주지 않는다. 그래서 사용자가 직접 떼어 보고 답하면 우리가 해석해 준다.
 *
 * 이 사람은 등기부를 **처음 본다.** 그래서 항목마다 "어디를 보나요"와
 * "왜 중요한가요"를 질문과 같은 무게로 함께 낸다. 용어만 던지면 답
 * 자체를 할 수 없다.
 *
 * 예산 계산과 이어 붙이지 않고 **독립된 자리**에 둔다. 이유는
 * `App.tsx`의 호출부 주석에 적었다.
 */
export function RightsCheck() {
  const { rules, answers, price, setPrice, selectOption, setAmount, assessment } =
    useRightsCheck();

  return (
    <details className="rights-check">
      <summary className="rights-check-summary">
        등기부등본으로 권리 확인하기
        <span className="fold-more-hint"> — 열어서 답하기</span>
      </summary>

      {/*
       * 이 문단은 인쇄에서 살아남는다. 그런데 "떼어 놓고 답해 주세요"는
       * 종이 위에서 지시 대상이 없다 — 답하는 자리(`.rights-check-form`)는
       * 인쇄에서 지워지기 때문이다. 그래서 저장소에 이미 있는 패턴
       * (`.fold-more-hint`·`.assumption-action`·`.slider-action`)을 그대로
       * 쓴다: 조작 지시 부분만 span으로 갈라 그 부분만 인쇄에서 감춘다.
       * 어떤 서류를 보고 답하는 문진인지, 그리고 다 지나가도 안전하다는
       * 뜻이 아니라는 것은 종이에서도 뜻이 있어 남긴다.
       */}
      <p className="rights-check-intro">
        이 문진은 등기사항전부증명서(집합건물)와 건축물대장을 보고 답하는
        거예요.
        <span className="rights-check-action"> 두 서류를 떼어 놓고 답해 주세요.</span>{" "}
        <strong>사면 안 되는 신호</strong>를 찾는 문진이라, 다 지나가도
        안전하다고 말하지 않아요.
      </p>

      <form className="rights-check-form" onSubmit={(e) => e.preventDefault()}>
        <MoneyInput
          id="rights-price"
          label={rules.encumbrance.priceLabel}
          value={price}
          onChange={setPrice}
          hint={MONEY_HINT}
        />

        {groupBySection(rules.items).map(([section, items]) => (
          <section className="rights-section" key={section}>
            <h3 className="rights-section-title">{section}</h3>
            {items.map((item) => (
              <ItemField
                key={item.id}
                item={item}
                answers={answers}
                onSelect={selectOption}
                onAmountChange={setAmount}
              />
            ))}
          </section>
        ))}
      </form>

      <RightsVerdict
        assessment={assessment}
        priceLabel={rules.encumbrance.priceLabel}
      />
    </details>
  );
}

interface ItemFieldProps {
  item: RightsItem;
  answers: RightsAnswers;
  onSelect: (itemId: string, optionId: string) => void;
  onAmountChange: (itemId: string, won: number | null) => void;
}

function ItemField({
  item,
  answers,
  onSelect,
  onAmountChange,
}: ItemFieldProps) {
  const answer = answers[item.id];
  const selected = item.options.find(
    (option) => option.id === answer?.optionId,
  );

  /*
   * 금액 입력란은 "금액을 알아요"를 고른 순간에만 나온다. 늘 띄워 두면
   * "없어요"·"모르겠어요"를 고른 사람도 거기에 0을 적을 수 있게 되는데,
   * 그 0은 "확인한 0원"과 구별되지 않는다 — 모름이 0원으로 둔갑하는
   * 바로 그 경로다.
   */
  const needsAmount = selected?.amount === "input";

  return (
    <fieldset className="rights-item">
      <legend className="rights-question">{item.question}</legend>

      <p className="rights-guide">
        <span className="rights-guide-label">어디를 보나요</span> {item.where}
      </p>
      <p className="rights-guide">
        <span className="rights-guide-label">왜 중요한가요</span> {item.why}
      </p>

      <div className="rights-options">
        {item.options.map((option) => (
          <label className="rights-option" key={option.id}>
            <input
              type="radio"
              name={`rights-${item.id}`}
              value={option.id}
              checked={answer?.optionId === option.id}
              onChange={() => onSelect(item.id, option.id)}
            />
            <span className="rights-option-label">{option.label}</span>
          </label>
        ))}
      </div>

      {needsAmount && item.amountLabel !== undefined && (
        <MoneyInput
          id={`rights-amount-${item.id}`}
          label={item.amountLabel}
          value={answer?.amountWon ?? null}
          onChange={(won) => onAmountChange(item.id, won)}
          hint={MONEY_HINT}
        />
      )}
    </fieldset>
  );
}

/**
 * 항목을 문서의 축(표제부·갑구·을구·등기부 밖)으로 묶는다.
 *
 * 순서는 룰셋에 나온 순서를 그대로 따른다 — 사용자가 실제로 종이를
 * 넘기는 순서이고, 코드가 따로 정할 이유가 없다.
 */
function groupBySection(
  items: readonly RightsItem[],
): Array<[RightsSection, RightsItem[]]> {
  const groups: Array<[RightsSection, RightsItem[]]> = [];
  for (const item of items) {
    const existing = groups.find(([section]) => section === item.section);
    if (existing) existing[1].push(item);
    else groups.push([item.section, [item]]);
  }
  return groups;
}
