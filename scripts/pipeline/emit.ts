import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ComplexUnit } from "./aggregate";
import { DATA_DIR } from "./config";

export interface RegionMeta {
  regionCode: string;
  complexCount: number;
  unitCount: number;
}

export interface Manifest {
  /** 파이프라인이 이 산출물을 만든 시각 */
  generatedAt: string;
  /** 실거래 데이터의 기준 월 (YYYY-MM) */
  dataAsOf: string;
  /** 이 데이터와 함께 쓸 규제 룰셋 버전 */
  rulesVersion: string;
  complexCount: number;
  unitCount: number;
  lowConfidenceUnitCount: number;
  regionCodes: string[];
}

export function buildRegions(units: ComplexUnit[]): RegionMeta[] {
  const byRegion = new Map<string, Set<string>>();
  const unitCounts = new Map<string, number>();

  for (const unit of units) {
    const keys = byRegion.get(unit.regionCode) ?? new Set<string>();
    keys.add(unit.complexKey);
    byRegion.set(unit.regionCode, keys);
    unitCounts.set(unit.regionCode, (unitCounts.get(unit.regionCode) ?? 0) + 1);
  }

  return [...byRegion.entries()].map(([regionCode, keys]) => ({
    regionCode,
    complexCount: keys.size,
    unitCount: unitCounts.get(regionCode) ?? 0,
  }));
}

export function buildManifest(
  units: ComplexUnit[],
  generatedAt: Date,
  dataAsOf: string,
  rulesVersion: string,
): Manifest {
  const complexKeys = new Set(units.map((u) => u.complexKey));
  return {
    generatedAt: generatedAt.toISOString(),
    dataAsOf,
    rulesVersion,
    complexCount: complexKeys.size,
    unitCount: units.length,
    lowConfidenceUnitCount: units.filter((u) => u.lowConfidence).length,
    regionCodes: [...new Set(units.map((u) => u.regionCode))].sort(),
  };
}

export function emit(
  units: ComplexUnit[],
  generatedAt: Date,
  dataAsOf: string,
  rulesVersion: string,
): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "complexes.json"), JSON.stringify(units));
  writeFileSync(
    join(DATA_DIR, "regions.json"),
    JSON.stringify(buildRegions(units), null, 2),
  );
  writeFileSync(
    join(DATA_DIR, "manifest.json"),
    JSON.stringify(buildManifest(units, generatedAt, dataAsOf, rulesVersion), null, 2),
  );
}
