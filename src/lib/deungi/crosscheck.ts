import { groupRights } from "./read";
import type { DeungiEntry, DeungiEntryKind, DeungiSummaryRow } from "./types";

/**
 * 본문과 요약을 서로 맞춰 본다.
 *
 * 등기부에는 같은 사실을 말하는 두 경로가 있다. 하나는 본문(갑구·을구)에서
 * **말소선이 그어지지 않은 항목**만 고르는 길이고, 다른 하나는 문서 끝의
 * 「주요 등기사항 요약」이다 — 요약에는 말소되지 않은 항목만 실린다.
 *
 * 실제 샘플에서 두 경로는 완전히 일치했다:
 *
 * | 항목 | 말소선 | 요약에 있나 |
 * |---|---|---|
 * | 상도새마을금고 18억 | 있음 | 없음 |
 * | 영북농업협동조합 19.2억 | 없음 | 있음 |
 * | 남진우 4억 | 없음 | 있음 |
 *
 * **두 경로가 서로를 지켜 준다.** 말소선을 놓치면 본문 합계가 요약보다
 * 커지고, 살아 있는 항목을 말소로 잘못 보면 본문이 요약보다 작아진다.
 * 어느 쪽이든 여기서 걸린다. 어긋났을 때 우리가 한쪽을 고르지 않는 것이
 * 이 함수의 요점이다 — 고르는 순간 절반의 확률로 위험이 사라진다.
 *
 * 요약이 스스로 밝히듯 요약은 증명서로서의 기능이 없다. 그래서 값의
 * 출처로 쓰지 않고 **본문을 검산하는 데만** 쓴다.
 */

/**
 * 두 경로에서 모두 다루는 갈래.
 *
 * 신탁·소유권·지상권은 요약의 어느 표에 실리는지가 문서마다 갈려서
 * 뺐다. 있는데 없다고 읽히면 없는 불일치를 만들고, 그 불일치는 결국
 * 모든 것을 모름으로 만들어 파서를 무력하게 한다. 이 갈래들은 대조
 * 대신 **본문에 한 번이라도 나오면 모름**이라는 더 보수적인 규칙으로
 * 다룬다(`parse.ts`).
 */
const CROSS_CHECKED_KINDS: readonly DeungiEntryKind[] = [
  "압류",
  "가압류",
  "가처분",
  "가등기",
  "경매개시결정",
  "근저당권",
  "전세권",
  "임차권",
];

export interface CrossCheckOutcome {
  agreed: boolean;
  /** 어긋난 자리들. 개발자와 로그를 위한 값이고 화면 문구는 룰셋에서 온다 */
  differences: string[];
}

function keyOf(section: string, mainRank: string): string {
  return `${section}#${mainRank}`;
}

/**
 * 순위번호별 금액.
 *
 * 부기등기(`1-4`)는 앞 등기(`1`)를 고치는 것이라 한 권리로 묶고, 금액은
 * 가장 나중 것을 쓴다. 본문과 요약을 **같은 규칙으로** 접어야 서로 견줄 수
 * 있다 — 요약도 본문과 똑같이 1번과 1-4번을 따로 적어 두기 때문이다.
 */
function amountsByRank(
  items: readonly {
    section: "갑구" | "을구";
    mainRank: string;
    kind: DeungiEntryKind;
    amountWon: number | null;
  }[],
): Map<string, number | null> {
  const found = new Map<string, number | null>();
  for (const right of groupRights(items)) {
    if (!CROSS_CHECKED_KINDS.includes(right.kind)) continue;
    found.set(keyOf(right.section, right.mainRank), right.amountWon);
  }
  return found;
}

/**
 * 살아 있는 본문 항목과 요약이 같은 것을 말하는가.
 *
 * 같은 순위번호가 양쪽에 다 있어야 하고, 금액도 같아야 한다. 한쪽에만
 * 있는 순위번호는 그 자체로 불일치다 — 요약에 있는데 본문에서 말소로
 * 읽혔다면 우리가 말소선을 잘못 본 것이고, 본문에 살아 있는데 요약에
 * 없다면 말소선을 놓친 것이다.
 */
export function crossCheck(
  liveEntries: readonly DeungiEntry[],
  summaryRows: readonly DeungiSummaryRow[],
): CrossCheckOutcome {
  const body = amountsByRank(liveEntries);
  const summary = amountsByRank(summaryRows);
  const differences: string[] = [];

  for (const [key, amount] of body) {
    if (!summary.has(key)) {
      differences.push(`본문에는 있고 요약에는 없어요: ${key}`);
      continue;
    }
    const other = summary.get(key) ?? null;
    if (amount !== other) {
      differences.push(`금액이 달라요: ${key} 본문 ${String(amount)} / 요약 ${String(other)}`);
    }
  }
  for (const key of summary.keys()) {
    if (!body.has(key)) differences.push(`요약에는 있고 본문에는 없어요: ${key}`);
  }

  return { agreed: differences.length === 0, differences };
}
