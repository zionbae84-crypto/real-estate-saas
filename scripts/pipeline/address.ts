// scripts/pipeline/address.ts
import { regionNameByCode } from "../../src/data/regions.js";
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
 * 거래 하나의 주소를 문자열 하나로 합친다.
 *
 * "시도 시군구 법정동 지번" 형태다. 지번이 없으면 본번-부번으로 대신
 * 만든다(둘 다 없으면 null — 지어내지 않는다). regionCode를 이름으로
 * 못 바꾸면(모르는 지역코드) 역시 null이다.
 *
 * 도로명주소가 아니라 지번주소를 쓰는 이유: `RawAddress`에 도로명
 * 건물본번이 저장돼 있지 않아(원본이 도로명·도로명코드·지번만 준다)
 * 완전한 도로명주소를 만들 수 없다. 지번은 본번·부번이 항상 함께 온다.
 *
 * ⚠ **쓰는 곳이 둘이라 이 파일에 따로 뒀다.** 지오코딩
 * (`geocode-addresses.ts` — 좌표를 구하려고 네이버에 보내는 문자열)과
 * 집계(`aggregate.ts` — 단지 상세 화면에 그대로 적는 주소)가 **같은
 * 문자열**을 써야 한다. 두 곳이 각자 주소를 조립하면 지도가 찍은 자리와
 * 화면이 적은 주소가 서로 다른 표기가 되는 날이 온다.
 *
 * 이 파일은 네트워크 모듈(`fetch.ts`)을 끌어오지 않는다 — `aggregate.ts`가
 * `geocode-addresses.ts`를 직접 import하면 집계가 조회 코드에 딸려 들어간다.
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
