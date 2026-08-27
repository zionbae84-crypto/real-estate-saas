const EOK = 100_000_000;
const MAN = 10_000;

/**
 * 원 단위 정수를 한국식 표기 문자열로 바꾼다.
 * 640_000_000 → "6억 4,000만원"
 *
 * @throws RangeError NaN, Infinity, -Infinity에 대해 던진다.
 */
export function formatWon(won: number): string {
  if (!Number.isFinite(won)) {
    throw new RangeError(`유효한 숫자가 아닙니다: formatWon 인자 (${String(won)})`);
  }

  const rounded = Math.round(won);
  if (rounded === 0) return "0원";

  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);

  const eok = Math.floor(abs / EOK);
  const man = Math.floor((abs % EOK) / MAN);
  const rest = abs % MAN;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest > 0) parts.push(rest.toLocaleString("ko-KR"));

  return `${sign}${parts.join(" ")}원`;
}

/**
 * 만원 단위로 반올림해 표기한다. **화면 표시 전용이다 — 계산에 쓰지 마라.**
 *
 * 쓰는 자리는 단지 상세(`ComplexDetail`)의 큰 숫자 **둘**뿐이다:
 * "취득시 부대비용"(`costs.total`)과 "매달 나가는 돈"
 * (`burden.safety.monthlyPayment`). 사용자가 "살때드는비용, 매달나가는
 * 비용은 반올림해서 만원단위로 보여줘"라고 지시한 그 두 자리다.
 *
 * ⚠ **`formatWon`을 대체하지 않는다.** 부대비용 **내역**(`CostBreakdown`의
 * 항목별 금액)·인쇄 요약(`PrintSummary`)·목록 행의 가격 범위는 계속
 * 정확한 원 단위를 쓴다 — 내역의 합이 위의 큰 숫자와 원 단위로 맞아야
 * 하는 자리이고, 종이로 건네받은 사람이 "다른 계산을 한 것"으로 읽으면
 * 안 되는 자리다. 반올림은 **읽기 쉬우라고 큰 숫자 둘에만** 건다.
 *
 * 반올림 방향은 `Math.round`(절반은 양의 무한대 방향)를 그대로 따른다.
 * 여기서 다른 규칙(내림·반내림)을 고르지 않는 이유는 화면이 "약
 * 얼마인가"를 말하는 자리이지 보수적으로 크게 잡아야 하는 자리가
 * 아니기 때문이다 — 부담을 크게 잡는 규칙은 이미 계산 쪽
 * (`unit.maxPrice` 기준)이 지고 있다.
 *
 * @throws RangeError `formatWon`과 같은 이유로 유한하지 않은 값에 던진다.
 */
export function formatWonRoundedToMan(won: number): string {
  // throw는 한 줄로 모은다 — `scripts/tone-guard.test.ts`가 던지는
  // 메시지를 줄 단위로 걸러내므로, 여러 줄로 나누면 둘째 줄부터 화면
  // 문구로 오인돼 말투 가드에 걸린다(그 파일 주석에 같은 전례가 있다).
  if (!Number.isFinite(won)) {
    throw new RangeError(`유효한 숫자가 아닙니다: formatWonRoundedToMan 인자 (${String(won)})`);
  }
  return formatWon(Math.round(won / MAN) * MAN);
}
