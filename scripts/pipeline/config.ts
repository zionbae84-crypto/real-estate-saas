import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ReportConfig } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 수집 대상 시군구 코드. 코드가 아니라 설정을 바꿔 범위를 넓힌다. */
export function loadRegions(): string[] {
  const raw = JSON.parse(readFileSync(join(HERE, "regions.json"), "utf8")) as {
    codes?: unknown;
  };
  if (!Array.isArray(raw.codes) || raw.codes.some((c) => typeof c !== "string")) {
    throw new Error("regions.json의 codes가 문자열 배열이 아닙니다");
  }
  return raw.codes as string[];
}

/** 이상 신호 임계값. 리포트를 보고 조이는 값이므로 코드가 아니라 설정에 둔다. */
export function loadReportConfig(): ReportConfig {
  const raw = JSON.parse(
    readFileSync(join(HERE, "report-config.json"), "utf8"),
  ) as Record<string, unknown>;

  const keys = [
    "underMergeMaxEditDistance",
    "overMergeMinPriceRatio",
    "overMergeMinTradeCount",
    "lowConfidenceMinTrades",
  ] as const;

  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`report-config.json 필드 오류: ${key}`);
    }
  }
  return raw as unknown as ReportConfig;
}

export const DATA_DIR = join(HERE, "..", "..", "data");
export const RAW_DIR = join(DATA_DIR, "raw");
