import { useMemo } from "react";
import rawLocationRules from "../../rules/location-2026-08.json";
import {
  coordinateOf,
  ELEMENTARY_SCHOOLS,
  SUBWAY_STATIONS,
} from "../data/location";
import {
  assessLocation,
  parseLocationRules,
  type LocationAssessment,
  type LocationRules,
} from "../lib/location";

/**
 * 번들에 포함된 입지 룰셋.
 * 빌드 타임에 들어오므로 네트워크 요청도 로딩 상태도 없다.
 */
export const locationRules: LocationRules = parseLocationRules(rawLocationRules);

export interface LocationFactsState {
  rules: LocationRules;
  assessment: LocationAssessment;
}

/**
 * 이 단지 주변에 무엇이 있는지.
 *
 * 입력이 전부 빌드 타임 상수(`src/data/location.ts`)라 사용자가 넣는 값이
 * 없다 — 그래서 저장할 것도, 초기화할 것도 없다. 지금은 좌표가 하나도
 * 없어 어느 단지에서든 "아직 위치를 몰라요"가 나온다.
 *
 * **평형이 아니라 단지로 묻는다.** 같은 단지의 59㎡와 84㎡는 같은 자리에
 * 있으므로, 이 훅이 받는 것은 `complexKey` 하나다.
 */
export function useLocationFacts(complexKey: string): LocationFactsState {
  const assessment = useMemo(
    () =>
      assessLocation(locationRules, {
        coordinate: coordinateOf(complexKey),
        subwayStations: SUBWAY_STATIONS,
        elementarySchools: ELEMENTARY_SCHOOLS,
      }),
    [complexKey],
  );

  return { rules: locationRules, assessment };
}
