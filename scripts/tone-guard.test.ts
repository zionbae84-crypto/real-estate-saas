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

/**
 * 사용자에게 보이는 문구에서 금지하는 종결.
 *
 * 리뷰 수정(가드 사각지대): 예전 `/(합니다|습니다)/`는 자음 어간(없습니다·
 * 걸렸습니다)만 잡고 모음 어간의 "-ㅂ니다" 계열(입니다·됩니다·봅니다·
 * 줍니다·갑니다·큽니다·미칩니다…)을 전부 놓쳤다. 한국어 합쇼체 종결은
 * 모두 "니다"로 끝나고("합니다"="합"+"니다", "습니다"="습"+"니다"), 이
 * "니다" 자체가 이미 두 패턴의 상위집합이므로 여기 하나로 좁혀도 커버리지가
 * 줄지 않는다. 이 저장소의 소스에서 "니다"가 등장하는 곳은 (a) 합쇼체
 * 종결, (b) throw 메시지, (c) 주석뿐임을 직접 grep으로 확인했다 — throw와
 * 주석은 이 정규식이 보기 전에 stripThrows/stripComments가 이미 걷어낸다.
 */
const FORMAL_ENDINGS = /니다/;

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
  {
    text: "시세는 국토교통부 실거래가에 기반한 추정 범위입니다",
    why: "같은 <footer className=\"disclaimer\"> 안에서 바로 앞 문장과 이어지는 " +
      "면책 고지의 두 번째 문장이다. 시세가 확정값이 아니라 실거래가 기반 " +
      "추정 범위임을 못박는 것으로, 대출한도 면책과 같은 성격(무게를 낮추면 " +
      "안 되는 사실 고지)이라 톤을 맞춘다.",
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

/**
 * 주석을 걷어낸다 — 사용자가 보는 문구만 검사한다.
 *
 * 한계: 문자열 리터럴 안의 `//`도 주석으로 오인해 그 뒤 내용을 함께
 * 지운다(정규식 기반 파서라 문자열/주석 문맥을 구분하지 못한다). 예를 들어
 * `"경로: src//foo"` 같은 문자열이 있으면 `"경로: src` 뒤가 통째로
 * 잘린다. 지금 이 저장소의 UI 소스에는 그런 문자열이 없어 실질적인
 * 오탐은 없지만, 앞으로 URL이나 경로 문자열에 `//`가 들어가면 그 뒤의
 * 합니다체가 검사망을 빠져나갈 수 있다.
 */
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
 * (리뷰 수정에서 실제로 이 경로를 탔다 — src/format/won.ts,
 * src/format/ruleVersionLabel.ts, src/lib/finance/profile.ts,
 * src/lib/finance/rules.ts의 여러 줄 throw를 한 줄로 모아 해결했다.)
 *
 * 한계: 이 필터는 "throw new ...Error("를 포함한 줄 전체"를 지운다. 만약
 * 언젠가 같은 줄에 `throw new Error(msg); doSomethingUserFacing("...")`처럼
 * 사용자 문구가 함께 있으면 그 문구도 함께 사라져 검사망을 빠져나간다.
 * 지금 이 저장소에는 그런 줄이 없다 — throw 문은 항상 자기 줄을 독점한다.
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
