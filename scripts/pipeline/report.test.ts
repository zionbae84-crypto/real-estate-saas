import { describe, expect, it } from "vitest";
import type { ComplexUnit } from "./aggregate";
import type { FetchLogEntry } from "./fetch";
import {
  buildReport,
  findAmbiguousDisplayNames,
  findNameConflicts,
  findSplitAreaSuspects,
  findWidePriceRangeUnits,
} from "./report";
import type { ReportConfig } from "./types";

const config: ReportConfig = {
  widePriceRangeMinRatio: 2.0,
  widePriceRangeMinTradeCount: 4,
  lowConfidenceMinTrades: 3,
  emptyRatioWarnThreshold: 0.2,
};

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|1979|은마",
    complexName: "은마",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 1979,
    areaBucket: 84,
    maxExclusiveAreaSqm: 84.3,
    landLeasehold: "N",
    medianPrice: 2_000_000_000,
    tradeCount: 5,
    minPrice: 1_900_000_000,
    maxPrice: 2_100_000_000,
    minFloor: 3,
    maxFloor: 18,
    unknownFloorCount: 0,
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

/** 새 describe 블록들이 공용으로 쓰는 최소한의 fetch 로그 픽스처. */
const baseLog: FetchLogEntry[] = [
  { regionCode: "11680", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
];

describe("findNameConflicts — 한 단지 ID에 이름 여러 개", () => {
  it("같은 aptSeq에 정말 다른 이름이 붙으면 잡는다", () => {
    const found = findNameConflicts([
      { complexKey: "11680-314", complexName: "까치마을" },
      { complexKey: "11680-314", complexName: "수서까치마을" },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.names).toEqual(["까치마을", "수서까치마을"]);
  });

  it("표기 흔들림(공백·괄호)은 잡지 않는다 — 사용자가 같은 단지로 알아본다", () => {
    const found = findNameConflicts([
      { complexKey: "11680-349", complexName: "한신(개포)" },
      { complexKey: "11680-349", complexName: "한신 개포" },
    ]);
    expect(found).toHaveLength(0);
  });

  it("서로 다른 aptSeq에 같은 이름이 있어도 이름 충돌이 아니다", () => {
    const found = findNameConflicts([
      { complexKey: "11680-1", complexName: "우성" },
      { complexKey: "11680-2", complexName: "우성" },
    ]);
    expect(found).toHaveLength(0);
  });

  it("이름이 하나뿐이면 잡지 않는다", () => {
    const found = findNameConflicts([
      { complexKey: "11680-314", complexName: "까치마을" },
      { complexKey: "11680-314", complexName: "까치마을" },
    ]);
    expect(found).toHaveLength(0);
  });
});

describe("findAmbiguousDisplayNames — 화면에서 구분 안 되는 동명 단지", () => {
  it("같은 법정동·같은 이름의 다른 단지를 잡는다", () => {
    const found = findAmbiguousDisplayNames([
      unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동", builtYear: 1983 }),
      unit({ complexKey: "11680-2", complexName: "우성", legalDongName: "대치동", builtYear: 1999 }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.keys).toEqual(["11680-1", "11680-2"]);
  });

  it("준공년도가 다르면 화면에 대책이 있다고 표시한다", () => {
    const found = findAmbiguousDisplayNames([
      unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동", builtYear: 1983 }),
      unit({ complexKey: "11680-2", complexName: "우성", legalDongName: "대치동", builtYear: 1999 }),
    ]);
    expect(found[0]?.sameBuiltYear).toBe(false);
  });

  it("준공년도까지 같으면 대책 없음으로 표시한다 — 화면이 가를 방법이 없다", () => {
    const found = findAmbiguousDisplayNames([
      unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동", builtYear: 1983 }),
      unit({ complexKey: "11680-2", complexName: "우성", legalDongName: "대치동", builtYear: 1983 }),
    ]);
    expect(found[0]?.sameBuiltYear).toBe(true);
  });

  it("법정동이 다르면 잡지 않는다 — 화면이 이미 갈라 보여 준다", () => {
    const found = findAmbiguousDisplayNames([
      unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동" }),
      unit({ complexKey: "11680-2", complexName: "우성", legalDongName: "역삼동" }),
    ]);
    expect(found).toHaveLength(0);
  });

  it("같은 단지의 평형이 여러 개인 것은 잡지 않는다 — 키가 같으면 한 단지다", () => {
    const found = findAmbiguousDisplayNames([
      unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동", areaBucket: 84 }),
      unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동", areaBucket: 101 }),
    ]);
    expect(found).toHaveLength(0);
  });

  it("대책 없는 것을 목록 위로 올린다", () => {
    const found = findAmbiguousDisplayNames([
      unit({ complexKey: "11680-1", complexName: "가", legalDongName: "대치동", builtYear: 1983 }),
      unit({ complexKey: "11680-2", complexName: "가", legalDongName: "대치동", builtYear: 1999 }),
      unit({ complexKey: "11680-3", complexName: "나", legalDongName: "대치동", builtYear: 1983 }),
      unit({ complexKey: "11680-4", complexName: "나", legalDongName: "대치동", builtYear: 1983 }),
    ]);
    expect(found[0]?.sameBuiltYear).toBe(true);
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
    { regionCode: "11680", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
    {
      regionCode: "11650",
      yearMonth: "202608",
      status: "failed",
      tradeCount: 0,
      failures: 0,
      cancelled: 0,
      error: "HTTP 500",
    },
  ];

  it("수집 실패를 담는다 — complexes.json만으로는 알 수 없는 정보다", () => {
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
        cancelled: 0,
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
        cancelled: 0,
        cacheCorrupted: true,
      },
    ];
    const md = buildReport([unit()], corruptedLog, config);
    expect(md).toContain("11740");
    expect(md).toMatch(/캐시 손상/);
  });

  it("해제(취소)된 거래 총계를 요약에 담는다 — I5", () => {
    // I5: cancelled는 세어지고 문서화까지 됐지만 리포트에는 전혀 드러나지
    // 않았다. fetch 로그의 cancelled를 합산해 요약에 노출해야 한다.
    const logWithCancelled: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 4 },
      { regionCode: "11650", yearMonth: "202607", status: "cached", tradeCount: 5, failures: 0, cancelled: 2 },
    ];
    const md = buildReport([unit()], logWithCancelled, config);
    expect(md).toMatch(/해제.*6건/);
  });

  it("해제 건수가 0이어도 요약에 0건으로 명시한다", () => {
    const md = buildReport([unit()], log, config);
    expect(md).toMatch(/해제.*0건/);
  });

  it("cancelled 필드가 없는 옛 fetch-log 항목이 섞여 있어도 합계가 깨지지 않는다", () => {
    // I5 이전에 쓰인 실제 data/fetch-log.json에는 cancelled 필드가 없다.
    // loadFetchLog는 디스크에서 읽은 값을 검증 없이 FetchLogEntry[]로 캐스트할
    // 뿐이므로, 타입이 number를 약속해도 런타임에는 undefined일 수 있다 —
    // 합계 계산이 NaN으로 새지 않아야 한다.
    const legacyEntry = {
      regionCode: "11680",
      yearMonth: "202608",
      status: "fetched",
      tradeCount: 26,
      failures: 0,
    } as unknown as FetchLogEntry;
    const md = buildReport([unit()], [legacyEntry], config);
    expect(md).toMatch(/해제.*0건/);
    expect(md).not.toContain("NaN");
  });

  it("실패·잘림·캐시손상이 없으면 각 절에 '없음'을 명시한다", () => {
    const cleanLog: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
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

  it("normalized.json을 언급하지 않는다 — 실제로 만들어지지 않는 파일이다", () => {
    const md = buildReport([unit()], log, config);
    expect(md).not.toContain("normalized.json");
  });
});

describe("buildReport — 파싱 실패 건수 노출 (I1)", () => {
  const logWithFailures: FetchLogEntry[] = [
    {
      regionCode: "11680",
      yearMonth: "202608",
      status: "fetched",
      tradeCount: 600,
      failures: 400,
      cancelled: 0,
    },
    { regionCode: "11650", yearMonth: "202607", status: "cached", tradeCount: 20, failures: 0, cancelled: 0 },
  ];

  it("파싱 실패 총계를 요약에 담는다", () => {
    const md = buildReport([unit()], logWithFailures, config);
    expect(md).toMatch(/파싱 실패.*400건/);
  });

  it("failures > 0인 엔트리를 시군구·년월·건수로 목록 절에 나열한다", () => {
    const md = buildReport([unit()], logWithFailures, config);
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("파싱 실패"));
    expect(section).toBeDefined();
    expect(section).toContain("11680");
    expect(section).toContain("202608");
    expect(section).toContain("400");
    // failures가 0인 엔트리는 목록에 안 나온다
    expect(section).not.toContain("11650");
  });

  it("파싱 실패가 없으면 절에 '없음'을 명시한다", () => {
    const md = buildReport([unit()], baseLog, config);
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("파싱 실패"));
    expect(section).toBeDefined();
    expect(section).toContain("없음");
  });
});

describe("buildReport — 거래 0건(status: empty) 노출 (I2)", () => {
  it("거래 0건 시군구·월 개수와 전체 대상 수를 요약에 담는다", () => {
    const logs: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "empty", tradeCount: 0, failures: 0, cancelled: 0 },
      { regionCode: "11650", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
    ];
    const md = buildReport([unit()], logs, config);
    expect(md).toMatch(/거래 0건 시군구·월: 1 ?\/ ?전체 2/);
  });

  it("빈 비율이 설정된 임계값을 넘으면 시군구·월 목록을 나열한다", () => {
    const highThreshold: ReportConfig = { ...config, emptyRatioWarnThreshold: 0.3 };
    const logs: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "empty", tradeCount: 0, failures: 0, cancelled: 0 },
      { regionCode: "11650", yearMonth: "202608", status: "empty", tradeCount: 0, failures: 0, cancelled: 0 },
      { regionCode: "11710", yearMonth: "202608", status: "fetched", tradeCount: 5, failures: 0, cancelled: 0 },
    ];
    const md = buildReport([unit()], logs, highThreshold);
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("거래 0건 시군구·월"));
    expect(section).toBeDefined();
    expect(section).toContain("11680");
    expect(section).toContain("11650");
  });

  it("빈 비율이 설정된 임계값 이하면 목록 절을 만들지 않는다", () => {
    const lowThreshold: ReportConfig = { ...config, emptyRatioWarnThreshold: 0.9 };
    const logs: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "empty", tradeCount: 0, failures: 0, cancelled: 0 },
      { regionCode: "11650", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
    ];
    const md = buildReport([unit()], logs, lowThreshold);
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("거래 0건 시군구·월"));
    expect(section).toBeUndefined();
  });

  it("거래 0건인 달이 캐시 적중(status: cached)으로 들어와도 요약 수치와 목록에 잡힌다 (재발 방지)", () => {
    // status는 수집 시점에만 정해진다. 거래 0건으로 마감된 달이 캐시되면
    // 다음 실행의 캐시 적중 경로는 tradeCount: 0이어도 status: "cached"를
    // 낸다 — status만 보면 이 신호는 '지금 열려 있는 달'만 설명하게 된다.
    // tradeCount로 판정해야 캐시를 거쳐도 신호가 살아남는다.
    const zeroThreshold: ReportConfig = { ...config, emptyRatioWarnThreshold: 0 };
    const logs: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202603", status: "cached", tradeCount: 0, failures: 0, cancelled: 0 },
      { regionCode: "11650", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
    ];
    const md = buildReport([unit()], logs, zeroThreshold);
    expect(md).toMatch(/거래 0건 시군구·월: 1 ?\/ ?전체 2/);
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("거래 0건 시군구·월"));
    expect(section).toBeDefined();
    expect(section).toContain("11680");
    expect(section).toContain("202603");
  });

  it("status: failed인 엔트리는 거래 0건 집계에 중복으로 세어지지 않는다 — 수집 실패 절에서 이미 센다", () => {
    const logs: FetchLogEntry[] = [
      {
        regionCode: "11680",
        yearMonth: "202608",
        status: "failed",
        tradeCount: 0,
        failures: 0,
        cancelled: 0,
        error: "HTTP 500",
      },
      { regionCode: "11650", yearMonth: "202608", status: "fetched", tradeCount: 10, failures: 0, cancelled: 0 },
    ];
    const md = buildReport([unit()], logs, config);
    expect(md).toMatch(/거래 0건 시군구·월: 0 ?\/ ?전체 2/);
  });

  it("거래가 있는 캐시 적중 달은 0건으로 세어지지 않는다", () => {
    const logs: FetchLogEntry[] = [
      { regionCode: "11680", yearMonth: "202608", status: "cached", tradeCount: 5, failures: 0, cancelled: 0 },
    ];
    const md = buildReport([unit()], logs, config);
    expect(md).toMatch(/거래 0건 시군구·월: 0 ?\/ ?전체 1/);
  });
});

describe("buildReport — 마크다운 표 렌더링 (I3)", () => {
  /** 백슬래시로 이스케이프된 `|`는 실제 마크다운 파서가 열 구분자로 보지 않는다. */
  function splitMarkdownRow(row: string): string[] {
    return row.split(/(?<!\\)\|/);
  }

  it("이름 충돌 표의 각 데이터 행이 헤더와 같은 열 수를 가진다", () => {
    const md = buildReport([unit()], baseLog, config, [
      // 이름에 파이프가 들어 있어도 표가 깨지면 안 된다.
      { complexKey: "11650-1", complexName: "반포훼미리|102동" },
      { complexKey: "11650-1", complexName: "반포훼미리103동" },
    ]);
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("한 단지 ID에 이름 여러 개"));
    expect(section).toBeDefined();
    const lines = (section ?? "").split("\n");
    const headerLine = lines.find((l) => l.startsWith("| 단지 ID"));
    const dataLine = lines.find((l) => l.includes("반포훼미리"));
    expect(headerLine).toBeDefined();
    expect(dataLine).toBeDefined();
    expect(splitMarkdownRow(dataLine ?? "").length).toBe(splitMarkdownRow(headerLine ?? "").length);
  });

  it("평형 분할 의심 표에서 complexKey의 pipe가 이스케이프되어 열이 깨지지 않는다", () => {
    const md = buildReport(
      [
        unit({ complexKey: "11650|내곡동|2014|서초더샵포레", areaBucket: 101, tradeCount: 1 }),
        unit({ complexKey: "11650|내곡동|2014|서초더샵포레", areaBucket: 102, tradeCount: 1 }),
      ],
      baseLog,
      config,
    );
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("평형 분할 의심"));
    const lines = (section ?? "").split("\n");
    const headerLine = lines.find((l) => l.startsWith("| 단지 키"));
    const dataLine = lines.find((l) => l.includes("101㎡"));
    expect(headerLine).toBeDefined();
    expect(dataLine).toBeDefined();
    expect(splitMarkdownRow(dataLine ?? "").length).toBe(splitMarkdownRow(headerLine ?? "").length);
  });

  it("가격 범위 표에 건축년도를 담아 이름+법정동만 같은 두 단지를 구분할 수 있게 한다", () => {
    const md = buildReport(
      [unit({ minPrice: 1_000_000_000, maxPrice: 2_000_000_000, tradeCount: 5, builtYear: 1979 })],
      baseLog,
      config,
    );
    const sections = md.split(/^## /m);
    const section = sections.find((s) => s.startsWith("가격 범위가 지나치게 넓은 평형"));
    expect(section).toContain("1979");
  });
});

describe("리포트가 여전히 의미 있는 것을 보고 있다", () => {
  /**
   * 아무것도 못 잡는 절이 리포트에 남아 있으면 그 자체가 거짓 안심이다 —
   * 사람은 "(없음)"을 보고 문제가 없다고 읽는다. 여기서는 남은 신호 하나하나가
   * **실제로 켜질 수 있다**는 것을 확인한다.
   */
  it("한 단지 ID에 이름 여러 개 — 켜질 수 있다", () => {
    const md = buildReport([unit()], baseLog, config, [
      { complexKey: "11680-1", complexName: "옛이름" },
      { complexKey: "11680-1", complexName: "새이름" },
    ]);
    expect(section(md, "한 단지 ID에 이름 여러 개")).not.toContain("(없음)");
  });

  it("화면에서 구분 안 되는 동명 단지 — 켜질 수 있다", () => {
    const md = buildReport(
      [
        unit({ complexKey: "11680-1", complexName: "우성", legalDongName: "대치동" }),
        unit({ complexKey: "11680-2", complexName: "우성", legalDongName: "대치동" }),
      ],
      baseLog,
      config,
    );
    expect(section(md, "화면에서 구분 안 되는 동명 단지")).not.toContain("(없음)");
  });

  it("가격 범위가 지나치게 넓은 평형 — 켜질 수 있다", () => {
    const md = buildReport(
      [unit({ minPrice: 1_000_000_000, maxPrice: 3_000_000_000, tradeCount: 9 })],
      baseLog,
      config,
    );
    expect(section(md, "가격 범위가 지나치게 넓은 평형")).not.toContain("(없음)");
  });

  it("평형 분할 의심 — 켜질 수 있다", () => {
    const md = buildReport(
      [
        unit({ complexKey: "11680-1", areaBucket: 84, tradeCount: 1 }),
        unit({ complexKey: "11680-1", areaBucket: 85, tradeCount: 1 }),
      ],
      baseLog,
      config,
    );
    expect(section(md, "평형 분할 의심")).not.toContain("(없음)");
  });

  it("캐시 형식 불일치 — 켜질 수 있다", () => {
    const md = buildReport([unit()], [{ ...baseLog[0]!, cacheSchemaMismatch: true }], config);
    expect(section(md, "캐시 형식 불일치(재수집됨)")).not.toContain("(없음)");
  });

  /**
   * 키가 aptSeq가 되면서 "이름이 비슷하니 같은 단지일지 모른다"는 신호는
   * 뜻을 잃었다. 실제 데이터에서 그 절은 67쌍을 내놨는데 67쌍 전부가 국토부
   * 기준으로 다른 단지였다 — 100% 거짓 양성만 내는 목록은 사람 눈을 마비시켜
   * 진짜 신호까지 못 보게 만든다. 되살아나지 않도록 못박는다.
   */
  it("뜻을 잃은 과소·과대병합 절이 되살아나지 않는다", () => {
    const md = buildReport([unit()], baseLog, config, []);
    expect(md).not.toContain("## 과소병합 후보");
    expect(md).not.toContain("## 과대병합 의심");
  });

  it("가격 범위 절이 '다른 단지가 섞였다'고 말하지 않는다 — aptSeq 키에서는 그럴 수 없다", () => {
    const md = buildReport(
      [unit({ minPrice: 1_000_000_000, maxPrice: 3_000_000_000, tradeCount: 9 })],
      baseLog,
      config,
    );
    expect(section(md, "가격 범위가 지나치게 넓은 평형")).not.toContain("다른 단지가 섞였을 수 있다");
  });
});

/** 리포트에서 `## 제목` 절 하나를 떼어낸다. */
function section(md: string, title: string): string {
  return md.split(/^## /m).find((s) => s.startsWith(title)) ?? "";
}

