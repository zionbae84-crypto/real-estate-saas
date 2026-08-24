import { describe, expect, it } from "vitest";
import rawDeungiRules from "../../../rules/deungi-2026-08.json";
import rawRightsRules from "../../../rules/rights-2026-08.json";
import { assessRights, parseRightsRules } from "../rights";
import { crossCheck } from "./crosscheck";
import geometry from "./fixtures/real-layout-2026-08.json";
import { readDeungi } from "./parse";
import { parseDeungiRules } from "./rules";
import type { DeungiPageGeometry } from "./types";

/**
 * 실제 인터넷등기소 PDF의 **레이아웃**으로 파서를 잠근다.
 *
 * ## 왜 합성 픽스처만으로는 모자랐나
 *
 * 합성 등기부는 3,116개 테스트를 통과하면서도 실제 문서에서 채권최고액
 * 합계를 내지 못했다. 합성이 실제와 달랐던 자리는 넷이다.
 *
 * 1. **등기목적이 칸 안에서 줄바꿈된다.** 실제 을구 3번은
 *    `2번근저당권설정등` / `기말소`로 낱말 한가운데서 갈라져 있다. 첫 줄만
 *    읽으면 말소기록이 살아 있는 근저당으로 보인다. 합성은 등기목적을 늘
 *    한 줄짜리 낱말 하나로 썼다.
 * 2. **한 순위번호에 등기목적이 둘 있다.** 실제 갑구 7번은 `소유권이전`과
 *    `1번신탁등기말소`가 한 칸에 위아래로 놓인다. 그냥 이어 붙이면
 *    소유권이전이 말소기록이 된다.
 * 3. **말소선이 항목 일부에만 그어진다.** 부기등기로 전세금이 바뀌면 옛
 *    금액 한 칸에만 줄이 간다. 합성은 항목을 통째로 긋거나 하나도 긋지
 *    않았고, 그래서 "일부만 그어짐 = 애매함"이라는 판정이 실제 문서에서
 *    거의 모든 항목을 모름으로 만든다는 사실이 드러나지 않았다.
 * 4. **부기등기(`1-2`·`1-4`)와 줄바꿈된 이름.** 합성에는 부기등기가 없고
 *    소유자 이름도 한 줄에 들어갔다. 실제로는 금액 없는 부기등기 세 줄이
 *    "금액을 못 읽은 전세권" 셋이 됐고, 법인 이름 하나가 소유자 둘로
 *    읽혀 단독소유 법인이 공유로 나왔다.
 *
 * ## 이 픽스처가 무엇인가
 *
 * 실제 PDF에서 `readPdfGeometry`로 뽑은 좌표·선·글자 높이를 **그대로**
 * 두고, 글자 안의 개인정보만 바꾼 것이다. 사람 이름·법인명·주소·등록번호·
 * 고유번호는 가짜로 바뀌었고 **금액·날짜·순위번호·등기목적은 원본 그대로**
 * 다. PDF 원본은 저장소에 없다.
 *
 * 아래 값들은 원본 문서를 사람이 직접 읽어 확인한 것과 같다 — 살아 있는
 * 근저당 2건 23.2억, 말소된 근저당 18억 제외, 압류 9건, 가압류 3건.
 */

const rules = parseDeungiRules(rawDeungiRules);
const rightsRules = parseRightsRules(rawRightsRules);
const pages: readonly DeungiPageGeometry[] = geometry;
const reading = readDeungi(rules, pages);

/** 말소된 근저당까지 세면 나오는 값. 이 수가 나오면 말소선을 놓친 것이다 */
const 말소선을_놓친_합계 = 4_120_000_000;

describe("실제 등기부 레이아웃", () => {
  it("글자를 읽어 낸다 — 지오메트리가 그대로면 본문도 그대로다", () => {
    expect(pages).toHaveLength(11);
    expect(pages.reduce((sum, page) => sum + page.pieces.length, 0)).toBe(1687);
    expect(reading.problems).toEqual([]);
    expect(reading.crossCheck).toBe("agreed");
  });

  describe("채권최고액", () => {
    it("살아 있는 근저당 2건만 더해 23.2억이 된다", () => {
      expect(reading.totals.mortgage.count).toBe(2);
      expect(reading.totals.mortgage.won).toBe(1_920_000_000 + 400_000_000);
      expect(reading.totals.mortgage.won).toBe(2_320_000_000);
      expect(reading.totals.mortgage.won).not.toBe(말소선을_놓친_합계);
      expect(reading.answers.mortgage?.optionId).toBe("known");
      expect(reading.answers.mortgage?.amountWon).toBe(2_320_000_000);
    });

    it("말소된 근저당 18억은 합계에서 빠지고 목록에는 남는다", () => {
      const struck = reading.entries.filter((entry) => entry.struck);
      expect(struck.map((entry) => `${entry.section}#${entry.rank}`)).toEqual([
        "갑구#11",
        "을구#2",
      ]);
      expect(struck.find((entry) => entry.rank === "2")?.amountWon).toBe(1_800_000_000);
      expect(reading.liveEntries.some((entry) => entry.amountWon === 1_800_000_000)).toBe(false);
    });

    it("말소기록(`2번근저당권설정등기말소`)을 근저당으로 세지 않는다", () => {
      // 칸 안에서 `2번근저당권설정등` / `기말소`로 갈라져 있다. 첫 줄만
      // 읽으면 금액 없는 근저당이 하나 더 생겨 합계가 통째로 모름이 된다.
      const 말소기록 = reading.entries.find(
        (entry) => entry.section === "을구" && entry.rank === "3",
      );
      expect(말소기록?.kind).toBe("기타");
      expect(말소기록?.purpose).toContain("말소");
    });
  });

  describe("전세권", () => {
    it("줄 그어진 전세금 1,000만원 대신 부기등기의 2,000만원을 쓴다", () => {
      expect(reading.totals.lease.count).toBe(1);
      expect(reading.totals.lease.won).toBe(20_000_000);
      expect(reading.totals.lease.won).not.toBe(10_000_000);
      expect(reading.totals.lease.won).not.toBe(30_000_000);
    });

    it("줄 그어진 금액은 본문에서도 요약에서도 읽지 않는다", () => {
      // 1번 항목의 전세금 1,000만원에는 줄이 그어져 있다. 그것을 금액으로
      // 읽으면 이미 바뀐 값이 살아 있는 값 행세를 한다.
      const 본문 = reading.entries.find(
        (entry) => entry.section === "을구" && entry.rank === "1",
      );
      const 요약 = reading.summaryRows.find(
        (row) => row.section === "을구" && row.rank === "1",
      );

      expect(본문?.text).toContain("금10,000,000원");
      expect(본문?.amountWon).toBeNull();
      expect(요약?.text).toContain("금10,000,000원");
      expect(요약?.amountWon).toBeNull();
    });

    it("부기등기로 바뀐 금액이 요약과 어긋나면 대조가 걸린다", () => {
      // 본문과 요약은 둘 다 1번(옛 금액)과 1-4번(새 금액)을 따로 적는다.
      // 두 줄을 한 권리로 묶어 **바뀐 금액끼리** 견주지 않으면, 양쪽이
      // 나란히 "모름"이 되어 어긋남이 조용히 지나간다.
      const 어긋난_요약 = reading.summaryRows.map((row) =>
        row.section === "을구" && row.rank === "1-4"
          ? { ...row, amountWon: 30_000_000 }
          : row,
      );

      expect(crossCheck(reading.liveEntries, reading.summaryRows).agreed).toBe(true);
      expect(crossCheck(reading.liveEntries, 어긋난_요약).agreed).toBe(false);
    });

    it("금액 칸에만 줄이 그어진 항목은 말소도 애매함도 아니다", () => {
      // 이것을 "애매함"으로 읽으면 문서 전체가 모름이 되고, 채권최고액
      // 합계까지 함께 사라진다.
      const 전세권 = reading.entries.find(
        (entry) => entry.section === "을구" && entry.rank === "1",
      );
      expect(전세권?.kind).toBe("전세권");
      expect(전세권?.struck).toBe(false);
      expect(전세권?.strikeAmbiguous).toBe(false);
      expect(reading.entries.some((entry) => entry.strikeAmbiguous)).toBe(false);
    });
  });

  describe("갑구", () => {
    it("살아 있는 압류 9건과 가압류 3건을 센다", () => {
      const 압류 = reading.liveEntries.filter((entry) => entry.kind === "압류");
      const 가압류 = reading.liveEntries.filter((entry) => entry.kind === "가압류");

      expect(압류.map((entry) => entry.rank)).toEqual([
        "12",
        "14",
        "15",
        "17",
        "20",
        "21",
        "22",
        "23",
        "24",
      ]);
      expect(가압류.map((entry) => entry.rank)).toEqual(["16", "18", "19"]);
      // 말소된 11번 압류는 여기 없다.
      expect(압류.some((entry) => entry.rank === "11")).toBe(false);
      expect(reading.answers.seizure?.optionId).toBe("present");
    });

    it("가압류의 청구금액이 본문에 그대로 남아 사람이 대조할 수 있다", () => {
      const 청구금액 = reading.liveEntries
        .filter((entry) => entry.kind === "가압류")
        .map((entry) => /청구금액\s*금([\d,]+)/u.exec(entry.text)?.[1] ?? null);

      expect(청구금액).toEqual(["67,124,038", "28,967,180", "39,035,205"]);
    });

    it("쪽마다 되풀이되는 부동산 표시 줄이 항목 안으로 들어오지 않는다", () => {
      // 쪽이 넘어가는 자리마다 `[집합건물] …` 줄이 항목 사이에 끼어 있다.
      // 그것을 항목의 일부로 읽으면 사람이 대조할 원문이 흐려지고, 주소의
      // 숫자가 그 항목의 값으로 읽힐 자리가 생긴다.
      expect(reading.entries.some((entry) => entry.text.includes("[집합건물]"))).toBe(false);
    });

    it("줄바꿈된 법인 이름을 하나로 붙여 단독소유로 읽는다", () => {
      // 이름 칸이 좁아 법인 하나가 두 줄로 갈린다. 줄마다 세면 단독소유
      // 법인이 공유자 둘이 된다.
      expect(reading.owners).toHaveLength(1);
      expect(reading.owners[0]?.name).toBe("주식회사다라마바사");
      expect(reading.owners[0]?.share).toBe("단독소유");
      expect(reading.owners[0]?.rank).toBe("10");
      expect(reading.answers.coOwnership?.optionId).toBe("single");
    });
  });

  describe("머리말", () => {
    it("열람용·열람일시·집합건물·말소사항 포함을 읽는다", () => {
      expect(reading.header.propertyKind).toBe("집합건물");
      expect(reading.header.withCancelled).toBe(true);
      expect(reading.header.purpose).toBe("read");
      expect(reading.header.issuedAt).toBe("2026년08월20일 13시36분53초");
      expect(reading.header.issuedAtIso).toBe("2026-08-20T13:36:53");
    });

    it("소재지번·건물명·호를 조각낸다", () => {
      // 값은 익명화된 것이고, 여기서 잠그는 것은 **조각내기**다.
      expect(reading.header.address?.lot).toBe("다라도 마바시 가나동 111-222외 2필지");
      expect(reading.header.address?.buildingName).toBe("가나다라타워");
      expect(reading.header.address?.ho).toBe("제605호");
    });
  });

  it("이 등기부는 문진 엔진에서 '사면 안 돼요'가 된다", () => {
    // 압류 9건·가압류 3건만으로 이미 막아야 하는 물건이다. 매매가는
    // 등기부에 없으므로 임의의 값을 넣어도 결론이 바뀌지 않아야 한다.
    expect(assessRights(rightsRules, reading.answers, 3_000_000_000).overall).toBe("stop");
    expect(assessRights(rightsRules, reading.answers, null).overall).toBe("stop");
  });
});

/**
 * 익명화가 새지 않는지 픽스처 자체를 훑는다.
 *
 * 원본 이름·주소를 여기 적어 놓고 "없는지" 보면 그 순간 저장소에 원본이
 * 들어온다. 그래서 반대로 **가짜 값만 남아 있는지**를 본다 — 권리자 자리에
 * 허용한 가짜 이름 말고 다른 이름이 있으면 그것이 새어 나온 것이다.
 */
describe("익명화", () => {
  const allTexts = pages.flatMap((page) => page.pieces.map((piece) => piece.text));
  const allText = allTexts.join("\n");

  /** 권리자 자리에 나올 수 있는 이름 전부. 공공기관과 가짜 이름뿐이다 */
  const 허용한_이름 = new Set([
    "가나농업협동조합",
    "가나다신탁주식회사",
    "국",
    "국민건강보험공단",
    "근로복지공단",
    "김가나",
    "남사아",
    "다라도",
    "다라새마을금고",
    "마바시",
    "문다라",
    "사아시",
    "이마바",
    "정자차",
    "주식회사가나다라마",
    "주식회사나다라마바사",
    "주식회사다라마바사",
    "주식회사바사아자차",
    // 이름이 아니라 안내 문구에서 걸리는 낱말들
    "(주민)등록번호",
    ")",
    "가",
    "이",
    "및",
    "표시",
    "혹은",
  ]);

  it("권리자·소유자 자리에 가짜 이름만 있다", () => {
    const found = new Set<string>();
    for (const match of allText.matchAll(
      /(권리자|채권자|소유자|수탁자|근저당권자|전세권자|채무자|등기명의인)\s*([가-힣A-Za-z()]+)/gu,
    )) {
      const name = match[2];
      if (name !== undefined) found.add(name);
    }

    expect([...found].filter((name) => !허용한_이름.has(name))).toEqual([]);
  });

  it("주민·법인등록번호가 자리표시자로만 남아 있다", () => {
    const numbers = [...allText.matchAll(/\d{6}-[\d*]{7}/gu)].map((match) => match[0]);

    expect(numbers.length).toBeGreaterThan(0);
    expect([...new Set(numbers)].sort()).toEqual(["000000-*******", "000000-0000000"]);
  });

  it("등기 고유번호가 자리표시자다", () => {
    const numbers = [...allText.matchAll(/고유번호\s*(\S+)/gu)].map((match) => match[1]);

    expect(numbers.length).toBeGreaterThan(0);
    expect([...new Set(numbers)]).toEqual(["0000-0000-000000"]);
    expect(reading.header.uniqueNumber).toBe("0000-0000-000000");
  });

  it("주소가 가짜 지명으로만 되어 있다", () => {
    // 지명은 전부 `가나다라…` 음절로 바꿨다. 실제 시·도 이름이 하나라도
    // 남아 있으면 익명화가 샌 것이다.
    const 실제지명 = /(특별자치시|광역시|세종시)/u;
    expect(실제지명.test(allText)).toBe(false);
    expect(reading.header.address?.raw.startsWith("다라도 마바시 가나동")).toBe(true);
  });
});
