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
 * 마크다운 표 셀 안의 `|`를 이스케이프한다(I3).
 *
 * complexKey는 `지역|법정동|건축년도|이름` 형태다. 과소병합·평형분할 절은
 * 이 키(또는 그 일부)를 표 셀에 그대로 넣는데, 이스케이프하지 않으면 헤더가
 * 선언한 열 수보다 셀 안의 `|`가 더 열을 만들어 표가 깨진다 — 정작 신호를
 * 담은 뒤쪽 열(B, 버킷)이 넘쳐서 잘려나간다. 모든 마크다운 렌더러가 넘치는
 * 열을 버리므로 원본 텍스트로만 온전히 읽힌다. `\|`는 GFM 표에서 리터럴
 * 파이프 문자로 렌더링되고 열 구분자로 취급되지 않는다.
 */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
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
  // loadFetchLog는 디스크에서 읽은 값을 검증 없이 FetchLogEntry[]로 캐스트할
  // 뿐이다 — I5 이전에 쓰인 실제 fetch-log.json에는 cancelled 필드가 아예
  // 없다. 타입이 number를 약속해도 런타임에는 undefined일 수 있으므로 ?? 0으로
  // 방어한다(그러지 않으면 합계가 NaN으로 샌다).
  return log.reduce((sum, e) => sum + (e.cancelled ?? 0), 0);
}

/**
 * fetch 로그 전체의 파싱 실패 레코드 총계(I1).
 *
 * `FetchLogEntry.failures`는 fetch가 쓰지만 report 어디에서도 읽지 않았다 —
 * 스펙 §6·§10이 요구하는 "파싱 실패 건수" 신호가 쌓이기만 하고 사람 눈에
 * 닿는 곳이 없었다. status가 "fetched"/"cached"라도(그 시군구·월 자체는
 * 성공해도) failures가 있으면 응답 안의 일부 레코드가 조용히 버려진 것이다.
 * cancelled와 같은 이유로 ?? 0으로 방어한다.
 */
function totalFailures(log: FetchLogEntry[]): number {
  return log.reduce((sum, e) => sum + (e.failures ?? 0), 0);
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
    (e) => `| ${e.regionCode} | ${e.yearMonth} | ${escapeCell(reasonFor(e))} |`,
    entries.length,
  );
}

/**
 * 파싱 실패(failures > 0) 엔트리를 시군구·년월·건수 표로 그린다(I1).
 *
 * status: "failed"(그 시군구·월 전체 수집 실패)와는 다른 신호다 — 여기 담긴
 * 엔트리는 수집 자체는 성공했는데(fetched/cached) 그 안의 일부 레코드가
 * 형식에 안 맞아 버려진 경우다. 응답 스키마가 바뀌면 이 숫자가 급증한다.
 */
function renderParseFailureSection(entries: FetchLogEntry[]): string[] {
  return renderListSection(
    "파싱 실패",
    [
      "레코드 하나하나가 형식에 안 맞아 버려진 건수다. 시군구·월 자체는 " +
        '수집에 성공했어도(`status: "fetched"`/`"cached"`) 이 값이 있으면 ' +
        "그 안 일부 거래가 조용히 빠진 것이다. 응답 스키마가 바뀌면 이 숫자가 급증한다.",
    ],
    entries,
    ["| 시군구 | 년월 | 건수 |", "|---|---|---|"],
    (e) => `| ${e.regionCode} | ${e.yearMonth} | ${e.failures ?? 0}건 |`,
    entries.length,
  );
}

/**
 * 거래 0건(status: "empty")으로 돌아온 시군구·월 목록(I2).
 *
 * 요약에는 항상 개수/비율을 남기지만(renderSummary), 목록 자체은 그 비율이
 * config.emptyRatioWarnThreshold를 넘을 때만 그린다 — 실제로 거래가 마른
 * 지역도 있을 수 있어 항상 목록으로 사람 눈을 어지럽힐 신호는 아니지만,
 * LAWD_CD 오타나 API가 조용히 빈 응답만 주는 경우 비율이 크게 뛴다.
 */
function renderEmptyRegionMonthSection(
  entries: FetchLogEntry[],
  ratio: number,
  threshold: number,
): string[] {
  if (ratio <= threshold) return [];
  return renderListSection(
    "거래 0건 시군구·월",
    [
      `거래 0건으로 돌아온 시군구·월이 전체의 ${(ratio * 100).toFixed(1)}%로 ` +
        `설정된 경고 임계값(${(threshold * 100).toFixed(1)}%)을 넘었다. LAWD_CD가 ` +
        "틀렸거나 API가 조용히 빈 응답을 주고 있을 수 있다. 실제로 거래가 마른 " +
        "지역도 있을 수 있으니 아래 목록을 보고 판단하라.",
    ],
    entries,
    ["| 시군구 | 년월 |", "|---|---|"],
    (e) => `| ${e.regionCode} | ${e.yearMonth} |`,
    entries.length,
  );
}

function renderSummary(
  units: ComplexUnit[],
  config: ReportConfig,
  counts: { underMerge: number; overMerge: number; splitArea: number; lowConfidence: number },
  issues: {
    failed: number;
    truncated: number;
    cacheCorrupted: number;
    cancelled: number;
    parseFailures: number;
    emptyCount: number;
    totalTargets: number;
  },
): string[] {
  const ratio = units.length === 0 ? 0 : (counts.lowConfidence / units.length) * 100;
  const emptyRatio = issues.totalTargets === 0 ? 0 : issues.emptyCount / issues.totalTargets;
  return [
    "# 파이프라인 이상 신호 리포트",
    "",
    "## 적용된 임계값",
    "",
    `- 과소병합 편집거리 상한: ${config.underMergeMaxEditDistance}`,
    `- 과대병합 최고÷최저 하한: ${config.overMergeMinPriceRatio}`,
    `- 과대병합 최소 거래 건수: ${config.overMergeMinTradeCount}`,
    `- 저신뢰 판정 거래 건수 미만: ${config.lowConfidenceMinTrades}`,
    `- 거래 0건 비율 경고 임계값: ${(config.emptyRatioWarnThreshold * 100).toFixed(0)}%`,
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
    `- 파싱 실패 레코드: ${issues.parseFailures}건`,
    `- 거래 0건 시군구·월: ${issues.emptyCount} / 전체 ${issues.totalTargets} (${(emptyRatio * 100).toFixed(1)}%)`,
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
  const parseFailureEntries = log.filter((e) => (e.failures ?? 0) > 0);
  const parseFailuresTotal = totalFailures(log);
  const emptyEntries = log.filter((e) => e.status === "empty");
  const totalTargets = log.length;
  const emptyRatio = totalTargets === 0 ? 0 : emptyEntries.length / totalTargets;

  const lines: string[] = [
    ...renderSummary(
      units,
      config,
      { underMerge: underMerge.length, overMerge: overMerge.length, splitArea: splitArea.length, lowConfidence },
      {
        failed: failed.length,
        truncated: truncated.length,
        cacheCorrupted: cacheCorrupted.length,
        cancelled,
        parseFailures: parseFailuresTotal,
        emptyCount: emptyEntries.length,
        totalTargets,
      },
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
      ({ a, b, distance }) => `| ${distance} | ${escapeCell(a)} | ${escapeCell(b)} |`,
      100,
      "쌍",
    ),
    ...renderListSection(
      "과대병합 의심",
      [ADVISORY, "", "같은 키·같은 평형인데 가격이 지나치게 벌어졌다. 다른 단지가 섞였을 수 있다."],
      overMerge,
      ["| 단지 | 건축년도 | 평형 | 건수 | 최저 | 최고 | 배율 |", "|---|---|---|---|---|---|---|"],
      (u) =>
        `| ${escapeCell(u.complexName)} (${escapeCell(u.legalDongName)}) | ${u.builtYear} | ${u.areaBucket}㎡ | ${u.tradeCount} | ${won(u.minPrice)} | ${won(u.maxPrice)} | ${(u.maxPrice / u.minPrice).toFixed(2)} |`,
      50,
    ),
    ...renderListSection(
      "평형 분할 의심",
      ["1㎡ 반올림 때문에 같은 평형이 갈렸을 수 있다."],
      splitArea,
      ["| 단지 키 | 버킷 |", "|---|---|"],
      ({ complexKey, buckets }) => `| ${escapeCell(complexKey)} | ${buckets[0]}㎡ / ${buckets[1]}㎡ |`,
      50,
    ),
    ...renderParseFailureSection(parseFailureEntries),
    ...renderFetchIssueSection(
      "수집 실패",
      "`complexes.json`만 봐서는 알 수 없는 정보다. `fetch`가 남긴 로그(`data/fetch-log.json`)에서 읽는다. 재수집이 필요하다.",
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
    ...renderEmptyRegionMonthSection(emptyEntries, emptyRatio, config.emptyRatioWarnThreshold),
  ];

  return lines.join("\n");
}
