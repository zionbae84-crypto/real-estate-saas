import { formatWon, formatWonRoundedToMan } from "../format/won";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";
import { CalcBasisIcon } from "./CalcBasisIcon";

export interface CostBreakdownProps {
  costs: CostBreakdownData;
  /**
   * 취득세 줄에 붙는 주택 수 고지. **호출부가 `householdCountNoteFor`로
   * 골라 넘긴다.**
   *
   * 예전에는 이 컴포넌트가 룰셋에서 문구 하나를 직접 읽었다. 화면이
   * 주택 수를 묻게 되면서 문구가 무주택·유주택 둘로 갈렸고, 어느 쪽을
   * 낼지는 프로필을 봐야 정해진다 — 이 컴포넌트는 프로필을 받지 않으므로
   * 고른 결과만 받는다. 고르는 규칙은 `householdCountNoteFor`(finance)
   * 하나뿐이라 이 화면과 `PriceCheck`가 서로 다른 말을 할 수 없다.
   */
  householdCountNote: string;
  /**
   * 중개보수 계산에 적용된 요율(예: 0.004 = 0.4%). 가격 구간에 따라
   * 달라지므로 호출부가 `brokerageFeeRateFor(price, rules)`로 구해
   * 넘긴다(`lib/finance`) — 이 컴포넌트는 가격도 룰셋도 받지 않는다.
   */
  brokerageFeeRate: number;
  /**
   * summary가 합계를 한 번 더 적을 것인가. 기본은 적는다
   * ("부대비용 850만원" — 사용자 지시로 만원 단위까지만 보여준다).
   *
   * `false`를 주는 자리는 하나뿐이다: 단지 상세의 ① 블록(design.md
   * §6). 그 화면은 바로 위에서 같은 합계를 "취득시 부대비용"으로
   * 크게 내므로, summary가 같은 숫자를 되풀이하면 한 화면에 같은
   * 금액이 두 번 박힌다. 그때 summary는 **아이콘 하나**가 된다
   * (사용자 지시 ③, 아래 렌더링 주석 참고) — 큰 금액 옆에 붙는
   * 작은 상세보기 버튼이고, 뜻은 `aria-label`이 진다.
   *
   * **계산은 어느 쪽에서도 달라지지 않는다.** 이 prop이 정하는 것은
   * summary에 보이는 것 하나뿐이고, 표(`<dl>`) 안의 항목·금액은 그대로
   * **정확한 원 단위**다 — 항목을 더하면 이 요약이 낸 합계와 맞아야
   * 하는 감사 근거라, 여기서만 반올림을 걸지 않는다
   * (`formatWonRoundedToMan` 참고).
   */
  repeatTotal?: boolean;
}

/*
 * 내역을 펼치는 아이콘은 `./CalcBasisIcon`에서 온다(사용자 지시:
 * "산출근거 아이콘으로 수정해줘"). 예전에는 아래로 펼쳐지는 화살표
 * (`ChevronIcon`)였다 — 그 판단은 이 트리거가 "이 자리에서 카드를
 * 접었다 폈다" 하는 것이라는 전제였는데, 사용자가 이 내역을 "산출근거"
 * (숫자가 왜 이런지 설명)로 부르면서 그 전제가 바뀌었다. 대출 한도의
 * 같은 성격 트리거(`ComplexDetail`의 `.detail-binding-toggle`)와
 * 같은 아이콘을 쓴다 — 한 화면에 "이 숫자 설명 보기" 버튼이 둘일 때
 * 서로 다른 그림이면 같은 뜻이 다르게 읽힌다.
 */

type CostKey = keyof Omit<CostBreakdownData, "total">;

interface RowMeta {
  label: string;
  /** 라벨 아래에 덧붙일 짧은 설명(추정치 안내 등) */
  note?: string;
}

/**
 * 항목별 표시 정보. `Record<CostKey, RowMeta>`로 타입을 걸어 뒀으므로,
 * CostBreakdown에 필드가 하나 늘면 컴파일러가 여기도 채우라고 강제한다.
 * 예전에는 배열(Row[])이라 새 필드를 깜빡 빠뜨려도 조용히 통과했다 —
 * 이 브랜치에서 두 필드(brokerageVat, housingBondCost)를 추가하면서
 * 두 번 다 그 실수를 할 뻔했다.
 */
const ROW_META: Record<CostKey, RowMeta> = {
  // 취득세 줄의 note는 프로필(주택 수)에 따라 갈리므로 여기서 고정하지
  // 않고 렌더링 시점에 prop으로 덮어쓴다. 아래 ROW_NOTE_OVERRIDE 참고.
  acquisitionTax: { label: "취득세 (지방교육세·농특세 포함)" },
  // 사용자 지시로 부가세를 별도 줄로 보여주지 않는다 — 아래 렌더링에서
  // brokerageFee 줄에 두 금액을 합쳐 보여주고, 이 줄 자체는 그리지 않는다
  // (ROW_ORDER에서 뺐다). 타입(`Record<CostKey, RowMeta>`)이 `CostBreakdownData`의
  // 모든 필드를 요구하므로 항목은 남겨 두되, label은 쓰이지 않는다.
  brokerageFee: { label: "중개보수 (부가세 포함)" },
  brokerageVat: { label: "중개보수 부가세" },
  legalFee: { label: "법무사 비용" },
  movingCost: { label: "이사 비용" },
  housingBondCost: {
    label: "국민주택채권 매입 손실 (추정)",
    // 시가표준액 비율과 할인율은 검증되지 않은 가정치다(단지·연도별로
    // 다르고, 할인율은 매일 변동한다). 구간표만 확정된 값이므로, 취득세와
    // 같은 확신으로 이 숫자를 제시하면 안 된다 — 화면에서도 밝힌다.
    note: "시가표준액 비율·할인율이 확정 값이 아니라 실제와 다를 수 있는 추정치예요.",
  },
};

/**
 * 화면에 보여줄 순서. **`brokerageVat`은 없다** — 부가세는 중개보수
 * 줄에 합쳐 보여준다(아래 렌더링). ROW_META가 완전성(모든 필드가
 * 있는지)을 타입으로 강제하므로, 항목을 빠뜨려도 ROW_META 쪽에서 먼저
 * 컴파일 에러가 난다 — 순서에서 뺀 것은 이 배열 하나뿐이다.
 */
const ROW_ORDER: readonly CostKey[] = [
  "acquisitionTax",
  "brokerageFee",
  "legalFee",
  "movingCost",
  "housingBondCost",
];

/** 0.004 → "0.4%". 소수점은 있는 만큼만 남긴다(지금 룰셋 값은 전부 한 자리다). */
function formatFeeRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

export function CostBreakdown({
  costs,
  householdCountNote,
  brokerageFeeRate,
  repeatTotal = true,
}: CostBreakdownProps) {
  /*
    ⚠ **`<details>`/`<summary>`는 그대로 둔다.** 인쇄에서 접힌 내용을
    강제로 펼치는 규칙(`details:not([open])::details-content`,
    styles.css의 @media print)이 이 태그에만 걸리므로, 커스텀 토글
    (useState·모달)로 갈아엎으면 부대비용 내역이 종이에서 통째로
    사라진다. 아래에서 바뀌는 것은 **summary 안에 보이는 것**뿐이고,
    새 상태도 이벤트 핸들러도 만들지 않는다 — 네이티브 토글이 이미 그
    일을 한다(`scripts/printCss.test.ts`·`ComplexDetail.test.tsx`가 이
    형태를 잠근다).
  */
  return (
    <details className="cost-breakdown">
      {repeatTotal ? (
        <summary>
          부대비용{" "}
          <span className="cost-total">
            {formatWonRoundedToMan(costs.total)}
          </span>
        </summary>
      ) : (
        /*
          합계는 바로 위에서 이미 크게 적혔다. 그래서 이 자리는 글자
          없이 **아이콘 하나**다(사용자 지시: "옆에 상세보기 아이콘
          으로 누르면 볼수있게 해줘"). 뜻은 `aria-label`이 진다 —
          아이콘만 남기고 이름을 주지 않으면 스크린리더에서는 이름
          없는 버튼이 된다.

          **summary 자체가 `.fold-more-hint`다.** 인쇄에서 <details>는
          강제로 펼쳐지므로 트리거는 죽은 장치가 된다(종이에서는 누를
          수 없다) — 텍스트였을 때 접미사("보기")만 이 클래스로 감쌌던
          것과 같은 이유이고, 지금은 보이는 것이 트리거뿐이라 감싸는
          범위가 summary 전체다. `.fold-more-hint`는 인쇄에서 지워지는
          유일한 출처(`src/print/hiddenInPrint.ts`)이며, 그 규칙은
          summary만 지우고 <dl>은 건드리지 않는다.
        */
        <summary
          className="fold-more-hint cost-breakdown-toggle"
          aria-label="취득시 부대비용 내역 보기"
        >
          <CalcBasisIcon />
        </summary>
      )}
      <dl>
        {ROW_ORDER.map((key) => {
          const { label } = ROW_META[key];

          if (key === "brokerageFee") {
            // 부가세(costs.brokerageVat)를 이 줄에 합쳐 보여준다 — 사용자
            // 지시로 부가세는 별도 줄로 두지 않는다. 대신 이 줄의 note가
            // 적용 요율과 "협의 가능"이라는 사실을 밝힌다: 표에 보이는
            // 금액이 상한요율 기준 추정치일 뿐 확정 계약가가 아니라는
            // 뜻이다.
            const amount = costs.brokerageFee + costs.brokerageVat;
            return (
              <div key={key}>
                <dt>
                  {label}
                  <p className="hint">
                    {`적용 요율 ${formatFeeRate(brokerageFeeRate)}(상한) · 중개보수는 협의할 수 있어요.`}
                  </p>
                </dt>
                <dd>{formatWon(amount)}</dd>
              </div>
            );
          }

          // 취득세만 프로필에 따라 문구가 갈린다. 나머지는 고정 문구다.
          const note =
            key === "acquisitionTax" ? householdCountNote : ROW_META[key].note;
          return (
            <div key={key}>
              <dt>
                {label}
                {note !== undefined && <p className="hint">{note}</p>}
              </dt>
              <dd>{formatWon(costs[key])}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
