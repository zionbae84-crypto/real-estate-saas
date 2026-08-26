import { formatWon } from "../format/won";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";

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
   * summary가 합계를 한 번 더 적을 것인가. 기본은 적는다
   * ("부대비용 850만 5,278원").
   *
   * `false`를 주는 자리는 하나뿐이다: 단지 상세의 ① 블록(design.md
   * §6). 그 화면은 바로 위에서 같은 합계를 "살 때 드는 비용"으로
   * 크게 내므로, summary가 같은 숫자를 되풀이하면 한 화면에 같은
   * 금액이 두 번 박힌다. 그때 summary는 "내역"만 말한다 — 접힌 것이
   * 무엇인지는 여전히 글자로 남는다.
   *
   * **계산은 어느 쪽에서도 달라지지 않는다.** 이 prop이 정하는 것은
   * summary 문구 하나뿐이고, 표(`<dl>`) 안의 항목·금액은 그대로다.
   */
  repeatTotal?: boolean;
}

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
  brokerageFee: { label: "중개보수" },
  brokerageVat: { label: "중개보수 부가세 (10%)" },
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
 * 화면에 보여줄 순서. ROW_META가 이미 완전성(모든 필드가 있는지)을
 * 타입으로 강제하므로, 여기서는 순서만 자유롭게 정할 수 있다 — 항목을
 * 빠뜨려도 ROW_META 쪽에서 먼저 컴파일 에러가 난다.
 */
const ROW_ORDER: readonly CostKey[] = [
  "acquisitionTax",
  "brokerageFee",
  "brokerageVat",
  "legalFee",
  "movingCost",
  "housingBondCost",
];

export function CostBreakdown({
  costs,
  householdCountNote,
  repeatTotal = true,
}: CostBreakdownProps) {
  return (
    <details className="cost-breakdown">
      <summary>
        {repeatTotal ? (
          <>
            부대비용 <span className="cost-total">{formatWon(costs.total)}</span>
          </>
        ) : (
          /*
            합계는 바로 위에서 이미 크게 적혔다. 여기서는 접힌 것이
            무엇인지만 말한다 — "더 보기"는 인쇄에서 <details>가 강제로
            펼쳐지면 죽은 지시문이 되므로 접미사만 따로 감싼다
            (hiddenInPrint.ts의 `.fold-more-hint`).
          */
          <>
            내역<span className="fold-more-hint"> 보기</span>
          </>
        )}
      </summary>
      <dl>
        {ROW_ORDER.map((key) => {
          const { label } = ROW_META[key];
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
