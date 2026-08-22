import { describe, expect, it } from "vitest";
import type { ComplexUnit } from "./aggregate";
import type { FetchLogEntry } from "./fetch";
import {
  buildReport,
  editDistance,
  findOverMergeSuspects,
  findSplitAreaSuspects,
  findUnderMergeCandidates,
} from "./report";
import type { ReportConfig } from "./types";

const config: ReportConfig = {
  underMergeMaxEditDistance: 2,
  overMergeMinPriceRatio: 2.0,
  overMergeMinTradeCount: 4,
  lowConfidenceMinTrades: 3,
};

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|1979|은마",
    complexName: "은마",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 1979,
    areaBucket: 84,
    medianPrice: 2_000_000_000,
    tradeCount: 5,
    minPrice: 1_900_000_000,
    maxPrice: 2_100_000_000,
    changeRate3m: null,
    changeRate3mRecentCount: 0,
    changeRate3mPriorCount: 0,
    changeRate3mLowConfidence: false,
    changeRate12m: null,
    changeRate12mRecentCount: 0,
    changeRate12mPriorCount: 0,
    changeRate12mLowConfidence: false,
    lowConfidence: false,
    ...overrides,
  };
}

describe("editDistance", () => {
  it("같으면 0이다", () => {
    expect(editDistance("우성", "우성")).toBe(0);
  });

  it("한 글자 다르면 1이다", () => {
    expect(editDistance("우성1차", "우성2차")).toBe(1);
  });

  it("두 글자 추가면 2다", () => {
    expect(editDistance("우성", "우성1차")).toBe(2);
  });
});

describe("findUnderMergeCandidates", () => {
  it("같은 동·같은 건축년도의 비슷한 이름을 짝짓는다", () => {
    const found = findUnderMergeCandidates(
      [
        unit({ complexKey: "11680|대치동|1979|은마" }),
        unit({ complexKey: "11680|대치동|1979|은마아파트" }),
      ],
      config,
    );
    expect(found).toHaveLength(1);
  });

  it("건축년도가 다르면 짝짓지 않는다 — 다른 단지일 가능성이 높다", () => {
    const found = findUnderMergeCandidates(
      [
        unit({ complexKey: "11680|대치동|1979|은마" }),
        unit({ complexKey: "11680|대치동|1985|은마" }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });

  it("법정동이 다르면 짝짓지 않는다", () => {
    const found = findUnderMergeCandidates(
      [
        unit({ complexKey: "11680|대치동|1979|은마" }),
        unit({ complexKey: "11680|역삼동|1979|은마" }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });

  it("임계값을 넘게 다르면 짝짓지 않는다", () => {
    const found = findUnderMergeCandidates(
      [
        unit({ complexKey: "11680|대치동|1979|은마" }),
        unit({ complexKey: "11680|대치동|1979|래미안대치팰리스" }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("findUnderMergeCandidates 경계값 — underMergeMaxEditDistance", () => {
  // 접두어 관계가 아니면서(둘 다 길이가 같고 서로의 prefix가 아님) 딱 두 글자만
  // 다른 이름 쌍. prefix 지름길에 걸리지 않고 순수하게 편집거리만으로 판정되게 한다.
  it("편집거리가 정확히 상한(2)이면 후보로 잡힌다", () => {
    const found = findUnderMergeCandidates(
      [
        unit({ complexKey: "11680|대치동|1979|삼성12차" }),
        unit({ complexKey: "11680|대치동|1979|삼성34차" }),
      ],
      config,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.distance).toBe(config.underMergeMaxEditDistance);
  });

  // 위와 같은 형태에서 다른 글자 하나를 늘려 편집거리를 3으로 만든다 — 상한보다 1 크다.
  it("편집거리가 상한보다 하나 크면(3) 후보로 잡히지 않는다", () => {
    const found = findUnderMergeCandidates(
      [
        unit({ complexKey: "11680|대치동|1979|삼성123차" }),
        unit({ complexKey: "11680|대치동|1979|삼성456차" }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("findOverMergeSuspects", () => {
  it("같은 평형에서 최고가가 최저가의 2배 이상이면 의심한다", () => {
    const found = findOverMergeSuspects(
      [unit({ minPrice: 1_000_000_000, maxPrice: 2_000_000_000, tradeCount: 5 })],
      config,
    );
    expect(found).toHaveLength(1);
  });

  it("거래 건수가 적으면 의심하지 않는다 — 우연히 벌어질 수 있다", () => {
    const found = findOverMergeSuspects(
      [unit({ minPrice: 1_000_000_000, maxPrice: 2_000_000_000, tradeCount: 3 })],
      config,
    );
    expect(found).toHaveLength(0);
  });

  it("가격 차가 작으면 의심하지 않는다", () => {
    const found = findOverMergeSuspects(
      [unit({ minPrice: 1_900_000_000, maxPrice: 2_100_000_000, tradeCount: 10 })],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("findOverMergeSuspects 경계값 — overMergeMinTradeCount", () => {
  // 가격 배율은 넉넉히 2배를 넘겨 고정해 두고, 거래 건수만 하한(4) 근처에서 움직인다.
  it("거래 건수가 정확히 하한(4)이면 신호가 난다", () => {
    const found = findOverMergeSuspects(
      [unit({ minPrice: 1_000_000, maxPrice: 3_000_000, tradeCount: config.overMergeMinTradeCount })],
      config,
    );
    expect(found).toHaveLength(1);
  });

  it("거래 건수가 하한보다 하나 적으면(3) 신호가 나지 않는다", () => {
    const found = findOverMergeSuspects(
      [unit({ minPrice: 1_000_000, maxPrice: 3_000_000, tradeCount: config.overMergeMinTradeCount - 1 })],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("findOverMergeSuspects 경계값 — overMergeMinPriceRatio", () => {
  // 거래 건수는 하한에 정확히 맞춰 고정해 두고, 가격 배율만 2.0 근처에서 움직인다.
  // 부동소수점 오차를 피하려고 최저가·최고가를 원 단위 정수로 골라 배율이
  // 정확히 config.overMergeMinPriceRatio(2.0)가 되게 한다.
  it("최고÷최저가 정확히 하한(2.0)이면 신호가 난다", () => {
    const found = findOverMergeSuspects(
      [
        unit({
          minPrice: 1_000_000,
          maxPrice: 1_000_000 * config.overMergeMinPriceRatio,
          tradeCount: config.overMergeMinTradeCount,
        }),
      ],
      config,
    );
    expect(found).toHaveLength(1);
  });

  it("최고÷최저가 하한 바로 아래(1.99)면 신호가 나지 않는다", () => {
    const found = findOverMergeSuspects(
      [unit({ minPrice: 100_000_000, maxPrice: 199_000_000, tradeCount: config.overMergeMinTradeCount })],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("findSplitAreaSuspects", () => {
  it("인접 버킷이 둘 다 거래가 적으면 의심한다", () => {
    const found = findSplitAreaSuspects(
      [
        unit({ areaBucket: 84, tradeCount: 2 }),
        unit({ areaBucket: 85, tradeCount: 1 }),
      ],
      config,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.buckets).toEqual([84, 85]);
  });

  it("한쪽이라도 거래가 충분하면 의심하지 않는다", () => {
    const found = findSplitAreaSuspects(
      [
        unit({ areaBucket: 84, tradeCount: 2 }),
        unit({ areaBucket: 85, tradeCount: 10 }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });

  it("버킷이 2㎡ 이상 떨어져 있으면 의심하지 않는다", () => {
    const found = findSplitAreaSuspects(
      [
        unit({ areaBucket: 84, tradeCount: 1 }),
        unit({ areaBucket: 101, tradeCount: 1 }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("findSplitAreaSuspects 경계값 — lowConfidenceMinTrades", () => {
  // 판정 조건은 "인접한 두 버킷이 둘 다 하한 미만"이다. 하한 자체는 신호를 내지 않는다.
  it("두 버킷 모두 거래가 정확히 하한(3)이면 신호가 나지 않는다", () => {
    const found = findSplitAreaSuspects(
      [
        unit({ areaBucket: 84, tradeCount: config.lowConfidenceMinTrades }),
        unit({ areaBucket: 85, tradeCount: config.lowConfidenceMinTrades }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });

  it("두 버킷 모두 거래가 하한보다 하나 적으면(2) 신호가 난다", () => {
    const found = findSplitAreaSuspects(
      [
        unit({ areaBucket: 84, tradeCount: config.lowConfidenceMinTrades - 1 }),
        unit({ areaBucket: 85, tradeCount: config.lowConfidenceMinTrades - 1 }),
      ],
      config,
    );
    expect(found).toHaveLength(1);
  });

  it("한쪽만 정확히 하한(3)이어도 신호가 나지 않는다 — 둘 다 미만이어야 한다", () => {
    const found = findSplitAreaSuspects(
      [
        unit({ areaBucket: 84, tradeCount: config.lowConfidenceMinTrades }),
        unit({ areaBucket: 85, tradeCount: config.lowConfidenceMinTrades - 1 }),
      ],
      config,
    );
    expect(found).toHaveLength(0);
  });
});

describe("buildReport", () => {
  const log: FetchLogEntry[] = [
    { regionCode: "11680", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0 },
    { regionCode: "11650", yearMonth: "202608", status: "failed", tradeCount: 0, failures: 0, error: "HTTP 500" },
  ];

  it("수집 실패를 담는다 — normalized.json만으로는 알 수 없는 정보다", () => {
    const md = buildReport([unit()], log, config);
    expect(md).toContain("11650");
    expect(md).toContain("HTTP 500");
  });

  it("저신뢰 비율을 담는다", () => {
    const md = buildReport(
      [unit({ lowConfidence: true }), unit({ lowConfidence: false, complexKey: "x" })],
      log,
      config,
    );
    expect(md).toMatch(/50(\.0)?%/);
  });

  it("자동 병합하지 않는다는 것을 명시한다", () => {
    const md = buildReport([unit()], log, config);
    expect(md).toContain("확인");
  });

  it("잘림(truncated)을 실패와 구분해 담는다 — 정상 fetched라도 데이터가 빠졌을 수 있다", () => {
    const truncatedLog: FetchLogEntry[] = [
      {
        regionCode: "11710",
        yearMonth: "202608",
        status: "fetched",
        tradeCount: 20000,
        failures: 0,
        truncated: true,
      },
    ];
    const md = buildReport([unit()], truncatedLog, config);
    expect(md).toContain("11710");
    expect(md).toMatch(/잘림/);
  });

  it("캐시 손상(cacheCorrupted)을 담는다 — 재수집이 성공해도 디스크 문제는 알려야 한다", () => {
    const corruptedLog: FetchLogEntry[] = [
      {
        regionCode: "11740",
        yearMonth: "202607",
        status: "fetched",
        tradeCount: 5,
        failures: 0,
        cacheCorrupted: true,
      },
    ];
    const md = buildReport([unit()], corruptedLog, config);
    expect(md).toContain("11740");
    expect(md).toMatch(/캐시 손상/);
  });

  it("실패·잘림·캐시손상이 없으면 각 절에 '없음'을 명시한다", () => {
    const cleanLog: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0 },
    ];
    const md = buildReport([unit()], cleanLog, config);
    const sections = md.split(/^## /m);
    const failedSection = sections.find((s) => s.startsWith("수집 실패"));
    const truncatedSection = sections.find((s) => s.startsWith("데이터 잘림"));
    const corruptedSection = sections.find((s) => s.startsWith("캐시 손상"));
    expect(failedSection).toContain("없음");
    expect(truncatedSection).toContain("없음");
    expect(corruptedSection).toContain("없음");
  });
});
