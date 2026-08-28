// scripts/pipeline/geocode-addresses.ts
import { buildAddressString } from "./address";
import { buildTargets, defaultWait, fetchAllPages, MONTHS_BACK, type Waiter } from "./fetch";
import { normalizeAll } from "./normalize";

/**
 * 주소 조립은 `./address`로 옮겼다 — 집계(`aggregate.ts`)가 단지 상세
 * 화면에 적을 주소를 만들 때 **같은 함수**를 써야 하는데, 이 파일을
 * 직접 import하면 네트워크 조회 코드(`fetch.ts`)까지 딸려 들어간다.
 * 여기서 다시 내보내는 이유는 이 이름으로 이 모듈을 부르던 자리
 * (`geocode-addresses.test.ts`)를 그대로 두기 위해서다.
 */
export { buildAddressString };

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
