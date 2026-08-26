import { describe, expect, it } from "vitest";
import { rules } from "../state/useAffordability";
import {
  AREA_BANDS,
  MEDIUM_UPPER_SQM,
  SMALL_UPPER_SQM,
  areaBandOf,
  areaBandRanges,
  describeAreaBands,
  matchesAreaBands,
  type AreaBand,
} from "./area-band";

const THRESHOLD = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

describe("평형대 구간", () => {
  it("스펙 §4의 네 구간을 좁은 쪽부터 낸다", () => {
    expect(AREA_BANDS).toEqual(["소형", "중소형", "중형", "대형"]);
  });

  it("범위 라벨은 ㎡가 주(主)다", () => {
    expect(areaBandRanges(THRESHOLD).map((r) => r.rangeLabel)).toEqual([
      "~60㎡",
      "60~85㎡",
      "85~102㎡",
      "102㎡~",
    ]);
  });

  /**
   * 이 저장소의 가장 중요한 경계다. 룰셋이 85 → 100으로 바뀌면 구간
   * 이름의 뜻과 취득세 계산이 함께 움직여야 한다 — 숫자를 박아 두면
   * 그날 "중소형"이 농특세가 붙는 면적을 품게 된다.
   */
  it("중소형·중형의 경계는 룰셋의 농특세 임계값에서 온다", () => {
    const ranges = areaBandRanges(100);
    expect(ranges[1]!.upToSqm).toBe(100);
    expect(ranges[2]!.moreThanSqm).toBe(100);
    expect(ranges[1]!.rangeLabel).toBe("60~100㎡");
  });

  it("경계값은 이하 쪽 구간에 들어간다 — 85㎡는 중소형이다", () => {
    expect(areaBandOf(SMALL_UPPER_SQM, THRESHOLD)).toBe("소형");
    expect(areaBandOf(SMALL_UPPER_SQM + 0.1, THRESHOLD)).toBe("중소형");
    expect(areaBandOf(THRESHOLD, THRESHOLD)).toBe("중소형");
    expect(areaBandOf(THRESHOLD + 0.1, THRESHOLD)).toBe("중형");
    expect(areaBandOf(MEDIUM_UPPER_SQM, THRESHOLD)).toBe("중형");
    expect(areaBandOf(MEDIUM_UPPER_SQM + 0.1, THRESHOLD)).toBe("대형");
  });

  /**
   * "중소형 이하를 골랐다"와 "농특세가 붙지 않는 집을 골랐다"가 정확히
   * 같은 말이어야 한다. 어긋나면 그 방향이 하필 낙관 쪽이다.
   */
  it("소형·중소형만 고르면 농특세가 붙는 면적은 하나도 통과하지 못한다", () => {
    const bands: AreaBand[] = ["소형", "중소형"];
    expect(matchesAreaBands(THRESHOLD, bands, THRESHOLD)).toBe(true);
    expect(matchesAreaBands(THRESHOLD + 0.01, bands, THRESHOLD)).toBe(false);
  });

  it("구간이 전 구간을 빠짐없이 덮는다", () => {
    for (const sqm of [0, 1, 59.9, 60, 84.9, 85, 101.9, 102, 200, 1000]) {
      expect(AREA_BANDS).toContain(areaBandOf(sqm, THRESHOLD));
    }
  });

  /**
   * 빈 선택을 "필터 없음"으로 조용히 바꿔 읽으면, 화면이 사용자가 고른
   * 적 없는 조건으로 결과를 그리면서 그 사실을 말하지 않게 된다 — 이
   * 저장소가 여섯 번 반복한 사고의 모양이다.
   */
  it("빈 선택은 전체가 아니다 — 아무것도 맞지 않는다", () => {
    expect(matchesAreaBands(84, [], THRESHOLD)).toBe(false);
  });

  it("전부 고르면 무엇이든 통과한다", () => {
    for (const sqm of [30, 60, 85, 102, 300]) {
      expect(matchesAreaBands(sqm, AREA_BANDS, THRESHOLD)).toBe(true);
    }
  });
});

describe("고른 평형대를 종이에 적기", () => {
  it("전부 고르면 '전체'다 — 네 구간을 나열하지 않는다", () => {
    expect(describeAreaBands(AREA_BANDS, THRESHOLD)).toBe("전체");
  });

  it("일부만 고르면 구간 이름과 범위를 함께 적는다", () => {
    expect(describeAreaBands(["중소형", "소형"], THRESHOLD)).toBe(
      "소형(~60㎡) · 중소형(60~85㎡)",
    );
  });

  it("하나도 고르지 않았으면 값을 지어내지 않는다", () => {
    expect(describeAreaBands([], THRESHOLD)).toBe("고르지 않음");
  });
});
