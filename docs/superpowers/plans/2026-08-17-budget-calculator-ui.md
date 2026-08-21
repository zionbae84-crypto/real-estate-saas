# 예산 계산기 UI (Plan C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 현금·소득·부채를 입력하면 실구매 가능 가격과 그것을 막는 제약을 보여주고, 가격 슬라이더로 "얼마짜리를 사면 얼마나 무리인가"를 만져볼 수 있게 하는 단일 페이지 웹앱을 만든다.

**Architecture:** Vite + React 단일 페이지. 서버 없음, 네트워크 요청 없음. 기존 `src/lib/finance` 엔진(순수 함수)을 브라우저에서 직접 호출하고, 규제 룰셋은 빌드 타임에 번들로 포함한다. 사용자 재무정보는 `localStorage`에만 머무르며 네트워크를 타는 경로가 코드상 존재하지 않는다.

**Tech Stack:** Vite 7, React 19, TypeScript 7, Vitest 4 + jsdom + @testing-library/react

## Global Constraints

- **네트워크 요청 0.** `fetch`·`XMLHttpRequest`·`WebSocket`·외부 URL을 소스에 쓰지 않는다. 폰트는 시스템 폰트 스택만 쓴다. Task 10의 테스트가 이를 강제한다.
- **`src/lib/finance/`를 수정하지 않는다.** Plan A 산출물이며 254개 테스트가 지키고 있다. 엔진에 문제가 있다고 판단되면 STOP하고 보고한다.
- **엔진에 `NaN`을 넘기지 않는다.** 금액 입력 파싱은 실패 시 `NaN`이 아니라 `null`을 내보내고, 폼은 이를 "미입력"으로 취급한다.
- **정책대출 금액은 `availableAmount`만 표시한다.** `loan.maxAmount`는 상품 고시 한도이지 이 구매자가 받을 수 있는 금액이 아니다. 금액으로 렌더링하면 연소득 0원 구매자에게 3.6억을 받을 수 있다고 말하게 된다.
- 모든 금액은 원 단위 정수로 다룬다.
- 컴포넌트 파일은 하나의 책임만 가진다. 200줄을 넘으면 분리를 검토한다.
- 테스트는 대상과 같은 디렉토리에 `*.test.ts` 또는 `*.test.tsx`로 둔다.
- 커밋 메시지는 Conventional Commits, **제목은 한국어**.
- TypeScript strict, `noUncheckedIndexedAccess` 활성. `any` 금지, 불필요한 non-null assertion 금지.

---

## 기존 엔진 API (이 계획이 소비하는 것 — 전부 `src/lib/finance`에서 export됨)

```ts
function parseRules(raw: unknown): Rules
function calcAffordablePrice(profile: BuyerProfile, rules: Rules): AffordableResult
function calcMaxLoan(profile: BuyerProfile, rules: Rules, price: number): LoanLimit
function calcSafetyScore(profile: BuyerProfile, rules: Rules, loanAmount: number): SafetyScore
const PRICE_STEP: number   // 100_000

type HouseholdStatus = "무주택" | "갈아타기"
type BindingConstraint = "LTV" | "DSR" | "CAP" | "POLICY"
type SafetyLevel = "safe" | "caution" | "danger"

interface BuyerProfile {
  status: HouseholdStatus
  cash: number
  annualIncome: number
  existingDebtAnnualPayment: number
  isFirstTimeBuyer: boolean
  exclusiveAreaSqm: number
  existingHome?: { expectedSalePrice: number; remainingLoan: number; capitalGainsTax?: number }
}

interface AffordableResult {
  affordablePrice: number
  loanLimit: LoanLimit
  costs: CostBreakdown
  availableCash: number
  matchedPolicyLoans: MatchedPolicyLoan[]
  warnings: string[]
}

interface LoanLimit { amount: number; binding: BindingConstraint; breakdown: Record<BindingConstraint, number> }
interface CostBreakdown { acquisitionTax: number; brokerageFee: number; legalFee: number; movingCost: number; total: number }
interface MatchedPolicyLoan { loan: PolicyLoanRule; availableAmount: number }
interface SafetyScore { monthlyPayment: number; burdenRatio: number; stressedMonthlyPayment: number; stressedBurdenRatio: number; level: SafetyLevel }
interface PolicyLoanRule { id: string; eligibility: {...}; maxAmount: number; rate: number }
```

엔진 함수들은 잘못된 입력에 **예외를 던진다**(`assertValidProfile`, `assertNonNegativeFinite`). 폼이 1차 방어선이고, 예외 처리는 2차 방어선이다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `index.html` | Vite 진입 HTML |
| `vite.config.ts` | Vite + React 플러그인 |
| `src/main.tsx` | React 마운트 |
| `src/App.tsx` | 페이지 조립 (폼 + 결과 + 슬라이더) |
| `src/format/won.ts` | 원 → 한국식 표기 문자열 |
| `src/format/parseMoney.ts` | 한국식 금액 문자열 → 원 단위 정수 또는 `null` |
| `src/components/MoneyInput.tsx` | 금액 입력 + 해석 결과 되비추기 |
| `src/components/ProfileForm.tsx` | 프로필 필드 조립 |
| `src/components/BudgetResult.tsx` | 실구매력 표시 |
| `src/components/BindingExplainer.tsx` | 걸린 제약과 다음 행동 |
| `src/components/CostBreakdown.tsx` | 부대비용 내역 |
| `src/components/PolicyLoanList.tsx` | 자격 정책대출과 수령 가능액 |
| `src/components/WarningList.tsx` | 엔진 경고 |
| `src/components/PriceSlider.tsx` | 가격 슬라이더 |
| `src/components/SafetyBadge.tsx` | 신호등 + 월 상환액 |
| `src/state/useProfileForm.ts` | 폼 상태 · 기본값 · localStorage · `BuyerProfile` 변환 |
| `src/state/useAffordability.ts` | 프로필 → 결과, 슬라이더 가격 → 안전성 |
| `src/components/ErrorBoundary.tsx` | 엔진 예외 포착 |

의존 방향: `format` → `components` → `App`. `state`는 `format`과 `lib/finance`에만 의존한다.

---

## Task 1: Vite + React 셋업과 앱 셸

**Files:**
- Create: `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/test-setup.ts`
- Modify: `package.json`, `tsconfig.json`, `vitest.config.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 동작하는 Vite 개발 서버와 `.tsx` 테스트가 도는 vitest 환경

- [ ] **Step 1: 의존성 설치**

```bash
cd "/Users/yongsmac/Documents/부동산 saas"
npm install react react-dom
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: 설정 파일 작성**

`vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
});
```

`vitest.config.ts` (기존 내용을 이것으로 교체):

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
  },
});
```

`src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`tsconfig.json`의 `compilerOptions`에서 `lib`를 교체하고 `jsx`를 추가:

```json
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
```

`package.json`의 `scripts`에 추가 (`test`, `test:watch`, `typecheck`은 그대로 둔다):

```json
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("서비스 제목을 표시한다", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /내 예산으로 살 수 있는 집/ }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./App"`

- [ ] **Step 5: 앱 셸 작성**

`src/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>내 예산으로 살 수 있는 집</h1>
    </main>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root 엘리먼트를 찾을 수 없습니다");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>내 예산으로 살 수 있는 집</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 기존 254개가 모두 통과하고 이 태스크의 새 테스트 1개가 더해진다. 타입 오류 없음

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: `dist/`에 정적 파일 생성, 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "chore: Vite + React 개발 환경과 앱 셸 추가"
```

---

## Task 2: 금액 표기 (`formatWon`)

**Files:**
- Create: `src/format/won.ts`, `src/format/won.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `formatWon(won: number): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/format/won.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatWon } from "./won";

describe("formatWon", () => {
  it("0은 0원이다", () => {
    expect(formatWon(0)).toBe("0원");
  });

  it("만원 미만은 원 단위로 표기한다", () => {
    expect(formatWon(1_234)).toBe("1,234원");
  });

  it("억 미만은 만원 단위로 표기한다", () => {
    expect(formatWon(50_000_000)).toBe("5,000만원");
  });

  it("억과 만원을 함께 표기한다", () => {
    expect(formatWon(640_000_000)).toBe("6억 4,000만원");
  });

  it("만원 자리가 0이면 억만 표기한다", () => {
    expect(formatWon(600_000_000)).toBe("6억원");
  });

  it("억·만·원이 모두 있으면 셋 다 표기한다", () => {
    expect(formatWon(612_345_678)).toBe("6억 1,234만 5,678원");
  });

  it("조 단위는 억을 콤마로 묶어 표기한다", () => {
    expect(formatWon(5_000_000_000_000)).toBe("50,000억원");
  });

  it("음수는 앞에 마이너스를 붙인다", () => {
    expect(formatWon(-50_000_000)).toBe("-5,000만원");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/format/won.test.ts`
Expected: FAIL — `Failed to resolve import "./won"`

- [ ] **Step 3: 구현 작성**

`src/format/won.ts`:

```ts
const EOK = 100_000_000;
const MAN = 10_000;

/**
 * 원 단위 정수를 한국식 표기 문자열로 바꾼다.
 * 640_000_000 → "6억 4,000만원"
 */
export function formatWon(won: number): string {
  if (won === 0) return "0원";

  const sign = won < 0 ? "-" : "";
  const abs = Math.abs(Math.round(won));

  const eok = Math.floor(abs / EOK);
  const man = Math.floor((abs % EOK) / MAN);
  const rest = abs % MAN;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest > 0) parts.push(rest.toLocaleString("ko-KR"));

  return `${sign}${parts.join(" ")}원`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 8개가 더해진다

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 원 단위 금액을 한국식 표기로 바꾸는 포매터 추가"
```

---

## Task 3: 금액 파싱 (`parseMoney`)

**Files:**
- Create: `src/format/parseMoney.ts`, `src/format/parseMoney.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `parseMoney(raw: string): number | null`

**왜 중요한가:** `Number("1억")`은 `NaN`이다. 최종 리뷰가 Critical로 잡았던 입력이 정확히 이것이다. 엔진에 `assertValidProfile` 가드가 있지만, **UI가 애초에 `NaN`을 만들지 않는 것이 1차 방어선**이다. 이 함수는 어떤 입력에도 `NaN`을 반환하지 않는다 — 파싱 불가는 `null`이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/format/parseMoney.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMoney } from "./parseMoney";

describe("parseMoney", () => {
  it("단위 없는 숫자는 만원으로 읽는다", () => {
    expect(parseMoney("35000")).toBe(350_000_000);
  });

  it("억 단위를 읽는다", () => {
    expect(parseMoney("3억")).toBe(300_000_000);
  });

  it("억과 만원을 함께 읽는다", () => {
    expect(parseMoney("3억5000")).toBe(350_000_000);
  });

  it("만 접미사가 붙은 억+만도 읽는다", () => {
    expect(parseMoney("3억5000만")).toBe(350_000_000);
  });

  it("소수 억을 읽는다", () => {
    expect(parseMoney("3.5억")).toBe(350_000_000);
  });

  it("만 단위를 읽는다", () => {
    expect(parseMoney("5000만")).toBe(50_000_000);
  });

  it("원 단위를 명시하면 그대로 읽는다", () => {
    expect(parseMoney("1234원")).toBe(1_234);
  });

  it("콤마와 공백을 무시한다", () => {
    expect(parseMoney(" 3,5000 ")).toBe(350_000_000);
  });

  it("0을 읽는다", () => {
    expect(parseMoney("0")).toBe(0);
  });

  it("빈 문자열은 null이다", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
  });

  it("숫자가 아니면 null이다", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("3억5000원짜리")).toBeNull();
    expect(parseMoney("억")).toBeNull();
  });

  it("음수는 null이다", () => {
    expect(parseMoney("-5000")).toBeNull();
    expect(parseMoney("-3억")).toBeNull();
  });

  it("어떤 입력으로도 NaN을 반환하지 않는다", () => {
    const inputs = [
      "", " ", "abc", "-1", "1e", "억", "만", "원", "..", "3..5억",
      "9".repeat(30), "3억5000", "0", "1,2,3", "NaN", "Infinity", "1e400",
    ];
    for (const input of inputs) {
      const result = parseMoney(input);
      expect(result === null || Number.isFinite(result), `입력: ${input}`).toBe(true);
    }
  });

  it("결과는 항상 정수다", () => {
    expect(Number.isInteger(parseMoney("3.14159억") as number)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/format/parseMoney.test.ts`
Expected: FAIL — `Failed to resolve import "./parseMoney"`

- [ ] **Step 3: 구현 작성**

`src/format/parseMoney.ts`:

```ts
const EOK = 100_000_000;
const MAN = 10_000;

const WON_PATTERN = /^(\d+(?:\.\d+)?)원$/;
const EOK_PATTERN = /^(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)만?)?$/;
const MAN_PATTERN = /^(\d+(?:\.\d+)?)만$/;
const BARE_PATTERN = /^(\d+(?:\.\d+)?)$/;

/**
 * 한국식 금액 문자열을 원 단위 정수로 바꾼다.
 * 단위가 없는 숫자는 **만원**으로 읽는다(한국 부동산 입력 관행).
 *
 * 파싱할 수 없으면 `NaN`이 아니라 `null`을 반환한다. 호출자는 이를
 * "미입력"으로 취급해야 하며, 엔진에는 절대 `NaN`이 흘러가지 않는다.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  if (s === "") return null;

  const won = WON_PATTERN.exec(s);
  if (won) return toWon(Number(won[1]));

  const eok = EOK_PATTERN.exec(s);
  if (eok) {
    const man = eok[2] === undefined ? 0 : Number(eok[2]);
    return toWon(Number(eok[1]) * EOK + man * MAN);
  }

  const man = MAN_PATTERN.exec(s);
  if (man) return toWon(Number(man[1]) * MAN);

  const bare = BARE_PATTERN.exec(s);
  if (bare) return toWon(Number(bare[1]) * MAN);

  return null;
}

function toWon(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 14개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 한국식 금액 문자열 파서 추가"
```

---

## Task 4: `MoneyInput` 컴포넌트

**Files:**
- Create: `src/components/MoneyInput.tsx`, `src/components/MoneyInput.test.tsx`

**Interfaces:**
- Consumes: `parseMoney(raw: string): number | null` (Task 3), `formatWon(won: number): string` (Task 2)
- Produces:
  ```ts
  interface MoneyInputProps {
    id: string;
    label: string;
    value: number | null;
    onChange: (won: number | null) => void;
    hint?: string;
  }
  function MoneyInput(props: MoneyInputProps): JSX.Element
  ```

**설계 노트:** 만원 기본 해석은 `50000000`을 5,000억으로 읽는 위험을 안는다. 이를 막는 것은 규칙이 아니라 **즉시 되비추기**다 — 입력란 바로 아래에 해석 결과를 사람이 읽는 형태로 항상 표시한다. 자릿수를 틀린 순간 눈에 보인다. 이 되비추기는 장식이 아니라 만원 기본값을 성립시키는 필수 요소다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/MoneyInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoneyInput } from "./MoneyInput";

function setup(value: number | null = null) {
  const onChange = vi.fn();
  render(
    <MoneyInput id="cash" label="보유 현금" value={value} onChange={onChange} />,
  );
  return { onChange, input: screen.getByLabelText("보유 현금") };
}

describe("MoneyInput", () => {
  it("입력한 만원 단위 숫자를 원 단위로 내보낸다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "35000");
    expect(onChange).toHaveBeenLastCalledWith(350_000_000);
  });

  it("해석 결과를 사람이 읽는 형태로 되비춘다", async () => {
    const { input } = setup();
    await userEvent.type(input, "35000");
    expect(screen.getByText("3억 5,000만원")).toBeInTheDocument();
  });

  it("자릿수를 틀리면 되비추기로 드러난다", async () => {
    const { input } = setup();
    await userEvent.type(input, "50000000");
    expect(screen.getByText("5,000억원")).toBeInTheDocument();
  });

  it("읽을 수 없는 입력이면 null을 내보내고 안내를 띄운다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "abc");
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("숫자로 읽을 수 없습니다")).toBeInTheDocument();
  });

  it("비우면 null을 내보내고 되비추기를 지운다", async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, "1");
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("숫자로 읽을 수 없습니다")).not.toBeInTheDocument();
  });

  it("초기 value가 있으면 만원 단위로 채워 보여준다", () => {
    setup(350_000_000);
    expect(screen.getByLabelText("보유 현금")).toHaveValue("35000");
  });

  it("힌트를 표시한다", () => {
    render(
      <MoneyInput
        id="x"
        label="라벨"
        value={null}
        onChange={vi.fn()}
        hint="단위 없이 쓰면 만원입니다"
      />,
    );
    expect(screen.getByText("단위 없이 쓰면 만원입니다")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/MoneyInput.test.tsx`
Expected: FAIL — `Failed to resolve import "./MoneyInput"`

- [ ] **Step 3: 구현 작성**

`src/components/MoneyInput.tsx`:

```tsx
import { useEffect, useState } from "react";
import { formatWon } from "../format/won";
import { parseMoney } from "../format/parseMoney";

const MAN = 10_000;

export interface MoneyInputProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (won: number | null) => void;
  hint?: string;
}

/**
 * 한국식 금액 입력. 단위 없는 숫자는 만원으로 읽는다.
 *
 * 입력란 아래에 해석 결과를 항상 되비춘다. 만원 기본 해석은 자릿수를 틀리기
 * 쉬운데(50000000을 "5천만원"으로 의도해도 5,000억이 된다), 되비추기가 그
 * 오해를 즉시 눈에 보이게 만든다. 이것이 만원 기본값을 성립시킨다.
 */
export function MoneyInput({
  id,
  label,
  value,
  onChange,
  hint,
}: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value));

  useEffect(() => {
    setText((current) =>
      parseMoney(current) === value ? current : toText(value),
    );
  }, [value]);

  const parsed = parseMoney(text);
  const unreadable = text.trim() !== "" && parsed === null;

  function handleChange(next: string) {
    setText(next);
    onChange(parseMoney(next));
  }

  return (
    <div className="money-input">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
      />
      {hint !== undefined && <p className="hint">{hint}</p>}
      {parsed !== null && <p className="echo">{formatWon(parsed)}</p>}
      {unreadable && <p className="error">숫자로 읽을 수 없습니다</p>}
    </div>
  );
}

/** 원 단위 값을 입력란에 표시할 만원 단위 문자열로 바꾼다. */
function toText(value: number | null): string {
  if (value === null) return "";
  if (value % MAN !== 0) return `${value}원`;
  return String(value / MAN);
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 7개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 해석 결과를 되비추는 금액 입력 컴포넌트 추가"
```

---

## Task 5: `useProfileForm` — 폼 상태와 저장

**Files:**
- Create: `src/state/useProfileForm.ts`, `src/state/useProfileForm.test.ts`

**Interfaces:**
- Consumes: `BuyerProfile`, `HouseholdStatus` (`src/lib/finance`)
- Produces:
  ```ts
  const STORAGE_KEY = "budget-profile-v1"
  interface ExistingHomeFormState {
    expectedSalePrice: number | null
    remainingLoan: number | null
    capitalGainsTax: number | null
  }
  interface ProfileFormState {
    cash: number | null
    annualIncome: number | null
    existingDebtAnnualPayment: number
    status: HouseholdStatus
    isFirstTimeBuyer: boolean
    exclusiveAreaSqm: number
    existingHome: ExistingHomeFormState
  }
  const DEFAULT_FORM_STATE: ProfileFormState
  function toProfile(state: ProfileFormState): BuyerProfile | null
  function loadStoredState(storage: Pick<Storage, "getItem">): ProfileFormState
  function useProfileForm(): {
    state: ProfileFormState
    setField: <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => void
    setExistingHomeField: <K extends keyof ExistingHomeFormState>(key: K, value: ExistingHomeFormState[K]) => void
    reset: () => void
    profile: BuyerProfile | null
  }
  ```

**설계 노트:** 필수는 `cash`와 `annualIncome` 둘뿐이다. `isFirstTimeBuyer` 기본값이 `false`인 이유는 잘못 켜두면 한도를 과대평가하는 방향이기 때문이다. `localStorage`의 값은 사용자가 직접 고칠 수 있으므로 신뢰하지 않고 읽을 때 다시 검증한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/state/useProfileForm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM_STATE,
  loadStoredState,
  toProfile,
  type ProfileFormState,
} from "./useProfileForm";

function state(overrides: Partial<ProfileFormState> = {}): ProfileFormState {
  return { ...DEFAULT_FORM_STATE, ...overrides };
}

describe("DEFAULT_FORM_STATE", () => {
  it("생애최초는 꺼진 쪽이 기본이다 — 켜두면 한도를 과대평가한다", () => {
    expect(DEFAULT_FORM_STATE.isFirstTimeBuyer).toBe(false);
  });

  it("필수값은 비어 있고 나머지는 기본값이 있다", () => {
    expect(DEFAULT_FORM_STATE.cash).toBeNull();
    expect(DEFAULT_FORM_STATE.annualIncome).toBeNull();
    expect(DEFAULT_FORM_STATE.existingDebtAnnualPayment).toBe(0);
    expect(DEFAULT_FORM_STATE.status).toBe("무주택");
    expect(DEFAULT_FORM_STATE.exclusiveAreaSqm).toBe(84);
  });
});

describe("toProfile", () => {
  it("현금이 없으면 null이다", () => {
    expect(toProfile(state({ annualIncome: 50_000_000 }))).toBeNull();
  });

  it("소득이 없으면 null이다", () => {
    expect(toProfile(state({ cash: 200_000_000 }))).toBeNull();
  });

  it("두 필수값이 있으면 프로필을 만든다", () => {
    const profile = toProfile(
      state({ cash: 200_000_000, annualIncome: 50_000_000 }),
    );
    expect(profile).toEqual({
      status: "무주택",
      cash: 200_000_000,
      annualIncome: 50_000_000,
      existingDebtAnnualPayment: 0,
      isFirstTimeBuyer: false,
      exclusiveAreaSqm: 84,
    });
  });

  it("무주택이면 existingHome을 넣지 않는다", () => {
    const profile = toProfile(
      state({
        cash: 1,
        annualIncome: 1,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: null,
        },
      }),
    );
    expect(profile?.existingHome).toBeUndefined();
  });

  it("갈아타기면서 기존주택 필수 두 값이 있으면 existingHome을 넣는다", () => {
    const profile = toProfile(
      state({
        cash: 1,
        annualIncome: 1,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: 20_000_000,
        },
      }),
    );
    expect(profile?.existingHome).toEqual({
      expectedSalePrice: 700_000_000,
      remainingLoan: 300_000_000,
      capitalGainsTax: 20_000_000,
    });
  });

  it("양도세 미입력이면 capitalGainsTax를 생략한다 — 엔진이 경고를 낸다", () => {
    const profile = toProfile(
      state({
        cash: 1,
        annualIncome: 1,
        status: "갈아타기",
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
          capitalGainsTax: null,
        },
      }),
    );
    expect(profile?.existingHome?.capitalGainsTax).toBeUndefined();
  });

  it("갈아타기인데 기존주택 값이 없으면 existingHome 없이 만든다", () => {
    const profile = toProfile(
      state({ cash: 1, annualIncome: 1, status: "갈아타기" }),
    );
    expect(profile).not.toBeNull();
    expect(profile?.existingHome).toBeUndefined();
  });
});

describe("loadStoredState", () => {
  function storage(value: string | null): Pick<Storage, "getItem"> {
    return { getItem: () => value };
  }

  it("저장된 값이 없으면 기본값이다", () => {
    expect(loadStoredState(storage(null))).toEqual(DEFAULT_FORM_STATE);
  });

  it("깨진 JSON이면 조용히 기본값으로 돌아간다", () => {
    expect(loadStoredState(storage("{{{"))).toEqual(DEFAULT_FORM_STATE);
  });

  it("타입이 어긋난 필드는 기본값으로 대체한다", () => {
    const stored = JSON.stringify({
      cash: "이백만원",
      annualIncome: 50_000_000,
      exclusiveAreaSqm: -5,
      status: "외계인",
    });
    const loaded = loadStoredState(storage(stored));
    expect(loaded.cash).toBeNull();
    expect(loaded.annualIncome).toBe(50_000_000);
    expect(loaded.exclusiveAreaSqm).toBe(84);
    expect(loaded.status).toBe("무주택");
  });

  it("정상 저장값은 그대로 복원한다", () => {
    const stored = JSON.stringify({
      ...DEFAULT_FORM_STATE,
      cash: 200_000_000,
      annualIncome: 70_000_000,
      isFirstTimeBuyer: true,
    });
    const loaded = loadStoredState(storage(stored));
    expect(loaded.cash).toBe(200_000_000);
    expect(loaded.isFirstTimeBuyer).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/state/useProfileForm.test.ts`
Expected: FAIL — `Failed to resolve import "./useProfileForm"`

- [ ] **Step 3: 구현 작성**

`src/state/useProfileForm.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import type { BuyerProfile, HouseholdStatus } from "../lib/finance";

export const STORAGE_KEY = "budget-profile-v1";

export interface ExistingHomeFormState {
  expectedSalePrice: number | null;
  remainingLoan: number | null;
  capitalGainsTax: number | null;
}

export interface ProfileFormState {
  cash: number | null;
  annualIncome: number | null;
  existingDebtAnnualPayment: number;
  status: HouseholdStatus;
  isFirstTimeBuyer: boolean;
  exclusiveAreaSqm: number;
  existingHome: ExistingHomeFormState;
}

export const DEFAULT_FORM_STATE: ProfileFormState = {
  cash: null,
  annualIncome: null,
  existingDebtAnnualPayment: 0,
  status: "무주택",
  // 켜두면 LTV·정책대출 자격을 과대평가하는 방향이므로 꺼진 쪽이 안전하다.
  isFirstTimeBuyer: false,
  exclusiveAreaSqm: 84,
  existingHome: {
    expectedSalePrice: null,
    remainingLoan: null,
    capitalGainsTax: null,
  },
};

/** 필수값(현금·소득)이 채워졌을 때만 BuyerProfile을 만든다. */
export function toProfile(state: ProfileFormState): BuyerProfile | null {
  if (state.cash === null || state.annualIncome === null) return null;

  const profile: BuyerProfile = {
    status: state.status,
    cash: state.cash,
    annualIncome: state.annualIncome,
    existingDebtAnnualPayment: state.existingDebtAnnualPayment,
    isFirstTimeBuyer: state.isFirstTimeBuyer,
    exclusiveAreaSqm: state.exclusiveAreaSqm,
  };

  const home = state.existingHome;
  if (
    state.status === "갈아타기" &&
    home.expectedSalePrice !== null &&
    home.remainingLoan !== null
  ) {
    profile.existingHome = {
      expectedSalePrice: home.expectedSalePrice,
      remainingLoan: home.remainingLoan,
      // 미입력이면 넣지 않는다. 엔진이 "양도세 미반영" 경고를 낸다.
      ...(home.capitalGainsTax !== null
        ? { capitalGainsTax: home.capitalGainsTax }
        : {}),
    };
  }

  return profile;
}

/**
 * 저장된 폼 상태를 복원한다.
 * localStorage는 사용자가 직접 고칠 수 있는 자리이므로 신뢰하지 않는다.
 * 형태가 어긋난 필드는 조용히 기본값으로 대체한다.
 */
export function loadStoredState(
  storage: Pick<Storage, "getItem">,
): ProfileFormState {
  let raw: unknown;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_FORM_STATE;
    raw = JSON.parse(stored);
  } catch {
    return DEFAULT_FORM_STATE;
  }

  if (typeof raw !== "object" || raw === null) return DEFAULT_FORM_STATE;
  const o = raw as Record<string, unknown>;
  const home =
    typeof o.existingHome === "object" && o.existingHome !== null
      ? (o.existingHome as Record<string, unknown>)
      : {};

  return {
    cash: nullableAmount(o.cash),
    annualIncome: nullableAmount(o.annualIncome),
    existingDebtAnnualPayment:
      amount(o.existingDebtAnnualPayment) ??
      DEFAULT_FORM_STATE.existingDebtAnnualPayment,
    status:
      o.status === "무주택" || o.status === "갈아타기"
        ? o.status
        : DEFAULT_FORM_STATE.status,
    isFirstTimeBuyer:
      typeof o.isFirstTimeBuyer === "boolean"
        ? o.isFirstTimeBuyer
        : DEFAULT_FORM_STATE.isFirstTimeBuyer,
    exclusiveAreaSqm:
      positive(o.exclusiveAreaSqm) ?? DEFAULT_FORM_STATE.exclusiveAreaSqm,
    existingHome: {
      expectedSalePrice: nullableAmount(home.expectedSalePrice),
      remainingLoan: nullableAmount(home.remainingLoan),
      capitalGainsTax: nullableAmount(home.capitalGainsTax),
    },
  };
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function nullableAmount(value: unknown): number | null {
  return amount(value);
}

function positive(value: unknown): number | null {
  const n = amount(value);
  return n !== null && n > 0 ? n : null;
}

export function useProfileForm() {
  const [state, setState] = useState<ProfileFormState>(() =>
    loadStoredState(window.localStorage),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장 실패는 기능에 영향을 주지 않는다. 조용히 넘어간다.
    }
  }, [state]);

  const setField = useCallback(
    <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setExistingHomeField = useCallback(
    <K extends keyof ExistingHomeFormState>(
      key: K,
      value: ExistingHomeFormState[K],
    ) => {
      setState((prev) => ({
        ...prev,
        existingHome: { ...prev.existingHome, [key]: value },
      }));
    },
    [],
  );

  const reset = useCallback(() => setState(DEFAULT_FORM_STATE), []);

  return { state, setField, setExistingHomeField, reset, profile: toProfile(state) };
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 13개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 폼 상태·기본값·localStorage 복원 훅 추가"
```

---

## Task 6: `useAffordability` — 결과와 슬라이더 안전성

**Files:**
- Create: `src/state/useAffordability.ts`, `src/state/useAffordability.test.ts`

**Interfaces:**
- Consumes: `calcAffordablePrice`, `calcMaxLoan`, `calcSafetyScore`, `parseRules`, `PRICE_STEP`, `AffordableResult`, `LoanLimit`, `SafetyScore`, `BuyerProfile`, `Rules` (`src/lib/finance`)
- Produces:
  ```ts
  const rules: Rules                       // 번들된 룰셋을 파싱한 싱글턴
  interface Affordability {
    result: AffordableResult
    price: number
    setPrice: (price: number) => void
    loanAtPrice: LoanLimit
    safety: SafetyScore
  }
  function useAffordability(profile: BuyerProfile | null): Affordability | null
  ```

**설계 노트:** 슬라이더 가격은 "직접 지정한 값"과 "최대치"를 구분해 보관한다. 프로필이 바뀌어 실구매력이 줄어들면 지정값이 상한을 넘을 수 있으므로, 읽을 때 `Math.min`으로 조인다. 초기값은 최대치다 — "여기까지 빌릴 수 있다, 이제 내려보라"가 이 화면의 흐름이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/state/useAffordability.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BuyerProfile } from "../lib/finance";
import { PRICE_STEP } from "../lib/finance";
import { rules, useAffordability } from "./useAffordability";

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

describe("rules", () => {
  it("번들된 룰셋이 파싱되어 있다", () => {
    expect(rules.version).toBe("2026-03");
  });
});

describe("useAffordability", () => {
  it("프로필이 없으면 null이다", () => {
    const { result } = renderHook(() => useAffordability(null));
    expect(result.current).toBeNull();
  });

  it("초기 가격은 실구매력과 같다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    expect(result.current?.price).toBe(result.current?.result.affordablePrice);
  });

  it("가격을 내리면 월 상환액과 부담률이 줄어든다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    const atMax = result.current!.safety;

    act(() => result.current!.setPrice(100_000_000));

    expect(result.current!.price).toBe(100_000_000);
    expect(result.current!.safety.monthlyPayment).toBeLessThan(
      atMax.monthlyPayment,
    );
    expect(result.current!.safety.burdenRatio).toBeLessThan(atMax.burdenRatio);
  });

  it("실구매력을 넘는 가격은 상한으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    const max = result.current!.result.affordablePrice;

    act(() => result.current!.setPrice(max + 10 * PRICE_STEP));

    expect(result.current!.price).toBe(max);
  });

  it("음수 가격은 0으로 조인다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    act(() => result.current!.setPrice(-1));
    expect(result.current!.price).toBe(0);
  });

  it("loanAtPrice는 그 가격에서의 대출 한도다", () => {
    const { result } = renderHook(() => useAffordability(profile()));
    act(() => result.current!.setPrice(300_000_000));
    expect(result.current!.loanAtPrice.amount).toBeLessThanOrEqual(
      300_000_000,
    );
    expect(result.current!.loanAtPrice.binding).toBeDefined();
  });

  it("소득이 0이면 실구매력이 0이다", () => {
    const { result } = renderHook(() =>
      useAffordability(profile({ cash: 0, annualIncome: 0 })),
    );
    expect(result.current?.result.affordablePrice).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/state/useAffordability.test.ts`
Expected: FAIL — `Failed to resolve import "./useAffordability"`

- [ ] **Step 3: 구현 작성**

`src/state/useAffordability.ts`:

```ts
import { useCallback, useMemo, useState } from "react";
import rawRules from "../../rules/2026-03.json";
import {
  calcAffordablePrice,
  calcMaxLoan,
  calcSafetyScore,
  parseRules,
  type AffordableResult,
  type BuyerProfile,
  type LoanLimit,
  type Rules,
  type SafetyScore,
} from "../lib/finance";

/**
 * 번들에 포함된 규제 룰셋.
 * 빌드 타임에 import되므로 네트워크 요청도 로딩 상태도 없다.
 */
export const rules: Rules = parseRules(rawRules);

export interface Affordability {
  result: AffordableResult;
  /** 슬라이더가 가리키는 현재 가격(원) */
  price: number;
  setPrice: (price: number) => void;
  /** 현재 가격에서의 대출 한도 */
  loanAtPrice: LoanLimit;
  /** 현재 가격에서 그 대출을 받았을 때의 상환 부담 */
  safety: SafetyScore;
}

export function useAffordability(
  profile: BuyerProfile | null,
): Affordability | null {
  // null이면 "최대치에 붙어 있음"을 뜻한다. 프로필이 바뀌어 실구매력이
  // 달라져도 자동으로 따라간다.
  const [override, setOverride] = useState<number | null>(null);

  const result = useMemo(
    () => (profile === null ? null : calcAffordablePrice(profile, rules)),
    [profile],
  );

  const setPrice = useCallback((next: number) => setOverride(next), []);

  return useMemo(() => {
    if (profile === null || result === null) return null;

    const price =
      override === null
        ? result.affordablePrice
        : clamp(override, 0, result.affordablePrice);

    const loanAtPrice = calcMaxLoan(profile, rules, price);
    const safety = calcSafetyScore(profile, rules, loanAtPrice.amount);

    return { result, price, setPrice, loanAtPrice, safety };
  }, [profile, result, override, setPrice]);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 8개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 실구매력 계산과 슬라이더 안전성 재계산 훅 추가"
```

---

## Task 7: `BindingExplainer` — 무엇이 막고 있고 무엇을 해야 하는가

**Files:**
- Create: `src/components/BindingExplainer.tsx`, `src/components/BindingExplainer.test.tsx`

**Interfaces:**
- Consumes: `formatWon` (Task 2), `LoanLimit`, `BindingConstraint` (`src/lib/finance`)
- Produces:
  ```ts
  interface BindingExplainerProps { loanLimit: LoanLimit }
  function BindingExplainer(props: BindingExplainerProps): JSX.Element
  ```

**설계 노트:** 이 컴포넌트가 제품이다. `binding` 값 자체가 아니라 **사용자가 다음에 무엇을 해야 하는지**를 말한다. "6억 캡에 걸렸다"와 "DSR에 걸렸다"는 취해야 할 행동이 완전히 다르다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/BindingExplainer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BindingConstraint, LoanLimit } from "../lib/finance";
import { BindingExplainer } from "./BindingExplainer";

function limit(binding: BindingConstraint): LoanLimit {
  return {
    amount: 420_000_000,
    binding,
    breakdown: {
      LTV: 420_000_000,
      DSR: 574_316_140,
      CAP: 600_000_000,
      POLICY: 0,
    },
  };
}

describe("BindingExplainer", () => {
  it("LTV면 현금을 더 모으라고 안내한다", () => {
    render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
  });

  it("DSR이면 기존 부채를 갚으라고 안내한다", () => {
    render(<BindingExplainer loanLimit={limit("DSR")} />);
    expect(screen.getByText(/기존 부채를 갚으면/)).toBeInTheDocument();
  });

  it("CAP이면 대출로는 못 늘린다고 못박는다", () => {
    render(<BindingExplainer loanLimit={limit("CAP")} />);
    expect(screen.getByText(/대출로는 늘릴 수 없습니다/)).toBeInTheDocument();
  });

  it("POLICY면 정책대출을 택했을 때의 한도임을 밝힌다", () => {
    render(<BindingExplainer loanLimit={limit("POLICY")} />);
    expect(screen.getByText(/정책대출을 택했을 때/)).toBeInTheDocument();
  });

  it("걸린 한도 금액을 보여준다", () => {
    // amount와 breakdown.LTV는 엔진 불변식상 같은 값이므로 텍스트가 두 곳에
    // 나온다. getByText는 복수 매칭에서 예외를 던지므로 요소를 특정한다.
    const { container } = render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(container.querySelector(".binding-amount")).toHaveTextContent(
      "4억 2,000만원",
    );
  });

  it("네 제약의 한도를 모두 펼쳐 보여준다", () => {
    render(<BindingExplainer loanLimit={limit("LTV")} />);
    expect(screen.getByText("5억 7,431만 6,140원")).toBeInTheDocument();
    expect(screen.getByText("6억원")).toBeInTheDocument();
    expect(screen.getByText("0원")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/BindingExplainer.test.tsx`
Expected: FAIL — `Failed to resolve import "./BindingExplainer"`

- [ ] **Step 3: 구현 작성**

`src/components/BindingExplainer.tsx`:

```tsx
import { formatWon } from "../format/won";
import type { BindingConstraint, LoanLimit } from "../lib/finance";

export interface BindingExplainerProps {
  loanLimit: LoanLimit;
}

interface Explanation {
  title: string;
  advice: string;
}

const EXPLANATIONS: Record<BindingConstraint, Explanation> = {
  LTV: {
    title: "담보 가치(LTV)에 걸렸습니다",
    advice:
      "집값의 일정 비율까지만 빌려줍니다. 현금을 더 모으면 살 수 있는 가격이 올라갑니다.",
  },
  DSR: {
    title: "상환 능력(DSR)에 걸렸습니다",
    advice:
      "소득 대비 연간 상환액 한도에 막혔습니다. 기존 부채를 갚으면 한도가 늘어납니다.",
  },
  CAP: {
    title: "수도권 대출 상한에 걸렸습니다",
    advice:
      "수도권 주택구입 목적 주택담보대출은 금액 상한이 있습니다. 대출로는 늘릴 수 없습니다 — 현금이 더 필요합니다.",
  },
  POLICY: {
    title: "정책대출 한도가 최대치입니다",
    advice:
      "정책대출을 택했을 때 받을 수 있는 금액이 은행 대출보다 큽니다. 금리 조건을 함께 비교해 보세요.",
  },
};

const LABELS: Record<BindingConstraint, string> = {
  LTV: "담보 가치(LTV)",
  DSR: "상환 능력(DSR)",
  CAP: "수도권 상한",
  POLICY: "정책대출",
};

const ORDER: BindingConstraint[] = ["LTV", "DSR", "CAP", "POLICY"];

export function BindingExplainer({ loanLimit }: BindingExplainerProps) {
  const explanation = EXPLANATIONS[loanLimit.binding];

  return (
    <section className="binding-explainer">
      <h3>{explanation.title}</h3>
      <p className="binding-amount">{formatWon(loanLimit.amount)}</p>
      <p className="binding-advice">{explanation.advice}</p>

      <details>
        <summary>네 가지 한도 모두 보기</summary>
        <dl>
          {ORDER.map((key) => (
            <div key={key} data-binding={key}>
              <dt>
                {LABELS[key]}
                {key === loanLimit.binding && " ← 여기에 걸림"}
              </dt>
              <dd>{formatWon(loanLimit.breakdown[key])}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 6개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 걸린 제약과 다음 행동을 설명하는 컴포넌트 추가"
```

---

## Task 8: 결과 표시 컴포넌트 3종

**Files:**
- Create: `src/components/BudgetResult.tsx`, `src/components/CostBreakdown.tsx`, `src/components/PolicyLoanList.tsx`, `src/components/WarningList.tsx`
- Create: `src/components/BudgetResult.test.tsx`, `src/components/PolicyLoanList.test.tsx`

**Interfaces:**
- Consumes: `formatWon` (Task 2), `BindingExplainer` (Task 7), `AffordableResult`, `CostBreakdown as CostBreakdownData`, `MatchedPolicyLoan` (`src/lib/finance`)
- Produces:
  ```ts
  function BudgetResult(props: { result: AffordableResult }): JSX.Element
  function CostBreakdown(props: { costs: CostBreakdownData }): JSX.Element
  function PolicyLoanList(props: { matched: MatchedPolicyLoan[] }): JSX.Element | null
  function WarningList(props: { warnings: string[] }): JSX.Element | null
  ```

**설계 노트:** 실구매력이 0원이면 숫자를 들이밀지 않고 "주담대가 나오지 않습니다"와 무엇을 바꾸면 되는지를 보여준다. 정책대출은 **`availableAmount`만** 금액으로 표시한다 — `loan.maxAmount`는 상품 고시 한도이지 이 구매자가 받을 수 있는 금액이 아니다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/BudgetResult.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AffordableResult } from "../lib/finance";
import { BudgetResult } from "./BudgetResult";

function result(overrides: Partial<AffordableResult> = {}): AffordableResult {
  return {
    affordablePrice: 640_000_000,
    loanLimit: {
      amount: 420_000_000,
      binding: "LTV",
      breakdown: { LTV: 420_000_000, DSR: 574_316_140, CAP: 600_000_000, POLICY: 0 },
    },
    costs: {
      acquisitionTax: 8_400_000,
      brokerageFee: 2_560_000,
      legalFee: 600_000,
      movingCost: 1_500_000,
      total: 13_060_000,
    },
    availableCash: 200_000_000,
    matchedPolicyLoans: [],
    warnings: [],
    ...overrides,
  };
}

describe("BudgetResult", () => {
  it("실구매력을 크게 보여준다", () => {
    render(<BudgetResult result={result()} />);
    expect(screen.getByText("6억 4,000만원")).toBeInTheDocument();
  });

  it("부대비용 합계를 보여준다", () => {
    render(<BudgetResult result={result()} />);
    expect(screen.getByText("1,306만원")).toBeInTheDocument();
  });

  it("걸린 제약 설명을 함께 보여준다", () => {
    render(<BudgetResult result={result()} />);
    expect(screen.getByText(/현금을 더 모으면/)).toBeInTheDocument();
  });

  it("실구매력이 0이면 숫자 대신 안내를 보여준다", () => {
    render(<BudgetResult result={result({ affordablePrice: 0 })} />);
    expect(
      screen.getByText(/현재 조건으로는 주택담보대출이 나오지 않습니다/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
  });

  it("경고가 있으면 결과 위에 보여준다", () => {
    render(
      <BudgetResult
        result={result({ warnings: ["양도세가 반영되지 않았습니다."] })}
      />,
    );
    expect(
      screen.getByText("양도세가 반영되지 않았습니다."),
    ).toBeInTheDocument();
  });
});
```

`src/components/PolicyLoanList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MatchedPolicyLoan } from "../lib/finance";
import { PolicyLoanList } from "./PolicyLoanList";

const 디딤돌: MatchedPolicyLoan = {
  loan: {
    id: "디딤돌",
    eligibility: { requiresNoHome: true },
    maxAmount: 250_000_000,
    rate: 0.032,
  },
  availableAmount: 109_900_000,
};

describe("PolicyLoanList", () => {
  it("자격 상품이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<PolicyLoanList matched={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("상품명과 금리를 보여준다", () => {
    render(<PolicyLoanList matched={[디딤돌]} />);
    expect(screen.getByText("디딤돌")).toBeInTheDocument();
    expect(screen.getByText("연 3.2%")).toBeInTheDocument();
  });

  it("실제 수령 가능액을 보여준다", () => {
    render(<PolicyLoanList matched={[디딤돌]} />);
    expect(screen.getByText("1억 990만원")).toBeInTheDocument();
  });

  it("상품 고시 한도를 금액으로 보여주지 않는다", () => {
    render(<PolicyLoanList matched={[디딤돌]} />);
    // 2억 5,000만원 = maxAmount. 이걸 보여주면 상환능력을 무시한 숫자가 된다.
    expect(screen.queryByText("2억 5,000만원")).not.toBeInTheDocument();
  });

  it("수령 가능액이 0이면 자격은 되지만 받을 수 없다고 밝힌다", () => {
    render(
      <PolicyLoanList matched={[{ ...디딤돌, availableAmount: 0 }]} />,
    );
    expect(
      screen.getByText(/소득 기준으로는 받을 수 있는 금액이 없습니다/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/BudgetResult.test.tsx src/components/PolicyLoanList.test.tsx`
Expected: FAIL — `Failed to resolve import "./BudgetResult"`

- [ ] **Step 3: 구현 작성**

`src/components/WarningList.tsx`:

```tsx
export interface WarningListProps {
  warnings: string[];
}

/** 엔진이 낸 경고. 결과 위에 두고 접지 않는다. */
export function WarningList({ warnings }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <ul className="warning-list" role="alert">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}
```

`src/components/CostBreakdown.tsx`:

```tsx
import { formatWon } from "../format/won";
import type { CostBreakdown as CostBreakdownData } from "../lib/finance";

export interface CostBreakdownProps {
  costs: CostBreakdownData;
}

const ROWS: Array<[keyof Omit<CostBreakdownData, "total">, string]> = [
  ["acquisitionTax", "취득세 (지방교육세·농특세 포함)"],
  ["brokerageFee", "중개보수"],
  ["legalFee", "법무사 비용"],
  ["movingCost", "이사 비용"],
];

export function CostBreakdown({ costs }: CostBreakdownProps) {
  return (
    <details className="cost-breakdown">
      <summary>
        부대비용 <span className="cost-total">{formatWon(costs.total)}</span>
      </summary>
      <dl>
        {ROWS.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{formatWon(costs[key])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
```

`src/components/PolicyLoanList.tsx`:

```tsx
import { formatWon } from "../format/won";
import type { MatchedPolicyLoan } from "../lib/finance";

export interface PolicyLoanListProps {
  matched: MatchedPolicyLoan[];
}

/**
 * 자격이 되는 정책대출과 **실제 수령 가능액**.
 *
 * `loan.maxAmount`(상품 고시 한도)를 금액으로 표시하지 않는다. 정책대출도
 * 상환능력과 담보가치의 제약을 받으므로, 고시 한도를 보여주면 연소득 0원
 * 구매자에게 3.6억을 받을 수 있다고 말하게 된다.
 */
export function PolicyLoanList({ matched }: PolicyLoanListProps) {
  if (matched.length === 0) return null;

  return (
    <section className="policy-loan-list">
      <h3>받을 수 있는 정책대출</h3>
      <ul>
        {matched.map(({ loan, availableAmount }) => (
          <li key={loan.id}>
            <span className="policy-name">{loan.id}</span>
            <span className="policy-rate">
              연 {(loan.rate * 100).toFixed(1)}%
            </span>
            {availableAmount > 0 ? (
              <span className="policy-amount">{formatWon(availableAmount)}</span>
            ) : (
              <span className="policy-none">
                자격은 되지만 소득 기준으로는 받을 수 있는 금액이 없습니다
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`src/components/BudgetResult.tsx`:

```tsx
import type { AffordableResult } from "../lib/finance";
import { formatWon } from "../format/won";
import { BindingExplainer } from "./BindingExplainer";
import { CostBreakdown } from "./CostBreakdown";
import { PolicyLoanList } from "./PolicyLoanList";
import { WarningList } from "./WarningList";

export interface BudgetResultProps {
  result: AffordableResult;
}

export function BudgetResult({ result }: BudgetResultProps) {
  return (
    <section className="budget-result">
      <WarningList warnings={result.warnings} />

      {result.affordablePrice === 0 ? (
        <div className="no-budget">
          <h2>현재 조건으로는 주택담보대출이 나오지 않습니다</h2>
          <p>
            소득이 없거나 기존 부채가 이미 상환 한도를 채우고 있습니다.
            기존 부채를 줄이거나 소득을 다시 확인해 보세요.
          </p>
        </div>
      ) : (
        <>
          <h2>실구매 가능 가격</h2>
          <p className="affordable-price">{formatWon(result.affordablePrice)}</p>
          <BindingExplainer loanLimit={result.loanLimit} />
          <CostBreakdown costs={result.costs} />
          <PolicyLoanList matched={result.matchedPolicyLoans} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 10개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 예산 결과·부대비용·정책대출·경고 표시 컴포넌트 추가"
```

---

## Task 9: `PriceSlider`와 `SafetyBadge`

**Files:**
- Create: `src/components/PriceSlider.tsx`, `src/components/SafetyBadge.tsx`
- Create: `src/components/PriceSlider.test.tsx`, `src/components/SafetyBadge.test.tsx`

**Interfaces:**
- Consumes: `formatWon` (Task 2), `PRICE_STEP`, `SafetyScore`, `SafetyLevel` (`src/lib/finance`)
- Produces:
  ```ts
  function PriceSlider(props: {
    price: number;
    max: number;
    onChange: (price: number) => void;
  }): JSX.Element
  function SafetyBadge(props: { safety: SafetyScore }): JSX.Element
  ```

**설계 노트:** 실구매력은 **빌릴 수 있는 한계이지 무리하지 않는 선이 아니다.** 최대치에서 대개 🟡·🔴가 나오고, 사용자가 슬라이더를 내려 🟢이 되는 지점을 직접 찾게 되는 것이 이 화면의 목적이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/SafetyBadge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SafetyScore } from "../lib/finance";
import { SafetyBadge } from "./SafetyBadge";

function score(overrides: Partial<SafetyScore> = {}): SafetyScore {
  return {
    monthlyPayment: 1_467_052,
    burdenRatio: 0.2934,
    stressedMonthlyPayment: 1_837_407,
    stressedBurdenRatio: 0.3675,
    level: "caution",
    ...overrides,
  };
}

describe("SafetyBadge", () => {
  it("월 상환액을 보여준다", () => {
    render(<SafetyBadge safety={score()} />);
    expect(screen.getByText("146만 7,052원")).toBeInTheDocument();
  });

  it("부담률을 퍼센트로 보여준다", () => {
    render(<SafetyBadge safety={score()} />);
    expect(screen.getByText("29.3%")).toBeInTheDocument();
  });

  it("등급별 라벨을 보여준다", () => {
    const { rerender } = render(<SafetyBadge safety={score({ level: "safe" })} />);
    expect(screen.getByText("안전")).toBeInTheDocument();

    rerender(<SafetyBadge safety={score({ level: "caution" })} />);
    expect(screen.getByText("주의")).toBeInTheDocument();

    rerender(<SafetyBadge safety={score({ level: "danger" })} />);
    expect(screen.getByText("위험")).toBeInTheDocument();
  });

  it("월 상환액과 부담률을 data-field로 구분해 노출한다", () => {
    // 통합 테스트가 이 속성으로 값을 집는다. 지우면 그쪽이 깨진다.
    const { container } = render(<SafetyBadge safety={score()} />);
    expect(container.querySelector('[data-field="payment"]')).not.toBeNull();
    expect(container.querySelector('[data-field="ratio"]')).not.toBeNull();
  });

  it("등급을 data 속성으로 노출해 스타일이 붙게 한다", () => {
    const { container } = render(<SafetyBadge safety={score({ level: "danger" })} />);
    expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
  });

  it("금리 스트레스 시나리오도 함께 보여준다", () => {
    render(<SafetyBadge safety={score()} />);
    expect(screen.getByText(/금리가 2%p 오르면/)).toBeInTheDocument();
    expect(screen.getByText("183만 7,407원")).toBeInTheDocument();
  });

  it("소득이 0이면 부담률 대신 안내를 보여준다", () => {
    render(
      <SafetyBadge
        safety={score({
          burdenRatio: Number.POSITIVE_INFINITY,
          stressedBurdenRatio: Number.POSITIVE_INFINITY,
        })}
      />,
    );
    expect(screen.getByText("소득 없음")).toBeInTheDocument();
  });
});
```

`src/components/PriceSlider.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRICE_STEP } from "../lib/finance";
import { PriceSlider } from "./PriceSlider";

describe("PriceSlider", () => {
  it("현재 가격을 사람이 읽는 형태로 보여준다", () => {
    render(
      <PriceSlider price={640_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    expect(screen.getByText("6억 4,000만원")).toBeInTheDocument();
  });

  it("범위와 단위가 엔진의 PRICE_STEP과 맞는다", () => {
    render(
      <PriceSlider price={100_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "640000000");
    expect(slider).toHaveAttribute("step", String(PRICE_STEP));
  });

  it("움직이면 새 가격을 알린다", () => {
    const onChange = vi.fn();
    render(
      <PriceSlider price={640_000_000} max={640_000_000} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "300000000" },
    });
    expect(onChange).toHaveBeenCalledWith(300_000_000);
  });

  it("최대치일 때 그것이 한계임을 알린다", () => {
    render(
      <PriceSlider price={640_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    expect(
      screen.getByText(/빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다/),
    ).toBeInTheDocument();
  });

  it("최대치가 아니면 한계 안내를 띄우지 않는다", () => {
    render(
      <PriceSlider price={300_000_000} max={640_000_000} onChange={vi.fn()} />,
    );
    expect(
      screen.queryByText(/빌릴 수 있는 한계이지/),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/PriceSlider.test.tsx src/components/SafetyBadge.test.tsx`
Expected: FAIL — `Failed to resolve import "./PriceSlider"`

- [ ] **Step 3: 구현 작성**

`src/components/SafetyBadge.tsx`:

```tsx
import { formatWon } from "../format/won";
import type { SafetyLevel, SafetyScore } from "../lib/finance";

export interface SafetyBadgeProps {
  safety: SafetyScore;
}

const LABELS: Record<SafetyLevel, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
};

export function SafetyBadge({ safety }: SafetyBadgeProps) {
  return (
    <section className="safety-badge" data-level={safety.level}>
      <p className="safety-level">{LABELS[safety.level]}</p>

      <dl>
        <div>
          <dt>월 상환액</dt>
          <dd data-field="payment">{formatWon(safety.monthlyPayment)}</dd>
        </div>
        <div>
          <dt>소득 대비 상환부담률</dt>
          <dd data-field="ratio">{formatRatio(safety.burdenRatio)}</dd>
        </div>
      </dl>

      <p className="safety-stress">
        금리가 2%p 오르면 월{" "}
        <span className="stressed-payment">
          {formatWon(safety.stressedMonthlyPayment)}
        </span>
        , 부담률{" "}
        <span className="stressed-ratio">
          {formatRatio(safety.stressedBurdenRatio)}
        </span>
      </p>
    </section>
  );
}

function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "소득 없음";
  return `${(ratio * 100).toFixed(1)}%`;
}
```

`src/components/PriceSlider.tsx`:

```tsx
import { formatWon } from "../format/won";
import { PRICE_STEP } from "../lib/finance";

export interface PriceSliderProps {
  price: number;
  max: number;
  onChange: (price: number) => void;
}

export function PriceSlider({ price, max, onChange }: PriceSliderProps) {
  return (
    <section className="price-slider">
      <label htmlFor="price-slider">이 가격에 산다면</label>
      <p className="slider-price">{formatWon(price)}</p>

      <input
        id="price-slider"
        type="range"
        min={0}
        max={max}
        step={PRICE_STEP}
        value={price}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      {price === max && (
        <p className="slider-warning">
          이것은 빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다.
          슬라이더를 내려 부담이 어떻게 달라지는지 확인해 보세요.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 12개가 더해진다. 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 가격 슬라이더와 상환부담 신호등 추가"
```

---

## Task 10: `ProfileForm`, 조립, 통합 테스트, 네트워크 없음 검증

**Files:**
- Create: `src/components/ProfileForm.tsx`, `src/components/ErrorBoundary.tsx`, `src/styles.css`
- Create: `src/integration.test.tsx`, `src/no-network.test.ts`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 동작하는 단일 페이지 앱

- [ ] **Step 1: 실패하는 테스트 작성**

`src/integration.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

/** 화면에 그려진 부담률(%)을 숫자로 읽는다. */
function readRatio(): number {
  const text =
    document.querySelector('[data-field="ratio"]')?.textContent ?? "";
  return Number(text.replace("%", ""));
}

/** 화면에 그려진 월 상환액을 원 단위 숫자로 읽는다. */
function readPayment(): number {
  const text =
    document.querySelector('[data-field="payment"]')?.textContent ?? "";
  return Number(text.replace(/[^0-9]/g, ""));
}

describe("예산 계산기 통합", () => {
  beforeEach(() => window.localStorage.clear());

  it("필수값을 채우기 전에는 결과를 그리지 않는다", () => {
    render(<App />);
    expect(screen.queryByText("실구매 가능 가격")).not.toBeInTheDocument();
    expect(screen.getByText(/현금과 연소득을 입력하면/)).toBeInTheDocument();
  });

  it("현금과 소득을 넣으면 결과와 슬라이더가 나타난다", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    expect(screen.getByText("실구매 가능 가격")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /걸렸습니다|최대치입니다/ }),
    ).toBeInTheDocument();
  });

  it("슬라이더를 내리면 월 상환액과 부담률이 줄어든다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    const slider = screen.getByRole("slider");
    const max = Number(slider.getAttribute("max"));
    expect(max).toBeGreaterThan(0);

    const ratioAtMax = readRatio();
    const paymentAtMax = readPayment();

    fireEvent.change(slider, { target: { value: String(Math.floor(max / 2 / 100_000) * 100_000) } });

    expect(readRatio()).toBeLessThan(ratioAtMax);
    expect(readPayment()).toBeLessThan(paymentAtMax);
  });

  it("최대치에서는 그것이 한계라는 경고가 뜬다", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    await userEvent.type(screen.getByLabelText("연 소득 (세전)"), "10000");

    expect(
      screen.getByText(/빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다/),
    ).toBeInTheDocument();
  });

  it("갈아타기를 고르면 기존주택 필드가 펼쳐진다", async () => {
    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("주택 보유 상황"),
      "갈아타기",
    );
    expect(screen.getByLabelText("기존 주택 예상 매도가")).toBeInTheDocument();
    expect(screen.getByLabelText("상환할 기존 대출")).toBeInTheDocument();
  });

  it("입력이 localStorage에 남아 새로고침 후 복원된다", async () => {
    const { unmount } = render(<App />);
    await userEvent.type(screen.getByLabelText("보유 현금"), "20000");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("보유 현금")).toHaveValue("20000");
  });
});
```

`src/no-network.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 이 제품의 약속은 "재무정보가 네트워크를 탈 경로가 코드상 존재하지 않는다"이다.
 * 설정이 아니라 구조로 보장되어야 하므로 소스를 직접 훑어 확인한다.
 *
 * 이 테스트만은 fs를 쓴다 — 순수 함수 규칙의 의도적 예외다.
 */
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /\bWebSocket\b/,
  /navigator\.sendBeacon/,
  /https?:\/\/(?!www\.w3\.org)/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx|css|html)$/.test(entry)) return [];
    if (entry.endsWith("no-network.test.ts")) return [];
    return [path];
  });
}

describe("네트워크 요청 없음", () => {
  it("소스 어디에도 네트워크 호출이 없다", () => {
    const offenders: string[] = [];

    for (const file of [...sourceFiles("src"), "index.html"]) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/integration.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: 보유 현금`

- [ ] **Step 3: `ProfileForm` 작성**

`src/components/ProfileForm.tsx`:

```tsx
import type {
  ExistingHomeFormState,
  ProfileFormState,
} from "../state/useProfileForm";
import { MoneyInput } from "./MoneyInput";

export interface ProfileFormProps {
  state: ProfileFormState;
  setField: <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => void;
  setExistingHomeField: <K extends keyof ExistingHomeFormState>(
    key: K,
    value: ExistingHomeFormState[K],
  ) => void;
}

export function ProfileForm({
  state,
  setField,
  setExistingHomeField,
}: ProfileFormProps) {
  return (
    <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
      <MoneyInput
        id="cash"
        label="보유 현금"
        value={state.cash}
        onChange={(won) => setField("cash", won)}
        hint="단위를 안 쓰면 만원으로 읽습니다. '3억5000'처럼 써도 됩니다."
      />

      <MoneyInput
        id="income"
        label="연 소득 (세전)"
        value={state.annualIncome}
        onChange={(won) => setField("annualIncome", won)}
      />

      <MoneyInput
        id="debt"
        label="기존 부채 연간 원리금"
        value={state.existingDebtAnnualPayment}
        onChange={(won) => setField("existingDebtAnnualPayment", won ?? 0)}
        hint="없으면 비워 두세요."
      />

      <div className="field">
        <label htmlFor="status">주택 보유 상황</label>
        <select
          id="status"
          value={state.status}
          onChange={(e) =>
            setField(
              "status",
              e.target.value === "갈아타기" ? "갈아타기" : "무주택",
            )
          }
        >
          <option value="무주택">무주택</option>
          <option value="갈아타기">갈아타기 (기존 주택 매도)</option>
        </select>
      </div>

      {state.status === "갈아타기" && (
        <fieldset className="existing-home">
          <legend>기존 주택</legend>
          <MoneyInput
            id="sale-price"
            label="기존 주택 예상 매도가"
            value={state.existingHome.expectedSalePrice}
            onChange={(won) => setExistingHomeField("expectedSalePrice", won)}
          />
          <MoneyInput
            id="remaining-loan"
            label="상환할 기존 대출"
            value={state.existingHome.remainingLoan}
            onChange={(won) => setExistingHomeField("remainingLoan", won)}
          />
          <MoneyInput
            id="capital-gains-tax"
            label="예상 양도세"
            value={state.existingHome.capitalGainsTax}
            onChange={(won) => setExistingHomeField("capitalGainsTax", won)}
            hint="비워 두면 계산에 반영되지 않고 경고가 표시됩니다."
          />
        </fieldset>
      )}

      <div className="field">
        <label htmlFor="first-time">
          <input
            id="first-time"
            type="checkbox"
            checked={state.isFirstTimeBuyer}
            onChange={(e) => setField("isFirstTimeBuyer", e.target.checked)}
          />
          생애최초 주택 구입
        </label>
      </div>

      <div className="field">
        <label htmlFor="area">전용면적 (㎡)</label>
        <input
          id="area"
          type="number"
          min={1}
          step={1}
          value={state.exclusiveAreaSqm}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) {
              setField("exclusiveAreaSqm", next);
            }
          }}
        />
      </div>
    </form>
  );
}
```

- [ ] **Step 4: `ErrorBoundary` 작성**

`src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  error: Error | null;
}

/**
 * 엔진 예외를 잡는다. 폼이 이미 막았어야 하므로 여기 도달하면 사실상 버그지만,
 * 재무 계산 화면이 백지가 되는 것이 최악이므로 잡아서 되돌릴 길을 준다.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("계산 중 예외", error, info);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <div className="error-fallback" role="alert">
        <h2>계산 중 문제가 발생했습니다</h2>
        <p>입력값을 초기화하고 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset();
          }}
        >
          입력 초기화
        </button>
      </div>
    );
  }
}
```

- [ ] **Step 5: `App` 조립**

`src/App.tsx` (전체 교체):

```tsx
import { BudgetResult } from "./components/BudgetResult";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PriceSlider } from "./components/PriceSlider";
import { ProfileForm } from "./components/ProfileForm";
import { SafetyBadge } from "./components/SafetyBadge";
import { useAffordability } from "./state/useAffordability";
import { useProfileForm } from "./state/useProfileForm";

export function App() {
  const { state, setField, setExistingHomeField, reset, profile } =
    useProfileForm();
  const affordability = useAffordability(profile);

  return (
    <main className="app">
      <h1>내 예산으로 살 수 있는 집</h1>
      <p className="subtitle">
        2026년 3월 규제 기준 · 수도권 · 입력한 재무정보는 이 브라우저를 벗어나지
        않습니다
      </p>

      <ErrorBoundary onReset={reset}>
        <ProfileForm
          state={state}
          setField={setField}
          setExistingHomeField={setExistingHomeField}
        />

        {affordability === null ? (
          <p className="prompt">
            현금과 연소득을 입력하면 살 수 있는 가격을 계산합니다.
          </p>
        ) : (
          <>
            <BudgetResult result={affordability.result} />
            {affordability.result.affordablePrice > 0 && (
              <>
                <PriceSlider
                  price={affordability.price}
                  max={affordability.result.affordablePrice}
                  onChange={affordability.setPrice}
                />
                <SafetyBadge safety={affordability.safety} />
              </>
            )}
          </>
        )}
      </ErrorBoundary>

      <footer className="disclaimer">
        추정치이며 실제 대출한도는 금융기관 심사 결과에 따릅니다.
        시세는 국토교통부 실거래가에 기반한 추정 범위입니다.
      </footer>
    </main>
  );
}
```

`src/App.test.tsx`의 기존 테스트는 그대로 통과한다(제목이 유지된다).

- [ ] **Step 6: 최소 스타일 작성**

`src/styles.css`:

```css
:root {
  --safe: #0a7d33;
  --caution: #b26a00;
  --danger: #c02626;
  --border: #d8d8d8;
  color-scheme: light;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif;
  line-height: 1.6;
}

.app {
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}

.subtitle,
.disclaimer {
  color: #666;
  font-size: 0.875rem;
}

.profile-form {
  display: grid;
  gap: 1rem;
  margin: 1.5rem 0;
}

.money-input label,
.field label {
  display: block;
  font-weight: 600;
}

.money-input input,
.field input[type="number"],
.field select {
  width: 100%;
  padding: 0.5rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.25rem;
}

.hint {
  color: #666;
  font-size: 0.8125rem;
  margin: 0.25rem 0 0;
}

.echo {
  font-weight: 600;
  margin: 0.25rem 0 0;
}

.error {
  color: var(--danger);
  margin: 0.25rem 0 0;
}

.affordable-price {
  font-size: 2rem;
  font-weight: 700;
  margin: 0.25rem 0;
}

.warning-list {
  background: #fff6e5;
  border-left: 4px solid var(--caution);
  padding: 0.75rem 1rem;
  list-style: none;
}

.safety-badge[data-level="safe"] .safety-level { color: var(--safe); }
.safety-badge[data-level="caution"] .safety-level { color: var(--caution); }
.safety-badge[data-level="danger"] .safety-level { color: var(--danger); }

.safety-level {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}

.price-slider input[type="range"] {
  width: 100%;
}

.slider-price {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0.25rem 0;
}

.slider-warning {
  color: var(--caution);
  font-size: 0.875rem;
}
```

`src/main.tsx`에 스타일 import를 추가한다 (`import { App } from "./App";` 아래):

```tsx
import "./styles.css";
```

- [ ] **Step 7: 테스트와 타입 검사 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — 앞선 태스크의 테스트가 모두 통과하고 이 태스크의 새 테스트 7개가 더해진다. 타입 오류 없음

- [ ] **Step 8: 빌드와 실제 동작 확인**

Run: `npm run build`
Expected: `dist/`에 정적 파일 생성, 오류 없음

Run: `npm run dev` 후 브라우저에서 현금 2억·연소득 1억을 입력해 결과와 슬라이더가 나오는지 눈으로 확인한다. 확인 후 서버를 종료한다.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat: 입력 폼과 페이지 조립, 통합 테스트와 네트워크 차단 검증 추가"
```

---

## 완료 기준

- [ ] `npm test`가 전부 통과한다
- [ ] `npm run typecheck`에 오류가 없다
- [ ] `npm run build`가 성공하고 `dist/`가 생성된다
- [ ] `src/lib/finance/`가 이 계획에서 한 줄도 바뀌지 않았다 (`git diff` 로 확인)
- [ ] 네트워크 없음 테스트가 통과한다
- [ ] `PolicyLoanList`가 `loan.maxAmount`를 금액으로 렌더링하지 않는다
- [ ] 금액 파서가 어떤 입력에도 `NaN`을 내보내지 않는다

## 다음 계획

- **Plan B — 데이터 파이프라인**: 국토부 실거래가 수집 → 단지 정규화 → 집계 → 정적 JSON
- **화면 3~5번**: 단지 목록, 단지 상세, 인쇄 리포트 (Plan B 완료 후)
- **데이터 숙제**: Plan C 스펙 10절 — `ltv.default` 미검증, 보금자리론 금리 플레이스홀더 의심, 중개보수 부가세 누락, 국민주택채권 할인액 미반영
