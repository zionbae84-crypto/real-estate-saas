// scripts/pipeline/geocode-addresses.ts
import { buildTargets, defaultWait, fetchAllPages, MONTHS_BACK, type Waiter } from "./fetch";
import { normalizeAll } from "./normalize";
import { regionNameByCode } from "../../src/data/regions";
import type { RawTrade } from "./types";

/**
 * "0"·"00"·"0000" 등 0 패딩 형태와 무관하게 부번이 실제로 없는지(=0인지)
 * 판단한다. 부번을 숫자로 바꾸지 않는다 — bonbun/bubun은 이 코드베이스에서
 * 정보 손실을 피하려고 의도적으로 불투명한 문자열로 다룬다
 * (scripts/pipeline/parse-response.ts 247줄 근처 주석 참고).
 */
function normalizedBubun(bubun: string | null): string | null {
  if (bubun === null) return null;
  const stripped = bubun.replace(/^0+/, "");
  return stripped === "" ? null : stripped;
}

/**
 * 거래 하나의 주소를 지오코딩 가능한 문자열 하나로 합친다.
 *
 * "시도 시군구 법정동 지번" 형태다. 지번이 없으면 본번-부번으로 대신
 * 만든다(둘 다 없으면 null — 지어내지 않는다). regionCode를 이름으로
 * 못 바꾸면(모르는 지역코드) 역시 null이다.
 *
 * 도로명주소가 아니라 지번주소를 쓰는 이유: `RawAddress`에 도로명
 * 건물본번이 저장돼 있지 않아(원본이 도로명·도로명코드·지번만 준다)
 * 완전한 도로명주소를 만들 수 없다. 지번은 본번·부번이 항상 함께 온다.
 */
export function buildAddressString(trade: RawTrade): string | null {
  const regionName = regionNameByCode(trade.regionCode);
  if (regionName === null) return null;

  const { jibun, bonbun, bubun } = trade.address;
  const bubunSuffix = normalizedBubun(bubun);
  const lot = jibun ?? (bonbun !== null ? `${bonbun}${bubunSuffix !== null ? `-${bubunSuffix}` : ""}` : null);
  if (lot === null) return null;

  return `${regionName} ${trade.legalDongName} ${lot}`;
}

/**
 * 지역(그리고 선택적으로 법정동)의 단지별 대표 주소를 라이브로 구한다.
 *
 * 조회 창은 `fetchLiveComplexes`(scripts/pipeline/live.ts)와 **똑같이**
 * `MONTHS_BACK`(12개월)이다. 반드시 같아야 한다 — 목록에 뜨는 단지는
 * 12개월 창에서 나오는데 주소를 1개월 창에서만 찾으면, 이번 달에 거래가
 * 없었던 단지는 주소를 얻을 방법이 아예 없어 지도에서 조용히 사라진다.
 * "건물 주소는 어느 달 거래든 같다"는 말은 **한 건물 안에서만** 참이고,
 * 어느 단지가 창 안에 들어오는가(=커버리지)는 창 길이가 정한다. 특히
 * 매달 첫 주에는 국토부 신고 지연 때문에 이번 달 거래가 거의 없어,
 * 1개월 창이면 대부분의 지역에서 마커가 하나도 안 뜬다.
 *
 * 같은 단지의 여러 거래 중 첫 번째 것의 주소만 남긴다(건물 하나의 주소는
 * 어느 거래를 봐도 같다 — 이 말이 참인 자리는 여기다).
 */
export async function fetchComplexAddresses(
  regionCode: string,
  dong: string | null,
  now: Date,
  key: string,
  wait: Waiter = defaultWait,
): Promise<Map<string, string>> {
  const targets = buildTargets(now, MONTHS_BACK, [regionCode]);
  const pages = await Promise.all(
    targets.map((t) => fetchAllPages(t.regionCode, t.yearMonth, key, wait)),
  );
  const trades = pages.flatMap((p) => p.trades);
  const scoped = dong === null ? trades : trades.filter((t) => t.legalDongName === dong);
  const normalized = normalizeAll(scoped);

  const result = new Map<string, string>();
  for (const trade of normalized) {
    if (result.has(trade.complexKey)) continue;
    const address = buildAddressString(trade);
    if (address !== null) result.set(trade.complexKey, address);
  }
  return result;
}
