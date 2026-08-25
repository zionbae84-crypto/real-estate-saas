import { buildTargets, defaultWait, fetchAllPages, MONTHS_BACK, type Waiter } from "./fetch";
import { normalizeAll } from "./normalize";
import { aggregate } from "./aggregate";
import { toEmittedUnit, type EmittedComplexUnit } from "./emit";
import type { ReportConfig } from "./types";

/**
 * 지역 하나의 최근 12개월치를 라이브로 조회해 집계한다.
 *
 * 전부 메모리에서만 처리한다 — 디스크에 아무것도 쓰지 않는다. 12개월인
 * 이유는 `aggregate()`가 저신뢰 판정 등에 12개월 창을 쓰기 때문이다(화면에
 * 보이는 창은 6개월이지만, 6개월만 받으면 이 판정이 배치 파이프라인과
 * 달라진다). 지역이 하나뿐이라 12개월을 병렬로 호출해도 무리가 없다 —
 * 배치 파이프라인의 순차+쓰로틀은 지역이 여러 개일 때만 필요했다.
 *
 * 한 달이라도 `fetchAllPages`가 던지면 이 함수도 그대로 던진다 — 절반만
 * 모은 데이터를 성공으로 응답하지 않기 위해서다. 호출자(API 핸들러)가
 * 이걸 실패 상태코드로 옮긴다.
 */
export async function fetchLiveComplexes(
  regionCode: string,
  dong: string | null,
  now: Date,
  key: string,
  config: ReportConfig,
  wait: Waiter = defaultWait,
): Promise<EmittedComplexUnit[]> {
  const targets = buildTargets(now, MONTHS_BACK, [regionCode]);
  const pages = await Promise.all(
    targets.map((t) => fetchAllPages(t.regionCode, t.yearMonth, key, wait)),
  );
  const trades = pages.flatMap((p) => p.trades);
  const normalized = normalizeAll(trades);
  const units = aggregate(normalized, now, config);
  const filtered = dong === null ? units : units.filter((u) => u.legalDongName === dong);
  return filtered.map(toEmittedUnit);
}
