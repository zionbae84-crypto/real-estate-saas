import { redactKey } from "../../scripts/pipeline/fetch.js";

const ENDPOINT = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

interface AptInfoResponseBody {
  data?: Array<{ UNIT_CNT?: number }>;
}

interface AptInfoListResponseBody {
  data?: Array<{ PNU?: unknown; UNIT_CNT?: unknown }>;
  /**
   * **필터를 적용한 뒤의 건수.** `totalCount`가 아니라 이 값을 봐야 한다 —
   * `totalCount`는 `cond[...]`를 무시한 데이터셋 전체 건수(30만 건대)라
   * 페이지를 언제 멈출지 알려주지 못한다(실측으로 확인했다).
   */
  matchCount?: unknown;
}

/**
 * PNU로 한국부동산원 "공동주택 단지 식별정보 조회 서비스"에서 세대수를
 * 조회한다.
 *
 * 못 찾으면(`data`가 빈 배열) `null` — 에러가 아니다. `naverGeocode.ts`의
 * `geocodeAddress`와 같은 원칙: "확인했더니 없다"와 "확인하지 못했다"를
 * 구분해야 하는데, 여기서 실패를 삼키면 그 구분이 불가능해진다. 그래서
 * HTTP 실패는 그대로 던진다 — 호출부(`lookupHouseholdCounts`)가 그
 * PNU 하나만 "확인 못 함"으로 다룬다.
 *
 * 이 API는 국토부 실거래가·K-apt와 같은 `apis.data.go.kr` 도메인이 아니라
 * `api.odcloud.kr`이지만, **공공데이터포털(data.go.kr) 계정의 같은
 * 인증키를 그대로 쓴다** — 실측으로 확인했다(별도 발급 불필요).
 */
export async function fetchHouseholdCount(
  pnu: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("page", "1");
  url.searchParams.set("perPage", "1");
  url.searchParams.set("cond[PNU::EQ]", pnu);
  url.searchParams.set("serviceKey", key);

  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(redactKey(message, key));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      redactKey(`한국부동산원 공동주택 단지 식별정보 조회 실패: HTTP ${res.status} ${body}`, key),
    );
  }

  const body = (await res.json()) as AptInfoResponseBody;
  const first = body.data?.[0];
  if (first === undefined) return null;

  const count = first.UNIT_CNT;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
  return Math.round(count);
}

/** 일괄 조회 한 페이지에 담는 건수. 이 API가 받아 주는 상한이다. */
const BULK_PER_PAGE = 1000;

/**
 * 페이지 상한(안전장치). 시군구 하나에 3만 건이 있을 리 없다 — 해운대구가
 * 2,300건(3페이지)이다. 이 상한에 닿았다는 것은 **필터가 의도대로 걸리지
 * 않았다**는 뜻이므로, 반쪽짜리 표를 돌려주는 대신 던진다(아래 참고).
 */
const BULK_MAX_PAGES = 30;

/**
 * 시군구 하나의 세대수를 **한 번에** 긁어 온다(PNU → 세대수).
 *
 * **왜 만들었나.** 단지마다 {@link fetchHouseholdCount}를 부르면 큰 구에서
 * 수백 번의 왕복이 된다 — 부산 해운대구(단지 242개)에서 동시성 16으로
 * 15배치, 약 11초였다. 이 API는 `cond[PNU::LIKE]` 접두어 필터를 받고,
 * PNU의 앞 5자리가 곧 시군구 코드다(`scripts/pipeline/pnu.ts`) — 그래서
 * 구 전체를 3페이지로 받을 수 있다. 실측: 2,300건 3페이지 **1.29초**.
 *
 * ── 단건 조회와 같은 답을 주는지 실측으로 확인했다(해운대구) ──────
 *   · `matchCount` 2,300건을 3페이지에 정확히 다 받았다
 *   · 접두어가 26350이 아닌 항목 0건 — LIKE가 접두어로 걸린다
 *   · 표본 12건을 단건 조회와 대조해 **12/12 값 일치**
 *   · PNU가 겹치는 레코드가 1건 있었다 → 아래 `seen` 참고
 *
 * **PNU가 겹치면 먼저 온 레코드가 이긴다.** {@link fetchHouseholdCount}가
 * `perPage=1`로 `data[0]`만 읽는 것과 같은 규칙이라, 두 경로가 같은 PNU에
 * 대해 다른 답을 내지 않는다. 세대수가 없거나 형식이 어긋난 레코드도
 * "먼저 왔으면 그것이 답"이다 — 그 경우 표에 담기지 않아 호출부가
 * "모른다"로 다룬다(단건 조회가 `null`을 내는 것과 같다).
 *
 * HTTP 실패는 그대로 던진다 — {@link fetchHouseholdCount}와 같은 원칙이고,
 * 호출부(`lookupHouseholdCounts`)가 단건 조회로 되돌아갈 수 있게 한다.
 */
export async function fetchHouseholdCountsByRegion(
  regionCode: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number>> {
  const table = new Map<string, number>();
  /** 이미 답이 정해진 PNU. 값이 없는(형식이 어긋난) 첫 레코드도 여기 남는다. */
  const seen = new Set<string>();
  let collected = 0;

  for (let page = 1; page <= BULK_MAX_PAGES; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", String(BULK_PER_PAGE));
    url.searchParams.set("cond[PNU::LIKE]", regionCode);
    url.searchParams.set("serviceKey", key);

    let res: Response;
    try {
      res = await fetchImpl(url);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(redactKey(message, key));
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        redactKey(`한국부동산원 공동주택 단지 일괄 조회 실패: HTTP ${res.status} ${body}`, key),
      );
    }

    const body = (await res.json()) as AptInfoListResponseBody;
    const rows = body.data ?? [];
    for (const row of rows) {
      const pnu = row.PNU;
      if (typeof pnu !== "string" || pnu.length === 0) continue;
      if (seen.has(pnu)) continue;
      seen.add(pnu);
      const count = row.UNIT_CNT;
      if (typeof count !== "number" || !Number.isFinite(count) || count < 0) continue;
      table.set(pnu, Math.round(count));
    }
    collected += rows.length;

    // 마지막 페이지다 — 받은 것이 한 페이지 정원보다 적다.
    if (rows.length < BULK_PER_PAGE) return table;
    // `matchCount`만큼 다 받았다.
    const matchCount = body.matchCount;
    if (typeof matchCount === "number" && collected >= matchCount) return table;
  }

  /*
   * 상한까지 돌았는데 끝이 안 났다 — 필터가 의도대로 걸리지 않은 것이다.
   * 여기서 지금까지 모은 표를 돌려주면 **호출부는 그것을 완전한 답으로
   * 믿고**, 빠진 단지들을 "세대수 모름"으로 조용히 넘긴다. 그 침묵이
   * 이 저장소가 가장 경계하는 실패라, 던져서 단건 조회로 되돌아가게 한다.
   */
  throw new Error(
    `한국부동산원 공동주택 단지 일괄 조회가 ${BULK_MAX_PAGES}페이지에서 끝나지 않았습니다 (regionCode=${regionCode})`,
  );
}
