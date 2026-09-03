import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComplexUnit } from "../data/complexes";
import {
  ELEMENTARY_SCHOOLS,
  ELEMENTARY_SCHOOL_DETAILS,
  ELEMENTARY_SCHOOL_INFO_YEAR,
  HIGH_SCHOOLS,
  MIDDLE_SCHOOLS,
  type ElementarySchoolDetail,
  type MapSchool,
} from "../data/location";
import { schoolZonesFor } from "../data/school-zones";
import { locationRules } from "../state/useLocationFacts";
import type { BurdenTier } from "../lib/complex-list";
import type { ComplexFilterState } from "../lib/complex-filters";
import { loadNaverMaps } from "../lib/loadNaverMaps";
import { regionSchoolBounds, schoolsWithinBounds, type LatLonBounds } from "../lib/school-bounds";
import { ComplexFilters } from "./ComplexFilters";
import { formatRange, unitKey } from "./ComplexList";

export interface ComplexMapProps {
  /**
   * 지도에 그릴 단지들(평형 단위). 목록이 그리는 것과 **같은 집합**을
   * 받는다 — App.tsx의 `mappedUnits` 주석 참고.
   *
   * ⚠ **참조가 안정적이어야 한다** — 호출부에서 메모이즈해 넘긴다
   * (App.tsx의 `mappedUnits`는 `useMemo`다). 아래 `coordinates`와 함께
   * 그리기 effect의 의존성이라, 렌더할 때마다 배열·Map을 인라인으로
   * 새로 만들어 넘기면 매 렌더마다 지도를 destroy → 재생성한다: 타일이
   * 다시 깜빡이고, 사용자가 맞춰 둔 줌·중심이 날아가고, InfoWindow가
   * 닫힌다. `onFocusComplex`·`focusedComplexKey`는 같은 이유로 ref에
   * 담아 의존성에서 뺐지만(아래 `onFocusRef` 참고), 이 둘은 실제로
   * 마커를 다시 그려야 하는 입력이라 뺄 수 없다.
   */
  units: readonly ComplexUnit[];
  /**
   * complexKey → 좌표. 여기 없는 단지는 지도에 안 그린다 — 대체 좌표를
   * 만들지 않는다. 참조 안정성은 위 `units`와 같은 이유로 필요하다.
   */
  coordinates: ReadonlyMap<string, { lat: number; lon: number }>;
  /**
   * 평형(`unitKey`) → 부담 수준. **이 지도는 부담 수준을 스스로 계산하지
   * 않는다** — 목록을 만든 `buildComplexList`의 항목에서 `burdenTierOf`로
   * 뽑아 온 값을 그대로 받는다(App.tsx의 `burdenByUnit`).
   *
   * 지도가 자기 계산을 새로 하면 목록과 지도가 같은 단지를 두고 다른
   * 말을 하게 된다 — 이 저장소가 여섯 번 겪은 버그 형태다. 그래서 이
   * 값은 계산이 아니라 배선이다.
   *
   * ⚠ **참조가 안정적이어야 한다** — 위 `units`·`coordinates`와 같은
   * 이유로 호출부가 메모이즈해 넘긴다.
   */
  burdenByUnit: ReadonlyMap<string, BurdenTier>;
  /** 지금 고른 단지(complexKey). 그 마커를 강조하고 지도를 그리로 옮긴다 */
  focusedComplexKey?: string | null;
  /** 마커를 눌렀다. 선택 상태는 App이 한 벌만 들고 있다(목록과 공유) */
  onFocusComplex?: (complexKey: string) => void;
  naverMapClientId: string;
  /**
   * 매매가·면적·입주년차 슬라이더 필터(사용자 지시로 지도 위 "필터"
   * 버튼 팝오버로 옮겼다 — 예전에는 사이드바에 항상 펼쳐져 있었다).
   * 이 지도는 필터 상태를 스스로 만들지도, 거르지도 않는다 — App.tsx가
   * 들고 있는 값을 그대로 받아 `ComplexFilters`에 넘기고, 사용자가
   * 슬라이더를 움직이면 `onFilterChange`로 위로 돌려보낸다. 실제로
   * 목록·지도에 무엇을 그릴지 거르는 일은 App.tsx의 `rangeFilteredUnits`가
   * 한다 — 여기서 한 번 더 거르면 목록과 지도가 서로 다른 계산으로
   * 같은 질문에 답하게 된다(이 저장소가 여섯 번 겪은 버그 형태).
   */
  filterBounds: ComplexFilterState;
  filterValue: ComplexFilterState;
  onFilterChange: (value: ComplexFilterState) => void;
}

/**
 * HTML에 문자열을 끼워 넣기 전에 이스케이프한다.
 *
 * 이 파일의 InfoWindow 콘텐츠는 **이 앱에서 유일하게 React를 거치지 않는
 * HTML 문자열**이다(네이버지도 SDK가 `content`로 마크업 문자열을 받는다).
 * 나머지 화면은 전부 React가 자동으로 이스케이프해 주므로, 여기 하나만
 * 손으로 막으면 된다.
 *
 * `complexName`은 국토부 API의 `aptNm`에서 그대로 온다 — 우리가 만든
 * 값이 아니고 어디에서도 검증하지 않는다. 그 안에 마크업이 들어 있으면
 * 여기서 실행 가능한 HTML이 되고, 그건 "입력한 재무정보가 이 브라우저를
 * 벗어나지 않는다"는 이 제품의 약속을 통째로 무너뜨리는 자리가 된다.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 단지(complexKey) 하나에 마커 하나. 그 단지의 평형이 여러 개면 팝업에
 * 줄이 여러 개 온다.
 *
 * **평형마다 마커를 만들면 안 된다.** `ComplexUnit`은 단지×평형 한 건이라
 * 같은 단지의 84㎡·59㎡가 서로 다른 unit이지만 `complexKey`는 같다
 * (`src/data/complexes.ts` 참고) — 좌표도 당연히 같으므로 마커가 정확히
 * 같은 자리에 겹쳐 쌓이고, 맨 위 하나만 눌린다. 나머지 평형은 지도에
 * 있지만 열어볼 수 없다.
 */
function groupByComplex(units: readonly ComplexUnit[]): Array<{ complexKey: string; units: ComplexUnit[] }> {
  const groups = new Map<string, ComplexUnit[]>();
  for (const unit of units) {
    const existing = groups.get(unit.complexKey);
    if (existing === undefined) groups.set(unit.complexKey, [unit]);
    else existing.push(unit);
  }
  return [...groups].map(([complexKey, groupUnits]) => ({ complexKey, units: groupUnits }));
}

/**
 * `units`를 단지로 묶은 뒤, 좌표를 아는 것만 남긴다 — 지도가 실제로
 * 그릴 수 있는 단지 목록이다.
 *
 * App.tsx가 부분 실패 캐비앗("일부 단지의 위치를 확인하지 못했어요")을
 * 띄울지 말지도 이 계산으로 판단한다(App.tsx의 `hasPartialFailures` 조건
 * 참고) — 지도가 "그릴 게 하나도 없다"고 이미 말하고 있는데 그 아래
 * "일부만 못 찾았다"는 문구가 같이 뜨면 서로 어긋난다. 두 자리가 같은
 * 함수로 같은 입력을 계산해야 그 어긋남이 생기지 않는다(별도 콜백으로
 * 상태를 끌어올리면 렌더 한 틀 늦게 갱신될 수 있어 이 계산을 그대로
 * 공유하는 쪽을 택했다).
 */
export function groupWithCoords(
  units: readonly ComplexUnit[],
  coordinates: ReadonlyMap<string, { lat: number; lon: number }>,
): Array<{ complexKey: string; units: ComplexUnit[] }> {
  return groupByComplex(units).filter((g) => coordinates.has(g.complexKey));
}

/*
 * 예전에는 여기 `popupContent`(마커를 누르면 뜨던 흰 InfoWindow의 HTML)가
 * 있었다. **사용자 지시로 없앴다 — 내용이 중복이었다.**
 *
 * 마커 라벨이 이미 단지 이름과 가격 범위를 적고 있어서, 팝업이 더하는
 * 것은 평형별 줄과 거래 건수뿐이었다. 그런데 그 둘은 마커를 누르면
 * 함께 열리는 단지 상세가 훨씬 자세히 보여준다(평형 선택기와 실거래
 * 내역 표). 같은 말을 두 번 하면서 지도까지 가리던 상자였다.
 *
 * 마커 클릭이 하던 **나머지 일은 그대로다**: 목록 쪽 선택을 함께 움직여
 * 그 단지로 스크롤하며 표시를 단다(아래 클릭 리스너).
 */

/**
 * 단지 그룹(같은 complexKey) 안에서 마커에 표시할 대표 평형을 고른다.
 * 거래건수가 가장 많은 평형 — 동률이면 배열의 첫 번째(그룹핑 순서 그대로).
 */
function representativeUnit(units: readonly ComplexUnit[]): ComplexUnit {
  return units.reduce((best, u) => (u.tradeCount > best.tradeCount ? u : best), units[0]!);
}

/**
 * 마커가 한 번에 얼마나 말하는가 — 줌에 따라 갈린다.
 *
 * 사용자 지시: "지도를 확대할 경우 지금처럼 모든 정보가 보이도록하고,
 * 지도를 축소할 경우 마커나 이름 정도만 나오도록 해줘."
 *
 * 이 단계가 있어야 {@link MARKER_LIMIT} 없이 지역 전체를 그릴 수 있다.
 * 예전엔 라벨이 늘 펼쳐져 있어 구 하나가 화면에 들어오는 줌에서 마커
 * 수백 개가 글자 벽이 됐고, 그래서 30개 상한을 뒀다 — 지금은 그 줌에서
 * 마커가 점으로 접히므로 상한 없이도 지도가 읽힌다.
 */
export type MarkerDetail = "full" | "name" | "dot";

/**
 * 일반지도/위성지도. 위성은 네이버 SDK의 `HYBRID`(위성 사진 + 도로·지명)를
 * 쓴다 — `SATELLITE`(사진만)는 도로·건물 이름이 없어 어느 단지인지 가늠할
 * 기준이 사라진다. 이 앱이 보여주려는 것은 "이 동네가 실제로 어떻게
 * 생겼는가"이지 순수 항공사진이 아니다.
 */
export type MapDisplayMode = "normal" | "satellite";

function naverMapTypeId(naverGlobal: typeof naver, mapType: MapDisplayMode): naver.maps.MapTypeId {
  return mapType === "satellite"
    ? naverGlobal.maps.MapTypeId.HYBRID
    : naverGlobal.maps.MapTypeId.NORMAL;
}

/**
 * 줌 → 마커 상세도. 경계는 네이버지도 줌 레벨 기준이다(6~21).
 *
 * - 15 이상: 한 블록~단지 몇 개가 화면을 채운다 — 이름과 가격을 다 낸다.
 * - 13~14: 동 몇 개가 들어온다 — 이름만. 가격까지 두면 라벨이 서로 겹친다.
 * - 12 이하: 구 전체 이상 — 점만. 이 줌에서 글자는 어차피 서로 가린다.
 *
 * 경계에서만 다시 그린다(아래 zoom_changed 리스너) — 줌 한 칸마다
 * 마커 수백 개의 아이콘을 갈아 끼우지 않는다.
 */
export function markerDetailForZoom(zoom: number): MarkerDetail {
  if (zoom >= 15) return "full";
  if (zoom >= 13) return "name";
  return "dot";
}

/**
 * 마커 아이콘 안에서 **좌표가 실제로 앉는 점**(`naver.maps.Point`).
 * 상세도마다 아이콘 높이가 다르므로 **앵커도 상세도마다 다르다.**
 *
 * ⚠ **예전 값은 `(0, 0)`이었고, 그게 한 번 고친 버그다.** 그때 이
 * 아이콘은 떠 있는 라벨 상자 하나뿐이었고, `(0, 0)`은 그 상자의 **왼쪽
 * 위 모서리**를 좌표에 앉힌다 — 상자는 거기서 오른쪽 아래로 자라날
 * 뿐이라 "정확히 이 지점"을 가리키는 뾰족한 자리가 아예 없었다. 사용자
 * 지시("명확하게 단지가 어디인지 표기가 될수 있도록")가 가리킨 것이
 * 바로 이 모호함이다.
 *
 * `full`·`name`은 **말풍선**이다(라벨 상자 + 그 아래 삼각 꼬리, 아래
 * {@link markerLabel} 참고) — 좌표에 앉아야 하는 점은 그 **꼬리 끝**이다.
 * `dot`은 꼬리가 없는 원이라 **원의 한가운데**가 그 점이다.
 *
 * ── x = 0 인 근거 (세 상세도 공통) ─────────────────────────────
 * 바깥 상자(`.complex-map-pin`)는 `width: 0`짜리 세로 flex 상자이고
 * `align-items: center`다. 자식(라벨·꼬리·점)은 그 폭 0인 축을 기준으로
 * 좌우로 똑같이 넘쳐 나므로, **라벨 글자가 길든 짧든** 꼬리 꼭짓점의
 * x는 언제나 상자의 x=0이다. 이름 길이에 따라 폭이 변하는 상자를
 * 재지 않아도 되는 이유가 이것이다.
 *
 * ── y 를 이렇게 세는 근거 ──────────────────────────────────────
 * 세로는 자식이 순서대로 쌓이므로 아이콘 높이가 곧 꼬리 끝의 y다.
 * `styles.css`가 그 성분을 전부 px로 못박아 둔다:
 *
 *   full  라벨 상자 테두리 위/아래   1 + 1 = 2  (.complex-map-marker border)
 *         단지명 위/아래 패딩       3 + 3 = 6  (.complex-map-marker-name padding)
 *         단지명 줄                15         (.complex-map-marker-name line-height)
 *         가격 위/아래 패딩         3 + 4 = 7  (.complex-map-marker-price padding)
 *         가격 줄                  16         (.complex-map-marker-price line-height)
 *         꼬리                      7         (.complex-map-marker-tail height)
 *         ────────────────────────────────
 *         합                       53
 *
 *   name  위에서 가격 두 줄(7 + 16)을 뺀 값       = 30
 *
 *   dot   원 지름의 절반 — 한가운데가 좌표다      = 6
 *         (`.complex-map-dot`는 `box-sizing: border-box`라 흰 테두리를
 *          더해도 지름이 12px 그대로다.)
 *
 * `rem`이 아니라 px로 적은 것도 이 산수를 위해서다: 루트 글꼴 크기가
 * 바뀌어도 앵커와 실제 높이가 갈라지지 않는다.
 *
 * `scripts/result-screen-layout.test.ts`의 "앵커 y가 styles.css의 실제
 * 박스 모델 높이와 같다"가 위 값들을 CSS에서 직접 읽어 이 합을 **세
 * 상세도 모두** 다시 계산한다 — CSS와 이 상수 중 하나만 움직이면
 * 거기서 깨진다. (그 검사가 `src/`가 아니라 `scripts/`에 있는 이유:
 * `src/` 트리는 파일 시스템 모듈을 임포트할 수 없다 —
 * `src/no-network.test.ts`가 그 금지를 전수로 잡고, 이 검사는
 * styles.css를 읽어야 한다.)
 */
export const MARKER_ANCHOR: Record<MarkerDetail, { x: number; y: number }> = {
  full: { x: 0, y: 53 },
  name: { x: 0, y: 30 },
  dot: { x: 0, y: 6 },
};

/**
 * 마커 위에 항상 보이는 라벨. **단지명·가격 범위, 둘이다.**
 *
 * 사용자 지시: "지금의 마커에서는 면적, 거래건, 대출없이(색으로 구분)는
 * 제거하고, 단지명과 금액 레인지만 표시하게 해줘." 그다음: "마커는
 * 기존처럼 대출없음/대출있음으로 구분해주고, 색상도 기존처럼
 * 밝은블루/주황으로 수정하고, 아래쪽에 표시해줘." 그다음(사각 배지
 * 시안 적용): "말풍선 핀을 남겨서 좌표지점을 표기하고, 대출 필요/없음의
 * 글자는 삭제, 아래에 맵 좌측하단부에 아이콘 색상을 간단히 설명하는걸
 * 추가해줘." — 부담 수준을 알리는 글자는 마커 **밖**(지도 범례)으로
 * 옮겨 갔고, 마커 자신은 색(채움)만으로 분류를 낸다.
 *
 * **단일 "적정가" 숫자를 내지 않는다는 원칙은 그대로다** — 언제나
 * `formatRange`(범위) 결과만 쓴다. `formatRange`는 min===max일 때 숫자
 * 하나로 접히는데("23억 5,000만원"), **바로 위에 붙은 단지명**이 그
 * 단서를 진다 — 아무 이름 없는 숫자 하나는 감정평가로 읽히지만, 이름이
 * 붙은 가격 범위는 그 단지의 거래가를 가리키는 말이다(부모 스펙 §6).
 *
 * 여기 들어가는 단지 유래 값은 전부 {@link escapeHtml}을 거친다 —
 * 이 파일은 이 앱에서 유일하게 React를 거치지 않는 HTML 문자열 자리다
 * (`complexName`은 국토부 API의 `aptNm`, 우리가 검증하지 않는 값이다).
 *
 * `.complex-map-pin`에 티어 클래스(`--no-loan`/`--loan`)를 붙인다 —
 * 라벨 상자·꼬리 둘 다 그 자손 선택자로 색을 받는다(styles.css). 라벨
 * 상자 안이 아니라 바깥 상자에 붙이는 이유는, 라벨 상자와 꼬리가 형제
 * 요소라 한쪽에 붙이면 다른 쪽에 CSS 상속으로 안 닿기 때문이다.
 *
 * 꼬리(삼각형)는 CSS 가상 요소가 아니라 **인라인 SVG**다. `position:
 * absolute`를 쓰지 않고 세로 flex로 쌓아야 위 {@link MARKER_ANCHOR}의
 * 높이 산수가 성립하고, `scripts/map-overlay-guard.test.ts`가 지키는
 * "지도 위 절대 배치 상자는 클릭을 통과시킨다" 규칙에 마커가 걸리지도
 * 않는다(마커는 눌려야 하는 것이다).
 *
 * ── 상세도(`detail`) ──────────────────────────────────────────
 * 줌에 따라 셋 중 하나를 낸다({@link markerDetailForZoom}). **세 상세도
 * 모두 `.complex-map-marker`와 `data-complex-key`를 그대로 유지한다** —
 * 선택 강조(`applyFocus`)와 클릭이 그 둘로 마커를 찾기 때문이다. 점으로
 * 접혀도 여전히 누를 수 있어야 한다.
 */
function markerLabel(
  complexKey: string,
  representative: ComplexUnit,
  tier: BurdenTier,
  detail: MarkerDetail,
): string {
  const key = escapeHtml(complexKey);
  const name = escapeHtml(representative.complexName);
  const range = escapeHtml(formatRange(representative.minPrice, representative.maxPrice));
  const open = `<div class="complex-map-pin complex-map-pin--${tier}">`;
  const tail =
    `<svg class="complex-map-marker-tail" width="14" height="7" viewBox="0 0 14 7" ` +
    `aria-hidden="true" focusable="false">` +
    `<path d="M0 0 L7 7 L14 0 Z" fill="currentColor" />` +
    `</svg>`;

  if (detail === "dot") {
    /*
     * 점에는 단지명이 없다 — 이 줌에서는 글자가 어차피 서로 가린다.
     * 이름을 `title`로도 넣지 않는다: 지도 마커의 네이티브 툴팁은
     * 터치에서 뜨지 않아 "여기 정보가 있다"는 약속만 하고 지키지
     * 못한다. 알고 싶으면 확대하거나 누르면 된다(누르면 목록·상세가
     * 그 단지로 움직인다).
     */
    return (
      `${open}<div class="complex-map-marker complex-map-dot" data-complex-key="${key}"></div></div>`
    );
  }

  const price =
    detail === "full" ? `<span class="complex-map-marker-price">${range}</span>` : "";
  return (
    `${open}` +
    `<div class="complex-map-marker" data-complex-key="${key}">` +
    `<span class="complex-map-marker-name">${name}</span>` +
    price +
    `</div>` +
    tail +
    `</div>`
  );
}

/**
 * 지도 좌측 하단에 얹는 마커 색 안내. 부담 수준 글자가 마커 밖으로
 * 옮겨 오며(위 {@link markerLabel} 주석) 색이 무슨 뜻인지 알릴 자리가
 * 필요해졌다 — 이 상자가 그 자리다. 한 번만 뜨므로 마커마다 글자 줄을
 * 반복하는 것보다 지도가 덜 어수선하다.
 */
const MARKER_LEGEND: ReadonlyArray<{ tier: BurdenTier; label: string }> = [
  { tier: "no-loan", label: "대출 없이" },
  { tier: "loan", label: "대출 필요" },
];

/**
 * 단지 그룹마다 마커에 쓸 부담 수준을 정한다.
 *
 * **여기서 판정하지 않는다.** `burdenByUnit`(호출부가 `burdenTierOf`로
 * 뽑아 넘긴 값)에서 그 그룹의 대표 평형(`representativeUnit`) 키로
 * 찾아 오기만 한다 — 지도가 자기 계산을 새로 하면 목록과 다른 말을
 * 하게 된다(`ComplexMapProps.burdenByUnit` 문서 참고).
 *
 * 값이 없으면(대표 평형이 `burdenByUnit`에 없는 경우 — 정상 배선에서는
 * 일어나지 않지만) **보수적으로 "대출 필요"로 접는다** — 부담이 없다고
 * 잘못 말하는 쪽보다 있다고 잘못 말하는 쪽이 안전한 방향이다.
 */
export function burdenTiers(
  groups: readonly { complexKey: string; representative: ComplexUnit }[],
  burdenByUnit: ReadonlyMap<string, BurdenTier>,
): ReadonlyMap<string, BurdenTier> {
  return new Map(
    groups.map(({ complexKey, representative }) => [
      complexKey,
      burdenByUnit.get(unitKey(representative)) ?? "loan",
    ]),
  );
}

/**
 * 지도 위 학교 참고 표시(사용자 지시: "학교 : 초등/중등/고등 학교 표시").
 *
 * **부담 마커·범례와 완전히 다른 레이어다.** 이 레이어는 어느 단지가
 * 예산에 맞는지·대출이 필요한지와 아무 관계가 없다 — 지하철역을 지도에
 * 얹는 것과 같은 성격의 "여기 학교가 있다"는 사실 표시일 뿐이다. 반경 안
 * 개수를 세거나 "학구도가 아니다"를 판정하는 것은 입지 화면
 * (`LocationFacts.tsx`, `src/lib/location/`)의 몫이고, 이 레이어는 그
 * 판정에 관여하지 않는다 — 그래서 `src/data/location.ts`의
 * `ELEMENTARY_SCHOOLS`(입지 화면과 공유)·`MIDDLE_SCHOOLS`·`HIGH_SCHOOLS`
 * (지도 전용)를 좌표만 읽어 점으로 찍는다.
 *
 * 기본은 **셋 다 꺼짐**이다 — 부담 마커 위에 최대 600여 개 점이 늘
 * 깔려 있으면 지도가 학교 지도로 읽힌다. 사용자가 켜야 보인다.
 */
export type SchoolLevel = "elementary" | "middle" | "high";

export const SCHOOL_LEVELS: readonly SchoolLevel[] = ["elementary", "middle", "high"];

const SCHOOL_LEVEL_LABEL: Record<SchoolLevel, string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
};

/**
 * `bounds`(지금 지도가 그린 단지들의 바운딩박스 — `regionSchoolBounds`)
 * 안에 드는 학교만 돌려준다(사용자 지시: "해당지역의 학교만 표시되게
 * 해줘" — `src/lib/school-bounds.ts` 머리 주석 참고, 이 정적 학교
 * 데이터는 여러 구를 걸치는 하나의 배열이라 거르지 않으면 이웃 구
 * 학교까지 함께 뜬다).
 */
function schoolsForLevel(
  level: SchoolLevel,
  bounds: LatLonBounds | null,
): readonly MapSchool[] {
  const all = ((): readonly MapSchool[] => {
    switch (level) {
      case "elementary":
        return ELEMENTARY_SCHOOLS ?? [];
      case "middle":
        return MIDDLE_SCHOOLS ?? [];
      case "high":
        return HIGH_SCHOOLS ?? [];
    }
  })();
  return schoolsWithinBounds(all, bounds);
}

/**
 * 학교 마커 배지 크기(px). 사용자 지시로 첨부 이미지(학사모 아이콘 +
 * 그 아래 초성 글자, 둥근 사각 배지)를 본떴다 — 아이콘 한 줄, 글자
 * 한 줄이라 정사각형이 아니라 세로가 더 긴 배지다. 그래도 이전(건물
 * 아이콘, 44px 정사각) 한 변보다는 작다.
 *
 * **가운데가 좌표를 가리킨다** — 부담 마커의 `dot`과 같은 중심 앵커다.
 */
/**
 * 통학구역 경계 색. 초등학교 마커(주황)와 같은 색이라 "이 경계는 방금 누른
 * 그 학교의 것"임이 색으로 이어진다 — 부담 마커의 파랑·주황과는 쓰임이
 * 달라(저쪽은 대출 유무) 채움을 아주 옅게 깔아 겹쳐 읽히지 않게 한다.
 */
const SCHOOL_ZONE_COLOR = "#f0923f";

const SCHOOL_MARKER_WIDTH = 30;
const SCHOOL_MARKER_HEIGHT = 40;
const SCHOOL_MARKER_ANCHOR = { x: SCHOOL_MARKER_WIDTH / 2, y: SCHOOL_MARKER_HEIGHT / 2 };

/**
 * 학사모(졸업모) 모양 — 사용자 지시로 첨부한 참고 이미지를 본떴다:
 * 마름모꼴 챙 + 그 아래 둥근 머리띠 + 오른쪽으로 늘어진 술(태슬).
 * viewBox 0 0 24 24, 색은 흰색 고정 — 배경색(학교급별, 아래
 * `complex-map-school--${level}`)만 CSS가 정한다.
 */
const SCHOOL_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
  '<path d="M12 4 L23 9 L12 14 L1 9 Z" fill="#ffffff" />' +
  '<path d="M6.5 10.3 V14.5 C6.5 16.4 9 18 12 18 C15 18 17.5 16.4 17.5 14.5 V10.3 L12 12.6 Z" fill="#ffffff" />' +
  '<line x1="22" y1="9.3" x2="22" y2="14" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" />' +
  '<circle cx="22" cy="15" r="1.2" fill="#ffffff" />' +
  "</svg>";

/**
 * `YYYY-MM-DD` → `YYYY년 M월 D일`. 원본이 준 모양 그대로는 화면에서 읽기
 * 나빠서 사람이 읽는 말로만 바꾼다 — 값 자체는 건드리지 않는다. 원본이
 * 이 모양이 아니면(빈 값 등) **그대로 돌려준다**: 못 읽는 값을 그럴듯한
 * 날짜로 지어내지 않는다.
 */
/** `{total, male, female}` → `800명 (남 385명, 여 415명)` */
export function formatHeadcount(count: {
  total: number;
  male: number;
  female: number;
}): string {
  return `${count.total}명 (남 ${count.male}명, 여 ${count.female}명)`;
}

export function formatFoundedOn(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m === null) return value;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/**
 * 아이콘 아래 초성 한 글자 — 사용자 지시: "초등>초, 중등>중, 고등>고
 * 라는 글자도 아이콘에 넣어줘"(첨부 이미지의 "초등"/"중등"/"고등" 알약
 * 라벨을 본뜨되, 마커가 작아 두 글자는 못 담아 한 글자로 줄였다).
 */
const SCHOOL_LEVEL_INITIAL: Record<SchoolLevel, string> = {
  elementary: "초",
  middle: "중",
  high: "고",
};

/**
 * 학교급별 학교 마커. **색과 글자로 학교급을 가른다**(사용자 지시:
 * "초/중/고 학교의 색상을 다르게해주고" + 위 초성 라벨) — 배경색은
 * `complex-map-school--${level}` 수정자 클래스로 styles.css가 정하고
 * (첨부 이미지의 주황/파랑/빨강을 그대로 따랐다), 부담 마커(파랑=대출
 * 없이, 주황=대출 필요)의 파랑과는 톤을 다르게 잡아 겹치지 않게 했다.
 *
 * `title`은 데스크톱 마우스 오버에서만 뜨는 덧말이다. 이 레이어의 정보
 * (그 지점에 어느 학교인가)는 이미 색+아이콘+초성 글자로 전달되므로,
 * 이름을 못 보는 터치 사용자에게도 약속을 어기지 않는다(markerLabel의
 * title 관련 주석과 대조 — 거기서는 이름이 유일한 정보였다).
 */
function schoolMarkerLabel(level: SchoolLevel, name: string): string {
  return (
    `<div class="complex-map-school complex-map-school--${level}" title="${escapeHtml(name)}">` +
    SCHOOL_ICON_SVG +
    `<span class="complex-map-school-label">${SCHOOL_LEVEL_INITIAL[level]}</span>` +
    `</div>`
  );
}

/*
 * 예전에는 여기 `MARKER_LIMIT = 30`(한 번에 그리는 마커 수의 상한)이
 * 있었다. **사용자 지시로 없앴다** — "지도 데이터는 해당지역의 데이터를
 * 모두 표시해줘."
 *
 * 그 상한의 근거는 실측이었다: 라벨이 `white-space: nowrap`으로 늘
 * 펼쳐져 있어서, 구 하나가 화면에 들어오는 줌에서 마커 255개를 그리면
 * 816×602 지도 위에서 겹치는 쌍이 11,537개였고 **255개 전부가** 무언가와
 * 겹쳤다. 지도가 아니라 글자 벽이었다.
 *
 * 그 근거를 **{@link markerDetailForZoom}이 대신 가져갔다.** 겹침이
 * 일어나던 바로 그 줌(12 이하)에서 마커는 이제 점으로 접히고, 라벨이
 * 펼쳐지는 줌(15 이상)에서는 화면에 단지 몇 개뿐이라 겹칠 것이 없다.
 * 상한 대신 **상세도**로 같은 문제를 푼 것이라, 잘라낸 개수를 적던 캐비앗
 * 문구도 함께 사라졌다(잘라내지 않으니 적을 것이 없다).
 *
 * 클러스터링(가까운 마커를 묶어 숫자로 표시)은 여전히 만들지 않는다 —
 * 줌마다 다시 묶고 풀어야 하고, 묶인 마커에 어느 단지의 이름·가격을
 * 적을지부터 새 결정이 줄줄이 따라온다. 이 화면이 감당할 크기가 아니다.
 */

/**
 * 좌표를 아는 단지만 지도에 아이콘으로 그린다. 클릭하면 이름·가격
 * 범위·거래 건수 팝업이 뜬다 — 목록 행과 같은 정보이고, 단일 "적정가"
 * 숫자는 여기서도 내지 않는다(부모 스펙 §6).
 */
export function ComplexMap({
  units,
  coordinates,
  burdenByUnit,
  focusedComplexKey = null,
  onFocusComplex,
  naverMapClientId,
  filterBounds,
  filterValue,
  onFilterChange,
}: ComplexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * 지금 살아 있는 지도·SDK 핸들. 아래 "고른 단지" effect가 지도를
   * 다시 만들지 않고 **이미 있는 지도를 옮기기** 위해 쓴다 — 선택이
   * 바뀔 때마다 지도를 재생성하면 마커·팝업이 통째로 다시 그려지고
   * 사용자가 맞춰 둔 줌·위치가 매번 날아간다.
   */
  const mapRef = useRef<naver.maps.Map | null>(null);
  const naverRef = useRef<typeof naver | null>(null);
  /**
   * 마커를 눌렀을 때 부를 콜백과, 지금 고른 단지를 담아 두는 ref.
   *
   * **의존성 배열이 아니라 ref인 이유**: 이 둘은 부모가 렌더할 때마다
   * 새 값이 될 수 있는데(핸들러는 새 함수, 선택은 매번 바뀐다), 아래
   * 그리기 effect의 의존성에 넣으면 그때마다 지도가 destroy → 재생성된다.
   */
  const onFocusRef = useRef(onFocusComplex);
  const focusedRef = useRef(focusedComplexKey);
  /**
   * 일반지도/위성지도. **컴포넌트 내부 상태다** — 목록·상세와 달리 다른
   * 화면 조각과 공유할 이유가 없다(사용자 지시: "지도 : 지금과 같은
   * 일반지도, 위성지도를 필터로").
   *
   * `mapTypeRef`로도 들고 있는 이유는 `focusedRef`와 같다: 그리기
   * effect가 `units`·`coordinates`가 바뀌어 지도를 다시 만들 때도(예:
   * 지역 재조회) 방금 고른 지도 유형이 일반으로 되돌아가지 않게, 새
   * 지도를 만들 때 이 ref를 읽어 그대로 이어 쓴다.
   */
  const [mapType, setMapType] = useState<MapDisplayMode>("normal");
  const mapTypeRef = useRef(mapType);
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * SDK는 정상인데 **그릴 좌표가 하나도 없는** 상태.
   *
   * `loadFailed`와 반드시 다른 상태로 둔다. 둘을 하나로 뭉치면 "지도를
   * 못 불러왔다"(원인: 우리 쪽 스크립트/네트워크)와 "그릴 단지의 위치를
   * 못 찾았다"(원인: 지오코딩이 그 주소들을 못 찾음)가 같은 문구로
   * 나오고, 그건 이 앱이 가장 경계하는 오류다 — 모르는 것과 확인한 것을
   * 같은 말로 보여주는 것.
   *
   * 예산에 맞는 단지만 지도에 그리게 되면서(App.tsx의 `mappedUnits`)
   * 이 상태가 실제로 자주 일어날 수 있게 됐다. 예전처럼 구 전체
   * 수십 개를 그릴 때는 그중 하나쯤은 좌표가 잡혔지만, 세 개만 그리는
   * 지금은 그 셋이 모두 지오코딩에서 빠질 수 있다. 그때 아무 문구도
   * 없이 빈 600px 상자만 남으면 사용자에겐 고장과 구분되지 않는다.
   */
  const [noneLocated, setNoneLocated] = useState(false);
  /**
   * `mapRef.current`가 실제로 채워졌는가. **ref는 리렌더를 일으키지
   * 않으므로**, 아래 학교 마커 effect가 "지도가 막 생겼다"는 순간을
   * 알아채려면 이 state가 따로 필요하다(그리기 effect가 지도를 만들
   * 때만 `true`로 켠다).
   */
  const [mapReady, setMapReady] = useState(false);
  /** 지금 켜진 학교급들. 기본은 빈 집합(위 학교 레이어 문서의 "기본은 셋 다 꺼짐" 참고) */
  const [visibleSchoolLevels, setVisibleSchoolLevels] = useState<ReadonlySet<SchoolLevel>>(
    () => new Set(),
  );
  /**
   * 마커를 눌러 기본정보를 펼친 초등학교. **초등학교에만 있다** —
   * 중·고등학교 마커는 지금도 누를 수 없다(기본정보를 싣지 않았고,
   * 학교급을 늘리면 화면이 "학군"처럼 읽히기 시작한다는 이유는
   * `scripts/pipeline/location.ts`의 `buildElementarySchools` 주석과 같다).
   */
  const [openSchool, setOpenSchool] = useState<ElementarySchoolDetail | null>(null);
  /**
   * 펼친 학교의 통학구역. 도면은 정적으로 실려 있어(`src/data/school-zones.ts`)
   * 기다릴 것이 없다 — 학교를 고르는 순간 바로 정해진다. **빈 배열은
   * "통학구역이 없다"**(사립·국립)는 뜻이고, 그건 모르는 것이 아니라 확인된
   * 사실이다.
   */
  const openSchoolZones = useMemo(
    () => (openSchool === null ? [] : schoolZonesFor(openSchool.id)),
    [openSchool],
  );
  /**
   * 지도 우상단 세 버튼(지도·필터·학교) 중 지금 펼쳐진 팝오버 하나.
   * **버튼마다 자기 상태를 따로 안 든다** — 세 팝오버가 동시에 뜰 수
   * 없어야 좁은 지도 위에서 서로 겹치지 않으므로, "지금 열린 것 하나"
   * 라는 사실 자체를 값으로 표현한다(어느 것도 안 열렸으면 `null`).
   */
  const [openControl, setOpenControl] = useState<"type" | "filter" | "school" | null>(
    null,
  );
  const controlsRef = useRef<HTMLDivElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const schoolTriggerRef = useRef<HTMLButtonElement>(null);

  /**
   * 지금 열린 팝오버의 화면 위치(`position: fixed`용) —
   * `ComplexDetail.tsx`의 "부대비용"/"한도 결정 내역" 팝업과 같은
   * 요령이다(사용자 지시: "부대비용/대출 컴포넌트처럼 아이콘 좌측에
   * 연결된 팝업이 생기게 해줘"). 그 팝업은 아이콘 **오른쪽**에 여는데
   * 거긴 사이드바 안이라 오른쪽에 공간이 있어서다 — 여기 세 버튼은
   * 지도 **오른쪽 가장자리**에 있어 그대로 따라 하면 팝업이 화면 밖으로
   * 밀린다. 그래서 좌우를 뒤집어 아이콘 **왼쪽**에 연다(`right`로
   * 앉혀, 패널 폭을 몰라도 된다 — `left = rect.left - 8 - 패널폭`처럼
   * 폭을 알아야 하는 계산을 피한다).
   */
  const [controlPopupPos, setControlPopupPos] = useState({ top: 0, right: 0 });

  function measureControlPopupPos(trigger: HTMLElement | null) {
    const rect = trigger?.getBoundingClientRect();
    if (rect === undefined) return;
    setControlPopupPos({ top: rect.top, right: window.innerWidth - rect.left + 8 });
  }

  function toggleControl(
    key: "type" | "filter" | "school",
    trigger: HTMLButtonElement,
  ) {
    const willOpen = openControl !== key;
    setOpenControl(willOpen ? key : null);
    if (willOpen) measureControlPopupPos(trigger);
  }

  /*
   * 팝오버 바깥을 누르거나 Esc를 누르면 닫는다. `openControl`이 `null`인
   * 동안은 리스너를 아예 달지 않는다 — 세 버튼 중 아무것도 안 열린
   * 평소 상태에서 문서 전체의 클릭을 매번 엿듣지 않는다.
   *
   * 열려 있는 동안은 스크롤·리사이즈에도 다시 잰다 — `position: fixed`
   * 팝업은 트리거를 스스로 따라가지 않는다(`ComplexDetail.tsx`의 같은
   * 자리 주석과 같은 이유).
   */
  useEffect(() => {
    if (openControl === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (controlsRef.current?.contains(event.target as Node)) return;
      setOpenControl(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenControl(null);
    };
    const handleScrollOrResize = () => {
      const trigger =
        openControl === "type"
          ? typeTriggerRef.current
          : openControl === "filter"
            ? filterTriggerRef.current
            : schoolTriggerRef.current;
      measureControlPopupPos(trigger);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openControl]);

  /**
   * 고른 단지의 마커에 강조 클래스를 붙이고 나머지에서 뗀다.
   *
   * 마커 라벨은 SDK가 우리 HTML 문자열을 지도 컨테이너 안에 그린 것이라
   * 리액트가 관리하지 않는다 — 그래서 렌더로 바꾸지 않고 여기서 직접
   * 클래스를 토글한다. 어느 마커가 어느 단지인지는 라벨에 박아 둔
   * `data-complex-key`가 말한다(`markerLabel`).
   */
  const applyFocus = useCallback((focused: string | null) => {
    const container = containerRef.current;
    if (container === null) return;
    for (const el of container.querySelectorAll<HTMLElement>(".complex-map-marker")) {
      el.classList.toggle(
        "complex-map-marker--focused",
        focused !== null && el.dataset.complexKey === focused,
      );
    }
  }, []);

  useEffect(() => {
    onFocusRef.current = onFocusComplex;
  }, [onFocusComplex]);

  /*
   * 목록에서 행을 눌렀거나 마커를 눌렀다 — 그 단지로 지도를 옮기고
   * 마커를 강조한다. 지도를 다시 만들지 않는다(위 mapRef 주석).
   *
   * 지도가 아직 안 떴을 수 있다(SDK 로드가 비동기다) — 그때는 여기서
   * 아무 일도 일어나지 않고, 그리기 effect가 끝나면서 `focusedRef`를
   * 보고 같은 강조를 다시 적용한다.
   */
  useEffect(() => {
    focusedRef.current = focusedComplexKey;
    applyFocus(focusedComplexKey);

    const map = mapRef.current;
    const naverGlobal = naverRef.current;
    if (map === null || naverGlobal === null || focusedComplexKey === null) return;
    const coord = coordinates.get(focusedComplexKey);
    if (coord === undefined) return;
    map.panTo(new naverGlobal.maps.LatLng(coord.lat, coord.lon));
  }, [focusedComplexKey, coordinates, applyFocus]);

  /*
   * 지도 유형 버튼을 눌렀다 — **이미 있는 지도의 타입만 바꾼다**(위
   * "고른 단지" effect와 같은 이유로 지도를 다시 만들지 않는다).
   *
   * 지도가 아직 안 떴으면 여기서 할 일이 없다 — 아래 그리기 effect가
   * 지도를 만들 때 `mapTypeRef.current`를 그대로 읽어 초기 유형으로
   * 쓴다.
   */
  useEffect(() => {
    mapTypeRef.current = mapType;
    const map = mapRef.current;
    const naverGlobal = naverRef.current;
    if (map === null || naverGlobal === null) return;
    map.setMapTypeId(naverMapTypeId(naverGlobal, mapType));
  }, [mapType]);

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    setLoadFailed(false);
    setNoneLocated(false);
    setMapReady(false);

    loadNaverMaps(naverMapClientId)
      .then((naverGlobal) => {
        if (cancelled || containerRef.current === null) return;
        naverRef.current = naverGlobal;

        // 좌표를 아는 단지는 **전부** 그린다 — 상한을 없앤 이유는 위
        // MARKER_LIMIT 자리의 주석 참고(줌 상세도가 그 몫을 가져갔다).
        const drawn = groupWithCoords(units, coordinates);
        if (drawn.length === 0) {
          setNoneLocated(true);
          return;
        }

        const coords = drawn.map((g) => coordinates.get(g.complexKey)!);
        /*
         * 중심을 **그리는 단지들의 평균 좌표**로 잡는다 — 예전에는
         * `withCoords[0]`(그룹핑 순서상 첫 단지) 하나를 그대로 중심으로
         * 썼다. 구 전체 수십 개를 그릴 때는 어디를 중심으로 잡아도
         * 화면에 뭔가는 걸렸지만, 예산에 맞는 몇 개만 그리는 지금은
         * 그 "첫 단지"가 무리의 가장자리일 수 있고 나머지가 화면 밖으로
         * 밀린다.
         */
        const center = {
          lat: coords.reduce((sum, c) => sum + c.lat, 0) / coords.length,
          lon: coords.reduce((sum, c) => sum + c.lon, 0) / coords.length,
        };
        const map = new naverGlobal.maps.Map(containerRef.current, {
          center: new naverGlobal.maps.LatLng(center.lat, center.lon),
          zoom: 14,
          // 방금 고른 지도 유형을 이어 쓴다(위 mapTypeRef 주석) — 지역을
          // 다시 조회해 이 effect가 재실행돼도 위성이 일반으로 되돌아가지
          // 않는다.
          mapTypeId: naverMapTypeId(naverGlobal, mapTypeRef.current),
        });
        /*
         * 단지가 둘 이상이면 그 전부가 들어오도록 줌을 맞춘다. 고정
         * 줌(14)만으로는 같은 구 안이어도 서로 멀리 떨어진 단지가 화면
         * 밖으로 나간다 — 목록에는 있는데 지도에는 없는 것처럼 보이면
         * 두 창이 어긋나 보인다(이 작업이 없애려던 바로 그 어긋남이다).
         *
         * 하나뿐이면 fitBounds가 폭 0인 경계를 받아 최대 줌까지
         * 당겨 버리므로 그대로 둔다. `maxZoom`도 같은 이유로 건다 —
         * 두 단지가 아주 가까울 때 거리 감각을 잃을 만큼 확대되지 않게.
         */
        if (coords.length > 1) {
          const bounds = new naverGlobal.maps.LatLngBounds(
            new naverGlobal.maps.LatLng(
              Math.min(...coords.map((c) => c.lat)),
              Math.min(...coords.map((c) => c.lon)),
            ),
            new naverGlobal.maps.LatLng(
              Math.max(...coords.map((c) => c.lat)),
              Math.max(...coords.map((c) => c.lon)),
            ),
          );
          map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48, maxZoom: 18 });
        }
        // 재렌더로 이 effect가 다시 돌면(예: units/coordinates가 바뀌면) 같은
        // DOM 컨테이너에 새 Map을 또 만들기 전에, 이전 Map을 확실히 치운다.
        mapRef.current = map;
        setMapReady(true);
        cleanupFns.push(() => {
          mapRef.current = null;
          setMapReady(false);
          map.destroy();
        });

        /*
         * 마커 라벨이 낼 대표 평형을 단지마다 하나 고른다 — 거래 건수가
         * 가장 많은 평형이다(`representativeUnit`). 라벨에 면적을 더는
         * 적지 않지만, **어느 평형의 가격 범위인가**는 여전히 이 선택이
         * 정한다.
         */
        const groupsWithRepresentative = drawn.map((g) => ({
          ...g,
          representative: representativeUnit(g.units),
        }));
        const tiers = burdenTiers(groupsWithRepresentative, burdenByUnit);

        /*
         * 지금 줌이 요구하는 상세도. `fitBounds` **뒤에** 읽는다 — 그
         * 호출이 줌을 바꾸므로, 앞에서 읽으면 초기 화면이 한 단계 어긋난
         * 상세도로 그려진다.
         */
        let detail = markerDetailForZoom(map.getZoom());

        /*
         * 상세도를 갈아 끼울 때 필요한 것들을 마커와 함께 들고 있는다.
         * **리액트 상태로 올리지 않는다** — 이 effect의 의존성이 되어
         * 줌 한 번에 지도가 통째로 destroy → 재생성되고, 사용자가 맞춰
         * 둔 줌·중심이 그 자리에서 날아간다. `applyFocus`가 클래스를
         * 직접 토글하는 것과 같은 이유다.
         */
        const drawnMarkers: Array<{
          marker: naver.maps.Marker;
          complexKey: string;
          representative: ComplexUnit;
          tier: BurdenTier;
        }> = [];

        const iconFor = (
          complexKey: string,
          representative: ComplexUnit,
          tier: BurdenTier,
          forDetail: MarkerDetail,
        ) => ({
          content: markerLabel(complexKey, representative, tier, forDetail),
          /*
           * 말풍선 **꼬리 끝**(점이면 원의 한가운데)을 좌표에 앉힌다.
           * 예전 `(0, 0)`은 라벨 상자의 왼쪽 위 모서리를 앉혀 아무 데도
           * 가리키지 않았다 — 위 {@link MARKER_ANCHOR}의 계산 근거 참고.
           * **상세도마다 아이콘 높이가 다르므로 앵커도 함께 바뀐다.**
           */
          anchor: new naverGlobal.maps.Point(
            MARKER_ANCHOR[forDetail].x,
            MARKER_ANCHOR[forDetail].y,
          ),
        });

        for (const group of groupsWithRepresentative) {
          const coord = coordinates.get(group.complexKey)!;
          const tier = tiers.get(group.complexKey) ?? "loan";
          const marker = new naverGlobal.maps.Marker({
            position: new naverGlobal.maps.LatLng(coord.lat, coord.lon),
            map,
            icon: iconFor(group.complexKey, group.representative, tier, detail),
          });
          drawnMarkers.push({
            marker,
            complexKey: group.complexKey,
            representative: group.representative,
            tier,
          });
          const clickListener = naverGlobal.maps.Event.addListener(marker, "click", () => {
            /*
             * 마커를 누르면 **목록 쪽 선택이 움직인다** — App이 그 선택을
             * 한 벌만 들고 있어(`focusedComplexKey`) 목록이 그 행으로
             * 스크롤하며 표시를 단다.
             *
             * 예전에는 여기서 흰 InfoWindow도 함께 여닫았다. 사용자
             * 지시로 없앴다(위 주석 참고) — 마커 라벨과 단지 상세가
             * 이미 같은 말을 하고 있었다.
             */
            onFocusRef.current?.(group.complexKey);
          });
          // 마커·클릭 리스너를 각각 명시적으로 정리한다 — `Event.removeListener`는
          // 마커+이벤트명이 아니라 `addListener`가 돌려준 핸들을 받는다(@types/navermaps 참고).
          cleanupFns.push(() => {
            naverGlobal.maps.Event.removeListener(clickListener);
            marker.setMap(null);
          });
        }

        /*
         * 줌이 상세도 경계를 넘으면 마커 아이콘을 갈아 끼운다.
         *
         * **경계를 넘을 때만 갈아 끼운다**(`next === detail`이면 즉시
         * 반환) — 줌 한 칸마다 마커 수백 개의 `setIcon`을 부르면 그 자체가
         * 지도를 버벅이게 한다. 상한을 없앤 지금 마커 수가 실제로 수백
         * 개일 수 있어서 이 가드가 장식이 아니다.
         *
         * `setIcon`은 마커의 DOM을 통째로 갈아 끼우므로 `applyFocus`가
         * 붙여 둔 강조 클래스도 함께 날아간다 — 그래서 바로 다시 입힌다.
         */
        const zoomListener = naverGlobal.maps.Event.addListener(map, "zoom_changed", () => {
          const next = markerDetailForZoom(map.getZoom());
          if (next === detail) return;
          detail = next;
          for (const m of drawnMarkers) {
            m.marker.setIcon(iconFor(m.complexKey, m.representative, m.tier, next));
          }
          applyFocus(focusedRef.current);
        });
        cleanupFns.push(() => naverGlobal.maps.Event.removeListener(zoomListener));

        /*
         * 마커를 방금 새로 그렸다 — 그리기 전에 고른 단지가 있었다면
         * 그 강조는 새 마커에 없다. 여기서 다시 입힌다(위 "고른 단지"
         * effect는 선택이 **바뀔 때만** 돈다).
         */
        applyFocus(focusedRef.current);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      for (const fn of cleanupFns) fn();
    };
  }, [units, coordinates, burdenByUnit, naverMapClientId, applyFocus]);

  /*
   * 학교 마커. 부담 마커와 완전히 별개인 effect다 — 위 그리기 effect와
   * 똑같이 `units`·`burdenByUnit`에는 걸리지 않는다(예산이 바뀔 때마다
   * 학교 마커까지 지웠다 다시 그리지 않는다). 다만 **`coordinates`에는
   * 건다** — 이 값은 (`units`와 달리) 예산이 아니라 지역이 바뀔 때만
   * 바뀌는 그 지역 전체의 지오코딩 결과이고(`ComplexMapProps.coordinates`
   * 문서 참고), "해당지역의 학교만" 거르는 바운딩박스(`regionSchoolBounds`)가
   * 바로 이 값에서 나오므로 지역이 바뀌면 학교도 다시 걸러야 한다.
   *
   * `mapRef`/`naverRef`는 값이 아니라 ref라 여기서 다시 읽어야 한다 —
   * `mapReady`가 그 값이 실제로 채워진 순간을 알려주는 신호다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const naverGlobal = naverRef.current;
    if (map === null || naverGlobal === null) return;

    const bounds = regionSchoolBounds(coordinates);
    const markers: naver.maps.Marker[] = [];
    const listeners: naver.maps.MapEventListener[] = [];
    for (const level of visibleSchoolLevels) {
      for (const school of schoolsForLevel(level, bounds)) {
        const marker = new naverGlobal.maps.Marker({
          position: new naverGlobal.maps.LatLng(
            school.coordinate.lat,
            school.coordinate.lon,
          ),
          map,
          icon: {
            content: schoolMarkerLabel(level, school.name),
            anchor: new naverGlobal.maps.Point(
              SCHOOL_MARKER_ANCHOR.x,
              SCHOOL_MARKER_ANCHOR.y,
            ),
          },
        });
        markers.push(marker);
        /*
         * **초등학교 마커만 누를 수 있다.** 기본정보를 실은 학교급이
         * 초등학교 하나뿐이라서다(위 `openSchool` 주석 참고). 기본정보가
         * 없는 학교(id를 못 찾는 경우)에는 리스너를 아예 걸지 않는다 —
         * 눌리는데 아무 일도 안 일어나는 컨트롤을 만들지 않는다.
         */
        if (level !== "elementary") continue;
        const detail = ELEMENTARY_SCHOOL_DETAILS.get(school.id);
        if (detail === undefined) continue;
        listeners.push(
          naverGlobal.maps.Event.addListener(marker, "click", () => {
            setOpenSchool(detail);
          }),
        );
      }
    }

    return () => {
      for (const l of listeners) naverGlobal.maps.Event.removeListener(l);
      /*
       * 마커가 사라지는 순간(학교급을 껐거나 지역이 바뀌었다) 펼쳐 둔
       * 기본정보도 닫는다 — 안 닫으면 지도에 없는 학교의 정보가 화면에
       * 남는다.
       */
      setOpenSchool(null);
      for (const m of markers) m.setMap(null);
    };
  }, [mapReady, visibleSchoolLevels, coordinates]);

  /*
   * 펼친 학교의 통학구역을 불러와 지도에 그린다.
   *
   * 도면은 509KB짜리 별도 청크라 **여기서 처음 내려받는다**(`loadSchoolZones`
   * 문서 참고) — 지도만 보는 사람은 받지 않는다. 그래서 패널이 먼저 뜨고
   * 경계가 조금 뒤에 그려질 수 있다.
   *
   * **경계는 링 하나당 폴리곤 하나로 그린다.** 한 학구가 링을 여럿 가질 수
   * 있는데(우리 지역 328개 중 28개), 그 링들을 한 폴리곤의 `paths`로 넘기면
   * 네이버 SDK가 두 번째 링부터를 구멍으로 다룬다 — 떨어져 있는 두 구역이
   * 대부분이라 그렇게 그리면 오히려 틀린 그림이 된다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const naverGlobal = naverRef.current;
    if (map === null || naverGlobal === null) return;
    if (openSchoolZones.length === 0) return;

    const drawn: naver.maps.Polygon[] = [];
    for (const zone of openSchoolZones) {
      for (const ring of zone.rings) {
        drawn.push(
          new naverGlobal.maps.Polygon({
            map,
            paths: [ring.map(([lon, lat]) => new naverGlobal.maps.LatLng(lat, lon))],
            fillColor: SCHOOL_ZONE_COLOR,
            fillOpacity: 0.12,
            strokeColor: SCHOOL_ZONE_COLOR,
            strokeOpacity: 0.9,
            strokeWeight: 2,
          }),
        );
      }
    }
    return () => {
      for (const polygon of drawn) polygon.setMap(null);
    };
  }, [openSchoolZones, mapReady]);

  /* 학교 기본정보도 팝오버와 같은 방법으로 Esc에 닫는다. */
  useEffect(() => {
    if (openSchool === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSchool(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openSchool]);

  return (
    <>
    {/*
      지도 칸을 채우는 액자. **지도 컨테이너 자신을 액자로 쓸 수 없다** —
      네이버 SDK가 그 요소의 `position`을 인라인으로 덮어쓰고(그래서
      아래 `.complex-map`은 `inset` 대신 `width/height: 100%`로 칸을
      채운다), 그 안에 우리 자식을 두면 SDK가 관리하는 DOM과 섞인다.

      이 액자는 아래 마커 색 안내(`.complex-map-legend`)를 얹는 기준
      상자이기도 하다 — 지도 칸의 높이·테두리를 지는 것도 이 상자다.
    */}
    <div className="complex-map-frame">
    <div ref={containerRef} className="complex-map" role="region" aria-label="단지 지도">
      {loadFailed && (
        <div className="region-query-error">
          {/*
            네이버지도 SDK 자체를 못 불러온 경우다 — 좌표 조회 실패
            ("단지 위치를 불러오지 못했어요", App.tsx)와 다른 원인이므로
            다르게 말한다.
          */}
          <p>지도를 표시하지 못했어요.</p>
        </div>
      )}
      {noneLocated && (
        /*
          SDK는 떴고 좌표 조회도 성공했는데, 그리라고 받은 단지들 중
          위치를 아는 것이 하나도 없는 경우다. 위 로드 실패와도, App.tsx의
          좌표 조회 실패("단지 위치를 불러오지 못했어요")와도, 조건에 맞는
          단지가 아예 없는 경우("조건에 맞는 단지가 없어…", App.tsx)와도
          원인이 달라 각각 다르게 말한다.

          리뷰 수정(Minor 3): "지도에 표시할 단지의 위치를 확인하지
          못했어요"는 위 SDK 로드 실패 문구와 표현이 너무 비슷해, 재시도
          버튼의 유무로만 두 상태가 구분됐다. 실제 원인은 "요청이
          깨졌다"가 아니라 "주소를 좌표로 바꾸지 못했다"이므로, 그 차이를
          문구 자체가 지고 가도록 "주소로는"을 앞세운다.
        */
        <p className="complex-map-caveat">
          주소로는 위치를 찾을 수 없었어요. 목록은 그대로 쓰실 수 있어요.
        </p>
      )}
    </div>
    {/*
      마커 색 안내(위 {@link MARKER_LEGEND} 참고). 지도가 실제로 그려진
      때만 뜬다 — 로드 실패·좌표 미확인 상태에서는 설명할 마커 자체가
      없다. `.complex-map` 밖, `.complex-map-frame` 안에 둔다 — SDK가
      관리하는 지도 컨테이너 자식으로 넣으면 지도가 다시 그려질 때마다
      함께 지워진다.
    */}
    {!loadFailed && !noneLocated && (
      <ul className="complex-map-legend" aria-label="마커 색 안내">
        {MARKER_LEGEND.map(({ tier, label }) => (
          <li key={tier} className="complex-map-legend-item">
            <span className={`complex-map-legend-swatch complex-map-legend-swatch--${tier}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    )}
    {/*
      초등학교 기본정보(사용자 지시로 마커를 누르면 뜬다). 지도 좌상단에
      고정한다 — 좌하단 범례·우상단 컨트롤과 자리가 겹치지 않는다.
      **마커 옆에 붙이지 않는 이유**는 마커가 화면 가장자리에 있을 때
      패널이 잘리기 때문이다(그 자리 계산을 하려면 좌표→화면 투영이
      필요한데, 그 값은 줌·이동 때마다 다시 재야 한다).

      **여기서 말하는 것은 "이 학교가 어떤 학교인가"뿐이다** — 어느 단지가
      이 학교로 배정되는지는 말하지 않는다. 배정은 거리가 아니라 학구도로
      정해지고, 우리에겐 그 학구도 데이터가 없다. 그래서 아래 고지는 새로
      쓰지 않고 룰셋의 문구(`schoolZoneNote`)를 그대로 가져다 쓴다 — 입지
      화면이 이미 같은 말을 하고 있고, 두 화면이 다른 말을 하기 시작하면
      그때부터 어느 쪽이 맞는지 알 수 없어진다.
    */}
    {openSchool !== null && (
      <section
        className="complex-map-school-info"
        aria-label={`${openSchool.name} 기본정보`}
      >
        <div className="complex-map-school-info-head">
          <p className="complex-map-school-info-title">
            <span className="complex-map-school-info-badge">
              {openSchool.foundationType}
            </span>
            {openSchool.name}
          </p>
          <button
            type="button"
            className="complex-map-school-info-close"
            aria-label="학교 정보 닫기"
            onClick={() => setOpenSchool(null)}
          >
            ✕
          </button>
        </div>
        <dl className="complex-map-school-info-facts">
          {/* 주소가 빈 문자열이면 그 줄을 통째로 내지 않는다 — 모르는 것을 빈칸으로 보여주지 않는다. */}
          {openSchool.address !== "" && (
            <>
              <dt>주소</dt>
              <dd>{openSchool.address}</dd>
            </>
          )}
          {/*
            학생 수·교원 수·전화번호는 **공시에서 온 값이라 오늘 기준이
            아니다** — 그래서 아래 각주가 공시 연도를 함께 말한다. 모르는
            값(`null`)은 줄 자체를 내지 않는다.
          */}
          {openSchool.teachers !== null && (
            <>
              <dt>교원 수</dt>
              <dd>{formatHeadcount(openSchool.teachers)}</dd>
            </>
          )}
          {openSchool.students !== null && (
            <>
              <dt>학생 수</dt>
              <dd>{formatHeadcount(openSchool.students)}</dd>
            </>
          )}
          {openSchool.phone !== null && (
            <>
              <dt>전화</dt>
              <dd>{openSchool.phone}</dd>
            </>
          )}
          <dt>설립</dt>
          <dd>
            {openSchool.foundationForm === null
              ? formatFoundedOn(openSchool.foundedOn)
              : `${openSchool.foundationType}(${openSchool.foundationForm}) ${formatFoundedOn(openSchool.foundedOn)}`}
          </dd>
          <dt>교육청</dt>
          <dd>{openSchool.officeOfEducation}</dd>
          <dt>교육지원청</dt>
          <dd>{openSchool.districtOfficeOfEducation}</dd>
          {/*
            통학구역 줄. **"없다"와 "모른다"를 다른 말로 낸다** —
            빈 배열은 통학구역이 실제로 없는 학교(사립·국립)이고,
            `null`은 도면을 아직 못 불러온 상태다.
          */}
          <dt>통학구역</dt>
          <dd>
            {openSchoolZones.length === 0
              ? "이 학교는 통학구역이 없어요"
              : openSchoolZones.some((z) => z.shared)
                ? "지도에 표시했어요 (공동통학구역 포함)"
                : "지도에 표시했어요"}
          </dd>
        </dl>
        {/*
          **공시 연도를 반드시 함께 낸다.** 학생 수·교원 수·전화번호는
          해마다 한 번 공시되는 값이라 오늘 기준이 아니다 — 연도를 빼면
          화면의 다른 숫자(실거래가 같은 최신 값)와 같은 시점처럼 읽힌다.
        */}
        {ELEMENTARY_SCHOOL_INFO_YEAR !== null &&
          (openSchool.students !== null ||
            openSchool.teachers !== null ||
            openSchool.phone !== null) && (
            <p className="complex-map-school-info-note">
              교원 수·학생 수·전화는 {ELEMENTARY_SCHOOL_INFO_YEAR}년 학교알리미
              공시 기준이에요.
            </p>
          )}
        <p className="complex-map-school-info-note">
          {locationRules.disclosure.schoolZoneNote}
        </p>
      </section>
    )}
    {/*
      지도 우상단 컨트롤 셋 — 지도 유형·필터·학교(사용자 지시로 셋을
      "버튼을 누르면 팝오버가 뜨는" 같은 모양으로 통일했다. 예전에는
      지도 유형이 토글 버튼 하나, 학교가 늘 펼쳐진 체크박스 셋, 필터는
      사이드바에 따로 있었다).

      **범례(좌하단)와 달리 눌려야 하는 컨트롤**이라
      `scripts/map-overlay-guard.test.ts`의 "클릭을 통과시키는 오버레이"
      규칙에서 `.complex-map-controls`를 명시적으로 뺐다(그 파일 머리
      주석 참고) — pointer-events는 기본값(auto) 그대로 둔다.

      `controlsRef`로 바깥 클릭·Esc를 감지해 팝오버를 닫는다(위
      `openControl` effect 참고) — 셋을 한 상자로 묶어야 그 감지가
      "이 셋 중 어디를 눌렀나"를 한 번에 판정할 수 있다.
    */}
    {!loadFailed && !noneLocated && (
      <div className="complex-map-controls" ref={controlsRef}>
        <div className="complex-map-control">
          <button
            type="button"
            ref={typeTriggerRef}
            className="complex-map-control-trigger"
            aria-expanded={openControl === "type"}
            onClick={(e) => toggleControl("type", e.currentTarget)}
          >
            지도
          </button>
          {openControl === "type" && (
            <div
              className="complex-map-control-panel complex-map-type-panel"
              style={{ top: controlPopupPos.top, right: controlPopupPos.right }}
              role="radiogroup"
              aria-label="지도 유형"
            >
              {(
                [
                  ["normal", "일반지도"],
                  ["satellite", "위성지도"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={mapType === type}
                  className={
                    mapType === type
                      ? "complex-map-segment complex-map-segment--active"
                      : "complex-map-segment"
                  }
                  onClick={() => setMapType(type)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/*
          매매가·면적·입주년차 필터(사용자 지시로 사이드바에서 이
          자리로 옮겼다 — `ComplexMapProps`의 `filterBounds` 문서 참고).
          `ComplexFilters`를 그대로 재사용한다 — 슬라이더 셋을 이 지도가
          다시 만들지 않는다.
        */}
        <div className="complex-map-control">
          <button
            type="button"
            ref={filterTriggerRef}
            className="complex-map-control-trigger"
            aria-expanded={openControl === "filter"}
            onClick={(e) => toggleControl("filter", e.currentTarget)}
          >
            필터
          </button>
          {openControl === "filter" && (
            <div
              className="complex-map-control-panel complex-map-filter-panel"
              style={{ top: controlPopupPos.top, right: controlPopupPos.right }}
            >
              <ComplexFilters
                bounds={filterBounds}
                value={filterValue}
                onChange={onFilterChange}
              />
            </div>
          )}
        </div>

        {/*
          학교급 토글(사용자 지시: "학교 : 초등/중등/고등 학교 표시").
          네이티브 `<input type="checkbox">`를 라벨로 감싼다(SEED
          체크박스를 재구현하지 않는다는 전역 제약, 키보드·스크린리더는
          브라우저가 담당). `<fieldset>`/`<legend>`인 이유도 같다 —
          체크박스 셋이 "학교 표시"라는 하나의 질문에 대한 답이다.
        */}
        <div className="complex-map-control">
          <button
            type="button"
            ref={schoolTriggerRef}
            className="complex-map-control-trigger"
            aria-expanded={openControl === "school"}
            onClick={(e) => toggleControl("school", e.currentTarget)}
          >
            학교
          </button>
          {openControl === "school" && (
            <fieldset
              className="complex-map-control-panel complex-map-school-panel"
              style={{ top: controlPopupPos.top, right: controlPopupPos.right }}
            >
              <legend>학교 표시</legend>
              {SCHOOL_LEVELS.map((level) => (
                <label key={level}>
                  <input
                    type="checkbox"
                    checked={visibleSchoolLevels.has(level)}
                    onChange={() =>
                      setVisibleSchoolLevels((prev) => {
                        const next = new Set(prev);
                        if (next.has(level)) next.delete(level);
                        else next.add(level);
                        return next;
                      })
                    }
                  />
                  {SCHOOL_LEVEL_LABEL[level]}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </div>
    )}
    </div>
    {/*
      예전에는 여기 "부담이 낮은 30개만 표시했어요" 캐비앗이 있었다.
      상한을 없애며(사용자 지시, 위 MARKER_LIMIT 자리의 주석 참고)
      **잘라내는 것이 없어져 적을 것도 없어졌다** — 좌표를 아는 단지는
      이제 전부 그린다. 좌표를 못 찾은 단지가 있을 때의 캐비앗은 지도
      **밖**(App.tsx)에 그대로 있다.
    */}
    </>
  );
}
