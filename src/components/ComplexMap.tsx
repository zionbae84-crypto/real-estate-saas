import { useCallback, useEffect, useRef, useState } from "react";
import type { ComplexUnit } from "../data/complexes";
import type { BurdenTier } from "../lib/complex-list";
import { loadNaverMaps } from "../lib/loadNaverMaps";
import { formatRange, unitKey } from "./ComplexList";

export interface ComplexMapProps {
  units: readonly ComplexUnit[];
  /** complexKey → 좌표. 여기 없는 단지는 지도에 안 그린다 — 대체 좌표를 만들지 않는다. */
  coordinates: ReadonlyMap<string, { lat: number; lon: number }>;
  /**
   * 평형(`unitKey`) → 부담 수준. **이 지도는 부담 수준을 스스로 계산하지
   * 않는다** — 목록을 만든 `buildComplexList`의 항목에서 `burdenTierOf`로
   * 뽑아 온 값을 그대로 받는다(App.tsx의 `burdenByUnit`).
   *
   * 지도가 자기 계산을 새로 하면 두 창이 같은 단지를 두고 다른 말을
   * 하게 된다 — 이 저장소가 여섯 번 겪은 버그 형태다. 그래서 이 값은
   * 계산이 아니라 **배선**이다.
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

/**
 * 마커 팝업 안의 HTML. 단지 이름은 맨 위에 한 번, 그 아래 평형마다 한 줄.
 *
 * 목록 행과 같은 정보만 낸다 — 가격은 범위와 거래 건수로만 말하고, 단일
 * "적정가" 숫자는 여기서도 내지 않는다(부모 스펙 §6). 평형이 여러 개여도
 * 그 원칙은 줄마다 그대로다: 어느 줄도 하나의 숫자로 접히지 않는다.
 */
function popupContent(units: readonly ComplexUnit[]): string {
  const name = escapeHtml(units[0]!.complexName);
  const rows = units
    .map(
      (u) =>
        `<span class="complex-map-popup-row">${escapeHtml(String(u.areaBucket))}㎡: ` +
        `${escapeHtml(formatRange(u.minPrice, u.maxPrice))}, 거래 ${escapeHtml(String(u.tradeCount))}건</span>`,
    )
    .join("");
  return `<div class="complex-map-popup"><strong class="complex-map-popup-name">${name}</strong>${rows}</div>`;
}

/**
 * 단지 그룹(같은 complexKey) 안에서 마커에 표시할 대표 평형을 고른다.
 * 거래건수가 가장 많은 평형 — 동률이면 배열의 첫 번째(그룹핑 순서 그대로).
 */
function representativeUnit(units: readonly ComplexUnit[]): ComplexUnit {
  return units.reduce((best, u) => (u.tradeCount > best.tradeCount ? u : best), units[0]!);
}

/**
 * 마커 위에 항상 보이는 라벨. "면적+가격범위+거래 건수"만 담는다 —
 * 단지 이름은 여기 넣지 않는다(클릭 팝업에만) — 라벨이 길어지면 지도가
 * 어지러워진다. 단일 "적정가" 숫자를 내지 않는다는 원칙은 여기서도
 * 그대로다 — 항상 `formatRange`(범위) 결과만 쓴다.
 *
 * **거래 건수를 반드시 함께 낸다.** `formatRange`는 min===max일 때 숫자
 * 하나로 접히므로("23억 5,000만원"), 건수가 없으면 이 라벨은 이 앱에서
 * 유일하게 **아무 단서 없는 가격 숫자 하나가 늘 떠 있는 자리**가 된다 —
 * 목록 행도 팝업도 같은 문자열 옆에 "거래 N건"을 늘 달고 있는데 여기만
 * 빠져 있었다. 단서 없는 숫자 하나는 감정평가·적정가로 읽히고, 그건 이
 * 제품이 절대 하지 않기로 한 말이다(부모 스펙 §6). 폭이 늘어 마커가
 * 서로 겹치는 것을 막으려 같은 줄이 아니라 아랫줄(block span)에 붙인다.
 *
 * 여기 들어가는 단지 유래 값은 전부 {@link escapeHtml}을 거친다 —
 * 이 파일은 이 앱에서 유일하게 React를 거치지 않는 HTML 문자열 자리다
 * (위 escapeHtml 주석 참고).
 *
 * 티어 클래스(`complex-map-marker--${tier}`)를 여기서 직접 클래스 목록에
 * 넣는다 — 예전엔 이 함수가 `class="complex-map-marker"`만 돌려주고
 * 호출부가 문자열 `.replace()`로 티어 클래스를 끼워 넣었는데, 그러면
 * 여기 클래스 이름이 바뀌는 순간 그 `.replace()`가 조용히 no-op이 돼
 * 모든 마커가 티어 색을 잃어도 타입체커도 테스트도 못 잡는다. `tier`를
 * 파라미터로 받아 템플릿 리터럴 안에서 완성된 클래스 문자열을 만들면
 * 그 실패 경로 자체가 없어진다.
 */
function markerLabel(
  complexKey: string,
  representative: ComplexUnit,
  tier: BurdenTier,
): string {
  const area = escapeHtml(String(representative.areaBucket));
  const range = escapeHtml(formatRange(representative.minPrice, representative.maxPrice));
  const trades = escapeHtml(String(representative.tradeCount));
  return (
    `<div class="complex-map-marker complex-map-marker--${tier}" ` +
    `data-complex-key="${escapeHtml(complexKey)}">${area}㎡ ${range}` +
    `<span class="complex-map-marker-trades">거래 ${trades}건 · ` +
    `${BURDEN_TIER_MARKER_LABEL[tier]}</span></div>`
  );
}

/**
 * 마커 라벨 꼬리표와 범례에 쓰는 부담 수준 문구.
 *
 * **색만으로 뜻을 지지 않게 하는 자리다.** 이 앱의 규칙은 "등급은 언제나
 * 글자로 먼저 있고 색은 거들 뿐"(styles.css의 구매 유형 섹션 주석)인데,
 * 마커 색의 뜻이 가격대(라벨에 숫자로 이미 적혀 있어 색이 덧말이었다)에서
 * 부담 수준으로 바뀌면 색이 **유일한** 전달자가 된다 — 흑백·색각 이상에서
 * 뜻이 통째로 사라진다. 그래서 라벨의 둘째 줄(거래 건수 옆)에 같은 뜻을
 * 짧은 글자로 함께 적는다. 가장 넓은 줄은 첫 줄(가격 범위)이라 마커 폭도
 * 대개 그대로다.
 */
const BURDEN_TIER_MARKER_LABEL: Record<BurdenTier, string> = {
  "no-loan": "대출 없이",
  loan: "대출 필요",
};

/** 범례에 쓰는 완전한 문장. 목록 행이 쓰는 말(`NoLoanLine`)과 같은 뜻이다 */
const BURDEN_TIER_LEGEND: ReadonlyArray<{ tier: BurdenTier; text: string }> = [
  { tier: "no-loan", text: "대출 없이 살 수 있어요" },
  { tier: "loan", text: "대출이 필요해요" },
];

/**
 * 그리는 단지마다 마커 색이 뜻할 **부담 수준**을 정한다.
 *
 * 예전에는 이 자리에 `priceTiers`(그린 단지들 안에서의 가격 3분위)가
 * 있었다. 그 색은 "이 지역 기준으로 싼 편"일 뿐인데 "내 예산에 맞는다"로
 * 읽혔다(App.tsx의 `mappedUnits` 주석에 남은 이력). design.md §4가 그
 * 뜻을 **부담 수준 2분류**(대출 없이 / 대출 필요)로 바꿨다 — 목록 행의
 * 같은 갈림과 뜻이 같아져, 지도와 목록이 같은 말을 한다.
 *
 * **여기서 판정하지 않는다.** `burdenByUnit`은 목록을 만든
 * `buildComplexList`의 항목에서 `burdenTierOf`로 뽑아 온 값이고, 이
 * 함수는 그 값을 대표 평형의 키로 찾아 오기만 한다. 3분위 시절과 달리
 * "그린 단지들 안에서의 상대 위치"가 아니라 **그 단지 자체의 사실**이라,
 * 몇 개를 그리든 같은 단지는 같은 색이다.
 *
 * 대표 평형(`representative`)의 값을 쓴다 — 마커 라벨에 면적·가격 범위·
 * 거래 건수를 내는 바로 그 평형이다. 한 단지 안에서 평형마다 부담이
 * 다를 수 있는데, 라벨이 말하는 평형과 색이 말하는 평형이 다르면 그
 * 마커가 스스로 어긋난다.
 *
 * 키가 없으면 `"loan"`으로 둔다. 이 앱에서는 일어날 수 없지만(같은
 * 목록에서 온 단지들이다), 일어난다면 **모르는 채로 "대출 없이 살 수
 * 있다"고 말하지 않는 쪽**이 안전한 방향이다.
 */
export function burdenTiers(
  groups: Array<{ complexKey: string; representative: ComplexUnit }>,
  burdenByUnit: ReadonlyMap<string, BurdenTier>,
): Map<string, BurdenTier> {
  return new Map(
    groups.map((g) => [
      g.complexKey,
      burdenByUnit.get(unitKey(g.representative)) ?? "loan",
    ]),
  );
}

/**
 * 한 번에 그리는 마커 수의 상한.
 *
 * 마커 라벨은 `white-space: nowrap`으로 늘 펼쳐져 있고 실제 폭이
 * 120~230px에 이른다("60㎡ 3억 9,000만원 ~ 5억 4,500만원"). 구 하나가
 * 화면에 들어오는 줌에서 이런 상자를 수백 개 그리면 지도가 아니라
 * 글자 벽이 된다 — 노원구·예산 18억으로 실측했을 때 마커 255개가
 * 816×602 지도 위에서 겹치는 쌍이 11,537개였고, **255개 전부가**
 * 무언가와 겹쳤다. 목록이 10개씩 끊어 보여주는 것과 같은 이유로
 * 여기도 상한을 둔다.
 *
 * **어느 30개인가**: `units`가 들어온 순서 그대로 앞에서부터다. 그
 * 순서는 목록이 쓰는 순서(부담이 낮은 것부터, `buildComplexList`)라,
 * 지도에 남는 30개는 목록 맨 위 30개와 같은 단지들이다 — 두 창이
 * 여기서도 어긋나지 않는다.
 *
 * **잘라낸 개수는 반드시 화면에 적는다.** 말없이 자르면 "이 지역엔
 * 이만큼뿐"으로 읽힌다.
 *
 * 클러스터링(가까운 마커를 묶어 숫자로 표시)은 여기서 만들지 않는다 —
 * 줌마다 다시 묶고 풀어야 하고, 묶인 마커의 가격 티어 색을 무엇으로
 * 할지부터 새 결정이 줄줄이 따라온다. 이 화면이 감당할 크기가 아니다.
 */
const MARKER_LIMIT = 30;

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
  /** {@link MARKER_LIMIT}에 걸려 지도에 그리지 못한 단지 수 */
  const [hiddenCount, setHiddenCount] = useState(0);

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
    setHiddenCount(0);

    loadNaverMaps(naverMapClientId)
      .then((naverGlobal) => {
        if (cancelled || containerRef.current === null) return;
        naverRef.current = naverGlobal;

        const withCoords = groupWithCoords(units, coordinates);
        if (withCoords.length === 0) {
          setNoneLocated(true);
          return;
        }

        // 상한을 넘는 단지는 그리지 않고, 몇 개를 못 그렸는지만 남긴다.
        const drawn = withCoords.slice(0, MARKER_LIMIT);
        setHiddenCount(withCoords.length - drawn.length);

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
         * 마커 색이 뜻하는 것은 **부담 수준**이다(대출 없이 / 대출 필요).
         * 목록이 쓰는 값을 그대로 받아 오므로(`burdenByUnit`), 3분위
         * 시절과 달리 "몇 개를 함께 그렸는가"가 색을 흔들지 않는다.
         */
        const groupsWithRepresentative = drawn.map((g) => ({
          ...g,
          representative: representativeUnit(g.units),
        }));
        const tiers = burdenTiers(groupsWithRepresentative, burdenByUnit);

        for (const group of groupsWithRepresentative) {
          const coord = coordinates.get(group.complexKey)!;
          const tier = tiers.get(group.complexKey) ?? "loan";
          const labelHtml = markerLabel(group.complexKey, group.representative, tier);
          const marker = new naverGlobal.maps.Marker({
            position: new naverGlobal.maps.LatLng(coord.lat, coord.lon),
            map,
            icon: {
              content: labelHtml,
              anchor: new naverGlobal.maps.Point(0, 0),
            },
          });
          const infoWindow = new naverGlobal.maps.InfoWindow({
            content: popupContent(group.units),
          });
          const clickListener = naverGlobal.maps.Event.addListener(marker, "click", () => {
            /*
             * 마커를 누르면 **목록 쪽 선택도 함께 움직인다** — App이 그
             * 선택을 한 벌만 들고 있어(`focusedComplexKey`) 목록이 그
             * 행으로 스크롤하며 표시를 단다. 팝업 토글은 그대로 둔다:
             * 팝업은 이 단지의 평형을 전부 펼쳐 보여주는 자리라 선택과
             * 하는 일이 다르다.
             */
            onFocusRef.current?.(group.complexKey);
            if (infoWindow.getMap()) infoWindow.close();
            else infoWindow.open(map, marker);
          });
          // 마커·정보창·클릭 리스너를 각각 명시적으로 정리한다 — `Event.removeListener`는
          // 마커+이벤트명이 아니라 `addListener`가 돌려준 핸들을 받는다(@types/navermaps 참고).
          cleanupFns.push(() => {
            naverGlobal.maps.Event.removeListener(clickListener);
            infoWindow.setMap(null);
            marker.setMap(null);
          });
        }

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
   * 지도가 실제로 마커를 그린 상태에서만 범례를 낸다. 로드 실패·좌표
   * 없음일 때 색 안내만 남으면 가리킬 대상이 없는 고아 문구가 된다
   * (`.complex-map-status`를 인쇄에서 지우는 것과 같은 이유).
   */
  const showLegend = !loadFailed && !noneLocated;

  return (
    <>
    {/*
      지도 칸을 채우는 액자. 범례를 지도 위 좌측 하단에 얹으려면 기준
      상자가 필요한데, **지도 컨테이너 자신을 기준으로 쓸 수 없다** —
      네이버 SDK가 그 요소의 `position`을 인라인으로 덮어쓰고(그래서
      아래 `.complex-map`은 `inset` 대신 `width/height: 100%`로 칸을
      채운다), 그 안에 우리 자식을 두면 SDK가 관리하는 DOM과 섞인다.
      그래서 액자를 하나 더 두고 범례는 그 액자의 자식으로 둔다.
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
    {showLegend && (
      /*
        마커 색이 무엇을 뜻하는지(design.md §4: "좌측 하단에 범례").
        색은 여기서도 **덧말**이다 — 같은 뜻이 마커 라벨에 글자로도
        적혀 있다(`BURDEN_TIER_MARKER_LABEL`). 색 견본에는
        `aria-hidden`을 걸어, 보조기술에는 문장만 읽히게 한다.
      */
      <ul className="complex-map-legend" aria-label="마커 색 안내">
        {BURDEN_TIER_LEGEND.map(({ tier, text }) => (
          <li key={tier} className="complex-map-legend-item">
            <span
              aria-hidden="true"
              className={`complex-map-legend-swatch complex-map-legend-swatch--${tier}`}
            />
            {text}
          </li>
        ))}
      </ul>
    )}
    </div>
    {hiddenCount > 0 && (
      /*
        잘라낸 개수를 반드시 적는다 — 말없이 자르면 "이 지역엔 이만큼
        뿐"으로 읽힌다. 지도 **밖**에 두는 이유는 지도가 실제로 떠 있는
        상태이기 때문이다(위 두 문구는 지도가 없을 때만 뜬다).
        `.complex-map-caveat`를 함께 쓴다 — 같은 성격의 한 줄이고,
        인쇄에서 지우는 이유도 같다.

        리뷰 수정(Important 1): `hiddenCount`는 `withCoords`(좌표를 아는
        단지)를 기준으로 셌는데, 예전 문구는 "조건에 맞는 단지"라고
        말해 목록 전체(좌표 미확인 포함)를 가리키는 것처럼 읽혔다. 예:
        조건에 맞는 42개 중 35개만 지오코딩에 성공하면, 잘린 12개
        옆에서도 "5개가 더 있고"처럼 실제보다 적게 말할 수 있었다 — 이
        앱이 이미 다섯 번 겪은 "A 창의 말을 B 창의 다른 필터링 결과로
        낸다" 오류와 같은 모양이다. 숫자는 그대로 두고("지도에 표시할
        수 있는 단지"), 그 숫자가 실제로 재는 대상에 맞춰 말을 바꿨다.

        리뷰 수정(Minor 5): 잘린 30개는 임의가 아니라 목록과 같은 순서
        (부담이 낮은 것부터, `groupByComplex`가 `units` 순서를 그대로
        보존하고 `units`는 부담 오름차순이다)의 맨 위 30개다. "부담이
        낮은"을 넣어 그 사실을 짧게 밝힌다 — 안 밝히면 어느 30개가
        남았는지 임의로 잘린 것처럼 읽힌다.
      */
      <p className="complex-map-caveat">
        지도가 어지러워지지 않게 부담이 낮은 {MARKER_LIMIT}개만 표시했어요.
        지도에 표시할 수 있는 단지 {hiddenCount}개가 더 있고, 목록에서 전부
        볼 수 있어요.
      </p>
    )}
    </>
  );
}
