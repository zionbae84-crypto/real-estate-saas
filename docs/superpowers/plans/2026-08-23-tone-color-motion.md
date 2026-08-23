# 색·모션·말투 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 말투를 해요체로 통일하고(경고는 짧고 단호하게), 안전 등급을 SEED 의미별 색으로 구분하고, 상태 전환에만 모션을 넣는다.

**Architecture:** 말투부터 바꾼다 — 문구가 바뀌면 그 문구를 단언하는 테스트도 함께 바뀌므로, 색·모션보다 먼저 끝내야 나중에 두 번 손대지 않는다. 말투는 다시 섞이는 종류의 것이라 가드 테스트로 잠근다. 색은 직접 만든 hex 세 개를 SEED 의미별 토큰으로 바꾸고 그 축을 화면 전체로 넓힌다. 모션은 마지막에, 상태가 바뀌는 지점에만 넣는다.

**Tech Stack:** React 19 + Vite 7, TypeScript strict + `noUncheckedIndexedAccess`, Vitest 4 + jsdom + Testing Library, SEED Design (`@seed-design/react` 2.3.0 / `@seed-design/css` 2.5.0)

## Global Constraints

- **색은 장식이 아니라 의미의 반복이다.** 새로운 정보를 색으로만 말하지 않는다.
- **색만으로 의미를 전달하지 않는다.** 등급·경고는 항상 글자로도 말한다. 색 관련 속성을 지워도 등급을 읽을 수 있어야 한다.
- **hex를 새로 만들지 않는다.** SEED의 의미별 토큰(`positive`/`warning`/`critical`/`neutral`/`brand`)을 쓴다.
- **모션은 상태가 바뀔 때만.** 가만히 있는 것은 움직이지 않는다. 값은 SEED의 `--seed-duration-*`·`--seed-timing-function-*`를 쓰고 직접 정하지 않는다.
- **숫자에 카운트업을 넣지 않는다.** 읽을 수 있는 순간이 늦어진다.
- **`prefers-reduced-motion: reduce`를 존중한다.** 접근성 요구사항이지 선택이 아니다.
- **이모지를 쓰지 않는다.** 경고 옆 이모지가 경고를 장식으로 만든다.
- **숫자와 단위를 부드럽게 만들지 않는다.** "4억 7,610만원"은 그대로다. "약 4.8억쯤"으로 바꾸지 않는다.
- **도메인 용어를 지우지 않는다.** DSR·LTV는 괄호로 풀어 쓰되 지우지 않는다.
- **경고를 질문으로 바꾸지 않는다.** "혹시 무리는 아닐까요?"가 아니라 "이건 빌릴 수 있는 한계예요."
- **법적 면책 문구는 합니다체를 유지한다.** 친근할 자리가 아니다.
- **레이아웃을 바꾸지 않는다.** 정보 위계는 이미 정해졌다. 이번엔 색·모션·말투만이다.
- **다크 모드를 켜지 않는다.** `colorMode: "light-only"` 그대로다.
- **테스트 단언을 약화시키지 않는다.** 문구가 바뀌면 기대 문구도 바뀌지만, 검사하는 **대상과 강도**는 그대로다. 정확한 문자열을 느슨한 부분 일치로 바꾸지 않는다.
- 파일당 하나의 책임. **파일을 쪼개지 말고** 같은 파일 안에서 헬퍼를 추출한다.
- TypeScript strict + `noUncheckedIndexedAccess`. `any` 금지, 불필요한 non-null assertion 금지.
- **`src/no-network.test.ts`의 약속을 깨지 않는다** — `src/` 안에서 `fetch`·XHR·동적 `import(`·Node 내장 모듈 임포트 금지, **주석 포함**. 파일을 읽어야 하는 빌드 타임 검사는 `scripts/`에 둔다.
- **`seed-design/ui/*` 벤더 스니펫을 수정하지 않는다.**
- 커밋 메시지는 Conventional Commits, 제목은 한국어.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `scripts/tone-guard.test.ts` | 합니다체 잔존 검사 + 예외 목록 | 신규 |
| `src/components/*.tsx` | 화면 문구 | 해요체로 |
| `src/lib/finance/*.ts` | **엔진이 만드는 경고 문구** | 해요체로 (throw 메시지는 제외) |
| `src/components/*.test.tsx` | 기대 문구 | 함께 갱신 |
| `src/App.tsx` | 부제·면책 문구 | 해요체로(면책 제외) |
| `src/styles.css` | 색·모션 | hex → SEED 토큰, 전환 추가 |
| `src/components/SafetyBadge.tsx` | 등급 표시 | 색 없이도 읽히게 |

---

## Task 1: 말투를 해요체로 통일하고 가드로 잠근다

**Files:**
- Create: `scripts/tone-guard.test.ts`
- Modify: `src/components/AssumptionLine.tsx`, `BindingExplainer.tsx`, `BudgetResult.tsx`, `ErrorBoundary.tsx`, `MoneyInput.tsx`, `PolicyLoanList.tsx`, `ProfileForm.tsx`, `SafeLine.tsx`, `SafetyBadge.tsx`, `src/App.tsx`
- Modify: `src/lib/finance/` 안에서 **사용자에게 보이는 경고 문구**를 만드는 곳 (예: `available-cash.ts`의 warnings). `throw new Error(...)` 메시지는 대상이 아니다
- Modify: 위 컴포넌트의 대응 `*.test.tsx`와 `src/integration.test.tsx`

**Interfaces:**
- Produces: `scripts/tone-guard.test.ts`의 예외 목록 — Task 2·3은 문구를 건드리지 않으므로 소비하지 않는다

### 왜 가드를 함께 만드는가

말투 통일은 한 번 정리해도 다시 섞인다. 새 화면을 만들 때마다 합니다체가 하나씩 들어온다. 실제로 지금 상태가 그렇다 — 가정 문구(최근)는 해요체인데 결과·경고(이전)는 합니다체다.

가드가 없으면 이 작업은 일회성 정리로 끝난다.

- [ ] **Step 1: 가드 테스트를 만든다**

`scripts/tone-guard.test.ts`를 만든다. **`scripts/`에 두는 이유**는 파일을 읽어야 해서다 — `src/no-network.test.ts`가 `src/` 안의 Node 내장 모듈 임포트를 금지하고 자기 자신 하나만 면제하며, 면제가 늘어나지 않는지 검사하는 테스트를 따로 갖고 있다. 브랜드 토큰 가드(`scripts/seed-brand-tokens.test.ts`)와 같은 자리다.

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 화면 문구가 해요체로 통일돼 있는지 검사한다.
 *
 * 말투는 한 번 정리해도 다시 섞인다 — 새 화면을 만들 때마다 합니다체가
 * 하나씩 들어온다. 실제로 이 작업 직전 상태가 그랬다: 가정 문구는
 * 해요체인데 결과·경고는 합니다체였다.
 *
 * 주석은 검사하지 않는다. 이 저장소의 주석은 한다체("…계산한다")로 쓰지만
 * 설명 문장에 "…이어야 합니다" 같은 표현이 섞일 수 있고, 그건 사용자가
 * 보는 문구가 아니다.
 *
 * `throw new Error(...)` 메시지도 검사하지 않는다. 사용자에게 보이는 문구는
 * 렌더링되지 던져지지 않는다 — 룰셋 검증 실패 같은 개발자용 메시지는
 * 정확한 것이 친근한 것보다 중요하고, 톤을 맞출 대상이 아니다.
 *
 * 반대로 `src/lib/finance`가 만드는 **경고 문구**(WarningList가 화면에
 * 그리는 것)는 검사 대상이다. 만들어지는 곳이 엔진일 뿐 사용자가 읽는
 * 화면 문구다.
 */

/** 사용자에게 보이는 문구에서 금지하는 종결 */
const FORMAL_ENDINGS = /(합니다|습니다)/;

/**
 * 합니다체를 유지하는 문구.
 *
 * 각 항목에 **왜 예외인지** 적는다. 이유 없이 늘어나면 가드가 무력해진다.
 * 아래 "예외가 실제로 존재한다" 테스트가 죽은 예외도 함께 막는다.
 */
const EXCEPTIONS: ReadonlyArray<{ text: string; why: string }> = [
  {
    text: "추정치이며 실제 대출한도는 금융기관 심사 결과에 따릅니다",
    why: "법적 면책 문구. 친근할 자리가 아니다 — 톤을 낮추면 면책의 무게가 빠진다.",
  },
];

/** 검사 대상: src 아래 tsx/ts에서 테스트 파일을 뺀 것 */
function uiSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return uiSourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/** 주석을 걷어낸다 — 사용자가 보는 문구만 검사한다 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * `throw new Error(...)`가 있는 줄을 걷어낸다.
 *
 * 사용자에게 보이는 문구는 렌더링되지 던져지지 않는다. 던지는 메시지는
 * 룰셋 검증 실패 같은 개발자용이고, 거기서는 정확한 것이 친근한 것보다
 * 중요하다.
 *
 * 줄 단위로 지우므로 여러 줄에 걸친 throw는 첫 줄만 빠진다. 그 경우
 * 나머지 줄이 걸리면 EXCEPTIONS 대신 **throw를 한 줄로 모으는 쪽**을
 * 택한다 — 예외 목록은 화면 문구를 위한 것이지 형식 문제를 덮는 곳이 아니다.
 */
function stripThrows(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/throw\s+new\s+\w*Error/.test(line))
    .join("\n");
}

/** 예외 문구를 지운 뒤 남은 내용 */
function stripExceptions(source: string): string {
  return EXCEPTIONS.reduce((acc, e) => acc.split(e.text).join(""), source);
}

describe("말투 통일", () => {
  it("검사할 UI 소스 파일을 실제로 찾는다", () => {
    // 파일을 하나도 못 찾으면 아래 검사가 공허하게 통과한다.
    expect(uiSourceFiles("src").length).toBeGreaterThan(5);
  });

  it("화면 문구에 합니다체가 남아 있지 않다", () => {
    const offenders: string[] = [];

    for (const file of uiSourceFiles("src")) {
      const content = stripExceptions(stripThrows(stripComments(readFileSync(file, "utf8"))));
      for (const line of content.split("\n")) {
        if (FORMAL_ENDINGS.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }

    expect(
      offenders,
      "화면 문구는 해요체로 씁니다. 합니다체를 유지해야 하는 문장이라면 " +
        "scripts/tone-guard.test.ts의 EXCEPTIONS에 이유와 함께 추가하세요.",
    ).toEqual([]);
  });

  it("예외 목록의 문구가 실제 소스에 존재한다", () => {
    // 문구가 바뀌었는데 예외만 남으면 죽은 예외가 쌓인다.
    const all = uiSourceFiles("src")
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const stale = EXCEPTIONS.filter((e) => !all.includes(e.text)).map(
      (e) => e.text,
    );
    expect(stale).toEqual([]);
  });

  it("예외마다 이유가 적혀 있다", () => {
    const missing = EXCEPTIONS.filter((e) => e.why.trim().length < 10).map(
      (e) => e.text,
    );
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다 — 고쳐야 할 목록을 얻는다**

Run: `npx vitest run scripts/tone-guard.test.ts`
Expected: FAIL — "화면 문구에 합니다체가 남아 있지 않다"가 위반 목록을 파일:줄 형태로 출력한다.

**이 출력이 이 태스크의 작업 목록이다.** 어딘가에 적어 두고 하나씩 지워 간다.

- [ ] **Step 3: 척추 문장 넷을 먼저 바꾼다**

이 넷이 이 작업의 성패다. 나머지는 기계적이지만 이건 아니다.

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `BindingExplainer.tsx` | "상환 능력(DSR)에 걸렸습니다" | "소득이 한도를 정했어요" |
| `BudgetResult.tsx` 또는 `SafeLine.tsx` | "이것은 빌릴 수 있는 한계이지 무리하지 않는 선이 아닙니다" | "이건 빌릴 수 있는 한계예요. 무리 없는 선은 따로 있어요." |
| `BindingExplainer.tsx` | "대출로는 늘릴 수 없습니다 — 현금이 더 필요합니다" | "대출로는 못 늘려요. 현금이 더 있어야 해요." |
| `SafeLine.tsx` | "무리 없이 살 수 있는 가격대가 없습니다" | "지금 조건으론 무리 없는 가격대가 없어요." |

문장이 실제 파일에서 조금 다를 수 있다(조사·앞뒤 문맥). **의미와 단호함을 유지하는 선에서 맞추되, 위 표의 톤에서 벗어나지 않는다.**

- [ ] **Step 4: 나머지 문구를 바꾼다**

Step 2의 목록을 따라간다. 참고 변환:

| 지금 | 바꿀 것 |
|---|---|
| "숫자로 읽을 수 없습니다" | "숫자로 읽을 수 없어요" |
| "계산 중 문제가 발생했습니다" | "계산하다 문제가 생겼어요" |
| "…에 걸렸습니다" | "…이(가) 한도를 정했어요" |
| "…초과합니다" | "…넘어요" |
| "…늘어납니다" | "…늘어나요" |
| "단위 없이 쓰면 만원입니다" | "단위 없이 쓰면 만원이에요" |

**지키지 않을 것:** 숫자·단위 형식(`formatWon` 출력), 도메인 용어(DSR·LTV), 이모지 추가, 경고를 질문으로 바꾸기.

- [ ] **Step 5: 테스트의 기대 문구를 함께 바꾼다**

문구를 단언하는 테스트가 아래 파일들에 있다.

`AssumptionLine.test.tsx`, `BindingExplainer.test.tsx`, `BudgetResult.test.tsx`, `ErrorBoundary.test.tsx`, `MoneyInput.test.tsx`, `PolicyLoanList.test.tsx`, `SafeLine.test.tsx`, `SafetyBadge.test.tsx`, `WarningList.test.tsx`, `src/integration.test.tsx`

**기대 문구만 바꾼다. 검사 대상과 강도는 그대로다.**

- `getByText("정확한 문구")`를 `getByText(/일부/)`로 느슨하게 바꾸지 않는다
- 단언을 지우지 않는다
- `toBeInTheDocument()`를 `queryByText`로 바꿔 존재 검사를 없애지 않는다

문구가 바뀌면서 **의미가 달라진 단언이 있으면** 조용히 맞추지 말고 보고한다.

- [ ] **Step 6: 가드와 전체 스위트를 돌린다**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS

- [ ] **Step 7: 가드가 실제로 잡는지 확인한다**

컴포넌트 하나의 문구를 일부러 합니다체로 되돌린다(예: `SafeLine.tsx`의 한 문장). 

Run: `npx vitest run scripts/tone-guard.test.ts`
Expected: FAIL — 그 파일과 줄이 목록에 나온다

원상복구하고 다시 통과를 확인한다. **이 확인 결과를 보고서에 쓴다** — 통과만 하는 가드는 아무것도 지키지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add scripts/tone-guard.test.ts src/components/ src/App.tsx src/integration.test.tsx
git commit -m "feat: 화면 말투를 해요체로 통일하고 가드로 잠근다

가정 문구는 해요체인데 결과·경고는 합니다체라 한 화면에서 두 목소리가
났다. 해요체로 맞추되 경고는 짧게 끊고 에둘러 말하지 않는다 — 친근한
것과 무른 것은 다르고, 이 제품의 일부 문장은 사용자를 멈춰 세우는 것이
일이다.

말투는 한 번 정리해도 다시 섞이므로 가드 테스트를 함께 뒀다. 법적 면책
문구만 예외로 두고 이유를 적었다."
```

---

## Task 2: 안전 등급 색을 SEED 의미별 토큰으로 바꾸고 넓힌다

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/SafetyBadge.tsx` (색 없이도 읽히게)
- Test: `src/components/SafetyBadge.test.tsx`

**Interfaces:**
- Consumes: 없음 (Task 1과 독립적이나, 문구가 먼저 확정돼야 테스트를 두 번 안 고친다)

### 지금 상태

`src/styles.css:1-7`이 직접 만든 hex를 쓴다.

```css
:root {
  --safe: #0a7d33;
  --caution: #b26a00;
  --danger: #c02626;
  --border: #d8d8d8;
  color-scheme: light;
}
```

SEED가 같은 의미의 토큰을 이미 싣고 있고, 그쪽은 명도 단계와 모드별 값이 검증돼 있다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 색 없이도 등급을 읽을 수 있다**

`src/components/SafetyBadge.test.tsx`에 추가한다.

```tsx
it("색을 지워도 등급을 글자로 읽을 수 있다", () => {
  // 색만으로 의미를 전달하면, 색이 안 보이는 환경(고대비 모드, 흑백 인쇄,
  // 색각 이상)에서 경고가 사라진다. 이 제품은 경고를 놓치면 안 된다.
  render(<SafetyBadge safety={dangerScore()} />);
  expect(screen.getByText("위험")).toBeInTheDocument();
});

it("등급을 data 속성으로도 노출해 CSS가 색을 입힐 수 있다", () => {
  const { container } = render(<SafetyBadge safety={dangerScore()} />);
  expect(container.querySelector('[data-level="danger"]')).not.toBeNull();
});
```

`dangerScore()`는 이 파일이 이미 쓰는 픽스처 헬퍼 방식을 따른다. 없으면 만든다 — `SafetyScore` 타입의 `level: "danger"`인 값이면 된다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/SafetyBadge.test.tsx`
Expected: **이미 통과한다** — `data-level`과 텍스트 라벨이 지금도 있기 때문이다.

이 둘은 새 동작을 검증하는 테스트가 아니라 **회귀 잠금**이다. Step 4에서 색을 화면 전체로 넓히면서 "등급을 색으로만 말하게 되는" 실수가 나기 쉽고, 이 제품은 경고를 놓치면 안 된다.

**그 사실을 테스트 주석에 명시한다** — 변경 전후 둘 다 통과한다는 것, 그리고 왜 그래도 두는지를. 나중에 읽는 사람이 "이건 아무것도 안 잡는데"라고 지우지 않도록.

```tsx
// 이 두 테스트는 이 커밋 전에도 통과한다. 새 동작을 검증하는 게 아니라
// 회귀를 잠그는 것이다 — 색을 화면 전체로 넓히다 보면 등급을 색으로만
// 말하게 되기 쉽고, 색이 안 보이는 환경에서 경고가 사라지면 그건 이
// 제품이 피하려는 실패 그 자체다. 지우지 말 것.
```

- [ ] **Step 3: hex를 SEED 의미별 토큰으로 바꾼다**

`src/styles.css`의 `:root` 블록을 바꾼다.

```css
:root {
  /*
   * 의미별 색은 SEED 토큰을 가리킨다. hex를 직접 쓰지 않는 이유는
   * src/seed-brand.css와 같다 — 명도 단계와 모드별 값이 이미 검증돼 있고,
   * 우리가 색을 두 벌 관리하지 않아도 된다.
   *
   * 이름은 이 저장소에서 쓰던 것을 유지한다. 소비처가 여럿이라
   * 이름까지 바꾸면 이번 변경의 범위가 불필요하게 넓어진다.
   */
  --safe: var(--seed-color-fg-positive);
  --caution: var(--seed-color-fg-warning);
  --danger: var(--seed-color-fg-critical);
  --border: var(--seed-color-stroke-neutral-weak);
  color-scheme: light;
}
```

**토큰 이름이 실제로 존재하는지 확인한다.** 아래로 목록을 뽑아 대조한다.

```bash
grep -ohE "\-\-seed-color-(fg|stroke)-(positive|warning|critical|neutral)[a-z-]*" node_modules/@seed-design/css/base.css | sort -u
```

없는 이름을 쓰면 CSS 변수는 조용히 빈 값이 되고 **색이 사라진다.** 위 명령의 출력에 있는 이름만 쓴다.

- [ ] **Step 4: 색을 넓힌다**

지금 색이 안 쓰이는 곳에 의미를 입힌다. **레이아웃은 바꾸지 않는다.**

- 안전선(`.safe-line` 또는 `SafeLine`이 쓰는 클래스) → `positive` 계열 배경/글자
- 경고 목록(`WarningList`) → `critical` 계열
- 가정 문구 중 **기존 부채 항목만** → `warning` 계열. 나머지 둘(규제지역·전용면적)은 중립이다 — 고치면 숫자가 올라가는 항목과 내려가는 항목을 색으로 가른다
- 최대 가격 → `brand` 계열

각 조합마다 **전경/배경 대비를 확인한다.** SEED의 `-weak` 배경 위에 같은 계열 `fg`를 얹는 조합이 대개 안전하다.

확인 방법: Step 5에서 브라우저를 띄운 뒤 개발자 도구 콘솔에서 실제 계산된 색을 읽어 대비를 구한다.

```js
// 요소 하나의 전경/배경 대비를 구한다
function contrast(el) {
  const toLin = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055) ** 2.4; };
  const lum = (rgb) => { const [r,g,b] = rgb.match(/\d+/g).map(Number).map(toLin);
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const cs = getComputedStyle(el);
  let bgEl = el, bg = cs.backgroundColor;
  while (bg === "rgba(0, 0, 0, 0)" && bgEl.parentElement) { bgEl = bgEl.parentElement; bg = getComputedStyle(bgEl).backgroundColor; }
  const [a, b] = [lum(cs.color), lum(bg)].sort((x, y) => y - x);
  return ((a + 0.05) / (b + 0.05)).toFixed(2);
}
```

본문 크기 글자는 **4.5:1**, 큰 글자(18.66px 볼드 또는 24px 이상)는 **3:1**이 기준이다. 부족한 조합이 있으면 **더 진한 단계로 바꾸거나, 못 바꾸면 그 조합과 실측값을 보고서에 기록한다.** 조용히 넘어가지 않는다.

등급 세 가지가 실제로 서로 다른 색으로 보이는지도 여기서 확인한다 — jsdom은 외부 스타일시트의 CSS 변수를 계산하지 않으므로 단위 테스트로는 잡히지 않는다.

- [ ] **Step 5: 브라우저에서 확인한다**

Run: `npm run dev`

확인할 것:
- 안전 등급 세 가지가 각각 다른 색으로 보인다
- 안전선이 초록 계열, 경고가 빨강 계열
- 가정 문구 중 기존 부채만 노랑 계열
- 개발자 도구에서 `--safe`가 빈 문자열이 아니다

확인 후 서버를 끈다. **브라우저를 못 쓰면 못 했다고 보고서에 쓴다.**

- [ ] **Step 6: 금액 형식이 안 바뀌었는지 확인한다**

Run: `git diff --stat main -- src/format/`
Expected: 비어 있음 — 이번 작업은 말투·색·모션이지 숫자 형식이 아니다.

`src/format/won.ts`가 바뀌었다면 되돌린다. "4억 7,610만원"을 "약 4.8억"으로 부드럽게 만드는 것은 이 계획이 금지한 것이다.

- [ ] **Step 7: 전체 스위트·타입체크·빌드**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/styles.css src/components/SafetyBadge.tsx src/components/SafetyBadge.test.tsx
git commit -m "feat: 의미별 색을 SEED 토큰으로 바꾸고 화면 전체로 넓힌다

직접 만든 hex 세 개를 SEED의 positive/warning/critical 토큰으로 바꿨다.
명도 단계와 모드별 값이 이미 검증돼 있어 우리가 색을 두 벌 관리하지
않아도 된다.

색은 장식이 아니라 의미의 반복이므로 색만으로 말하지 않는다 — 등급은
항상 글자로도 표시하고, 색이 안 보이는 환경에서도 읽히는지 테스트로
잠갔다."
```

---

## Task 3: 상태 전환에 모션을 넣는다

**Files:**
- Modify: `src/styles.css`
- Test: `scripts/motion-guard.test.ts` (신규)

**Interfaces:**
- Consumes: Task 2의 색 토큰(색 전환에 쓴다)

### 지금 상태

`src/styles.css`에 `transition`·`animation`·`@keyframes`·`prefers-reduced-motion`이 **하나도 없다**(0개). 값이 바뀌면 화면이 끊기듯 갈린다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 — reduced-motion 존중**

`scripts/motion-guard.test.ts`를 만든다. `src/`가 아니라 `scripts/`인 이유는 파일을 읽어야 하기 때문이다(Task 1의 톤 가드와 같은 자리).

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 모션이 접근성 요구사항을 지키는지 검사한다.
 *
 * prefers-reduced-motion은 취향이 아니다. 전정기관 장애가 있는 사용자에게
 * 모션은 불편이 아니라 증상을 유발한다. 전환을 추가하면서 이 블록을 빠뜨리기
 * 쉬우므로 파일 단위로 잠근다.
 */

const CSS = readFileSync("src/styles.css", "utf8");

/** 주석을 걷어낸 선언부 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("모션", () => {
  it("전환을 실제로 쓰고 있다", () => {
    // 아래 검사들이 공허하게 통과하지 않도록 전제를 고정한다.
    expect(DECLARATIONS).toMatch(/transition/);
  });

  it("prefers-reduced-motion 블록이 있다", () => {
    expect(DECLARATIONS).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
  });

  it("전환 시간을 직접 쓰지 않고 SEED 토큰을 쓴다", () => {
    // "0.3s" 같은 리터럴이 있으면 SEED의 모션 체계 밖으로 나간 것이다.
    const literals = DECLARATIONS.match(/transition[^;}]*?\b\d+(\.\d+)?m?s\b/g) ?? [];
    expect(literals).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run scripts/motion-guard.test.ts`
Expected: FAIL — "전환을 실제로 쓰고 있다"부터 실패한다(`transition`이 하나도 없다)

- [ ] **Step 3: 전환을 넣는다**

`src/styles.css`에 추가한다. **상태가 바뀌는 지점에만** 넣는다.

```css
/*
 * 모션은 상태가 바뀔 때만 쓴다. 가만히 있는 것은 움직이지 않는다.
 *
 * 값은 SEED 토큰을 쓴다 — 직접 정하면 이 저장소만의 감각이 되고,
 * SEED 컴포넌트의 전환과 어긋난다.
 *
 * 금액에는 카운트업을 넣지 않는다. 숫자가 굴러 올라가면 게임처럼 보이고,
 * 무엇보다 읽을 수 있는 순간이 늦어진다. 사용자가 기다려야 하는 숫자가
 * 아니다.
 */
.safety-level,
.safe-line,
.assumption-item {
  transition:
    color var(--seed-duration-color-transition) var(--seed-timing-function-easing),
    background-color var(--seed-duration-color-transition) var(--seed-timing-function-easing);
}

details > summary {
  transition: color var(--seed-duration-color-transition) var(--seed-timing-function-easing);
}

/*
 * prefers-reduced-motion은 취향이 아니라 접근성 요구사항이다. 전정기관
 * 장애가 있는 사용자에게 모션은 불편이 아니라 증상을 유발한다.
 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

**셀렉터가 실제로 존재하는지 확인한다.** `src/styles.css`와 컴포넌트를 읽어 클래스 이름을 대조한다 — 없는 셀렉터에 전환을 걸면 아무 일도 안 일어나고, 테스트는 통과한다.

**토큰 이름도 확인한다:**

```bash
grep -ohE "\-\-seed-(duration|timing-function)[a-z-]*" node_modules/@seed-design/css/base.css | sort -u
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run scripts/motion-guard.test.ts`
Expected: PASS

- [ ] **Step 5: 브라우저에서 확인한다**

Run: `npm run dev`

확인할 것:
- 입력을 바꿔 등급이 바뀔 때 색이 부드럽게 넘어간다
- **금액은 즉시 바뀐다**(굴러 올라가지 않는다)
- 접기/열기가 갑자기 튀지 않는다
- 개발자 도구에서 reduced-motion을 켜면(Rendering 패널) 전환이 사라진다

확인 후 서버를 끈다. **브라우저를 못 쓰면 못 했다고 보고서에 쓴다.**

- [ ] **Step 6: 전체 스위트·타입체크·빌드**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/styles.css scripts/motion-guard.test.ts
git commit -m "feat: 상태 전환에 모션을 넣고 reduced-motion을 존중한다

값이 바뀌어도 화면이 끊기듯 갈리던 것을 고쳤다. 모션은 상태가 바뀔
때만 쓰고 값은 SEED 토큰을 쓴다.

금액에는 카운트업을 넣지 않았다 — 숫자가 굴러 올라가면 읽을 수 있는
순간이 늦어지고, 사용자가 기다려야 하는 숫자가 아니다.

prefers-reduced-motion은 취향이 아니라 접근성 요구사항이라 가드
테스트로 함께 잠갔다."
```

---

## 완료 확인

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

- 전체 스위트 통과, 타입체크 클린, 빌드 성공
- 화면 전체가 해요체(예외 목록 제외)
- 척추 문장 넷이 "따뜻하되 단호한" 형태
- 말투 가드가 있고, 합니다체를 되돌리면 실패한다
- 안전 등급이 의미 색으로 구분되고 색 없이도 읽힌다
- 모션이 상태 전환에만 있고 `prefers-reduced-motion`을 존중한다
- 새로 색을 입힌 조합의 대비를 확인했고, 부족한 곳은 기록됐다
