# 룰셋 검증 반영 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공식 출처로 검증한 네 가지 규제·비용 사실을 엔진과 UI에 반영해, 계산기가 필요 현금을 과소평가하고 대출 한도를 과대평가하던 오류를 없앤다.

**Architecture:** 규제 수치는 `rules/2026-03.json`에만 존재한다는 기존 원칙을 유지한다. LTV에 규제지역 축을 추가하고, 취득 부대비용에 중개보수 부가세와 국민주택채권 본인부담금을 더한다. 엔진(`src/lib/finance/`)은 이 계획에서 **의도적으로 수정 대상**이다 — 앞선 계획들의 "엔진 불변" 제약은 여기서는 적용되지 않는다.

**Tech Stack:** TypeScript 7, Vitest 4 + jsdom, React 19 (Vite)

## Global Constraints

- 규제 수치(요율·비율·구간 경계·가정치)를 코드에 하드코딩하지 않는다. 전부 `rules/2026-03.json`에서 읽는다.
- 모든 함수는 순수 함수다. `fetch`, `fs`, `Date.now()`, 전역 변수 접근 금지 (`no-network.test.ts`만 예외).
- 모든 반환 금액은 원 단위 정수다.
- **네트워크 요청 0**을 유지한다. `no-network.test.ts`가 통과해야 한다.
- 검증 불가능한 값을 지어내지 않는다. 불확실한 인자는 룰셋에 **가정치임을 이름과 주석으로 명시**하고 화면에도 추정치임을 밝힌다.
- 기존 테스트를 약화하거나 삭제하지 않는다. 값이 바뀌어야 하면 왜 바뀌는지 주석을 남긴다.
- 파일당 하나의 책임. 200줄 초과 시 같은 파일 내 헬퍼 추출.
- 테스트는 대상과 같은 디렉토리에 `*.test.ts` / `*.test.tsx`.
- 커밋 메시지는 Conventional Commits, **제목은 한국어**.
- TypeScript strict, `noUncheckedIndexedAccess`. `any` 금지, 불필요한 non-null assertion 금지.

---

## 검증된 사실 (이 계획의 근거)

| 항목 | 확인된 사실 | 출처 |
|---|---|---|
| 규제지역 LTV | 규제지역 무주택·처분조건부 1주택 **40%**. 생애최초는 규제지역에서도 **70%** 예외. 비규제 수도권은 무주택 70% | 금융위 「주택시장 안정화 대책」 |
| 중개보수 부가세 | **별도 부과**. 일반과세자 10%, 간이과세자는 부가세법상 별도 수취 불가 | 공인중개사법 실무 |
| 국민주택채권 | 소유권이전등기 시 **시가표준액(공동주택 공시가격)** 기준 매입. 특별시·광역시 구간별 1,000원당 13/19/21/23/26/31원 | 주택도시기금법 시행령 별표 |
| 보금자리론 금리 | 2026-01-01 공시 u-보금자리론 4.00~4.30%. 룰셋의 4.2%는 범위 내 — **플레이스홀더 아님**. 단 2026-07-07 고시는 5.00~5.30%로 상승 | 한국주택금융공사 공시 |

**검증하지 못한 두 인자** (가정치로 명시하여 룰셋에 둔다):
- 공동주택 공시가격 / 매매가 비율 — 단지·연도별로 달라 단일 값으로 확정 불가
- 국민주택채권 할인율 — 매일 변동. 조사한 출처들이 4%~10%로 갈림

---

## File Structure

| 파일 | 이 계획에서의 변경 |
|---|---|
| `rules/2026-03.json` | `ltv`에 규제/비규제 축, `brokerageFee`에 부가세, `housingBond` 신설 |
| `src/lib/finance/types.ts` | `BuyerProfile.isRegulatedArea`, `Rules.ltv`/`brokerageVat`/`housingBond`, `CostBreakdown` 확장 |
| `src/lib/finance/rules.ts` | 새 필드 검증 및 불변식 |
| `src/lib/finance/loan-limit.ts` | `calcLtvLimit`이 규제지역·생애최초로 분기 |
| `src/lib/finance/acquisition-cost.ts` | 중개보수 부가세, 국민주택채권 본인부담금 |
| `src/lib/finance/profile.ts` | 새 필드 검증 |
| `src/lib/finance/golden.test.ts` | 규제지역 LTV 골든 테스트 |
| `src/state/useProfileForm.ts` | `isRegulatedArea` 상태·기본값·저장 |
| `src/components/ProfileForm.tsx` | 규제지역 체크박스 |
| `src/components/CostBreakdown.tsx` | 새 비용 항목 표시 |
| `docs/superpowers/specs/2026-08-17-예산계산기-UI-design.md` | 10절 미해결 항목 갱신 |

---

## Task 1: 룰셋 스키마 확장과 검증

**Files:**
- Modify: `rules/2026-03.json`, `src/lib/finance/types.ts`, `src/lib/finance/rules.ts`
- Test: `src/lib/finance/rules.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 확장된 `Rules` 타입과 이를 검증하는 `parseRules`

- [ ] **Step 1: 룰셋 값 변경**

`rules/2026-03.json`에서 `ltv`를 교체하고 두 필드를 추가한다. 다른 필드는 건드리지 않는다.

```jsonc
  "ltv": {
    "regulated":   { "default": 0.4, "firstTimeBuyer": 0.7 },
    "unregulated": { "default": 0.7, "firstTimeBuyer": 0.7 }
  },
  "brokerageVatRate": 0.1,
  "housingBond": {
    "_note": "제1종 국민주택채권. 시가표준액(공동주택 공시가격) 기준 매입 후 즉시 매도 시의 할인 손실이 실제 부담액이다.",
    "assumedPriceToStandardRatio": 0.7,
    "assumedDiscountRate": 0.08,
    "brackets": [
      { "upTo": 20000000,   "perThousand": 0 },
      { "upTo": 50000000,   "perThousand": 13 },
      { "upTo": 100000000,  "perThousand": 19 },
      { "upTo": 160000000,  "perThousand": 21 },
      { "upTo": 260000000,  "perThousand": 23 },
      { "upTo": 600000000,  "perThousand": 26 },
      { "upTo": null,       "perThousand": 31 }
    ]
  },
```

`assumedPriceToStandardRatio`와 `assumedDiscountRate`는 **검증하지 못한 가정치**다. 이름의 `assumed` 접두사가 그 사실을 코드에서도 드러낸다. `brackets`의 `perThousand`는 특별시·광역시 기준으로, 주택도시기금법 시행령 별표에서 확인된 값이다.

- [ ] **Step 2: 타입 갱신**

`src/lib/finance/types.ts`에서 `BuyerProfile`에 필드를 추가한다:

```ts
  /**
   * 규제지역(투기과열지구·조정대상지역) 소재 여부.
   *
   * LTV가 크게 갈린다. 규제지역 무주택자는 40%, 비규제 수도권은 70%다.
   * 생애최초는 규제지역에서도 70% 예외를 받는다. 잘못 켜고 끄면 한도가
   * 30%p 어긋나므로, 폼의 기본값은 과대평가를 피하는 쪽(규제지역=true)이다.
   */
  isRegulatedArea: boolean;
```

`Rules`의 `ltv`를 교체하고 두 필드를 추가한다:

```ts
  ltv: {
    regulated: { default: number; firstTimeBuyer: number };
    unregulated: { default: number; firstTimeBuyer: number };
  };
  /** 중개보수에 별도로 붙는 부가가치세율. 일반과세자 기준 0.1 */
  brokerageVatRate: number;
  housingBond: {
    /**
     * 매매가 대비 시가표준액(공동주택 공시가격) 비율.
     * **검증되지 않은 가정치다.** 단지·연도별로 달라 단일 값으로 확정할 수 없다.
     */
    assumedPriceToStandardRatio: number;
    /**
     * 채권 즉시 매도 시 할인율. **검증되지 않은 가정치다.**
     * 매일 변동하며 조사한 출처들이 4%~10%로 갈렸다.
     */
    assumedDiscountRate: number;
    /** 시가표준액 1,000원당 매입액(원). upTo 오름차순, 마지막은 null */
    brackets: Array<{ upTo: number | null; perThousand: number }>;
  };
```

`CostBreakdown`에 두 필드를 추가한다:

```ts
  /** 중개보수에 붙는 부가가치세(원) */
  brokerageVat: number;
  /** 국민주택채권 매입 후 즉시 매도 시의 할인 손실 추정액(원) */
  housingBondCost: number;
```

- [ ] **Step 3: 실패하는 검증 테스트 작성**

`src/lib/finance/rules.test.ts`의 기존 `ltv.default`/`ltv.firstTimeBuyer` 불변식 테스트 케이스 3개를 새 경로로 옮기고, 새 필드 검증을 추가한다. 기존 테스트의 **의도는 유지하되 경로만 바뀐다** — 각 변경에 이유 주석을 단다.

```ts
describe("확장된 룰셋 검증", () => {
  it("규제/비규제 LTV 네 값을 모두 비율로 검증한다", () => {
    for (const path of [
      "ltv.regulated.default",
      "ltv.regulated.firstTimeBuyer",
      "ltv.unregulated.default",
      "ltv.unregulated.firstTimeBuyer",
    ]) {
      const broken = structuredClone(rawRules) as Record<string, unknown>;
      setByPath(broken, path, 1.5);
      expect(() => parseRules(broken), path).toThrow(
        new RegExp(path.replace(/\./g, "\\.")),
      );
    }
  });

  it("brokerageVatRate가 비율 범위를 벗어나면 경로를 짚어 실패한다", () => {
    const broken = { ...rawRules, brokerageVatRate: -0.1 };
    expect(() => parseRules(broken)).toThrow(/brokerageVatRate/);
  });

  it("housingBond 가정치가 비율 범위를 벗어나면 실패한다", () => {
    for (const key of ["assumedPriceToStandardRatio", "assumedDiscountRate"]) {
      const broken = structuredClone(rawRules) as typeof rawRules;
      (broken.housingBond as Record<string, unknown>)[key] = 2;
      expect(() => parseRules(broken), key).toThrow(new RegExp(key));
    }
  });

  it("housingBond 구간이 오름차순이 아니면 실패한다", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    broken.housingBond.brackets = [
      { upTo: 100000000, perThousand: 19 },
      { upTo: 50000000, perThousand: 13 },
      { upTo: null, perThousand: 31 },
    ];
    expect(() => parseRules(broken)).toThrow(/오름차순/);
  });

  it("housingBond 마지막 구간의 upTo가 null이 아니면 실패한다", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    broken.housingBond.brackets = [{ upTo: 50000000, perThousand: 13 }];
    expect(() => parseRules(broken)).toThrow(/마지막 구간/);
  });

  it("perThousand가 음수면 실패한다", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    broken.housingBond.brackets = [
      { upTo: 50000000, perThousand: -1 },
      { upTo: null, perThousand: 31 },
    ];
    expect(() => parseRules(broken)).toThrow(/perThousand/);
  });

  it("실제 룰셋은 통과한다", () => {
    expect(() => parseRules(rawRules)).not.toThrow();
  });
});

/** 점 경로로 중첩 객체의 값을 바꾼다 (테스트 전용) */
function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) return;
  let cursor: Record<string, unknown> = target;
  for (const key of keys) {
    const next = cursor[key];
    if (typeof next !== "object" || next === null) return;
    const copy = { ...(next as Record<string, unknown>) };
    cursor[key] = copy;
    cursor = copy;
  }
  cursor[last] = value;
}
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/finance/rules.test.ts`
Expected: FAIL — 새 필드가 없어 검증이 통과해버리거나 타입 오류

- [ ] **Step 5: `parseRules` 확장**

`src/lib/finance/rules.ts`에서 기존 헬퍼(`assertRatio`, `assertNonNegative`, `assertNumberField`, `assertPlainObject`)를 재사용해 새 필드를 검증한다. 중개보수 구간 검증 로직(`validateBrokerageBrackets`)과 같은 형태의 `housingBond.brackets` 검증을 추가하되, **두 구간 검증이 같은 모양이므로 공용 헬퍼로 묶는다** — 중복 복사하지 않는다.

검증할 것:
- `ltv.regulated` / `ltv.unregulated`가 각각 객체이고 `default`·`firstTimeBuyer`가 `(0, 1]` 비율
- `brokerageVatRate`가 `[0, 1)` 비율
- `housingBond`가 객체, 두 `assumed*`가 `(0, 1]` 비율
- `housingBond.brackets`가 비어 있지 않고, `upTo` 오름차순, 마지막만 `null`, 모든 `perThousand`가 음이 아닌 유한수

기존 `ltv.default`/`ltv.firstTimeBuyer` 검증 두 줄은 새 경로로 교체한다.

- [ ] **Step 6: 테스트와 타입 검사 통과 확인**

Run: `npm test 2>&1 | tail -5`
Expected: 이 시점에는 다른 파일들이 새 `ltv` 형태를 몰라 **타입 오류로 실패한다.** 정상이다 — Task 2·3이 그것을 고친다. `rules.test.ts` 단독은 통과해야 한다.

Run: `npx vitest run src/lib/finance/rules.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 룰셋에 규제지역 LTV·중개보수 부가세·국민주택채권 구간 추가"
```

---

## Task 2: 규제지역 LTV 분기

**Files:**
- Modify: `src/lib/finance/loan-limit.ts`, `src/lib/finance/profile.ts`
- Test: `src/lib/finance/loan-limit.test.ts`, `src/lib/finance/profile.test.ts`, `src/lib/finance/golden.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Rules.ltv.{regulated,unregulated}`, `BuyerProfile.isRegulatedArea`
- Produces: 규제지역을 반영하는 `calcLtvLimit` (내부 함수, 시그니처 불변)

**설계 노트:** 규제지역 무주택자는 40%, 비규제 수도권은 70%다. 생애최초는 **양쪽 모두 70%** 라, 규제지역에서는 생애최초 우대가 30%p로 커지고 비규제에서는 우대가 없다. 이 비대칭이 요점이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/loan-limit.test.ts`의 `profile()` 헬퍼에 `isRegulatedArea: false`를 기본값으로 추가하고(기존 테스트는 비규제 기준이었으므로 값이 유지된다 — 이유를 주석으로 남긴다), 새 describe를 추가한다:

```ts
describe("규제지역 LTV", () => {
  it("규제지역 무주택자는 40%다", () => {
    const result = calcMaxLoan(
      profile({ isRegulatedArea: true, annualIncome: 1_000_000_000 }),
      rules,
      300_000_000,
    );
    expect(result.breakdown.LTV).toBe(120_000_000);
  });

  it("비규제 수도권 무주택자는 70%다", () => {
    const result = calcMaxLoan(
      profile({ isRegulatedArea: false, annualIncome: 1_000_000_000 }),
      rules,
      300_000_000,
    );
    expect(result.breakdown.LTV).toBe(210_000_000);
  });

  it("생애최초는 규제지역에서도 70%로 예외를 받는다", () => {
    const result = calcMaxLoan(
      profile({
        isRegulatedArea: true,
        isFirstTimeBuyer: true,
        annualIncome: 1_000_000_000,
      }),
      rules,
      300_000_000,
    );
    expect(result.breakdown.LTV).toBe(210_000_000);
  });

  it("규제지역에서는 생애최초 우대가 30%p로 커진다", () => {
    const base = calcMaxLoan(
      profile({ isRegulatedArea: true, annualIncome: 1_000_000_000 }),
      rules,
      300_000_000,
    );
    const first = calcMaxLoan(
      profile({
        isRegulatedArea: true,
        isFirstTimeBuyer: true,
        annualIncome: 1_000_000_000,
      }),
      rules,
      300_000_000,
    );
    expect(first.breakdown.LTV - base.breakdown.LTV).toBe(90_000_000);
  });

  it("비규제 수도권에서는 생애최초 우대가 없다", () => {
    const base = calcMaxLoan(
      profile({ isRegulatedArea: false, annualIncome: 1_000_000_000 }),
      rules,
      300_000_000,
    );
    const first = calcMaxLoan(
      profile({
        isRegulatedArea: false,
        isFirstTimeBuyer: true,
        annualIncome: 1_000_000_000,
      }),
      rules,
      300_000_000,
    );
    expect(first.breakdown.LTV).toBe(base.breakdown.LTV);
  });
});
```

`src/lib/finance/profile.test.ts`에 `isRegulatedArea`가 불리언이 아니면 던지는 테스트를 추가한다.

`src/lib/finance/golden.test.ts`에 규제지역 골든 테스트를 추가한다:

```ts
// 출처: 금융위 「주택시장 안정화 대책」 — 규제지역 무주택자·처분조건부
// 1주택자의 LTV는 70%에서 40%로 강화됐고, 생애최초만 규제지역에서도
// 70% 예외를 받는다. 이 두 수치가 어긋나면 룰셋을 먼저 의심한다.
it("규제지역 무주택자 LTV는 40%, 생애최초는 70%다", () => {
  expect(rules.ltv.regulated.default).toBe(0.4);
  expect(rules.ltv.regulated.firstTimeBuyer).toBe(0.7);
  expect(rules.ltv.unregulated.default).toBe(0.7);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/finance/loan-limit.test.ts`
Expected: FAIL — `isRegulatedArea`가 `BuyerProfile`에 없거나 `calcLtvLimit`이 무시함

- [ ] **Step 3: 구현**

`src/lib/finance/loan-limit.ts`의 `calcLtvLimit`을 교체한다:

```ts
function calcLtvLimit(
  profile: BuyerProfile,
  rules: Rules,
  price: number,
): number {
  // 규제지역 무주택자는 40%, 비규제 수도권은 70%. 생애최초는 양쪽 모두
  // 70%라, 규제지역에서만 생애최초 우대가 실제 의미를 갖는다.
  const table = profile.isRegulatedArea
    ? rules.ltv.regulated
    : rules.ltv.unregulated;
  const rate = profile.isFirstTimeBuyer ? table.firstTimeBuyer : table.default;
  return price * rate;
}
```

`src/lib/finance/profile.ts`의 `assertValidProfile`에 불리언 검증을 추가한다 (`isFirstTimeBuyer`와 같은 형태로).

- [ ] **Step 4: 기존 테스트 픽스처 갱신**

`isRegulatedArea`가 필수 필드가 되었으므로 `BuyerProfile`을 만드는 모든 테스트 픽스처가 컴파일되지 않는다. 각 파일의 `profile()` 헬퍼에 `isRegulatedArea: false`를 추가한다 — 기존 테스트는 전부 비규제 70% 기준으로 쓰였으므로 **값이 바뀌지 않는다.** 브루트포스 테스트의 기대값도 바뀌지 않아야 한다.

**만약 브루트포스 테스트가 실패하면 STOP하고 BLOCKED로 보고한다.** 그건 LTV 변경이 이분 탐색의 단조성을 건드렸다는 뜻이고, 내가 볼 문제다.

- [ ] **Step 5: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 새 테스트 6개가 더해지고 기존 테스트는 값 변경 없이 통과

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "fix: 규제지역 LTV 40%를 반영해 한도 과대평가 제거"
```

---

## Task 3: 중개보수 부가세와 국민주택채권

**Files:**
- Modify: `src/lib/finance/acquisition-cost.ts`
- Test: `src/lib/finance/acquisition-cost.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Rules.brokerageVatRate`, `Rules.housingBond`, `CostBreakdown`의 새 필드
- Produces: 두 항목을 포함하는 `calcAcquisitionCosts`

**설계 노트:** 두 항목 모두 **필요 현금을 늘리므로 실구매력을 낮춘다.** 지금까지 이 계산기는 둘 다 0으로 두어 실구매력을 과대평가하고 있었다 — 이 제품이 가장 피해야 할 방향의 오류다.

국민주택채권은 매매가가 아니라 **시가표준액(공동주택 공시가격)** 기준으로 매입한다. 우리는 공시가격을 모르므로 `assumedPriceToStandardRatio`로 추정한다. 실제 부담은 채권을 즉시 매도할 때의 할인 손실이므로 `assumedDiscountRate`를 곱한다. 두 인자 모두 가정치이며, 그 사실이 이름에 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/finance/acquisition-cost.test.ts`에 추가한다 (기존 테스트는 손대지 않는다 — 다만 `total`을 검증하는 기존 테스트는 새 항목이 더해지므로 값이 바뀐다. 그 테스트에는 이유 주석을 남기고 갱신한다):

```ts
describe("중개보수 부가가치세", () => {
  it("중개보수의 10%가 부가세로 붙는다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.brokerageFee).toBe(2_000_000);
    expect(costs.brokerageVat).toBe(200_000);
  });

  it("부가세는 상한이 적용된 뒤의 중개보수에 붙는다", () => {
    // 1.8억은 상한 80만원이 걸리는 구간이다. 부가세는 90만원(상한 전)이
    // 아니라 80만원(상한 후)의 10%여야 한다.
    const costs = calcAcquisitionCosts(180_000_000, profile(), rules);
    expect(costs.brokerageFee).toBe(800_000);
    expect(costs.brokerageVat).toBe(80_000);
  });

  it("부가세율이 0이면 부가세도 0이다", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), {
      ...rules,
      brokerageVatRate: 0,
    });
    expect(costs.brokerageVat).toBe(0);
  });
});

describe("국민주택채권", () => {
  it("시가표준액 추정 후 구간 매입률과 할인율을 곱한다", () => {
    // 매매가 5억 × 공시비율 0.7 = 시가표준액 3.5억
    // → 2.6억~6억 구간, 1,000원당 26원 = 3.5억 × 0.026 = 910만원 채권
    // → 할인율 8% = 728,000원
    const costs = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(costs.housingBondCost).toBe(728_000);
  });

  it("가격이 오르면 구간이 올라가 부담도 커진다", () => {
    const low = calcAcquisitionCosts(300_000_000, profile(), rules);
    const high = calcAcquisitionCosts(900_000_000, profile(), rules);
    expect(high.housingBondCost).toBeGreaterThan(low.housingBondCost);
  });

  it("시가표준액이 최저 구간 미만이면 채권 부담이 없다", () => {
    // 매매가 2,000만 × 0.7 = 1,400만 → 2,000만 미만 구간, 매입률 0
    const costs = calcAcquisitionCosts(20_000_000, profile(), rules);
    expect(costs.housingBondCost).toBe(0);
  });

  it("할인율이 0이면 부담이 0이다 (채권을 팔지 않는 경우)", () => {
    const costs = calcAcquisitionCosts(500_000_000, profile(), {
      ...rules,
      housingBond: { ...rules.housingBond, assumedDiscountRate: 0 },
    });
    expect(costs.housingBondCost).toBe(0);
  });
});

describe("확장된 total", () => {
  it("total은 여섯 항목의 합이다", () => {
    const c = calcAcquisitionCosts(500_000_000, profile(), rules);
    expect(c.total).toBe(
      c.acquisitionTax +
        c.brokerageFee +
        c.brokerageVat +
        c.legalFee +
        c.movingCost +
        c.housingBondCost,
    );
  });

  it("모든 금액은 정수다", () => {
    const c = calcAcquisitionCosts(777_777_777, profile(), rules);
    for (const value of Object.values(c)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("두 항목이 더해져 total이 이전보다 커진다", () => {
    const c = calcAcquisitionCosts(500_000_000, profile(), rules);
    const withoutNew = c.total - c.brokerageVat - c.housingBondCost;
    expect(c.total).toBeGreaterThan(withoutNew);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/finance/acquisition-cost.test.ts`
Expected: FAIL — `brokerageVat`/`housingBondCost`가 없음

- [ ] **Step 3: 구현**

`src/lib/finance/acquisition-cost.ts`를 확장한다:

```ts
export function calcAcquisitionCosts(
  price: number,
  profile: BuyerProfile,
  rules: Rules,
): CostBreakdown {
  assertNonNegativeFinite(price, "price");
  const acquisitionTax = calcAcquisitionTax(price, profile, rules);
  const brokerageFee = calcBrokerageFee(price, rules);
  // 부가세는 상한이 적용된 뒤의 중개보수에 붙는다.
  const brokerageVat = Math.floor(brokerageFee * rules.brokerageVatRate);
  const housingBondCost = calcHousingBondCost(price, rules);
  const legalFee = Math.floor(rules.legalFee);
  const movingCost = Math.floor(rules.movingCost);

  return {
    acquisitionTax,
    brokerageFee,
    brokerageVat,
    legalFee,
    movingCost,
    housingBondCost,
    total: Math.floor(
      acquisitionTax +
        brokerageFee +
        brokerageVat +
        legalFee +
        movingCost +
        housingBondCost,
    ),
  };
}

/**
 * 국민주택채권 매입 후 즉시 매도 시의 할인 손실 추정액.
 *
 * 채권 매입액은 매매가가 아니라 시가표준액(공동주택 공시가격) 기준이다.
 * 이 엔진은 공시가격을 모르므로 `assumedPriceToStandardRatio`로 추정하며,
 * 그 값과 `assumedDiscountRate`는 모두 **검증되지 않은 가정치**다.
 * 화면에서도 추정치임을 밝혀야 한다.
 */
function calcHousingBondCost(price: number, rules: Rules): number {
  const bond = rules.housingBond;
  const standardValue = price * bond.assumedPriceToStandardRatio;

  const bracket = bond.brackets.find(
    (b) => b.upTo === null || standardValue < b.upTo,
  );
  if (!bracket) {
    throw new Error(`국민주택채권 구간을 찾을 수 없습니다: ${standardValue}`);
  }

  const purchase = (standardValue * bracket.perThousand) / 1_000;
  return Math.floor(purchase * bond.assumedDiscountRate);
}
```

- [ ] **Step 4: 값이 바뀌는 기존 테스트 갱신**

`total`을 단언하던 기존 테스트와, `useAffordability`/`affordable-price`의 브루트포스 테스트가 영향을 받는다. 브루트포스 테스트는 스스로 최적값을 계산하므로 **통과해야 한다** — 실패하면 STOP하고 BLOCKED로 보고한다.

`total` 기대값이 바뀌는 테스트에는 왜 바뀌는지(두 항목 추가) 주석을 남긴다.

- [ ] **Step 5: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "fix: 중개보수 부가세와 국민주택채권 부담을 부대비용에 반영"
```

---

## Task 4: UI 반영

**Files:**
- Modify: `src/state/useProfileForm.ts`, `src/components/ProfileForm.tsx`, `src/components/CostBreakdown.tsx`
- Test: `src/state/useProfileForm.test.ts`, `src/components/CostBreakdown.test.tsx`, `src/integration.test.tsx`

**Interfaces:**
- Consumes: Task 1~3의 `BuyerProfile.isRegulatedArea`, `CostBreakdown`의 새 필드
- Produces: 규제지역을 입력받고 새 비용 항목을 보여주는 화면

**설계 노트:** `isRegulatedArea`의 폼 기본값은 **`true`(규제지역)** 다. `isFirstTimeBuyer`가 `false`인 것과 같은 이유의 반대 방향이다 — 잘못 켜두면 한도를 **과소**평가하고, 잘못 꺼두면 **과대**평가한다. 이 제품은 과대평가를 피한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/state/useProfileForm.test.ts`:

```ts
it("규제지역 기본값은 true다 — 과대평가를 피하는 쪽이다", () => {
  expect(DEFAULT_FORM_STATE.isRegulatedArea).toBe(true);
});

it("저장된 비불리언 isRegulatedArea는 기본값으로 되돌린다", () => {
  for (const bad of ['"true"', "1", "null"]) {
    const stored = JSON.stringify({
      ...DEFAULT_FORM_STATE,
      isRegulatedArea: JSON.parse(bad),
    });
    const loaded = loadStoredState({ getItem: () => stored });
    expect(loaded.isRegulatedArea, bad).toBe(true);
  }
});

it("toProfile이 규제지역을 그대로 전달한다", () => {
  const p = toProfile(
    state({ cash: 1, annualIncome: 1, isRegulatedArea: false }),
  );
  expect(p?.isRegulatedArea).toBe(false);
});
```

`src/components/CostBreakdown.test.tsx` (신설 — 최종 리뷰가 지적한 테스트 공백도 함께 메운다):

```tsx
it("여섯 항목을 모두 표시한다", () => { /* 각 항목 라벨과 금액 */ });
it("국민주택채권 항목에 추정치임을 밝힌다", () => { /* "추정" 문구 */ });
it("합계는 total을 그대로 쓴다", () => { /* 재계산하지 않음 */ });
```

`src/integration.test.tsx`:

```tsx
it("규제지역 체크를 끄면 실구매력이 올라간다", async () => {
  render(<App />);
  await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
  await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

  const before = readAffordablePrice();
  await userEvent.click(screen.getByLabelText(/규제지역/));
  expect(readAffordablePrice()).toBeGreaterThan(before);
});
```

`readAffordablePrice`는 `.affordable-price`의 텍스트에서 숫자만 뽑는 헬퍼로 파일 상단에 둔다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/state/useProfileForm.test.ts src/integration.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`useProfileForm.ts`: `ProfileFormState`에 `isRegulatedArea: boolean` 추가, `DEFAULT_FORM_STATE`에 `true`, `loadStoredState`에 불리언 검증(기존 `isFirstTimeBuyer`와 동일 형태), `toProfile`이 전달.

`ProfileForm.tsx`: 생애최초 체크박스 옆에 규제지역 체크박스를 둔다. 라벨은 `규제지역(투기과열지구·조정대상지역)`, 힌트로 무주택자 LTV가 40%와 70%로 갈린다는 사실을 한 줄 적는다.

`CostBreakdown.tsx`: `ROWS`에 두 항목을 추가한다. 국민주택채권 행에는 추정치임을 밝히는 짧은 문구를 붙인다.

- [ ] **Step 4: 테스트와 타입 검사, 빌드 통과 확인**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 규제지역 입력과 새 부대비용 항목을 화면에 반영"
```

---

## Task 5: 문서 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-예산계산기-UI-design.md`
- Modify: `docs/superpowers/specs/2026-08-16-예산기반-부동산-추천-design.md`

**Interfaces:**
- Consumes: Task 1~4의 결과
- Produces: 현실과 일치하는 스펙

- [ ] **Step 1: Plan C 스펙 10절 갱신**

`docs/superpowers/specs/2026-08-17-예산계산기-UI-design.md`의 10절을 다음으로 교체한다. 해결된 것은 해결됐다고, 남은 것은 왜 남았는지 적는다.

- 중개보수 부가세 — **해결**. 일반과세자 10% 반영. 간이과세자는 별도 수취 불가라 과대 추정일 수 있음을 명시
- 국민주택채권 — **부분 해결**. 매입률 표는 법령 별표로 확정. 공시가격 비율과 할인율은 **가정치**로 남음
- 보금자리론 금리 — **해결**. 플레이스홀더 아님이 확인됨. 다만 2026-07 고시가 5.00~5.30%로 올라 룰셋 버전 갱신이 필요함을 새 항목으로 기록
- `ltv.default` — **해결이자 결함 발견**. 규제지역 40%가 누락돼 있었고 이번에 축을 추가함

- [ ] **Step 2: 부모 스펙 7절 갱신**

`2026-08-16` 스펙의 7절에서 "지역 축을 두지 않는다"는 서술이 더 이상 사실이 아니다. 규제지역 축이 생겼음을 반영하고, 여전히 없는 축(수도권/비수도권)이 무엇인지 구분해 적는다.

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "docs: 룰셋 검증 결과와 규제지역 축 추가를 스펙에 반영"
```

---

## 완료 기준

- [ ] `npm test`가 전부 통과한다
- [ ] `npm run typecheck`에 오류가 없다
- [ ] `npm run build`가 성공한다
- [ ] `no-network.test.ts`가 통과한다
- [ ] 브루트포스 테스트가 값 조정 없이 통과한다
- [ ] 규제 수치가 코드에 하드코딩된 곳이 없다
- [ ] 가정치 두 개가 `assumed` 접두사와 주석으로 명시돼 있고, 화면에도 추정치임이 드러난다

## 남는 숙제

- 국민주택채권의 두 가정치 — 공시가격 비율과 할인율. 실제 값에 접근할 방법이 생기면 교체
- 룰셋 버전 `2026-03`이 오늘(2026-08) 기준으로 낡음. 보금자리론 금리가 4.2% → 5.0~5.3%로 올랐고 규제지역 지정도 7월에 확대됨. `2026-08` 룰셋 신설 검토
