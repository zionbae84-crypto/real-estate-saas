import type { ComplexUnit } from "./aggregate";
import { normalizeName } from "./normalize";
import type { FetchLogEntry } from "./fetch";
import type { ReportConfig } from "./types";

/** 이 목록의 의미를 못박는 문장. 각 절 머리에 붙인다. */
const ADVISORY =
  "이 목록은 '합쳐라'가 아니라 **'확인하라'**는 뜻이다. 파이프라인은 자동으로 병합하지 않는다.";

/**
 * 한 단지 ID에 이름이 여러 개인 경우.
 *
 * **"과소병합 후보"(이름 편집거리 비교)를 대신한다.** 그 신호는 키가
 * `지역|법정동|준공년도|이름`이던 시절, 표기가 흔들려 한 단지가 여러 키로
 * 갈리는 것을 사람이 잡으라고 있었다. 키가 `aptSeq`가 된 지금 그 갈림은
 * 일어날 수 없고, 실제로 그 절은 이 데이터에서 67쌍을 내놓았는데 **67쌍
 * 전부가 국토부 기준으로 서로 다른 단지**였다(예: "반포훼미리102동" /
 * "반포훼미리103동"). 100% 거짓 양성만 내는 목록은 사람 눈을 마비시켜,
 * 진짜 신호가 끼어들어도 못 보게 만든다. 그래서 지웠다.
 *
 * 대신 `aptSeq` 키 체제에서 **실제로 일어날 수 있는** 것을 본다: 국토부가
 * 같은 ID에 서로 다른 이름을 붙여 보내는 경우다. 그러면 화면에 뜨는 이름을
 * {@link pickComplexName}이 골라야 하는데, 그 선택이 무엇이었는지 사람이
 * 알아야 한다 — 개명인지 오타인지는 데이터가 말해 주지 않는다.
 *
 * 정규화 후에도 다른 이름만 센다. 공백·괄호 차이뿐이면 화면에 어느 쪽이
 * 떠도 사용자가 같은 단지로 알아보므로 사람을 부를 일이 아니다.
 */
export function findNameConflicts(
  trades: readonly { complexKey: string; complexName: string }[],
): Array<{ complexKey: string; names: string[] }> {
  const byKey = new Map<string, Map<string, string>>();
  for (const t of trades) {
    const names = byKey.get(t.complexKey) ?? new Map<string, string>();
    // 정규화명 → 원본 표기 하나. 표기 흔들림은 접고 진짜 다른 이름만 남긴다.
    names.set(normalizeName(t.complexName), t.complexName);
    byKey.set(t.complexKey, names);
  }

  const found: Array<{ complexKey: string; names: string[] }> = [];
  for (const [complexKey, names] of byKey) {
    if (names.size > 1) found.push({ complexKey, names: [...names.values()].sort() });
  }
  return found.sort((a, b) => (a.complexKey < b.complexKey ? -1 : 1));
}

/**
 * 화면에서 서로 구분되지 않는 동명 단지.
 *
 * `aptSeq`는 **파이프라인**이 단지를 가르는 문제를 풀었지만 **사용자**가
 * 가르는 문제는 풀지 못한다 — 화면에 뜨는 것은 ID가 아니라 이름이다.
 * 같은 법정동에 이름까지 같은 다른 단지가 둘 있으면, 목록에 똑같이 생긴
 * 행이 둘 뜨고 사용자는 어느 쪽이 자기가 본 매물인지 알 수 없다.
 *
 * 준공년도가 다르면 화면이 연도를 덧붙여 가른다
 * (`src/lib/complex-list.ts`의 `needsBuiltYear`). 그래서 **연도까지 같은
 * 경우**는 화면에 지금 아무 대책이 없다는 뜻이라 따로 표시한다.
 *
 * 이것이 옛 "과대병합 의심"이 걱정하던 것의 정직한 후계다. 옛 신호는
 * "다른 단지가 한 키로 뭉쳤을지 모른다"였는데 그 일은 이제 일어나지
 * 않는다. 남은 위험은 뭉치는 것이 아니라 **똑같아 보이는** 것이다.
 */
export function findAmbiguousDisplayNames(
  units: ComplexUnit[],
): Array<{ legalDongName: string; complexName: string; keys: string[]; sameBuiltYear: boolean }> {
  const byName = new Map<string, Map<string, number>>();
  for (const u of units) {
    const key = `${u.legalDongName}|${u.complexName}`;
    const keys = byName.get(key) ?? new Map<string, number>();
    keys.set(u.complexKey, u.builtYear);
    byName.set(key, keys);
  }

  const found: Array<{
    legalDongName: string;
    complexName: string;
    keys: string[];
    sameBuiltYear: boolean;
  }> = [];
  for (const [nameKey, keys] of byName) {
    if (keys.size < 2) continue;
    const [legalDongName = "", complexName = ""] = nameKey.split("|");
    found.push({
      legalDongName,
      complexName,
      keys: [...keys.keys()].sort(),
      sameBuiltYear: new Set(keys.values()).size === 1,
    });
  }
  // 화면에 대책이 없는 것(연도까지 같은 것)을 위로 올린다.
  return found.sort((a, b) => Number(b.sameBuiltYear) - Number(a.sameBuiltYear));
}

/**
 * 같은 단지·같은 평형인데 가격 범위가 지나치게 넓은 그룹.
 *
 * **뜻이 바뀌었다.** 옛 이름은 "과대병합 의심"이었고 설명은 "다른 단지가
 * 섞였을 수 있다"였다. 키가 `aptSeq`가 된 지금 그 설명은 **틀렸다** — 국토부가
 * 단지 하나에 ID 하나를 매기므로 다른 단지가 섞일 수는 없다. 틀린 설명을
 * 단 목록은 사람을 엉뚱한 곳으로 보낸다(다른 단지가 섞였나 확인하러 갔다가
 * 아무것도 못 찾고 돌아온다).
 *
 * 그렇다고 지우지는 않는다. 이 검사가 잡는 **사실** 자체는 여전히 참이고,
 * 이 제품에는 오히려 더 직접적으로 중요하다: 화면은 시세를 `minPrice ~
 * maxPrice` 범위로만 말하는데, 그 범위가 2배 넘게 벌어져 있으면 화면이 내는
 * 숫자가 사용자에게 사실상 아무것도 알려 주지 못한다는 뜻이다. 같은 단지
 * 같은 평형에서 왜 그렇게 벌어졌는지(층·향·특수관계 거래·리모델링)는
 * 사람이 볼 일이다.
 *
 * 거래 건수가 적으면 우연히 벌어질 수 있으므로 하한을 둔다.
 */
export function findWidePriceRangeUnits(
  units: ComplexUnit[],
  config: ReportConfig,
): ComplexUnit[] {
  return units.filter(
    (u) =>
      u.tradeCount >= config.widePriceRangeMinTradeCount &&
      u.minPrice > 0 &&
      u.maxPrice / u.minPrice >= config.widePriceRangeMinRatio,
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
  cacheSchemaMismatch: FetchLogEntry[];
} {
  return {
    failed: log.filter((e) => e.status === "failed"),
    truncated: log.filter((e) => e.truncated === true),
    cacheCorrupted: log.filter((e) => e.cacheCorrupted === true),
    cacheSchemaMismatch: log.filter((e) => e.cacheSchemaMismatch === true),
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
 * 거래 0건으로 집계된 시군구·월을 골라낸다(I2 재발 방지).
 *
 * `status`가 아니라 `tradeCount`로 판정한다. `status`는 수집 **시점**에만
 * 정해지는 값이라 두 번째 실행부터 신뢰할 수 없다 — 거래 0건으로 마감된
 * 달이 캐시되면, 다음 실행의 캐시 적중 경로(fetch.ts의 `readCache` 분기)는
 * `tradeCount: 0`이든 아니든 `status: "cached"`를 낸다. `status === "empty"`로
 * 뽑으면 이 신호는 "지금 열려 있는 달"만 설명하게 되어, 66개 시군구로 넓힐 때
 * LAWD_CD 하나가 틀려 그 구가 통째로 빠져도 첫 실행 이후엔 비율이 조용히
 * 가라앉는다. `tradeCount`는 캐시 봉투에서 그대로 이어받는 값이라 캐시를
 * 거쳐도 살아남는다(truncated·failures와 같은 성질).
 *
 * `status: "failed"`(수집 자체가 안 됨)는 다른 문제이고 "수집 실패" 절에서
 * 이미 별도로 센다 — `tradeCount`가 항상 0이므로 여기서 제외하지 않으면
 * 두 절에 같은 항목이 중복으로 잡힌다.
 */
function isEmptyRegionMonth(entry: FetchLogEntry): boolean {
  return entry.status !== "failed" && entry.tradeCount === 0;
}

/**
 * 거래 0건으로 집계된 시군구·월 목록(I2).
 *
 * 요약에는 항상 개수/비율을 남기지만(renderSummary), 목록 자체은 그 비율이
 * config.emptyRatioWarnThreshold를 넘을 때만 그린다 — 실제로 거래가 마른
 * 지역도 있을 수 있어 항상 목록으로 사람 눈을 어지럽힐 신호는 아니지만,
 * LAWD_CD 오타나 API가 조용히 빈 응답만 주는 경우 비율이 크게 뛴다.
 *
 * 목록에는 이번 실행에서 새로 받은 달과 캐시 적중으로 재사용한 달이 모두
 * 섞여 있다(isEmptyRegionMonth 참고) — status 열만 보고 "새로 확인됨"으로
 * 오해하지 않도록 안내 문구에 명시한다.
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
      `거래 0건으로 집계된 시군구·월이 전체의 ${(ratio * 100).toFixed(1)}%로 ` +
        `설정된 경고 임계값(${(threshold * 100).toFixed(1)}%)을 넘었다. LAWD_CD가 ` +
        "틀렸거나 API가 조용히 빈 응답을 주고 있을 수 있다. 실제로 거래가 마른 " +
        "지역도 있을 수 있으니 아래 목록을 보고 판단하라. 이번 실행에서 새로 받은 " +
        "달과 캐시 적중(재사용)한 달을 모두 포함한다.",
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
  counts: {
    nameConflict: number;
    ambiguousDisplay: number;
    ambiguousSameYear: number;
    widePriceRange: number;
    splitArea: number;
    lowConfidence: number;
  },
  issues: {
    failed: number;
    truncated: number;
    cacheCorrupted: number;
    cacheSchemaMismatch: number;
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
    `- 가격 범위 최고÷최저 하한: ${config.widePriceRangeMinRatio}`,
    `- 가격 범위 판정 최소 거래 건수: ${config.widePriceRangeMinTradeCount}`,
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
    `- 한 단지 ID에 이름 여러 개: ${counts.nameConflict}건`,
    `- 화면에서 구분 안 되는 동명 단지: ${counts.ambiguousDisplay}건 (그중 준공년도까지 같아 대책 없음: ${counts.ambiguousSameYear}건)`,
    `- 가격 범위가 지나치게 넓은 평형: ${counts.widePriceRange}건`,
    `- 평형 분할 의심: ${counts.splitArea}건`,
    `- 수집 실패: ${issues.failed}건`,
    `- 파싱 실패 레코드: ${issues.parseFailures}건`,
    `- 거래 0건 시군구·월: ${issues.emptyCount} / 전체 ${issues.totalTargets} (${(emptyRatio * 100).toFixed(1)}%, 캐시 적중 포함)`,
    `- 데이터 잘림 위험: ${issues.truncated}건`,
    `- 캐시 손상(재수집됨): ${issues.cacheCorrupted}건`,
    `- 캐시 형식 불일치(재수집됨): ${issues.cacheSchemaMismatch}건`,
    `- 해제(취소)된 거래: ${issues.cancelled}건`,
    "",
  ];
}

/**
 * @param trades 이름 충돌을 보려면 **집계 전 거래**가 필요하다. `units`에는
 *   단지마다 대표 이름 하나만 남아 있어서, 국토부가 같은 ID에 다른 이름을
 *   붙여 보냈다는 사실이 이미 지워진 뒤다.
 */
export function buildReport(
  units: ComplexUnit[],
  log: FetchLogEntry[],
  config: ReportConfig,
  trades: readonly { complexKey: string; complexName: string }[] = [],
): string {
  const nameConflicts = findNameConflicts(trades);
  const ambiguous = findAmbiguousDisplayNames(units);
  const widePriceRange = findWidePriceRangeUnits(units, config);
  const splitArea = findSplitAreaSuspects(units, config);
  const lowConfidence = units.filter((u) => u.lowConfidence).length;
  const { failed, truncated, cacheCorrupted, cacheSchemaMismatch } = splitFetchIssues(log);
  const cancelled = totalCancelled(log);
  const parseFailureEntries = log.filter((e) => (e.failures ?? 0) > 0);
  const parseFailuresTotal = totalFailures(log);
  const emptyEntries = log.filter(isEmptyRegionMonth);
  const totalTargets = log.length;
  const emptyRatio = totalTargets === 0 ? 0 : emptyEntries.length / totalTargets;

  const lines: string[] = [
    ...renderSummary(
      units,
      config,
      {
        nameConflict: nameConflicts.length,
        ambiguousDisplay: ambiguous.length,
        ambiguousSameYear: ambiguous.filter((a) => a.sameBuiltYear).length,
        widePriceRange: widePriceRange.length,
        splitArea: splitArea.length,
        lowConfidence,
      },
      {
        failed: failed.length,
        truncated: truncated.length,
        cacheCorrupted: cacheCorrupted.length,
        cacheSchemaMismatch: cacheSchemaMismatch.length,
        cancelled,
        parseFailures: parseFailuresTotal,
        emptyCount: emptyEntries.length,
        totalTargets,
      },
    ),
    ...renderListSection(
      "한 단지 ID에 이름 여러 개",
      [
        ADVISORY,
        "",
        "국토부가 같은 `aptSeq`에 서로 다른 단지명을 붙여 보냈다. 파이프라인은 " +
          "가장 많이 쓰인 이름(같으면 더 최근 계약, 그래도 같으면 사전순)을 골라 " +
          "화면에 낸다 — 아래 **대표**가 그 선택이다.",
        "",
        "개명인지 오표기인지는 데이터가 말해 주지 않는다. 고른 이름이 사용자가 " +
          "그 단지를 찾을 때 쓰는 이름인지 사람이 확인하라. 표기만 다른 경우" +
          "(공백·괄호 차이)는 여기 오지 않는다.",
      ],
      nameConflicts,
      ["| 단지 ID | 대표 | 그 밖의 표기 |", "|---|---|---|"],
      ({ complexKey, names }) =>
        `| ${escapeCell(complexKey)} | ${escapeCell(names[0] ?? "")} | ${escapeCell(names.slice(1).join(", "))} |`,
      50,
    ),
    ...renderListSection(
      "화면에서 구분 안 되는 동명 단지",
      [
        ADVISORY,
        "",
        "같은 법정동에 이름까지 같은 **다른** 단지다(`aptSeq`가 다르다). " +
          "파이프라인은 제대로 갈랐지만 **화면에는 똑같이 생긴 행이 둘 뜬다** — " +
          "사용자는 어느 쪽이 자기가 본 매물인지 알 수 없다.",
        "",
        "준공년도가 다르면 화면이 연도를 덧붙여 가른다. **`대책` 열이 `없음`인 " +
          "행은 연도까지 같아 화면에 지금 아무 대책이 없다는 뜻이다** — 그때는 " +
          "화면에 무엇을 더 보여 줄지 정해야 한다.",
      ],
      ambiguous,
      ["| 법정동 | 단지명 | 단지 ID | 대책 |", "|---|---|---|---|"],
      ({ legalDongName, complexName, keys, sameBuiltYear }) =>
        `| ${escapeCell(legalDongName)} | ${escapeCell(complexName)} | ${escapeCell(keys.join(", "))} | ${sameBuiltYear ? "**없음**" : "준공년도 표기"} |`,
      50,
    ),
    ...renderListSection(
      "가격 범위가 지나치게 넓은 평형",
      [
        ADVISORY,
        "",
        "같은 단지·같은 평형인데 최고가가 최저가의 몇 배다. **다른 단지가 " +
          "섞인 것은 아니다** — 키가 `aptSeq`라 그럴 수 없다.",
        "",
        "화면은 시세를 `최저 ~ 최고` 범위로만 말한다. 그 범위가 이만큼 벌어져 " +
          "있으면 화면이 내는 숫자가 사용자에게 사실상 아무것도 알려 주지 " +
          "못한다는 뜻이다. 층·향·특수관계 거래·리모델링 중 무엇 때문인지 확인하라.",
      ],
      widePriceRange,
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
    ...renderFetchIssueSection(
      "캐시 형식 불일치(재수집됨)",
      "캐시 파일이 옛 형식(`schemaVersion` 불일치)이라 다시 받았다. 파서가 남기는 필드가 바뀐 뒤의 정상적인 한 번짜리 전환이다 — 디스크를 의심할 일은 아니다. 다음 실행에도 계속 나온다면 재수집이 실제로는 안 되고 있다는 뜻이므로 그때는 봐야 한다.",
      cacheSchemaMismatch,
      () => "옛 형식 캐시, 재수집으로 대체됨",
    ),
    ...renderEmptyRegionMonthSection(emptyEntries, emptyRatio, config.emptyRatioWarnThreshold),
  ];

  return lines.join("\n");
}
