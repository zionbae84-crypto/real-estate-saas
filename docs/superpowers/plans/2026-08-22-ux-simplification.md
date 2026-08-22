# 예산 계산기 UX 단순화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 화면 입력을 여덟에서 셋으로 줄이고, 숨긴 가정을 결과 옆 문장으로 드러내며, "무리 없는 선"을 최대 가격과 나란히 보여준다.

**Architecture:** 엔진에 없던 "안전을 유지하는 최대 가격"을 먼저 만든다. 그 탐색은 `calcAffordablePrice`와 **정확히 같은 절벽** 위에서 돌아야 하므로 탐색 기계를 술어만 갈아끼우도록 일반화해 공유한다. 그 위에서 화면을 SEED Design 컴포넌트로 다시 짓는다 — 폼은 세 항목만 남기고, 나머지는 기본값으로 계산하되 그 가정을 결과 옆에 문장으로 노출한다.

**Tech Stack:** React 19 + Vite 7, TypeScript strict + `noUncheckedIndexedAccess`, Vitest 4 + jsdom + Testing Library, SEED Design (`@seed-design/react` 2.3.0 / `@seed-design/css` 2.5.0)

## Global Constraints

- **가정은 기존 부채를 제외하고 전부 사용자에게 불리한 쪽이다.** 규제지역 `true`, 전용면적은 농특세가 붙는 쪽. 유리한 쪽으로 기본값을 두면 우리가 "낙관적인 앱"이 된다.
- **기존 부채 가정(0원)만 방향이 반대다.** 없는 빚을 지어낼 수 없으므로 0으로 두되, **가정 문구에 반드시 드러낸다.**
- **전용면적 기본값은 룰셋의 `acquisitionTax.ruralTaxAreaThresholdSqm`에서 유도한다.** 숫자를 코드에 박지 않는다 — 임계값이 바뀌면 "불리한 쪽"이라는 성질이 조용히 뒤집힌다.
- **`MoneyInput`의 해석 결과 되비추기를 없애지 않는다.** 만원 기본 해석을 성립시키는 안전장치다.
- **엔진의 `BuyerProfile`을 바꾸지 않는다.** 월→연 변환은 UI 층에서 한다.
- **`Checkbox`의 `onCheckedChange`는 `boolean | "indeterminate"`다.** `as boolean`으로 뭉개지 말고 명시적으로 좁힌다. `"indeterminate"`를 참으로 취급하면 규제지역 LTV가 40%→70%로 뛰어 한도를 30%p 과대 계상한다.
- **`Slider`의 값은 배열**(`values: number[]`, `onValuesChange`), **`getAriaLabel`은 필수 prop.**
- **`TextField`의 `onValueChange`는 객체를 준다.** 글자수 제한이 적용된 값은 `slicedValue`다.
- **`Text`에는 `as` prop이 없다.** 제목 계층이 필요한 곳에 쓰지 않는다.
- **안전선은 `PRICE_STEP` 단위로 내림한다.** 올림하면 안전하지 않은 가격을 안전하다고 말하게 된다.
- **경고(`WarningList`)는 접지 않는다.**
- 모든 금액은 **원 단위 정수**.
- 파일당 하나의 책임. **파일을 쪼개지 말고** 같은 파일 안에서 헬퍼를 추출한다.
- `any` 금지, 불필요한 non-null assertion 금지.
- 테스트는 대상과 같은 디렉토리에 `*.test.ts(x)`. 테스트 출력은 깨끗해야 한다.
- **`src/no-network.test.ts`가 지키는 약속을 깨지 않는다.** `src/` 안에서 `fetch`·XHR·동적 `import(`·Node 내장 모듈 임포트 금지. 파일을 읽어야 하는 빌드 타임 검사는 `scripts/`에 둔다.
- 커밋 메시지는 Conventional Commits, 제목은 한국어.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/lib/finance/affordable-price.ts` | 가격 공간 탐색 | 탐색을 술어로 일반화, `searchMaxPrice` export |
| `src/lib/finance/safe-price.ts` | 안전선 계산 | 신규 |
| `src/lib/finance/index.ts` | 공개 API | `calcSafePrice` 추가 |
| `seed-design/ui/text-field.tsx` 등 | SEED 스니펫 | CLI로 추가 |
| `src/components/MoneyInput.tsx` | 한국식 금액 입력 | 내부 원시 요소만 SEED로 |
| `src/components/ProfileForm.tsx` | 첫 화면 폼 | 세 항목만 남김 |
| `src/components/AssumptionLine.tsx` | 가정 문구 | 신규 |
| `src/components/BudgetResult.tsx` | 결과 영역 | 계단 구조로 재편 |
| `src/components/SafeLine.tsx` | 안전선 표시 | 신규 |
| `src/state/useProfileForm.ts` | 폼 상태 | 기본값·가정 노출 |

---

## Task 1: 안전선 계산 (`calcSafePrice`)

엔진에 "안전을 유지하는 최대 가격"을 만든다. UI는 건드리지 않는다.

**Files:**
- Modify: `src/lib/finance/affordable-price.ts`
- Create: `src/lib/finance/safe-price.ts`
- Modify: `src/lib/finance/index.ts`
- Test: `src/lib/finance/safe-price.test.ts`

**Interfaces:**
- Produces: `calcSafePrice(profile: BuyerProfile, rules: Rules): number` — Task 4가 쓴다
- Produces: `searchMaxPrice(rules: Rules, accepts: (price: number) => boolean): number` — `affordable-price.ts`에서 export

### 왜 탐색을 공유하는가

`calcAffordablePrice`의 탐색에는 쉽게 재현되지 않는 세부가 들어 있다. 이분 탐색이 `high`를 좁히기만 해서 구간 상단에 도달하지 못하는 문제, 참 임계값이 `PRICE_STEP` 배수와 정확히 일치할 때 부동소수점 오차로 한 단계 아래로 내려가는 문제 — 둘 다 후보를 셋(`floored`, `floored + PRICE_STEP`, 구간 상단)으로 두고 각각 정직하게 재검증해서 막고 있다.

안전선 탐색이 이 구조를 따로 다시 쓰면 그 사각이 되살아난다. 그래서 **절벽 목록만이 아니라 탐색 전체를 공유한다.** 달라지는 것은 술어 하나뿐이다.

- [ ] **Step 1: 탐색을 술어로 일반화한다**

`src/lib/finance/affordable-price.ts`에서 `searchSegment`의 시그니처를 바꾼다. `profile`·`rules`·`cashAmount`를 받아 내부에서 `ownFundsRequired`를 부르던 것을, **"이 가격이 받아들여지는가"를 답하는 함수 하나**를 받도록 한다.

```ts
/**
 * 한 구간(f가 단조라고 가정할 수 있는 범위) 안에서 `accepts`가 참인 최대
 * 가격을 이분 탐색으로 찾는다.
 *
 * `accepts`는 "이 가격이 조건을 만족하는가"를 답한다. 감당 가능 여부든
 * 안전 등급이든, 가격이 오를수록 거짓으로 바뀌는 성질이면 된다.
 */
function searchSegment(
  segment: SearchSegment,
  accepts: (price: number) => boolean,
): number | null {
  const { low: segLow, high: segHigh } = segment;
  if (segLow > segHigh) return null;
  if (!accepts(segLow)) return null;

  let low = segLow;
  let high = segHigh;

  // 50회면 100억 범위를 0.01원 미만까지 좁힌다
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (accepts(mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // 이분 탐색은 high를 좁히기만 하고 low에 대입하지 않으므로, 구간 전체를
  // 받아들일 수 있어도 low는 segHigh에 무한히 가까워질 뿐 도달하지 못한다.
  // 그대로 내림하면 답이 한 스텝(PRICE_STEP) 낮게 나온다 — 구간 상단
  // 자체도 후보로 함께 검증한다.
  //
  // 같은 이유로, 참 임계값이 구간 "내부"에서 정확히 PRICE_STEP의 배수와
  // 일치할 때도 low는 부동소수점 오차로 그 값 바로 아래에서 수렴한다.
  // floored는 그 순간 한 단계 아래로 내려가므로, floored + PRICE_STEP도
  // 후보에 넣어 같은 사각을 구제한다.
  const floored = Math.floor(low / PRICE_STEP) * PRICE_STEP;
  const candidates = [
    floored,
    floored + PRICE_STEP,
    Math.floor(segHigh / PRICE_STEP) * PRICE_STEP,
  ];

  let best: number | null = null;
  for (const candidate of candidates) {
    if (candidate < segLow) continue;
    // 구간 가정에 기대지 않고, 실제 가격에서 정직하게 재검증한다.
    if (!accepts(candidate)) continue;
    if (best === null || candidate > best) best = candidate;
  }

  return best;
}
```

같은 파일에 구간 전체를 도는 공개 진입점을 추가한다.

```ts
/**
 * 룰셋이 만드는 모든 절벽에서 구간을 나눠, `accepts`가 참인 최대 가격을 찾는다.
 *
 * **`calcAffordablePrice`와 `calcSafePrice`가 이 함수를 공유한다.** 두 숫자는
 * 화면에 나란히 놓이므로 서로 다른 절벽 위에서 계산되면 안 된다. 절벽 목록만
 * 공유하고 탐색을 각자 쓰면, 구간 상단·PRICE_STEP 경계 처리 같은 세부가
 * 한쪽에만 반영되는 결함이 난다.
 *
 * `accepts`는 부작용이 없어야 하고, 같은 가격에 대해 같은 답을 줘야 한다.
 */
export function searchMaxPrice(
  rules: Rules,
  accepts: (price: number) => boolean,
): number {
  let best = 0;
  for (const segment of buildSearchSegments(rules)) {
    const candidate = searchSegment(segment, accepts);
    if (candidate !== null && candidate > best) best = candidate;
  }
  return best;
}
```

`calcAffordablePrice` 안의 구간 순회 루프를 이 함수 호출로 바꾼다. 현금 부족으로 즉시 0을 돌려주는 기존 조기 반환과 `resultAt` 호출은 그대로 둔다.

- [ ] **Step 2: 기존 테스트가 그대로 통과하는지 확인한다**

Run: `npx vitest run src/lib/finance/`
Expected: PASS — 리팩터링이므로 **기존 기대값이 하나도 바뀌면 안 된다.**

깨지면 기대값을 고치지 말고 리팩터링을 의심한다. 그래도 원인을 못 찾겠으면 BLOCKED로 보고한다.

- [ ] **Step 3: 실패하는 테스트를 쓴다 — 안전선**

`src/lib/finance/safe-price.test.ts`를 만든다.

```ts
import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-08.json";
import { calcAffordablePrice, PRICE_STEP } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { parseRules } from "./rules";
import { calcSafePrice } from "./safe-price";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile } from "./types";

const rules = parseRules(rawRules);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 60_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: true,
    exclusiveAreaSqm: 84,
    isRegulatedArea: true,
    ...overrides,
  };
}

/** 그 가격에서 안전 등급이 safe인가 */
function isSafeAt(p: BuyerProfile, price: number): boolean {
  const loan = calcMaxLoan(p, rules, price);
  return calcSafetyScore(p, rules, loan.amount).level === "safe";
}

describe("calcSafePrice", () => {
  it("안전선 가격은 실제로 안전하다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    expect(isSafeAt(p, safe)).toBe(true);
  });

  it("안전선 한 스텝 위는 안전하지 않다 — 진짜 최대다", () => {
    const p = profile();
    const safe = calcSafePrice(p, rules);
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    // 안전선이 실구매력과 같으면 위쪽이 없으므로 이 단언은 적용되지 않는다
    if (safe < affordable) {
      expect(isSafeAt(p, safe + PRICE_STEP)).toBe(false);
    }
  });

  it("안전선은 실구매력을 넘지 않는다", () => {
    const p = profile();
    expect(calcSafePrice(p, rules)).toBeLessThanOrEqual(
      calcAffordablePrice(p, rules).affordablePrice,
    );
  });

  it("PRICE_STEP 단위로 떨어진다", () => {
    expect(calcSafePrice(profile(), rules) % PRICE_STEP).toBe(0);
  });

  it("소득이 오르면 안전선이 내려가지 않는다", () => {
    const low = calcSafePrice(profile({ annualIncome: 50_000_000 }), rules);
    const high = calcSafePrice(profile({ annualIncome: 150_000_000 }), rules);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("기존 부채가 늘면 안전선이 올라가지 않는다", () => {
    const none = calcSafePrice(profile({ existingDebtAnnualPayment: 0 }), rules);
    const some = calcSafePrice(
      profile({ existingDebtAnnualPayment: 20_000_000 }),
      rules,
    );
    expect(some).toBeLessThanOrEqual(none);
  });

  it("현금이 0이면 안전선도 0이다", () => {
    // 살 수 없는 가격을 안전하다고 말할 수 없다
    expect(calcSafePrice(profile({ cash: 0 }), rules)).toBe(0);
  });

  it("브루트포스와 일치한다", () => {
    const p = profile();
    const affordable = calcAffordablePrice(p, rules).affordablePrice;
    let brute = 0;
    for (let price = 0; price <= affordable; price += PRICE_STEP) {
      if (isSafeAt(p, price)) brute = price;
    }
    expect(calcSafePrice(p, rules)).toBe(brute);
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `npx vitest run src/lib/finance/safe-price.test.ts`
Expected: FAIL — `calcSafePrice`가 없어 import 에러

- [ ] **Step 5: `calcSafePrice`를 만든다**

`src/lib/finance/safe-price.ts`:

```ts
import { calcAffordablePrice, searchMaxPrice } from "./affordable-price";
import { calcMaxLoan } from "./loan-limit";
import { assertValidProfile } from "./profile";
import { calcSafetyScore } from "./safety";
import type { BuyerProfile, Rules } from "./types";

/**
 * 상환 부담이 "안전" 범위에 머무는 최대 매매가(원).
 *
 * 이 제품이 다른 계산기와 갈리는 지점이다. 다른 앱은 "최대 얼마까지 살 수
 * 있는가"에서 멈추지만, 그 최대치는 대개 상환 부담이 이미 위험한 가격이다.
 * 이 값은 그 옆에 나란히 놓여 "여기까지가 무리 없는 선"을 말한다.
 *
 * 상한은 실구매력이다 — **살 수 없는 가격을 안전하다고 말할 수 없다.**
 *
 * 탐색은 `calcAffordablePrice`와 같은 `searchMaxPrice`를 쓴다. 두 숫자가
 * 화면에 나란히 놓이므로 서로 다른 절벽 위에서 계산되면 안 된다.
 */
export function calcSafePrice(profile: BuyerProfile, rules: Rules): number {
  assertValidProfile(profile);

  const affordable = calcAffordablePrice(profile, rules).affordablePrice;
  if (affordable === 0) return 0;

  return searchMaxPrice(rules, (price) => {
    if (price > affordable) return false;
    const loan = calcMaxLoan(profile, rules, price);
    return calcSafetyScore(profile, rules, loan.amount).level === "safe";
  });
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run src/lib/finance/safe-price.test.ts`
Expected: PASS

- [ ] **Step 7: 공개 API에 추가한다**

`src/lib/finance/index.ts`에 다음 줄을 추가한다(기존 export 정렬 관례를 따른다):

```ts
export { calcSafePrice } from "./safe-price";
```

- [ ] **Step 8: 전체 스위트와 타입체크**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS

- [ ] **Step 9: 커밋**

```bash
git add src/lib/finance/affordable-price.ts src/lib/finance/safe-price.ts src/lib/finance/safe-price.test.ts src/lib/finance/index.ts
git commit -m "feat: 상환 부담이 안전 범위에 머무는 최대 가격을 계산한다

이 제품이 다른 계산기와 갈리는 지점이다. 최대 얼마까지 살 수 있는지는
대개 상환 부담이 이미 위험한 가격이고, 이 값은 그 옆에 나란히 놓여
무리 없는 선을 말한다.

탐색을 술어로 일반화해 calcAffordablePrice와 공유한다. 절벽 목록만
공유하면 구간 상단·PRICE_STEP 경계 처리 같은 세부가 한쪽에만 반영되는
결함이 나고, 그때 두 숫자가 서로 다른 기준 위에서 계산돼 화면에 나란히
놓인다."
```

---

## Task 2: SEED 스니펫 설치와 `MoneyInput` 내부 교체

화면 구조는 그대로 두고 원시 요소만 SEED로 바꾼다. 동작이 하나도 바뀌지 않아야 한다.

**Files:**
- Create: `seed-design/ui/text-field.tsx`, `seed-design/ui/checkbox.tsx`, `seed-design/ui/slider.tsx` (CLI가 생성)
- Modify: `src/components/MoneyInput.tsx`
- Test: `src/components/MoneyInput.test.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `MoneyInput`의 props는 **바뀌지 않는다** — `{ id, label, value, onChange, hint? }`

- [ ] **Step 1: 스니펫을 추가한다**

```bash
npx @seed-design/cli@latest add ui:text-field
npx @seed-design/cli@latest add ui:checkbox
npx @seed-design/cli@latest add ui:slider
```

Run: `npx tsc --noEmit`
Expected: 에러 없음 — 스니펫이 이 저장소의 strict 설정을 통과해야 한다. 통과하지 못하면 스니펫을 고치지 말고 BLOCKED로 보고한다.

- [ ] **Step 2: 기존 테스트를 접근성 기준으로 옮긴다**

`src/components/MoneyInput.test.tsx`를 열어, 마크업 선택자(`container.querySelector`, 클래스 이름 등)에 의존하는 부분만 접근성 기준으로 바꾼다.

- 입력란: `screen.getByLabelText(라벨)`
- 되비추기·힌트·에러 문구: `screen.getByText(...)`

**단언의 내용은 바꾸지 않는다.** 파싱 결과·되비추기 값·동기화 동작에 대한 기대는 그대로다. 무엇을 왜 바꿨는지 보고서에 쓴다.

Run: `npx vitest run src/components/MoneyInput.test.tsx`
Expected: PASS — 아직 SEED로 바꾸기 전이므로 통과해야 한다. 여기서 깨지면 선택자 변경이 단언을 바꾼 것이다.

- [ ] **Step 3: 되비추기를 고정하는 테스트를 추가한다**

같은 파일에 추가한다. 이 동작이 만원 기본 해석을 성립시키는 안전장치이므로 명시적으로 잠근다.

```tsx
it("만원 기본 해석을 되비춰 자릿수 오해를 드러낸다", () => {
  const onChange = vi.fn();
  render(
    <MoneyInput id="cash" label="보유 현금" value={null} onChange={onChange} />,
  );

  // "5천만원"을 의도하고 50000000을 넣으면 실제로는 5,000억이 된다.
  // 되비추기가 그 오해를 즉시 눈에 보이게 만든다.
  fireEvent.change(screen.getByLabelText("보유 현금"), {
    target: { value: "50000000" },
  });

  expect(onChange).toHaveBeenLastCalledWith(500_000_000_000);
  expect(screen.getByText(/5,000억/)).toBeInTheDocument();
});

it("억·만 단위를 섞어 쓴 입력을 읽는다", () => {
  const onChange = vi.fn();
  render(
    <MoneyInput id="cash" label="보유 현금" value={null} onChange={onChange} />,
  );

  fireEvent.change(screen.getByLabelText("보유 현금"), {
    target: { value: "3억5000" },
  });

  expect(onChange).toHaveBeenLastCalledWith(350_000_000);
});
```

기대 문자열이 `formatWon`의 실제 출력과 다르면 **테스트를 출력에 맞추지 말고** `src/format/won.ts`를 읽어 실제 형식을 확인한 뒤 정확한 값을 쓴다.

- [ ] **Step 4: 내부 원시 요소를 SEED로 바꾼다**

`src/components/MoneyInput.tsx`에서 `<label>` + `<input>` + 힌트/에러 `<p>`를 `TextField` + `TextFieldInput`으로 바꾼다.

```tsx
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
```

매핑:

| 지금 | SEED |
|---|---|
| `<label htmlFor={id}>{label}</label>` | `TextField`의 `label` prop |
| `hint` `<p>` | `TextField`의 `description` prop |
| `unreadable` `<p>` | `TextField`의 `invalid` + `errorMessage` |
| 되비추기 `<p className="echo">` | **그대로 유지한다** — SEED에 대응 슬롯이 없다 |

지킬 것:

- `id`를 `TextFieldInput`에 그대로 넘겨 라벨 연결이 유지되게 한다. `getByLabelText`가 계속 동작해야 한다.
- `inputMode="numeric"`, `autoComplete="off"`를 잃지 않는다.
- `onValueChange`를 쓸 경우 **`slicedValue`를 쓴다**(`value`가 아니라). `TextFieldInput`의 네이티브 `onChange`를 그대로 쓰는 편이 단순하면 그렇게 해도 된다 — 어느 쪽을 골랐고 왜인지 보고서에 쓴다.
- 되비추기와 에러가 **동시에 나오지 않는다**는 기존 성질을 유지한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/components/MoneyInput.test.tsx`
Expected: PASS — **하나도 안 고치고** 통과해야 한다. 깨지면 동작이 바뀐 것이므로 단언을 고치지 말고 구현을 고친다.

- [ ] **Step 6: 전체 스위트·타입체크·빌드**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add seed-design/ src/components/MoneyInput.tsx src/components/MoneyInput.test.tsx
git commit -m "feat: MoneyInput의 원시 요소를 SEED TextField로 바꾼다

컴포넌트를 대체하지 않고 안쪽만 교체한다. 한국식 금액 파싱과 해석 결과
되비추기는 이 제품의 도메인 로직이고, 특히 되비추기는 만원 기본 해석의
자릿수 오해를 즉시 드러내는 안전장치라 없앨 수 없다.

기존 테스트는 마크업 선택자에 걸린 부분만 접근성 기준으로 옮기고 단언은
그대로 뒀다 — 동작이 바뀌지 않았다는 것이 교체의 성공 조건이다."
```

---

## Task 3: 첫 화면을 세 항목으로 줄이고 가정을 문구로 드러낸다

**Files:**
- Modify: `src/components/ProfileForm.tsx`
- Create: `src/components/AssumptionLine.tsx`
- Modify: `src/state/useProfileForm.ts`
- Test: `src/components/ProfileForm.test.tsx`, `src/components/AssumptionLine.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `Checkbox` 스니펫
- Produces: `AssumptionLine` — Task 4가 결과 영역에 배치한다

### 설계

첫 화면에는 **보유 현금 · 연 소득 · 생애최초 여부** 셋만 둔다. 나머지 다섯은 기본값으로 계산하고, 그 사실을 `AssumptionLine`이 문구로 드러낸다.

가정 문구는 **실제로 쓰이는 기본값에서 만든다.** 문자열을 하드코딩하면 기본값을 바꿨을 때 문구가 거짓말을 한다.

- [ ] **Step 1: 전용면적 기본값의 방향이 뒤집혀 있는 것을 고친다**

**이건 리팩터링이 아니라 결함 수정이다.** `DEFAULT_FORM_STATE.exclusiveAreaSqm`이 `84`로 박혀 있는데 룰셋의 농특세 임계값은 `ruralTaxAreaThresholdSqm: 85`이고, 판정은 `exclusiveAreaSqm > 85`다. 즉 **지금 기본값은 농특세를 붙이지 않아** 부대비용을 과소 계상하고, 그만큼 살 수 있는 가격을 **과대 계상**한다. 이 제품이 절대 하면 안 되는 방향이다.

`src/state/useProfileForm.ts`에서 기본값을 룰셋에서 유도한다. 숫자를 박지 않는다 — 임계값이 바뀌면 방향이 조용히 다시 뒤집힌다.

```ts
/**
 * 전용면적 기본값. 농특세 임계값을 **넘는** 쪽으로 둔다.
 *
 * 농특세는 전용 85㎡ 초과에 붙는다. 임계값 아래로 두면 부대비용이 적게
 * 잡혀 살 수 있는 가격이 실제보다 크게 나온다 — 이 제품이 피해야 하는
 * 방향이다. 사용자가 실제 면적을 넣으면 대개 이 가정보다 유리해진다.
 *
 * 룰셋에서 유도하는 이유: 숫자를 박아 두면 임계값이 바뀌었을 때 방향이
 * 조용히 뒤집힌다.
 */
const ASSUMED_AREA_SQM = rules.acquisitionTax.ruralTaxAreaThresholdSqm + 1;
```

`rules`는 `src/state/useAffordability.ts`가 이미 파싱해 export하고 있다. 순환 import가 생기면 룰셋을 읽는 위치를 조정하되, **숫자를 박는 것으로 회피하지 않는다.**

- [ ] **Step 1b: "가정 중인가"를 판정할 수 있게 한다**

`ProfileFormState`는 지금 이렇다(발췌).

```ts
export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  existingDebtAnnualPayment: number | null;
  status: HouseholdStatus;
  isFirstTimeBuyer: boolean;
  isRegulatedArea: boolean;
  exclusiveAreaSqm: number;
  existingHome: ExistingHomeFormState;
}
```

금액 필드는 `null`이 "미입력"을 뜻하므로 `existingDebtAnnualPayment === null`로 가정 여부를 알 수 있다. **하지만 `isRegulatedArea`(boolean)와 `exclusiveAreaSqm`(number)에는 미입력 상태가 없다** — 기본값과 사용자가 우연히 같은 값을 고른 경우를 구분할 수 없다.

그래서 사용자가 손댄 항목을 별도로 기록한다. 기존 상태에 필드를 더한다.

```ts
/** 사용자가 직접 값을 정한 항목. 여기 없으면 기본값(=가정)으로 계산 중이다 */
export type AssumableField = "existingDebt" | "regulatedArea" | "area";

export interface ProfileFormState {
  // …기존 필드 그대로…
  /**
   * 사용자가 명시적으로 정한 항목들.
   *
   * 값만 봐서는 가정인지 사용자 선택인지 알 수 없다 — isRegulatedArea가
   * true인 것이 "기본값 그대로"인지 "사용자가 규제지역을 골랐다"인지
   * 구분되지 않는다. 가정 문구는 그 구분 위에 서 있으므로 따로 기록한다.
   */
  touched: AssumableField[];
}
```

`DEFAULT_FORM_STATE.touched`는 `[]`다. 저장된 상태를 읽는 `loadStoredState`도 이 필드를 다뤄야 한다 — 옛 저장본에 `touched`가 없으면 `[]`로 채운다(그게 "전부 가정 중"이라는 뜻이라 안전한 방향이다).

`setField`가 이 셋 중 하나를 바꿀 때 해당 항목을 `touched`에 넣는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다 — 첫 화면**

`src/components/ProfileForm.test.tsx`에 추가한다.

```tsx
it("첫 화면에는 입력이 셋뿐이다", () => {
  renderForm();
  expect(screen.getByLabelText(/보유 현금/)).toBeInTheDocument();
  expect(screen.getByLabelText(/연 소득/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /생애최초/ })).toBeInTheDocument();

  // 사라져야 하는 것들
  expect(screen.queryByLabelText(/기존 부채/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/전용면적/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /규제지역/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/주택 보유 상황/)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: 실패하는 테스트를 쓴다 — `Checkbox`의 indeterminate**

같은 파일에 추가한다. **이 테스트가 이 태스크에서 가장 중요하다.**

```tsx
it('체크박스가 "indeterminate"를 줘도 생애최초가 참이 되지 않는다', () => {
  // SEED Checkbox의 onCheckedChange는 boolean | "indeterminate"를 준다.
  // "indeterminate"를 참으로 취급하면 규제지역 LTV가 40%에서 70%로 뛰어
  // 한도를 30%p 과대 계상한다 — 이 제품이 절대 하면 안 되는 방향이다.
  const onChange = vi.fn();
  renderForm({ onFirstTimeBuyerChange: onChange });

  // 컴포넌트가 노출하는 핸들러를 직접 호출해 "indeterminate"를 전달한다.
  // (구현이 핸들러를 어떻게 노출하는지에 맞춰 이 부분을 조정하되,
  //  "indeterminate"가 실제로 핸들러를 통과하는 경로를 반드시 거칠 것)
  expect(onChange).not.toHaveBeenCalledWith(true);
});
```

구현이 핸들러를 어떻게 노출하는지에 따라 이 테스트의 구동 방식은 달라질 수 있다. **핵심은 `"indeterminate"`가 실제로 좁히기 로직을 통과하는 경로를 거치는 것**이다. 좁히기를 우회해 `true`/`false`만 넣는 테스트는 아무것도 잠그지 못하므로, 그런 형태가 되면 보고한다.

- [ ] **Step 4: 실패하는 테스트를 쓴다 — 가정 문구**

`src/components/AssumptionLine.test.tsx`를 만든다.

```tsx
it("가정 중인 항목을 전부 문구에 드러낸다", () => {
  renderLine({ /* 전부 가정 중인 상태 */ });
  expect(screen.getByText(/기존 대출 없음/)).toBeInTheDocument();
  expect(screen.getByText(/규제지역/)).toBeInTheDocument();
});

it("사용자가 값을 넣은 항목은 문구에서 빠진다", () => {
  renderLine({ /* 기존 부채를 사용자가 입력한 상태 */ });
  expect(screen.queryByText(/기존 대출 없음/)).not.toBeInTheDocument();
});

it("문구는 실제 기본값에서 만들어진다 — 하드코딩이 아니다", () => {
  // 규제지역 기본값을 뒤집은 상태를 넘기면 문구도 따라 바뀌어야 한다.
  renderLine({ /* isRegulatedArea: false 로 명시된 상태 */ });
  expect(screen.queryByText(/규제지역으로 계산/)).not.toBeInTheDocument();
});

it("기존 부채 가정은 고치면 숫자가 내려간다는 것을 드러낸다", () => {
  // 다른 가정들과 방향이 반대인 유일한 항목이다.
  renderLine({ /* 전부 가정 중인 상태 */ });
  expect(screen.getByText(/기존 대출 없음/)).toBeInTheDocument();
});

it("각 가정 항목을 눌러 그 항목만 열 수 있다", () => {
  const onOpen = vi.fn();
  renderLine({ onOpen });
  fireEvent.click(screen.getByRole("button", { name: /기존 대출/ }));
  expect(onOpen).toHaveBeenCalledWith("existingDebt");
});
```

- [ ] **Step 4b: 실패하는 테스트를 쓴다 — 월→연 변환**

기존 부채를 열었을 때 **"기존 부채 연간 원리금"이 아니라 "매달 나가는 대출금"** 을 묻는다. 사람들이 실제로 아는 숫자이기 때문이다. 엔진의 `BuyerProfile.existingDebtAnnualPayment`는 그대로 두고 UI 층에서 12를 곱한다.

`src/components/ProfileForm.test.tsx`에 추가한다.

```tsx
it("매달 나가는 대출금을 묻고 엔진에는 12배로 넘긴다", () => {
  const onChange = vi.fn();
  renderForm({ openField: "existingDebt", onExistingDebtChange: onChange });

  // 라벨이 "연간 원리금"이 아니라 월 기준이어야 한다
  const input = screen.getByLabelText(/매달 나가는 대출금/);
  fireEvent.change(input, { target: { value: "50" } }); // 50만원/월

  // 만원 단위 해석 → 500,000원/월 → 연 6,000,000원
  expect(onChange).toHaveBeenLastCalledWith(6_000_000);
});

it("월 금액을 다시 표시할 때도 월 기준으로 되돌린다", () => {
  renderForm({
    openField: "existingDebt",
    existingDebtAnnualPayment: 6_000_000,
  });
  // 연 600만원이 월 50만원으로 보여야 한다 — 왕복이 일치하지 않으면
  // 사용자가 자기가 넣은 값을 다시 열었을 때 다른 숫자를 본다.
  expect(screen.getByLabelText(/매달 나가는 대출금/)).toHaveValue("50");
});
```

두 번째 테스트가 중요하다. 변환이 한 방향으로만 있으면 값을 넣고 다시 열었을 때 12배가 된 숫자가 보인다.

- [ ] **Step 5: 구현한다**

`ProfileForm`을 세 항목으로 줄이고, `AssumptionLine`을 만들고, 월↔연 변환을 넣는다.

지킬 것:

- 생애최초는 `Checkbox`의 `label` prop으로 라벨을 붙인다. `tone`·`size`는 SEED 기본값을 쓰되 시각적으로 어색하면 조정한다.
- **`onCheckedChange`의 값을 명시적으로 좁힌다.** `checked === true`만 참으로 본다. `as boolean`이나 truthy 검사(`!!checked`)를 쓰지 않는다 — 문자열 `"indeterminate"`는 truthy다.
- 가정 문구의 각 항목은 **누를 수 있는 요소**여야 한다(`button` role). 누르면 그 항목만 열린다.
- 열린 항목은 폼 전체로 돌아가지 않고 제자리에서 편집된다.
- **월↔연 변환은 양방향이다.** 화면에서 받은 월 금액에 12를 곱해 상태에 넣고, 상태의 연 금액을 12로 나눠 화면에 되돌린다. 한 방향만 만들면 값을 넣고 다시 열었을 때 12배가 된 숫자가 보인다.
- 변환은 **한 곳에** 둔다. 두 군데서 곱하고 나누면 언젠가 한쪽만 고친다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run src/components/`
Expected: PASS

- [ ] **Step 7: 전체 스위트·타입체크**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/components/ProfileForm.tsx src/components/ProfileForm.test.tsx src/components/AssumptionLine.tsx src/components/AssumptionLine.test.tsx src/state/useProfileForm.ts
git commit -m "feat: 첫 화면을 세 항목으로 줄이고 가정을 문구로 드러낸다

여덟 가지를 묻던 폼에서 넷은 보통 사람이 답할 수 없는 것이었다. 답을 못
하면 폼을 떠나므로 계산기가 정확해도 도달하지 못한다.

숨긴 가정은 조용히 깔지 않고 결과 옆에 문장으로 두고 눌러서 고치게 한다.
가정은 기존 부채를 빼고 전부 사용자에게 불리한 쪽이라, 고치면 숫자가
올라간다 — 추가 입력이 벌점이 아니라 보상이 된다. 기존 부채만 방향이
반대이므로 그 사실이 문구에 드러난다."
```

---

## Task 4: 결과를 계단으로 만들고 안전선을 나란히 놓는다

**Files:**
- Modify: `src/components/BudgetResult.tsx`
- Create: `src/components/SafeLine.tsx`
- Modify: `src/components/PriceSlider.tsx`
- Modify: `src/App.tsx`, `src/state/useAffordability.ts`
- Test: 각 대응 테스트 파일

**Interfaces:**
- Consumes: Task 1의 `calcSafePrice`, Task 2의 `Slider` 스니펫, Task 3의 `AssumptionLine`

### 설계

결과 영역을 네 단으로 나눈다.

1. **최대 가격** — 크게
2. **무엇이 막았는지 한 줄**
3. **안전선** — 최대 가격 **옆에 나란히**
4. **접힌 채로** — 부대비용 내역, 정책대출 목록, 상세 설명

경고(`WarningList`)는 접지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 안전선 표시**

`src/components/SafeLine.test.tsx`:

```tsx
it("안전선과 최대 가격을 나란히 보여준다", () => {
  renderSafeLine({ affordablePrice: 600_000_000, safePrice: 480_000_000 });
  expect(screen.getByText(/6억/)).toBeInTheDocument();
  expect(screen.getByText(/4억 8,000만/)).toBeInTheDocument();
});

it("안전선이 0원이면 숫자 대신 문장을 보여준다", () => {
  // 0원을 결과로 내미는 것은 정보가 아니라 조롱이다.
  renderSafeLine({ affordablePrice: 300_000_000, safePrice: 0 });
  expect(screen.queryByText(/^0원$/)).not.toBeInTheDocument();
  expect(screen.getByText(/무리 없이 살 수 있는 가격대가 없습니다/)).toBeInTheDocument();
});

it("안전선이 최대 가격과 같으면 한 줄로 합친다", () => {
  renderSafeLine({ affordablePrice: 500_000_000, safePrice: 500_000_000 });
  expect(screen.getByText(/최대 가격까지 부담률이 안전 범위/)).toBeInTheDocument();
});
```

기대 문자열이 `formatWon`의 실제 출력과 다르면 테스트를 출력에 맞추지 말고 `src/format/won.ts`에서 실제 형식을 확인한다.

- [ ] **Step 2: 실패하는 테스트를 쓴다 — 슬라이더**

`src/components/PriceSlider.test.tsx`에 추가한다.

```tsx
it("최대 가격을 넘는 값을 만들지 않는다", () => {
  const onChange = vi.fn();
  renderSlider({ max: 500_000_000, onChange });
  // SEED Slider는 값이 배열이다. 어댑터가 배열을 숫자로 옮기면서
  // 상한을 넘기지 않아야 한다.
  expect(
    onChange.mock.calls.every(([price]) => price <= 500_000_000),
  ).toBe(true);
});

it("빈 배열이 와도 터지지 않는다", () => {
  // onValuesChange가 빈 배열을 줄 수 있다. 어댑터가 그것을 어떻게
  // 다루는지 정해 두지 않으면 undefined가 가격으로 흘러든다.
  expect(() => renderSlider({ max: 500_000_000 })).not.toThrow();
});
```

- [ ] **Step 3: 결과 계단과 안전선을 구현한다**

`BudgetResult`를 네 단으로 재편하고 `SafeLine`을 만든다.

지킬 것:

- 접기에는 네이티브 `<details>`/`<summary>`를 쓰거나 SEED에 대응 컴포넌트가 있으면 그것을 쓴다. **문서 인덱스를 확인하고 없으면 네이티브를 쓴다** — 없는 API를 추측하지 않는다.
- **경고는 접지 않는다.**
- 큰 숫자에 `Text`를 쓰되 제목 계층이 필요한 곳에는 쓰지 않는다(`as` prop이 없다).
- 안전선은 `PRICE_STEP` 단위로 내림된 값을 그대로 표시한다.

- [ ] **Step 4: 슬라이더를 SEED로 바꾼다**

`PriceSlider`를 SEED `Slider`로 바꾼다.

지킬 것:

- **배열↔숫자 어댑터를 한 곳에 둔다.** 빈 배열이면 무시하고, 값이 여럿이면 첫 번째를 쓴다(그 결정을 주석으로 남긴다).
- **`getAriaLabel`은 필수 prop이다.** 무엇을 조절하는 슬라이더인지 한국어로 준다.
- 눈금에 안전선 위치를 표시한다. SEED `Slider`가 마커를 지원하지 않으면 슬라이더 아래에 별도 표시로 두고, 지원 여부를 문서에서 확인한 결과를 보고서에 쓴다.

- [ ] **Step 5: 화면을 연결한다**

`useAffordability`가 `calcSafePrice` 결과를 함께 내도록 하고, `App.tsx`가 `AssumptionLine`과 `SafeLine`을 배치한다.

- [ ] **Step 6: 전체 스위트·타입체크·빌드**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: 전부 PASS

- [ ] **Step 7: 브라우저에서 눈으로 확인한다**

Run: `npm run dev`

확인할 것:

- 첫 화면에 입력이 **셋**뿐이다
- 현금 2억 / 연소득 6천만원 / 생애최초 체크 → 결과가 나온다
- 최대 가격 옆에 안전선이 **나란히** 보인다
- 가정 문구가 보이고, 눌러서 그 항목만 열린다
- 기존 부채를 넣으면 최대 가격이 **내려간다**
- 브랜드 색이 파랑이다(주황이 아니다)
- 슬라이더를 끌면 안전선을 넘는 지점이 보인다

확인 후 서버를 끈다. 각 항목의 실제 결과를 보고서에 쓴다 — 확인하지 못한 항목은 확인했다고 쓰지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/ src/App.tsx src/state/useAffordability.ts
git commit -m "feat: 결과를 계단으로 만들고 안전선을 최대 가격과 나란히 놓는다

다른 앱은 최대 가격에서 멈추고 그 숫자를 크게 보여준다. 나란히 두는 것은
무리 없는 선이 최대치와 동등한 무게를 갖는다는 뜻이고, 그것이 이 제품이
하는 말이다.

안전선이 0원이면 숫자 대신 문장으로 말한다 — 0원을 결과로 내미는 것은
정보가 아니라 조롱이다. 최대 가격과 같으면 한 줄로 합친다."
```

---

## 완료 확인

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

- 전체 스위트 통과, 타입체크 클린, 빌드 성공
- 첫 화면 입력이 셋
- 전용면적 기본값이 농특세 임계값을 넘는다(과대 계상 방향의 기존 결함 수정)
- 숨긴 가정이 전부 문구에 드러남
- 안전선이 최대 가격과 나란히
- 안전선 탐색이 `calcAffordablePrice`와 같은 `searchMaxPrice`를 씀
- `MoneyInput`의 되비추기가 살아 있음
