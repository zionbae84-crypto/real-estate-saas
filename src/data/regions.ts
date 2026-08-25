import rawRegionCodes from "../../data/legal-dong-codes.json";

export interface RegionCode {
  regionCode: string;
  sidoName: string;
  sigunguName: string;
}

const REGION_CODES: readonly RegionCode[] = rawRegionCodes;

export const SIDO_NAMES: readonly string[] = [...new Set(REGION_CODES.map((r) => r.sidoName))];

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
