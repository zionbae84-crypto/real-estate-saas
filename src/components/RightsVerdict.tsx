import { formatWon } from "../format/won";
import type { RightsAssessment } from "../lib/rights";

export interface RightsVerdictProps {
  assessment: RightsAssessment;
  /** 룰셋이 정한 매매가의 이름 */
  priceLabel: string;
}

/**
 * 문진의 결과.
 *
 * **등급은 언제나 글자다.** `data-verdict`는 색을 입히는 고리일 뿐이고,
 * 그 색이 하나도 적용되지 않아도(흑백 인쇄·색각 이상) 무엇이 "사면 안
 * 돼요"이고 무엇이 "전문가 확인이 꼭 필요해요"인지 읽을 수 있어야 한다.
 * 그래서 모든 판정에 `finding.label`(룰셋의 `verdictLabels`)이 텍스트로
 * 붙는다.
 *
 * 이 화면은 인쇄에서 **그대로 남는다.** 문진의 선택지·입력란은 종이에서
 * 누를 수 없어 지우지만(`PRINT_HIDDEN_SELECTORS`), 결과는 배우자·부모님·
 * 법무사에게 건네지는 바로 그 종이다 — 무엇을 물었고 무엇이라 답했고
 * 무엇이 걸렸는지가 전부 여기 남는다.
 */
export function RightsVerdict({ assessment, priceLabel }: RightsVerdictProps) {
  return (
    <section className="rights-verdict" aria-label="권리분석 문진 결과">
      <h3 className="rights-verdict-title">문진 결과</h3>

      <p className="rights-overall" data-verdict={assessment.overall}>
        {assessment.overallLabel}
      </p>
      <p className="rights-overall-note">{assessment.overallNote}</p>

      <Encumbrance assessment={assessment} priceLabel={priceLabel} />

      <ol className="rights-findings">
        {assessment.findings.map((finding) => (
          <li
            key={finding.item.id}
            className="rights-finding"
            data-verdict={finding.verdict ?? "unanswered"}
          >
            <p className="rights-finding-head">
              <span className="rights-finding-verdict">{finding.label}</span>
              <span className="rights-finding-section">
                {finding.item.section}
              </span>
            </p>
            <p className="rights-finding-question">{finding.item.question}</p>
            {finding.option !== null && (
              <p className="rights-finding-answer">
                답한 것 — {finding.option.label}
              </p>
            )}
            {finding.note !== null && (
              <p className="rights-finding-note">{finding.note}</p>
            )}
          </li>
        ))}
      </ol>

      <ul className="rights-disclaimer">
        {assessment.disclaimer.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 채권최고액 합계 + 선순위 임차보증금을 매매 예정가와 견준 결과.
 *
 * 모르는 금액이 있으면 그 사실을 **항목 이름과 함께** 적는다. "합계
 * 1억"만 보여 주면 그게 전부인 줄 알게 되는데, 실제로는 확인하지 못한
 * 금액이 그 위에 얼마든지 더 있을 수 있다.
 */
function Encumbrance({ assessment, priceLabel }: RightsVerdictProps) {
  const { encumbrance, encumbranceLabel } = assessment;

  const unknownQuestions = encumbrance.unknownItemIds.map((itemId) => {
    const finding = assessment.findings.find((f) => f.item.id === itemId);
    return finding?.item.question ?? itemId;
  });

  return (
    <div className="rights-encumbrance" data-verdict={encumbrance.verdict}>
      <p className="rights-encumbrance-head">
        <span className="rights-encumbrance-verdict">{encumbranceLabel}</span>
        <span className="rights-encumbrance-name">기존 권리 합계</span>
      </p>

      <dl>
        <div>
          <dt>확인한 합계</dt>
          <dd data-field="knownTotal">{formatWon(encumbrance.knownTotal)}</dd>
        </div>
        <div>
          <dt>{priceLabel}</dt>
          <dd data-field="price">
            {encumbrance.price === null
              ? "아직 몰라요"
              : formatWon(encumbrance.price)}
          </dd>
        </div>
        {encumbrance.ratio !== null && (
          <div>
            <dt>매매 예정가에서 차지하는 몫</dt>
            {/*
             * 모르는 금액이 하나라도 있으면 비율은 실제 몫이 아니라
             * 아래쪽 경계일 뿐이다. 전부 "모르겠어요"로 답하면 그 값이
             * 0이라 "0.0%"가 표에 박히는데, 바로 아래 경고문보다 그
             * 숫자가 먼저 읽힌다 — 아무것도 확인하지 않은 사람이 가장
             * 낙관적인 숫자를 보게 되는 자리다. 그래서 숫자를 아예
             * 내지 않고 룰셋의 문구로 바꾼다.
             */}
            <dd data-field="ratio">
              {encumbrance.unknownItemIds.length > 0
                ? assessment.encumbranceRatioUnknownLabel
                : `${(encumbrance.ratio * 100).toFixed(1)}%`}
            </dd>
          </div>
        )}
      </dl>

      {unknownQuestions.length > 0 && (
        <p className="rights-encumbrance-unknown">
          아직 금액을 모르는 항목이 있어요 — {unknownQuestions.join(" / ")}.
          모르는 금액을 0원으로 두지 않아서, 위 합계는 아직 끝난 숫자가
          아니에요.
        </p>
      )}

      <p className="rights-encumbrance-message">{encumbrance.message}</p>
    </div>
  );
}
