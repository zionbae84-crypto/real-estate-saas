import { formatWon } from "../format/won";
import type {
  PurchaseAssessment,
  PurchaseMetricResult,
} from "../lib/purchase";

export interface PurchaseVerdictProps {
  assessment: PurchaseAssessment;
}

/**
 * 구매 유형별 지표의 결과.
 *
 * **등급은 언제나 글자다.** `data-verdict`는 색을 입히는 고리일 뿐이고,
 * 색이 하나도 적용되지 않아도(흑백 인쇄·색각 이상) 무엇이 "이대로는
 * 사면 안 돼요"이고 무엇이 "아직 낼 수 없어요"인지 읽을 수 있어야 한다.
 * 그래서 모든 지표에 `verdictLabel`(룰셋의 `verdictLabels`)이 텍스트로
 * 붙는다. `RightsVerdict`와 같은 규칙이다.
 *
 * 이 화면은 인쇄에서 **그대로 남는다.** 입력란은 종이에서 채울 수 없어
 * 지우지만(`PRINT_HIDDEN_SELECTORS`), 결과는 배우자·부모님·중개사에게
 * 건네지는 바로 그 종이다.
 *
 * **낼 수 없는 값은 자리를 비운다.** 모르는 값을 0원으로 채우지 않으니
 * 숫자도 만들어 내지 않는다 — 표에 박힌 숫자는 옆의 설명보다 먼저
 * 읽히고, 0이나 0.0%는 언제나 가장 낙관적으로 읽힌다.
 */
export function PurchaseVerdict({ assessment }: PurchaseVerdictProps) {
  return (
    <section className="purchase-verdict" aria-label="구매 유형별 재무 지표 결과">
      <h3 className="purchase-verdict-title">{assessment.typeLabel} 지표</h3>

      <p className="purchase-overall" data-verdict={assessment.overall}>
        {assessment.overallLabel}
      </p>
      <p className="purchase-overall-note">{assessment.overallNote}</p>

      <ol className="purchase-metrics">
        {assessment.metrics.map((metric) => (
          <li
            key={metric.id}
            className="purchase-metric"
            data-verdict={metric.verdict}
          >
            <p className="purchase-metric-head">
              <span className="purchase-metric-verdict">
                {metric.verdictLabel}
              </span>
              <span className="purchase-metric-name">{metric.label}</span>
            </p>
            <MetricValues metric={metric} />
            <p className="purchase-metric-message">{metric.message}</p>
            <MetricNotes metric={metric} />
          </li>
        ))}
      </ol>

      <ul className="purchase-disclaimer">
        {assessment.disclaimer.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** 값 줄 하나. 값이 없으면 줄 자체를 만들지 않는다 */
function Row({
  label,
  value,
  field,
}: {
  label: string;
  value: string | null;
  field: string;
}) {
  if (value === null) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd data-field={field}>{value}</dd>
    </div>
  );
}

function won(value: number | null): string | null {
  return value === null ? null : formatWon(value);
}

function percent(value: number | null): string | null {
  return value === null ? null : `${(value * 100).toFixed(1)}%`;
}

function times(value: number | null): string | null {
  return value === null ? null : `${value.toFixed(2)}배`;
}

/**
 * 지표마다 낸 값.
 *
 * 지표별로 보여야 하는 값이 다르므로 `id`로 갈라 쓴다 — 공통 표로
 * 뭉개면 "필요 자기자금"과 "DSCR"이 같은 모양이 되어 무엇을 견준
 * 숫자인지 사라진다. 라벨은 룰셋에서 온 `metric.label`을 쓰고, 여기
 * 적힌 것은 그 지표 안에서 값을 부르는 이름뿐이다.
 */
function MetricValues({ metric }: { metric: PurchaseMetricResult }) {
  switch (metric.id) {
    case "jeonseRatio":
      return (
        <dl className="purchase-metric-values">
          <Row field="jeonseRatio" label="전세가율" value={percent(metric.ratio)} />
          <Row field="jeonsePrice" label="매매 예정가" value={won(metric.price)} />
          <Row field="jeonseDeposit" label="전세보증금" value={won(metric.deposit)} />
        </dl>
      );
    case "ownFunds":
      return (
        <>
          <dl className="purchase-metric-values">
            <Row field="ownFundsRequired" label="필요 자기자금" value={won(metric.required)} />
            <Row
              field="ownFundsCosts"
              label="그중 부대비용"
              value={won(metric.costs === null ? null : metric.costs.total)}
            />
            <Row field="ownFundsCash" label="보유 현금" value={won(metric.cash)} />
            <Row
              field="ownFundsShortfall"
              label="모자란 금액"
              value={
                metric.shortfall === null || metric.shortfall === 0
                  ? null
                  : formatWon(metric.shortfall)
              }
            />
            <Row
              field="ownFundsRemaining"
              label="매수하고 남는 현금"
              value={
                metric.remainingCash === null || metric.remainingCash < 0
                  ? null
                  : formatWon(metric.remainingCash)
              }
            />
          </dl>
          <p className="purchase-metric-note">{metric.acquisitionNote}</p>
        </>
      );
    case "reverseJeonse":
      return (
        <>
          <dl className="purchase-metric-values">
            <Row
              field="reverseRemaining"
              label="역전세에 쓸 수 있는 현금(매수하고 남는 돈)"
              value={
                metric.remainingCash === null || metric.remainingCash < 0
                  ? null
                  : formatWon(metric.remainingCash)
              }
            />
            <Row
              field="reverseCoverage"
              label="보증금 반환 여력(가장 큰 하락 기준)"
              value={times(metric.coverageRatio)}
            />
          </dl>
          {metric.stages.length > 0 && (
            <ul className="purchase-stages">
              {metric.stages.map((stage) => (
                <li
                  key={stage.drop}
                  className="purchase-stage"
                  data-covered={stage.covered ? "yes" : "no"}
                >
                  <span className="purchase-stage-drop">
                    전세가 {(stage.drop * 100).toFixed(0)}% 하락
                  </span>
                  <span className="purchase-stage-needed">
                    마련해야 할 돈 {formatWon(stage.needed)}
                  </span>
                  {/* 색이 아니라 이 글자가 막을 수 있는지를 말한다. */}
                  <span className="purchase-stage-covered">
                    {stage.covered ? "남는 현금으로 막을 수 있어요" : "남는 현금으로 못 막아요"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    case "capRate":
      return (
        <dl className="purchase-metric-values">
          <Row field="capRate" label="Cap Rate" value={percent(metric.rate)} />
          <Row field="capRateNoi" label="순영업소득(연)" value={won(metric.noi)} />
        </dl>
      );
    case "dscr":
      return (
        <dl className="purchase-metric-values">
          <Row field="dscr" label="DSCR" value={times(metric.ratio)} />
          <Row field="dscrNoi" label="순영업소득(연)" value={won(metric.noi)} />
          <Row
            field="dscrDebtService"
            label="연간 원리금 상환액"
            value={won(metric.annualDebtService)}
          />
        </dl>
      );
    default:
      return (
        <dl className="purchase-metric-values">
          <Row field="rti" label="RTI" value={times(metric.ratio)} />
          <Row
            field="rtiIncome"
            label="연간 임대소득"
            value={won(metric.annualRentIncome)}
          />
          <Row
            field="rtiInterest"
            label="연간 이자비용"
            value={won(metric.annualInterest)}
          />
        </dl>
      );
  }
}

/**
 * 지표에 딸린, 숫자보다 먼저 읽혀야 하는 말.
 *
 * 역전세의 "세입자 보증금은 DSR에 부채로 잡히지 않아요"가 그것이다 —
 * 대출이 아니라서 안전한 게 아니라 계산에 안 잡힐 뿐이라는 사실은
 * 이 화면에서 가장 중요한 문장이라 인쇄에서도 남아야 한다.
 */
function MetricNotes({ metric }: { metric: PurchaseMetricResult }) {
  if (metric.id !== "reverseJeonse") return null;
  return (
    <p className="purchase-metric-warning">{metric.depositIsNotDebtNote}</p>
  );
}
