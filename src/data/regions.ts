import rawRegionCodes from "../../data/legal-dong-codes.json";

export interface RegionCode {
  regionCode: string;
  sidoName: string;
  sigunguName: string;
}

const REGION_CODES: readonly RegionCode[] = rawRegionCodes;

export const SIDO_NAMES: readonly string[] = [...new Set(REGION_CODES.map((r) => r.sidoName))].sort(
  (a, b) => a.localeCompare(b, "ko"),
);

export function sigunguBySido(
  sidoName: string,
): readonly { regionCode: string; sigunguName: string }[] {
  return REGION_CODES.filter((r) => r.sidoName === sidoName).map((r) => ({
    regionCode: r.regionCode,
    sigunguName: r.sigunguName,
  }));
}

export function regionNameByCode(regionCode: string): string | null {
  const found = REGION_CODES.find((r) => r.regionCode === regionCode);
  return found === undefined ? null : `${found.sidoName} ${found.sigunguName}`;
}

/**
 * 코드 하나로 시도·시군구 이름을 함께 되찾는다.
 *
 * {@link regionNameByCode}는 사람이 읽을 한 줄("서울특별시 강남구")을
 * 돌려주는데, 그 문자열을 다시 쪼개 두 select의 값으로 쓰면 이름에 공백이
 * 든 지역에서 조용히 어긋난다. 지금 고른 지역을 select에 **되비추어야
 * 하는** 자리(`RegionQuickSelect`)는 쪼갠 값이 아니라 이 원본이 필요하다.
 */
export function regionByCode(regionCode: string): RegionCode | null {
  return REGION_CODES.find((r) => r.regionCode === regionCode) ?? null;
}
