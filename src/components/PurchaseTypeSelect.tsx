import {
  SELECTABLE_PURCHASE_TYPES,
  type PurchaseRules,
  type PurchaseType,
} from "../lib/purchase";

export interface PurchaseTypeSelectProps {
  rules: PurchaseRules;
  value: PurchaseType;
  onChange: (type: PurchaseType) => void;
  /**
   * 저장해 둔 유형을 읽지 못해 실거주로 떨어졌는가.
   *
   * 떨어지는 것 자체는 안전한 방향이지만 **조용히 떨어지면 안 된다** —
   * 기억한 것처럼 보이는 화면이 실거주 기준 한도를 다시 보여주게 되고,
   * 그건 이 선택이 애초에 막으려던 오해다.
   */
  restoreFailed?: boolean;
}

/**
 * 구매 유형을 **가장 먼저** 묻는다.
 *
 * 부모 스펙 14절이 요구한 분기다 — 유형에 따라 봐야 하는 숫자가 다르다.
 * 실거주는 상환부담률과 금리 스트레스, 갭투자는 전세가율과 역전세,
 * 월세 수익형은 Cap Rate·DSCR·RTI다. DSCR은 임대수익이 0이라 실거주에서
 * 분자가 성립하지 않는다.
 *
 * **폼 위에 둔 이유.** 이 앱은 지금까지 실거주를 말없이 전제하고 있었다.
 * 대출 한도·상환부담률·정책대출은 전부 내가 들어가 사는 집을 전제로
 * 계산된 숫자인데, 화면 어디에도 그 전제가 적혀 있지 않았다. 유형을
 * 맨 앞에서 묻는 것은 기능을 더하는 것이자 **숨어 있던 전제를 밖으로
 * 꺼내는 일**이다. 아래의 예산 계산은 실거주를 골랐을 때만 나온다 —
 * 다른 유형에서 그 한도를 그대로 보여 주면 실거주 기준 한도를 투자
 * 목적 매수에 적용하는 것이 된다.
 *
 * 처음 값은 실거주다. 지금까지 이 화면이 이미 계산해 오던 바로 그
 * 유형이라, 기본값을 바꾸면 기존 사용자의 숫자가 이유 없이 사라진다.
 *
 * **고른 유형은 저장된다**(`usePurchaseType`). 나머지 프로필이 전부
 * localStorage에 남는데 유형만 남지 않으면, 갭투자를 고른 사람이
 * 새로고침했을 때 화면이 실거주로 되돌아가 자기 매수에 해당하지 않는
 * 한도를 다시 보여준다. 저장된 값을 읽지 못하면 실거주로 떨어지되,
 * 아래 안내가 그 사실을 말한다.
 *
 * 인쇄에서는 라디오(`.purchase-type-form`)가 지워지고 — 종이에서는
 * 고를 수 없다 — 대신 고른 유형이 평문 한 줄로 남는다. 그 줄이 없으면
 * 종이를 건네받은 사람은 아래 숫자들이 어떤 전제 위에 서 있는지 알 수
 * 없다.
 *
 * **그 평문 한 줄(`.purchase-type-print`)은 이 컴포넌트가 그리지 않는다.**
 * 이 라디오는 실거주 경로에서 `EntryScreen`(화면 1) 안에 놓이는데, 그
 * 레이어는 인쇄에서 통째로 지워진다(`src/print/hiddenInPrint.ts`의
 * `.entry-screen`) — 여기에 두면 보호 대상 클래스가 조상과 함께 조용히
 * 사라진다. `printCss.test.ts`는 선택자 문자열만 보므로 그 형태를 잡지
 * 못한다. 그래서 `App.tsx`가 그 줄을 이 레이어 밖에서 그린다. 문자열이
 * 두 벌이 되지 않도록 여기서는 아예 그리지 않는다.
 */
export function PurchaseTypeSelect({
  rules,
  value,
  onChange,
  restoreFailed = false,
}: PurchaseTypeSelectProps) {
  return (
    <section className="purchase-type">
      {/*
        복원 실패 안내. 인쇄에서도 남는다 — 이 종이가 어떤 전제 위에
        서 있는지를 말하는 문장이라, 라디오와 함께 지우면 안 된다.
      */}
      {restoreFailed && (
        <p className="purchase-type-restore-notice">
          저장해 둔 구매 유형을 읽지 못해서 실거주로 시작했어요. 아래 숫자는
          실거주 기준이니, 목적이 다르면 다시 골라 주세요.
        </p>
      )}
      <form className="purchase-type-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="purchase-type-fieldset">
          <legend className="purchase-type-question">
            이 집을 어떤 목적으로 사려고 하나요?
          </legend>
          <p className="purchase-type-why">
            유형에 따라 봐야 하는 숫자가 달라요. 임대수익이 없는 집에
            수익률을 계산해 주거나, 임대 목적 매수에 실거주 대출 한도를
            적용하지 않으려고 먼저 물어요.
          </p>
          <div className="purchase-type-options">
            {SELECTABLE_PURCHASE_TYPES.map((type) => (
              <label className="purchase-type-option" key={type}>
                <input
                  type="radio"
                  name="purchase-type"
                  value={type}
                  checked={value === type}
                  onChange={() => onChange(type)}
                />
                <span className="purchase-type-option-body">
                  <span className="purchase-type-label">
                    {rules.types[type].label}
                  </span>
                  <span className="purchase-type-summary">
                    {rules.types[type].summary}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
