import { describe, expect, it } from "vitest";
import { rules } from "../state/useAffordability";
import {
  AREA_BANDS,
  SMALL_UPPER_SQM,
  areaBandOf,
  areaBandRanges,
  describeAreaBands,
  includesAreaAboveThreshold,
  matchesAreaBands,
  type AreaBand,
} from "./area-band";

const THRESHOLD = rules.acquisitionTax.ruralTaxAreaThresholdSqm;

describe("평형대 구간", () => {
  it("세 구간을 좁은 쪽부터 낸다", () => {
    expect(AREA_BANDS).toEqual(["소형", "중소형", "중대형"]);
  });

  it("범위 라벨은 ㎡가 주(主)다", () => {
    expect(areaBandRanges(THRESHOLD).map((r) => r.rangeLabel)).toEqual([
      "60㎡ 이하",
      "60~85㎡",
      "85㎡ 초과",
    ]);
  });

  /**
   * 이 저장소의 가장 중요한 경계다. 룰셋이 85 → 100으로 바뀌면 구간
   * 이름의 뜻과 취득세 계산이 함께 움직여야 한다 — 숫자를 박아 두면
   * 그날 "중소형"이 농특세가 붙는 면적을 품게 된다.
   */
  it("중소형·중대형의 경계는 룰셋의 농특세 임계값에서 온다", () => {
    const ranges = areaBandRanges(100);
    expect(ranges[1]!.to).toEqual({ sqm: 100, inclusive: true });
    expect(ranges[2]!.from).toEqual({ sqm: 100, inclusive: false });
    expect(ranges[1]!.rangeLabel).toBe("60~100㎡");
    expect(ranges[2]!.rangeLabel).toBe("100㎡ 초과");
  });

  /**
   * 라벨과 경계가 같은 것을 말한다 — 첫 칩이 "60㎡ 이하"이고 경계도
   * 60 **이하**다. 한국 아파트 "59타입"(실제 전용 59.00~59.99㎡)도
   * 60.00㎡짜리 평형도 모두 첫 구간에 든다.
   */
  it("첫 구간은 60㎡ 이하다 — 라벨과 경계가 같은 것을 말한다", () => {
    const first = areaBandRanges(THRESHOLD)[0]!;
    expect(first.rangeLabel).toBe("60㎡ 이하");
    expect(first.to).toEqual({ sqm: SMALL_UPPER_SQM, inclusive: true });
    expect(areaBandOf(59.94, THRESHOLD)).toBe("소형");
    expect(areaBandOf(60, THRESHOLD)).toBe("소형");
  });

  it("경계값이 어느 구간에 드는지 못박는다 — 60은 소형, 85는 중소형이다", () => {
    expect(areaBandOf(60, THRESHOLD)).toBe("소형");
    expect(areaBandOf(60.01, THRESHOLD)).toBe("중소형");
    expect(areaBandOf(THRESHOLD, THRESHOLD)).toBe("중소형");
    expect(areaBandOf(THRESHOLD + 0.01, THRESHOLD)).toBe("중대형");
  });

  /**
   * 빈틈이 하나라도 있으면 그 면적의 집은 **어느 구간을 골라도** 목록에
   * 나오지 않고, 겹치면 한 집이 두 구간에 동시에 잡힌다. 구조로도
   * 막았지만(경계를 컷 하나에서 양쪽 구간이 나눠 갖는다) 값으로도
   * 못박는다.
   */
  it("모든 면적이 정확히 한 구간에 든다 — 빈틈도 겹침도 없다", () => {
    const areas = [
      0, 0.01, 12, 39.72, 59.94, 60, 60.01, 74.98, 84.99, 85, 85.01, 102, 134.5,
      1000,
    ];
    for (const sqm of areas) {
      const hit = AREA_BANDS.filter((band) =>
        matchesAreaBands(sqm, [band], THRESHOLD),
      );
      expect(hit, `${sqm}㎡`).toHaveLength(1);
      expect(hit[0]).toBe(areaBandOf(sqm, THRESHOLD));
    }
  });

  /**
   * 위 테스트는 값 몇 개를 찍어 본 것이고, 이건 **구조**를 본다. 이웃한
   * 두 구간이 같은 경계값을 나눠 갖되 한쪽만 그 값을 포함해야 한다 —
   * 그래야 빈틈도 겹침도 생길 수 없다.
   */
  it("이웃한 구간은 같은 경계를 정확히 한 번씩 나눠 갖는다", () => {
    const ranges = areaBandRanges(THRESHOLD);
    expect(ranges[0]!.from).toBeNull();
    expect(ranges[ranges.length - 1]!.to).toBeNull();
    for (let i = 0; i + 1 < ranges.length; i += 1) {
      const upper = ranges[i]!.to;
      const lower = ranges[i + 1]!.from;
      expect(upper).not.toBeNull();
      expect(lower).not.toBeNull();
      expect(upper!.sqm).toBe(lower!.sqm);
      expect(upper!.inclusive).toBe(!lower!.inclusive);
    }
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

  /**
   * 빈 선택을 "필터 없음"으로 조용히 바꿔 읽으면, 화면이 사용자가 고른
   * 적 없는 조건으로 결과를 그리면서 그 사실을 말하지 않게 된다 — 이
   * 저장소가 여섯 번 반복한 사고의 모양이다.
   */
  it("빈 선택은 전체가 아니다 — 아무것도 맞지 않는다", () => {
    expect(matchesAreaBands(84, [], THRESHOLD)).toBe(false);
  });

  it("전부 고르면 무엇이든 통과한다", () => {
    for (const sqm of [30, 60, 60.01, 85, 85.01, 300]) {
      expect(matchesAreaBands(sqm, AREA_BANDS, THRESHOLD)).toBe(true);
    }
  });
});

/**
 * 헤드라인(실구매 가능 가격)이 평형대 선택에서 가져가는 **유일한**
 * 정보다. 면적 값을 흘려보내지 않고 참/거짓 하나만 흘려보낸다.
 */
describe("고른 평형대에 임계값 초과가 섞였는가", () => {
  it("중대형을 고르면 참이다", () => {
    expect(includesAreaAboveThreshold(["중대형"], THRESHOLD)).toBe(true);
    expect(includesAreaAboveThreshold([...AREA_BANDS], THRESHOLD)).toBe(true);
  });

  it("임계값 이하 구간만 고르면 거짓이다 — 이건 가정이 아니라 사실이다", () => {
    expect(includesAreaAboveThreshold(["소형"], THRESHOLD)).toBe(false);
    expect(includesAreaAboveThreshold(["소형", "중소형"], THRESHOLD)).toBe(false);
  });

  /**
   * 빈 선택에서는 "초과가 섞였다"고 말할 근거가 없다. 이 상태는 결과
   * 화면에 이르지 못하고(화면 1이 "하나 이상 골라 주세요"라고 말한다),
   * 화면이 내는 문장도 "고른 평형대에 …가 있어서"라 없는 선택을 있다고
   * 말하면 그게 거짓말이 된다.
   */
  it("빈 선택은 거짓이다 — 없는 선택을 있다고 말하지 않는다", () => {
    expect(includesAreaAboveThreshold([], THRESHOLD)).toBe(false);
  });

  /**
   * 판정이 룰셋을 따라 움직인다. 임계값이 100이 되면 "중소형"(60~100)은
   * 더 이상 초과를 품지 않는다.
   */
  it("임계값이 바뀌면 판정도 함께 움직인다", () => {
    expect(includesAreaAboveThreshold(["중소형"], 100)).toBe(false);
    expect(includesAreaAboveThreshold(["중대형"], 100)).toBe(true);
  });
});

describe("고른 평형대를 종이에 적기", () => {
  it("전부 고르면 '전체'다 — 세 구간을 나열하지 않는다", () => {
    expect(describeAreaBands(AREA_BANDS, THRESHOLD)).toBe("전체");
  });

  it("일부만 고르면 구간 이름과 범위를 함께 적는다", () => {
    expect(describeAreaBands(["중소형", "소형"], THRESHOLD)).toBe(
      "소형(60㎡ 이하) · 중소형(60~85㎡)",
    );
  });

  it("하나도 고르지 않았으면 값을 지어내지 않는다", () => {
    expect(describeAreaBands([], THRESHOLD)).toBe("고르지 않음");
  });
});
