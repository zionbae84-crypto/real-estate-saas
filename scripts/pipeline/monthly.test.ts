import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMonthlySeries, emitMonthly, type MonthlySeries } from "./monthly";
import { normalizeAll } from "./normalize";
import type { RawTrade } from "./types";

const AS_OF = new Date("2026-08-22T00:00:00Z");

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    aptSeq: "11680-100",
    complexName: "은마",
    builtYear: 1979,
    exclusiveAreaSqm: 84.4,
    floor: 5,
    price: 2_000_000_000,
    contractDate: "2026-07-10",
    landLeasehold: "N",
    address: {
      roadNm: "삼성로", roadNmCd: "3122005", bonbun: "0316",
      bubun: "0000", jibun: "316", umdCd: "10600",
    },
    ...overrides,
  };
}

describe("buildMonthlySeries", () => {
  it("단지×평형×월별로 최저·최고가·건수를 낸다", () => {
    const series = buildMonthlySeries(
      normalizeAll([
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-07-20" }),
        trade({ price: 5_000_000_000, contractDate: "2026-08-01" }),
      ]),
      AS_OF,
    );
    const keys = Object.keys(series);
    expect(keys).toHaveLength(1);
    const points = series[keys[0] as string] ?? [];
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      month: "2026-07",
      minPrice: 1_000_000_000,
      maxPrice: 3_000_000_000,
      tradeCount: 2,
    });
    expect(points[1]).toEqual({
      month: "2026-08",
      minPrice: 5_000_000_000,
      maxPrice: 5_000_000_000,
      tradeCount: 1,
    });
  });

  it("키 형식은 complexKey|areaBucket이다 — aggregate와 같은 조인 키", () => {
    const series = buildMonthlySeries(normalizeAll([trade({ exclusiveAreaSqm: 84.4 })]), AS_OF);
    expect(Object.keys(series)[0]).toBe("11680-100|84");
  });

  it("각 키 안에서 월이 오름차순으로 정렬된다", () => {
    const series = buildMonthlySeries(
      normalizeAll([
        trade({ contractDate: "2026-06-01" }),
        trade({ contractDate: "2026-08-01" }),
        trade({ contractDate: "2026-07-01" }),
      ]),
      AS_OF,
    );
    const points = Object.values(series)[0] ?? [];
    expect(points.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("asOf 이후 거래는 제외한다 — 미래 거래가 시계열에 섞이지 않는다", () => {
    const series = buildMonthlySeries(
      normalizeAll([
        trade({ contractDate: "2026-07-01", price: 1_000_000_000 }),
        trade({ contractDate: "2026-09-01", price: 100_000_000_000 }),
      ]),
      AS_OF,
    );
    const points = Object.values(series)[0] ?? [];
    expect(points.map((p) => p.month)).toEqual(["2026-07"]);
  });

  it("asOf 당일 거래는 포함한다 — 상한은 포함(inclusive) 경계다", () => {
    const series = buildMonthlySeries(
      normalizeAll([trade({ contractDate: "2026-08-22" })]),
      AS_OF,
    );
    const points = Object.values(series)[0] ?? [];
    expect(points).toHaveLength(1);
  });

  it("같은 areaBucket으로 반올림되는 서로 다른 실제 면적도 한 시계열로 합쳐진다", () => {
    const series = buildMonthlySeries(
      normalizeAll([
        trade({ exclusiveAreaSqm: 84.4, price: 1_000_000_000 }),
        trade({ exclusiveAreaSqm: 83.6, price: 2_000_000_000 }),
      ]),
      AS_OF,
    );
    expect(Object.keys(series)).toHaveLength(1);
  });

  it("medianPrice·changeRate 필드를 전혀 담지 않는다", () => {
    const series = buildMonthlySeries(
      normalizeAll([trade(), trade({ price: 3_000_000_000 })]),
      AS_OF,
    );
    for (const points of Object.values(series)) {
      for (const point of points) {
        expect(Object.keys(point).sort()).toEqual(
          ["maxPrice", "minPrice", "month", "tradeCount"].sort(),
        );
      }
    }
  });

  it("산출물 키가 정렬된다 — 결정론", () => {
    const series = buildMonthlySeries(
      normalizeAll([
        trade({ complexName: "C단지", builtYear: 2000 }),
        trade({ complexName: "A단지", builtYear: 2000 }),
        trade({ complexName: "B단지", builtYear: 2000 }),
      ]),
      AS_OF,
    );
    const keys = Object.keys(series);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("emitMonthly", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "emit-monthly-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("data/monthly.json을 별도 파일로 쓴다", () => {
    const series: MonthlySeries = {
      "a|84": [{ month: "2026-07", minPrice: 1, maxPrice: 2, tradeCount: 1 }],
    };
    emitMonthly(series, root);
    const path = join(root, "monthly.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(series);
  });
});

/**
 * "화면에 붙이는 것은 별도 결정이라 지금은 파이프라인이 만들기만 한다"는
 * 약속을 소스로 직접 검증한다. `src/` 어디에도 `monthly.json`을 가리키는
 * import나 문자열이 없어야 한다 — 있으면 그 순간부터 이 파일의 형식이
 * 암묵적으로 화면 계약이 되어, 나중에 형식을 바꿀 때 화면도 함께 깨진다.
 *
 * 이 가드는 scripts/pipeline/ 아래에 둔다 — src/no-network.test.ts는 자신을
 * 제외한 src/ 트리 전체를 node:fs 사용 여부로 스캔하므로, 이 가드 자체가
 * src/ 안에 있으면(node:fs를 써야 하므로) 그 스캔에 걸린다.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const HERE = dirname(fileURLToPath(import.meta.url));

describe("src/는 monthly.json을 import하지 않는다", () => {
  it("src/ 어떤 파일에도 monthly.json 참조가 없다", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(HERE, "..", "..", "src"))) {
      const content = readFileSync(file, "utf8");
      if (/monthly\.json/.test(content) || /from ["'].*monthly["']/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
