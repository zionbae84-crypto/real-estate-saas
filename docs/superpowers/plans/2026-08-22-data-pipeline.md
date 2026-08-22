# 데이터 파이프라인 (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 국토교통부 실거래가 API에서 수도권 아파트 매매 거래를 수집해, 단지 × 평형별 대표 시세로 집계하고 정적 JSON으로 내보내는 빌드 타임 파이프라인을 만든다.

**Architecture:** `scripts/pipeline/` 아래 다섯 개의 독립 실행 진입점. 각 단계는 이전 단계의 출력 파일만 읽는다. `fetch`만 네트워크와 파일시스템을 만지고, `normalize`·`aggregate`는 순수 함수라 픽스처만으로 검증된다. 단지 식별은 **보수적 키 + 이상 신호 리포트** — 조용히 잘못 합치느니 지저분하게 남기고 사람이 볼 리포트를 낸다.

**Tech Stack:** TypeScript 7, Node 20+, Vitest 4

## Global Constraints

- **API 키는 환경변수 `PUBLIC_DATA_API_KEY`에서만 읽는다.** 코드·저장소·로그·에러 메시지 어디에도 키 값이 남으면 안 된다. `.env`는 gitignore에 있어야 한다.
- **`src/`를 수정하지 않는다.** 파이프라인은 `scripts/`에만 산다. `src/lib/finance/`와 UI는 이 계획의 대상이 아니다.
  - **단 하나의 예외**: Task 7에서 `src/no-network.test.ts`에 **주석 한 덩어리만** 추가한다.
    그 테스트가 `scripts/`를 스캔하지 않는 것이 우연이 아니라 의도임을 코드 안에 남기기 위해서다
    (스펙 4절). 검사 로직·패턴 목록·단언은 **한 글자도 바꾸지 않는다.**
- **`fetch` 외의 단계는 순수 함수다.** 네트워크·`Date.now()`·전역 상태 접근 금지. 현재 시각이 필요하면 인자로 받는다.
- 모든 금액은 **원 단위 정수**로 다룬다. API가 만원 단위로 주더라도 파서에서 원으로 바꾼다.
- **임계값과 지역 목록은 코드가 아니라 설정 파일에 둔다.** 리포트를 보고 조이는 것이 목적이므로, 조이는 행위가 코드 수정이어서는 안 된다.
- 파일당 하나의 책임. 200줄을 넘으면 같은 파일 내 헬퍼 추출을 검토한다.
- 테스트는 대상과 같은 디렉토리에 `*.test.ts`로 둔다.
- 커밋 메시지는 Conventional Commits, **제목은 한국어**.
- TypeScript strict, `noUncheckedIndexedAccess`. `any` 금지, 불필요한 non-null assertion 금지.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `scripts/pipeline/config.ts` | 설정 로딩 (지역 목록, 임계값, 경로) |
| `scripts/pipeline/regions.json` | 수집 대상 시군구 코드 목록 |
| `scripts/pipeline/report-config.json` | 이상 신호 임계값 |
| `scripts/pipeline/types.ts` | 단계 간 주고받는 타입 |
| `scripts/pipeline/parse-response.ts` | API 응답 → `RawTrade[]` |
| `scripts/pipeline/fetch.ts` | 수집·증분 캐시·재시도·로그 |
| `scripts/pipeline/normalize.ts` | 단지 키 생성 |
| `scripts/pipeline/aggregate.ts` | 평형 버킷·중위값·변동률 |
| `scripts/pipeline/emit.ts` | 산출물 세 파일 |
| `scripts/pipeline/report.ts` | 이상 신호 리포트 |
| `scripts/pipeline/fixtures/` | 실제 응답 샘플과 테스트 픽스처 |

의존 방향: `types` → `parse-response` → `fetch`, 그리고 `normalize` → `aggregate` → {`emit`, `report`}.

---

## Task 1: 셋업 + API 프로브 + 응답 파서

**Files:**
- Create: `scripts/pipeline/types.ts`, `scripts/pipeline/config.ts`, `scripts/pipeline/regions.json`, `scripts/pipeline/parse-response.ts`, `scripts/pipeline/probe.ts`
- Create: `scripts/pipeline/fixtures/sample-response.txt` (실제 응답)
- Create: `scripts/pipeline/parse-response.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `interface RawTrade { regionCode; legalDongName; complexName; builtYear; exclusiveAreaSqm; floor; price; contractDate }`
  - `parseResponse(body: string): { trades: RawTrade[]; failures: number }`
  - `loadRegions(): string[]`, `loadReportConfig(): ReportConfig`

**이 태스크가 특별한 이유:** API가 XML을 주는지 JSON을 주는지, 필드 이름이 정확히 무엇인지 **모르는 상태로 시작한다.** 그래서 첫 단계가 실제 호출이고, 파서는 지어낸 스펙이 아니라 **실제로 받은 응답**에 맞춰 쓴다.

- [ ] **Step 1: 키 확인과 gitignore**

```bash
cd "/Users/yongsmac/Documents/부동산 saas"
grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore
grep -q '^data/$' .gitignore && echo "data/ 이미 ignore됨" || echo 'data/' >> .gitignore
```

`PUBLIC_DATA_API_KEY`가 환경에 있는지 확인한다. **값을 출력하지 말 것** — 존재 여부만 본다:

```bash
if [ -n "$PUBLIC_DATA_API_KEY" ]; then echo "키 있음"; else echo "키 없음"; fi
```

키가 없으면 `.env` 파일에서 읽는지 확인하고, 그래도 없으면 **STOP하고 NEEDS_CONTEXT로 보고한다.** 키 없이는 이 태스크를 완료할 수 없다.

- [ ] **Step 2: 실제 API 호출로 응답 형식 확인**

`scripts/pipeline/probe.ts`를 만들어 한 건만 호출한다. 후보 엔드포인트가 둘이며, 어느 쪽이 살아 있는지 확인한다:

```
A) https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
B) http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTrade
```

공통 파라미터: `serviceKey`, `LAWD_CD`(시군구 5자리), `DEAL_YMD`(YYYYMM), `numOfRows`, `pageNo`.
`_type=json`도 함께 시도한다.

```ts
// scripts/pipeline/probe.ts
const KEY = process.env.PUBLIC_DATA_API_KEY;
if (!KEY) {
  console.error("PUBLIC_DATA_API_KEY 환경변수가 없습니다.");
  process.exit(1);
}

const CANDIDATES = [
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  "http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTrade",
];

for (const base of CANDIDATES) {
  for (const type of ["json", ""]) {
    const url = new URL(base);
    url.searchParams.set("serviceKey", KEY);
    url.searchParams.set("LAWD_CD", "11680"); // 서울 강남구
    url.searchParams.set("DEAL_YMD", "202606");
    url.searchParams.set("numOfRows", "5");
    url.searchParams.set("pageNo", "1");
    if (type) url.searchParams.set("_type", type);

    try {
      const res = await fetch(url);
      const body = await res.text();
      // URL은 키를 포함하므로 절대 출력하지 않는다
      console.log(`--- ${base} _type=${type || "(none)"} → ${res.status} ---`);
      console.log(body.slice(0, 1200));
    } catch (e) {
      console.log(`--- ${base} _type=${type || "(none)"} → 실패: ${String(e)}`);
    }
  }
}
```

Run: `npx tsx scripts/pipeline/probe.ts` (또는 `node --experimental-strip-types`)

**응답 본문을 `scripts/pipeline/fixtures/sample-response.txt`에 저장한다.** 키가 응답에 에코되지 않는지 확인하고, 만약 포함돼 있으면 그 부분을 `<REDACTED>`로 치환한 뒤 저장한다.

**보고서에 기록할 것:** 어느 엔드포인트가 살아 있었는지, 형식이 XML인지 JSON인지, 실제 필드 이름 목록, 거래금액의 단위와 표기(콤마·공백 포함 여부).

- [ ] **Step 3: 타입과 설정 작성**

`scripts/pipeline/types.ts`:

```ts
/** API 응답 한 건을 정규화 전 형태로 담은 것. 금액은 이미 원 단위 정수다. */
export interface RawTrade {
  /** 시군구 코드 5자리 */
  regionCode: string;
  /** 법정동명 (코드가 아니라 이름으로 온다) */
  legalDongName: string;
  complexName: string;
  builtYear: number;
  exclusiveAreaSqm: number;
  floor: number;
  /** 원 단위 정수 */
  price: number;
  /** YYYY-MM-DD */
  contractDate: string;
}

export interface ParseResult {
  trades: RawTrade[];
  /** 파싱에 실패한 레코드 수. 조용히 버리지 않고 세어서 리포트에 남긴다 */
  failures: number;
}

export interface ReportConfig {
  /** 과소병합 후보로 볼 정규화명 편집거리 상한 */
  underMergeMaxEditDistance: number;
  /** 과대병합 의심으로 볼 최고가/최저가 비율 하한 */
  overMergeMinPriceRatio: number;
  /** 과대병합 판정에 필요한 최소 거래 건수 */
  overMergeMinTradeCount: number;
  /** lowConfidence 판정 기준 (최근 6개월 거래 건수 미만) */
  lowConfidenceMinTrades: number;
}
```

`scripts/pipeline/regions.json` — 검증용 소규모로 시작한다:

```json
{
  "_note": "수집 대상 시군구 코드(법정동코드 앞 5자리). 검증 후 수도권 전체로 넓힌다.",
  "codes": ["11680", "11650", "11710"]
}
```

(11680 강남구, 11650 서초구, 11710 송파구)

`scripts/pipeline/report-config.json`:

```json
{
  "underMergeMaxEditDistance": 2,
  "overMergeMinPriceRatio": 2.0,
  "overMergeMinTradeCount": 4,
  "lowConfidenceMinTrades": 3
}
```

`scripts/pipeline/config.ts`:

```ts
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
```

- [ ] **Step 4: 실패하는 파서 테스트 작성**

Step 2에서 저장한 **실제 응답**을 픽스처로 쓴다. 아래 테스트의 기대값은 **실제 픽스처의 첫 레코드에서 직접 읽어 채운다** — 지어내지 않는다.

`scripts/pipeline/parse-response.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseResponse } from "./parse-response";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(HERE, "fixtures/sample-response.txt"), "utf8");

describe("parseResponse", () => {
  it("실제 응답에서 거래를 읽어낸다", () => {
    const { trades, failures } = parseResponse(SAMPLE);
    expect(trades.length).toBeGreaterThan(0);
    expect(failures).toBe(0);
  });

  it("금액을 원 단위 정수로 바꾼다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(Number.isInteger(t.price)).toBe(true);
      // 아파트 거래가 1억 미만이거나 1조 이상이면 단위 변환이 틀린 것이다
      expect(t.price).toBeGreaterThan(100_000_000);
      expect(t.price).toBeLessThan(1_000_000_000_000);
    }
  });

  it("계약일을 YYYY-MM-DD로 만든다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(t.contractDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("면적과 건축년도가 숫자다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(Number.isFinite(t.exclusiveAreaSqm)).toBe(true);
      expect(t.exclusiveAreaSqm).toBeGreaterThan(0);
      expect(Number.isInteger(t.builtYear)).toBe(true);
      expect(t.builtYear).toBeGreaterThan(1900);
    }
  });

  it("빈 응답이면 빈 배열이고 실패 0이다", () => {
    const empty = SAMPLE.includes("<") ? "<response><body><items></items></body></response>" : '{"response":{"body":{"items":""}}}';
    const { trades, failures } = parseResponse(empty);
    expect(trades).toEqual([]);
    expect(failures).toBe(0);
  });

  it("망가진 레코드는 버리되 세어서 알린다", () => {
    const broken = SAMPLE.replace(/2[0-9]{3}/, "연도아님");
    const { failures } = parseResponse(broken);
    expect(failures).toBeGreaterThan(0);
  });

  it("파싱 불가한 본문에도 예외를 던지지 않는다", () => {
    expect(() => parseResponse("전혀 응답이 아님")).not.toThrow();
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `npx vitest run scripts/pipeline/parse-response.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-response"`

- [ ] **Step 6: 파서 구현**

Step 2에서 확인한 실제 형식에 맞춰 구현한다.

- **JSON이면** 의존성 없이 `JSON.parse`로 처리한다.
- **XML이면** `npm install fast-xml-parser`를 추가하고 그것으로 파싱한다. 정규식으로 XML을 파싱하지 말 것.

어느 쪽이든 지켜야 할 계약:

- 레코드 하나가 망가져도 **예외를 던지지 않고** 그 건만 버리고 `failures`를 올린다. 한 건 때문에 시군구 전체를 잃지 않기 위해서다
- **금액을 원 단위 정수로 바꾼다.** 국토부는 만원 단위에 콤마·공백을 섞어 준다(`" 82,500"` → `825,000,000`)
- 계약일은 년·월·일 필드를 합쳐 `YYYY-MM-DD`로 만든다
- 응답 자체가 파싱 불가하면 `{ trades: [], failures: 0 }`을 반환하고 호출자가 판단하게 한다

- [ ] **Step 7: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 기존 476개가 모두 통과하고 이 태스크의 새 테스트 7개가 더해진다

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 실거래가 API 응답 파서와 파이프라인 설정 추가"
```

---

## Task 2: `fetch` — 수집·증분 캐시·재시도

**Files:**
- Create: `scripts/pipeline/fetch.ts`, `scripts/pipeline/fetch.test.ts`
- Modify: `package.json` (스크립트 추가)

**Interfaces:**
- Consumes: `parseResponse` (Task 1), `loadRegions`, `RAW_DIR` (Task 1)
- Produces:
  - `interface FetchLogEntry { regionCode; yearMonth; status: "fetched" | "cached" | "empty" | "failed"; tradeCount: number; failures: number; error?: string }`
  - `buildTargets(now: Date, months: number, regions: string[]): Array<{ regionCode: string; yearMonth: string }>`
  - `shouldSkip(yearMonth: string, now: Date, cacheExists: boolean): boolean`
  - `data/fetch-log.json`

**설계 노트:** `report`가 "수집 실패"를 알려면 `fetch`가 로그를 남겨야 한다. `normalized.json`만으로는 **애초에 수집되지 않은 데이터의 부재를 알 수 없다.**

- [ ] **Step 1: 실패하는 테스트 작성**

순수 함수 두 개(`buildTargets`, `shouldSkip`)를 먼저 테스트한다. 네트워크가 필요 없다.

`scripts/pipeline/fetch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTargets, shouldSkip } from "./fetch";

describe("buildTargets", () => {
  it("지역 × 개월 수만큼 만든다", () => {
    const targets = buildTargets(new Date("2026-08-22T00:00:00Z"), 3, ["11680", "11650"]);
    expect(targets).toHaveLength(6);
  });

  it("이번 달부터 과거로 거슬러 만든다", () => {
    const targets = buildTargets(new Date("2026-08-22T00:00:00Z"), 3, ["11680"]);
    expect(targets.map((t) => t.yearMonth)).toEqual(["202608", "202607", "202606"]);
  });

  it("연도 경계를 넘는다", () => {
    const targets = buildTargets(new Date("2026-02-10T00:00:00Z"), 3, ["11680"]);
    expect(targets.map((t) => t.yearMonth)).toEqual(["202602", "202601", "202512"]);
  });
});

describe("shouldSkip", () => {
  const now = new Date("2026-08-22T00:00:00Z");

  it("캐시가 없으면 건너뛰지 않는다", () => {
    expect(shouldSkip("202607", now, false)).toBe(false);
  });

  it("지난 달 이전이고 캐시가 있으면 건너뛴다", () => {
    expect(shouldSkip("202607", now, true)).toBe(true);
  });

  it("이번 달은 캐시가 있어도 다시 받는다 — 거래가 계속 쌓인다", () => {
    expect(shouldSkip("202608", now, true)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run scripts/pipeline/fetch.test.ts`
Expected: FAIL — `Failed to resolve import "./fetch"`

- [ ] **Step 3: 구현**

`scripts/pipeline/fetch.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, RAW_DIR, loadRegions } from "./config";
import { parseResponse } from "./parse-response";
import type { RawTrade } from "./types";

export interface FetchLogEntry {
  regionCode: string;
  yearMonth: string;
  status: "fetched" | "cached" | "empty" | "failed";
  tradeCount: number;
  failures: number;
  error?: string;
}

/** 이번 달부터 과거로 months개월치 (지역 × 월) 조합을 만든다. */
export function buildTargets(
  now: Date,
  months: number,
  regions: string[],
): Array<{ regionCode: string; yearMonth: string }> {
  const targets: Array<{ regionCode: string; yearMonth: string }> = [];
  for (let back = 0; back < months; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    for (const regionCode of regions) {
      targets.push({ regionCode, yearMonth: ym });
    }
  }
  return targets;
}

/**
 * 캐시가 있고 이미 닫힌 달이면 건너뛴다.
 * 이번 달은 거래가 계속 쌓이므로 캐시가 있어도 다시 받는다.
 */
export function shouldSkip(
  yearMonth: string,
  now: Date,
  cacheExists: boolean,
): boolean {
  if (!cacheExists) return false;
  const current = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return yearMonth < current;
}

const ENDPOINT_ENV = "PUBLIC_DATA_API_ENDPOINT";
const KEY_ENV = "PUBLIC_DATA_API_KEY";

async function fetchOne(
  regionCode: string,
  yearMonth: string,
  key: string,
  endpoint: string,
): Promise<string> {
  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("LAWD_CD", regionCode);
  url.searchParams.set("DEAL_YMD", yearMonth);
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("pageNo", "1");

  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      // 4xx(429 제외)는 재시도해도 소용없다
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      // URL에는 키가 들어 있으므로 절대 메시지에 넣지 않는다
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError || "알 수 없는 실패");
}

export async function main(): Promise<void> {
  const key = process.env[KEY_ENV];
  if (!key) {
    console.error(
      `${KEY_ENV} 환경변수가 없습니다.\n` +
        `공공데이터포털(https://www.data.go.kr)에서 "아파트 매매 실거래가" 활용신청 후\n` +
        `발급된 키를 .env에 ${KEY_ENV}=... 로 넣어 주세요. .env는 gitignore 대상입니다.`,
    );
    process.exit(1);
  }
  const endpoint = process.env[ENDPOINT_ENV];
  if (!endpoint) {
    console.error(`${ENDPOINT_ENV} 환경변수가 없습니다. Task 1의 프로브가 확인한 엔드포인트를 넣어 주세요.`);
    process.exit(1);
  }

  mkdirSync(RAW_DIR, { recursive: true });
  const now = new Date();
  const targets = buildTargets(now, 12, loadRegions());
  const log: FetchLogEntry[] = [];

  for (const { regionCode, yearMonth } of targets) {
    const path = join(RAW_DIR, `${regionCode}-${yearMonth}.json`);
    if (shouldSkip(yearMonth, now, existsSync(path))) {
      const cached = JSON.parse(readFileSync(path, "utf8")) as RawTrade[];
      log.push({ regionCode, yearMonth, status: "cached", tradeCount: cached.length, failures: 0 });
      continue;
    }

    try {
      const body = await fetchOne(regionCode, yearMonth, key, endpoint);
      const { trades, failures } = parseResponse(body);
      writeFileSync(path, JSON.stringify(trades, null, 2));
      log.push({
        regionCode,
        yearMonth,
        status: trades.length === 0 ? "empty" : "fetched",
        tradeCount: trades.length,
        failures,
      });
      console.log(`${regionCode} ${yearMonth}: ${trades.length}건 (파싱실패 ${failures})`);
    } catch (e) {
      // 이 달만 건너뛴다. 기존 캐시가 있으면 덮어쓰지 않는다.
      const message = e instanceof Error ? e.message : String(e);
      log.push({ regionCode, yearMonth, status: "failed", tradeCount: 0, failures: 0, error: message });
      console.error(`${regionCode} ${yearMonth}: 실패 — ${message}`);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  writeFileSync(join(DATA_DIR, "fetch-log.json"), JSON.stringify(log, null, 2));
  const failed = log.filter((e) => e.status === "failed").length;
  console.log(`\n완료: ${log.length}건 중 실패 ${failed}건. 로그는 data/fetch-log.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

`package.json`의 `scripts`에 추가:

```json
    "pipeline:probe": "tsx scripts/pipeline/probe.ts",
    "pipeline:fetch": "tsx scripts/pipeline/fetch.ts"
```

`tsx`가 없으면 `npm install -D tsx`로 추가한다.

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 이 태스크의 새 테스트 6개가 더해진다

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 실거래가 수집 단계와 증분 캐시·재시도 추가"
```

---

## Task 3: `normalize` — 단지 키 생성

**Files:**
- Create: `scripts/pipeline/normalize.ts`, `scripts/pipeline/normalize.test.ts`

**Interfaces:**
- Consumes: `RawTrade` (Task 1)
- Produces:
  - `normalizeName(name: string): string`
  - `buildComplexKey(trade: RawTrade): string`
  - `interface NormalizedTrade extends RawTrade { complexKey: string }`
  - `normalizeAll(trades: RawTrade[]): NormalizedTrade[]`

**설계 노트:** 최소 정규화만 한다 — **공백·특수문자 제거, 대소문자 통일까지.** 차수·단지·아파트 접미사는 **건드리지 않는다.** `"우성1차"`와 `"우성2차"`는 실제로 다른 단지이기 때문이다. 기본값이 "안 합침"이라 틀리는 방향이 안전하다.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pipeline/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildComplexKey, normalizeAll, normalizeName } from "./normalize";
import type { RawTrade } from "./types";

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    complexName: "래미안대치팰리스",
    builtYear: 2015,
    exclusiveAreaSqm: 84.97,
    floor: 10,
    price: 3_000_000_000,
    contractDate: "2026-06-15",
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("공백을 없앤다", () => {
    expect(normalizeName("래미안 대치팰리스")).toBe(normalizeName("래미안대치팰리스"));
  });

  it("대소문자를 통일한다", () => {
    expect(normalizeName("E편한세상")).toBe(normalizeName("e편한세상"));
  });

  it("특수문자를 없앤다", () => {
    expect(normalizeName("래미안(대치)팰리스")).toBe(normalizeName("래미안대치팰리스"));
  });

  it("차수를 지우지 않는다 — 실제로 다른 단지다", () => {
    expect(normalizeName("우성1차")).not.toBe(normalizeName("우성2차"));
  });

  it("단지 번호를 지우지 않는다", () => {
    expect(normalizeName("주공1단지")).not.toBe(normalizeName("주공2단지"));
  });

  it("아파트 접미사를 지우지 않는다 — 지우면 다른 단지와 충돌할 수 있다", () => {
    expect(normalizeName("우성아파트")).not.toBe(normalizeName("우성"));
  });
});

describe("buildComplexKey", () => {
  it("법정동·건축년도·정규화명을 합친다", () => {
    expect(buildComplexKey(trade())).toBe("11680|대치동|2015|래미안대치팰리스");
  });

  it("표기가 흔들려도 같은 키가 된다", () => {
    expect(buildComplexKey(trade({ complexName: "래미안 대치팰리스" }))).toBe(
      buildComplexKey(trade({ complexName: "래미안대치팰리스" })),
    );
  });

  it("건축년도가 다르면 다른 키다", () => {
    expect(buildComplexKey(trade({ builtYear: 2015 }))).not.toBe(
      buildComplexKey(trade({ builtYear: 2016 })),
    );
  });

  it("법정동이 다르면 다른 키다 — 같은 이름의 단지가 여러 동에 있다", () => {
    expect(buildComplexKey(trade({ legalDongName: "역삼동" }))).not.toBe(
      buildComplexKey(trade({ legalDongName: "대치동" })),
    );
  });
});

describe("normalizeAll", () => {
  it("모든 거래에 키를 붙인다", () => {
    const result = normalizeAll([trade(), trade({ complexName: "은마" })]);
    expect(result).toHaveLength(2);
    expect(result[0]?.complexKey).toBeDefined();
    expect(result[0]?.complexKey).not.toBe(result[1]?.complexKey);
  });

  it("원본 필드를 보존한다", () => {
    const [result] = normalizeAll([trade()]);
    expect(result?.complexName).toBe("래미안대치팰리스");
    expect(result?.price).toBe(3_000_000_000);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run scripts/pipeline/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "./normalize"`

- [ ] **Step 3: 구현**

`scripts/pipeline/normalize.ts`:

```ts
import type { RawTrade } from "./types";

export interface NormalizedTrade extends RawTrade {
  complexKey: string;
}

/**
 * 단지명 최소 정규화.
 *
 * 공백·특수문자를 없애고 대소문자를 통일하는 것까지만 한다.
 * **차수("1차")·단지 번호("1단지")·"아파트" 접미사는 건드리지 않는다** —
 * "우성1차"와 "우성2차"는 실제로 다른 단지이고, 접미사를 떼면 조용히 합쳐진다.
 *
 * 기본값이 "안 합침"이므로 틀리는 방향이 안전하다. 합쳤어야 할 것을 못 합친 경우는
 * 이상 신호 리포트의 "과소병합 후보"가 잡아 사람이 확인하게 한다.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\-_.()[\]{},'"·]/g, "");
}

/** 법정동 + 건축년도 + 정규화명. 셋이 모두 같아야 같은 단지로 본다. */
export function buildComplexKey(trade: RawTrade): string {
  return [
    trade.regionCode,
    trade.legalDongName,
    trade.builtYear,
    normalizeName(trade.complexName),
  ].join("|");
}

export function normalizeAll(trades: RawTrade[]): NormalizedTrade[] {
  return trades.map((trade) => ({ ...trade, complexKey: buildComplexKey(trade) }));
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 이 태스크의 새 테스트 12개가 더해진다

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 단지 식별 키 생성 단계 추가"
```

---

## Task 4: `aggregate` — 평형 버킷·중위값·변동률

**Files:**
- Create: `scripts/pipeline/aggregate.ts`, `scripts/pipeline/aggregate.test.ts`

**Interfaces:**
- Consumes: `NormalizedTrade` (Task 3), `ReportConfig` (Task 1)
- Produces:
  - `median(values: number[]): number`
  - `areaBucket(sqm: number): number`
  - `interface ComplexUnit { complexKey; complexName; regionCode; legalDongName; builtYear; areaBucket; medianPrice; tradeCount; minPrice; maxPrice; changeRate3m; changeRate12m; lowConfidence }`
  - `aggregate(trades: NormalizedTrade[], asOf: Date, config: ReportConfig): ComplexUnit[]`

**설계 노트:** `asOf`를 인자로 받는다 — 순수 함수를 유지하고 테스트를 고정하기 위해서다. `Date.now()`를 부르지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pipeline/aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregate, areaBucket, median } from "./aggregate";
import { normalizeAll } from "./normalize";
import type { RawTrade, ReportConfig } from "./types";

const config: ReportConfig = {
  underMergeMaxEditDistance: 2,
  overMergeMinPriceRatio: 2.0,
  overMergeMinTradeCount: 4,
  lowConfidenceMinTrades: 3,
};

const AS_OF = new Date("2026-08-22T00:00:00Z");

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
  return {
    regionCode: "11680",
    legalDongName: "대치동",
    complexName: "은마",
    builtYear: 1979,
    exclusiveAreaSqm: 84.43,
    floor: 5,
    price: 2_000_000_000,
    contractDate: "2026-07-10",
    ...overrides,
  };
}

describe("median", () => {
  it("홀수 개면 가운데 값이다", () => {
    expect(median([100, 300, 200])).toBe(200);
  });

  it("짝수 개면 가운데 둘의 평균을 내림한다", () => {
    expect(median([100, 200, 300, 401])).toBe(250);
  });

  it("1건이면 그 값이다", () => {
    expect(median([777])).toBe(777);
  });

  it("0건이면 0이다", () => {
    expect(median([])).toBe(0);
  });

  it("정수를 반환한다", () => {
    expect(Number.isInteger(median([100, 101]))).toBe(true);
  });
});

describe("areaBucket", () => {
  it("1㎡ 단위로 반올림한다", () => {
    expect(areaBucket(84.97)).toBe(85);
    expect(areaBucket(84.43)).toBe(84);
  });

  it("정확히 .5는 올림한다", () => {
    expect(areaBucket(84.5)).toBe(85);
  });
});

describe("aggregate", () => {
  it("단지 × 평형으로 묶는다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ exclusiveAreaSqm: 84.4 }),
        trade({ exclusiveAreaSqm: 84.4 }),
        trade({ exclusiveAreaSqm: 101.2 }),
      ]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(2);
  });

  it("최근 6개월 거래로 중위값을 낸다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000, contractDate: "2026-07-01" }),
        trade({ price: 2_000_000_000, contractDate: "2026-06-01" }),
        trade({ price: 3_000_000_000, contractDate: "2026-05-01" }),
        // 8개월 전 — 중위값에서 제외돼야 한다
        trade({ price: 9_000_000_000, contractDate: "2025-12-01" }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.medianPrice).toBe(2_000_000_000);
  });

  it("거래가 3건 미만이면 lowConfidence를 켠다", () => {
    const units = aggregate(normalizeAll([trade(), trade()]), AS_OF, config);
    expect(units[0]?.lowConfidence).toBe(true);
  });

  it("거래가 3건 이상이면 lowConfidence가 꺼진다", () => {
    const units = aggregate(
      normalizeAll([trade(), trade(), trade()]),
      AS_OF,
      config,
    );
    expect(units[0]?.lowConfidence).toBe(false);
  });

  it("최고·최저가를 담는다", () => {
    const units = aggregate(
      normalizeAll([
        trade({ price: 1_000_000_000 }),
        trade({ price: 3_000_000_000 }),
      ]),
      AS_OF,
      config,
    );
    expect(units[0]?.minPrice).toBe(1_000_000_000);
    expect(units[0]?.maxPrice).toBe(3_000_000_000);
  });

  it("최근 6개월 거래가 없으면 그 평형을 내지 않는다", () => {
    const units = aggregate(
      normalizeAll([trade({ contractDate: "2025-10-01" })]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(0);
  });

  it("모든 금액이 정수다", () => {
    const units = aggregate(
      normalizeAll([trade({ price: 1_000_000_001 }), trade({ price: 2_000_000_000 })]),
      AS_OF,
      config,
    );
    for (const u of units) {
      expect(Number.isInteger(u.medianPrice)).toBe(true);
      expect(Number.isInteger(u.minPrice)).toBe(true);
      expect(Number.isInteger(u.maxPrice)).toBe(true);
    }
  });

  it("대표 단지명은 원본 표기 중 하나다", () => {
    const units = aggregate(
      normalizeAll([trade({ complexName: "은마 아파트" }), trade({ complexName: "은마아파트" })]),
      AS_OF,
      config,
    );
    expect(units).toHaveLength(1);
    expect(["은마 아파트", "은마아파트"]).toContain(units[0]?.complexName);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run scripts/pipeline/aggregate.test.ts`
Expected: FAIL — `Failed to resolve import "./aggregate"`

- [ ] **Step 3: 구현**

`scripts/pipeline/aggregate.ts`:

```ts
import type { NormalizedTrade } from "./normalize";
import type { ReportConfig } from "./types";

export interface ComplexUnit {
  complexKey: string;
  /** 원본 표기 중 대표 하나 */
  complexName: string;
  regionCode: string;
  legalDongName: string;
  builtYear: number;
  /** 전용면적을 1㎡ 단위로 반올림한 값 */
  areaBucket: number;
  /** 최근 6개월 거래의 중위값(원) */
  medianPrice: number;
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
  /** 3개월 전 대비 변동률. 비교 대상이 없으면 null */
  changeRate3m: number | null;
  /** 12개월 전 대비 변동률. 비교 대상이 없으면 null */
  changeRate12m: number | null;
  lowConfidence: boolean;
}

/** 중위값. 짝수 개면 가운데 둘의 평균을 내림한다. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return 0;
  if (sorted.length % 2 === 1) return a;
  const b = sorted[mid - 1];
  if (b === undefined) return a;
  return Math.floor((a + b) / 2);
}

/**
 * 전용면적을 1㎡ 단위로 반올림한다.
 *
 * 84.4와 84.6은 실제로 같은 평형인데 84와 85로 갈린다. 조용히 뭉개는 대신
 * 이상 신호 리포트의 "평형 분할 의심"이 이를 잡는다.
 */
export function areaBucket(sqm: number): number {
  return Math.round(sqm);
}

function monthsBefore(asOf: Date, months: number): Date {
  return new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months, asOf.getUTCDate()),
  );
}

function changeRate(recent: number[], older: number[]): number | null {
  if (recent.length === 0 || older.length === 0) return null;
  const from = median(older);
  if (from === 0) return null;
  return (median(recent) - from) / from;
}

export function aggregate(
  trades: NormalizedTrade[],
  asOf: Date,
  config: ReportConfig,
): ComplexUnit[] {
  const sixMonthsAgo = monthsBefore(asOf, 6);
  const threeMonthsAgo = monthsBefore(asOf, 3);
  const twelveMonthsAgo = monthsBefore(asOf, 12);

  const groups = new Map<string, NormalizedTrade[]>();
  for (const trade of trades) {
    const key = `${trade.complexKey}|${areaBucket(trade.exclusiveAreaSqm)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(trade);
    else groups.set(key, [trade]);
  }

  const units: ComplexUnit[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;

    const at = (t: NormalizedTrade) => new Date(`${t.contractDate}T00:00:00Z`);
    const recent = group.filter((t) => at(t) >= sixMonthsAgo);
    // 최근 6개월 거래가 없으면 대표 시세를 낼 근거가 없다.
    if (recent.length === 0) continue;

    const recentPrices = recent.map((t) => t.price);
    const last3m = group.filter((t) => at(t) >= threeMonthsAgo).map((t) => t.price);
    const prior3m = group
      .filter((t) => at(t) < threeMonthsAgo && at(t) >= sixMonthsAgo)
      .map((t) => t.price);
    const prior12m = group
      .filter((t) => at(t) < sixMonthsAgo && at(t) >= twelveMonthsAgo)
      .map((t) => t.price);

    units.push({
      complexKey: first.complexKey,
      complexName: first.complexName,
      regionCode: first.regionCode,
      legalDongName: first.legalDongName,
      builtYear: first.builtYear,
      areaBucket: areaBucket(first.exclusiveAreaSqm),
      medianPrice: median(recentPrices),
      tradeCount: recent.length,
      minPrice: Math.min(...recentPrices),
      maxPrice: Math.max(...recentPrices),
      changeRate3m: changeRate(last3m, prior3m),
      changeRate12m: changeRate(recentPrices, prior12m),
      lowConfidence: recent.length < config.lowConfidenceMinTrades,
    });
  }

  return units;
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 이 태스크의 새 테스트 16개가 더해진다

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 평형 버킷·중위값·변동률 집계 단계 추가"
```

---

## Task 5: `emit` — 산출물 세 파일

**Files:**
- Create: `scripts/pipeline/emit.ts`, `scripts/pipeline/emit.test.ts`

**Interfaces:**
- Consumes: `ComplexUnit` (Task 4)
- Produces:
  - `buildManifest(units, asOf, dataAsOf, rulesVersion): Manifest`
  - `buildRegions(units): RegionMeta[]`
  - `data/complexes.json`, `data/regions.json`, `data/manifest.json`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pipeline/emit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ComplexUnit } from "./aggregate";
import { buildManifest, buildRegions } from "./emit";

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
    changeRate3m: 0.02,
    changeRate12m: 0.1,
    lowConfidence: false,
    ...overrides,
  };
}

describe("buildRegions", () => {
  it("등장한 시군구를 중복 없이 모은다", () => {
    const regions = buildRegions([
      unit({ regionCode: "11680" }),
      unit({ regionCode: "11680" }),
      unit({ regionCode: "11650" }),
    ]);
    expect(regions.map((r) => r.regionCode).sort()).toEqual(["11650", "11680"]);
  });

  it("시군구별 단지 수를 센다", () => {
    const regions = buildRegions([
      unit({ regionCode: "11680", complexKey: "a" }),
      unit({ regionCode: "11680", complexKey: "b" }),
    ]);
    expect(regions[0]?.complexCount).toBe(2);
  });
});

describe("buildManifest", () => {
  const asOf = new Date("2026-08-22T03:00:00Z");

  it("생성 일시와 데이터 기준일을 담는다", () => {
    const m = buildManifest([unit()], asOf, "2026-07", "2026-03");
    expect(m.generatedAt).toBe("2026-08-22T03:00:00.000Z");
    expect(m.dataAsOf).toBe("2026-07");
    expect(m.rulesVersion).toBe("2026-03");
  });

  it("단지 수와 평형 수를 센다", () => {
    const m = buildManifest(
      [unit({ complexKey: "a", areaBucket: 84 }), unit({ complexKey: "a", areaBucket: 101 })],
      asOf,
      "2026-07",
      "2026-03",
    );
    expect(m.complexCount).toBe(1);
    expect(m.unitCount).toBe(2);
  });

  it("저신뢰 평형 수를 따로 센다", () => {
    const m = buildManifest(
      [unit({ lowConfidence: true }), unit({ lowConfidence: false })],
      asOf,
      "2026-07",
      "2026-03",
    );
    expect(m.lowConfidenceUnitCount).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run scripts/pipeline/emit.test.ts`
Expected: FAIL — `Failed to resolve import "./emit"`

- [ ] **Step 3: 구현**

`scripts/pipeline/emit.ts`:

```ts
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
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 이 태스크의 새 테스트 5개가 더해진다

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 산출물 세 파일과 매니페스트 생성 단계 추가"
```

---

## Task 6: `report` — 이상 신호

**Files:**
- Create: `scripts/pipeline/report.ts`, `scripts/pipeline/report.test.ts`

**Interfaces:**
- Consumes: `NormalizedTrade` (Task 3), `ComplexUnit` (Task 4), `ReportConfig` (Task 1), `FetchLogEntry` (Task 2)
- Produces:
  - `editDistance(a: string, b: string): number`
  - `findUnderMergeCandidates(units, config): Array<{ a: string; b: string; distance: number }>`
  - `findOverMergeSuspects(units, config): ComplexUnit[]`
  - `findSplitAreaSuspects(units, config): Array<{ complexKey: string; buckets: [number, number] }>`
  - `buildReport(units, log, config): string` — 마크다운

**설계 노트:** **정답지가 없으므로, 정답지 없이 계산 가능한 의심 신호만 뽑는다.** 리포트는 "합쳐라"가 아니라 **"확인하라"** 는 뜻이다. 자동 병합은 절대 하지 않는다 — `"우성1차"`와 `"우성2차"`는 편집거리 1이지만 실제로 다른 단지다.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pipeline/report.test.ts`:

```ts
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
    changeRate12m: null,
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
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run scripts/pipeline/report.test.ts`
Expected: FAIL — `Failed to resolve import "./report"`

- [ ] **Step 3: 구현**

`scripts/pipeline/report.ts`:

```ts
import type { ComplexUnit } from "./aggregate";
import type { FetchLogEntry } from "./fetch";
import type { ReportConfig } from "./types";

/** 이 목록의 의미를 못박는 문장. 각 절 머리에 붙인다. */
const ADVISORY =
  "이 목록은 '합쳐라'가 아니라 **'확인하라'**는 뜻이다. 파이프라인은 자동으로 병합하지 않는다.";

/** 표준 레벤슈타인 거리. 외부 의존성 없이 직접 구현한다. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i, ...Array<number>(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/** complexKey를 `지역|법정동|건축년도|정규화명`으로 가른다. */
function splitKey(key: string): { group: string; name: string } | null {
  const parts = key.split("|");
  if (parts.length !== 4) return null;
  return { group: parts.slice(0, 3).join("|"), name: parts[3] ?? "" };
}

/**
 * 과소병합 후보. 같은 `지역|법정동|건축년도` 안에서만 이름을 비교한다.
 * 전체 쌍 비교는 O(n²)이라 1.5만 개에서 감당이 안 된다.
 */
export function findUnderMergeCandidates(
  units: ComplexUnit[],
  config: ReportConfig,
): Array<{ a: string; b: string; distance: number }> {
  const byGroup = new Map<string, Set<string>>();
  for (const unit of units) {
    const split = splitKey(unit.complexKey);
    if (split === null) continue;
    const names = byGroup.get(split.group) ?? new Set<string>();
    names.add(split.name);
    byGroup.set(split.group, names);
  }

  const found: Array<{ a: string; b: string; distance: number }> = [];
  for (const [group, nameSet] of byGroup) {
    const names = [...nameSet];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        if (a === undefined || b === undefined) continue;
        const distance = editDistance(a, b);
        const prefix = a.startsWith(b) || b.startsWith(a);
        if (distance <= config.underMergeMaxEditDistance || prefix) {
          found.push({ a: `${group}|${a}`, b: `${group}|${b}`, distance });
        }
      }
    }
  }
  return found.sort((x, y) => x.distance - y.distance);
}

/**
 * 과대병합 의심. 같은 키·같은 평형인데 가격이 지나치게 벌어진 그룹.
 * 거래 건수가 적으면 우연히 벌어질 수 있으므로 하한을 둔다.
 */
export function findOverMergeSuspects(
  units: ComplexUnit[],
  config: ReportConfig,
): ComplexUnit[] {
  return units.filter(
    (u) =>
      u.tradeCount >= config.overMergeMinTradeCount &&
      u.minPrice > 0 &&
      u.maxPrice / u.minPrice >= config.overMergeMinPriceRatio,
  );
}

/**
 * 평형 분할 의심. 1㎡ 반올림 때문에 84.4와 84.6이 84·85로 갈린 경우를 잡는다.
 * 둘 다 거래가 적을 때만 의심한다 — 한쪽이 충분하면 실제로 다른 평형일 가능성이 높다.
 */
export function findSplitAreaSuspects(
  units: ComplexUnit[],
  config: ReportConfig,
): Array<{ complexKey: string; buckets: [number, number] }> {
  const byComplex = new Map<string, ComplexUnit[]>();
  for (const unit of units) {
    const list = byComplex.get(unit.complexKey) ?? [];
    list.push(unit);
    byComplex.set(unit.complexKey, list);
  }

  const found: Array<{ complexKey: string; buckets: [number, number] }> = [];
  for (const [complexKey, list] of byComplex) {
    const sorted = [...list].sort((a, b) => a.areaBucket - b.areaBucket);
    for (let i = 1; i < sorted.length; i++) {
      const lower = sorted[i - 1];
      const upper = sorted[i];
      if (lower === undefined || upper === undefined) continue;
      if (upper.areaBucket - lower.areaBucket !== 1) continue;
      if (
        lower.tradeCount < config.lowConfidenceMinTrades &&
        upper.tradeCount < config.lowConfidenceMinTrades
      ) {
        found.push({ complexKey, buckets: [lower.areaBucket, upper.areaBucket] });
      }
    }
  }
  return found;
}

function won(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function buildReport(
  units: ComplexUnit[],
  log: FetchLogEntry[],
  config: ReportConfig,
): string {
  const underMerge = findUnderMergeCandidates(units, config);
  const overMerge = findOverMergeSuspects(units, config);
  const splitArea = findSplitAreaSuspects(units, config);
  const lowConfidence = units.filter((u) => u.lowConfidence).length;
  const failed = log.filter((e) => e.status === "failed");
  const ratio = units.length === 0 ? 0 : (lowConfidence / units.length) * 100;

  const lines: string[] = [
    "# 파이프라인 이상 신호 리포트",
    "",
    "## 적용된 임계값",
    "",
    `- 과소병합 편집거리 상한: ${config.underMergeMaxEditDistance}`,
    `- 과대병합 최고÷최저 하한: ${config.overMergeMinPriceRatio}`,
    `- 과대병합 최소 거래 건수: ${config.overMergeMinTradeCount}`,
    `- 저신뢰 판정 거래 건수 미만: ${config.lowConfidenceMinTrades}`,
    "",
    "임계값은 `scripts/pipeline/report-config.json`에 있다. 이 리포트를 보고 조인다.",
    "",
    "## 요약",
    "",
    `- 평형 수: ${units.length}`,
    `- 단지 수: ${new Set(units.map((u) => u.complexKey)).size}`,
    `- 저신뢰 평형: ${lowConfidence} (${ratio.toFixed(1)}%)`,
    `- 과소병합 후보: ${underMerge.length}쌍`,
    `- 과대병합 의심: ${overMerge.length}건`,
    `- 평형 분할 의심: ${splitArea.length}건`,
    `- 수집 실패: ${failed.length}건`,
    "",
    "## 과소병합 후보",
    "",
    ADVISORY,
    "",
    "같은 법정동·같은 건축년도인데 이름이 비슷한 서로 다른 키다.",
    '주의: `"우성1차"`와 `"우성2차"`는 편집거리 1이지만 **실제로 다른 단지다.**',
    "",
  ];

  if (underMerge.length === 0) lines.push("(없음)", "");
  else {
    lines.push("| 거리 | A | B |", "|---|---|---|");
    for (const { a, b, distance } of underMerge.slice(0, 100)) {
      lines.push(`| ${distance} | ${a} | ${b} |`);
    }
    if (underMerge.length > 100) lines.push("", `…외 ${underMerge.length - 100}쌍`);
    lines.push("");
  }

  lines.push("## 과대병합 의심", "", ADVISORY, "", "같은 키·같은 평형인데 가격이 지나치게 벌어졌다. 다른 단지가 섞였을 수 있다.", "");

  if (overMerge.length === 0) lines.push("(없음)", "");
  else {
    lines.push("| 단지 | 평형 | 건수 | 최저 | 최고 | 배율 |", "|---|---|---|---|---|---|");
    for (const u of overMerge.slice(0, 50)) {
      const mult = (u.maxPrice / u.minPrice).toFixed(2);
      lines.push(
        `| ${u.complexName} (${u.legalDongName}) | ${u.areaBucket}㎡ | ${u.tradeCount} | ${won(u.minPrice)} | ${won(u.maxPrice)} | ${mult} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 평형 분할 의심", "", "1㎡ 반올림 때문에 같은 평형이 갈렸을 수 있다.", "");

  if (splitArea.length === 0) lines.push("(없음)", "");
  else {
    lines.push("| 단지 키 | 버킷 |", "|---|---|");
    for (const { complexKey, buckets } of splitArea.slice(0, 50)) {
      lines.push(`| ${complexKey} | ${buckets[0]}㎡ / ${buckets[1]}㎡ |`);
    }
    lines.push("");
  }

  lines.push("## 수집 실패", "", "`normalized.json`만으로는 알 수 없는 정보다. `fetch`가 남긴 로그에서 읽는다.", "");

  if (failed.length === 0) lines.push("(없음)", "");
  else {
    lines.push("| 시군구 | 년월 | 사유 |", "|---|---|---|");
    for (const e of failed) {
      lines.push(`| ${e.regionCode} | ${e.yearMonth} | ${e.error ?? "(사유 없음)"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 이 태스크의 새 테스트 16개가 더해진다

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 과소·과대병합과 평형 분할 의심을 잡는 리포트 추가"
```

---

## Task 7: 파이프라인 연결과 소규모 실행

**Files:**
- Create: `scripts/pipeline/run.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: `npm run pipeline` 한 줄로 도는 전체 파이프라인, 그리고 실제 데이터

- [ ] **Step 1: 연결 스크립트 작성**

`fetch`는 시간이 오래 걸리고 네트워크가 필요하므로 별도 명령으로 두고, 여기서는 나머지만 잇는다.

`asOf`는 `new Date()`를 **여기서 한 번만** 만들어 아래로 넘긴다 — 순수 함수들이 시각을 직접 읽지 않게 하기 위해서다.

`scripts/pipeline/run.ts`:

```ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aggregate } from "./aggregate";
import { DATA_DIR, RAW_DIR, loadReportConfig } from "./config";
import { emit } from "./emit";
import type { FetchLogEntry } from "./fetch";
import { normalizeAll } from "./normalize";
import { buildReport } from "./report";
import type { RawTrade } from "./types";

/** raw/의 모든 파일을 읽어 하나로 합친다. */
function loadRawTrades(): RawTrade[] {
  if (!existsSync(RAW_DIR)) {
    throw new Error(
      `${RAW_DIR}가 없습니다. 먼저 npm run pipeline:fetch 를 실행하세요.`,
    );
  }
  const trades: RawTrade[] = [];
  for (const file of readdirSync(RAW_DIR)) {
    if (!file.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(RAW_DIR, file), "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn(`${file}: 배열이 아니라 건너뜁니다`);
      continue;
    }
    trades.push(...(parsed as RawTrade[]));
  }
  return trades;
}

function loadFetchLog(): FetchLogEntry[] {
  const path = join(DATA_DIR, "fetch-log.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return Array.isArray(parsed) ? (parsed as FetchLogEntry[]) : [];
}

/** 수집된 거래 중 가장 최근 계약월. manifest의 dataAsOf가 된다. */
function latestContractMonth(trades: RawTrade[]): string {
  let latest = "";
  for (const t of trades) {
    const month = t.contractDate.slice(0, 7);
    if (month > latest) latest = month;
  }
  return latest;
}

function currentRulesVersion(): string {
  const raw = JSON.parse(
    readFileSync(join(DATA_DIR, "..", "rules", "2026-03.json"), "utf8"),
  ) as { version?: unknown };
  return typeof raw.version === "string" ? raw.version : "unknown";
}

const asOf = new Date();
const config = loadReportConfig();

const raw = loadRawTrades();
console.log(`raw 거래 ${raw.length}건`);

const normalized = normalizeAll(raw);
const units = aggregate(normalized, asOf, config);
console.log(
  `단지 ${new Set(units.map((u) => u.complexKey)).size}개 / 평형 ${units.length}개`,
);

emit(units, asOf, latestContractMonth(raw), currentRulesVersion());

const report = buildReport(units, loadFetchLog(), config);
writeFileSync(join(DATA_DIR, "report.md"), report);

console.log("완료. data/ 아래 complexes.json, regions.json, manifest.json, report.md");
```

`package.json`에 추가:

```json
    "pipeline": "tsx scripts/pipeline/run.ts"
```

- [ ] **Step 2: 실제 수집 실행**

```bash
npm run pipeline:fetch
```

3개 구 × 12개월 = 36회 호출이다. 콘솔 출력과 `data/fetch-log.json`을 확인한다.

**실패가 절반을 넘으면 STOP하고 보고한다** — 엔드포인트나 파라미터가 틀렸을 가능성이 높다.

- [ ] **Step 3: 파이프라인 실행**

```bash
npm run pipeline
```

`data/complexes.json`, `regions.json`, `manifest.json`, `report.md`가 생겼는지 확인한다.

- [ ] **Step 4: 결과를 눈으로 확인하고 보고**

`data/manifest.json`과 `data/report.md`를 읽고 **보고서에 그대로 옮긴다.** 특히:

- 단지 수, 평형 수, 저신뢰 비율
- 과소병합 후보 상위 20개 — **실제로 같은 단지로 보이는 쌍이 있는지**
- 과대병합 의심 상위 10개 — **다른 단지가 섞인 것으로 보이는지**
- 평형 분할 의심 개수
- 수집 실패 건수와 사유

이것이 이 태스크의 **실질적 산출물**이다. 숫자가 그럴듯해 보인다는 말로 대신하지 말고, 실제 단지명과 금액을 옮겨 적는다. 명백히 이상한 것이 보이면 그것도 적는다.

- [ ] **Step 5: `no-network.test.ts`에 의도를 기록**

Global Constraints의 **유일한 `src/` 예외**다. `src/no-network.test.ts` 상단 주석에 다음 취지를 덧붙인다:

> 이 스캔은 `src/`만 본다. `scripts/pipeline/`은 의도적으로 제외돼 있다 —
> 약속의 내용은 "사용자 재무정보가 브라우저를 벗어나지 않는다"이고,
> 파이프라인은 **사용자 데이터를 아예 보지 않는 빌드 타임 도구**이기 때문이다.
> 파이프라인이 `fetch`를 쓰는 것은 위반이 아니다.

**검사 로직·패턴 목록·단언은 한 글자도 바꾸지 않는다.** 주석만 추가한다.
변경 후 `npx vitest run src/no-network.test.ts`가 여전히 통과하는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: 파이프라인 연결 스크립트 추가"
```

`data/`는 gitignore 대상이므로 산출물은 커밋되지 않는다. 정상이다.

---

## 완료 기준

- [ ] `npm test`가 전부 통과한다
- [ ] `npm run typecheck`에 오류가 없다
- [ ] `src/`가 이 계획에서 한 줄도 바뀌지 않았다 (`git diff`로 확인)
- [ ] API 키가 저장소·로그·에러 메시지 어디에도 없다
- [ ] `data/report.md`가 실제 데이터로 생성되고, 사람이 읽을 만하다
- [ ] 지역 범위를 넓히는 데 코드 수정이 필요 없다 (`regions.json`만 바꾸면 된다)

## 남는 숙제

- **수도권 전체로 확장** — `regions.json`에 66개 시군구를 넣고 다시 돌린다. 리포트를 다시 확인한다
- **정규화 규칙 조이기** — 첫 리포트의 과소병합 후보를 보고 판단한다. 자동 병합은 여전히 하지 않는다
- **랭킹과 화면 3~5번** — 이 데이터를 소비하는 쪽. 별도 계획
- **번들 vs 런타임 로딩** — `complexes.json`을 `import`할지 받아올지. 후자면 `no-network.test.ts`에 문서화된 예외가 필요하다
