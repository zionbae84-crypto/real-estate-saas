# 재무 엔진 (Finance Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자의 현금·소득·부채와 2026년 대출 규제 룰셋을 입력받아, 실구매 가능 가격과 상환부담률을 계산하는 순수 함수 라이브러리를 만든다.

**Architecture:** 부작용 없는 순수 TypeScript 함수 모듈. 규제 수치는 코드가 아니라 버전이 찍힌 JSON 룰셋 파일에서 읽는다. 브라우저·Node 양쪽에서 동작하며 네트워크·파일시스템 의존이 없다(룰셋은 주입받는다). 상위 함수는 하위 함수만 조합하고, 순환 참조 문제(대출한도↔집값)는 이분 탐색으로 해결한다.

**Tech Stack:** TypeScript 5.x, Node 20+, Vitest, npm

## Global Constraints

- 모든 금액은 **원 단위 정수**로 다룬다. 소수점 금액을 반환하지 않는다 (최종 반환 시 `Math.floor` 또는 `Math.round` 명시).
- 모든 함수는 **순수 함수**다. `fetch`, `fs`, `Date.now()`, 전역 변수 접근을 금지한다. 현재 날짜가 필요하면 인자로 받는다.
- 규제 수치(금리 가산, LTV, 캡, 임계값, 세율, 요율)를 **코드에 하드코딩하지 않는다.** 전부 `Rules` 객체에서 읽는다.
- `calcMaxLoan`의 반환값은 **어느 한도에 걸렸는지(`binding`)를 반드시 포함**한다. 이것이 제품의 핵심 정보다.
- 파일당 하나의 책임. 한 파일이 200줄을 넘으면 분리를 검토한다.
- 테스트는 함수와 같은 디렉토리에 `*.test.ts`로 둔다.
- 커밋 메시지는 Conventional Commits (`feat:`, `test:`, `fix:`, `chore:`).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `rules/2026-03.json` | 2026년 3월 기준 규제 룰셋 데이터 |
| `src/lib/finance/types.ts` | 모든 공용 타입 정의 |
| `src/lib/finance/amortization.ts` | 원리금균등상환 계산 (최하위 기초) |
| `src/lib/finance/rules.ts` | 룰셋 스키마 검증 및 로딩 |
| `src/lib/finance/loan-limit.ts` | `calcMaxLoan` — LTV/DSR/캡 중 최솟값 |
| `src/lib/finance/acquisition-cost.ts` | `calcAcquisitionCosts` — 취득세·중개보수 등 |
| `src/lib/finance/affordable-price.ts` | `calcAffordablePrice` — 이분 탐색 |
| `src/lib/finance/safety.ts` | `calcSafetyScore` — 상환부담률·신호등 |
| `src/lib/finance/policy-loans.ts` | `matchPolicyLoans` — 정책대출 자격 매칭 |
| `src/lib/finance/available-cash.ts` | `calcAvailableCash` — 갈아타기 순자산 합산 |
| `src/lib/finance/index.ts` | 공개 API 재수출 |

**의존 방향은 한 방향이다:**
`amortization` → `loan-limit` → `affordable-price` → (최상위)
`acquisition-cost`, `policy-loans`, `available-cash`는 서로 독립이며 `affordable-price`가 조합한다.

---

## Task 1: 프로젝트 셋업 + 원리금균등상환 계산

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/lib/finance/amortization.ts`
- Test: `src/lib/finance/amortization.test.ts`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces:
  - `monthlyPayment(principal: number, annualRate: number, months: number): number`
  - `maxPrincipal(payment: number, annualRate: number, months: number): number`

- [ ] **Step 1: 프로젝트 초기화**

```bash
cd "/Users/yongsmac/Documents/부동산 saas"
git init
npm init -y
npm install -D typescript vitest @types/node
```

- [ ] **Step 2: 설정 파일 작성**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "scripts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
```

`.gitignore`:

```
node_modules/
data/
dist/
.DS_Store
```

`package.json`의 `scripts`를 다음으로 교체하고 `"type": "module"`을 추가:

```json
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/finance/amortization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maxPrincipal, monthlyPayment } from "./amortization";

describe("monthlyPayment", () => {
  it("무이자면 원금을 개월수로 나눈 값이다", () => {
    expect(monthlyPayment(120_000_000, 0, 120)).toBe(1_000_000);
  });

  it("원금이 0이면 상환액도 0이다", () => {
    expect(monthlyPayment(0, 0.04, 360)).toBe(0);
  });

  it("3억 · 연 4% · 30년이면 월 143만원대다", () => {
    const payment = monthlyPayment(300_000_000, 0.04, 360);
    expect(payment).toBeGreaterThan(1_430_000);
    expect(payment).toBeLessThan(1_435_000);
  });

  it("금리가 높을수록 상환액이 커진다", () => {
    const low = monthlyPayment(300_000_000, 0.03, 360);
    const high = monthlyPayment(300_000_000, 0.05, 360);
    expect(high).toBeGreaterThan(low);
  });

  it("개월수가 0 이하면 예외를 던진다", () => {
    expect(() => monthlyPayment(100_000_000, 0.04, 0)).toThrow(RangeError);
  });
});

describe("maxPrincipal", () => {
  it("monthlyPayment의 역함수다", () => {
    const principal = 450_000_000;
    const payment = monthlyPayment(principal, 0.042, 360);
    expect(maxPrincipal(payment, 0.042, 360)).toBeCloseTo(principal, 0);
  });

  it("무이자면 상환액 × 개월수다", () => {
    expect(maxPrincipal(1_000_000, 0, 120)).toBe(120_000_000);
  });

  it("상환 여력이 0이면 대출 가능액도 0이다", () => {
    expect(maxPrincipal(0, 0.04, 360)).toBe(0);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./amortization"`

- [ ] **Step 5: 최소 구현 작성**

`src/lib/finance/amortization.ts`:

```ts
/**
 * 원리금균등상환 방식의 월 상환액.
 *
 * @param principal 대출 원금(원)
 * @param annualRate 연이율 (0.042 = 4.2%)
 * @param months 상환 개월수
 */
export function monthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0) {
    throw new RangeError(`months는 1 이상이어야 합니다: ${months}`);
  }
  if (principal <= 0) return 0;
  if (annualRate === 0) return principal / months;

  const r = annualRate / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * 월 상환 여력으로 빌릴 수 있는 최대 원금. monthlyPayment의 역함수.
 *
 * @param payment 월 상환 여력(원)
 * @param annualRate 연이율 (0.042 = 4.2%)
 * @param months 상환 개월수
 */
export function maxPrincipal(
  payment: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0) {
    throw new RangeError(`months는 1 이상이어야 합니다: ${months}`);
  }
  if (payment <= 0) return 0;
  if (annualRate === 0) return payment * months;

  const r = annualRate / 12;
  return (payment * (1 - Math.pow(1 + r, -months))) / r;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 8 tests passed

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 원리금균등상환 계산 함수 추가"
```

---

## Task 2: 타입 정의 + 규제 룰셋 파일 + 검증

**Files:**
- Create: `src/lib/finance/types.ts`
- Create: `rules/2026-03.json`
- Create: `src/lib/finance/rules.ts`
- Test: `src/lib/finance/rules.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - 타입: `HouseholdStatus`, `BuyerProfile`, `ExistingHome`, `Rules`, `PolicyLoanRule`, `LoanLimit`, `BindingConstraint`, `CostBreakdown`, `SafetyScore`, `SafetyLevel`
  - `parseRules(raw: unknown): Rules` — 스키마 검증 후 `Rules` 반환, 실패 시 `throw new Error`

- [ ] **Step 1: 타입 정의 작성**

`src/lib/finance/types.ts`:

```ts
/** 주택 보유 상황 */
export type HouseholdStatus = "무주택" | "갈아타기";

/** 갈아타기 시 기존 주택 정보 */
export interface ExistingHome {
  /** 예상 매도가(원) */
  expectedSalePrice: number;
  /** 매도 시 상환해야 할 기존 대출 잔액(원) */
  remainingLoan: number;
  /** 사용자가 직접 입력한 예상 양도세(원). 미입력이면 undefined */
  capitalGainsTax?: number;
}

/** 구매자 재무 프로필 */
export interface BuyerProfile {
  status: HouseholdStatus;
  /** 주택 구매에 투입 가능한 순수 보유 현금(원) */
  cash: number;
  /** 연 소득(원, 세전) */
  annualIncome: number;
  /** 기존 부채의 연간 원리금 상환액 합계(원) */
  existingDebtAnnualPayment: number;
  /** 생애최초 주택 구입 여부 */
  isFirstTimeBuyer: boolean;
  /** 전용면적(㎡). 농특세 부과 기준(85㎡ 초과) 판정에 쓰인다 */
  exclusiveAreaSqm: number;
  /** 갈아타기일 때만 존재 */
  existingHome?: ExistingHome;
}

/** 대출 한도를 결정지은 제약 */
export type BindingConstraint = "LTV" | "DSR" | "CAP" | "POLICY";

/** 대출 한도 계산 결과 */
export interface LoanLimit {
  /** 최종 대출 가능액(원) */
  amount: number;
  /** 어느 제약에 걸려 이 금액이 되었는가 */
  binding: BindingConstraint;
  /** 각 제약별 한도(원). 사용자에게 근거를 보여줄 때 쓴다 */
  breakdown: Record<BindingConstraint, number>;
}

/** 취득 부대비용 내역 */
export interface CostBreakdown {
  /** 취득세 + 지방교육세 + 농어촌특별세 합계(원) */
  acquisitionTax: number;
  /** 중개보수(원) */
  brokerageFee: number;
  /** 법무사 비용(원) */
  legalFee: number;
  /** 이사 비용(원) */
  movingCost: number;
  /** 위 항목의 합계(원) */
  total: number;
}

/** 재무 안전성 등급 */
export type SafetyLevel = "safe" | "caution" | "danger";

/** 상환 부담 평가 결과 */
export interface SafetyScore {
  /** 기본 시나리오 월 상환액(원) */
  monthlyPayment: number;
  /** 기본 시나리오 상환부담률 (0.28 = 28%) */
  burdenRatio: number;
  /** 금리 스트레스 시나리오 월 상환액(원) */
  stressedMonthlyPayment: number;
  /** 금리 스트레스 시나리오 상환부담률 */
  stressedBurdenRatio: number;
  level: SafetyLevel;
}

/** 정책대출 상품 정의 */
export interface PolicyLoanRule {
  id: string;
  /** 조건 키-값. 엔진이 일반적으로 평가한다 */
  eligibility: {
    requiresNoHome?: boolean;
    requiresFirstTimeBuyer?: boolean;
    maxAnnualIncome?: number;
    maxHousePrice?: number;
    maxAreaSqm?: number;
  };
  /** 최대 대출액(원) */
  maxAmount: number;
  /** 연이율 */
  rate: number;
}

/** 버전이 찍힌 규제 룰셋 */
export interface Rules {
  version: string;
  effectiveFrom: string;
  /** 대출 심사에 쓰는 기준 금리(연이율) */
  baseRate: number;
  /** 상환 개월수 (30년 = 360) */
  loanTermMonths: number;
  stressDSR: {
    stage: number;
    /** 스트레스 가산금리 (0.015 = 1.5%p) */
    surcharge: number;
  };
  /** 안전성 평가용 금리 스트레스 폭 (0.02 = +2%p) */
  safetyStressSurcharge: number;
  ltv: {
    default: number;
    firstTimeBuyer: number;
  };
  /** 수도권 주택구입 목적 주담대 절대 상한(원) */
  absoluteCap: number;
  /** DSR 한도 (0.4 = 40%) */
  dsrLimit: number;
  safetyThreshold: {
    safe: number;
    caution: number;
    /** 스트레스 시나리오에서 이 값을 넘으면 무조건 danger */
    stressedDanger: number;
  };
  acquisitionTax: {
    /** 6억 이하 구간 세율 */
    lowRate: number;
    /** 9억 초과 구간 세율 */
    highRate: number;
    lowerBound: number;
    upperBound: number;
    /** 지방교육세 = 취득세율 × 이 비율 */
    localEducationTaxRatio: number;
    /** 전용 85㎡ 초과 시 농어촌특별세율 */
    ruralTaxRate: number;
    ruralTaxAreaThresholdSqm: number;
    /** 생애최초 감면 한도(원) */
    firstTimeBuyerReliefCap: number;
    /** 생애최초 감면이 적용되는 주택가격 상한(원) */
    firstTimeBuyerReliefPriceCap: number;
  };
  /** 중개보수 구간. upTo 오름차순으로 정렬되어 있어야 한다 */
  brokerageFee: Array<{
    /** 이 금액 미만까지 적용. 마지막 구간은 null(무한대) */
    upTo: number | null;
    rate: number;
    /** 상한액(원). 없으면 null */
    cap: number | null;
  }>;
  /** 법무사 비용 정액 추정(원) */
  legalFee: number;
  /** 이사 비용 정액 추정(원) */
  movingCost: number;
  policyLoans: PolicyLoanRule[];
}
```

- [ ] **Step 2: 룰셋 데이터 파일 작성**

`rules/2026-03.json`:

```json
{
  "version": "2026-03",
  "effectiveFrom": "2026-03-01",
  "baseRate": 0.042,
  "loanTermMonths": 360,
  "stressDSR": { "stage": 3, "surcharge": 0.015 },
  "safetyStressSurcharge": 0.02,
  "ltv": { "default": 0.7, "firstTimeBuyer": 0.8 },
  "absoluteCap": 600000000,
  "dsrLimit": 0.4,
  "safetyThreshold": { "safe": 0.25, "caution": 0.35, "stressedDanger": 0.4 },
  "acquisitionTax": {
    "lowRate": 0.01,
    "highRate": 0.03,
    "lowerBound": 600000000,
    "upperBound": 900000000,
    "localEducationTaxRatio": 0.1,
    "ruralTaxRate": 0.002,
    "ruralTaxAreaThresholdSqm": 85,
    "firstTimeBuyerReliefCap": 2000000,
    "firstTimeBuyerReliefPriceCap": 1200000000
  },
  "brokerageFee": [
    { "upTo": 50000000, "rate": 0.006, "cap": 250000 },
    { "upTo": 200000000, "rate": 0.005, "cap": 800000 },
    { "upTo": 900000000, "rate": 0.004, "cap": null },
    { "upTo": 1200000000, "rate": 0.005, "cap": null },
    { "upTo": 1500000000, "rate": 0.006, "cap": null },
    { "upTo": null, "rate": 0.007, "cap": null }
  ],
  "legalFee": 600000,
  "movingCost": 1500000,
  "policyLoans": [
    {
      "id": "디딤돌",
      "eligibility": {
        "requiresNoHome": true,
        "maxAnnualIncome": 60000000,
        "maxHousePrice": 500000000,
        "maxAreaSqm": 85
      },
      "maxAmount": 250000000,
      "rate": 0.032
    },
    {
      "id": "보금자리론",
      "eligibility": {
        "requiresNoHome": true,
        "maxAnnualIncome": 70000000,
        "maxHousePrice": 600000000
      },
      "maxAmount": 360000000,
      "rate": 0.042
    }
  ]
}
```

> **주의:** 위 수치는 스키마를 확정하기 위한 것이다. 구현 착수 시 각 상품의 **공식 고시 기준으로 반드시 교차 검증**하고, 틀린 값은 이 파일만 고친다. 코드는 수정하지 않는다.

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/finance/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";

describe("parseRules", () => {
  it("실제 룰셋 파일을 통과시킨다", () => {
    const rules = parseRules(rawRules);
    expect(rules.version).toBe("2026-03");
    expect(rules.absoluteCap).toBe(600_000_000);
  });

  it("필수 필드가 없으면 어느 필드인지 알려주며 실패한다", () => {
    const broken = { ...rawRules, dsrLimit: undefined };
    expect(() => parseRules(broken)).toThrow(/dsrLimit/);
  });

  it("객체가 아니면 실패한다", () => {
    expect(() => parseRules(null)).toThrow(/객체/);
  });

  it("중개보수 구간이 오름차순이 아니면 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: [
        { upTo: 200000000, rate: 0.005, cap: null },
        { upTo: 50000000, rate: 0.006, cap: null },
        { upTo: null, rate: 0.007, cap: null },
      ],
    };
    expect(() => parseRules(broken)).toThrow(/오름차순/);
  });

  it("중개보수 마지막 구간의 upTo가 null이 아니면 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: [{ upTo: 50000000, rate: 0.006, cap: null }],
    };
    expect(() => parseRules(broken)).toThrow(/마지막 구간/);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./rules"`

- [ ] **Step 5: 최소 구현 작성**

`src/lib/finance/rules.ts`:

```ts
import type { Rules } from "./types";

const REQUIRED_NUMBER_FIELDS = [
  "baseRate",
  "loanTermMonths",
  "safetyStressSurcharge",
  "absoluteCap",
  "dsrLimit",
  "legalFee",
  "movingCost",
] as const;

/**
 * 룰셋 JSON을 검증해 Rules로 변환한다.
 * 규제 파일은 사람이 손으로 고치는 데이터이므로, 틀렸을 때 어디가 틀렸는지 말해준다.
 */
export function parseRules(raw: unknown): Rules {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("룰셋은 객체여야 합니다");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.version !== "string") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: version");
  }
  if (typeof r.effectiveFrom !== "string") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: effectiveFrom");
  }
  for (const field of REQUIRED_NUMBER_FIELDS) {
    if (typeof r[field] !== "number") {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${field}`);
    }
  }
  for (const field of [
    "stressDSR",
    "ltv",
    "safetyThreshold",
    "acquisitionTax",
  ]) {
    if (typeof r[field] !== "object" || r[field] === null) {
      throw new Error(`룰셋 필드 누락 또는 타입 오류: ${field}`);
    }
  }
  if (!Array.isArray(r.policyLoans)) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: policyLoans");
  }
  if (!Array.isArray(r.brokerageFee) || r.brokerageFee.length === 0) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: brokerageFee");
  }

  validateBrokerageBrackets(r.brokerageFee);

  return raw as Rules;
}

function validateBrokerageBrackets(brackets: unknown[]): void {
  const last = brackets[brackets.length - 1] as { upTo: unknown };
  if (last.upTo !== null) {
    throw new Error("중개보수 마지막 구간의 upTo는 null이어야 합니다");
  }

  let previous = 0;
  for (const bracket of brackets.slice(0, -1)) {
    const { upTo } = bracket as { upTo: unknown };
    if (typeof upTo !== "number") {
      throw new Error("중개보수 구간의 upTo는 숫자 또는 null이어야 합니다");
    }
    if (upTo <= previous) {
      throw new Error("중개보수 구간은 upTo 오름차순이어야 합니다");
    }
    previous = upTo;
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 13 tests passed

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 재무 엔진 타입 정의와 규제 룰셋 검증 추가"
```

---

## Task 3: 대출 한도 계산 (`calcMaxLoan`)

**Files:**
- Create: `src/lib/finance/loan-limit.ts`
- Test: `src/lib/finance/loan-limit.test.ts`

**Interfaces:**
- Consumes: `maxPrincipal` (Task 1), `BuyerProfile`/`Rules`/`LoanLimit`/`BindingConstraint` (Task 2)
- Produces: `calcMaxLoan(profile: BuyerProfile, rules: Rules, price: number, policyLimit?: number): LoanLimit`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/loan-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("calcMaxLoan", () => {
  it("고소득·저가주택이면 LTV에 걸린다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000);
    expect(result.binding).toBe("LTV");
    expect(result.amount).toBe(210_000_000);
  });

  it("생애최초는 LTV 80%가 적용된다", () => {
    const result = calcMaxLoan(
      profile({ isFirstTimeBuyer: true }),
      rules,
      300_000_000,
    );
    expect(result.amount).toBe(240_000_000);
  });

  it("소득이 낮으면 DSR에 걸린다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      1_000_000_000,
    );
    expect(result.binding).toBe("DSR");
  });

  it("고가주택·고소득이면 6억 절대캡에 걸린다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 300_000_000 }),
      rules,
      1_500_000_000,
    );
    expect(result.binding).toBe("CAP");
    expect(result.amount).toBe(600_000_000);
  });

  it("정책대출 한도가 가장 작으면 POLICY에 걸린다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000, 100_000_000);
    expect(result.binding).toBe("POLICY");
    expect(result.amount).toBe(100_000_000);
  });

  it("DSR 계산에 스트레스 가산금리를 적용한다", () => {
    const stressed = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      rules,
      1_000_000_000,
    );
    const noStress = calcMaxLoan(
      profile({ annualIncome: 40_000_000 }),
      { ...rules, stressDSR: { stage: 0, surcharge: 0 } },
      1_000_000_000,
    );
    expect(stressed.amount).toBeLessThan(noStress.amount);
  });

  it("기존 부채가 DSR 여력을 잠식한다", () => {
    const clean = calcMaxLoan(
      profile({ annualIncome: 50_000_000 }),
      rules,
      1_000_000_000,
    );
    const indebted = calcMaxLoan(
      profile({ annualIncome: 50_000_000, existingDebtAnnualPayment: 10_000_000 }),
      rules,
      1_000_000_000,
    );
    expect(indebted.amount).toBeLessThan(clean.amount);
  });

  it("기존 부채가 소득 한도를 이미 넘으면 대출이 0이다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 50_000_000, existingDebtAnnualPayment: 30_000_000 }),
      rules,
      500_000_000,
    );
    expect(result.amount).toBe(0);
    expect(result.binding).toBe("DSR");
  });

  it("모든 제약의 한도를 breakdown에 담는다", () => {
    const result = calcMaxLoan(profile(), rules, 300_000_000);
    expect(Object.keys(result.breakdown).sort()).toEqual([
      "CAP",
      "DSR",
      "LTV",
      "POLICY",
    ]);
  });

  it("반환 금액은 정수다", () => {
    const result = calcMaxLoan(
      profile({ annualIncome: 63_000_000 }),
      rules,
      777_000_000,
    );
    expect(Number.isInteger(result.amount)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- loan-limit`
Expected: FAIL — `Failed to resolve import "./loan-limit"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/finance/loan-limit.ts`:

```ts
import { maxPrincipal } from "./amortization";
import type { BindingConstraint, BuyerProfile, LoanLimit, Rules } from "./types";

/**
 * 주어진 매매가에 대해 받을 수 있는 최대 대출액을 구한다.
 * LTV · DSR · 지역 절대캡 · 정책대출 한도 중 가장 작은 값이 실제 한도가 되며,
 * 어느 제약에 걸렸는지를 함께 반환한다.
 *
 * @param policyLimit 정책대출 한도(원). 해당 없으면 생략한다.
 */
export function calcMaxLoan(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
  policyLimit = Number.POSITIVE_INFINITY,
): LoanLimit {
  const breakdown: Record<BindingConstraint, number> = {
    LTV: calcLtvLimit(profile, rules, price),
    DSR: calcDsrLimit(profile, rules),
    CAP: rules.absoluteCap,
    POLICY: policyLimit,
  };

  let binding: BindingConstraint = "LTV";
  for (const key of ["LTV", "DSR", "CAP", "POLICY"] as const) {
    if (breakdown[key] < breakdown[binding]) binding = key;
  }

  return {
    amount: Math.floor(breakdown[binding]),
    binding,
    breakdown,
  };
}

function calcLtvLimit(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): number {
  const rate = profile.isFirstTimeBuyer
    ? rules.ltv.firstTimeBuyer
    : rules.ltv.default;
  return price * rate;
}

function calcDsrLimit(profile: BuyerProfile, rules: Rules): number {
  const allowedAnnualPayment = profile.annualIncome * rules.dsrLimit;
  const availableAnnualPayment =
    allowedAnnualPayment - profile.existingDebtAnnualPayment;
  if (availableAnnualPayment <= 0) return 0;

  const stressedRate = rules.baseRate + rules.stressDSR.surcharge;
  return maxPrincipal(
    availableAnnualPayment / 12,
    stressedRate,
    rules.loanTermMonths,
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 23 tests passed

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: LTV·DSR·절대캡을 반영한 대출한도 계산 추가"
```

---

## Task 4: 취득 부대비용 계산 (`calcAcquisitionCosts`)

**Files:**
- Create: `src/lib/finance/acquisition-cost.ts`
- Test: `src/lib/finance/acquisition-cost.test.ts`

**Interfaces:**
- Consumes: `BuyerProfile`/`Rules`/`CostBreakdown` (Task 2)
- Produces: `calcAcquisitionCosts(price: number, profile: BuyerProfile, rules: Rules): CostBreakdown`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/acquisition-cost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("calcAcquisitionCosts", () => {
  it("6억 이하 · 85㎡ 이하면 취득세가 1.1%다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      500_000_000,
      profile(),
      rules,
    );
    expect(acquisitionTax).toBe(5_500_000);
  });

  it("85㎡ 초과면 농특세 0.2%가 더 붙는다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      500_000_000,
      profile({ exclusiveAreaSqm: 101 }),
      rules,
    );
    expect(acquisitionTax).toBe(6_500_000);
  });

  it("9억 초과면 취득세가 3.3%다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      1_000_000_000,
      profile(),
      rules,
    );
    expect(acquisitionTax).toBe(33_000_000);
  });

  it("6억~9억 구간은 누진 세율이라 6억일 때 1%, 9억일 때 3%로 이어진다", () => {
    const at6 = calcAcquisitionCosts(600_000_000, profile(), rules);
    const at9 = calcAcquisitionCosts(900_000_000, profile(), rules);
    expect(at6.acquisitionTax).toBe(6_600_000);
    expect(at9.acquisitionTax).toBe(29_700_000);
  });

  it("6억~9억 구간의 세율은 가격에 따라 단조 증가한다", () => {
    const prices = [600_000_000, 700_000_000, 800_000_000, 900_000_000];
    const taxes = prices.map(
      (p) => calcAcquisitionCosts(p, profile(), rules).acquisitionTax,
    );
    for (let i = 1; i < taxes.length; i++) {
      expect(taxes[i]!).toBeGreaterThan(taxes[i - 1]!);
    }
  });

  it("생애최초는 취득세를 감면 한도만큼 깎아준다", () => {
    const normal = calcAcquisitionCosts(500_000_000, profile(), rules);
    const first = calcAcquisitionCosts(
      500_000_000,
      profile({ isFirstTimeBuyer: true }),
      rules,
    );
    expect(normal.acquisitionTax - first.acquisitionTax).toBe(2_000_000);
  });

  it("생애최초 감면이 세액보다 크면 0으로 막는다", () => {
    const { acquisitionTax } = calcAcquisitionCosts(
      100_000_000,
      profile({ isFirstTimeBuyer: true }),
      rules,
    );
    expect(acquisitionTax).toBe(0);
  });

  it("중개보수는 구간 요율을 적용한다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      500_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(2_000_000);
  });

  it("중개보수 상한이 있는 구간은 상한을 넘지 않는다", () => {
    const { brokerageFee } = calcAcquisitionCosts(
      150_000_000,
      profile(),
      rules,
    );
    expect(brokerageFee).toBe(750_000);
  });

  it("total은 모든 항목의 합이다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.total).toBe(
      costs.acquisitionTax +
        costs.brokerageFee +
        costs.legalFee +
        costs.movingCost,
    );
  });

  it("모든 금액은 정수다", () => {
    const costs = calcAcquisitionCosts(777_777_777, profile(), rules);
    for (const value of Object.values(costs)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- acquisition-cost`
Expected: FAIL — `Failed to resolve import "./acquisition-cost"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/finance/acquisition-cost.ts`:

```ts
import type { BuyerProfile, CostBreakdown, Rules } from "./types";

/**
 * 주택 취득에 드는 부대비용을 계산한다.
 * 취득세는 6억~9억 구간에서 누진 세율이 적용된다.
 */
export function calcAcquisitionCosts(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): CostBreakdown {
  const acquisitionTax = calcAcquisitionTax(price, profile, rules);
  const brokerageFee = calcBrokerageFee(price, rules);
  const { legalFee, movingCost } = rules;

  return {
    acquisitionTax,
    brokerageFee,
    legalFee,
    movingCost,
    total: acquisitionTax + brokerageFee + legalFee + movingCost,
  };
}

function calcAcquisitionTax(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const t = rules.acquisitionTax;
  const baseRate = acquisitionTaxRate(price, rules);

  const localEducationTax = baseRate * t.localEducationTaxRatio;
  const ruralTax =
    profile.exclusiveAreaSqm > t.ruralTaxAreaThresholdSqm ? t.ruralTaxRate : 0;

  const total = price * (baseRate + localEducationTax + ruralTax);
  const relief =
    profile.isFirstTimeBuyer && price <= t.firstTimeBuyerReliefPriceCap
      ? t.firstTimeBuyerReliefCap
      : 0;

  return Math.max(0, Math.floor(total - relief));
}

/**
 * 취득세 기본 세율. 6억 이하 1%, 9억 초과 3%,
 * 그 사이는 두 점을 잇는 직선으로 누진한다.
 */
function acquisitionTaxRate(price: number, rules: Rules): number {
  const t = rules.acquisitionTax;
  if (price <= t.lowerBound) return t.lowRate;
  if (price > t.upperBound) return t.highRate;

  const progress = (price - t.lowerBound) / (t.upperBound - t.lowerBound);
  return t.lowRate + (t.highRate - t.lowRate) * progress;
}

function calcBrokerageFee(price: number, rules: Rules): number {
  const bracket = rules.brokerageFee.find(
    (b) => b.upTo === null || price < b.upTo,
  );
  if (!bracket) {
    throw new Error(`중개보수 구간을 찾을 수 없습니다: ${price}`);
  }

  const fee = price * bracket.rate;
  return Math.floor(bracket.cap === null ? fee : Math.min(fee, bracket.cap));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 34 tests passed

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 취득세·중개보수 등 취득 부대비용 계산 추가"
```

---

## Task 5: 정책대출 매칭 (`matchPolicyLoans`)

**Files:**
- Create: `src/lib/finance/policy-loans.ts`
- Test: `src/lib/finance/policy-loans.test.ts`

**Interfaces:**
- Consumes: `BuyerProfile`/`Rules`/`PolicyLoanRule` (Task 2)
- Produces: `matchPolicyLoans(profile: BuyerProfile, rules: Rules, price: number): PolicyLoanRule[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/policy-loans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 100_000_000,
    annualIncome: 50_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("matchPolicyLoans", () => {
  it("모든 조건을 만족하면 해당 상품이 매칭된다", () => {
    const matched = matchPolicyLoans(profile(), rules, 400_000_000);
    expect(matched.map((m) => m.id)).toContain("디딤돌");
  });

  it("소득 상한을 넘으면 제외된다", () => {
    const matched = matchPolicyLoans(
      profile({ annualIncome: 65_000_000 }),
      rules,
      400_000_000,
    );
    expect(matched.map((m) => m.id)).not.toContain("디딤돌");
  });

  it("주택가격 상한을 넘으면 제외된다", () => {
    const matched = matchPolicyLoans(profile(), rules, 550_000_000);
    expect(matched.map((m) => m.id)).not.toContain("디딤돌");
  });

  it("면적 상한을 넘으면 제외된다", () => {
    const matched = matchPolicyLoans(
      profile({ exclusiveAreaSqm: 101 }),
      rules,
      400_000_000,
    );
    expect(matched.map((m) => m.id)).not.toContain("디딤돌");
  });

  it("갈아타기는 무주택 요건 상품에서 제외된다", () => {
    const matched = matchPolicyLoans(
      profile({ status: "갈아타기" }),
      rules,
      400_000_000,
    );
    expect(matched).toHaveLength(0);
  });

  it("조건이 겹치면 여러 상품이 함께 매칭된다", () => {
    const matched = matchPolicyLoans(profile(), rules, 450_000_000);
    expect(matched.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- policy-loans`
Expected: FAIL — `Failed to resolve import "./policy-loans"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/finance/policy-loans.ts`:

```ts
import type { BuyerProfile, PolicyLoanRule, Rules } from "./types";

/**
 * 프로필과 매매가를 기준으로 자격이 되는 정책대출 상품을 모두 반환한다.
 * 자격 조건은 룰셋의 eligibility 키를 일반적으로 평가하므로,
 * 새 상품 추가는 룰셋 파일 수정만으로 끝난다.
 */
export function matchPolicyLoans(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): PolicyLoanRule[] {
  return rules.policyLoans.filter((loan) =>
    isEligible(loan, profile, price),
  );
}

function isEligible(
  loan: PolicyLoanRule,
  profile: BuyerProfile,
  price: number,
): boolean {
  const e = loan.eligibility;

  if (e.requiresNoHome === true && profile.status !== "무주택") return false;
  if (e.requiresFirstTimeBuyer === true && !profile.isFirstTimeBuyer) {
    return false;
  }
  if (e.maxAnnualIncome !== undefined && profile.annualIncome > e.maxAnnualIncome) {
    return false;
  }
  if (e.maxHousePrice !== undefined && price > e.maxHousePrice) return false;
  if (e.maxAreaSqm !== undefined && profile.exclusiveAreaSqm > e.maxAreaSqm) {
    return false;
  }

  return true;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 40 tests passed

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 정책대출 자격 매칭 추가"
```

---

## Task 6: 가용현금 계산 (`calcAvailableCash`)

**Files:**
- Create: `src/lib/finance/available-cash.ts`
- Test: `src/lib/finance/available-cash.test.ts`

**Interfaces:**
- Consumes: `BuyerProfile` (Task 2)
- Produces:
  - `calcAvailableCash(profile: BuyerProfile): AvailableCash`
  - `interface AvailableCash { amount: number; warnings: string[] }` — `available-cash.ts`에서 export

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/available-cash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcAvailableCash } from "./available-cash";
import type { BuyerProfile } from "./types";

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("calcAvailableCash", () => {
  it("무주택이면 보유 현금이 그대로 가용현금이다", () => {
    const result = calcAvailableCash(profile());
    expect(result.amount).toBe(200_000_000);
    expect(result.warnings).toHaveLength(0);
  });

  it("갈아타기면 기존 주택 순자산이 더해진다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      }),
    );
    expect(result.amount).toBe(430_000_000);
  });

  it("양도세 미입력이면 경고를 남긴다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
        },
      }),
    );
    expect(result.amount).toBe(450_000_000);
    expect(result.warnings).toContain(
      "양도세가 반영되지 않았습니다. 실제 가용 자금은 이보다 적을 수 있습니다.",
    );
  });

  it("기존 대출이 매도가보다 크면 순자산이 음수가 되어 가용현금을 깎는다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 200_000_000,
        existingHome: {
          expectedSalePrice: 300_000_000,
          remainingLoan: 400_000_000,
          capitalGainsTax: 0,
        },
      }),
    );
    expect(result.amount).toBe(100_000_000);
  });

  it("가용현금은 음수가 되지 않는다", () => {
    const result = calcAvailableCash(
      profile({
        status: "갈아타기",
        cash: 10_000_000,
        existingHome: {
          expectedSalePrice: 300_000_000,
          remainingLoan: 500_000_000,
          capitalGainsTax: 0,
        },
      }),
    );
    expect(result.amount).toBe(0);
  });

  it("갈아타기인데 기존 주택 정보가 없으면 경고를 남긴다", () => {
    const result = calcAvailableCash(profile({ status: "갈아타기" }));
    expect(result.amount).toBe(200_000_000);
    expect(result.warnings).toContain(
      "기존 주택 정보가 없어 매도 대금이 반영되지 않았습니다.",
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- available-cash`
Expected: FAIL — `Failed to resolve import "./available-cash"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/finance/available-cash.ts`:

```ts
import type { BuyerProfile } from "./types";

export interface AvailableCash {
  /** 주택 구매에 투입 가능한 총 현금(원). 음수가 되지 않는다 */
  amount: number;
  /** 계산에서 빠진 항목에 대한 사용자 경고 */
  warnings: string[];
}

/**
 * 주택 구매에 실제로 투입 가능한 현금을 구한다.
 * 갈아타기는 기존 주택 순자산이 합산된다.
 *
 * 양도세는 보유·거주 기간, 조정지역, 일시적 2주택 등 변수가 과다해
 * 자동 계산하지 않는다. 사용자가 입력하지 않으면 경고로 알린다.
 */
export function calcAvailableCash(profile: BuyerProfile): AvailableCash {
  const warnings: string[] = [];

  if (profile.status !== "갈아타기") {
    return { amount: Math.max(0, Math.floor(profile.cash)), warnings };
  }

  const home = profile.existingHome;
  if (!home) {
    warnings.push("기존 주택 정보가 없어 매도 대금이 반영되지 않았습니다.");
    return { amount: Math.max(0, Math.floor(profile.cash)), warnings };
  }

  if (home.capitalGainsTax === undefined) {
    warnings.push(
      "양도세가 반영되지 않았습니다. 실제 가용 자금은 이보다 적을 수 있습니다.",
    );
  }

  const netEquity =
    home.expectedSalePrice - home.remainingLoan - (home.capitalGainsTax ?? 0);

  return {
    amount: Math.max(0, Math.floor(profile.cash + netEquity)),
    warnings,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 46 tests passed

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 갈아타기 순자산을 반영한 가용현금 계산 추가"
```

---

## Task 7: 실구매력 이분 탐색 (`calcAffordablePrice`)

**Files:**
- Create: `src/lib/finance/affordable-price.ts`
- Test: `src/lib/finance/affordable-price.test.ts`

**Interfaces:**
- Consumes: `calcMaxLoan` (Task 3), `calcAcquisitionCosts` (Task 4), `matchPolicyLoans` (Task 5), `calcAvailableCash` (Task 6)
- Produces:
  - `calcAffordablePrice(profile: BuyerProfile, rules: Rules): AffordableResult`
  - `interface AffordableResult { affordablePrice: number; loanLimit: LoanLimit; costs: CostBreakdown; availableCash: number; warnings: string[] }`

**설계 노트:** 매매가 `P`가 커지면 필요한 자기부담금 `P - 대출한도(P) + 부대비용(P)`도 함께 커진다(LTV가 70~80%라 `P`의 20~30%씩 증가). 즉 **자기부담금은 `P`에 대해 단조 증가**하므로 이분 탐색이 성립한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/affordable-price.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAffordablePrice } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("calcAffordablePrice", () => {
  it("결과 가격에서 자기부담금이 가용현금을 넘지 않는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    const loan = calcMaxLoan(
      profile(),
      rules,
      result.affordablePrice,
      Number.POSITIVE_INFINITY,
    );
    const costs = calcAcquisitionCosts(
      result.affordablePrice,
      profile(),
      rules,
    );
    const ownFunds = result.affordablePrice - loan.amount + costs.total;
    expect(ownFunds).toBeLessThanOrEqual(result.availableCash);
  });

  it("백만원만 더 비싸도 예산을 넘는 경계값을 찾는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    const overPrice = result.affordablePrice + 1_000_000;
    const loan = calcMaxLoan(profile(), rules, overPrice);
    const costs = calcAcquisitionCosts(overPrice, profile(), rules);
    expect(overPrice - loan.amount + costs.total).toBeGreaterThan(
      result.availableCash,
    );
  });

  it("현금이 많을수록 실구매력이 커진다", () => {
    const poor = calcAffordablePrice(profile({ cash: 100_000_000 }), rules);
    const rich = calcAffordablePrice(profile({ cash: 400_000_000 }), rules);
    expect(rich.affordablePrice).toBeGreaterThan(poor.affordablePrice);
  });

  it("소득이 낮으면 DSR에 걸린다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 500_000_000, annualIncome: 30_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("DSR");
  });

  it("현금과 소득이 모두 많으면 6억 캡에 걸린다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 2_000_000_000, annualIncome: 500_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("CAP");
  });

  it("현금이 0이고 소득도 없으면 실구매력이 0이다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 0, annualIncome: 0 }),
      rules,
    );
    expect(result.affordablePrice).toBe(0);
  });

  it("갈아타기 경고가 결과로 전달된다", () => {
    const result = calcAffordablePrice(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
        },
      }),
      rules,
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("정책대출 자격이 있으면 한도 후보에 포함된다", () => {
    const result = calcAffordablePrice(
      profile({
        cash: 300_000_000,
        annualIncome: 50_000_000,
        isFirstTimeBuyer: true,
      }),
      rules,
    );
    expect(result.loanLimit.breakdown.POLICY).toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
  });

  it("실구매력은 10만원 단위로 내림한 정수다", () => {
    const result = calcAffordablePrice(profile(), rules);
    expect(result.affordablePrice % 100_000).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- affordable-price`
Expected: FAIL — `Failed to resolve import "./affordable-price"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/finance/affordable-price.ts`:

```ts
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import type { BuyerProfile, CostBreakdown, LoanLimit, Rules } from "./types";

export interface AffordableResult {
  /** 실구매 가능 최대 매매가(원). 10만원 단위로 내림 */
  affordablePrice: number;
  /** 그 가격에서의 대출 한도와 걸린 제약 */
  loanLimit: LoanLimit;
  /** 그 가격에서의 취득 부대비용 */
  costs: CostBreakdown;
  /** 계산에 사용된 가용현금(원) */
  availableCash: number;
  warnings: string[];
}

/** 탐색 상한. 수도권 주거용 상한으로 충분한 값 */
const SEARCH_UPPER_BOUND = 10_000_000_000;
/** 결과를 내림할 단위 */
const PRICE_STEP = 100_000;

/**
 * 가용현금으로 감당 가능한 최대 매매가를 구한다.
 *
 * 대출한도는 매매가에 의존하고(LTV) 매매가는 대출한도에 의존하는 순환 참조라
 * 닫힌 식으로 풀 수 없다. 자기부담금이 매매가에 대해 단조 증가한다는 성질을
 * 이용해 이분 탐색으로 수렴시킨다.
 */
export function calcAffordablePrice(
  profile: BuyerProfile,
  rules: Rules,
): AffordableResult {
  const cash = calcAvailableCash(profile);

  let low = 0;
  let high = SEARCH_UPPER_BOUND;

  // 50회면 100억 범위를 0.01원 미만까지 좁힌다
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (ownFundsRequired(mid, profile, rules) <= cash.amount) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const affordablePrice = Math.floor(low / PRICE_STEP) * PRICE_STEP;

  return {
    affordablePrice,
    loanLimit: loanAt(affordablePrice, profile, rules),
    costs: calcAcquisitionCosts(affordablePrice, profile, rules),
    availableCash: cash.amount,
    warnings: cash.warnings,
  };
}

/** 해당 매매가에서 사용자가 현금으로 내야 하는 총액 */
function ownFundsRequired(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const loan = loanAt(price, profile, rules);
  const costs = calcAcquisitionCosts(price, profile, rules);
  return price - loan.amount + costs.total;
}

function loanAt(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): LoanLimit {
  const policyLimit = policyLimitAt(price, profile, rules);
  return calcMaxLoan(profile, rules, price, policyLimit);
}

/**
 * 자격이 되는 정책대출 중 가장 큰 한도.
 * 자격 상품이 없으면 제약이 없는 것이므로 무한대를 반환한다.
 */
function policyLimitAt(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): number {
  const matched = matchPolicyLoans(profile, rules, price);
  if (matched.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...matched.map((loan) => loan.maxAmount));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 55 tests passed

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 이분 탐색으로 실구매 가능 가격 계산 추가"
```

---

## Task 8: 상환부담률과 신호등 (`calcSafetyScore`) + 공개 API

**Files:**
- Create: `src/lib/finance/safety.ts`
- Create: `src/lib/finance/index.ts`
- Test: `src/lib/finance/safety.test.ts`

**Interfaces:**
- Consumes: `monthlyPayment` (Task 1), `calcMaxLoan` (Task 3), `SafetyScore`/`SafetyLevel` (Task 2)
- Produces:
  - `calcSafetyScore(price: number, profile: BuyerProfile, rules: Rules, loanAmount: number): SafetyScore`
  - `src/lib/finance/index.ts`에서 전체 공개 API 재수출

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/safety.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}

describe("calcSafetyScore", () => {
  it("상환부담률은 월 상환액을 월 소득으로 나눈 값이다", () => {
    const score = calcSafetyScore(
      500_000_000,
      profile(),
      rules,
      300_000_000,
    );
    const monthlyIncome = 100_000_000 / 12;
    expect(score.burdenRatio).toBeCloseTo(
      score.monthlyPayment / monthlyIncome,
      6,
    );
  });

  it("스트레스 시나리오의 상환액이 기본보다 크다", () => {
    const score = calcSafetyScore(
      500_000_000,
      profile(),
      rules,
      300_000_000,
    );
    expect(score.stressedMonthlyPayment).toBeGreaterThan(score.monthlyPayment);
  });

  it("부담률이 낮으면 safe다", () => {
    const score = calcSafetyScore(
      300_000_000,
      profile({ annualIncome: 200_000_000 }),
      rules,
      100_000_000,
    );
    expect(score.level).toBe("safe");
  });

  it("부담률이 중간이면 caution이다", () => {
    // 연소득 6천만(월 500만) · 대출 3억 · 4.2% 30년 → 월 약 147만원, 부담률 약 29%
    const score = calcSafetyScore(
      500_000_000,
      profile({ annualIncome: 60_000_000 }),
      rules,
      300_000_000,
    );
    expect(score.level).toBe("caution");
  });

  it("부담률이 높으면 danger다", () => {
    const score = calcSafetyScore(
      800_000_000,
      profile({ annualIncome: 50_000_000 }),
      rules,
      500_000_000,
    );
    expect(score.level).toBe("danger");
  });

  it("기본 부담률이 낮아도 스트레스 시 임계를 넘으면 danger로 내린다", () => {
    const strictRules = {
      ...rules,
      safetyThreshold: { safe: 0.9, caution: 0.95, stressedDanger: 0.01 },
    };
    const score = calcSafetyScore(
      500_000_000,
      profile(),
      strictRules,
      300_000_000,
    );
    expect(score.level).toBe("danger");
  });

  it("기존 부채의 상환액도 부담률에 포함된다", () => {
    const clean = calcSafetyScore(
      500_000_000,
      profile(),
      rules,
      300_000_000,
    );
    const indebted = calcSafetyScore(
      500_000_000,
      profile({ existingDebtAnnualPayment: 12_000_000 }),
      rules,
      300_000_000,
    );
    expect(indebted.burdenRatio).toBeGreaterThan(clean.burdenRatio);
  });

  it("소득이 0이면 부담률이 무한대이고 danger다", () => {
    const score = calcSafetyScore(
      500_000_000,
      profile({ annualIncome: 0 }),
      rules,
      300_000_000,
    );
    expect(score.burdenRatio).toBe(Number.POSITIVE_INFINITY);
    expect(score.level).toBe("danger");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- safety`
Expected: FAIL — `Failed to resolve import "./safety"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/finance/safety.ts`:

```ts
import { monthlyPayment } from "./amortization";
import type { BuyerProfile, Rules, SafetyLevel, SafetyScore } from "./types";

/**
 * 해당 매매가와 대출액에서의 상환 부담을 평가한다.
 * 기본 금리와 스트레스 금리(+2%p) 두 시나리오를 모두 계산하며,
 * 기본 시나리오가 양호해도 스트레스에서 무너지면 danger로 내린다.
 */
export function calcSafetyScore(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
  loanAmount: number,
): SafetyScore {
  const monthlyIncome = profile.annualIncome / 12;
  const existingMonthly = profile.existingDebtAnnualPayment / 12;

  const payment =
    monthlyPayment(loanAmount, rules.baseRate, rules.loanTermMonths) +
    existingMonthly;

  const stressedPayment =
    monthlyPayment(
      loanAmount,
      rules.baseRate + rules.safetyStressSurcharge,
      rules.loanTermMonths,
    ) + existingMonthly;

  const burdenRatio = ratio(payment, monthlyIncome);
  const stressedBurdenRatio = ratio(stressedPayment, monthlyIncome);

  return {
    monthlyPayment: Math.round(payment),
    burdenRatio,
    stressedMonthlyPayment: Math.round(stressedPayment),
    stressedBurdenRatio,
    level: gradeLevel(burdenRatio, stressedBurdenRatio, rules),
  };
}

function ratio(payment: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return Number.POSITIVE_INFINITY;
  return payment / monthlyIncome;
}

function gradeLevel(
  burdenRatio: number,
  stressedBurdenRatio: number,
  rules: Rules,
): SafetyLevel {
  const t = rules.safetyThreshold;
  if (stressedBurdenRatio > t.stressedDanger) return "danger";
  if (burdenRatio < t.safe) return "safe";
  if (burdenRatio <= t.caution) return "caution";
  return "danger";
}
```

- [ ] **Step 4: 공개 API 작성**

`src/lib/finance/index.ts`:

```ts
export { maxPrincipal, monthlyPayment } from "./amortization";
export { calcAcquisitionCosts } from "./acquisition-cost";
export { calcAffordablePrice } from "./affordable-price";
export type { AffordableResult } from "./affordable-price";
export { calcAvailableCash } from "./available-cash";
export type { AvailableCash } from "./available-cash";
export { calcMaxLoan } from "./loan-limit";
export { matchPolicyLoans } from "./policy-loans";
export { parseRules } from "./rules";
export { calcSafetyScore } from "./safety";
export type {
  BindingConstraint,
  BuyerProfile,
  CostBreakdown,
  ExistingHome,
  HouseholdStatus,
  LoanLimit,
  PolicyLoanRule,
  Rules,
  SafetyLevel,
  SafetyScore,
} from "./types";
```

- [ ] **Step 5: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 63 tests passed, 타입 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: 상환부담률 평가와 재무 엔진 공개 API 추가"
```

---

## Task 9: 골든 테스트 — 공식 수치 교차 검증

**Files:**
- Create: `src/lib/finance/golden.test.ts`
- Modify: `rules/2026-03.json` (교차 검증 결과 반영 시)

**Interfaces:**
- Consumes: Task 1~8의 전체 공개 API
- Produces: 없음 (검증 전용)

**목적:** 지금까지의 테스트는 내부 일관성만 검증했다. 이 태스크는 **엔진이 현실과 일치하는지**를 확인한다. 여기서 어긋나면 코드가 아니라 룰셋 수치를 의심한다.

- [ ] **Step 1: 공식 수치 조사**

다음 값을 공식 출처에서 확인해 기록한다. 블로그·기사는 근거로 쓰지 않는다.

| 확인 대상 | 출처 |
|---|---|
| 스트레스 DSR 3단계 가산금리 | 금융위원회 보도자료 |
| 수도권 주담대 절대 상한 | 금융위원회 보도자료 |
| 주택 취득세율 및 생애최초 감면 | 지방세법 / 위택스 |
| 중개보수 상한요율 | 공인중개사법 시행규칙 / 각 시도 조례 |
| 디딤돌·보금자리론 소득·가격·한도 | 주택도시기금 / 한국주택금융공사 |

확인 결과가 `rules/2026-03.json`과 다르면 **JSON만 수정한다. 코드는 건드리지 않는다.**

- [ ] **Step 2: 골든 테스트 작성**

`src/lib/finance/golden.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

/**
 * 공식 발표 수치와 엔진 계산을 대조하는 골든 테스트.
 * 실패하면 코드보다 rules/2026-03.json을 먼저 의심한다.
 */
describe("골든 테스트 — 공식 수치 대조", () => {
  const highEarner: BuyerProfile = {
    status: "무주택",
    cash: 1_000_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
  };

  it("연소득 1억 · 30년 · 변동금리 · 스트레스 3단계 DSR 한도가 5.5억~6.0억 범위다", () => {
    // 출처: Step 1에서 확인한 금융위 보도자료 수치 (약 5.7억)
    const result = calcMaxLoan(highEarner, rules, 2_000_000_000);
    expect(result.breakdown.DSR).toBeGreaterThan(550_000_000);
    expect(result.breakdown.DSR).toBeLessThan(600_000_000);
  });

  it("수도권 주택구입 목적 대출은 6억을 넘지 못한다", () => {
    const result = calcMaxLoan(
      { ...highEarner, annualIncome: 1_000_000_000 },
      rules,
      3_000_000_000,
    );
    expect(result.amount).toBe(600_000_000);
    expect(result.binding).toBe("CAP");
  });

  it("12억 아파트 · LTV 70%는 8.4억이 아니라 6억으로 잘린다", () => {
    const result = calcMaxLoan(
      { ...highEarner, annualIncome: 1_000_000_000 },
      rules,
      1_200_000_000,
    );
    expect(result.breakdown.LTV).toBe(840_000_000);
    expect(result.amount).toBe(600_000_000);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `npm test -- golden`
Expected: PASS — 3 tests passed

**실패했다면**: `rules/2026-03.json`의 `baseRate`, `stressDSR.surcharge`, `loanTermMonths`를 Step 1에서 확인한 공식 수치로 조정한다. 조정 후에도 범위를 벗어나면 `calcDsrLimit`의 스트레스 금리 적용 방식을 재검토한다.

- [ ] **Step 4: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: PASS — 66 tests passed, 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "test: 공식 수치 대조 골든 테스트 추가"
```

---

## 완료 기준

- [ ] `npm test`가 전부 통과한다
- [ ] `npm run typecheck`에 오류가 없다
- [ ] 규제 수치가 코드에 하드코딩된 곳이 없다 (`rg '600000000|0\.015|0\.7' src/` 로 확인)
- [ ] `calcAffordablePrice`가 `binding`을 포함한 결과를 반환한다
- [ ] 골든 테스트의 수치 출처가 공식 자료로 확인되어 있다

## 다음 계획

- **Plan B — 데이터 파이프라인**: 국토부 실거래가 수집 → 단지 정규화 → 집계 → 정적 JSON 생성
- **Plan C — 웹 UI + 랭킹**: 입력 위저드, 예산 결과 화면, 단지 목록/상세, 리포트 출력
