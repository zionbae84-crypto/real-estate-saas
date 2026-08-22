import type { ComplexUnit } from "./aggregate";
import type { FetchLogEntry } from "./fetch";
import type { ReportConfig } from "./types";

/** 이 목록의 의미를 못박는 문장. 각 절 머리에 붙인다. */
const ADVISORY =
  "이 목록은 '합쳐라'가 아니라 **'확인하라'**는 뜻이다. 파이프라인은 자동으로 병합하지 않는다.";

/** 표준 레벤슈타인 거리. 외부 의존성 없이 직접 구현한다. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i, ...Array<number>(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/** complexKey를 `지역|법정동|건축년도|정규화명`으로 가른다. */
function splitKey(key: string): { group: string; name: string } | null {
  const parts = key.split("|");
  if (parts.length !== 4) return null;
  return { group: parts.slice(0, 3).join("|"), name: parts[3] ?? "" };
}

/**
 * 과소병합 후보. 같은 `지역|법정동|건축년도` 안에서만 이름을 비교한다.
 * 전체 쌍 비교는 O(n²)이라 1.5만 개에서 감당이 안 된다.
 */
export function findUnderMergeCandidates(
  units: ComplexUnit[],
  config: ReportConfig,
): Array<{ a: string; b: string; distance: number }> {
  const byGroup = new Map<string, Set<string>>();
  for (const unit of units) {
    const split = splitKey(unit.complexKey);
    if (split === null) continue;
    const names = byGroup.get(split.group) ?? new Set<string>();
    names.add(split.name);
    byGroup.set(split.group, names);
  }

  const found: Array<{ a: string; b: string; distance: number }> = [];
  for (const [group, nameSet] of byGroup) {
    const names = [...nameSet];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        if (a === undefined || b === undefined) continue;
        const distance = editDistance(a, b);
        const prefix = a.startsWith(b) || b.startsWith(a);
        if (distance <= config.underMergeMaxEditDistance || prefix) {
          found.push({ a: `${group}|${a}`, b: `${group}|${b}`, distance });
        }
      }
    }
  }
  return found.sort((x, y) => x.distance - y.distance);
}

/**
 * 과대병합 의심. 같은 키·같은 평형인데 가격이 지나치게 벌어진 그룹.
 * 거래 건수가 적으면 우연히 벌어질 수 있으므로 하한을 둔다.
 */
export function findOverMergeSuspects(
  units: ComplexUnit[],
  config: ReportConfig,
): ComplexUnit[] {
  return units.filter(
    (u) =>
      u.tradeCount >= config.overMergeMinTradeCount &&
      u.minPrice > 0 &&
      u.maxPrice / u.minPrice >= config.overMergeMinPriceRatio,
  );
}

/**
 * 평형 분할 의심. 1㎡ 반올림 때문에 84.4와 84.6이 84·85로 갈린 경우를 잡는다.
 * 둘 다 거래가 적을 때만 의심한다 — 한쪽이 충분하면 실제로 다른 평형일 가능성이 높다.
 */
export function findSplitAreaSuspects(
  units: ComplexUnit[],
  config: ReportConfig,
): Array<{ complexKey: string; buckets: [number, number] }> {
  const byComplex = new Map<string, ComplexUnit[]>();
  for (const unit of units) {
    const list = byComplex.get(unit.complexKey) ?? [];
    list.push(unit);
    byComplex.set(unit.complexKey, list);
  }

  const found: Array<{ complexKey: string; buckets: [number, number] }> = [];
  for (const [complexKey, list] of byComplex) {
    const sorted = [...list].sort((a, b) => a.areaBucket - b.areaBucket);
    for (let i = 1; i < sorted.length; i++) {
      const lower = sorted[i - 1];
      const upper = sorted[i];
      if (lower === undefined || upper === undefined) continue;
      if (upper.areaBucket - lower.areaBucket !== 1) continue;
      if (
        lower.tradeCount < config.lowConfidenceMinTrades &&
        upper.tradeCount < config.lowConfidenceMinTrades
      ) {
        found.push({ complexKey, buckets: [lower.areaBucket, upper.areaBucket] });
      }
    }
  }
  return found;
}

function won(value: number): string {
  return value.toLocaleString("ko-KR");
}

/**
 * 수집 실패 계열 신호를 사유별로 분리한다.
 *
 * `status: "failed"`, `truncated: true`, `cacheCorrupted: true`는 서로 다른
 * 문제고 사람이 다르게 대응해야 한다 — 실패는 재수집, 잘림은 페이지 상한
 * 점검, 캐시 손상은 디스크 점검. 하나로 뭉치면 "수집 실패 3건"이 뭘 뜻하는지
 * 사람이 로그를 다시 뒤져야 한다.
 */
function splitFetchIssues(log: FetchLogEntry[]): {
  failed: FetchLogEntry[];
  truncated: FetchLogEntry[];
  cacheCorrupted: FetchLogEntry[];
} {
  return {
    failed: log.filter((e) => e.status === "failed"),
    truncated: log.filter((e) => e.truncated === true),
    cacheCorrupted: log.filter((e) => e.cacheCorrupted === true),
  };
}

/**
 * fetch 로그 전체의 해제(취소) 거래 총계.
 *
 * I5: cancelled는 parseResponse부터 fetch-log·캐시 봉투까지 세어지고
 * 문서화까지 됐지만, 이 리포트에는 전혀 드러나지 않았다 — 주석이 "따로
 * 센다"고 약속한 신호가 소비처가 없어 사실상 죽은 필드였다. 특정 단지·월의
 * 해제 급증은 그 자체로 시장 이상 신호이므로, 요약에서라도 드러낸다.
 */
function totalCancelled(log: FetchLogEntry[]): number {
  return log.reduce((sum, e) => sum + e.cancelled, 0);
}

/**
 * 목록형 절(과소·과대병합, 평형 분할, 수집 실패류) 공통 렌더러.
 * 각 절이 각자 표를 그리면 같은 코드가 여섯 번 반복되므로 하나로 모은다.
 */
function renderListSection<T>(
  title: string,
  intro: string[],
  items: T[],
  header: [string, string] | null,
  rowFor: (item: T) => string,
  limit: number,
  overflowUnit = "건",
): string[] {
  const lines = [`## ${title}`, "", ...intro, ""];
  if (items.length === 0) {
    lines.push("(없음)", "");
    return lines;
  }
  if (header) lines.push(header[0], header[1]);
  for (const item of items.slice(0, limit)) lines.push(rowFor(item));
  if (items.length > limit) lines.push("", `…외 ${items.length - limit}${overflowUnit}`);
  lines.push("");
  return lines;
}

/** `fetch` 로그 한 종류(실패/잘림/캐시손상)를 시군구·년월·사유 표로 그린다. */
function renderFetchIssueSection(
  title: string,
  description: string,
  entries: FetchLogEntry[],
  reasonFor: (e: FetchLogEntry) => string,
): string[] {
  return renderListSection(
    title,
    [description],
    entries,
    ["| 시군구 | 년월 | 사유 |", "|---|---|---|"],
    (e) => `| ${e.regionCode} | ${e.yearMonth} | ${reasonFor(e)} |`,
    entries.length,
  );
}

function renderSummary(
  units: ComplexUnit[],
  config: ReportConfig,
  counts: { underMerge: number; overMerge: number; splitArea: number; lowConfidence: number },
  issues: { failed: number; truncated: number; cacheCorrupted: number; cancelled: number },
): string[] {
  const ratio = units.length === 0 ? 0 : (counts.lowConfidence / units.length) * 100;
  return [
    "# 파이프라인 이상 신호 리포트",
    "",
    "## 적용된 임계값",
    "",
    `- 과소병합 편집거리 상한: ${config.underMergeMaxEditDistance}`,
    `- 과대병합 최고÷최저 하한: ${config.overMergeMinPriceRatio}`,
    `- 과대병합 최소 거래 건수: ${config.overMergeMinTradeCount}`,
    `- 저신뢰 판정 거래 건수 미만: ${config.lowConfidenceMinTrades}`,
    "",
    "임계값은 `scripts/pipeline/report-config.json`에 있다. 이 리포트를 보고 조인다.",
    "",
    "## 요약",
    "",
    `- 평형 수: ${units.length}`,
    `- 단지 수: ${new Set(units.map((u) => u.complexKey)).size}`,
    `- 저신뢰 평형: ${counts.lowConfidence} (${ratio.toFixed(1)}%)`,
    `- 과소병합 후보: ${counts.underMerge}쌍`,
    `- 과대병합 의심: ${counts.overMerge}건`,
    `- 평형 분할 의심: ${counts.splitArea}건`,
    `- 수집 실패: ${issues.failed}건`,
    `- 데이터 잘림 위험: ${issues.truncated}건`,
    `- 캐시 손상(재수집됨): ${issues.cacheCorrupted}건`,
    `- 해제(취소)된 거래: ${issues.cancelled}건`,
    "",
  ];
}

export function buildReport(
  units: ComplexUnit[],
  log: FetchLogEntry[],
  config: ReportConfig,
): string {
  const underMerge = findUnderMergeCandidates(units, config);
  const overMerge = findOverMergeSuspects(units, config);
  const splitArea = findSplitAreaSuspects(units, config);
  const lowConfidence = units.filter((u) => u.lowConfidence).length;
  const { failed, truncated, cacheCorrupted } = splitFetchIssues(log);
  const cancelled = totalCancelled(log);

  const lines: string[] = [
    ...renderSummary(
      units,
      config,
      { underMerge: underMerge.length, overMerge: overMerge.length, splitArea: splitArea.length, lowConfidence },
      { failed: failed.length, truncated: truncated.length, cacheCorrupted: cacheCorrupted.length, cancelled },
    ),
    ...renderListSection(
      "과소병합 후보",
      [
        ADVISORY,
        "",
        "같은 법정동·같은 건축년도인데 이름이 비슷한 서로 다른 키다.",
        '주의: `"우성1차"`와 `"우성2차"`는 편집거리 1이지만 **실제로 다른 단지다.**',
      ],
      underMerge,
      ["| 거리 | A | B |", "|---|---|---|"],
      ({ a, b, distance }) => `| ${distance} | ${a} | ${b} |`,
      100,
      "쌍",
    ),
    ...renderListSection(
      "과대병합 의심",
      [ADVISORY, "", "같은 키·같은 평형인데 가격이 지나치게 벌어졌다. 다른 단지가 섞였을 수 있다."],
      overMerge,
      ["| 단지 | 평형 | 건수 | 최저 | 최고 | 배율 |", "|---|---|---|---|---|---|"],
      (u) =>
        `| ${u.complexName} (${u.legalDongName}) | ${u.areaBucket}㎡ | ${u.tradeCount} | ${won(u.minPrice)} | ${won(u.maxPrice)} | ${(u.maxPrice / u.minPrice).toFixed(2)} |`,
      50,
    ),
    ...renderListSection(
      "평형 분할 의심",
      ["1㎡ 반올림 때문에 같은 평형이 갈렸을 수 있다."],
      splitArea,
      ["| 단지 키 | 버킷 |", "|---|---|"],
      ({ complexKey, buckets }) => `| ${complexKey} | ${buckets[0]}㎡ / ${buckets[1]}㎡ |`,
      50,
    ),
    ...renderFetchIssueSection(
      "수집 실패",
      "`normalized.json`만으로는 알 수 없는 정보다. `fetch`가 남긴 로그에서 읽는다. 재수집이 필요하다.",
      failed,
      (e) => e.error ?? "(사유 없음)",
    ),
    ...renderFetchIssueSection(
      "데이터 잘림 위험",
      "페이지 상한에 걸렸거나 진전이 없어 일부 거래가 조용히 빠졌을 수 있다. 해당 시군구·월의 거래량이 비정상적으로 많은지 확인하라.",
      truncated,
      () => "페이지네이션 중 데이터 손실 위험",
    ),
    ...renderFetchIssueSection(
      "캐시 손상(재수집됨)",
      "캐시 파일이 깨져 다시 받았다. 재수집 자체는 성공했지만 디스크 상태를 점검하라.",
      cacheCorrupted,
      () => "캐시 파일 손상, 재수집으로 대체됨",
    ),
  ];

  return lines.join("\n");
}
