# 화면 3: 단지 목록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예산에 맞는 단지를 안전선에서 갈라 보여주고, 시세는 범위와 거래 건수로만 말한다.

**Architecture:** 엔진의 상환 부담 모델을 먼저 고친다 — 지금 `calcSafePrice`는 각 가격에서 최대 대출을 가정하는데, 특정 단지를 볼 때는 모자란 만큼만 빌린다. 안전선과 목록의 부담률이 같은 함수를 쓰지 않으면 화면이 "안전 구역인데 부담률은 위험"인 행을 보여주게 되므로, 그 계산을 한 곳에 모은다. 그 위에 순수 함수로 목록을 만들고(필터·분할·정렬), 마지막에 화면을 붙인다.

**Tech Stack:** React 19 + Vite 7, TypeScript strict + `noUncheckedIndexedAccess`, Vitest 4 + jsdom + Testing Library, SEED Design

## Global Constraints

- **`medianPrice`를 화면에 숫자로 내지 않는다.** 화면에는 `minPrice ~ maxPrice`와 거래 건수를 낸다. 부모 스펙 §12(감정평가법 저촉 회피).
- **거래 건수는 모든 행에 항상 붙인다.** 범위의 근거이기 때문이다.
- **변동률(`changeRate*`)을 화면에 내지 않는다.** 부모 스펙 §12의 "수익률 예측 금지". 데이터에는 남긴다.
- **월 상환액·부담률·실구매력 비교는 전부 `maxPrice` 기준이다.** 범위의 위쪽으로 계산하면 틀리더라도 부담이 표시보다 **작아지는** 쪽으로 틀린다.
- **상환 부담은 "필요 대출" 기준이다.** `필요 대출 = max(0, 가격 + 부대비용 − 보유 현금)`. 최대 대출이 아니다.
- **안전선과 목록 부담률은 같은 함수를 쓴다.** 따로 계산하면 어긋난다.
- **실구매력을 넘는 단지는 목록에 넣지 않는다.**
- **정렬 옵션 UI를 만들지 않는다.** 부담률 오름차순 하나로 고정한다.
- **지역↔규제지역 대응을 코드에 박지 않는다.** 룰셋이나 데이터에 둔다.
- **`"지역을 넓혀 보라"`는 필터가 원인일 때만 말한다.** 전체 지역에서도 0개면 거짓말이다.
- **색만으로 의미를 전달하지 않는다.** 등급은 항상 글자로도 말한다.
- **화면 문구는 해요체다.** `scripts/tone-guard.test.ts`가 지킨다 — 법적 면책 문구만 예외다.
- **`src/no-network.test.ts`의 약속을 깨지 않는다** — `src/` 안에서 `fetch`·XHR·동적 `import(`·Node 내장 모듈 임포트 금지, **주석 포함**. 데이터는 정적 import로 번들에 넣는다.
- **`seed-design/ui/*` 벤더 스니펫을 수정하지 않는다.**
- 모든 금액은 **원 단위 정수**. 파일당 하나의 책임, **파일 분할 금지**(같은 파일 안에서 헬퍼 추출).
- TypeScript strict + `noUncheckedIndexedAccess`. `any` 금지, 불필요한 non-null assertion 금지.
- 테스트는 대상과 같은 디렉토리에 `*.test.ts(x)`. 테스트 출력은 깨끗해야 한다.
- 커밋 메시지는 Conventional Commits, 제목은 한국어.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/lib/finance/burden.ts` | 가격 → 필요 대출 → 부담 | 신규 |
| `src/lib/finance/safe-price.ts` | 안전선 | 술어를 필요 대출로 |
| `src/lib/finance/index.ts` | 공개 API | `calcBurdenAt` 추가 |
| `.gitignore` | 산출물 추적 | `data/` → 원시 캐시만 무시 |
| `src/data/complexes.ts` | 번들 데이터 로더 + 타입 | 신규 |
| `src/lib/complex-list.ts` | 필터·분할·정렬 (순수) | 신규 |
| `src/components/ComplexList.tsx` | 목록 화면 | 신규 |
| `src/components/RegionFilter.tsx` | 지역 필터 | 신규 |
| `src/App.tsx` | 배치 | 목록 연결 |
| `rules/2026-08.json` | 지역↔규제지역 | 대응표 추가 |

---

## Task 1: 상환 부담을 "필요 대출"로 계산한다

엔진만 고친다. 화면은 건드리지 않는다.

**Files:**
- Create: `src/lib/finance/burden.ts`
- Modify: `src/lib/finance/safe-price.ts`, `src/lib/finance/index.ts`, `src/lib/finance/index.test.ts`
- Test: `src/lib/finance/burden.test.ts`, `src/lib/finance/safe-price.test.ts`

**Interfaces:**
- Produces: `calcBurdenAt(profile: BuyerProfile, rules: Rules, price: number): BurdenAtPrice` — Task 3이 쓴다
- Produces: `interface BurdenAtPrice { neededLoan: number; safety: SafetyScore }`

### 왜 고치는가

`calcSafePrice`가 각 가격에서 **최대 대출**을 받았다고 가정하고 부담률을 잰다. 특정 단지를 보는 사람은 최대한 빌리지 않고 **모자란 만큼만** 빌린다.

측정된 차이:

| 프로필 | 실구매력 | 안전선(최대 대출) | 안전선(필요 대출) |
|---|---|---|---|
| 현금 2억 · 소득 6천 | 4.76억 | 3.51억 | 4.37억 |
| 현금 50억 · 소득 2천 | 48.76억 | **2.05억** | 48.64억 |

현금 50억인 사람에게 "무리 없는 선은 2억"이라고 말하고 있었다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/finance/burden.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-08.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcBurdenAt } from "./burden";
import { parseRules } from "./rules";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

describe("calcBurdenAt", () => {
  it("필요 대출은 가격 + 부대비용 − 보유 현금이다", () => {
    const p = profile();
    const price = 400_000_000;
    const costs = calcAcquisitionCosts(price, p, rules).total;
    expect(calcBurdenAt(p, rules, price).neededLoan).toBe(
      price + costs - p.cash,
    );
  });

  it("현금이 가격과 부대비용을 덮으면 필요 대출이 0이다", () => {
    // 최대 대출 기준이었다면 여기서도 큰 대출을 가정해 부담률이 나왔다.
    const p = profile({ cash: 10_000_000_000 });
    const b = calcBurdenAt(p, rules, 400_000_000);
    expect(b.neededLoan).toBe(0);
    expect(b.safety.monthlyPayment).toBe(0);
    expect(b.safety.level).toBe("safe");
  });

  it("필요 대출이 음수가 되지 않는다", () => {
    const p = profile({ cash: 10_000_000_000 });
    expect(calcBurdenAt(p, rules, 0).neededLoan).toBe(0);
  });

  it("가격이 오르면 필요 대출이 줄지 않는다", () => {
    const p = profile();
    let previous = -1;
    for (const price of [0, 100_000_000, 300_000_000, 500_000_000]) {
      const loan = calcBurdenAt(p, rules, price).neededLoan;
      expect(loan).toBeGreaterThanOrEqual(previous);
      previous = loan;
    }
  });

  it("음수·비유한 가격은 던진다", () => {
    const p = profile();
    expect(() => calcBurdenAt(p, rules, -1)).toThrow();
    expect(() => calcBurdenAt(p, rules, Number.NaN)).toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/finance/burden.test.ts`
Expected: FAIL — `calcBurdenAt`이 없어 import 에러

- [ ] **Step 3: `calcBurdenAt`을 만든다**

`src/lib/finance/burden.ts`:

```ts
import { calcAcquisitionCosts } from "./acquisition-cost";
import { assertNonNegativeFinite, assertValidProfile } from "./profile";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile, Rules, SafetyScore } from "./types";

/** 어떤 가격에서 이 구매자가 실제로 지게 되는 부담 */
export interface BurdenAtPrice {
  /** 그 가격을 사려면 실제로 빌려야 하는 금액(원) */
  neededLoan: number;
  /** 그 대출에서의 상환 부담 */
  safety: SafetyScore;
}

/**
 * 특정 가격에서의 상환 부담.
 *
 * **최대 대출이 아니라 필요 대출로 잰다.** 특정 단지를 보는 사람은 받을 수
 * 있는 만큼 다 빌리지 않고 모자란 만큼만 빌린다. 최대 대출로 재면 현금이
 * 많은 사람에게 터무니없이 보수적인 답이 나온다 — 현금 50억·소득 2천만원인
 * 프로필의 "무리 없는 선"이 2억으로 계산되던 것이 그 예다.
 *
 * 안전선(`calcSafePrice`)과 단지 목록의 부담률이 **둘 다 이 함수를 쓴다.**
 * 따로 계산하면 목록이 "안전 구역에 있는데 부담률은 위험"인 행을 보여주게
 * 된다.
 *
 * 대출 한도를 넘는지는 여기서 보지 않는다. 감당 가능 여부는
 * `calcAffordablePrice`가 판단하고, 이 함수는 그 범위 안에서만 쓰인다.
 */
export function calcBurdenAt(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): BurdenAtPrice {
  assertValidProfile(profile);
  assertNonNegativeFinite(price, "price");

  const costs = calcAcquisitionCosts(price, profile, rules);
  const neededLoan = Math.max(0, price + costs.total - profile.cash);

  return {
    neededLoan,
    safety: calcSafetyScore(profile, rules, neededLoan),
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/finance/burden.test.ts`
Expected: PASS

- [ ] **Step 5: `calcSafePrice`가 이 함수를 쓰게 한다**

`src/lib/finance/safe-price.ts`의 술어를 바꾼다.

```ts
  return searchMaxPrice(rules, (price) => {
    if (price > affordable) return false;
    return calcBurdenAt(profile, rules, price).safety.level === "safe";
  });
```

`calcMaxLoan` import가 더 이상 필요 없으면 지운다. `calcBurdenAt` import를 더한다.

doc 주석도 고친다 — 최대 대출을 가정한다는 서술이 남아 있으면 거짓말이 된다.

- [ ] **Step 6: 안전선 테스트의 기대값을 다시 쓴다**

`src/lib/finance/safe-price.test.ts`의 기대값이 바뀐다(안전선이 올라간다).

**출력을 옮겨 붙이지 않는다.** 왜 올라갔는지가 설명되는 형태로 쓴다. 예를 들어 브루트포스 대조 테스트는 오라클도 필요 대출 기준으로 고치면 그대로 성립한다 — 그게 "같은 모델을 쓴다"는 것의 증거다.

추가로 넣을 테스트:

```ts
it("현금이 많으면 안전선이 실구매력에 가깝다", () => {
  // 최대 대출 기준이던 시절 이 프로필의 안전선은 2.05억이었다.
  // 현금 50억을 들고 있는 사람에게 무리 없는 선이 2억이라는 답은
  // 안전한 방향이지만 쓸모가 없다.
  const p = profile({ cash: 5_000_000_000, annualIncome: 20_000_000, isFirstTimeBuyer: false });
  const safe = calcSafePrice(p, rules);
  const affordable = calcAffordablePrice(p, rules).affordablePrice;
  expect(safe).not.toBeNull();
  expect(safe as number).toBeGreaterThan(affordable * 0.9);
});
```

- [ ] **Step 7: 공개 API에 추가한다**

`src/lib/finance/index.ts`에 추가한다(기존 정렬 관례를 따른다):

```ts
export { calcBurdenAt } from "./burden";
export type { BurdenAtPrice } from "./burden";
```

`src/lib/finance/index.test.ts`에 공개 API 화이트리스트가 있으면 함께 갱신한다 — 그 테스트는 새 export를 잡아내라고 있는 것이므로 갱신이 곧 의도된 동작이다.

- [ ] **Step 8: 전체 스위트·타입체크**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS

`SafeLine`이 화면에 보여주는 안전선 금액이 바뀌므로 그 컴포넌트·통합 테스트의 기대값도 바뀔 수 있다. **바뀐다면 그것은 이 변경의 의도된 결과다** — 다만 단언을 약화시키지 말고 새 값으로 정확히 다시 쓴다.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/finance/ src/components/ src/integration.test.tsx
git commit -m "fix: 상환 부담을 최대 대출이 아니라 필요 대출로 잰다

특정 단지를 보는 사람은 받을 수 있는 만큼 다 빌리지 않고 모자란 만큼만
빌린다. 최대 대출로 재던 탓에 현금 50억·소득 2천만원인 프로필의 무리
없는 선이 2억으로 계산됐다 — 안전한 방향이지만 쓸모가 없다.

안전선과 단지 목록 부담률이 같은 calcBurdenAt을 쓴다. 따로 계산하면
목록이 '안전 구역인데 부담률은 위험'인 행을 보여주게 된다."
```

---

## Task 2: 산출물을 커밋하고 타입 있는 로더를 만든다

**Files:**
- Modify: `.gitignore`
- Create: `src/data/complexes.ts`
- Test: `src/data/complexes.test.ts`

**Interfaces:**
- Produces: `interface ComplexUnit { … }`, `COMPLEX_UNITS: readonly ComplexUnit[]`, `REGIONS: readonly RegionSummary[]`, `DATA_AS_OF: string` — Task 3·4가 쓴다

### 왜 커밋하는가

스펙 §9가 데이터를 번들에 넣기로 했는데 `.gitignore`가 `data/` 전체를 무시하고 있어 **추적 파일이 0개다.** 이대로면 새로 클론한 저장소에서 빌드가 깨진다.

원시 캐시(`data/raw/`)는 계속 무시한다 — API 응답 캐시이고 크다. **산출물만 추적한다.**

- [ ] **Step 1: `.gitignore`를 바꾼다**

`data/` 줄을 지우고 아래로 대체한다.

```gitignore
# 파이프라인의 원시 캐시와 실행 로그. 산출물(complexes/regions/manifest/README)은
# 앱이 번들에 넣으므로 추적한다 — 무시하면 새로 클론한 저장소에서 빌드가 깨진다.
data/raw/
data/fetch-log.json
data/report.md
```

Run: `git status --short data/`
Expected: `complexes.json`·`regions.json`·`manifest.json`·`README.md`가 untracked로 보이고 `raw/`는 안 보인다

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/data/complexes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMPLEX_UNITS, DATA_AS_OF, REGIONS } from "./complexes";

describe("번들된 단지 데이터", () => {
  it("평형이 실제로 들어 있다", () => {
    // 0개면 아래 검사가 전부 공허하게 통과한다.
    expect(COMPLEX_UNITS.length).toBeGreaterThan(100);
  });

  it("모든 평형에 범위 표시에 필요한 값이 있다", () => {
    for (const u of COMPLEX_UNITS) {
      expect(Number.isInteger(u.minPrice)).toBe(true);
      expect(Number.isInteger(u.maxPrice)).toBe(true);
      expect(u.maxPrice).toBeGreaterThanOrEqual(u.minPrice);
      expect(u.tradeCount).toBeGreaterThan(0);
    }
  });

  it("지역 요약이 실제 평형의 지역과 일치한다", () => {
    const inUnits = new Set(COMPLEX_UNITS.map((u) => u.regionCode));
    const inRegions = new Set(REGIONS.map((r) => r.regionCode));
    expect([...inUnits].sort()).toEqual([...inRegions].sort());
  });

  it("데이터 기준일이 YYYY-MM 형식이다", () => {
    expect(DATA_AS_OF).toMatch(/^\d{4}-\d{2}$/);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run src/data/complexes.test.ts`
Expected: FAIL — 모듈이 없다

- [ ] **Step 4: 로더를 만든다**

`src/data/complexes.ts`:

```ts
import rawComplexes from "../../data/complexes.json";
import rawManifest from "../../data/manifest.json";
import rawRegions from "../../data/regions.json";

/**
 * 파이프라인이 만든 단지×평형 한 건.
 *
 * 필드 정의는 `data/README.md`에 있다 — 파이프라인이 산출물과 함께 만든다.
 *
 * `changeRate*`는 데이터에는 있지만 **화면에 쓰지 않는다.** 사실 서술이지만
 * 투자 판단 재료로 읽히고(부모 스펙 §12의 수익률 예측 금지), 저신뢰가 아닌
 * 평형 중에도 그 비율의 근거 창에 거래가 1건뿐인 것이 156개 있다.
 */
export interface ComplexUnit {
  complexKey: string;
  complexName: string;
  regionCode: string;
  legalDongName: string;
  builtYear: number;
  areaBucket: number;
  /** 대표가격(원). **화면에 숫자로 내지 않는다** — 부모 스펙 §12 */
  medianPrice: number;
  tradeCount: number;
  minPrice: number;
  maxPrice: number;
  lowConfidence: boolean;
}

export interface RegionSummary {
  regionCode: string;
  complexCount: number;
  unitCount: number;
}

/**
 * 번들에 실린 단지 데이터.
 *
 * 정적 import인 이유: 런타임에 받으면 `src/no-network.test.ts`가 지키는
 * "입력한 재무정보는 이 브라우저를 벗어나지 않습니다"의 경계가 흐려진다.
 * 정적 파일을 받는 것이 재무정보를 보내는 것은 아니지만, 그 가드를 열면
 * 약속이 무엇을 뜻하는지가 모호해진다.
 *
 * gzip 68KB다. 수도권 66개 시군구로 넓히면 이 방식은 무효가 되고 지역별
 * 분할이 답이 된다 — 스펙 §9 참고.
 */
export const COMPLEX_UNITS: readonly ComplexUnit[] = rawComplexes;

export const REGIONS: readonly RegionSummary[] = rawRegions;

/** 수집된 거래 중 가장 최근 계약월(YYYY-MM) */
export const DATA_AS_OF: string = rawManifest.dataAsOf;
```

타입이 안 맞으면(예: JSON에 `changeRate*`가 더 있음) **`as`로 뭉개지 말고** 인터페이스가 실제 JSON의 부분집합이 되도록 맞춘다. TypeScript는 추가 필드를 가진 객체를 더 좁은 인터페이스에 할당하는 것을 허용한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/data/complexes.test.ts`
Expected: PASS

- [ ] **Step 6: 번들 증가를 확인한다**

Run: `npx vite build`
Expected: 성공. **JS gzip 증가가 70KB 이내여야 한다**(스펙 §14). 넘으면 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add .gitignore data/complexes.json data/regions.json data/manifest.json data/README.md src/data/
git commit -m "feat: 파이프라인 산출물을 커밋하고 번들 로더를 만든다

화면이 단지 데이터를 쓰려면 번들에 있어야 하는데 .gitignore가 data/ 전체를
무시해 추적 파일이 0개였다 — 새로 클론한 저장소에서 빌드가 깨진다. 원시
캐시는 계속 무시하고 산출물만 추적한다.

정적 import인 이유는 런타임에 받으면 no-network 가드가 지키는 약속의
경계가 흐려지기 때문이다."
```

---

## Task 3: 목록을 만든다 (순수 함수)

화면 없이 계산만 한다.

**Files:**
- Create: `src/lib/complex-list.ts`
- Test: `src/lib/complex-list.test.ts`

**Interfaces:**
- Consumes: Task 1의 `calcBurdenAt`, Task 2의 `ComplexUnit`
- Produces: `buildComplexList(input: ComplexListInput): ComplexListResult` — Task 4가 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/complex-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../rules/2026-08.json";
import type { ComplexUnit } from "../data/complexes";
import { parseRules } from "./finance/rules";
import type { BuyerProfile } from "./finance/types";
import { buildComplexList } from "./complex-list";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 86,
    isRegulatedArea: true,
    ...overrides,
  };
}

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket: 84,
    medianPrice: 300_000_000,
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    lowConfidence: false,
    ...overrides,
  };
}

describe("buildComplexList", () => {
  it("maxPrice가 실구매력을 넘는 단지를 뺀다", () => {
    const cheap = unit({ complexKey: "a", maxPrice: 100_000_000 });
    const dear = unit({ complexKey: "b", maxPrice: 90_000_000_000 });
    const r = buildComplexList({
      units: [cheap, dear],
      profile: profile(),
      rules,
      regionCodes: [],
    });
    const keys = [...r.withinSafe, ...r.beyondSafe].map((e) => e.unit.complexKey);
    expect(keys).toContain("a");
    expect(keys).not.toContain("b");
  });

  it("안전선 이하는 첫 덩어리, 초과는 둘째 덩어리다", () => {
    const r = buildComplexList({
      units: [unit({ complexKey: "a", maxPrice: 100_000_000 }),
              unit({ complexKey: "b", maxPrice: 450_000_000 })],
      profile: profile(),
      rules,
      regionCodes: [],
    });
    const safeKeys = r.withinSafe.map((e) => e.unit.complexKey);
    const beyondKeys = r.beyondSafe.map((e) => e.unit.complexKey);
    expect(safeKeys).toContain("a");
    expect(beyondKeys.concat(safeKeys)).toContain("b");
    // 같은 단지가 양쪽에 들어가지 않는다
    expect(safeKeys.filter((k) => beyondKeys.includes(k))).toEqual([]);
  });

  it("각 덩어리 안에서 부담률 오름차순이다", () => {
    const r = buildComplexList({
      units: [unit({ complexKey: "a", maxPrice: 300_000_000 }),
              unit({ complexKey: "b", maxPrice: 150_000_000 }),
              unit({ complexKey: "c", maxPrice: 220_000_000 })],
      profile: profile(),
      rules,
      regionCodes: [],
    });
    for (const group of [r.withinSafe, r.beyondSafe]) {
      const ratios = group.map((e) => e.burden.safety.burdenRatio);
      expect([...ratios].sort((x, y) => x - y)).toEqual(ratios);
    }
  });

  it("부담률을 maxPrice로 계산한다 — medianPrice가 아니다", () => {
    // 범위가 넓은 단지에서 둘이 갈린다. 위쪽으로 계산해야 틀리더라도
    // 부담이 표시보다 작아지는 쪽으로 틀린다.
    const wide = unit({ minPrice: 100_000_000, medianPrice: 150_000_000, maxPrice: 300_000_000 });
    const r = buildComplexList({ units: [wide], profile: profile(), rules, regionCodes: [] });
    const entry = [...r.withinSafe, ...r.beyondSafe][0];
    expect(entry).toBeDefined();
    const atMedian = buildComplexList({
      units: [unit({ minPrice: 150_000_000, medianPrice: 150_000_000, maxPrice: 150_000_000 })],
      profile: profile(), rules, regionCodes: [],
    });
    const medianEntry = [...atMedian.withinSafe, ...atMedian.beyondSafe][0];
    expect(medianEntry).toBeDefined();
    expect(entry?.burden.neededLoan).toBeGreaterThan(medianEntry?.burden.neededLoan ?? 0);
  });

  it("지역 필터가 비어 있으면 전체를 본다", () => {
    const r = buildComplexList({
      units: [unit({ complexKey: "a", regionCode: "11680", maxPrice: 100_000_000 }),
              unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 })],
      profile: profile(), rules, regionCodes: [],
    });
    expect(r.withinSafe.length + r.beyondSafe.length).toBe(2);
  });

  it("지역을 고르면 그 지역만 남는다", () => {
    const r = buildComplexList({
      units: [unit({ complexKey: "a", regionCode: "11680", maxPrice: 100_000_000 }),
              unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 })],
      profile: profile(), rules, regionCodes: ["11680"],
    });
    const keys = [...r.withinSafe, ...r.beyondSafe].map((e) => e.unit.complexKey);
    expect(keys).toEqual(["a"]);
  });

  it("필터 때문에 0개인지 아닌지를 구분해 알려준다", () => {
    // "지역을 넓혀 보라"를 필터가 원인일 때만 말하기 위해 필요하다.
    const far = unit({ complexKey: "b", regionCode: "11650", maxPrice: 100_000_000 });
    const filtered = buildComplexList({
      units: [far], profile: profile(), rules, regionCodes: ["11680"],
    });
    expect(filtered.emptyBecauseOfFilter).toBe(true);

    const tooExpensive = unit({ maxPrice: 90_000_000_000 });
    const unfiltered = buildComplexList({
      units: [tooExpensive], profile: profile(), rules, regionCodes: [],
    });
    expect(unfiltered.emptyBecauseOfFilter).toBe(false);
  });

  it("안전선 경계의 단지는 부담률이 안전 등급이다 — 두 계산이 같은 함수를 쓴다", () => {
    // 안전선과 목록 부담률이 다른 모델을 쓰면 여기서 어긋난다:
    // 안전 구역에 들어갔는데 그 행의 등급이 safe가 아닌 상태가 된다.
    const p = profile();
    const r = buildComplexList({ units: [], profile: p, rules, regionCodes: [] });
    expect(r.safePrice).not.toBeNull();
    const atSafeLine = unit({ maxPrice: r.safePrice as number });
    const r2 = buildComplexList({
      units: [atSafeLine], profile: p, rules, regionCodes: [],
    });
    expect(r2.withinSafe).toHaveLength(1);
    expect(r2.withinSafe[0]?.burden.safety.level).toBe("safe");
  });

  it("안전 덩어리의 모든 행이 안전 등급이다", () => {
    const p = profile();
    const prices = [50_000_000, 150_000_000, 250_000_000, 350_000_000, 450_000_000];
    const r = buildComplexList({
      units: prices.map((maxPrice, i) =>
        unit({ complexKey: `u${i}`, maxPrice, minPrice: maxPrice, medianPrice: maxPrice }),
      ),
      profile: p, rules, regionCodes: [],
    });
    for (const e of r.withinSafe) {
      expect(e.burden.safety.level, `${e.unit.complexKey} 가 안전 덩어리에 있다`).toBe("safe");
    }
  });

  it("안전선이 null이면 첫 덩어리가 비어 있다", () => {
    // 소득이 0이면 어떤 가격도 안전하지 않다.
    const p = profile({ annualIncome: 0, cash: 500_000_000 });
    const r = buildComplexList({
      units: [unit({ maxPrice: 100_000_000 })], profile: p, rules, regionCodes: [],
    });
    expect(r.withinSafe).toEqual([]);
    expect(r.safePrice).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/complex-list.test.ts`
Expected: FAIL — 모듈이 없다

- [ ] **Step 3: 구현한다**

`src/lib/complex-list.ts`:

```ts
import type { ComplexUnit } from "../data/complexes";
import {
  calcAffordablePrice,
  calcBurdenAt,
  calcSafePrice,
  type BurdenAtPrice,
  type BuyerProfile,
  type Rules,
} from "./finance";

export interface ComplexListInput {
  units: readonly ComplexUnit[];
  profile: BuyerProfile;
  rules: Rules;
  /** 비어 있으면 전체 지역 */
  regionCodes: readonly string[];
}

export interface ComplexListEntry {
  unit: ComplexUnit;
  /** `maxPrice`에서의 부담. 범위의 위쪽으로 재야 표시보다 부담이 커지지 않는다 */
  burden: BurdenAtPrice;
}

export interface ComplexListResult {
  /** 안전선 이하 */
  withinSafe: ComplexListEntry[];
  /** 안전선 초과 ~ 실구매력 이하 */
  beyondSafe: ComplexListEntry[];
  affordablePrice: number;
  /** 안전한 가격이 없으면 null */
  safePrice: number | null;
  /**
   * 지역 필터를 풀면 보여줄 것이 생기는가.
   *
   * "지역을 넓혀 보라"는 필터가 원인일 때만 말해야 한다. 전체 지역에서도
   * 0개인데 지역을 넓히라고 하면 거짓말이다.
   */
  emptyBecauseOfFilter: boolean;
}

/**
 * 예산에 맞는 단지를 안전선에서 갈라 정렬한다.
 *
 * 모든 가격 비교와 부담 계산은 **`maxPrice`** 기준이다. 범위의 위쪽으로
 * 재면 틀리더라도 부담이 표시보다 작아지는 쪽으로 틀린다.
 */
export function buildComplexList(input: ComplexListInput): ComplexListResult {
  const { units, profile, rules, regionCodes } = input;

  const affordablePrice = calcAffordablePrice(profile, rules).affordablePrice;
  const safePrice = calcSafePrice(profile, rules);

  const affordable = (u: ComplexUnit) => u.maxPrice <= affordablePrice;
  const inRegion = (u: ComplexUnit) =>
    regionCodes.length === 0 || regionCodes.includes(u.regionCode);

  const shown = units.filter((u) => inRegion(u) && affordable(u));

  const withinSafe: ComplexListEntry[] = [];
  const beyondSafe: ComplexListEntry[] = [];

  for (const unit of shown) {
    const entry: ComplexListEntry = {
      unit,
      burden: calcBurdenAt(profile, rules, unit.maxPrice),
    };
    const isSafe = safePrice !== null && unit.maxPrice <= safePrice;
    (isSafe ? withinSafe : beyondSafe).push(entry);
  }

  const byBurden = (a: ComplexListEntry, b: ComplexListEntry) =>
    a.burden.safety.burdenRatio - b.burden.safety.burdenRatio;
  withinSafe.sort(byBurden);
  beyondSafe.sort(byBurden);

  return {
    withinSafe,
    beyondSafe,
    affordablePrice,
    safePrice,
    emptyBecauseOfFilter:
      shown.length === 0 && units.some((u) => affordable(u)),
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/complex-list.test.ts`
Expected: PASS

- [ ] **Step 5: 실제 데이터로 확인한다**

같은 파일에 추가한다.

```ts
it("실제 번들 데이터로 돌아간다", async () => {
  const { COMPLEX_UNITS } = await import("../data/complexes");
  const r = buildComplexList({
    units: COMPLEX_UNITS, profile: profile(), rules, regionCodes: [],
  });
  // 어느 한쪽에라도 결과가 있어야 한다 — 없으면 필터가 지나치게 좁다는 뜻이다
  expect(r.withinSafe.length + r.beyondSafe.length).toBeGreaterThan(0);
  for (const e of [...r.withinSafe, ...r.beyondSafe]) {
    expect(e.unit.maxPrice).toBeLessThanOrEqual(r.affordablePrice);
  }
});
```

동적 `import()`는 `src/no-network.test.ts`의 금지 패턴이다. **테스트 파일이 스캔 대상인지 먼저 확인하고**, 대상이면 파일 상단의 정적 import로 바꾼다.

- [ ] **Step 6: 전체 스위트·타입체크**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/lib/complex-list.ts src/lib/complex-list.test.ts
git commit -m "feat: 예산에 맞는 단지를 안전선에서 갈라 정렬한다

정렬만 하지 않고 두 덩어리로 나눈다 — 어디까지가 무리 없는지가 목록
구조 자체로 말해진다.

모든 가격 비교와 부담 계산은 maxPrice 기준이다. 범위의 위쪽으로 재면
틀리더라도 부담이 표시보다 작아지는 쪽으로 틀린다.

필터 때문에 0개인지 아닌지를 구분해 돌려준다. '지역을 넓혀 보라'는
필터가 원인일 때만 말해야 하고, 전체 지역에서도 0개면 그건 거짓말이다."
```

---

## Task 4: 화면을 붙인다

**Files:**
- Create: `src/components/ComplexList.tsx`, `src/components/RegionFilter.tsx`
- Modify: `src/App.tsx`, `src/state/useProfileForm.ts`, `rules/2026-08.json`
- Test: 각 대응 테스트 파일, `src/integration.test.tsx`

**Interfaces:**
- Consumes: Task 3의 `buildComplexList`, Task 2의 `COMPLEX_UNITS`·`REGIONS`·`DATA_AS_OF`

### 지역↔규제지역

지역을 고르면 규제지역 여부가 그 지역에서 정해지고 가정 문구에서 빠진다.

**대응을 코드에 박지 않는다.** `rules/2026-08.json`에 둔다 — 규제지역 지정은 바뀌고, 바뀔 때 코드를 고치게 만들면 안 된다.

```jsonc
"regulatedRegionCodes": ["11650", "11680", "11710"],
```

`_note`에 근거를 적는다: 10·15 대책으로 서울 전역이 규제지역이며, 이 목록은 파이프라인이 수집하는 시군구에 한한다.

`parseRules`가 이 필드를 검증하게 하고, `Rules` 타입에도 더한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 목록 표시**

`src/components/ComplexList.test.tsx`를 만든다. 먼저 픽스처 헬퍼를 둔다 — 아래 모든 테스트가 이것을 쓴다.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComplexUnit } from "../data/complexes";
import type { ComplexListEntry, ComplexListResult } from "../lib/complex-list";
import { ComplexList } from "./ComplexList";

function unit(overrides: Partial<ComplexUnit> = {}): ComplexUnit {
  return {
    complexKey: "11680|대치동|2015|테스트",
    complexName: "테스트아파트",
    regionCode: "11680",
    legalDongName: "대치동",
    builtYear: 2015,
    areaBucket: 84,
    medianPrice: 300_000_000,
    tradeCount: 5,
    minPrice: 280_000_000,
    maxPrice: 320_000_000,
    lowConfidence: false,
    ...overrides,
  };
}

/** 화면만 검증하므로 부담 값은 직접 만든다 — 엔진 계산은 complex-list.test.ts가 본다 */
function entry(u: ComplexUnit, burdenRatio: number, level: "safe" | "caution" | "danger"): ComplexListEntry {
  return {
    unit: u,
    burden: {
      neededLoan: 200_000_000,
      safety: {
        monthlyPayment: 1_200_000,
        burdenRatio,
        stressedMonthlyPayment: 1_500_000,
        stressedBurdenRatio: burdenRatio + 0.07,
        level,
      },
    },
  };
}

function renderList(overrides: Partial<ComplexListResult> = {}) {
  const result: ComplexListResult = {
    withinSafe: [],
    beyondSafe: [],
    affordablePrice: 500_000_000,
    safePrice: 350_000_000,
    emptyBecauseOfFilter: false,
    ...overrides,
  };
  return render(<ComplexList result={result} />);
}
```

`SafetyScore`의 필드 이름이 위와 다르면 **테스트를 억지로 맞추지 말고** `src/lib/finance/types.ts`를 읽어 실제 이름을 쓴다.

```tsx
it("시세를 범위와 거래 건수로 보여준다", () => {
  renderList({ withinSafe: [entry(unit(), 0.22, "safe")] });
  expect(screen.getByText(/2억 8,000만원 ~ 3억 2,000만원/)).toBeInTheDocument();
  expect(screen.getByText(/거래 5건/)).toBeInTheDocument();
});

it("medianPrice를 화면에 내지 않는다", () => {
  // 부모 스펙 §12: 특정 단지의 적정가를 단정하지 않는다.
  const { container } = renderList({ withinSafe: [entry(unit({ medianPrice: 300_000_000 }), 0.22, "safe")] });
  expect(container.textContent).not.toMatch(/3억원/);
});

it("변동률을 화면에 내지 않는다", () => {
  const { container } = renderList({ withinSafe: [entry(unit(), 0.22, "safe")] });
  expect(container.textContent).not.toMatch(/%\s*(상승|하락)|변동률/);
});

it("두 덩어리의 헤더가 각각 나온다", () => {
  renderList({
    withinSafe: [entry(unit({ complexKey: "a" }), 0.20, "safe")],
    beyondSafe: [entry(unit({ complexKey: "b" }), 0.33, "caution")],
  });
  expect(screen.getByText(/무리 없이 살 수 있어요/)).toBeInTheDocument();
  expect(screen.getByText(/부담이 커요/)).toBeInTheDocument();
});

it("한쪽이 비면 그 헤더가 없다", () => {
  renderList({ beyondSafe: [entry(unit(), 0.33, "caution")] });
  expect(screen.queryByText(/무리 없이 살 수 있어요/)).not.toBeInTheDocument();
});

it("부담률을 색과 함께 글자로도 말한다", () => {
  // 색만으로 의미를 전달하지 않는다.
  const { container } = renderList({ withinSafe: [entry(unit(), 0.22, "safe")] });
  expect(container.querySelector("[data-level]")).not.toBeNull();
  expect(screen.getAllByText(/안전|주의|위험/).length).toBeGreaterThan(0);
});

it("같은 이름·같은 동에 건축년도만 다른 단지가 있으면 건축년도를 붙인다", () => {
  renderList({
    withinSafe: [
      entry(unit({ complexKey: "a", builtYear: 1999 }), 0.20, "safe"),
      entry(unit({ complexKey: "b", builtYear: 2015 }), 0.22, "safe"),
    ],
  });
  expect(screen.getByText(/1999/)).toBeInTheDocument();
  expect(screen.getByText(/2015/)).toBeInTheDocument();
});

it("건축년도가 겹치지 않으면 붙이지 않는다", () => {
  const { container } = renderList({
    withinSafe: [
      entry(unit({ complexKey: "a", complexName: "가아파트" }), 0.20, "safe"),
      entry(unit({ complexKey: "b", complexName: "나아파트" }), 0.22, "safe"),
    ],
  });
  expect(container.textContent).not.toMatch(/\d{4}년 준공/);
});
```

기대 문구가 `formatWon`의 실제 출력과 다르면 **테스트를 출력에 맞추지 말고** `src/format/won.ts`를 읽어 정확한 형식을 확인한다.

- [ ] **Step 2: 실패하는 테스트를 쓴다 — 0개일 때**

같은 파일에 추가한다.

```tsx
it("지역 필터 때문에 0개면 지역을 넓혀 보라고 한다", () => {
  renderList({ emptyBecauseOfFilter: true });
  expect(screen.getByText(/지역을 넓혀/)).toBeInTheDocument();
});

it("전체 지역에서도 0개면 지역 이야기를 하지 않는다", () => {
  // 전체에서도 없는데 지역을 넓히라고 하면 거짓말이다.
  renderList({ emptyBecauseOfFilter: false });
  expect(screen.queryByText(/지역을 넓혀/)).not.toBeInTheDocument();
  expect(screen.getByText(/기존 부채/)).toBeInTheDocument();
});
```

- [ ] **Step 3: 실패하는 테스트를 쓴다 — 지역 필터와 가정**

`src/components/RegionFilter.test.tsx`와 `src/integration.test.tsx`에 추가한다.

```tsx
it("지역을 고르면 규제지역 가정이 문구에서 빠진다", () => {
  // 근거가 "모르니까 안전하게"에서 "당신이 고른 지역이라서"로 바뀐다.
  renderApp();
  // 현금·소득 입력 후 지역 하나 선택
  expect(screen.queryByText(/규제지역으로 계산했어요/)).not.toBeInTheDocument();
});
```

- [ ] **Step 4: 구현한다**

`RegionFilter`(다중 선택, 기본 전체)와 `ComplexList`를 만들고 `App.tsx`에 배치한다.

지킬 것:

- **`medianPrice`를 렌더링하지 않는다.**
- **변동률을 렌더링하지 않는다.**
- 거래 건수는 모든 행에 있다.
- 부담률에 `data-level`로 등급을 노출하고 CSS가 색을 입힌다. **등급 텍스트를 함께 낸다.**
- 어느 가격 기준인지 문구로 드러낸다 — 사용자가 "이 숫자가 어디서 나왔지"라고 묻지 않도록.
- 건축년도는 **같은 이름·같은 법정동에 둘 이상 있을 때만** 붙인다.
- 문구는 **해요체**다. `scripts/tone-guard.test.ts`가 검사한다.
- 지역 선택이 `isRegulatedArea`를 `rules.regulatedRegionCodes` 기준으로 정하고, 그 항목을 `touched`로 표시해 가정 문구에서 빠지게 한다.
- 목록이 길다 — 화면 렌더링 성능이 문제가 되면 **가상 스크롤을 도입하지 말고** 상위 N개만 보여주고 "더 보기"를 둔다. N과 그 이유를 보고서에 쓴다.

- [ ] **Step 5: 신선도를 표시한다**

`DATA_AS_OF`와 함께 **국토부 신고가 약 30일 늦어 최근 달은 과소 보고된다**는 사실을 말한다. 그 문장이 없으면 사용자는 최근 달 거래가 적은 것을 시장이 얼어붙은 것으로 읽는다.

- [ ] **Step 6: 전체 스위트·타입체크·빌드**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: 전부 PASS. JS gzip 증가가 70KB 이내.

- [ ] **Step 7: 브라우저에서 확인한다**

Run: `npm run dev`

확인할 것:
- 현금 2억 / 연소득 6천만원 / 생애최초 → 단지 목록이 나온다
- 두 덩어리 헤더가 보이고, 안전선 위아래로 갈려 있다
- 각 행에 **범위와 거래 건수**가 있고 **중위값 단일 숫자가 없다**
- 변동률이 어디에도 없다
- 지역을 고르면 목록이 줄고 **규제지역 가정 문구가 사라진다**
- 데이터 기준일과 신고 지연 문구가 보인다

확인 후 서버를 끈다. 각 항목의 실제 결과를 보고서에 쓴다 — 확인하지 못한 항목은 확인했다고 쓰지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/ src/App.tsx src/state/useProfileForm.ts rules/2026-08.json src/lib/finance/types.ts src/lib/finance/rules.ts src/integration.test.tsx
git commit -m "feat: 단지 목록 화면을 붙인다

시세는 범위와 거래 건수로만 낸다 — 중위값 하나를 이 단지 시세로
내놓지 않는다. 그 결정이 저신뢰 69.6% 문제도 함께 푼다.

목록이 안전선에서 갈린다. 어디까지가 무리 없는지를 배지 하나가 아니라
목록 구조가 말한다.

지역을 고르면 규제지역 여부가 그 지역에서 정해져 가정 문구에서 빠진다.
대응표는 룰셋에 둔다 — 규제지역 지정은 바뀌고, 바뀔 때 코드를 고치게
만들면 안 된다."
```

---

## 완료 확인

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

- 전체 스위트 통과, 타입체크 클린, 빌드 성공
- 단지 목록이 안전선에서 갈려 표시된다
- 시세가 범위와 거래 건수로만 나오고 `medianPrice`가 화면에 없다
- 변동률이 화면에 없다
- 안전선과 목록 부담률이 같은 `calcBurdenAt`을 쓴다
- 지역을 고르면 규제지역 가정이 사라진다
- 결과 0개일 때 이 사용자에게 맞는 조치를 말한다
- JS gzip 증가가 70KB 이내
