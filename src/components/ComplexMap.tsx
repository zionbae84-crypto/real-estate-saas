import { useCallback, useEffect, useRef, useState } from "react";
import type { ComplexUnit } from "../data/complexes";
import type { BurdenTier } from "../lib/complex-list";
import { loadNaverMaps } from "../lib/loadNaverMaps";
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

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    setLoadFailed(false);
    setNoneLocated(false);

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
        cleanupFns.push(() => {
          mapRef.current = null;
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
