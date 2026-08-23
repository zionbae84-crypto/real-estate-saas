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
 *
 * 리뷰 수정(가드 사각지대 Important 2): `/니다/`는 합쇼체 **평서형**만
 * 잡고 의문형·명령형을 통째로 놓쳤다 — "초기화하시겠습니까?"(합쇼체
 * 의문형), "입력하십시오"(하십시오체), "멈추시오"(하오체 명령형)가 전부
 * 가드를 그냥 통과했다. 이 앱엔 이미 파괴적 동작(ErrorBoundary의 "입력
 * 초기화")이 있어, 누군가 확인 대화상자를 넣는 순간 합쇼체가 조용히
 * 되돌아올 수 있는 자리다. 그래서 세 패턴을 더한다.
 *
 * - `니까`: 합쇼체 의문형("…습니까?"/"…ㅂ니까?", "니다"의 의문형 짝)
 * - `시오`: 하오체·하십시오체 명령형("…시오"/"…십시오"). "십시오"는
 *   "시오"의 상위 문자열이라("십시오"="십"+"시오") 이 하나로 함께 잡힌다.
 *
 * 넓힌 뒤 이 저장소의 전체 UI 소스에 직접 돌려 오탐이 없음을 확인했다
 * (아래 "화면 문구에 합니다체가 남아 있지 않다" 테스트가 그 확인이다 —
 * 이 테스트가 그대로 통과한다는 것 자체가 실제 소스에 "니까"·"시오"가
 * 합쇼체 종결이 아닌 자리에서 등장하지 않는다는 증거다).
 *
 * **알려진 공백(의도적 제외): 한다체("…한다")는 잡지 않는다.** 이
 * 저장소의 주석 문체가 한다체라 화면 문구와 구분할 방법이 이 정규식
 * 수준에서는 없다(주석은 stripComments가 먼저 걷어내지만, 화면 문구
 * 자체가 한다체로 새로 들어오는 경우까지 막지는 못한다). 지금 이
 * 저장소의 UI 문구 중 한다체인 것은 없음을 확인했지만, 앞으로 누군가
 * "…한다"로 끝나는 문구를 화면에 넣으면 이 가드는 그것을 잡지 못한다.
 */
const FORMAL_ENDINGS = /니다|니까|시오/;

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
      "안 되는 사실 고지)이라 톤을 맞춘다. " +
      "리뷰 수정(Minor 6): 지금 화면(예산계산기)은 시세 데이터를 직접 " +
      "보여주지 않는다 — `grep \"시세\" src/`는 이 줄만 걸린다. 하지만 " +
      "scripts/pipeline(2026-08-22 데이터파이프라인 스펙)이 국토교통부 " +
      "실거래가 API를 이미 수집·집계해 정적 JSON으로 내보내고 있고, 이 " +
      "산출물을 쓸 지역·단지 화면은 색·모션·말투 스펙 §7에서 \"화면 " +
      "3~5(지역·단지) — 별도 스펙\"으로 명시적으로 뒤로 미뤄져 있을 뿐 " +
      "이미 계획된 다음 작업이다. 이 문구는 그 화면이 붙기 전에 미리 걸어 " +
      "둔 선반영이므로 화면과 문구를 함께 지우지 않는다.",
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
    //
    // 리뷰 수정(Minor 2): stripComments를 거치지 않은 원문 전체에서
    // 검사하면, 화면 문구가 실제로는 지워지고 주석(예: "왜 예전에 이
    // 문구가 있었는지")에만 그 텍스트가 남아 있어도 "존재한다"고
    // 오판한다. 예외 목록은 **화면에 보이는** 문구를 위한 것이므로,
    // 위쪽 "합니다체가 남아 있지 않다" 검사와 같은 stripComments를
    // 거친 내용에서 존재를 확인한다.
    const all = uiSourceFiles("src")
      .map((f) => stripComments(readFileSync(f, "utf8")))
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

  /**
   * 리뷰 수정(가드 사각지대 Important 2): `/니다/`는 합쇼체 평서형만 잡고
   * 의문형("…습니까?")과 명령형("…십시오"/"…시오")을 놓친다. 이 앱에는
   * 이미 파괴적 동작(ErrorBoundary의 "입력 초기화")이 있어 누군가
   * "초기화하시겠습니까?" 같은 확인 대화상자를 넣는 날 합쇼체가 그대로
   * 돌아올 수 있는데, 옛 정규식은 이를 놓친다.
   *
   * 한다체("…한다")는 이 저장소 주석의 문체이므로 의도적으로 잡지
   * 않는다 — 아래 별도 테스트가 그 공백을 알려진 것으로 명시한다.
   */
  it("합쇼체 의문형·명령형도 잡는다(가드 사각지대)", () => {
    const candidates = [
      "입력을 초기화하시겠습니까?", // 합쇼체 의문형
      "금액을 정확히 입력하십시오.", // 하십시오체
      "여기서 멈추시오.", // 하오체 명령형
    ];
    for (const candidate of candidates) {
      expect(FORMAL_ENDINGS.test(candidate), candidate).toBe(true);
    }
  });

  it("한다체는 의도적으로 잡지 않는다(알려진 공백)", () => {
    expect(FORMAL_ENDINGS.test("이 값은 추정치를 사용한다.")).toBe(false);
  });
});
